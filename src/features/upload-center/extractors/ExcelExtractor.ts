import * as XLSX from "xlsx";
import type { ExtractorProvider } from "./ExtractorProvider";
import type { DocumentType, ExtractionHints, ExtractionResult } from "../types";

function detectTypeFromHeaders(headers: string[]): { type: DocumentType; confidence: number } {
  const h = headers.map((s) => s.toLowerCase().replace(/\s+/g, ""));
  if (h.some((k) => k.includes("itemcode") || k.includes("sku") || k.includes("productcode"))) {
    return { type: "sku", confidence: 0.75 };
  }
  if (h.some((k) => k.includes("invoiceno") || k.includes("invoicenumber") || k.includes("docno"))) {
    return { type: "invoice", confidence: 0.75 };
  }
  if (h.some((k) => k.includes("qty") || k.includes("quantity")) && h.some((k) => k.includes("batch"))) {
    return { type: "packing_list", confidence: 0.75 };
  }
  return { type: "unknown", confidence: 0.5 };
}

export class ExcelExtractor implements ExtractorProvider {
  readonly id = "xlsx";
  readonly supportedMimeTypes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
    "application/csv",
  ];

  async extract(file: File, hints?: ExtractionHints): Promise<ExtractionResult> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    const detected = hints?.documentType
      ? { type: hints.documentType, confidence: 0.9 }
      : detectTypeFromHeaders(headers);

    return {
      documentType: detected.type,
      confidence: detected.confidence,
      rows,
      warnings: rows.length === 0 ? ["Sheet appears to be empty"] : [],
      providerMetadata: { provider: "xlsx", sheetName, totalRows: rows.length },
    };
  }
}
