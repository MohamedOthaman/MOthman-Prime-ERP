# Food Choice ERP — Local-First Architecture

Decision record. The product direction: daily operations must work with no
internet, no Supabase, no DNS. Supabase is the cloud replica / backup / remote
access / sync hub — never a per-page-load dependency.

## Layered model

```
┌───────────────────────────────────────────────────────────────┐
│ UI (React pages)                                              │
│   reads: local repositories (instant, sync/async local)       │
│   writes: local repositories → outbox                         │
├───────────────────────────────────────────────────────────────┤
│ Data access layer (src/data/…)                                │
│   MasterDataRepository  (products, barcodes, prices,          │
│     customers, suppliers, salesmen, sku-mappings, aliases,    │
│     settings, image metadata)                                 │
│   OperationalRepository (invoices, GRNs, batches, movements)  │
│   read-through: local store first; cloud refresh in bg        │
├───────────────────────────────────────────────────────────────┤
│ Local store (living data — NOT a cache)                       │
│   Web/Capacitor: Dexie (IndexedDB) — src/database/IndexedDB…  │
│   Tauri desktop: SQLite via tauri-plugin-sql                  │
│   + outbox table (change log)  + meta table (watermarks)      │
│   + revisions table (audited edits, e.g. batch metadata)      │
├───────────────────────────────────────────────────────────────┤
│ Sync engine (src/sync/…)                                      │
│   push: outbox → Supabase (retry, idempotency keys)           │
│   pull: watermark deltas ← Supabase (updated_at > last)       │
│   status: local-saved / pending / synced / failed / conflict  │
├───────────────────────────────────────────────────────────────┤
│ Supabase (when reachable)                                     │
│   canonical cloud replica, auth, RPCs for stock posting,      │
│   storage for full-size images, AI/extraction metadata        │
└───────────────────────────────────────────────────────────────┘
```

## Key decisions

1. **Bundled master data = first-launch seed, then living local store.**
   `data/food_choice_import/*.csv` (products, barcodes, prices, customers,
   salesmen, opening stock) is packaged into a versioned JSON bundle at build
   time. On first launch it is imported into the writable local store, then
   NEVER treated as read-only again: every master-data edit updates the local
   store immediately + writes an outbox event. A bundle upgrade merges only
   rows the user has not modified locally (per-row `updated_locally_at` wins).

2. **Master data is offline-writable; stock quantity is not directly
   writable anywhere.** Products/customers/suppliers/salesmen/barcodes/
   prices/aliases/mappings/images/batch METADATA: local-first with outbox +
   revision history, last-write-wins per field is acceptable except stock.
   Batch/stock QUANTITIES only change through movements posted by trusted
   services (post_receiving_to_inventory, post_sales_invoice, returns,
   adjustment RPCs). Offline invoice/GRN drafts queue; POSTING requires the
   stock authority.

3. **Stock authority.** Single-site LAN reality: one authority owns
   allocation. Today that authority is Supabase's SECURITY DEFINER RPCs.
   The architecture reserves a swappable `StockAuthority` interface so a
   local server (main PC, e.g. embedded Postgres or the Tauri app acting as
   LAN host) can replace/augment it later without touching the UI. Offline:
   drafts are always allowed; posting is queued with explicit "pending
   posting" status and never fakes success.

4. **Sync engine.** The existing outbox/sync-worker skeleton (src/sync) is
   sound and stays; it gains: pull-deltas via `updated_at` watermarks (the
   bootstrapCache pattern generalized), per-record sync status surfaced in
   UI, idempotency keys on push, and conflict records (never silent
   overwrite of a locally-edited row by a pull).

5. **Product images.** `products.image_path` (already live) stores the cloud
   object key in the `product-images` Supabase Storage bucket. Locally we
   store: original file (Tauri appData dir / IndexedDB blob), and a ~96px
   WebP thumbnail generated at attach time, keyed by content hash. List
   views render ONLY thumbnails (lazy, content-hash cache key, gray package
   placeholder when absent); detail views load the large image on demand.
   Image sync = upload original in background outbox job; other devices pull
   thumbnail on first view then cache locally. Images must never block list
   rendering.

6. **First paint discipline.** Nothing on a route's critical path may await:
   full-table downloads, cache bootstrap, auth *network* round-trips (session
   from storage is enough to render; profile loads in background), or heavy
   export libraries (dynamic import on click). Product overview renders from
   the local store immediately (even stale), refreshes in background.

## Migration path (implementation order)

1. Extend the local schema (src/database/schema.ts): full product master
   columns + images meta + sku mappings + aliases + batches mirror +
   revisions + sync status on outbox rows.
2. Build the bundle generator script + first-launch importer.
3. Repository layer + `useLiveQuery` hooks; switch ProductsPage, stock
   overview, and all lookups (customer/supplier/salesman/barcode) to it.
4. Master-data writes (ProductDialog, customers, suppliers, salesmen) →
   local + outbox; sync worker pushes when online.
5. Batch metadata edit UI + revisions; quantities stay movement-based.
6. Sync status UI (per-record chip + global indicator).
