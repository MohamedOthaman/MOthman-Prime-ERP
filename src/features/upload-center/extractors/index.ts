import { PdfExtractor } from "./PdfExtractor";
import { ExcelExtractor } from "./ExcelExtractor";
import type { ExtractorProvider } from "./ExtractorProvider";

const extractors: ExtractorProvider[] = [
  new PdfExtractor(),
  new ExcelExtractor(),
];

export function getExtractor(file: File): ExtractorProvider | null {
  const mime = file.type || "";
  // CSV files sometimes have empty MIME or text/plain — detect by extension
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const effectiveMime =
    !mime && ["csv"].includes(ext) ? "text/csv" :
    !mime && ["xlsx", "xls"].includes(ext) ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" :
    mime;
  return extractors.find((e) => e.supportedMimeTypes.includes(effectiveMime)) ?? null;
}

export { PdfExtractor, ExcelExtractor };
