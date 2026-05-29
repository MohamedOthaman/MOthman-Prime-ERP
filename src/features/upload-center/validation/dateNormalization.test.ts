import { describe, it, expect } from "vitest";
import { parseInvoiceDate } from "./dateNormalization";

describe("parseInvoiceDate", () => {
  it("parses ISO yyyy-mm-dd", () => {
    expect(parseInvoiceDate("2024-01-13")?.iso).toBe("2024-01-13");
  });

  it("parses day-first dd/mm/yyyy with / - . separators", () => {
    expect(parseInvoiceDate("13/01/2024")?.iso).toBe("2024-01-13");
    expect(parseInvoiceDate("05.06.2024")?.iso).toBe("2024-06-05");
    expect(parseInvoiceDate("13-01-2024")?.iso).toBe("2024-01-13");
  });

  it("falls back to month-first when the day-first reading is impossible", () => {
    expect(parseInvoiceDate("01/13/2024")?.iso).toBe("2024-01-13");
  });

  it("respects dayFirst: false for ambiguous dates", () => {
    expect(parseInvoiceDate("01/12/2024", { dayFirst: false })?.iso).toBe("2024-01-12");
  });

  it("expands 2-digit years", () => {
    expect(parseInvoiceDate("31/12/23")?.iso).toBe("2023-12-31");
    expect(parseInvoiceDate("01/01/85")?.year).toBe(1985);
  });

  it("normalizes Arabic-Indic digits", () => {
    expect(parseInvoiceDate("١٣/٠١/٢٠٢٤")?.iso).toBe("2024-01-13");
  });

  it("accepts native Date objects (Excel cellDates)", () => {
    expect(parseInvoiceDate(new Date(Date.UTC(2024, 0, 13)))?.iso).toBe("2024-01-13");
  });

  it("rejects impossible or unparseable dates", () => {
    expect(parseInvoiceDate("32/13/2024")).toBeNull();
    expect(parseInvoiceDate("2024-02-30")).toBeNull();
    expect(parseInvoiceDate("not a date")).toBeNull();
    expect(parseInvoiceDate("")).toBeNull();
    expect(parseInvoiceDate(null)).toBeNull();
  });
});
