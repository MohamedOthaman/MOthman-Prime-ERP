/**
 * Structured validation for extracted invoice rows.
 *
 * Extractors return loosely-typed `Record<string, unknown>[]` rows. This module
 * heuristically maps each row to an invoice line (quantity / unit price / line
 * total / description) using bilingual EN + AR column synonyms, then validates
 * it with a `zod` schema that cross-checks the arithmetic. Every value is run
 * through `parseLocaleNumber` first so Arabic-Indic digits and Arabic/Western
 * separators are handled.
 *
 * Design guarantees:
 *  - Pure and total: never throws, no I/O, no side effects.
 *  - Defensive: if no row exposes a recognizable invoice column, it returns no
 *    issues (we must not raise noise on layouts we cannot understand).
 */

import { z } from "zod";
import { normalizeDigits, parseLocaleNumber } from "./numberNormalization";

export type IssueSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: IssueSeverity;
  /** Stable machine code, e.g. "invoice.line" / "invoice.total". */
  code: string;
  message: string;
  /** 1-based data-row index, when the issue is row-scoped. */
  row?: number;
  field?: string;
}

export interface InvoiceLineView {
  qty: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
  description: string | null;
}

export interface ValidateOptions {
  /** Relative + absolute tolerance for arithmetic checks. Default 0.02. */
  tolerance?: number;
  /** When provided, the sum of line totals is cross-checked against it. */
  expectedGrandTotal?: number;
}

type LineField = keyof Omit<InvoiceLineView, never>;

// Synonyms are pre-normalized (see normalizeHeader). Checked as substrings, in
// priority order, so the most specific fields win before generic ones.
const SYNONYMS: Record<LineField, string[]> = {
  qty: ["qty", "quantity", "كميه", "عدد"],
  unitPrice: ["unitprice", "price", "سعرالوحده", "سعر", "ثمن"],
  lineTotal: ["linetotal", "lineamount", "amount", "total", "اجمالي", "مجموع", "قيمه", "مبلغ"],
  description: ["description", "desc", "itemname", "item", "productname", "product", "name", "صنف", "بيان", "منتج", "اسم"],
};

const FIELD_PRIORITY: LineField[] = ["qty", "unitPrice", "lineTotal", "description"];

/** Normalize a header for matching: ASCII digits, lower-case, strip spacing and
 * punctuation, fold Arabic letter variants, and drop a leading definite article. */
function normalizeHeader(header: string): string {
  return normalizeDigits(header)
    .toLowerCase()
    .replace(/[\s_\-./()]+/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/^ال/, "");
}

function classifyHeader(normalized: string): LineField | null {
  for (const field of FIELD_PRIORITY) {
    if (SYNONYMS[field].some((syn) => normalized.includes(syn))) return field;
  }
  return null;
}

/** Map one raw row to an invoice line. First recognized column per field wins. */
export function mapInvoiceLine(row: Record<string, unknown>): InvoiceLineView {
  const view: InvoiceLineView = { qty: null, unitPrice: null, lineTotal: null, description: null };
  const seen: Record<LineField, boolean> = { qty: false, unitPrice: false, lineTotal: false, description: false };

  for (const [key, raw] of Object.entries(row)) {
    const field = classifyHeader(normalizeHeader(key));
    if (!field || seen[field]) continue;

    if (field === "description") {
      const str = raw == null ? "" : String(raw).trim();
      if (str !== "") {
        view.description = str;
        seen.description = true;
      }
      continue;
    }

    const num = parseLocaleNumber(raw);
    if (num === null) continue;
    if (field === "qty") view.qty = num;
    else if (field === "unitPrice") view.unitPrice = num;
    else if (field === "lineTotal") view.lineTotal = num;
    seen[field] = true;
  }

  return view;
}

function approxEqual(a: number, b: number, tolerance: number): boolean {
  const diff = Math.abs(a - b);
  return diff <= tolerance || diff <= Math.abs(b) * tolerance;
}

function buildLineSchema(tolerance: number) {
  return z
    .object({
      qty: z.number().nullable(),
      unitPrice: z.number().nullable(),
      lineTotal: z.number().nullable(),
      description: z.string().nullable(),
    })
    .superRefine((line, ctx) => {
      if (line.qty != null && line.qty < 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["qty"], message: `negative quantity (${line.qty})` });
      }
      if (line.unitPrice != null && line.unitPrice < 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["unitPrice"], message: `negative unit price (${line.unitPrice})` });
      }
      if (line.qty != null && line.unitPrice != null && line.lineTotal != null) {
        const expected = line.qty * line.unitPrice;
        if (!approxEqual(expected, line.lineTotal, tolerance)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["lineTotal"],
            message: `qty×price (${expected.toFixed(2)}) ≠ line total (${line.lineTotal.toFixed(2)})`,
          });
        }
      }
    });
}

/** Validate extracted invoice rows. Returns an ordered list of issues (possibly empty). */
export function validateInvoiceRows(
  rows: Record<string, unknown>[],
  opts: ValidateOptions = {},
): ValidationIssue[] {
  const tolerance = opts.tolerance ?? 0.02;
  const schema = buildLineSchema(tolerance);
  const issues: ValidationIssue[] = [];

  let recognizedAnyColumn = false;
  let recognizedLineTotals = 0;
  let lineTotalSum = 0;

  rows.forEach((row, index) => {
    const line = mapInvoiceLine(row);
    if (line.qty !== null || line.unitPrice !== null || line.lineTotal !== null) {
      recognizedAnyColumn = true;
    }
    if (line.lineTotal !== null) {
      recognizedLineTotals += 1;
      lineTotalSum += line.lineTotal;
    }

    const parsed = schema.safeParse(line);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({
          severity: "warning",
          code: "invoice.line",
          message: `Row ${index + 1}: ${issue.message}`,
          row: index + 1,
          field: typeof issue.path[0] === "string" ? issue.path[0] : undefined,
        });
      }
    }
  });

  if (!recognizedAnyColumn) return [];

  if (opts.expectedGrandTotal != null && recognizedLineTotals > 0) {
    if (!approxEqual(lineTotalSum, opts.expectedGrandTotal, tolerance)) {
      issues.push({
        severity: "warning",
        code: "invoice.total",
        message: `Sum of line totals (${lineTotalSum.toFixed(2)}) ≠ expected grand total (${opts.expectedGrandTotal.toFixed(2)})`,
      });
    }
  }

  return issues;
}
