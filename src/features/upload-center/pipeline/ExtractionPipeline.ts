import { getExtractor } from "../extractors";
import { validateInvoiceRows } from "../validation";
import type { ExtractionResult, ExtractionHints } from "../types";

export interface PipelineOptions {
  hints?: ExtractionHints;
  onProgress?: (msg: string) => void;
}

export interface PipelineOutcome {
  result: ExtractionResult;
  extractorId: string;
}

export async function runExtraction(
  file: File,
  options: PipelineOptions = {},
): Promise<PipelineOutcome> {
  const extractor = getExtractor(file);
  if (!extractor) {
    throw new Error(`No extractor available for: ${file.name}`);
  }
  options.onProgress?.(`Extracting with ${extractor.id}…`);
  const result = await extractor.extract(file, options.hints, options.onProgress);

  // Best-effort enrichment: surface invoice arithmetic problems as warnings.
  // This must never alter rows or throw — extraction succeeds regardless.
  if (result.documentType === "invoice") {
    try {
      const issues = validateInvoiceRows(result.rows);
      if (issues.length > 0) {
        result.warnings = [...result.warnings, ...issues.map((issue) => issue.message)];
      }
    } catch {
      // Validation is non-critical; ignore failures so extraction is unaffected.
    }
  }

  return { result, extractorId: extractor.id };
}
