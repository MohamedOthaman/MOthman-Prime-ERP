import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import XLSX from "xlsx";

const DEFAULT_WORKBOOK_PATH = "F:\\System QC\\food_choice_reference_extraction_enriched.xlsx";
const OUTPUT_DIR = path.resolve("data", "food_choice_import");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function toText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeWhitespace(value) {
  return toText(value).replace(/\s+/g, " ").trim();
}

function normalizeCode(value) {
  return normalizeWhitespace(value).toUpperCase();
}

function normalizeBarcodeValue(value) {
  const raw = normalizeWhitespace(value);
  if (!raw) return "";
  if (["NAN", "NULL", "N/A", "NA", "-"].includes(raw.toUpperCase())) {
    return "";
  }
  const stripped = raw.replace(/^'+/, "").replace(/\s+/g, "");
  if (/^\d+\.0+$/.test(stripped)) {
    return stripped.replace(/\.0+$/, "");
  }
  return stripped;
}

function splitBarcodeCandidates(...values) {
  const result = [];
  for (const value of values) {
    const text = toText(value);
    if (!text) continue;
    const parts = text.split(/[\n;,|/]+/).map(normalizeBarcodeValue).filter(Boolean);
    if (parts.length === 0) {
      const fallback = normalizeBarcodeValue(text);
      if (fallback) result.push(fallback);
    } else {
      result.push(...parts);
    }
  }
  return result;
}

function toNumber(value) {
  const text = toText(value).replace(/,/g, "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseWorkbookDate(value) {
  const text = normalizeWhitespace(value);
  if (!text) return "";

  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return "";
}

function cleanSalesmanName(value) {
  const text = normalizeWhitespace(value);
  if (!text) return "";
  return text.replace(/\s+\d{1,3}(?:,\d{3})*(?:\.\d+)?$/, "").trim();
}

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    const text = normalizeWhitespace(value);
    if (text) return text;
  }
  return "";
}

function toCsv(rows, columns) {
  const escape = (value) => {
    const text = value == null ? "" : String(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
    return text;
  };
  const lines = [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => escape(row[column])).join(",")),
  ];
  return `${lines.join("\n")}\n`;
}

function writeCsv(filename, rows, columns) {
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), toCsv(rows, columns), "utf8");
}

function writeJson(filename, data) {
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), JSON.stringify(data, null, 2), "utf8");
}

function mapBy(rows, keyField) {
  const map = new Map();
  for (const row of rows) {
    const key = normalizeCode(row[keyField]);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function collectIssues(issueMap, key, issue) {
  if (!issueMap.has(key)) issueMap.set(key, []);
  issueMap.get(key).push(issue);
}

function main() {
  const workbookPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_WORKBOOK_PATH;
  if (!fs.existsSync(workbookPath)) {
    throw new Error(`Workbook not found: ${workbookPath}`);
  }

  ensureDir(OUTPUT_DIR);

  const workbook = XLSX.readFile(workbookPath, {
    cellDates: false,
    raw: false,
    dense: false,
  });

  const requiredSheets = [
    "salesmen",
    "customers",
    "products_import_ready",
    "product_prices",
    "stock_batches",
    "products_enriched_full",
  ];

  for (const sheetName of requiredSheets) {
    if (!workbook.SheetNames.includes(sheetName)) {
      throw new Error(`Missing required sheet: ${sheetName}`);
    }
  }

  const salesmenSheet = XLSX.utils.sheet_to_json(workbook.Sheets.salesmen, {
    defval: "",
  });
  const customersSheet = XLSX.utils.sheet_to_json(workbook.Sheets.customers, {
    defval: "",
  });
  const productsImportReady = XLSX.utils.sheet_to_json(workbook.Sheets.products_import_ready, {
    defval: "",
  });
  const productPrices = XLSX.utils.sheet_to_json(workbook.Sheets.product_prices, {
    defval: "",
  });
  const stockBatchesSheet = XLSX.utils.sheet_to_json(workbook.Sheets.stock_batches, {
    defval: "",
  });
  const productsEnrichedFull = XLSX.utils.sheet_to_json(workbook.Sheets.products_enriched_full, {
    defval: "",
  });

  const enrichedByItemCode = mapBy(productsEnrichedFull, "item_code");
  const pricesByItemCode = mapBy(productPrices, "item_code");

  const issueMap = new Map();
  const barcodeOwners = new Map();
  const productsClean = [];
  const barcodesClean = [];
  const pricesClean = [];
  const salesmenClean = [];
  const customersClean = [];
  const stockBatchesClean = [];

  let blankItemCodeCount = 0;

  const salesmanCodeToName = new Map();
  for (const row of salesmenSheet) {
    const code = normalizeCode(row.salesman_code);
    const name = cleanSalesmanName(row.salesman_name);
    if (!code || !name) continue;
    if (!salesmanCodeToName.has(code)) {
      salesmanCodeToName.set(code, name);
    }
  }

  for (const row of customersSheet) {
    const code = normalizeCode(row.customer_code);
    const name = normalizeWhitespace(row.customer_name);
    const salesmanCode = normalizeCode(row.salesman_code);
    const salesmanName = cleanSalesmanName(row.salesman_name) || salesmanCodeToName.get(salesmanCode) || "";

    if (!code || !name) continue;

    customersClean.push({
      customer_code: code,
      customer_name: name,
      customer_name_ar: "",
      salesman_code: salesmanCode,
      salesman_name: salesmanName,
      type: "",
      group_name: "",
      category: "",
      area: "",
      phone: "",
      credit_days: "30",
      credit_limit: "0.000",
      notes: "",
      is_active: "true",
    });

    if (salesmanCode && salesmanName && !salesmanCodeToName.has(salesmanCode)) {
      salesmanCodeToName.set(salesmanCode, salesmanName);
    }
  }

  for (const [code, name] of Array.from(salesmanCodeToName.entries()).sort((left, right) => left[0].localeCompare(right[0]))) {
    salesmenClean.push({
      salesman_code: code,
      salesman_name: name,
      salesman_name_ar: "",
      phone: "",
      email: "",
      is_active: "true",
    });
  }

  for (const row of stockBatchesSheet) {
    const itemCode = normalizeCode(row.item_code);
    const batchNo = normalizeWhitespace(row.batch_no);
    const quantity = toNumber(row.stock_qty);
    const expiryDate = parseWorkbookDate(row.expiry_date);

    if (!itemCode || !batchNo || quantity == null || quantity <= 0 || !expiryDate) {
      continue;
    }

    stockBatchesClean.push({
      item_code: itemCode,
      batch_no: batchNo,
      expiry_date: expiryDate,
      quantity: quantity.toFixed(3),
      uom: normalizeWhitespace(row.uom),
      warehouse: normalizeWhitespace(row.warehouse),
      item_name: normalizeWhitespace(row.item_name),
      brand_code: normalizeCode(row.brand_code),
    });
  }

  for (const row of productsImportReady) {
    const itemCode = normalizeCode(row.item_code);
    if (!itemCode) {
      blankItemCodeCount += 1;
    }
  }

  const groupedImportRows = mapBy(productsImportReady, "item_code");

  for (const [itemCode, importRows] of groupedImportRows.entries()) {
    const primaryRow = importRows[0];
    const enrichedRows = enrichedByItemCode.get(itemCode) ?? [];
    const priceRows = pricesByItemCode.get(itemCode) ?? [];

    const nameCandidates = new Set(
      [primaryRow.item_name_en, ...enrichedRows.map((row) => row.item_name_en)]
        .map(normalizeWhitespace)
        .filter(Boolean)
    );
    if (nameCandidates.size > 1) {
      collectIssues(issueMap, itemCode, {
        type: "conflicting_name_en",
        values: Array.from(nameCandidates),
      });
    }

    const internalCodeCandidates = new Set(
      enrichedRows
        .map((row) => normalizeCode(row.brand_code_ref))
        .filter(Boolean)
    );
    if (internalCodeCandidates.size > 1) {
      collectIssues(issueMap, itemCode, {
        type: "conflicting_internal_code_candidate",
        values: Array.from(internalCodeCandidates),
      });
    }

    const barcodeCandidates = Array.from(
      new Set(
        splitBarcodeCandidates(
          primaryRow.barcode,
          ...enrichedRows.map((row) => row.barcode_final),
          ...enrichedRows.map((row) => row.barcode_master),
          ...enrichedRows.map((row) => row.barcode_fasiha),
          ...enrichedRows.map((row) => row.barcode_ref)
        )
      )
    );

    const priceSource =
      pickFirstNonEmpty(primaryRow.price_source, ...priceRows.map((row) => row.price_source)) || "";

    const productRecord = {
      item_code: itemCode,
      internal_code: "",
      internal_code_candidate: Array.from(internalCodeCandidates)[0] ?? "",
      name_en: normalizeWhitespace(primaryRow.item_name_en),
      name_ar: normalizeWhitespace(primaryRow.item_name_ar),
      brand: normalizeWhitespace(primaryRow.brand_name),
      section: pickFirstNonEmpty(primaryRow.main_supplier, ...enrichedRows.map((row) => row.main_supplier_fasiha)),
      category: normalizeWhitespace(primaryRow.category),
      country: normalizeWhitespace(primaryRow.origin),
      uom: normalizeWhitespace(primaryRow.uom),
      pack_size: normalizeWhitespace(primaryRow.pack_size),
      source_row_count: importRows.length + enrichedRows.length,
      barcode_count: barcodeCandidates.length,
      price_source: priceSource,
      review_flag: "false",
      review_reason: "",
      provenance_barcode_final: pickFirstNonEmpty(...enrichedRows.map((row) => row.barcode_final)),
      provenance_barcode_master: pickFirstNonEmpty(...enrichedRows.map((row) => row.barcode_master)),
      provenance_barcode_fasiha: pickFirstNonEmpty(...enrichedRows.map((row) => row.barcode_fasiha)),
      provenance_barcode_ref: pickFirstNonEmpty(...enrichedRows.map((row) => row.barcode_ref)),
      provenance_item_name_master_en: pickFirstNonEmpty(...enrichedRows.map((row) => row.item_name_master_en)),
      provenance_item_name_master_ar: pickFirstNonEmpty(...enrichedRows.map((row) => row.item_name_master_ar)),
      provenance_brand_master: pickFirstNonEmpty(...enrichedRows.map((row) => row.brand_master)),
      provenance_brand_fasiha: pickFirstNonEmpty(...enrichedRows.map((row) => row.brand_fasiha)),
      provenance_origin_master: pickFirstNonEmpty(...enrichedRows.map((row) => row.origin_master)),
      provenance_origin_ref: pickFirstNonEmpty(...enrichedRows.map((row) => row.origin_ref)),
      provenance_supplier_code_ref: pickFirstNonEmpty(...enrichedRows.map((row) => row.supplier_code_ref)),
    };

    if (!productRecord.name_en) {
      collectIssues(issueMap, itemCode, { type: "missing_name_en" });
    }

    if (internalCodeCandidates.size > 1) {
      productRecord.review_flag = "true";
      productRecord.review_reason = pickFirstNonEmpty(
        productRecord.review_reason,
        "internal_code_candidate_conflict"
      );
    }

    for (const barcode of barcodeCandidates) {
      if (!barcodeOwners.has(barcode)) barcodeOwners.set(barcode, new Set());
      barcodeOwners.get(barcode).add(itemCode);
      barcodesClean.push({
        item_code: itemCode,
        barcode,
        barcode_source: "merged_reference",
        is_primary: barcodesClean.filter((row) => row.item_code === itemCode).length === 0 ? "true" : "false",
      });
    }

    const costPrice =
      toNumber(priceRows[0]?.ptt_ctn) ??
      toNumber(priceRows[0]?.ptt_unit) ??
      0;
    const sellingPrice =
      toNumber(priceRows[0]?.final_price) ??
      toNumber(priceRows[0]?.rsp_ctn) ??
      toNumber(priceRows[0]?.rsp_unit) ??
      0;
    const discount = toNumber(priceRows[0]?.ptt_discount) ?? 0;

    const conflictingSellingPrices = Array.from(
      new Set(
        priceRows
          .map((row) => toNumber(row.final_price) ?? toNumber(row.rsp_ctn) ?? toNumber(row.rsp_unit))
          .filter((value) => value != null)
          .map((value) => Number(value).toFixed(3))
      )
    );
    if (conflictingSellingPrices.length > 1) {
      collectIssues(issueMap, itemCode, {
        type: "conflicting_selling_price",
        values: conflictingSellingPrices,
      });
    }

    pricesClean.push({
      item_code: itemCode,
      cost_price: costPrice.toFixed(3),
      selling_price: sellingPrice.toFixed(3),
      discount: discount.toFixed(3),
      price_source: priceSource,
      review_flag: conflictingSellingPrices.length > 1 ? "true" : "false",
      review_reason: conflictingSellingPrices.length > 1 ? "conflicting_selling_price" : "",
    });

    productsClean.push(productRecord);
  }

  const duplicateItemCodeCount = productsImportReady.length - groupedImportRows.size - blankItemCodeCount;
  const barcodeConflicts = [];

  for (const [barcode, owners] of barcodeOwners.entries()) {
    if (owners.size > 1) {
      const ownerList = Array.from(owners).sort();
      barcodeConflicts.push({ barcode, item_codes: ownerList.join("|") });
      for (const owner of ownerList) {
        collectIssues(issueMap, owner, {
          type: "barcode_conflict",
          barcode,
          item_codes: ownerList,
        });
      }
    }
  }

  for (const product of productsClean) {
    const issues = issueMap.get(product.item_code) ?? [];
    if (issues.length > 0) {
      product.review_flag = "true";
      if (!product.review_reason) {
        product.review_reason = issues.map((issue) => issue.type).join("|");
      } else {
        product.review_reason = Array.from(new Set([product.review_reason, ...issues.map((issue) => issue.type)])).join("|");
      }
    }
  }

  const filteredBarcodesClean = barcodesClean.filter((row) => !barcodeConflicts.some((conflict) => conflict.barcode === row.barcode));

  const issues = Array.from(issueMap.entries()).map(([item_code, itemIssues]) => ({
    item_code,
    issue_count: itemIssues.length,
    issues: itemIssues,
  }));

  const profile = {
    workbook_path: workbookPath,
    generated_at: new Date().toISOString(),
    sheet_counts: {
      salesmen: salesmenSheet.length,
      customers: customersSheet.length,
      products_import_ready: productsImportReady.length,
      product_prices: productPrices.length,
      stock_batches: stockBatchesSheet.length,
      products_enriched_full: productsEnrichedFull.length,
    },
    profile: {
      canonical_salesmen_count: salesmenClean.length,
      canonical_customers_count: customersClean.length,
      blank_item_code_count: blankItemCodeCount,
      duplicate_item_code_count: duplicateItemCodeCount,
      canonical_product_count: productsClean.length,
      barcode_row_count: filteredBarcodesClean.length,
      barcode_conflict_count: barcodeConflicts.length,
      price_row_count: pricesClean.length,
      opening_stock_batch_count: stockBatchesClean.length,
      review_product_count: productsClean.filter((row) => row.review_flag === "true").length,
    },
  };

  writeCsv("salesmen_clean.csv", salesmenClean, [
    "salesman_code",
    "salesman_name",
    "salesman_name_ar",
    "phone",
    "email",
    "is_active",
  ]);

  writeCsv("customers_clean.csv", customersClean, [
    "customer_code",
    "customer_name",
    "customer_name_ar",
    "salesman_code",
    "salesman_name",
    "type",
    "group_name",
    "category",
    "area",
    "phone",
    "credit_days",
    "credit_limit",
    "notes",
    "is_active",
  ]);

  writeCsv("stock_batches_clean.csv", stockBatchesClean, [
    "item_code",
    "batch_no",
    "expiry_date",
    "quantity",
    "uom",
    "warehouse",
    "item_name",
    "brand_code",
  ]);

  writeCsv("products_clean.csv", productsClean, [
    "item_code",
    "internal_code",
    "internal_code_candidate",
    "name_en",
    "name_ar",
    "brand",
    "section",
    "category",
    "country",
    "uom",
    "pack_size",
    "source_row_count",
    "barcode_count",
    "price_source",
    "review_flag",
    "review_reason",
    "provenance_barcode_final",
    "provenance_barcode_master",
    "provenance_barcode_fasiha",
    "provenance_barcode_ref",
    "provenance_item_name_master_en",
    "provenance_item_name_master_ar",
    "provenance_brand_master",
    "provenance_brand_fasiha",
    "provenance_origin_master",
    "provenance_origin_ref",
    "provenance_supplier_code_ref",
  ]);

  writeCsv("barcodes_clean.csv", filteredBarcodesClean, [
    "item_code",
    "barcode",
    "barcode_source",
    "is_primary",
  ]);

  writeCsv("prices_clean.csv", pricesClean, [
    "item_code",
    "cost_price",
    "selling_price",
    "discount",
    "price_source",
    "review_flag",
    "review_reason",
  ]);

  writeJson("profile_report.json", profile);
  writeJson("issues_report.json", {
    barcode_conflicts: barcodeConflicts,
    item_issues: issues,
  });

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "README.md"),
    [
      "# Food Choice Product Master Import",
      "",
      "Generated by `npm run prepare:food-choice-products`.",
      "",
      "Outputs:",
      "- `salesmen_clean.csv`: canonical salesman rows derived from `salesmen` + `customers`",
      "- `customers_clean.csv`: customer rows linked by salesman code",
      "- `stock_batches_clean.csv`: FEFO-ready opening stock batches",
      "- `products_clean.csv`: canonical product master rows",
      "- `barcodes_clean.csv`: normalized product-barcode rows with conflicts removed",
      "- `prices_clean.csv`: consolidated pricing rows",
      "- `profile_report.json`: workbook profiling summary",
      "- `issues_report.json`: detected conflicts and review flags",
      "",
      "Defaults:",
      "- canonical key = `item_code`",
      "- primary source = `products_import_ready`",
      "- `internal_code` left blank until candidate confirmation",
      "- barcode conflicts are excluded from `barcodes_clean.csv` and listed in `issues_report.json`",
    ].join("\n"),
    "utf8"
  );

  console.log(JSON.stringify(profile, null, 2));
}

main();
