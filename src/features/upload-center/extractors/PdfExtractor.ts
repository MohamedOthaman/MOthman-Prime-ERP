import { parsePdf, type PdfType } from "@/lib/pdfParser";
import type { ExtractorProvider } from "./ExtractorProvider";
import type { DocumentType, ExtractionHints, ExtractionResult } from "../types";

const DOC_TO_PDF: Record<DocumentType, PdfType> = {
  invoice: "invoices",
  sku: "sku",
  packing_list: "packing_list",
  unknown: "invoices",
};

export class PdfExtractor implements ExtractorProvider {
  readonly id = "gemini-pdf";
  readonly supportedMimeTypes = ["application/pdf"];

  async extract(file: File, hints?: ExtractionHints, onProgress?: (msg: string) => void): Promise<ExtractionResult> {
    const docType: DocumentType = hints?.documentType ?? "unknown";
    const pdfType: PdfType = DOC_TO_PDF[docType];
    const result = await parsePdf(file, pdfType, onProgress);

    let rows: Record<string, unknown>[] = [];
    if (pdfType === "invoices") rows = (result.invoices ?? []) as Record<string, unknown>[];
    else if (pdfType === "sku") rows = (result.products ?? []) as Record<string, unknown>[];
    else rows = (result.items ?? []) as Record<string, unknown>[];

    const warnings: string[] = [];
    if (result.error) warnings.push(result.error);

    return {
      documentType: docType === "unknown" ? "invoice" : docType,
      confidence: rows.length > 0 ? 0.85 : 0.2,
      rows,
      warnings,
      providerMetadata: { provider: "gemini", pdfType },
    };
  }
}
