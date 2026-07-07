# Release Notes — Food Choice ERP Stabilization

## Highlights

### Local-first operation
The app now installs with Food Choice's master data inside it and keeps it
alive locally. Product, customer and salesman lookups, product overview and
stock overview all work with no internet. Edits save locally first and sync
to Supabase in the background; a status pill shows offline / pending /
syncing / synced / failed. Cloud outages no longer block daily work or lose
edits.

### Faster product overview
Opens from the local store immediately (no waiting on a full download or a
network login), renders a virtualized list, and loads export libraries only
when you export.

### Product images
Add / replace / remove a product photo. Images are compressed before upload,
shown as lazy thumbnails beside each product, and never slow the list. (Needs
the storage-bucket migration applied — see below.)

### Better quotation → invoice auto-fill
- Multi-page quotations no longer lose their later line items.
- Product matching works in Arabic and English at the same time, with Arabic
  spelling variants folded (أ/إ/آ, ة/ه, …).
- The "learn from my corrections" feature actually persists now, and only
  after you've reviewed the lines.

### Inventory correctness
Stock is strictly movement-based. A reviewed fix makes invoice stock deduct
exactly once and restores stock on cancellation. New audited batch-metadata
edits and a controlled stock-adjustment tool (both never overwrite quantity
directly).

### Security
Fresh Supabase advisors reviewed; reviewed, one-at-a-time migrations prepared
to close RLS gaps, revoke anonymous access to mutating functions, pin
function search paths, and drop duplicate indexes.

## Action required by an operator

Apply these reviewed migrations (in order) from the Supabase dashboard/CLI —
they are NOT auto-applied. Each is additive and reversible:

1. `20260707100000_invoice_lifecycle_stock_reconciliation.sql`
2. `20260707110000_stock_adjustment_rpc.sql`
3. `20260706120000_storage_buckets.sql` (enables product-image upload)
4. `20260707120000_g1_rls_select_policies.sql`
5. `20260707130000_g2_revoke_anon_definer_rpcs.sql`
6. `20260707140000_g3_pin_function_search_path.sql`
7. `20260707150000_g4_duplicate_index_cleanup.sql`

Also: enable leaked-password protection in Supabase Auth settings (dashboard
toggle). Full detail and rollback in `docs/STABILIZATION_REPORT.md`,
`docs/INVENTORY_CORRECTNESS.md`, and `docs/SECURITY.md`.

## Verified
typecheck 0 errors · 71 tests passing · lint clean · production build OK.
