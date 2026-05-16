import { getExtractor } from "../extractors";
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
  return { result, extractorId: extractor.id };
}
