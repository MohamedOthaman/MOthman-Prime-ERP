# Food Choice ERP — Master Diagnosis (2026-07-03)

Status snapshot at the start of the stabilization program. Each finding lists
evidence; strike items through as phases land.

## 0. The backend is unreachable — and that proves the local-first requirement

- The Supabase project `koxtzeymsujzlqrpsims` ("WMS/ERP System") is **INACTIVE
  (paused)**. Its DNS (`koxtzeymsujzlqrpsims.supabase.co`) returns NXDOMAIN, so
  every screen that needs the network hangs or dies.
- The project is NOT deleted — restore it from the Supabase dashboard
  (one click) or approve the `restore_project` MCP call. All data survives a
  pause.
- Consequence today: the app cannot even reach the login screen's profile
  fetch. There are two offline cache layers (react-query persister +
  IndexedDB bootstrap mirror) and **neither feeds a single page**.

## 1. Schema truth (Phase A — DONE, commit 2aaa82d)

- `src/integrations/supabase/types.ts` declared only 9 legacy tables (0 views,
  0 RPCs); all real access went through `as any` (183 `.from/.rpc` casts).
- The migration chain cannot rebuild the DB from scratch: base tables are
  created only by `20260329005000_baseline_out_of_band_tables.sql`, which is
  timestamped AFTER migrations that reference those tables. Shadow-DB apply
  order: the 3 initial auth migrations → baseline → the rest (skip P5
  pgvector: extension unavailable, migration unapplied live).
- Live-only objects reconstructed from docs/SUPABASE_AUDIT.md + code usage:
  `qc_inspections`, `stock_movements.created_by`,
  `outbound_execution_allocations.{created_by,inventory_movement_id,invoice_line_id}`,
  `v_product_stock_balance`, `get_product_available_qty`, several FKs,
  `products.brand_id/code` relaxed to nullable (evidence: the food-choice
  import RPC inserts without them and ran successfully live).
- Column-name drift: repo `outbound_execution_allocations.movement_id` vs live
  `inventory_movement_id`. Reconcile against real live catalogs after restore.
- Types are now generated from the shadow DB via `@supabase/postgres-meta`
  (no Docker needed). Toolchain lives in `C:\Users\Lenovo\erp-shadow-db\`
  (apply.mjs / server.mjs / reconcile-live*.sql / check-fk-cols.mjs).
- `npm run typecheck` was `tsc --noEmit` against a root tsconfig with
  `files: []` — it checked **nothing** while CI reported green. Fixed.

## 2. Product overview is slow — root causes (Phase C)

Route-mount waterfall for /products (all confirmed in code):

1. `DatabaseProvider` (App.tsx:741) blocks the whole tree behind a spinner
   until IndexedDB/Dexie opens and local migrations run.
2. `ProtectedRoutes` blocks until `useAuth` finishes a **network** profiles
   fetch (useAuth.tsx:81-91) — with the cloud down this never resolves.
3. `exportUtils.ts` statically imports exceljs + jspdf + jspdf-autotable, and
   ProductsPage/Index import it eagerly — the vendor-excel/pdf chunks load
   before first paint (vite manualChunks claims lazy; the import graph isn't).
4. Three concurrent full-catalog downloads on a cold /products visit:
   ProductsPage's own `getInventoryProductCatalog()` (sequential 1000-row
   pages of products_overview), the globally mounted `StockProvider`
   (`useStock.loadData` → full inventory snapshot), and `bootstrapCache`
   (products_overview again, into IndexedDB that no page ever reads).
5. `useStock.loadData` also fetches legacy `invoices`, `invoice_items`
   (unbounded `select *`), `movements`, `market_returns`, `return_items` —
   tables that DO NOT EXIST live (fail every session).
6. ProductsPage blocks all rendering on the full download, renders every row
   unvirtualized (nested `<button>` inside `<button>` — invalid HTML), and
   re-filters ~10 fields per row per keystroke. `VirtualList` +
   @tanstack/react-virtual exist in the repo and are unused.
7. The react-query IndexedDB persister whitelists "products" query keys, but
   product pages don't use react-query — the persistence layer persists
   nothing useful.

## 3. Quotation → invoice auto-fill (Phase D)

What works: InvoiceEntryPage's Upload button → local Python extraction
service (127.0.0.1:8000, `services/extraction-service`, started manually) →
raw text → `parsePOLocalText` → exact barcode/item-code match → customer SKU
alias → fuzzy name match → editable lines → save to sales_headers/lines →
`post_sales_invoice` RPC. AI structuring is deliberately disabled at every
layer (edge function returns 503, service raises 503, pdfParser returns
empty).

Broken/weak (evidence in each file):

- **Learning loop silently dead**: `customer_sku_mappings` /
  `auto_match_feedback` upserts use `onConflict: "customer_id,external_name"`
  but the unique indexes are expression-based (`lower(external_name)`), so
  every upsert fails 42P10 and is swallowed. Fix index or normalize + plain
  columns; route through a SECURITY DEFINER RPC like
  `upsert_supplier_sku_mapping`.
- Mappings are persisted BEFORE human review (poisoning risk) and corrections
  are never written back; `auto_match_feedback` is write-only (never read at
  match time).
- Extraction service truncates raw text to 4,000 chars (main.py:910) — long
  multi-page quotations silently lose tail rows.
- `poLocalParser.parseItemRows` breaks at the FIRST footer-like line — a
  page-1 subtotal discards all later items; qty detection mistakes numeric
  codes for quantities.
- Fuzzy matching only compares the display name in the CURRENT UI language —
  Arabic quotations in an English UI never match name_ar; no Arabic
  orthography folding in the matcher (folding exists in invoiceValidation).
- Upload Center's PDF path is a dead end (extractor always returns 0 rows);
  Excel path casts raw sheet rows to ParsedInvoice[] and crashes on confirm.
- ~150-line match/inject logic exists in triplicate in InvoiceEntryPage with
  divergent behavior (nav-state copy skips validation).
- `check_duplicate_invoice` RPC + supplier_sku_mappings exist and are never
  called. pgvector embeddings infra is fully dormant.
- `ocr_documents` has no RLS; the `documents` storage bucket referenced by
  upload code doesn't exist in any migration.

## 4. Legacy table paths still alive (Phase A2)

- `useStock.ts` (mounted globally via StockProvider) reads/writes legacy
  `invoices`, `invoice_items`, `batches`, `movements`, `market_returns`,
  `return_items` — none exist live. Consumers: Index (home), InvoiceScan,
  ImportExport, ProductManagement, UploadCenter, PdfImportSection,
  MovingBadge.
- `InvoiceScan.tsx` is a parallel legacy invoice flow with client-side FIFO
  deduction, inconsistent with the canonical `post_sales_invoice` path.
- Batch pages (ProductTracePage, BatchTracePage, FridgeStoragePage) select
  `batch_number`/`grn_id`/`storage_type`/`putaway_location_ref`/`status` from
  `inventory_batches` — the real columns are `batch_no`, `receiving_line_id`,
  `location_ref` (and no status/storage_type). Runtime-broken today.

## 5. Security baseline (Phase G — needs the restored project)

Live advisors (2026-06-04): 18 SECURITY ERRORs (10 SECURITY DEFINER views,
6 tables with RLS disabled, 2 exposed sensitive columns), 85 WARNs (31 anon-
executable SECURITY DEFINER functions incl. post_sales_invoice/cancel_invoice,
19 mutable search_path, …). Full remediation plan already written in
docs/SUPABASE_AUDIT.md Phases 2–5 — apply after restore, one table at a time,
on a dump-seeded clone first.

## 6. Roadmap (owned by the current stabilization program)

- **A. Schema truth + typecheck green — DONE (2aaa82d)**
- **A2. Kill legacy paths**: rewrite useStock internals onto canonical
  tables/views (keep its consumer API), delete InvoiceScan + PdfImportSection,
  fix the 3 batch pages' column names, drop legacy tables from types.
- **B. Living local master data** (see LOCAL_FIRST_ARCHITECTURE.md): mutable
  Dexie/SQLite master store seeded from a bundled snapshot, all master-data
  writes go local-first + outbox, background push/pull sync with Supabase.
- **C. Product/stock overview <1s**: local-first reads (useLiveQuery),
  virtualization, lazy export libs, non-blocking auth/database gates, kill
  duplicate downloads. C2: product images (products.image_path exists) with
  local thumbnails + Supabase Storage sync.
- **D. Quotation auto-fill**: fix learning upserts + review-time persistence,
  bilingual + folded fuzzy matching against the LOCAL master store, wire
  supplier_sku_mappings + auto_match_feedback + check_duplicate_invoice into
  the match priority chain, fix parser footer/truncation bugs, repair or
  retire Upload Center's dead paths.
- **E. Inventory/GRN/batches**: movement-based quantities only, batch metadata
  edits with revision audit, FEFO preview correctness, GRN post-exactly-once
  verification, returns.
- **F. Reports/dashboards** on canonical views; server-side aggregation.
- **G. Security hardening** per SUPABASE_AUDIT.md (after restore).
- **H. Verification + docs + release readiness.**
