/**
 * Numeric normalization for OCR / extracted invoice values.
 *
 * Real-world Arabic and mixed Arabic/English invoices use Arabic-Indic digits
 * (٠-٩), Persian/Urdu digits (۰-۹), the Arabic decimal separator (٫ U+066B) and
 * the Arabic thousands separator (٬ U+066C), alongside Western separators. OCR
 * output also carries currency tokens (ر.س, SAR, ج.م, EGP, $) and stray
 * whitespace. These helpers turn that into plain JS numbers without throwing.
 *
 * Separator disambiguation (documented + unit-tested in numberNormalization.test.ts):
 *  - both "," and "." present  → the right-most one is the decimal separator,
 *    the other is treated as a thousands separator and stripped.
 *  - only "," present          → "1,234" (exactly 3 trailing digits) is thousands;
 *    otherwise the comma is the decimal separator ("12,5" → 12.5).
 *  - only "." present          → a single dot is the decimal separator; multiple
 *    dots ("1.234.567") are treated as thousands and stripped.
 */

const ARABIC_INDIC_ZERO = 0x0660; // ٠ .. ٩  (U+0660–U+0669)
const EXTENDED_ARABIC_ZERO = 0x06f0; // ۰ .. ۹  (U+06F0–U+06F9, Persian/Urdu)
const ARABIC_DECIMAL_SEPARATOR = "٫"; // ٫
const ARABIC_THOUSANDS_SEPARATOR = "٬"; // ٬

/** Convert Arabic-Indic and Extended-Arabic (Persian) digits to ASCII 0-9. */
export function normalizeDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) {
      out += String(code - ARABIC_INDIC_ZERO);
    } else if (code >= EXTENDED_ARABIC_ZERO && code <= EXTENDED_ARABIC_ZERO + 9) {
      out += String(code - EXTENDED_ARABIC_ZERO);
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Parse a possibly-localized numeric value (string or number) into a JS number.
 * Returns `null` when the input has no parseable numeric content. Never throws.
 */
export function parseLocaleNumber(input: unknown): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) ? input : null;
  }
  if (input == null) return null;

  let s = normalizeDigits(String(input)).trim();
  if (s === "") return null;

  // Arabic separators → Western before stripping non-numeric characters.
  s = s
    .split(ARABIC_THOUSANDS_SEPARATOR).join("")
    .split(ARABIC_DECIMAL_SEPARATOR).join(".");

  // Accounting-style negatives: "(123.45)" → "-123.45".
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.includes("-")) negative = negative || s.trim().startsWith("-");

  // Drop currency symbols / letters / spaces — keep only digits and separators,
  // then trim stray leading/trailing separators left behind by currency tokens
  // (e.g. the Arabic "ر.س" collapses to a leading "."). NOTE: as a documented
  // consequence, a bare leading-dot fraction like ".5" parses as 5 — write "0.5".
  s = s.replace(/[^0-9.,]/g, "").replace(/^[.,]+/, "").replace(/[.,]+$/, "");
  if (s === "" || !/[0-9]/.test(s)) return null;

  const commaCount = (s.match(/,/g) ?? []).length;
  const dotCount = (s.match(/\./g) ?? []).length;

  let decimalSep: "," | "." | null = null;
  if (commaCount > 0 && dotCount > 0) {
    decimalSep = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
  } else if (commaCount > 0) {
    const trailing = s.length - s.lastIndexOf(",") - 1;
    decimalSep = commaCount === 1 && trailing !== 3 ? "," : null; // "12,5"→dec, "1,234"→thousands
  } else if (dotCount > 0) {
    decimalSep = dotCount === 1 ? "." : null; // "1.234.567"→thousands
  }

  if (decimalSep === null) {
    s = s.replace(/[.,]/g, ""); // every separator is thousands grouping
  } else {
    const other = decimalSep === "," ? "." : ",";
    s = s.split(other).join(""); // strip thousands separators
    const idx = s.lastIndexOf(decimalSep); // keep only the last as the decimal point
    s = s.slice(0, idx).split(decimalSep).join("") + "." + s.slice(idx + 1);
  }

  const value = Number.parseFloat(s);
  if (!Number.isFinite(value)) return null;
  return negative ? -Math.abs(value) : value;
}
