# Food Choice ERP — Stabilization Report

Program to take the project to a production-ready, local-first ERP. Every
slice was verified (typecheck / tests / lint / build) and pushed to
`main` on `MohamedOthaman/MOthman-Prime-ERP`.

## Shipped slices (all on `main`)

| # | Commit | What |
|---|---|---|
| 1 | `2aaa82d` | Schema truth: types regenerated from live-reconstructed schema; typecheck made real (was checking nothing) and green; 183 `as any` casts removed |
| 2 | `a9e85dc` | Master diagnosis + local-first architecture decision records |
| 3 | `a072baf` | Phantom-column runtime-400 fixes (batch pages, GRN QC) |
| 4 | `6e60d00` | Legacy table paths removed — canonical reads/writes only; `useStock` rewritten; legacy `InvoiceScan`/`PdfImportSection` deleted |
| 5 | `cf22126` | Local-first product overview: local-store-first paint, virtualized, auth unblocked, lazy export libs |
| 6 | `5bdf20b` | **Live alignment** (project restored): types generated from production; every read/write reconciled to the real schema; verified against live PostgREST |
| 7 | `0d0f09e` | **B2** living master data: bundle seed (3,074 products / 3,504 customers / 77 salesmen), outbox-backed product edits, global sync-status UI |
| 8 | `0d5cd77` | **C2** product images: thumbnails, client-side compression, offline-safe upload; reviewed storage-bucket migration |
| 9 | `44fbb29` | **D1** SKU learning upserts fixed (expression-index mismatch) and review-gated |
| 10 | `0c9bad0` | **D2** multi-page quotation parser + extraction-service truncation fixed |
| 11 | `c53fbb9`, `e38e722` | **D3** bilingual Arabic/English fuzzy matching with Arabic folding |
| 12 | `a69ef81` | **E** inventory correctness: live-verified lifecycle, FEFO via live RPC, batch revisions, adjustments; reviewed reconciliation + adjustment migrations |
| 13 | `7fa3b8f` | **F+G** reports bounded/canonical; fresh advisors; G1–G4 reviewed security migrations |

## Local-first architecture (delivered)

- **Bundled business brain**: `npm run bundle:master-data` packages the
  cleaned CSVs into `public/master-data-bundle.json`. On first launch an
  empty local store is seeded from it — product/customer/salesman lookups
  work with no network. Full network snapshots retire seed rows (clear +
  replace) so the mirror never carries stale/deleted rows.
- **Instant reads**: product overview paints from the local mirror first,
  refreshes in the background, and shows an offline indicator when the cloud
  is unreachable. Virtualized list; auth no longer blocks routes on a network
  profile fetch.
- **Safe writes**: product edits are local-first — the mirror updates
  immediately, the remote write is attempted inline, and on failure the edit
  is queued in the outbox and replayed by the sync worker (replay-safe:
  create→update on existing item_code). Sync state is always visible.
- **Stock is movement-based**: quantities are never overwritten. Batch
  metadata edits are audited; quantity changes go through GRN posting,
  invoice done, returns, or the new adjustment RPC.

## Inventory correctness (Phase E — live-verified)

Confirmed against live function bodies (2026-07-07): invoice stock was
deducted **twice** (at posting AND at picking-done) while the non-picking
done path deducted nothing, and cancellation never restored stock. **No
historical damage** — zero invoices had ever been posted/picked/cancelled.
The reviewed reconciliation migration converges on deduction *exactly once*
at ready→done with guards that are safe under any deployed drift variant.
See `docs/INVENTORY_CORRECTNESS.md`; live bodies snapshotted for rollback in
`docs/rollback/`.

## Verification (final, 2026-07-07)

- `npm run typecheck` — **0 errors** (now checks app + node projects; was a
  no-op before).
- `npm run test` — **71 passing** (added: 3 multi-page parser, 9 bilingual
  matcher).
- `npm run lint` — clean.
- `npm run build` — succeeds; production build served and smoke-tested
  (index 200, SPA routes 200, bundle asset 200).
- No app source imports the heavy export/PDF libraries on the render-blocking
  path (dependency-traced).

## Migrations prepared but NOT applied (need explicit approval)

All are reviewed, additive/reversible, one concern each. Recommended order:

1. `20260707100000_invoice_lifecycle_stock_reconciliation.sql` — deduct-once
   + cancel restoration (rollback: `docs/rollback/20260707100000_pre_apply_snapshot.sql`).
2. `20260707110000_stock_adjustment_rpc.sql` — `record_stock_adjustment`.
3. `20260706120000_storage_buckets.sql` — `product-images` (public) +
   `documents` (private) buckets. Required before product-image upload works.
4. Security G1→G4 (apply one at a time, re-run advisor between):
   - `20260707120000_g1_rls_select_policies.sql`
   - `20260707130000_g2_revoke_anon_definer_rpcs.sql`
   - `20260707140000_g3_pin_function_search_path.sql`
   - `20260707150000_g4_duplicate_index_cleanup.sql`

## Known remaining (non-blocking)

- **Advisor deferrals** (documented in `docs/SECURITY.md`):
  `auth_rls_initplan` ×8 and `multiple_permissive_policies` ×22 want a
  per-policy rewrite pass; `rls_policy_always_true` ×4 accepted for
  staff-shared reference tables; leaked-password protection is a dashboard
  toggle; `unused_index` ×104 left until real traffic exists.
- **AI structuring** of uploaded quotations remains intentionally disabled;
  the local rule-based parser + bilingual matcher is the active path.
- **Extraction service** (`services/extraction-service`) is a localhost
  helper started manually — deploying it is a separate ops task.
- Minor: a Rollup chunk-grouping artifact preloads the pdf/excel vendor
  chunks via a single interop symbol; non-blocking, no source-level eager
  import of those libs remains.
