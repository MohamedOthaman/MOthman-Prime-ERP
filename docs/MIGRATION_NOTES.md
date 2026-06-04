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

## 5. Pre-existing advisor baseline — HUMAN REVIEW REQUIRED

> These findings are **pre-existing** and unrelated to P0–P5. They are documented
> here so they are not mistaken for regressions and so they can be remediated
> deliberately. **Do not** blindly enable RLS on a live database — enabling RLS on
> a table with no policy makes it unreadable to all non-service roles and can lock
> out the app.

**Provenance of the numbers below.** The figures are from the **live** Supabase
advisors (`get_advisors`, project `koxtzeymsujzlqrpsims`), captured **2026-05-30**.
The raw advisor JSON exceeds the MCP tool's result-size limit, so each pull was
saved to a file and parsed offline; the per-lint `categories` field is the source
of truth for the security/performance split and the counts below were produced by
counting that JSON, not estimated. **Re-run `get_advisors` before remediation** —
advisor snapshots can drift as the project changes.

| Category | ERROR | WARN | INFO | Total |
| -------- | ----- | ---- | ---- | ----- |
| **SECURITY** | 18 | 85 | 1 | **104** |
| **PERFORMANCE** | 0 | 35 | 90 | **125** |

P4/P5 objects (`entity_embeddings`, `assistant_sessions`, `match_entities`, P4
indexes) were confirmed **absent** from the advisor output — they are not applied
yet, so none of these findings are attributable to this PR.

### 5.1 `rls_disabled_in_public` — ERROR ×6  ✅ verified 2026-05-30

Tables in `public` with **RLS fully disabled** (readable/writable by any holder of
a valid anon/authenticated key, subject only to grants — no row filtering):

`outbound_execution_lines`, `outbound_execution_sessions`,
`outbound_execution_allocations`, `outbound_scan_events`, `sales_returns`,
`sales_return_lines`

Related: `inventory_movements` is flagged `rls_enabled_no_policy` (INFO ×1) — RLS is
**on** but it has **no policy**, so it is effectively unreadable to non-service
roles. Two of the RLS-disabled tables (`outbound_execution_lines`,
`outbound_scan_events`) are also flagged `sensitive_columns_exposed` (ERROR ×2).

> Enabling RLS without simultaneously adding correct policies will lock the table
> (as `inventory_movements` demonstrates) — which is exactly why this must be a
> deliberate, tested, per-table change, not a blanket toggle.

Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public

### 5.2 `security_definer_view` — ERROR ×10  ✅ verified 2026-05-30

Views in `public` that run with the **definer's** rights and bypass the querying
user's RLS. Each must be reviewed individually — some are intentional reporting
views, others should be `SECURITY INVOKER`:

`products_overview`, `receiving_headers`, `inventory_product_stock_summary`,
`v_stock_summary`, `product_master`, `receiving_lines`, `v_product_stock_balance`,
`sales_invoices`, `v_expiry_alerts`, `inventory_movements_log`

> **SECURITY ERROR total = 6 (`rls_disabled_in_public`) + 10 (`security_definer_view`)
> + 2 (`sensitive_columns_exposed`) = 18**, confirmed by parsing the saved advisor
> JSON on 2026-05-30.

Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view

### 5.3 Security WARN ×85 + INFO ×1  ✅ verified 2026-05-30

Exact counts from the parsed advisor JSON:

- `anon_security_definer_function_executable` **×31** and
  `authenticated_security_definer_function_executable` **×31** — 31 `SECURITY DEFINER`
  functions are executable by the `anon`/`authenticated` roles (e.g. `post_sales_invoice`,
  `approve_grn`, `cancel_invoice`, `post_receiving_to_inventory`). Review whether each
  should be callable by those roles.
- `function_search_path_mutable` **×19** — functions without a pinned `search_path`
  (the P5 `match_entities()` already does this correctly). Includes `advance_grn_status`,
  `approve_grn`, `create_product_full`, `fn_receiving_lines_insert/update/delete`,
  `generate_return_no`, `get_fefo_batches`, `handle_new_user`, `log_audit`,
  `reject_grn`, `submit_qc_result`, and others.
- `rls_policy_always_true` **×3** — `auto_match_feedback`, `customer_sku_mappings`,
  `ocr_documents` have a `USING (true)` policy (may be intentional for shared
  reference data — confirm).
- `auth_leaked_password_protection` **×1** (WARN) — enable leaked-password protection
  in the Supabase Auth settings.
- `rls_enabled_no_policy` **×1** (INFO) — `inventory_movements` (see §5.1).

(31 + 31 + 19 + 3 + 1 = 85 WARN; plus 1 INFO.)

Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

### 5.4 Performance advisor — 0 ERROR, 35 WARN, 90 INFO  ✅ verified 2026-05-30

Exact counts from the parsed advisor JSON:

- `multiple_permissive_policies` (WARN **×22**) — overlapping permissive policies
  that could be consolidated.
- `auth_rls_initplan` (WARN **×8**) — policies re-evaluating `auth.<fn>()` per row.
  Fix by wrapping in `(SELECT auth.uid())` (the pattern P5 already uses for
  `assistant_sessions`).
- `duplicate_index` (WARN **×5**) — redundant index in a pair; safe to drop one of
  each pair.
- `unindexed_foreign_keys` (INFO **×39**) — FKs without a covering index. The P4
  migration adds covering indexes for several of these.
- `unused_index` (INFO **×51**) — **expected** for a pre-launch DB with little
  traffic; do **not** drop indexes based on this until after real production use.

(22 + 8 + 5 = 35 WARN; 39 + 51 = 90 INFO; total 125.)

Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
· https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
· https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

### 5.5 Recommended remediation process (separate PR, not this one)

1. Re-run `get_advisors(type:"security")` and `get_advisors(type:"performance")` for
   the current authoritative list before acting.
2. For each RLS-disabled table: decide the access model (owner-scoped? role-scoped?
   read-only reference?), write the policy, and test with a non-admin role in a
   **branch DB** before touching production.
3. For each `SECURITY DEFINER` view: confirm intent or convert to `INVOKER`.
4. For `function_search_path_mutable`: add `SET search_path = public, pg_temp`
   (low risk).
5. For `auth_rls_initplan`: rewrite policies to use `(SELECT auth.uid())`.
6. For `duplicate_index` / `multiple_permissive_policies`: drop the redundant index /
   consolidate the overlapping policies.
7. Apply during a maintenance window with a rollback snapshot ready.

## 6. Verification after migration

- `list_migrations` shows the P4 and P5 timestamps as applied.
- `GET /health` on the extraction service is unaffected (it does not touch these tables).
- The app still loads and a normal user can read the tables they could read before
  (no new lock-outs introduced).
- `get_advisors` shows no **new** ERROR/WARN findings attributable to P4/P5.
