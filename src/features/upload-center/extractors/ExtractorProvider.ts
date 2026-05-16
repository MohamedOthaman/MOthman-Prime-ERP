import type { DocumentType, ExtractionHints, ExtractionResult } from "../types";

export interface ExtractorProvider {
  readonly id: string;
  readonly supportedMimeTypes: string[];
  extract(file: File, hints?: ExtractionHints, onProgress?: (msg: string) => void): Promise<ExtractionResult>;
}
