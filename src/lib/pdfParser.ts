import * as pdfjsLib from "pdfjs-dist";

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// NOTE: AI extraction (Gemini / MiniCPM) is intentionally disabled.
// All AI-related helpers below are kept as reference for future re-activation.
// The application will not call any AI APIs or send any data to external services.

const MAX_CHARS_PER_CHUNK = 8000;

const AI_DISABLED_MESSAGE =
  "AI extraction is currently disabled. Gemini and MiniCPM are kept in the project as future options, but they are not active.";

export type PdfType = "invoices" | "sku" | "packing_list";

export interface ParsedInvoice {
  invoiceNo: string;
  date: string;
  customerName: string;
  customerCode?: string;
  poNumber?: string;
  quotationNumber?: string;
  currency?: string;
  paymentTerms?: string;
  salesmanName?: string;
  notes?: string;
  items: {
    itemCode: string;
    itemName: string;
    uom: string;
    qty: number;
    barcode?: string;
    unitPrice?: number;
    discount?: number;
    tax?: number;
    total?: number;
  }[];
}

export interface ParsedProduct {
  itemCode: string;
  itemName: string;
  brand: string;
  baseUom: string;
  totalStock?: number;
  warehouse?: string;
  flagged?: boolean;
  flagReason?: string;
  batches: { expiryDate: string; qty: number; batchNo: string; warehouse?: string }[];
}

export interface ParsedPackingItem {
  itemCode: string;
  itemName: string;
  qty: number;
  unit: string;
  batchNo?: string;
  expiryDate?: string;
  productionDate?: string;
}

export interface ParseResult {
  invoices?: ParsedInvoice[];
  products?: ParsedProduct[];
  items?: ParsedPackingItem[];
  error?: string;
}

async function extractTextFromPdf(file: File, onProgress?: (msg: string) => void): Promise<{ text: string; hasText: boolean; numPages: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    if (i % 20 === 0) onProgress?.(`Reading page ${i}/${pdf.numPages}...`);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => item.str)
      .join(" ");
    fullText += pageText + "\n\n";
  }

  return { text: fullText.trim(), hasText: fullText.trim().length > 100, numPages: pdf.numPages };
}

async function renderPagesToImages(file: File, maxPages = 10): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pagesToRender = Math.min(pdf.numPages, maxPages);

  const promises = Array.from({ length: pagesToRender }, async (_, i) => {
    const page = await pdf.getPage(i + 1);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL("image/jpeg", 0.65);
    canvas.remove();
    return dataUrl;
  });

  return Promise.all(promises);
}

function chunkText(text: string): string[] {
  if (text.length <= MAX_CHARS_PER_CHUNK) return [text];

  const chunks: string[] = [];
  const paragraphs = text.split("\n\n");
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > MAX_CHARS_PER_CHUNK && current.length > 0) {
      chunks.push(current);
      current = para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }
  if (current) chunks.push(current);

  return chunks;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mergeSkuProducts(products: ParsedProduct[]): ParsedProduct[] {
  const productMap = new Map<string, ParsedProduct>();

  for (const product of products) {
    const key = product.itemCode?.trim() || `${product.itemName}-${product.brand}`;
    const existing = productMap.get(key);

    if (!existing) {
      productMap.set(key, {
        ...product,
        batches: [...(product.batches || [])],
      });
      continue;
    }

    if (!existing.itemName && product.itemName) existing.itemName = product.itemName;
    if ((!existing.brand || existing.brand === "General") && product.brand) existing.brand = product.brand;
    if (!existing.baseUom && product.baseUom) existing.baseUom = product.baseUom;

    const batchKeys = new Set(
      existing.batches.map((batch) => `${batch.batchNo}|${batch.expiryDate}|${batch.qty}`),
    );

    for (const batch of product.batches || []) {
      const batchKey = `${batch.batchNo}|${batch.expiryDate}|${batch.qty}`;
      if (!batchKeys.has(batchKey)) {
        existing.batches.push(batch);
        batchKeys.add(batchKey);
      }
    }
  }

  return Array.from(productMap.values());
}

// ---------------------------------------------------------------------------
// AI invocation helpers — DISABLED. Kept as reference for future use.
// These functions previously called supabase.functions.invoke("parse-pdf")
// which forwarded requests to the Gemini AI gateway (LOVABLE_API_KEY).
// They must not be called while AI extraction is disabled.
// ---------------------------------------------------------------------------

// async function normalizeInvokeError(error: any) { ... }   // AI error normalizer — disabled
// async function invokeParsePdfWithRetry(body, retries) { } // Supabase edge fn caller — disabled

export async function parsePdf(
  file: File,
  type: PdfType,
  onProgress?: (msg: string) => void,
): Promise<ParseResult> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const isImage = file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif"].includes(ext);

  if (isImage) {
    // AI vision is disabled — do not read or send image data to any external service.
    onProgress?.(AI_DISABLED_MESSAGE);
    return { error: AI_DISABLED_MESSAGE };
  }

  onProgress?.("Reading PDF...");

  // Local text extraction via pdfjs-dist — no network calls.
  const { text, hasText, numPages } = await extractTextFromPdf(file, onProgress);

  if (!hasText) {
    // Scanned / image-based PDF — local OCR is not available; AI vision is disabled.
    onProgress?.(AI_DISABLED_MESSAGE);
    return { error: AI_DISABLED_MESSAGE };
  }

  // Text was extracted successfully. Structured parsing requires AI which is disabled.
  // Return empty results with a warning so callers can display a meaningful message.
  const textChunks = chunkText(text);
  onProgress?.(
    `Extracted text from ${numPages} page(s) (${textChunks.length} chunk(s)). ${AI_DISABLED_MESSAGE}`,
  );
  console.info(
    `parsePdf: local text extracted (${text.length} chars, ${numPages} pages). AI structuring disabled.`,
  );

  if (type === "sku") {
    return { products: [], error: AI_DISABLED_MESSAGE };
  }
  if (type === "packing_list") {
    return { items: [], error: AI_DISABLED_MESSAGE };
  }
  return { invoices: [], error: AI_DISABLED_MESSAGE };
}
