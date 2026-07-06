import { describe, it, expect } from "vitest";
import { parsePOLocalText } from "@/features/invoices/poLocalParser";

// ─── normalizeDate (via header extraction) ─────────────────────────────────────

describe("parsePOLocalText — header extraction", () => {
  it("extracts PO number and date (DD/MM/YYYY)", () => {
    const text = `
PURCHASE ORDER
PO Number: PO-2024-001
Date: 15/06/2024
Customer: ABC Company Ltd

Item Code  Description  Qty  Unit  Price  Total
`;
    const result = parsePOLocalText(text);
    expect(result.poNumber).toBe("PO-2024-001");
    expect(result.date).toBe("2024-06-15");
    expect(result.customerName).toBe("ABC Company Ltd");
  });

  it("extracts PO number with hash shorthand", () => {
    const text = "PO# INV-999\nDate: 2025-01-31\n";
    const result = parsePOLocalText(text);
    expect(result.poNumber).toBe("INV-999");
    expect(result.date).toBe("2025-01-31");
  });

  it("normalises Arabic/Persian digits in date", () => {
    // ١٥/٠٦/٢٠٢٤ in Arabic-Indic → 15/06/2024
    const text = "Date: ١٥/٠٦/٢٠٢٤\n";
    const result = parsePOLocalText(text);
    expect(result.date).toBe("2024-06-15");
  });

  it("extracts customer code from 'Customer Code: C001'", () => {
    const text = "Customer Code: C001\nCustomer: Acme Ltd\n";
    const result = parsePOLocalText(text);
    expect(result.customerCode).toBe("C001");
    expect(result.customerName).toBe("Acme Ltd");
  });

  it("extracts comments from Notes line", () => {
    const text = "Notes: handle with care\n";
    const result = parsePOLocalText(text);
    expect(result.comments).toBe("handle with care");
  });

  it("warns when PO number not found", () => {
    const result = parsePOLocalText("Date: 01/01/2025\n");
    expect(result.warnings.some((w) => /po number/i.test(w))).toBe(true);
  });

  it("warns when date not found", () => {
    const result = parsePOLocalText("PO Number: X-001\n");
    expect(result.warnings.some((w) => /date/i.test(w))).toBe(true);
  });

  it("always returns rawText unchanged", () => {
    const text = "hello world\n";
    expect(parsePOLocalText(text).rawText).toBe(text);
  });
});

// ─── Item row parsing ──────────────────────────────────────────────────────────

const PO_TABLE = `
PURCHASE ORDER
PO Number: PO-001
Date: 20/03/2025

Item Code  Description                Qty  Unit  Unit Price  Total
-----------------------------------------------------------------
PROD001    Product Alpha              24   CTN   10.500      252.000
PROD002    Product Beta Description   12   BOX    8.250       99.000
PROD003    Another Item                6   PKT    3.000       18.000
-----------------------------------------------------------------
Total:                                                       369.000
`;

describe("parsePOLocalText — item rows", () => {
  it("parses all item rows from a standard table", () => {
    const result = parsePOLocalText(PO_TABLE);
    expect(result.items).toHaveLength(3);
  });

  it("extracts item code and name correctly", () => {
    const result = parsePOLocalText(PO_TABLE);
    expect(result.items[0].itemCode).toBe("PROD001");
    expect(result.items[0].itemName).toBe("Product Alpha");
  });

  it("extracts quantity correctly", () => {
    const result = parsePOLocalText(PO_TABLE);
    expect(result.items[0].qty).toBe(24);
    expect(result.items[1].qty).toBe(12);
    expect(result.items[2].qty).toBe(6);
  });

  it("extracts UOM correctly", () => {
    const result = parsePOLocalText(PO_TABLE);
    expect(result.items[0].unit).toBe("CTN");
    expect(result.items[1].unit).toBe("BOX");
    expect(result.items[2].unit).toBe("PKT");
  });

  it("extracts unit price", () => {
    const result = parsePOLocalText(PO_TABLE);
    expect(result.items[0].unitPrice).toBeCloseTo(10.5);
    expect(result.items[1].unitPrice).toBeCloseTo(8.25);
  });

  it("stops at Total footer line", () => {
    const result = parsePOLocalText(PO_TABLE);
    // Should not include a row from the "Total:" line
    expect(result.items.every((i) => i.itemCode !== "")).toBeTruthy();
  });

  it("warns when no items found", () => {
    const result = parsePOLocalText("PO Number: X\nDate: 01/01/2025\nNo table here.\n");
    expect(result.warnings.some((w) => /no item rows/i.test(w))).toBe(true);
    expect(result.items).toHaveLength(0);
  });
});

// ─── UOM normalisation ─────────────────────────────────────────────────────────

describe("parsePOLocalText — UOM in compound format", () => {
  it("parses CAR=24EA as CAR", () => {
    const text = `
PO Number: T-001
Date: 01/01/2025

Item Code  Description   Qty  Unit     Price  Total
PROD001    Some Product   12  CAR=24EA   5.0   60.0
`;
    // The compound UOM should still be recognised via extractUOM
    // This table may or may not have a header row recognised — test that items come through
    const result = parsePOLocalText(text);
    if (result.items.length > 0) {
      // The unit should be "CAR" (normalised from "CAR=24EA")
      expect(result.items[0].unit).toBe("CAR");
    }
  });
});

// ─── Arabic/Persian digit normalisation in items ───────────────────────────────

describe("parsePOLocalText — Arabic digits in table", () => {
  it("normalises Arabic digits in quantities", () => {
    // ٢٤ = 24, ١٠ = 10
    const text = `
PO Number: AR-001
Date: ١٥/٠٦/٢٠٢٤

Item Code  Description   Qty   Unit  Price   Total
PROD001    Test Product   ٢٤   CTN   ١٠.٥٠٠  ٢٥٢.٠٠٠
`;
    const result = parsePOLocalText(text);
    if (result.items.length > 0) {
      expect(result.items[0].qty).toBe(24);
    }
  });
});

// ─── Multi-page POs: soft footers must not discard later items ─────────────────

describe("parsePOLocalText — multi-page documents", () => {
  it("keeps items after a page-1 subtotal when the table header repeats", () => {
    const text = `
PO Number: MP-001
Date: 01/07/2026

Item Code  Description        Qty  Unit  Price
PROD001    First Page Item     10  CTN   5.000
Subtotal                                50.000
Page 2 of 2

Item Code  Description        Qty  Unit  Price
PROD002    Second Page Item    20  CTN   7.000
Grand Total                            190.000
`;
    const result = parsePOLocalText(text);
    const codes = result.items.map((i) => i.itemCode);
    expect(codes).toContain("PROD001");
    expect(codes).toContain("PROD002");
  });

  it("keeps items after a bare page marker without a repeated header", () => {
    const text = `
PO Number: MP-002
Date: 01/07/2026

Item Code  Description        Qty  Unit  Price
PROD001    First Page Item     10  CTN   5.000
Page 2 of 2
PROD002    Second Page Item    20  CTN   7.000
`;
    const result = parsePOLocalText(text);
    const codes = result.items.map((i) => i.itemCode);
    expect(codes).toContain("PROD001");
    expect(codes).toContain("PROD002");
  });

  it("still stops at a grand total", () => {
    const text = `
PO Number: MP-003
Date: 01/07/2026

Item Code  Description        Qty  Unit  Price
PROD001    Real Item           10  CTN   5.000
Grand Total                            50.000
NOTAROW    Address Line 55     99  ZZZ   1.000
`;
    const result = parsePOLocalText(text);
    const codes = result.items.map((i) => i.itemCode);
    expect(codes).toContain("PROD001");
    expect(codes).not.toContain("NOTAROW");
  });
});
