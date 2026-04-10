import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { readUtf8Csv } from "./lib/readUtf8Csv.mjs";

const OUTPUT_DIR = path.resolve("data", "food_choice_import");

function readEnvFile() {
  const envPath = path.resolve(".env");
  const env = {};
  if (!fs.existsSync(envPath)) return env;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    env[key] = value;
  }

  return env;
}

function readCsv(filePath) {
  return readUtf8Csv(filePath);
}

function writeCsv(filePath, rows, columns) {
  const escape = (value) => {
    const text = value == null ? "" : String(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
    return text;
  };

  const content = [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => escape(row[column])).join(",")),
  ].join("\n");

  fs.writeFileSync(filePath, `${content}\n`, "utf8");
}

function toText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeCode(value) {
  return toText(value).toUpperCase();
}

function normalizeBarcode(value) {
  return toText(value).replace(/^'+/, "").replace(/\s+/g, "");
}

function toNumber(value) {
  const text = toText(value).replace(/,/g, "");
  if (!text) return 0;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBoolean(value) {
  return String(value).trim().toLowerCase() === "true";
}

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function dedupeRows(rows, keyFn, datasetName) {
  const deduped = [];
  const seen = new Set();
  const duplicateCounts = new Map();

  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;

    if (seen.has(key)) {
      duplicateCounts.set(key, (duplicateCounts.get(key) ?? 1) + 1);
      continue;
    }

    seen.add(key);
    deduped.push(row);
  }

  return {
    dataset: datasetName,
    rows: deduped,
    droppedCount: rows.length - deduped.length,
    sample: Array.from(duplicateCounts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 10)
      .map(([key, count]) => ({ key, count })),
  };
}

function normalizeOpeningQuantity(row, product) {
  const quantity = toNumber(row.quantity);
  const unit = toText(row.uom).toUpperCase() || "CTN";
  const packSize = toNumber(product?.carton_holds ?? product?.pack_size);
  const isFractional = quantity != null && Math.abs(quantity - Math.trunc(quantity)) > 0.0001;

  if (quantity == null) {
    return { quantity: 0, uom: unit };
  }

  if (unit === "CTN" && isFractional && packSize && packSize > 0) {
    return {
      quantity: Number((quantity * packSize).toFixed(3)),
      uom: "PCS",
    };
  }

  return {
    quantity: Number(quantity.toFixed(3)),
    uom: unit,
  };
}

function aggregateStockRows(rows, productsByItemCode) {
  const grouped = new Map();

  for (const row of rows) {
    const itemCode = normalizeCode(row.item_code);
    const normalized = normalizeOpeningQuantity(row, productsByItemCode.get(itemCode));
    const key = [itemCode, toText(row.batch_no), toText(row.expiry_date), normalized.uom].join("|");
    if (!key || key.startsWith("||")) continue;

    if (!grouped.has(key)) {
      grouped.set(key, {
        item_code: itemCode,
        batch_no: toText(row.batch_no),
        expiry_date: toText(row.expiry_date),
        quantity: 0,
        uom: normalized.uom,
        warehouse: toText(row.warehouse) || "MAIN",
      });
    }

    grouped.get(key).quantity += normalized.quantity;
  }

  return Array.from(grouped.values()).map((row) => ({
    ...row,
    quantity: Number(row.quantity.toFixed(3)),
  }));
}

function buildReviewNeededFile(products, issuesReport) {
  const productMap = new Map(products.map((row) => [normalizeCode(row.item_code), row]));
  const reviewRows = (issuesReport.item_issues ?? []).map((item) => {
    const product = productMap.get(normalizeCode(item.item_code)) ?? {};
    return {
      item_code: normalizeCode(item.item_code),
      name_en: toText(product.name_en),
      name_ar: toText(product.name_ar),
      brand: toText(product.brand),
      category: toText(product.category),
      issue_count: item.issue_count ?? 0,
      issue_types: (item.issues ?? []).map((issue) => issue.type).join("|"),
      review_reason: toText(product.review_reason),
    };
  });

  const outputPath = path.join(OUTPUT_DIR, "review_needed.csv");
  writeCsv(outputPath, reviewRows, [
    "item_code",
    "name_en",
    "name_ar",
    "brand",
    "category",
    "issue_count",
    "issue_types",
    "review_reason",
  ]);

  return reviewRows;
}

function buildProductPayloads(products, barcodes, prices, reviewItemCodes) {
  const reviewSet = new Set(reviewItemCodes.map(normalizeCode));
  const rawProducts = products
    .filter((row) => !reviewSet.has(normalizeCode(row.item_code)))
    .map((row) => ({
      item_code: normalizeCode(row.item_code),
      internal_code: toText(row.internal_code),
      name_en: toText(row.name_en),
      name_ar: toText(row.name_ar),
      brand: toText(row.brand),
      category: toText(row.category),
      country: toText(row.country),
      uom: toText(row.uom),
      pack_size: toText(row.pack_size),
      image_path: "",
    }));

  const rawBarcodes = barcodes
    .filter((row) => !reviewSet.has(normalizeCode(row.item_code)))
    .map((row) => ({
      item_code: normalizeCode(row.item_code),
      barcode: normalizeBarcode(row.barcode),
      barcode_source: toText(row.barcode_source) || "food_choice_import",
      is_primary: toBoolean(row.is_primary),
    }))
    .filter((row) => row.barcode);

  const rawPrices = prices
    .filter((row) => !reviewSet.has(normalizeCode(row.item_code)))
    .map((row) => ({
      item_code: normalizeCode(row.item_code),
      cost_price: toNumber(row.cost_price),
      selling_price: toNumber(row.selling_price),
      discount: toNumber(row.discount),
      price_source: toText(row.price_source) || "food_choice_import",
    }));

  const productsDedupe = dedupeRows(rawProducts, (row) => row.item_code, "products");
  const barcodesDedupe = dedupeRows(rawBarcodes, (row) => row.barcode, "barcodes");
  const pricesDedupe = dedupeRows(rawPrices, (row) => row.item_code, "prices");

  return {
    cleanProducts: productsDedupe.rows,
    cleanBarcodes: barcodesDedupe.rows,
    cleanPrices: pricesDedupe.rows,
    duplicateDiagnostics: {
      products: productsDedupe,
      barcodes: barcodesDedupe,
      prices: pricesDedupe,
    },
  };
}

async function main() {
  ensureOutputDir();

  const env = readEnvFile();
  const execute = process.argv.includes("--execute");
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const salesmen = readCsv(path.join(OUTPUT_DIR, "salesmen_clean.csv"));
  const customers = readCsv(path.join(OUTPUT_DIR, "customers_clean.csv"));
  const stockBatches = readCsv(path.join(OUTPUT_DIR, "stock_batches_clean.csv"));
  const products = readCsv(path.join(OUTPUT_DIR, "products_clean.csv"));
  const barcodes = readCsv(path.join(OUTPUT_DIR, "barcodes_clean.csv"));
  const prices = readCsv(path.join(OUTPUT_DIR, "prices_clean.csv"));
  const issuesReport = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, "issues_report.json"), "utf8"));

  const reviewRows = buildReviewNeededFile(products, issuesReport);
  const reviewItemCodes = reviewRows.map((row) => normalizeCode(row.item_code));
  const productPayloads = buildProductPayloads(products, barcodes, prices, reviewItemCodes);

  const salesmenDedupe = dedupeRows(
    salesmen.map((row) => ({
      salesman_code: normalizeCode(row.salesman_code),
      salesman_name: toText(row.salesman_name),
      salesman_name_ar: toText(row.salesman_name_ar),
      phone: toText(row.phone),
      email: toText(row.email),
      is_active: toBoolean(row.is_active),
    })),
    (row) => row.salesman_code,
    "salesmen"
  );

  const customersDedupe = dedupeRows(
    customers.map((row) => ({
      customer_code: normalizeCode(row.customer_code),
      customer_name: toText(row.customer_name),
      customer_name_ar: toText(row.customer_name_ar),
      salesman_code: normalizeCode(row.salesman_code),
      type: toText(row.type),
      group_name: toText(row.group_name),
      category: toText(row.category),
      area: toText(row.area),
      phone: toText(row.phone),
      credit_days: toNumber(row.credit_days),
      credit_limit: toNumber(row.credit_limit),
      notes: toText(row.notes),
      is_active: toBoolean(row.is_active),
    })),
    (row) => row.customer_code,
    "customers"
  );

  const productsByItemCode = new Map(products.map((row) => [normalizeCode(row.item_code), row]));
  const cleanStockPayload = aggregateStockRows(stockBatches, productsByItemCode);

  const summary = {
    dry_run: !execute,
    import_order: ["salesmen", "customers", "products", "opening_stock"],
    totals: {
      salesmen_to_import: salesmenDedupe.rows.length,
      customers_to_import: customersDedupe.rows.length,
      products_to_import: productPayloads.cleanProducts.length,
      barcodes_to_import: productPayloads.cleanBarcodes.length,
      prices_to_import: productPayloads.cleanPrices.length,
      opening_stock_batches_to_import: cleanStockPayload.length,
      duplicates_dropped_by_salesmen: salesmenDedupe.droppedCount,
      duplicates_dropped_by_customers: customersDedupe.droppedCount,
      duplicates_dropped_by_products: productPayloads.duplicateDiagnostics.products.droppedCount,
      duplicates_dropped_by_barcodes: productPayloads.duplicateDiagnostics.barcodes.droppedCount,
      duplicates_dropped_by_prices: productPayloads.duplicateDiagnostics.prices.droppedCount,
    },
    duplicate_samples: {
      salesmen: salesmenDedupe.sample,
      customers: customersDedupe.sample,
      products: productPayloads.duplicateDiagnostics.products.sample,
      barcodes: productPayloads.duplicateDiagnostics.barcodes.sample,
      prices: productPayloads.duplicateDiagnostics.prices.sample,
    },
  };

  if (!execute) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env");
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const salesmenResult = await supabase.rpc("import_food_choice_salesmen", {
    salesmen_payload: salesmenDedupe.rows,
  });
  if (salesmenResult.error) throw salesmenResult.error;

  const customersResult = await supabase.rpc("import_food_choice_customers", {
    customers_payload: customersDedupe.rows,
  });
  if (customersResult.error) throw customersResult.error;

  const productsResult = await supabase.rpc("import_food_choice_product_master", {
    products_payload: productPayloads.cleanProducts,
    barcodes_payload: productPayloads.cleanBarcodes,
    prices_payload: productPayloads.cleanPrices,
    review_item_codes: reviewItemCodes,
  });
  if (productsResult.error) throw productsResult.error;

  const openingStockResult = await supabase.rpc("import_food_choice_opening_stock", {
    opening_stock_payload: cleanStockPayload,
  });
  if (openingStockResult.error) throw openingStockResult.error;

  console.log(
    JSON.stringify(
      {
        ...summary,
        import_result: {
          salesmen: salesmenResult.data,
          customers: customersResult.data,
          products: productsResult.data,
          opening_stock: openingStockResult.data,
        },
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
