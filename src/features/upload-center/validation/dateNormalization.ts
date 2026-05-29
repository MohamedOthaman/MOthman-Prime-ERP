/**
 * Date parsing for extracted invoice values.
 *
 * Handles the date shapes that show up on real invoices and in spreadsheet
 * exports: ISO (`yyyy-mm-dd`), day/month/year and month/day/year with `-`, `/`
 * or `.` separators, 2-digit years, Arabic-Indic digits, and native `Date`
 * objects (Excel `cellDates`). Region default is **day-first** (dd/mm/yyyy);
 * when the day-first reading is impossible the month-first reading is tried.
 */

import { normalizeDigits } from "./numberNormalization";

export interface ParsedInvoiceDate {
  iso: string; // yyyy-mm-dd
  year: number;
  month: number; // 1–12
  day: number; // 1–31
}

const pad = (n: number): string => String(n).padStart(2, "0");

function isValidYmd(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function expandYear(y: number): number {
  if (y >= 100) return y;
  return y < 70 ? 2000 + y : 1900 + y;
}

function finalize(year: number, month: number, day: number): ParsedInvoiceDate | null {
  if (!isValidYmd(year, month, day)) return null;
  return { iso: `${year}-${pad(month)}-${pad(day)}`, year, month, day };
}

export function parseInvoiceDate(input: unknown, opts: { dayFirst?: boolean } = {}): ParsedInvoiceDate | null {
  const dayFirst = opts.dayFirst ?? true;

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return finalize(input.getUTCFullYear(), input.getUTCMonth() + 1, input.getUTCDate());
  }
  if (input == null) return null;

  const s = normalizeDigits(String(input)).trim();
  const m = s.match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/);
  if (!m) return null;

  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);

  // ISO: leading 4-digit year → yyyy-mm-dd, unambiguous.
  if (m[1].length === 4) {
    return finalize(a, b, c);
  }

  const year = expandYear(c);
  const primary = dayFirst ? { month: b, day: a } : { month: a, day: b };
  const primaryResult = finalize(year, primary.month, primary.day);
  if (primaryResult) return primaryResult;

  // Day-first reading was impossible (e.g. "01/13/2024") — try the other order.
  const alt = dayFirst ? { month: a, day: b } : { month: b, day: a };
  return finalize(year, alt.month, alt.day);
}
