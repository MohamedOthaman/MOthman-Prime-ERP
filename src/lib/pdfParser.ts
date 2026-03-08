import * as pdfjsLib from "pdfjs-dist";
import { supabase } from "@/integrations/supabase/client";

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// Smaller chunks = more reliable AI processing for large files
const MAX_CHARS_PER_CHUNK = 8000;

export type PdfType = "invoices" | "sku" | "packing_list";

export interface ParsedInvoice {
  invoiceNo: string;
  date: string;
  customerName: string;
  items: { itemCode: string; itemName: string; uom: string; qty: number }[];
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

async function normalizeInvokeError(error: any) {
  const baseMessage = String(error?.message || "Failed to process PDF");
  let status: number | undefined;
  let details = "";

  const responseLike = error?.context;
  if (responseLike && typeof responseLike.status === "number") {
    status = responseLike.status;

    if (typeof responseLike.clone === "function") {
      try {
        details = await responseLike.clone().text();
      } catch {
        // ignore body parse issues
      }
    }
  }

  const combined = `${baseMessage} ${details}`.toLowerCase();

  if (status === 402 || combined.includes("402") || combined.includes("credits exhausted")) {
    return {
      message: "AI credits exhausted. Please add credits from Settings → Workspace → Usage then retry.",
      status: 402,
      retryable: false,
    };
  }

  if (status === 429 || combined.includes("429") || combined.includes("rate limit")) {
    return {
      message: "Too many AI requests right now. Please wait a minute and retry.",
      status: 429,
      retryable: true,
    };
  }

  const retryable =
    combined.includes("failed to fetch") ||
    combined.includes("failed to send a request") ||
    combined.includes("network");

  return {
    message: baseMessage,
    status,
    retryable,
  };
}

async function invokeParsePdfWithRetry(body: Record<string, unknown>, retries = 2) {
  let lastError: { message: string; status?: number; retryable?: boolean } | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const { data, error } = await supabase.functions.invoke("parse-pdf", { body });
    if (!error) return { data, error: null };

    const normalizedError = await normalizeInvokeError(error);
    lastError = normalizedError;

    if (!normalizedError.retryable || attempt === retries) break;
    await sleep(1000 * (attempt + 1));
  }

  return { data: null, error: lastError };
}

export async function parsePdf(
  file: File,
  type: PdfType,
  onProgress?: (msg: string) => void,
): Promise<ParseResult> {
  onProgress?.("Reading PDF...");

  // Try text extraction first
  const { text, hasText, numPages } = await extractTextFromPdf(file, onProgress);

  let body: any;

  if (hasText) {
    // Text-based PDF
    const textChunks = chunkText(text);

    if (type === "sku" && textChunks.length > 1) {
      onProgress?.(`Extracted text from ${numPages} pages → ${textChunks.length} chunks. Processing in reliable mode...`);

      const collected: ParsedProduct[] = [];

      for (let i = 0; i < textChunks.length; i++) {
        onProgress?.(`Processing chunk ${i + 1}/${textChunks.length}...`);

        const { data, error } = await invokeParsePdfWithRetry(
          { type, textChunks: [textChunks[i]] },
          2,
        );

        if (error) {
          console.error(`Chunk ${i + 1} failed:`, error);
          return { error: `Failed at chunk ${i + 1}/${textChunks.length}. Please retry.` };
        }

        const chunkResult = data?.data || data;
        const products = chunkResult?.products || [];
        collected.push(...products);

        if (i < textChunks.length - 1) {
          await sleep(250);
        }
      }

      const merged = mergeSkuProducts(collected);
      console.log(`SKU import: ${merged.length} products after merge, from ${textChunks.length} chunks`);
      return { products: merged };
    }

    onProgress?.(`Extracted text from ${numPages} pages → ${textChunks.length} chunks. Sending to AI...`);
    body = { type, textChunks };
  } else {
    // Image-based / scanned PDF — render pages for OCR
    onProgress?.("Rendering PDF pages for OCR...");
    const images = await renderPagesToImages(file);
    onProgress?.(`Analyzing ${images.length} page(s) with AI vision...`);
    body = { type, images };
  }

  onProgress?.("Processing with AI (this may take a few minutes for large files)...");

  const { data, error } = await invokeParsePdfWithRetry(body, 2);

  if (error) {
    console.error("Edge function error:", error);
    return { error: error.message || "Failed to process PDF" };
  }

  if (data?.error) {
    return { error: data.error };
  }

  const result = data?.data || data;

  // Log summary
  if (type === "sku" && result?.products) {
    const flagged = result.products.filter((p: any) => p.flagged);
    console.log(`SKU import: ${result.products.length} products, ${result.products.reduce((s: number, p: any) => s + (p.batches?.length || 0), 0)} batches, ${flagged.length} flagged for review`);
    if (flagged.length > 0) {
      console.warn("Flagged products:", flagged.map((p: any) => `${p.itemCode || "?"}: ${p.flagReason}`));
    }
  }

  return result;
}
