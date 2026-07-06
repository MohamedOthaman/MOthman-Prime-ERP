#!/usr/bin/env node
/**
 * Build the bundled master-data seed (public/master-data-bundle.json) from the
 * cleaned Food Choice import CSVs in data/food_choice_import/.
 *
 * The bundle is the app's cold-start "business brain": on first launch (before
 * any network sync) it seeds the writable local store so product/customer/
 * salesman lookups work immediately and fully offline. It is a baseline, not a
 * source of truth — the first successful network refresh replaces seeded rows
 * with live rows (see src/offline/bundleSeed.ts).
 *
 * Usage: node scripts/build-master-bundle.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = resolve(root, "data/food_choice_import");
const outFile = resolve(root, "public/master-data-bundle.json");

/** Minimal RFC-4180-ish CSV parser (quoted fields, embedded commas/quotes/newlines). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  const [header, ...data] = rows;
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const read = (name) => parseCsv(readFileSync(resolve(srcDir, name), "utf8"));

const clean = (v) => (v === "" || v === "nan" || v == null ? null : v);
const num = (v) => {
  const c = clean(v);
  if (c == null) return null;
  const n = Number(c);
  return Number.isFinite(n) ? n : null;
};
const bool = (v) => String(v).toLowerCase() !== "false";

// ── Load sources ──────────────────────────────────────────────────────────────
const productsCsv = read("products_clean.csv");
const barcodesCsv = read("barcodes_clean.csv");
const pricesCsv = read("prices_clean.csv");
const customersCsv = read("customers_clean.csv");
const salesmenCsv = read("salesmen_clean.csv");

// ── Merge products + barcodes + prices by item_code ───────────────────────────
const barcodesByItem = new Map();
for (const b of barcodesCsv) {
  const code = clean(b.item_code);
  const barcode = clean(b.barcode);
  if (!code || !barcode) continue;
  const list = barcodesByItem.get(code) ?? [];
  list.push({ barcode, is_primary: bool(b.is_primary) });
  barcodesByItem.set(code, list);
}

const priceByItem = new Map();
for (const p of pricesCsv) {
  const code = clean(p.item_code);
  if (!code) continue;
  priceByItem.set(code, {
    cost_price: num(p.cost_price),
    selling_price: num(p.selling_price),
    discount: num(p.discount),
  });
}

// Row shape mirrors what the network bootstrap writes into the local
// `products` table (bootstrapCache select on products_overview), so consumers
// cannot tell seed rows from synced rows except by the `bundle:` id prefix.
const products = productsCsv
  .filter((p) => clean(p.item_code))
  .map((p) => {
    const itemCode = p.item_code.trim();
    const barcodes = barcodesByItem.get(itemCode) ?? [];
    const primary = barcodes.find((b) => b.is_primary) ?? barcodes[0] ?? null;
    const price = priceByItem.get(itemCode) ?? {};
    return {
      id: `bundle:${itemCode}`,
      item_code: itemCode,
      code: itemCode,
      name: clean(p.name_en),
      name_en: clean(p.name_en),
      name_ar: clean(p.name_ar),
      brand: clean(p.brand),
      category: clean(p.category),
      uom: clean(p.uom),
      pack_size: clean(p.pack_size),
      packaging: clean(p.uom),
      storage_type: null,
      carton_holds: num(p.pack_size),
      primary_barcode: primary?.barcode ?? null,
      cost_price: price.cost_price ?? null,
      selling_price: price.selling_price ?? null,
      discount: price.discount ?? null,
      image_path: null,
      is_active: true,
      created_at: null,
      updated_at: null,
    };
  });

const customers = customersCsv
  .filter((c) => clean(c.customer_code))
  .map((c) => ({
    id: `bundle:${c.customer_code.trim()}`,
    code: c.customer_code.trim(),
    name: clean(c.customer_name),
    name_ar: clean(c.customer_name_ar),
    salesman_id: null, // resolved against live ids after first sync
    is_active: bool(c.is_active),
  }));

const salesmen = salesmenCsv
  .filter((s) => clean(s.salesman_code))
  .map((s) => ({
    id: `bundle:${s.salesman_code.trim()}`,
    code: s.salesman_code.trim(),
    name: clean(s.salesman_name),
    name_ar: clean(s.salesman_name_ar),
    is_active: bool(s.is_active),
  }));

const brands = [...new Set(products.map((p) => p.brand).filter(Boolean))]
  .sort()
  .map((name) => ({ id: `bundle:${name}`, name }));

const bundle = {
  // Bump when the bundle format or source data changes meaningfully.
  version: 1,
  generatedAt: new Date().toISOString(),
  counts: {
    products: products.length,
    customers: customers.length,
    salesmen: salesmen.length,
    brands: brands.length,
  },
  products,
  customers,
  salesmen,
  brands,
};

writeFileSync(outFile, JSON.stringify(bundle));
console.log(
  `master-data-bundle.json written: ${products.length} products, ` +
    `${customers.length} customers, ${salesmen.length} salesmen, ${brands.length} brands ` +
    `(${(JSON.stringify(bundle).length / 1024).toFixed(0)} KB)`
);
