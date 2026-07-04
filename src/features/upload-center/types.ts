export type DocumentType =
  | "invoice"
  | "purchase_order"
  | "sku"
  | "packing_list"
  | "unknown";

export type UploadItemStatus =
  | "queued"
  | "extracting"
  | "review"
  | "applying"
  | "done"
  | "error";

export interface ExtractionHints {
  documentType?: DocumentType;
}

export interface ExtractionResult {
  documentType: DocumentType;
  confidence: number; // 0–1
  rows: Record<string, unknown>[];
  rawText?: string;
  warnings: string[];
  providerMetadata: Record<string, unknown>;
}

export interface UploadItem {
  id: string;
  file: File;
  status: UploadItemStatus;
  documentType?: DocumentType;
  confidence?: number;
  result?: ExtractionResult;
  warnings: string[];
  error?: string;
  appliedCount?: number;
  /** Human-readable progress message shown while extracting. */
  progress?: string;
}
