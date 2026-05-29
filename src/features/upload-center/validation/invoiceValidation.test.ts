import { describe, it, expect } from "vitest";
import { mapInvoiceLine, validateInvoiceRows } from "./invoiceValidation";

describe("mapInvoiceLine", () => {
  it("maps English headers and parses values", () => {
    const line = mapInvoiceLine({ Item: "Apple", Qty: "10", "Unit Price": "5.50", "Line Total": "55.00" });
    expect(line).toEqual({ qty: 10, unitPrice: 5.5, lineTotal: 55, description: "Apple" });
  });

  it("maps Arabic headers and Arabic-Indic digit values", () => {
    const line = mapInvoiceLine({ "الصنف": "تفاح", "الكمية": "١٠", "سعر الوحدة": "٥٫٥", "الإجمالي": "٥٥" });
    expect(line).toEqual({ qty: 10, unitPrice: 5.5, lineTotal: 55, description: "تفاح" });
  });
});

describe("validateInvoiceRows", () => {
  it("returns no issues for an arithmetically consistent invoice", () => {
    const issues = validateInvoiceRows([
      { Item: "Apple", Qty: "10", "Unit Price": "5.50", "Line Total": "55.00" },
      { Item: "Pear", Qty: "2", "Unit Price": "3", "Line Total": "6" },
    ]);
    expect(issues).toEqual([]);
  });

  it("flags a line where qty × price ≠ line total", () => {
    const issues = validateInvoiceRows([
      { Item: "Apple", Qty: "10", "Unit Price": "5", "Line Total": "60" },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "invoice.line", row: 1, field: "lineTotal" });
    expect(issues[0].message).toContain("≠");
  });

  it("detects the same mismatch from an Arabic invoice", () => {
    const issues = validateInvoiceRows([
      { "الكمية": "١٠", "سعر الوحدة": "٥", "الإجمالي": "٦٠" },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("invoice.line");
  });

  it("flags a negative quantity", () => {
    const issues = validateInvoiceRows([{ Qty: "-3", "Unit Price": "5", Total: "-15" }]);
    expect(issues.some((i) => i.field === "qty" && /negative/i.test(i.message))).toBe(true);
  });

  it("stays silent on layouts with no recognizable invoice columns", () => {
    expect(validateInvoiceRows([{ Foo: "bar", Baz: "123" }])).toEqual([]);
    // a description-only row is also not enough to validate against
    expect(validateInvoiceRows([{ Item: "Widget", Notes: "n/a" }])).toEqual([]);
  });

  it("cross-checks the sum of line totals against an expected grand total", () => {
    const rows = [
      { Item: "A", Qty: "10", "Unit Price": "5", "Line Total": "50" },
      { Item: "B", Qty: "20", "Unit Price": "3", "Line Total": "60" },
    ];
    expect(validateInvoiceRows(rows, { expectedGrandTotal: 110 })).toEqual([]);

    const mismatch = validateInvoiceRows(rows, { expectedGrandTotal: 100 });
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0].code).toBe("invoice.total");
  });

  it("tolerates sub-cent rounding noise", () => {
    const issues = validateInvoiceRows([
      { Qty: "3", "Unit Price": "0.333", "Line Total": "1.00" }, // 0.999 vs 1.00
    ]);
    expect(issues).toEqual([]);
  });
});
