import os
import io
import json
import logging
import time
import concurrent.futures
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from dotenv import load_dotenv

# ─── Optional dependencies with graceful fallbacks ────────────────────────────
try:
    import pdfplumber
    logging.info("[INIT] pdfplumber loaded")
except ImportError:
    pdfplumber = None
    logging.warning("[INIT] pdfplumber NOT available")

try:
    from PIL import Image, ImageFilter, ImageOps
    logging.info("[INIT] Pillow loaded")
except ImportError:
    Image = ImageFilter = ImageOps = None
    logging.warning("[INIT] Pillow NOT available")

try:
    from pdf2image import convert_from_bytes
    logging.info("[INIT] pdf2image loaded")
except ImportError:
    convert_from_bytes = None
    logging.warning("[INIT] pdf2image NOT available — scanned PDF support disabled")

try:
    import pytesseract
    logging.info("[INIT] pytesseract loaded")
except ImportError:
    pytesseract = None
    logging.warning("[INIT] pytesseract NOT available")

try:
    import pandas as pd
    logging.info("[INIT] pandas loaded")
except ImportError:
    pd = None
    logging.warning("[INIT] pandas NOT available")

try:
    import numpy as np
    logging.info("[INIT] numpy loaded")
except ImportError:
    np = None
    logging.warning("[INIT] numpy NOT available")

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("extraction-service")

load_dotenv()

# ─── FastAPI app ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="ERP Invoice Extraction Service",
    description="Production OCR pipeline: pdfplumber → PaddleOCR/Tesseract → Gemini 2.5 Flash",
    version="2.1.0"
)

# CORS — origins are configurable via EXTRACTION_ALLOWED_ORIGINS (comma-separated).
# Credentials are disabled because the service authenticates via the
# X-Gemini-API-Key request header (not cookies); wildcard-origin + credentials
# is both invalid per the CORS spec and insecure, so it is avoided entirely.
_default_origins = (
    "http://localhost:1420,http://127.0.0.1:1420,"
    "tauri://localhost,http://tauri.localhost,https://tauri.localhost"
)
_allowed_origins = [
    o.strip()
    for o in os.environ.get("EXTRACTION_ALLOWED_ORIGINS", _default_origins).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_headers=["Content-Type", "X-Gemini-API-Key"],
    allow_methods=["GET", "POST", "OPTIONS"],
)

# ─── PaddleOCR lazy init ───────────────────────────────────────────────────────
_paddle_ocr_ar = None
_paddle_ocr_en = None
_paddle_init_failed = False

def get_paddle_ocr(lang: str = "ar"):
    global _paddle_ocr_ar, _paddle_ocr_en, _paddle_init_failed
    if _paddle_init_failed:
        return None
    client = _paddle_ocr_ar if lang == "ar" else _paddle_ocr_en
    if client is not None:
        return client
    try:
        from paddleocr import PaddleOCR
        logger.info(f"[OCR] Initializing PaddleOCR lang={lang!r} ...")
        ocr = PaddleOCR(
            use_angle_cls=True,
            lang=lang,
            show_log=False,
            use_gpu=False,
        )
        if lang == "ar":
            _paddle_ocr_ar = ocr
        else:
            _paddle_ocr_en = ocr
        logger.info(f"[OCR] PaddleOCR ({lang}) initialized successfully")
        return ocr
    except Exception as e:
        logger.warning(f"[OCR] PaddleOCR ({lang}) init failed: {e} — will fall back to Tesseract")
        _paddle_init_failed = True
        return None


# ─── Image preprocessing ───────────────────────────────────────────────────────
def preprocess_image(image_bytes: bytes) -> bytes:
    """Enhance image quality for better OCR accuracy on blurry/mobile photos."""
    if Image is None or ImageFilter is None or ImageOps is None:
        return image_bytes
    try:
        img = Image.open(io.BytesIO(image_bytes))

        # Ensure RGB
        if img.mode not in ("RGB", "L", "RGBA"):
            img = img.convert("RGB")
        if img.mode == "RGBA":
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[3])
            img = bg

        # Convert to grayscale for OCR — single-channel is faster and more accurate
        gray = img.convert("L")

        # Scale up if image is too small; OCR degrades badly below ~200 DPI equivalent
        w, h = gray.size
        min_dim = min(w, h)
        if min_dim < 1400:
            scale = 1400 / min_dim
            new_w, new_h = int(w * scale), int(h * scale)
            gray = gray.resize((new_w, new_h), Image.LANCZOS)
            logger.info(f"[PREPROCESS] Upscaled {w}×{h} → {new_w}×{new_h}")

        # Auto-contrast: stretch histogram to use full 0-255 range
        gray = ImageOps.autocontrast(gray, cutoff=1)

        # Double-sharpen for blurry/out-of-focus captures
        gray = gray.filter(ImageFilter.SHARPEN)
        gray = gray.filter(ImageFilter.SHARPEN)

        buf = io.BytesIO()
        gray.save(buf, format="JPEG", quality=95)
        result = buf.getvalue()
        logger.info(f"[PREPROCESS] Enhanced: {len(image_bytes):,} → {len(result):,} bytes")
        return result
    except Exception as e:
        logger.warning(f"[PREPROCESS] Failed ({e}) — using original image")
        return image_bytes


# ─── Arabic/Eastern numeral normalization ──────────────────────────────────────
_ARABIC_NUMERAL_MAP = str.maketrans(
    "٠١٢٣٤٥٦٧٨٩٫",
    "0123456789."
)
_PERSIAN_NUMERAL_MAP = str.maketrans(
    "۰۱۲۳۴۵۶۷۸۹",
    "0123456789"
)

def normalize_numerals(text: str) -> str:
    """Convert Arabic-Indic and Persian digits to ASCII digits."""
    return text.translate(_ARABIC_NUMERAL_MAP).translate(_PERSIAN_NUMERAL_MAP)


# ─── OCR helpers ──────────────────────────────────────────────────────────────
def _image_to_numpy(image_bytes: bytes):
    """Convert raw image bytes to numpy RGB array."""
    if np is None or Image is None:
        raise RuntimeError("numpy or Pillow not available")
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return np.array(img)


def run_paddle_ocr(image_bytes: bytes) -> str:
    """Run PaddleOCR; try Arabic model first (handles Arabic + Latin mix), fall back to English."""
    enhanced = preprocess_image(image_bytes)

    for lang in ("ar", "en"):
        ocr = get_paddle_ocr(lang)
        if ocr is None:
            continue
        try:
            img_np = _image_to_numpy(enhanced)
            result = ocr.ocr(img_np, cls=True)
            lines = []
            if result and result[0]:
                for line in result[0]:
                    text = line[1][0]
                    conf = line[1][1]
                    if conf > 0.3:
                        lines.append(text)
            text = normalize_numerals("\n".join(lines))
            logger.info(f"[OCR] PaddleOCR ({lang}) extracted {len(lines)} lines ({len(text)} chars)")
            if lines:
                return text
        except Exception as e:
            logger.warning(f"[OCR] PaddleOCR ({lang}) error: {e}")
            continue

    raise RuntimeError("PaddleOCR failed on all language models")


def run_tesseract_ocr(image_bytes: bytes) -> str:
    if pytesseract is None:
        raise RuntimeError("Tesseract not installed")
    if Image is None:
        raise RuntimeError("Pillow not installed")
    enhanced = preprocess_image(image_bytes)
    img = Image.open(io.BytesIO(enhanced))
    try:
        text = pytesseract.image_to_string(img, lang="ara+eng")
    except Exception:
        try:
            text = pytesseract.image_to_string(img, lang="eng")
        except Exception:
            text = pytesseract.image_to_string(img)
    text = normalize_numerals(text)
    logger.info(f"[OCR] Tesseract extracted {len(text)} chars")
    return text


def perform_ocr(image_bytes: bytes) -> str:
    """Try PaddleOCR first, fall back to Tesseract."""
    try:
        return run_paddle_ocr(image_bytes)
    except Exception as e:
        logger.warning(f"[OCR] PaddleOCR failed: {e} — trying Tesseract")
        try:
            return run_tesseract_ocr(image_bytes)
        except Exception as e2:
            logger.error(f"[OCR] Tesseract also failed: {e2}")
            return ""


# ─── PDF extraction ────────────────────────────────────────────────────────────
def _clean_cell(cell) -> str:
    """Strip whitespace and collapse internal newlines from a table cell."""
    return " ".join(str(cell or "").split())


def extract_pdfplumber_text(pdf_bytes: bytes) -> str:
    if pdfplumber is None:
        raise RuntimeError("pdfplumber not installed")
    full_text: List[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        page_count = len(pdf.pages)
        logger.info(f"[PDF] pdfplumber opened, {page_count} page(s)")
        for idx, page in enumerate(pdf.pages):
            text = page.extract_text()
            if text:
                full_text.append(text.strip())

            tables = page.extract_tables()
            if tables:
                for tbl_idx, table in enumerate(tables):
                    if not table:
                        continue

                    # First non-empty row is treated as the header
                    header_row: List[str] = []
                    data_rows: List[List[str]] = []
                    for row in table:
                        cleaned = [_clean_cell(c) for c in row]
                        if not header_row and any(cleaned):
                            header_row = cleaned
                        elif any(cleaned):
                            data_rows.append(cleaned)

                    if not data_rows:
                        continue

                    full_text.append(f"\n=== TABLE {tbl_idx + 1} (page {idx + 1}) ===")
                    if header_row:
                        full_text.append("COLUMNS: " + " | ".join(header_row))
                        full_text.append("-" * 60)

                    for row in data_rows:
                        # Emit as "ColName: value" pairs so Gemini can map columns unambiguously
                        if header_row and len(row) == len(header_row):
                            pairs = [f"{h}: {v}" for h, v in zip(header_row, row) if v]
                            full_text.append("  " + " | ".join(pairs))
                        else:
                            # Fallback: plain pipe-separated
                            full_text.append("  " + " | ".join(row))

                    full_text.append("=== END TABLE ===\n")

    combined = normalize_numerals("\n\n".join(full_text))
    logger.info(f"[PDF] pdfplumber extracted {len(combined)} chars from {page_count} page(s)")
    return combined


def extract_scanned_pdf(pdf_bytes: bytes) -> str:
    """Convert scanned PDF pages to images then OCR each page."""
    if convert_from_bytes is None:
        raise RuntimeError("pdf2image not available — install poppler")

    logger.info("[PDF] Converting scanned PDF pages to images...")

    poppler_paths = [
        os.environ.get("POPPLER_PATH", ""),
        r"C:\Program Files\poppler\Library\bin",
        r"C:\poppler\Library\bin",
        r"C:\tools\poppler\Library\bin",
        r"C:\Program Files\poppler-windows\Library\bin",
    ]
    images = None
    for ppath in poppler_paths:
        try:
            kwargs: Dict[str, Any] = {"dpi": 220}
            if ppath and os.path.isdir(ppath):
                kwargs["poppler_path"] = ppath
            images = convert_from_bytes(pdf_bytes, **kwargs)
            logger.info(f"[PDF] Converted {len(images)} page(s) (poppler: {ppath or 'system PATH'})")
            break
        except Exception as e:
            logger.debug(f"[PDF] Poppler path {ppath!r} failed: {e}")

    if images is None:
        raise RuntimeError(
            "pdf2image failed — Poppler not found. "
            "Download: https://github.com/oschwartz10612/poppler-windows/releases "
            "Extract and set POPPLER_PATH env var."
        )

    page_texts: List[str] = []
    for idx, img in enumerate(images):
        logger.info(f"[OCR] Processing page {idx + 1}/{len(images)}...")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=95)
        page_text = perform_ocr(buf.getvalue())
        if page_text.strip():
            page_texts.append(f"[Page {idx + 1}]\n{page_text}")
        else:
            logger.warning(f"[OCR] Page {idx + 1}: no text extracted")

    combined = "\n\n".join(page_texts)
    logger.info(f"[OCR] Total scanned PDF text: {len(combined)} chars")
    return combined


# ─── Excel / CSV extraction ────────────────────────────────────────────────────
def parse_excel_directly(file_bytes: bytes, filename: str) -> Dict[str, Any]:
    if pd is None:
        raise RuntimeError("pandas not installed")

    ext = filename.rsplit(".", 1)[-1].lower()
    logger.info(f"[EXCEL] Parsing {ext.upper()}: {filename}")

    if ext == "csv":
        df = pd.read_csv(io.BytesIO(file_bytes))
    else:
        df = pd.read_excel(io.BytesIO(file_bytes))

    header_keywords = {"item", "code", "barcode", "qty", "quantity", "price",
                       "description", "desc", "total", "name"}
    header_idx = 0
    found_headers = False

    for idx, row in df.iterrows():
        row_vals = [str(v).lower() for v in row.values if pd.notna(v)]
        matches = [kw for kw in header_keywords if any(kw in v for v in row_vals)]
        if len(matches) >= 3:
            header_idx = idx
            found_headers = True
            break

    if found_headers:
        new_headers = df.iloc[header_idx]
        df = df.iloc[header_idx + 1:].copy()
        df.columns = new_headers
        logger.info(f"[EXCEL] Header row at index {header_idx}")

    col_mapping: Dict[str, Any] = {}
    for col in df.columns:
        cl = str(col).lower().strip()
        if any(k in cl for k in ["barcode", "upc", "ean"]):
            col_mapping["barcode"] = col
        elif any(k in cl for k in ["code", "sku", "item_code"]):
            col_mapping.setdefault("itemCode", col)
        elif any(k in cl for k in ["name", "description", "desc", "item"]):
            col_mapping.setdefault("itemName", col)
        elif any(k in cl for k in ["qty", "quantity", "ordered"]):
            col_mapping.setdefault("qty", col)
        elif any(k in cl for k in ["unit", "uom"]):
            col_mapping.setdefault("unit", col)
        elif any(k in cl for k in ["price", "rate", "cost"]):
            col_mapping.setdefault("unitPrice", col)
        elif any(k in cl for k in ["discount", "disc"]):
            col_mapping.setdefault("discount", col)
        elif any(k in cl for k in ["total", "amount", "subtotal"]):
            col_mapping.setdefault("total", col)

    if "itemName" not in col_mapping and len(df.columns) > 1:
        col_mapping["itemName"] = df.columns[1]

    def safe_float(row, key, default=0.0) -> float:
        col = col_mapping.get(key)
        if col is None:
            return default
        val = row.get(col, default)
        try:
            return float(val) if pd.notna(val) else default
        except (ValueError, TypeError):
            return default

    def safe_str(row, key, default="") -> str:
        col = col_mapping.get(key)
        if col is None:
            return default
        val = row.get(col, default)
        return str(val).strip() if pd.notna(val) else default

    items = []
    for _, row in df.iterrows():
        name_col = col_mapping.get("itemName")
        if name_col and pd.isna(row.get(name_col)):
            continue
        qty = safe_float(row, "qty", 1.0)
        price = safe_float(row, "unitPrice")
        disc = safe_float(row, "discount")
        total_val = safe_float(row, "total", qty * price - disc)

        items.append({
            "itemCode": safe_str(row, "itemCode"),
            "barcode": safe_str(row, "barcode"),
            "itemName": safe_str(row, "itemName"),
            "unit": safe_str(row, "unit", "PCS"),
            "qty": qty,
            "unitPrice": price,
            "discount": disc,
            "total": total_val,
        })

    logger.info(f"[EXCEL] Extracted {len(items)} line items")
    return {
        "header": {
            "customerName": "", "customerCode": "",
            "invoiceNumber": "", "quotationNumber": "",
            "poNumber": "", "date": "", "currency": "KWD",
            "paymentTerms": "", "salesman": "",
            "comments": f"Imported from {filename}",
        },
        "items": items,
    }


# ─── Gemini structuring ────────────────────────────────────────────────────────
GEMINI_PROMPT = """You are a world-class data extraction specialist for ERP supply-chain systems.
Your task: parse raw text from a supplier invoice, purchase order (PO), or quotation — which may be in English, Arabic, or a mix of both — and return a single clean JSON object.

═══ STRICT RULES ═══
1. Return ONLY raw JSON. No markdown code blocks (no ```json). No explanations. No prose.
2. If a field is not found, use "" for strings and 0 for numbers.
3. Dates → YYYY-MM-DD. If only day/month present, use current/recent year.
4. Currency: KD/KWD → "KWD", USD/$ → "USD", SAR → "SAR". Default: "KWD".
5. Extract EVERY line item — do not skip rows, do not merge similar items.
6. For numerics, digits are already ASCII — parse carefully, including decimals.
7. "total" per row: if missing, compute qty × unitPrice.
8. "discount": percentage (0–100), NOT a monetary amount.
9. If the document is a PO/quotation, put the PO number in "poNumber".

═══ COLUMN PRIORITY FOR itemCode ═══
Different PO formats label the supplier's product code differently.
Use THIS priority order to find "itemCode":
  1. "Supplier Reference" or "Supplier Code" or "Supplier Article" column
  2. "SKU", "Item Code", "Product Code", "Ref" column
  3. "Article" or "Article #" only if no supplier-specific code exists
  4. Leave empty if no code found
→ Do NOT use the buyer's internal article number as itemCode.

═══ BARCODE ═══
Use the 8-, 12-, or 13-digit EAN/UPC/GS1 barcode if present.
In LuLu / retail POs it appears in a dedicated "Barcode" column.

═══ UOM NORMALIZATION ═══
Many POs write UOM as "CAR=24EA", "CTN=12PC", "BOX=6BTL" etc.
Extract ONLY the primary unit before "=" → "CAR", "CTN", "BOX".
Common mappings: CAR→CAR, CTN→CTN, EA→EA, PCS→PCS, KG→KG, L→LTR.

═══ HEADER FIELDS ═══
• customerName  → "Delivery To", "Ship To", "Sold To", or buyer company name.
  In LuLu POs: "Delivery To : LuLu Hypermarket, AlQurain KWT" → "LuLu Hypermarket AlQurain KWT"
• poNumber      → "Purchase Order #", "PO No.", "LPO No.", "Order #"
• date          → Order Date is preferred; Due Date is second choice.
• comments      → any free-text notes or HOT FOOD / temperature labels.

═══ TARGET JSON SCHEMA (respond with EXACTLY this structure — no extra keys) ═══
{
  "header": {
    "customerName": "",
    "customerCode": "",
    "invoiceNumber": "",
    "quotationNumber": "",
    "poNumber": "",
    "date": "",
    "currency": "KWD",
    "paymentTerms": "",
    "salesman": "",
    "comments": ""
  },
  "items": [
    {
      "itemCode": "",
      "barcode": "",
      "itemName": "",
      "unit": "PCS",
      "qty": 0,
      "unitPrice": 0,
      "discount": 0,
      "total": 0
    }
  ]
}

RAW EXTRACTED TEXT:
"""

# Max text to send to Gemini — prevents token-limit errors on very long docs
MAX_GEMINI_TEXT_CHARS = 80_000

# Gemini API call timeout in seconds per attempt
GEMINI_TIMEOUT_SECONDS = 90

MAX_GEMINI_RETRIES = 3

_gemini_executor = concurrent.futures.ThreadPoolExecutor(max_workers=2, thread_name_prefix="gemini")


def _call_gemini_sync(model, prompt: str) -> str:
    """Blocking call to Gemini — run inside an executor so we can apply a timeout."""
    response = model.generate_content(prompt)
    return response.text


def run_gemini_structuring(
    text_content: str,
    custom_api_key: Optional[str] = None,
    image_bytes: Optional[bytes] = None,
) -> Dict[str, Any]:
    api_key = custom_api_key or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail=(
                "Gemini API key not configured. "
                "Pass it in the X-Gemini-API-Key header or set GEMINI_API_KEY in .env"
            ),
        )

    import google.generativeai as genai
    genai.configure(api_key=api_key)

    # gemini-2.5-flash-preview-05-20 forces JSON output via response_mime_type
    generation_config = {
        "response_mime_type": "application/json",
        "temperature": 0,
    }
    model = genai.GenerativeModel(
        "gemini-2.5-flash-preview-05-20",
        generation_config=generation_config,
    )

    # Truncate very long text to avoid token-limit errors
    if len(text_content) > MAX_GEMINI_TEXT_CHARS:
        logger.warning(
            f"[GEMINI] Text too long ({len(text_content):,} chars), "
            f"truncating to {MAX_GEMINI_TEXT_CHARS:,}"
        )
        text_content = text_content[:MAX_GEMINI_TEXT_CHARS] + "\n\n[...document truncated...]"

    last_error: Optional[Exception] = None
    for attempt in range(1, MAX_GEMINI_RETRIES + 1):
        try:
            logger.info(
                f"[GEMINI] Attempt {attempt}/{MAX_GEMINI_RETRIES} — "
                f"{len(text_content):,} chars, timeout={GEMINI_TIMEOUT_SECONDS}s"
            )

            if image_bytes and not text_content.strip():
                # Vision fallback when OCR returned nothing
                logger.warning("[GEMINI] OCR empty — using Vision fallback")
                if Image is None:
                    raise RuntimeError("Pillow not available for vision fallback")
                img = Image.open(io.BytesIO(image_bytes))
                future = _gemini_executor.submit(
                    model.generate_content,
                    [GEMINI_PROMPT + "\n[IMAGE PROVIDED]", img],
                )
            else:
                future = _gemini_executor.submit(
                    _call_gemini_sync, model, GEMINI_PROMPT + text_content
                )

            raw = future.result(timeout=GEMINI_TIMEOUT_SECONDS)
            logger.info(f"[GEMINI] Raw response: {len(raw)} chars")

            # Strip markdown fences in case model ignores response_mime_type
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("```", 2)[1]
                if cleaned.startswith("json"):
                    cleaned = cleaned[4:]
                cleaned = cleaned.rsplit("```", 1)[0].strip()

            parsed = json.loads(cleaned)
            logger.info(f"[GEMINI] OK — {len(parsed.get('items', []))} item(s)")
            return parsed

        except json.JSONDecodeError as e:
            logger.error(f"[GEMINI] JSON parse error on attempt {attempt}: {e}")
            last_error = e
        except concurrent.futures.TimeoutError:
            logger.error(f"[GEMINI] Timed out after {GEMINI_TIMEOUT_SECONDS}s (attempt {attempt})")
            last_error = TimeoutError(f"Gemini timed out after {GEMINI_TIMEOUT_SECONDS}s")
        except Exception as e:
            logger.error(f"[GEMINI] API error on attempt {attempt}: {e}")
            last_error = e
            if "quota" in str(e).lower() or "429" in str(e):
                wait = 2 ** attempt
                logger.info(f"[GEMINI] Rate limited — waiting {wait}s")
                time.sleep(wait)
            else:
                time.sleep(1)

    raise HTTPException(
        status_code=500,
        detail=f"Gemini failed after {MAX_GEMINI_RETRIES} attempts: {last_error}",
    )


# ─── Main extraction endpoint ──────────────────────────────────────────────────
SUPPORTED_EXTENSIONS = {"pdf", "jpg", "jpeg", "png", "webp", "bmp", "tiff", "xlsx", "xls", "csv"}

@app.post("/extract")
async def extract_document(
    file: UploadFile = File(...),
    doc_type: str = Form("invoice"),
    x_gemini_api_key: Optional[str] = Header(None),
):
    filename = file.filename or "uploaded_file"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    logger.info(f"[API] Request — file: {filename!r}, type: {doc_type!r}, ext: {ext!r}")

    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: .{ext}. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )

    file_bytes = await file.read()
    logger.info(f"[API] File size: {len(file_bytes):,} bytes")

    # ── Excel / CSV: direct parse, no AI needed ────────────────────────────────
    if ext in {"xlsx", "xls", "csv"}:
        logger.info("[EXCEL] Direct extraction (no AI)")
        result = parse_excel_directly(file_bytes, filename)
        logger.info(f"[EXCEL] Complete — {len(result['items'])} items")
        return {"success": True, "source": "excel", "data": result}

    # ── Determine text content ─────────────────────────────────────────────────
    text_content = ""
    source_method = "unknown"
    vision_fallback_bytes: Optional[bytes] = None

    if ext == "pdf":
        logger.info("[PDF] Analysing...")
        try:
            pdf_text = extract_pdfplumber_text(file_bytes)
            if len(pdf_text.strip()) > 80:
                logger.info(f"[PDF] Digital — {len(pdf_text):,} chars from pdfplumber")
                text_content = pdf_text
                source_method = "digital_pdf_pdfplumber"
            else:
                logger.info("[PDF] Scanned (low text) — switching to OCR")
                text_content = extract_scanned_pdf(file_bytes)
                source_method = "scanned_pdf_paddleocr"
        except Exception as e:
            logger.warning(f"[PDF] pdfplumber error: {e} — OCR fallback")
            try:
                text_content = extract_scanned_pdf(file_bytes)
                source_method = "scanned_pdf_fallback"
            except Exception as e2:
                logger.error(f"[PDF] All extraction methods failed: {e2}")
                raise HTTPException(status_code=500, detail=f"PDF extraction failed: {e2}")
    else:
        logger.info(f"[OCR] Image ({ext.upper()})")
        text_content = perform_ocr(file_bytes)
        source_method = "image_paddleocr"
        vision_fallback_bytes = file_bytes

    # ── Sanity check ───────────────────────────────────────────────────────────
    if not text_content.strip():
        if vision_fallback_bytes:
            logger.warning("[API] OCR empty — will try Gemini Vision fallback")
        else:
            raise HTTPException(
                status_code=400,
                detail=(
                    "No readable text could be extracted from this document. "
                    "The scan may be too low quality or the file may be corrupted."
                ),
            )

    # ── Gemini structuring ─────────────────────────────────────────────────────
    logger.info(f"[API] Sending {len(text_content):,} chars to Gemini...")
    structured = run_gemini_structuring(
        text_content=text_content,
        custom_api_key=x_gemini_api_key,
        image_bytes=vision_fallback_bytes if not text_content.strip() else None,
    )

    item_count = len(structured.get("items", []))
    logger.info(f"[API] Complete — {item_count} item(s) from {source_method}")

    return {
        "success": True,
        "source": source_method,
        "text_length": len(text_content),
        "data": structured,
    }


# ─── Health check ──────────────────────────────────────────────────────────────
@app.get("/health")
def health_check():
    paddle_ar = get_paddle_ocr("ar")
    return {
        "status": "healthy",
        "version": "2.1.0",
        "pdfplumber": pdfplumber is not None,
        "pdf2image": convert_from_bytes is not None,
        "pytesseract": pytesseract is not None,
        "paddleocr": paddle_ar is not None,
        "pandas": pd is not None,
        "numpy": np is not None,
        "pillow": Image is not None,
        "gemini_api_key_set": bool(os.environ.get("GEMINI_API_KEY")),
    }


@app.get("/ready")
def ready_check():
    """Minimal liveness check for pre-flight tests (no PaddleOCR init)."""
    return {"ready": True}


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True, log_level="info")
