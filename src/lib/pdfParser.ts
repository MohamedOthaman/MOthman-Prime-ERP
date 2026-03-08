import * as pdfjsLib from "pdfjs-dist";
import { supabase } from "@/integrations/supabase/client";

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const MAX_CHARS_PER_CHUNK = 12000;

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
  batches: { expiryDate: string; qty: number; batchNo: string }[];
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

async function extractTextFromPdf(file: File): Promise<{ text: string; hasText: boolean }> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => item.str)
      .join(" ");
    fullText += pageText + "\n\n";
  }

  return { text: fullText.trim(), hasText: fullText.trim().length > 100 };
}

async function renderPagesToImages(file: File, maxPages = 10): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pagesToRender = Math.min(pdf.numPages, maxPages);

  // Render all pages in parallel
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

export async function parsePdf(
  file: File,
  type: PdfType,
  onProgress?: (msg: string) => void,
): Promise<ParseResult> {
  onProgress?.("Reading PDF...");

  // Try text extraction first
  const { text, hasText } = await extractTextFromPdf(file);

  let body: any;

  if (hasText && type !== "packing_list") {
    // Text-based PDF (Oracle reports)
    onProgress?.("Extracting data with AI...");
    const textChunks = chunkText(text);
    onProgress?.(`Processing ${textChunks.length} chunk(s)...`);
    body = { type, textChunks };
  } else if (type === "packing_list" || !hasText) {
    // Image-based PDF - render to images
    onProgress?.("Rendering PDF pages...");
    const images = await renderPagesToImages(file);
    onProgress?.(`Analyzing ${images.length} page(s) with AI...`);

    // If we also have text, include it
    if (hasText) {
      body = { type, textChunks: [text.slice(0, MAX_CHARS_PER_CHUNK)], images };
    } else {
      body = { type, images };
    }
  }

  const { data, error } = await supabase.functions.invoke("parse-pdf", { body });

  if (error) {
    console.error("Edge function error:", error);
    return { error: error.message || "Failed to process PDF" };
  }

  if (data?.error) {
    return { error: data.error };
  }

  return data?.data || data;
}
