import os
import io
import json
import base64
import logging
import time
import urllib.request
import urllib.error
import concurrent.futures
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
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
    description="Local extraction pipeline: pdfplumber → PaddleOCR/Tesseract. AI structuring (Gemini/MiniCPM) is disabled.",
    version="3.0.0"
)

# AI structuring runtime flags — read from env, default to disabled.
_AI_STRUCTURING_ENABLED = os.environ.get("AI_STRUCTURING_ENABLED", "false").lower() in ("1", "true", "yes")
_GEMINI_RUNTIME_ENABLED = os.environ.get("GEMINI_RUNTIME_ENABLED", "false").lower() in ("1", "true", "yes")
_MINICPM_RUNTIME_ENABLED = os.environ.get("MINICPM_RUNTIME_ENABLED", "false").lower() in ("1", "true", "yes")

# CORS — origins are configurable via EXTRACTION_ALLOWED_ORIGINS (comma-separated).
# Credentials are disabled; wildcard-origin + credentials is both invalid per
# the CORS spec and insecure, so it is avoided entirely.
_default_origins = (
    "http://localhost:1420,http://127.0.0.1:1420,"  # Tauri dev shell (vite --port 1420)
    "http://localhost:8080,http://127.0.0.1:8080,"  # browser dev (vite default non-Tauri port)
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
    allow_headers=["Content-Type"],
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

        if img.mode not in ("RGB", "L", "RGBA"):
            img = img.convert("RGB")
        if img.mode == "RGBA":
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[3])
            img = bg

        gray = img.convert("L")

        w, h = gray.size
        min_dim = min(w, h)
        if min_dim < 1400:
            scale = 1400 / min_dim
            new_w, new_h = int(w * scale), int(h * scale)
            gray = gray.resize((new_w, new_h), Image.LANCZOS)
            logger.info(f"[PREPROCESS] Upscaled {w}×{h} → {new_w}×{new_h}")

        gray = ImageOps.autocontrast(gray, cutoff=1)
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


# ─── OCR engine helpers ────────────────────────────────────────────────────────
def _image_to_numpy(image_bytes: bytes):
    if np is None or Image is None:
        raise RuntimeError("numpy or Pillow not available")
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return np.array(img)


def run_paddle_ocr(image_bytes: bytes) -> str:
    """Run PaddleOCR; try Arabic model first, fall back to English."""
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


# ─── Provider abstraction ──────────────────────────────────────────────────────
# Providers are selected at startup via environment variables:
#   EXTRACTION_PROVIDER = paddle (default) | tesseract
#   (minicpm option retained as reference but maps to the paddle chain — not active)
#
# The provider chain always falls back: preferred → alternatives → empty string.
# AI structuring (MiniCPM-V / Gemini) is intentionally disabled at runtime.
# USE_MINICPM_V, MINICPM_V_URL, MINICPM_V_MODEL are kept as reference only.

_MINICPM_V_URL = os.environ.get("MINICPM_V_URL", "http://127.0.0.1:8001").rstrip("/")
_MINICPM_V_MODEL = os.environ.get("MINICPM_V_MODEL", "MiniCPM-V")
_USE_MINICPM_V = os.environ.get("USE_MINICPM_V", "").lower() in ("1", "true", "yes")
_EXTRACTION_PROVIDER = os.environ.get("EXTRACTION_PROVIDER", "paddle").lower()


def _minicpm_available() -> bool:
    """Probe the MiniCPM-V service health endpoint; return False on any error."""
    try:
        req = urllib.request.Request(
            f"{_MINICPM_V_URL}/health",
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=2):
            return True
    except Exception:
        return False


def _minicpm_chat(
    messages: list,
    timeout: int = 60,
) -> str:
    """POST to MiniCPM-V /v1/chat/completions and return the assistant message content."""
    payload = json.dumps({
        "model": _MINICPM_V_MODEL,
        "messages": messages,
        "max_tokens": 8192,
        "temperature": 0,
    }).encode()
    req = urllib.request.Request(
        f"{_MINICPM_V_URL}/v1/chat/completions",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read())
    return data["choices"][0]["message"]["content"]


def _run_minicpm_ocr(image_bytes: bytes) -> str:
    """Use MiniCPM-V vision to extract plain text from an invoice image."""
    enhanced = preprocess_image(image_bytes)
    b64 = base64.b64encode(enhanced).decode()
    content = run_minicpm_ocr_extraction = _minicpm_chat(
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
                },
                {
                    "type": "text",
                    "text": (
                        "Extract all text from this invoice or document image exactly as written. "
                        "Preserve columns and layout as best you can. Return plain text only — "
                        "no commentary, no markdown."
                    ),
                },
            ],
        }],
        timeout=60,
    )
    text = normalize_numerals(content)
    logger.info(f"[OCR] MiniCPM-V extracted {len(text)} chars")
    return text


# Ordered OCR provider chains keyed by EXTRACTION_PROVIDER value.
# Each entry is a list of (id, available_fn, run_fn) triples tried in order.
def _paddle_available() -> bool:
    return get_paddle_ocr("ar") is not None

def _tesseract_available() -> bool:
    return pytesseract is not None and Image is not None

_OCR_CHAIN: Dict[str, list] = {
    "paddle": [
        ("paddle", _paddle_available, run_paddle_ocr),
        ("tesseract", _tesseract_available, run_tesseract_ocr),
    ],
    "tesseract": [
        ("tesseract", _tesseract_available, run_tesseract_ocr),
        ("paddle", _paddle_available, run_paddle_ocr),
    ],
    # NOTE: "minicpm" is disabled at runtime — maps to the paddle chain.
    # _run_minicpm_ocr is kept as reference only and must not be invoked.
    "minicpm": [
        ("paddle", _paddle_available, run_paddle_ocr),
        ("tesseract", _tesseract_available, run_tesseract_ocr),
    ],
}


def perform_ocr(image_bytes: bytes) -> str:
    """Run OCR using the configured provider chain with automatic fallback."""
    chain = _OCR_CHAIN.get(_EXTRACTION_PROVIDER, _OCR_CHAIN["paddle"])
    last_error: Optional[Exception] = None
    for provider_id, is_available, run_fn in chain:
        if not is_available():
            continue
        try:
            result = run_fn(image_bytes)
            if result:
                logger.info(f"[OCR] Provider '{provider_id}' succeeded")
                return result
        except Exception as e:
            logger.warning(f"[OCR] Provider '{provider_id}' failed: {e}")
            last_error = e
    logger.error(f"[OCR] All providers failed. Last error: {last_error}")
    return ""


# ─── PDF extraction ────────────────────────────────────────────────────────────
def _clean_cell(cell) -> str:
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
                        if header_row and len(row) == len(header_row):
                            pairs = [f"{h}: {v}" for h, v in zip(header_row, row) if v]
                            full_text.append("  " + " | ".join(pairs))
                        else:
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


# ─── Structuring providers ────────────────────────────────────────────────────
# =============================================================================
# AI STRUCTURING IS INTENTIONALLY DISABLED
#
# run_gemini_structuring() and run_minicpm_structuring() are kept here as
# reference for future re-activation. They must NOT be called at runtime.
# run_structuring() raises HTTPException 503 immediately.
#
# To re-enable:
#   1. Set AI_STRUCTURING_ENABLED=true in .env
#   2. Set GEMINI_RUNTIME_ENABLED=true and supply GEMINI_API_KEY, or
#      set MINICPM_RUNTIME_ENABLED=true and configure MINICPM_V_URL
#   3. Restore the original run_structuring() body
# =============================================================================

# The prompt is shared across all structuring backends (reference only).
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

MAX_GEMINI_TEXT_CHARS = 80_000
GEMINI_TIMEOUT_SECONDS = 90
MAX_GEMINI_RETRIES = 3

_gemini_executor = concurrent.futures.ThreadPoolExecutor(max_workers=2, thread_name_prefix="gemini")


def _call_gemini_sync(model, prompt: str) -> str:
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

    generation_config = {
        "response_mime_type": "application/json",
        "temperature": 0,
    }
    model = genai.GenerativeModel(
        "gemini-2.5-flash-preview-05-20",
        generation_config=generation_config,
    )

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


def run_minicpm_structuring(
    text_content: str,
    image_bytes: Optional[bytes] = None,
) -> Dict[str, Any]:
    """Structure a document via MiniCPM-V (replaces Gemini when USE_MINICPM_V=true)."""
    content: list = []
    if image_bytes and not text_content.strip():
        b64 = base64.b64encode(image_bytes).decode()
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
        })
    content.append({
        "type": "text",
        "text": GEMINI_PROMPT + (text_content or "[IMAGE PROVIDED]"),
    })

    try:
        raw = _minicpm_chat(
            messages=[{"role": "user", "content": content}],
            timeout=120,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MiniCPM-V structuring failed: {e}")

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```", 2)[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.rsplit("```", 1)[0].strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"MiniCPM-V returned invalid JSON: {e}")

    logger.info(f"[MINICPM] Structured — {len(parsed.get('items', []))} item(s)")
    return parsed


def run_structuring(
    text_content: str,
    custom_api_key: Optional[str],
    image_bytes: Optional[bytes],
) -> Dict[str, Any]:
    """AI structuring is disabled. Gemini and MiniCPM are retained as future options."""
    _ = text_content, custom_api_key, image_bytes  # kept for future re-activation
    raise HTTPException(
        status_code=503,
        detail=(
            "AI structuring is disabled. "
            "Gemini and MiniCPM are kept as future options but are not active."
        ),
    )


# ─── Main extraction endpoint ──────────────────────────────────────────────────
SUPPORTED_EXTENSIONS = {"pdf", "jpg", "jpeg", "png", "webp", "bmp", "tiff", "xlsx", "xls", "csv"}

_AI_DISABLED_DETAIL = (
    "AI structuring is disabled. "
    "Gemini and MiniCPM are kept as future options but are not active. "
    "Raw text has been extracted locally but not structured into invoice fields."
)

@app.post("/extract")
async def extract_document(
    file: UploadFile = File(...),
    doc_type: str = Form("invoice"),
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

    # ── Excel / CSV: direct parse — AI not required ────────────────────────────
    if ext in {"xlsx", "xls", "csv"}:
        logger.info("[EXCEL] Direct extraction (no AI)")
        result = parse_excel_directly(file_bytes, filename)
        logger.info(f"[EXCEL] Complete — {len(result['items'])} items")
        return {"success": True, "source": "excel", "data": result}

    # ── Determine text content via local OCR only ──────────────────────────────
    text_content = ""
    source_method = "unknown"

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
                source_method = f"scanned_pdf_{_EXTRACTION_PROVIDER}"
        except Exception as e:
            logger.warning(f"[PDF] pdfplumber error: {e} — OCR fallback")
            try:
                text_content = extract_scanned_pdf(file_bytes)
                source_method = f"scanned_pdf_fallback_{_EXTRACTION_PROVIDER}"
            except Exception as e2:
                logger.error(f"[PDF] All extraction methods failed: {e2}")
                raise HTTPException(status_code=500, detail=f"PDF extraction failed: {e2}")
    else:
        logger.info(f"[OCR] Image ({ext.upper()})")
        text_content = perform_ocr(file_bytes)
        source_method = f"image_{_EXTRACTION_PROVIDER}"

    if not text_content.strip():
        raise HTTPException(
            status_code=400,
            detail=(
                "No readable text could be extracted from this document. "
                "The scan may be too low quality or the file may be corrupted."
            ),
        )

    # ── AI structuring is disabled — return raw text with a clear message ──────
    logger.info(
        f"[API] Local extraction complete ({len(text_content):,} chars, source={source_method!r}). "
        "AI structuring disabled — returning raw text."
    )

    return {
        "success": False,
        "source": source_method,
        "text_length": len(text_content),
        "ai_structuring_enabled": False,
        # Full text — truncating here silently dropped the tail rows of
        # multi-page quotations before the client parser ever saw them.
        "raw_text": text_content or "",
        "error": _AI_DISABLED_DETAIL,
    }


# ─── Ultralytics vision endpoint (P4 — optional) ──────────────────────────────
# Proxies image detection requests to a separately-running Ultralytics inference
# service (e.g. Ultralytics HUB or a custom YOLOv8 FastAPI wrapper).
# Enable by setting USE_ULTRALYTICS=true and ULTRALYTICS_URL to the service base URL.

_ULTRALYTICS_URL = os.environ.get("ULTRALYTICS_URL", "http://127.0.0.1:8002").rstrip("/")
_USE_ULTRALYTICS = os.environ.get("USE_ULTRALYTICS", "").lower() in ("1", "true", "yes")


def _ultralytics_available() -> bool:
    try:
        req = urllib.request.Request(f"{_ULTRALYTICS_URL}/health", method="GET")
        with urllib.request.urlopen(req, timeout=2):
            return True
    except Exception:
        return False


@app.post("/detect")
async def detect_objects(
    file: UploadFile = File(...),
    confidence: float = Form(0.25),
    classes: Optional[str] = Form(None),
):
    """
    Forward an image to the Ultralytics inference service for object/product detection.
    Returns bounding boxes with class names and confidence scores.
    Requires USE_ULTRALYTICS=true and a running Ultralytics service at ULTRALYTICS_URL.
    """
    if not _USE_ULTRALYTICS:
        raise HTTPException(
            status_code=503,
            detail="Ultralytics vision is disabled. Set USE_ULTRALYTICS=true and configure ULTRALYTICS_URL.",
        )
    if not _ultralytics_available():
        raise HTTPException(
            status_code=503,
            detail=f"Ultralytics service is not reachable at {_ULTRALYTICS_URL}.",
        )

    file_bytes = await file.read()
    logger.info(f"[DETECT] Forwarding {len(file_bytes):,} bytes to Ultralytics ({_ULTRALYTICS_URL})")

    # Forward as multipart form to the Ultralytics /detect endpoint
    import urllib.parse
    boundary = "----ExtractionServiceBoundary"
    body_parts = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{file.filename or 'image.jpg'}\"\r\nContent-Type: image/jpeg\r\n\r\n".encode()
        + file_bytes
        + b"\r\n",
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"confidence\"\r\n\r\n{confidence}\r\n".encode(),
    ]
    if classes:
        body_parts.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"classes\"\r\n\r\n{classes}\r\n".encode()
        )
    body_parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(body_parts)

    try:
        req = urllib.request.Request(
            f"{_ULTRALYTICS_URL}/detect",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
        logger.info(f"[DETECT] Got {len(result.get('detections', []))} detections")
        return {"success": True, "source": "ultralytics", "data": result}
    except urllib.error.HTTPError as e:
        raise HTTPException(status_code=e.code, detail=f"Ultralytics error: {e.reason}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {e}")


# ─── Health check ──────────────────────────────────────────────────────────────
@app.get("/health")
def health_check():
    paddle_ar = get_paddle_ocr("ar")

    return {
        "status": "healthy",
        "version": "3.0.0",
        # OCR (local — always enabled)
        "ocr_provider": _EXTRACTION_PROVIDER,
        "pdfplumber": pdfplumber is not None,
        "pdf2image": convert_from_bytes is not None,
        "pytesseract": pytesseract is not None,
        "paddleocr": paddle_ar is not None,
        # AI structuring — disabled
        "ai_structuring_enabled": _AI_STRUCTURING_ENABLED,
        "gemini_runtime_enabled": _GEMINI_RUNTIME_ENABLED,
        "minicpm_runtime_enabled": _MINICPM_RUNTIME_ENABLED,
        "structure_provider": "disabled",
        # MiniCPM-V reference (not active)
        "minicpm_v_enabled": False,
        "minicpm_v_url": None,
        "minicpm_v_available": None,
        # Ultralytics
        "ultralytics_enabled": _USE_ULTRALYTICS,
        "ultralytics_url": _ULTRALYTICS_URL if _USE_ULTRALYTICS else None,
        "ultralytics_available": _ultralytics_available() if _USE_ULTRALYTICS else None,
        # Runtime
        "pandas": pd is not None,
        "numpy": np is not None,
        "pillow": Image is not None,
    }


@app.get("/ready")
def ready_check():
    """Minimal liveness check for pre-flight tests (no PaddleOCR init)."""
    return {"ready": True}


# ─── Server configuration (env-driven, no hardcoded host/port) ─────────────────
# HOST defaults to 127.0.0.1 (loopback) for safety: /extract and /detect are
# UNAUTHENTICATED. Set HOST=0.0.0.0 only when the service is behind a firewall
# or reverse proxy. PORT defaults to 8000; set PORT=8080 for the hosted target.
SERVICE_HOST = os.environ.get("HOST", "127.0.0.1")
SERVICE_PORT = int(os.environ.get("PORT", "8000"))
# Auto-reload is a development feature; disabled unless EXTRACTION_RELOAD=true.
SERVICE_RELOAD = os.environ.get("EXTRACTION_RELOAD", "").lower() in ("1", "true", "yes")


@app.on_event("startup")
def _startup_validation() -> None:
    """Log effective configuration at boot."""
    logger.info("=" * 70)
    logger.info(f"[STARTUP] Extraction service v3.0.0 binding {SERVICE_HOST}:{SERVICE_PORT}")
    logger.info(f"[STARTUP] OCR provider chain: {_EXTRACTION_PROVIDER}")
    logger.info(f"[STARTUP] CORS allowed origins: {_allowed_origins}")
    logger.info(
        "[STARTUP] AI structuring: DISABLED "
        "(Gemini/MiniCPM retained as future options — not active at runtime)"
    )

    if SERVICE_HOST == "0.0.0.0":
        logger.warning(
            "[STARTUP] Bound to 0.0.0.0 — /extract and /detect are UNAUTHENTICATED. "
            "Ensure a firewall or reverse proxy restricts access."
        )

    if _USE_ULTRALYTICS:
        logger.info(
            f"[STARTUP] Ultralytics /detect enabled at {_ULTRALYTICS_URL} "
            f"(reachable={_ultralytics_available()})"
        )
    logger.info("=" * 70)


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=SERVICE_HOST,
        port=SERVICE_PORT,
        reload=SERVICE_RELOAD,
        log_level=os.environ.get("LOG_LEVEL", "info"),
    )
