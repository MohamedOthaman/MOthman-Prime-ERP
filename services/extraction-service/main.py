import os
import io
import json
import logging
import time
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
    from PIL import Image
    logging.info("[INIT] Pillow loaded")
except ImportError:
    Image = None
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
    description="Production OCR pipeline: pdfplumber → PaddleOCR/Tesseract → Gemini",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_headers=["*"],
    allow_methods=["*"],
)

# ─── PaddleOCR lazy init ───────────────────────────────────────────────────────
_paddle_ocr_client = None
_paddle_init_failed = False

def get_paddle_ocr():
    global _paddle_ocr_client, _paddle_init_failed
    if _paddle_init_failed:
        return None
    if _paddle_ocr_client is not None:
        return _paddle_ocr_client
    try:
        from paddleocr import PaddleOCR
        # Support Arabic (ar) and English (en) — most supplier POs in Kuwait are bilingual
        logger.info("[OCR] Initializing PaddleOCR with lang=ar,en ...")
        _paddle_ocr_client = PaddleOCR(
            use_angle_cls=True,
            lang="ar",        # Arabic covers Arabic+Latin script detection
            show_log=False,
            use_gpu=False,    # Set to True if GPU available
        )
        logger.info("[OCR] PaddleOCR initialized successfully")
        return _paddle_ocr_client
    except Exception as e:
        logger.warning(f"[OCR] PaddleOCR init failed: {e} — will fall back to Tesseract")
        _paddle_init_failed = True
        return None


# ─── OCR helpers ──────────────────────────────────────────────────────────────
def _image_to_numpy(image_bytes: bytes):
    """Convert raw image bytes to numpy RGB array."""
    if np is None or Image is None:
        raise RuntimeError("numpy or Pillow not available")
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return np.array(img)


def run_paddle_ocr(image_bytes: bytes) -> str:
    ocr = get_paddle_ocr()
    if ocr is None:
        raise RuntimeError("PaddleOCR not available")
    img_np = _image_to_numpy(image_bytes)
    result = ocr.ocr(img_np, cls=True)
    lines = []
    if result and result[0]:
        for line in result[0]:
            text = line[1][0]
            conf = line[1][1]
            if conf > 0.3:  # discard very low-confidence lines
                lines.append(text)
    text = "\n".join(lines)
    logger.info(f"[OCR] PaddleOCR extracted {len(lines)} lines ({len(text)} chars)")
    return text


def run_tesseract_ocr(image_bytes: bytes) -> str:
    if pytesseract is None:
        raise RuntimeError("Tesseract not installed")
    if Image is None:
        raise RuntimeError("Pillow not installed")
    img = Image.open(io.BytesIO(image_bytes))
    # Try Arabic + English
    try:
        text = pytesseract.image_to_string(img, lang="ara+eng")
    except Exception:
        text = pytesseract.image_to_string(img)
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
def extract_pdfplumber_text(pdf_bytes: bytes) -> str:
    if pdfplumber is None:
        raise RuntimeError("pdfplumber not installed")
    full_text: List[str] = []
    page_count = 0
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        page_count = len(pdf.pages)
        logger.info(f"[PDF] pdfplumber opened, {page_count} page(s)")
        for idx, page in enumerate(pdf.pages):
            text = page.extract_text()
            if text:
                full_text.append(text)

            tables = page.extract_tables()
            if tables:
                for table in tables:
                    full_text.append("\n--- Table ---")
                    for row in table:
                        row_str = " | ".join([str(cell or "").strip() for cell in row])
                        full_text.append(row_str)
                    full_text.append("---\n")

    combined = "\n\n".join(full_text)
    logger.info(f"[PDF] pdfplumber extracted {len(combined)} chars from {page_count} page(s)")
    return combined


def extract_scanned_pdf(pdf_bytes: bytes) -> str:
    """Convert scanned PDF pages to images then OCR each page."""
    if convert_from_bytes is None:
        raise RuntimeError("pdf2image not available — install poppler")

    logger.info("[PDF] Converting scanned PDF pages to images...")

    # Windows: try common Poppler paths automatically
    poppler_paths = [
        os.environ.get("POPPLER_PATH", ""),
        r"C:\Program Files\poppler\Library\bin",
        r"C:\poppler\Library\bin",
        r"C:\tools\poppler\Library\bin",
    ]
    images = None
    for ppath in poppler_paths:
        try:
            kwargs = {"dpi": 200}
            if ppath and os.path.isdir(ppath):
                kwargs["poppler_path"] = ppath
            images = convert_from_bytes(pdf_bytes, **kwargs)
            logger.info(f"[PDF] Converted {len(images)} page(s) to images (poppler: {ppath or 'system PATH'})")
            break
        except Exception as e:
            logger.debug(f"[PDF] Poppler path '{ppath}' failed: {e}")

    if images is None:
        raise RuntimeError(
            "pdf2image failed — ensure Poppler is installed. "
            "Download: https://github.com/oschwartz10612/poppler-windows/releases "
            "Then set POPPLER_PATH env var to the bin/ folder."
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
    logger.info(f"[EXCEL] Parsing {ext.upper()} file: {filename}")

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
        logger.info(f"[EXCEL] Found header row at index {header_idx}")

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
            "customerName": "",
            "customerCode": "",
            "invoiceNumber": "",
            "quotationNumber": "",
            "poNumber": "",
            "date": "",
            "currency": "KWD",
            "paymentTerms": "",
            "salesman": "",
            "comments": f"Imported from {filename}",
        },
        "items": items
    }


# ─── Gemini structuring ────────────────────────────────────────────────────────
GEMINI_PROMPT = """You are a world-class data extraction specialist for ERP systems.
Your task: parse raw text from a supplier invoice, purchase order (PO), or quotation — which may be in English, Arabic, or a mix of both — and return a single clean JSON object.

RULES:
1. Return ONLY raw JSON. No markdown code blocks, no explanations, no prose.
2. If a field is not found, use "" for strings and 0 for numbers.
3. Dates must be in YYYY-MM-DD format.
4. For "currency", infer from symbols or text (KD/KWD → "KWD", USD/$→ "USD", etc.). Default: "KWD".
5. Extract EVERY line item — do not skip rows.
6. For "qty" and "unitPrice", parse numbers carefully (Arabic numerals: ٠١٢٣٤٥٦٧٨٩ map to 0-9).
7. For "total" per row: if not explicit, compute qty × unitPrice.
8. "itemCode" is the supplier's own product code/SKU. "barcode" is EAN/UPC if present.
9. "discount" is percentage (0-100), not an amount.

TARGET JSON SCHEMA (respond with EXACTLY this structure):
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

MAX_GEMINI_RETRIES = 3

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
                "Pass it in the X-Gemini-API-Key header or set GEMINI_API_KEY env variable."
            ),
        )

    import google.generativeai as genai
    genai.configure(api_key=api_key)

    generation_config = {"response_mime_type": "application/json"}
    model = genai.GenerativeModel("gemini-2.5-flash-preview-05-20", generation_config=generation_config)

    last_error: Optional[Exception] = None
    for attempt in range(1, MAX_GEMINI_RETRIES + 1):
        try:
            logger.info(f"[GEMINI] Attempt {attempt}/{MAX_GEMINI_RETRIES} — sending {len(text_content)} chars of text")

            if image_bytes and not text_content.strip():
                # Vision fallback: send image directly when OCR returned nothing
                logger.warning("[GEMINI] OCR returned empty — using Vision API fallback")
                if Image is None:
                    raise RuntimeError("Pillow not available for vision fallback")
                img = Image.open(io.BytesIO(image_bytes))
                prompt_parts = [GEMINI_PROMPT + "\n[IMAGE SUPPLIED — extract from the image above]", img]
                response = model.generate_content(prompt_parts)
            else:
                response = model.generate_content(GEMINI_PROMPT + text_content)

            raw = response.text
            logger.info(f"[GEMINI] Raw response length: {len(raw)} chars")

            # Strip markdown code fences if Gemini ignores instructions
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("```", 2)[1]
                if cleaned.startswith("json"):
                    cleaned = cleaned[4:]
                cleaned = cleaned.rsplit("```", 1)[0].strip()

            parsed = json.loads(cleaned)
            logger.info(f"[GEMINI] Parsed JSON — {len(parsed.get('items', []))} item(s)")
            return parsed

        except json.JSONDecodeError as e:
            logger.error(f"[GEMINI] JSON parse error on attempt {attempt}: {e}")
            last_error = e
        except Exception as e:
            logger.error(f"[GEMINI] API error on attempt {attempt}: {e}")
            last_error = e
            if "quota" in str(e).lower() or "429" in str(e):
                wait = 2 ** attempt
                logger.info(f"[GEMINI] Rate limited — waiting {wait}s before retry")
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

    logger.info(f"[API] Request received — file: {filename!r}, type: {doc_type!r}, ext: {ext!r}")

    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: .{ext}. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )

    file_bytes = await file.read()
    logger.info(f"[API] File size: {len(file_bytes):,} bytes")

    # ── Excel / CSV: no AI needed ──────────────────────────────────────────────
    if ext in {"xlsx", "xls", "csv"}:
        logger.info("[EXCEL] Starting direct Excel extraction (no AI required)")
        result = parse_excel_directly(file_bytes, filename)
        logger.info(f"[EXCEL] Complete — {len(result['items'])} items extracted")
        return {"success": True, "source": "excel", "data": result}

    # ── PDF: detect digital vs scanned ────────────────────────────────────────
    text_content = ""
    source_method = "unknown"
    vision_fallback_bytes: Optional[bytes] = None

    if ext == "pdf":
        logger.info("[PDF] Starting PDF analysis...")
        try:
            pdf_text = extract_pdfplumber_text(file_bytes)
            # A digital PDF typically has >50 meaningful characters per page
            if len(pdf_text.strip()) > 50:
                logger.info(f"[PDF] Digital PDF detected — {len(pdf_text)} chars extracted")
                text_content = pdf_text
                source_method = "digital_pdf_pdfplumber"
            else:
                logger.info("[PDF] Scanned PDF detected (text < 50 chars) — switching to OCR")
                text_content = extract_scanned_pdf(file_bytes)
                source_method = "scanned_pdf_paddleocr"
        except Exception as e:
            logger.warning(f"[PDF] pdfplumber error: {e} — attempting OCR fallback")
            try:
                text_content = extract_scanned_pdf(file_bytes)
                source_method = "scanned_pdf_paddleocr_fallback"
            except Exception as e2:
                logger.error(f"[PDF] All PDF extraction methods failed: {e2}")
                raise HTTPException(status_code=500, detail=f"PDF extraction failed: {e2}")

    # ── Image file ─────────────────────────────────────────────────────────────
    else:
        logger.info(f"[OCR] Image file detected ({ext.upper()}) — running OCR")
        text_content = perform_ocr(file_bytes)
        source_method = "image_paddleocr"
        # Save bytes for Gemini Vision fallback in case OCR returned nothing
        vision_fallback_bytes = file_bytes

    # ── Sanity check ───────────────────────────────────────────────────────────
    if not text_content.strip():
        if vision_fallback_bytes:
            logger.warning("[API] OCR returned empty — will attempt Gemini Vision fallback")
        else:
            raise HTTPException(
                status_code=400,
                detail=(
                    "No readable text could be extracted from this document. "
                    "The scan may be too low quality or the file may be corrupted."
                ),
            )

    # ── Gemini structuring ─────────────────────────────────────────────────────
    logger.info(f"[API] OCR complete — {len(text_content)} chars. Sending to Gemini...")
    structured = run_gemini_structuring(
        text_content=text_content,
        custom_api_key=x_gemini_api_key,
        image_bytes=vision_fallback_bytes if not text_content.strip() else None,
    )

    item_count = len(structured.get("items", []))
    logger.info(f"[API] Gemini structuring complete — {item_count} item(s) extracted")

    return {
        "success": True,
        "source": source_method,
        "text_length": len(text_content),
        "data": structured,
    }


# ─── Health check ──────────────────────────────────────────────────────────────
@app.get("/health")
def health_check():
    paddle = get_paddle_ocr()
    return {
        "status": "healthy",
        "pdfplumber": pdfplumber is not None,
        "pdf2image": convert_from_bytes is not None,
        "pytesseract": pytesseract is not None,
        "paddleocr": paddle is not None,
        "pandas": pd is not None,
        "numpy": np is not None,
        "gemini_api_key_set": bool(os.environ.get("GEMINI_API_KEY")),
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True, log_level="info")
