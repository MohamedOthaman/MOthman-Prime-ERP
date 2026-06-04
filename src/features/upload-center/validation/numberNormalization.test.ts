import { describe, it, expect } from "vitest";
import { normalizeDigits, parseLocaleNumber } from "./numberNormalization";

describe("normalizeDigits", () => {
  it("converts Arabic-Indic digits to ASCII", () => {
    expect(normalizeDigits("١٢٣٤٥٦٧٨٩٠")).toBe("1234567890");
  });

  it("converts Persian/Urdu (extended Arabic) digits to ASCII", () => {
    expect(normalizeDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
  });

  it("leaves Latin text and separators untouched", () => {
    expect(normalizeDigits("Total: 1,234.56")).toBe("Total: 1,234.56");
  });

  it("handles mixed Arabic/Latin content", () => {
    expect(normalizeDigits("قيمة ١٢٣")).toBe("قيمة 123");
  });
});

describe("parseLocaleNumber", () => {
  it("passes through finite numbers and rejects non-finite", () => {
    expect(parseLocaleNumber(1234.56)).toBe(1234.56);
    expect(parseLocaleNumber(Number.NaN)).toBeNull();
    expect(parseLocaleNumber(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("returns null for empty / nullish / non-numeric input", () => {
    expect(parseLocaleNumber(null)).toBeNull();
    expect(parseLocaleNumber(undefined)).toBeNull();
    expect(parseLocaleNumber("")).toBeNull();
    expect(parseLocaleNumber("   ")).toBeNull();
    expect(parseLocaleNumber("abc")).toBeNull();
  });

  it("parses plain and US-grouped numbers", () => {
    expect(parseLocaleNumber("1234.56")).toBe(1234.56);
    expect(parseLocaleNumber("1,234.56")).toBe(1234.56);
    expect(parseLocaleNumber("1,234,567.89")).toBe(1234567.89);
  });

  it("parses EU-style grouping (dot thousands, comma decimal)", () => {
    expect(parseLocaleNumber("1.234,56")).toBe(1234.56);
    expect(parseLocaleNumber("1.234.567,89")).toBe(1234567.89);
  });

  it("disambiguates a lone comma (thousands vs decimal)", () => {
    expect(parseLocaleNumber("1,234")).toBe(1234); // 3 trailing digits → thousands
    expect(parseLocaleNumber("12,5")).toBe(12.5); // not 3 → decimal
    expect(parseLocaleNumber("1,234,567")).toBe(1234567);
  });

  it("disambiguates dots (single decimal vs multi thousands)", () => {
    expect(parseLocaleNumber("12.345")).toBe(12.345); // single dot → decimal
    expect(parseLocaleNumber("1.234.567")).toBe(1234567); // multi → thousands
  });

  it("parses Arabic digits and Arabic decimal/thousands separators", () => {
    expect(parseLocaleNumber("١٢٣٤")).toBe(1234);
    expect(parseLocaleNumber("١٢٣٤٫٥٦")).toBe(1234.56); // Arabic decimal ٫
    expect(parseLocaleNumber("١٬٢٣٤٫٥٦")).toBe(1234.56); // Arabic thousands ٬ + decimal ٫
  });

  it("strips currency tokens including the dotted Arabic Riyal symbol", () => {
    expect(parseLocaleNumber("ر.س 1,200.00")).toBe(1200);
    expect(parseLocaleNumber("$1,200.50")).toBe(1200.5);
    expect(parseLocaleNumber("1200.00 SAR")).toBe(1200);
    expect(parseLocaleNumber("ج.م ٢٥٠")).toBe(250);
  });

  it("handles negatives, including accounting parentheses", () => {
    expect(parseLocaleNumber("-50")).toBe(-50);
    expect(parseLocaleNumber("(123.45)")).toBe(-123.45);
  });

  it("documented limitation: a bare leading-dot fraction parses as an integer", () => {
    expect(parseLocaleNumber(".5")).toBe(5); // write "0.5" for a real fraction
    expect(parseLocaleNumber("0.5")).toBe(0.5);
  });
});
