# Migration Notes — Food Choice ERP

> Status: stabilization / deployment-readiness pass (PR #7).
> This is the **migration risk register**. Read it before applying anything to a
> production Supabase project. It is intentionally honest about what is safe,
> what is not yet applied, and what pre-existing problems must be handled by a
> human in a maintenance window.

## 1. Migration history vs. repo

The live database migration history (from `list_migrations`, project
`koxtzeymsujzlqrpsims`) ends at:

```
20260526102843_ai_extraction_pipeline
```

> Note: the live migration table records a different timestamp/subset than the
> repo's `supabase/migrations/` filenames (the live history was squashed/renamed
> during earlier phases). The repo is the source of truth for *new* migrations
> going forward; reconcile names with the team before bulk re-applying old files.

The following migrations exist **in the repo only** and have **not** been applied
to the live database yet (confirmed: their objects are absent from the live
advisor output):

| File | Phase | What it does | Risk |
| ---- | ----- | ------------ | ---- |
| `20260529000000_p4_performance_indexes.sql` | P4 | pg_trgm GIN + composite indexes | Low (CREATE INDEX IF NOT EXISTS) |
| `20260529100000_p5_pgvector_embeddings.sql` | P5 | pgvector ext, `entity_embeddings`, `match_entities()`, `assistant_sessions` | Low–Medium (new ext + new tables) |

Both use `IF NOT EXISTS` / `CREATE OR REPLACE` patterns and create **only new**
objects — they do not alter or drop existing tables, so they are additive and
reversible (see `docs/ROLLBACK.md`).

## 2. How to apply (production)

Apply in timestamp order, P4 then P5:

1. **Back up first** — take a Supabase point-in-time snapshot (or `pg_dump`).
2. Apply `20260529000000_p4_performance_indexes.sql`.
   - On large tables, building GIN indexes can take time and hold locks. Prefer a
     low-traffic window. `apply_migration` wraps each migration in a transaction,
     which is fine for current table sizes; if a table grows very large, convert to
     `CREATE INDEX CONCURRENTLY` and run it outside a transaction.
3. Apply `20260529100000_p5_pgvector_embeddings.sql`.
   - Creates the `vector` extension in the `extensions` schema, two tables with
     RLS, an HNSW index, and the `match_entities()` function.
4. **Re-run the Supabase advisors** (security + performance) and confirm no **new**
   findings were introduced by P4/P5. See §5 for the known pre-existing baseline.

## 3. P5-specific safety notes (already addressed in the file)

These were hardened during stabilization — called out so a reviewer knows the
reasoning, not because action is required:

- **HNSW, not IVFFlat.** IVFFlat must be trained on a populated table; building it
  on an empty table yields a degenerate index. HNSW needs no training data and is
  safe to create up front.
- **RLS on both new tables.** `entity_embeddings` is derived data: authenticated
  staff may `SELECT` for search; there is **no** write policy, so inserts/updates
  are denied to anon and authenticated. Indexing must run with the **service role**
  from a trusted server/admin context — never from the browser. `assistant_sessions`
  is owner-scoped (`(SELECT auth.uid()) = user_id`).
- **`match_entities()`** uses `SECURITY INVOKER` and a pinned
  `search_path = public, extensions, pg_temp` to satisfy the
  `function_search_path_mutable` advisor and to respect the caller's RLS.
- **`(SELECT auth.uid())`** is used (not bare `auth.uid()`) to avoid the
  `auth_rls_initplan` per-row re-evaluation performance warning.

## 4. P5 is dormant by default

The P5 AI client code (`src/lib/ai/`) is **not wired into any UI**. Applying the
P5 migration creates the schema but does not change app behaviour. The client
calls Gemini directly from the browser (see `docs/SECURITY.md`); route through a
backend proxy before exposing P5 to users. CSP already allows
`generativelanguage.googleapis.com` for forward-readiness.

## 5. Pre-existing security baseline — HUMAN REVIEW REQUIRED

> These findings are **pre-existing** and unrelated to P0–P5. They are documented
> here so they are not mistaken for regressions and so they can be remediated
> deliberately. **Do not** blindly enable RLS on a live database — enabling RLS on
> a table with no policy makes it unreadable to all non-service roles and can lock
> out the app.

Numbers below are from the **live** Supabase advisors (`get_advisors`, project
`koxtzeymsujzlqrpsims`) run during this stabilization pass.
**Security: 18 ERROR + WARN/INFO findings. Performance: 0 ERROR, 35 WARN, 90 INFO.**
P4/P5 objects (`entity_embeddings`, `assistant_sessions`, `match_entities`, P4
indexes) were confirmed **absent** from the live advisor output — because they are
not applied yet, so none of these findings are attributable to this PR.

### 5.1 `rls_disabled_in_public` — ERROR ×6

Tables in `public` with **RLS fully disabled** (readable/writable by any holder of
a valid anon/authenticated key, subject only to grants — no row filtering):

`outbound_execution_lines`, `outbound_execution_sessions`,
`outbound_execution_allocations`, `outbound_scan_events`, `sales_returns`,
`sales_return_lines`

Related: `inventory_movements` is flagged `rls_enabled_no_policy` (INFO) — RLS is
**on** but it has **no policy**, so it is effectively unreadable to non-service
roles. Two of the RLS-disabled tables (`outbound_execution_lines`,
`outbound_scan_events`) are also flagged `sensitive_columns_exposed` (ERROR ×2).

> Enabling RLS without simultaneously adding correct policies will lock the table
> (as `inventory_movements` demonstrates) — which is exactly why this must be a
> deliberate, tested, per-table change, not a blanket toggle.

Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public

### 5.2 `security_definer_view` — ERROR ×10

Views in `public` that run with the **definer's** rights and bypass the querying
user's RLS. Each must be reviewed individually — some are intentional reporting
views, others should be `SECURITY INVOKER`:

`products_overview`, `receiving_headers`, `inventory_product_stock_summary`,
`v_stock_summary`, `product_master`, `receiving_lines`, `v_product_stock_balance`,
`sales_invoices`, `v_expiry_alerts`, `inventory_movements_log`

> ERROR total = 6 (`rls_disabled_in_public`) + 10 (`security_definer_view`) +
> 2 (`sensitive_columns_exposed`) = **18**.

Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view

### 5.3 Security WARN findings (not blocking, but review)

- `function_search_path_mutable` ×19 — functions without a pinned `search_path`
  (the P5 `match_entities()` already does this correctly). Includes
  `create_product_full`, `log_audit`, `approve_grn`, `reject_grn`,
  `advance_grn_status`, `handle_new_user`, `submit_qc_result`, `get_fefo_batches`,
  `fn_receiving_lines_insert/update/delete`, `generate_return_no`, and others.
- `anon_/authenticated_security_definer_function_executable` ×31 each — 28 SECURITY
  DEFINER functions executable by anon/authenticated roles (e.g. `post_sales_invoice`,
  `approve_grn`, `cancel_invoice`, `post_receiving_to_inventory`). Review whether
  each should be callable by those roles.
- `rls_policy_always_true` ×3 — `auto_match_feedback`, `customer_sku_mappings`,
  `ocr_documents` have a `USING (true)` policy (may be intentional for shared
  reference data — confirm).
- `auth_leaked_password_protection` ×1 — enable leaked-password protection in Auth
  settings.

### 5.4 Performance advisor — 0 ERROR, 35 WARN, 90 INFO

- `auth_rls_initplan` (WARN ×8) — policies re-evaluating `auth.<fn>()` per row on
  `audit_logs`, `profiles`, `sales_headers`, `sales_lines`, `inventory_batches`,
  `stock_movements`, `qc_inspections`. Fix by wrapping in `(SELECT auth.uid())`
  (the pattern P5 already uses for `assistant_sessions`).
- `multiple_permissive_policies` (WARN ×22) — `brands`, `product_barcodes`,
  `product_prices`, `products`, `sales_lines`, `salesmen` have overlapping permissive
  policies that could be consolidated.
- `duplicate_index` (WARN ×5) — notably `product_barcodes` (several pairs) and
  `salesmen`; safe to drop the redundant index in each pair.
- `unindexed_foreign_keys` (INFO ×39) — FKs without a covering index across 17
  tables. The P4 migration adds several of these.
- `unused_index` (INFO ×51) — **expected** for a pre-launch DB with little traffic;
  do **not** drop based on this until after real production use.

Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
· https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
· https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

### 5.5 Recommended remediation process (separate PR, not this one)

1. Re-run `get_advisors(type:"security")` for the current authoritative list.
2. For each RLS-disabled table: decide the access model (owner-scoped? role-scoped?
   read-only reference?), write the policy, and test with a non-admin role in a
   **branch DB** before touching production.
3. For each `SECURITY DEFINER` view: confirm intent or convert to `INVOKER`.
4. For the WARN functions: add `SET search_path = public, pg_temp` (low risk).
5. For `auth_rls_initplan`: rewrite policies to use `(SELECT auth.uid())`.
6. Apply during a maintenance window with a rollback snapshot ready.

## 6. Verification after migration

- `list_migrations` shows the P4 and P5 timestamps as applied.
- `GET /health` on the extraction service is unaffected (it does not touch these tables).
- The app still loads and a normal user can read the tables they could read before
  (no new lock-outs introduced).
- `get_advisors` shows no **new** ERROR/WARN findings attributable to P4/P5.
