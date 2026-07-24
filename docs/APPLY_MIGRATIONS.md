# Apply Runbook — reviewed migrations awaiting production

Eight migrations are reviewed and committed but **not yet applied** to
production (`koxtzeymsujzlqrpsims`). They cannot be applied from the automated
agent session (no service credential / MCP connector there). Anyone with DB
access can apply them in minutes.

## How to apply (two options)

**Option A — Supabase dashboard (simplest).** Open the project → SQL Editor →
paste the file's contents → Run. Then run its verification query below.

**Option B — Supabase CLI (needs the DB password once):**
```
supabase link --project-ref koxtzeymsujzlqrpsims     # prompts for DB password
supabase db push                                     # applies all pending files in order
```
`db push` applies them in filename (timestamp) order, which is the correct
order below.

Apply **one at a time**, run its verification, confirm ✓ before the next.
Every migration is idempotent; re-running is safe.

---

## Priority 1 — fixes the owner's product-save bug (additive, low risk)

### 1. `20260710120000_upsert_product_master.sql`
One atomic RPC for product create/edit (product + price + barcodes + metadata
+ image) with an explicit role check. Removes the partial-save class of bugs.
Compiled against live in a rolled-back transaction — no schema surprises.
Verify:
```sql
SELECT proname FROM pg_proc WHERE proname = 'upsert_product_master';  -- expect 1 row
```

### 2. `20260706120000_storage_buckets.sql`
Creates the `product-images` (public read) and `documents` (private) buckets
so product image upload works end-to-end.
Verify:
```sql
SELECT id, public FROM storage.buckets WHERE id IN ('product-images','documents');  -- expect 2 rows
```

After 1 + 2: image upload and atomic save work. Re-save the half-configured
test product `11111111111` once to complete it (or discard it).

---

## Priority 2 — security hardening (mostly additive; one REVOKE)

### 3. `20260707130000_g2_revoke_anon_definer_rpcs.sql`
Revokes anonymous EXECUTE on ~30 SECURITY DEFINER business functions
(post_sales_invoice, cancel_invoice, approve_grn, create_product_full, …).
These are the same permission-less definer functions the product bug exposed.
`authenticated` keeps access. Reversible (GRANT … TO anon).
Verify (expect **0** rows — no anon EXECUTE left on mutating RPCs):
```sql
SELECT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
  AND p.proname IN ('post_sales_invoice','cancel_invoice','approve_grn','create_product_full',
                    'post_receiving_to_inventory','post_sales_return','mark_invoice_done');
```

### 4. `20260707120000_g1_rls_select_policies.sql`
Adds authenticated SELECT policies to 7 operational tables that have RLS
enabled with **zero policies** (they return no rows today: inventory_movements,
sales_returns, outbound_execution_*, …). Additive.
Verify (expect 7):
```sql
SELECT count(*) FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('inventory_movements','outbound_execution_allocations','outbound_execution_lines',
                    'outbound_execution_sessions','outbound_scan_events','sales_returns','sales_return_lines')
  AND cmd='SELECT';
```

### 5. `20260707140000_g3_pin_function_search_path.sql`
Pins `search_path=public` on functions flagged `function_search_path_mutable`.
Logic-preserving. Verify (expect 0 unpinned among the targeted set — re-run the
security advisor to confirm the warning count drops).

---

## Priority 3 — inventory correctness (REPLACES functions — keep rollback ready)

### 6. `20260707100000_invoice_lifecycle_stock_reconciliation.sql`
Converges invoice stock deduction to **exactly once** at ready→done and makes
cancel restore stock. **This REPLACES live function bodies.** Before applying,
have the rollback snapshot open:
`docs/rollback/20260707100000_pre_apply_snapshot.sql` (verbatim pre-apply
bodies). Safe now — live has **zero** posted/picked/cancelled invoices, so no
data migration is needed. Verify:
```sql
SELECT proname FROM pg_proc WHERE proname IN ('deduct_invoice_stock','invoice_stock_deducted');  -- expect 2
```

### 7. `20260707110000_stock_adjustment_rpc.sql`
Adds `record_stock_adjustment` (movement-backed manual corrections; the batch
page already calls it). Additive. Verify:
```sql
SELECT proname FROM pg_proc WHERE proname='record_stock_adjustment';  -- expect 1
```

---

## Priority 4 — performance cleanup (only when confident)

### 8. `20260707150000_g4_duplicate_index_cleanup.sql`
Drops redundant duplicate indexes flagged by the performance advisor. Verify
by re-running the advisor (`duplicate_index` count → 0).

---

## After applying

1. Re-run Supabase **security + performance advisors** and confirm the
   targeted findings dropped (RLS-no-policy 7→0, anon-definer count down,
   mutable-search_path down, duplicate_index → 0).
2. Regenerate types from live and drop the two `(supabase.rpc as any)` casts
   for `upsert_product_master` / `record_stock_adjustment`.
3. Run the 10-step product/image/sync check (create/edit/offline/replay/
   restart) and confirm no duplicates and that a permission/validation failure
   shows the real reason in the Sync Log.
