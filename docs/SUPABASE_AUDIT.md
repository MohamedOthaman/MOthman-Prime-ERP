# Supabase Hardening + Schema Repair — Audit Report

**Project:** `koxtzeymsujzlqrpsims` (ACTIVE_HEALTHY, Postgres 17.6) — the live/production database.
**Date:** 2026-06-04 · **Branch:** `claude/supabase-hardening-schema-repair` · **Scope:** Phase 0 audit + Phase 1 safe fix.
**Method:** Read-only only. Advisors via `get_advisors`; schema via `pg_catalog`/`information_schema`; code via repo search. **No DDL/DML was run against production. No migration was applied.**

> ⚠️ **The only change implemented in this PR is Phase 1 (additive FK indexes), as a migration _file_ — it has NOT been applied to production.** Everything else is audit + a reviewed plan, deferred for explicit sign-off because it modifies existing production objects (functions, view security mode, RLS) and needs the access model confirmed.

---

## Advisor baseline (BEFORE — captured 2026-06-04)

| Category | ERROR | WARN | INFO | Total |
|---|---|---|---|---|
| SECURITY | 18 | 85 | 1 | 104 |
| PERFORMANCE | 0 | 35 | 90 | 125 |

**SECURITY** — ERROR: `security_definer_view` ×10, `rls_disabled_in_public` ×6, `sensitive_columns_exposed` ×2. WARN: `anon_security_definer_function_executable` ×31, `authenticated_security_definer_function_executable` ×31, `function_search_path_mutable` ×19, `rls_policy_always_true` ×3, `auth_leaked_password_protection` ×1. INFO: `rls_enabled_no_policy` ×1.
**PERFORMANCE** — WARN: `multiple_permissive_policies` ×22, `auth_rls_initplan` ×8, `duplicate_index` ×5. INFO: `unused_index` ×51, `unindexed_foreign_keys` ×39.

These match the baseline documented in PR #7 (`docs/MIGRATION_NOTES.md`), confirming none of this was introduced by recent work — it is pre-existing.

---

## 🔴 Schema / History Drift (most important finding)

**The repo migration history cannot rebuild the live database.** Evidence:

1. **Divergent migration ledgers.** Live `supabase_migrations` tracks **15** entries (`phase_a1..a5`, `phase_a_001`, `phase_c..i`, `ai_extraction_pipeline`) with timestamps like `20260331000515`. The repo has **32** files (`phase_1..14`, `phase_b..i`, …) with different names *and* timestamps. The overlapping `phase_c..i` were applied under **different versions** than the repo files.
2. **Base tables are never created in the repo.** `sales_headers`, `sales_lines`, `grn_headers`, `grn_lines`, `inventory_batches`, `suppliers` have **no `CREATE TABLE`** in any repo migration — they are treated as pre-existing. A fresh `supabase db reset` would fail.
3. **Live has objects that exist in no migration:** views `v_product_stock_balance`, `v_expiry_alerts`, `v_stock_summary`, and RPC `get_product_available_qty` (the last two are even called by the frontend).
4. **Tables created in migrations don't exist live (renamed/superseded):** `invoice_headers`→`sales_headers`, `invoice_lines`→`sales_lines`, `stock_batches`→`inventory_batches`.

**Consequence for this work:** any new migration must be written against the **live** schema and applied to **live** (or a dump-seeded clone), never via reset/preview-from-migrations. This is why Phase 1 targets live names and is documented as live-apply-only.

**⚠️ This also affects PR #7:** its `20260529000000_p4_performance_indexes.sql` creates indexes on `invoice_headers` — which does **not exist live** — so that migration would still fail on apply (beyond the `products.sku`→`code` fix already made there). See Phase 6 recommendation.

---

## Phase 1 — Safe Performance Fixes ✅ IMPLEMENTED (file only)

**`supabase/migrations/20260604150000_p1_fk_covering_indexes.sql`** — 39 covering indexes for the 39 advisor-flagged unindexed FKs. Every column verified against live `pg_constraint`, every target cross-checked against live `pg_indexes` (no duplicates). All `CREATE INDEX IF NOT EXISTS` (idempotent, additive, reversible), each wrapped in a `to_regclass()` table-existence guard so it creates every index on LIVE and safely no-ops where a table is absent.

> The non-reproducibility finding was **confirmed empirically by CI**: the Supabase Preview branch (which rebuilds schema from migration files) failed with `relation "public.customers" does not exist` because base tables aren't created by migrations. The `to_regclass()` guards make this migration pass in that drifted environment while remaining correct for live.

| Table | FK column(s) indexed | # |
|---|---|---|
| products | brand_id | 1 |
| customers | created_by, salesman_id | 2 |
| auto_match_feedback | matched_product_id | 1 |
| customer_sku_mappings | product_id | 1 |
| grn_headers | approved_by, completed_by, inspected_by, municipality_approved_by, municipality_submitted_by, rejected_by | 6 |
| grn_lines | qc_inspected_by | 1 |
| inventory_batches | created_by | 1 |
| inventory_movements | performed_by | 1 |
| qc_inspections | grn_line_id, inspected_by | 2 |
| sales_headers | cancel_approved_by, cancelled_by, created_by, done_by, ready_by, received_by, salesman_id | 7 |
| sales_returns | created_by, posted_by, received_by, reviewed_by | 4 |
| sales_return_lines | invoice_line_id, return_movement_id | 2 |
| stock_movements | created_by | 1 |
| outbound_execution_allocations | created_by, inventory_movement_id, invoice_line_id | 3 |
| outbound_execution_lines | confirmed_by, invoice_line_id, scanned_by | 3 |
| outbound_execution_sessions | confirmed_by, started_by | 2 |
| outbound_scan_events | scanned_by | 1 |

**Expected effect:** `unindexed_foreign_keys` 39 → 0. **Confirmation requires applying to live then re-running the performance advisor** (cannot be measured without applying).

### Duplicate & unused indexes — DOCUMENTED, NOT removed (per instructions)
`duplicate_index` ×5 (drop the redundant one of each pair, in a later PR after confirming usage):
- `audit_logs`: {idx_audit_logs_entity, idx_audit_logs_entity_lookup}
- `product_barcodes`: {idx_product_barcodes_product, idx_product_barcodes_product_id}; {idx_product_barcodes_barcode_unique, idx_unique_barcode}; {idx_one_primary_barcode_per_product, idx_product_barcodes_one_primary_per_product}
- `salesmen`: {idx_salesman_code, idx_salesmen_code_unique, salesmen_code_key} (3 identical)

`unused_index` ×51 — **do not drop yet.** "Unused" reflects current stats; several will be exercised once the FK indexes above change planner behavior. Re-evaluate after ≥1–2 weeks of production traffic.

---

## Phase 2 — Function `search_path` hardening (DEFERRED — ready SQL)

19 functions have a mutable `search_path` (live `pg_proc.proconfig` empty). The canonical, logic-preserving fix is `ALTER FUNCTION … SET search_path = public`. Split by risk:

| Subset | Functions | Recommendation |
|---|---|---|
| **Low-risk** (not SECURITY DEFINER, trigger/helpers) | `set_updated_at`, `set_sales_headers_updated_at`, `set_product_prices_updated_at`, `sync_sales_header_total`, `generate_return_no`, `get_product_available_qty` | Safe to `ALTER … SET search_path = public`. |
| **SECURITY DEFINER, needs review** | `advance_grn_status`, `approve_grn`, `reject_grn`, `fn_audit_grn_status_change`, `fn_check_expiry_on_batch_insert`, `fn_receiving_lines_insert/update/delete`, `get_fefo_batches`, `log_audit`, `submit_qc_result`, `create_product_full` (one overload) | Same one-line fix, but these are definer + business-critical; verify each body references only `public` objects before applying. |
| **Sensitive — DEFER** | `handle_new_user` (SECURITY DEFINER trigger on `auth.users`) | Touches the `auth` schema. Setting `search_path=public` could break unqualified `auth` references. Review individually. |

**Overload caveat:** `create_product_full` / `update_product_full` exist in multiple signatures; only the overload lacking `search_path` must be altered — disambiguate by argument list.

**Related (not search_path):** `anon_security_definer_function_executable` ×31 — mutating RPCs (`post_sales_invoice`, `cancel_invoice`, `post_sales_return`, `approve_grn`, …) are EXECUTE-able by the **anon** role. Recommend `REVOKE EXECUTE … FROM anon` on the mutating set (keep `authenticated`). Deferred — must not break legitimate authenticated RPC calls.

---

## Phase 3 — SECURITY DEFINER Views (DEFERRED — ready SQL, coupled to RLS)

All 10 flagged views run with definer privileges (live `reloptions` has no `security_invoker`). Canonical fix: `ALTER VIEW public.<v> SET (security_invoker = on);` (no definition change). **But** switching to invoker makes the caller's RLS apply to underlying tables — so each view is only safe to flip once the underlying tables grant authenticated reads.

| View | Reads from | Used by app? | Safe to flip now? | Note |
|---|---|---|---|---|
| products_overview | products, product_barcodes, product_prices | Yes (7×) | Likely | underlying tables have authenticated read policies |
| product_master | products | Yes (1×) | Likely | — |
| sales_invoices | sales_headers, customers, salesmen | Yes (7×) | Likely | — |
| receiving_headers | grn_headers | Yes (14×) | Likely | compat view |
| receiving_lines | grn_lines | Yes (8×) | Likely | compat view |
| inventory_product_stock_summary | products, inventory_batches | Yes (14×) | Likely | — |
| v_stock_summary | products, inventory_batches | Yes | Likely | not in any migration (live-only) |
| v_product_stock_balance | products, inventory_batches | Yes (2×) | Likely | not in any migration (live-only) |
| v_expiry_alerts | inventory_batches, products | Yes | Likely | not in any migration (live-only) |
| **inventory_movements_log** | **inventory_movements**, products_overview, grn_headers, sales_headers | Yes (1×) | **NO** | `inventory_movements` has RLS enabled + **0 policies** → flipping to invoker returns 0 rows. Fix Phase 4 first. |

**Recommendation:** flip the 9 "Likely" views **after** verifying on a dump-seeded clone that authenticated users still get rows; hold `inventory_movements_log` until `inventory_movements` has a SELECT policy.

---

## Phase 4 — RLS (DEFERRED — decision table, no blind enablement)

| Table | Live RLS | Policies | Required access model | Safe fix now? | Reason |
|---|---|---|---|---|---|
| inventory_movements | **ENABLED** | **0** | authenticated read; writes only via SECURITY DEFINER posting fns | Add SELECT policy (review first) | Enabled + 0 policies = **denies all direct reads today**; frontend reads it at 4 sites → likely already failing or masked by the definer view. User-flagged. |
| outbound_execution_sessions | **DISABLED** | 0 | authenticated (picking flow) | No — needs policy set | Enabling without policy breaks picking reads |
| outbound_execution_lines | **DISABLED** | 0 | authenticated (picking flow) | No | also `sensitive_columns_exposed` (session_id) |
| outbound_execution_allocations | **DISABLED** | 0 | authenticated (returns/alloc) | No | — |
| outbound_scan_events | **DISABLED** | 0 | authenticated (scan flow) | No | also `sensitive_columns_exposed` (session_id) |
| sales_returns | **DISABLED** | 0 | authenticated (returns flow) | No | writes via definer fns |
| sales_return_lines | **DISABLED** | 0 | authenticated (returns flow) | No | — |

**Plan (follow-up PR, one table at a time, tested on a clone):** mirror the existing authenticated-access pattern used by `sales_headers`/`grn_headers`. Writes flow through SECURITY DEFINER functions (which bypass RLS), so enabling RLS + an authenticated read/write policy should not break posting — **but this must be verified on a clone before production.** Do **not** enable RLS without simultaneously adding a policy. Do **not** use bare `using(true)` except where it matches the table's existing documented pattern.

`rls_policy_always_true` ×3 (`auto_match_feedback`, `customer_sku_mappings`, `ocr_documents`) — these AI tables use `using(true)`; tighten to `authenticated` once the AI flows' owner model is defined. Deferred.

---

## Phase 5 — Sensitive Columns (DEFERRED — resolved by Phase 4)

| Table | Column | Why flagged | Fix |
|---|---|---|---|
| outbound_execution_lines | session_id | table exposed via API without RLS | **Enabling RLS (Phase 4) clears this** — the column is a FK uuid, not intrinsically secret |
| outbound_scan_events | session_id | same | same |

No column removal needed (and none permitted). The ERROR disappears once the two tables get RLS.

---

## Phase 6 — Schema Drift / Wrong Tables

| Business concept | Live (canonical) | Repo migration name | Frontend uses | Problem | Safe fix |
|---|---|---|---|---|---|
| Sales invoice header | **sales_headers** | invoice_headers (phase_4) | sales_headers ✓, `sales_invoices` view | invoice_headers never exists live; **PR #7 P4 indexes it → would fail** | Treat `sales_headers` canonical; fix/rebase PR #7 P4; optional compat view `invoice_headers`→`sales_headers` |
| Sales invoice line | **sales_lines** | invoice_lines | sales_lines ✓ | same pattern | same |
| Stock batch | **inventory_batches** | stock_batches (phase_3) | inventory_batches ✓ | stock_batches not live; PR #7 assistant queried it (dormant) | `inventory_batches` canonical |
| GRN header | **grn_headers** (table) | receiving_headers (table→view) | receiving_headers view (14×) + grn_headers (3×) | compat view over grn_headers; ordering hazard (`DROP VIEW` only, no `DROP TABLE`) | OK functionally; document canonical = grn_headers |
| GRN line | **grn_lines** (table) | receiving_lines (view) | receiving_lines view (8×) | same | OK; canonical = grn_lines |
| Product identifier | **products.code** (+ `item_code` on views) | products.code | code + item_code | **no `sku` column exists**; PR #7 P4 indexed `products.sku` (already fixed there → `code`) | `code` canonical |
| Batch number column | **inventory_batches.batch_no** | — | `batch_number` in 3 files, `batch_no` in 60+ | `BatchTracePage.tsx`, `FridgeStoragePage.tsx`, `ProductTracePage.tsx` use `batch_number` but the column is `batch_no` | **Frontend-only fix** (3 files) — no DB change |
| Legacy tables | *(none live)* | batches, invoices, invoice_items, movements, market_returns, return_items | `useStock.ts` queries all 6 | These 6 tables **do not exist live**; `useStock.ts` + stale `types.ts` reference them | Likely dead legacy code — verify and migrate `useStock.ts` to canonical tables/views |

**No table rename or drop is proposed.** Where compatibility is needed, the existing views already provide it; the remaining drift is fixed on the **frontend** side (and by regenerating `types.ts`).

**Generated types (`src/integrations/supabase/types.ts`) are severely stale** — they declare only 9 legacy tables, 0 views, 0 functions, so the whole modern schema is accessed via `as any`. Regenerating types from live (`supabase gen types`) is the single highest-leverage drift fix and would surface most column mismatches at compile time. Recommended as its own PR.

---

## Phase 7 — Verification

| Check | Result |
|---|---|
| Repo build/typecheck/lint/tests | run before commit (Phase 1 adds only `.sql` + `.md`, no TS change) |
| Phase 1 SQL — columns/tables vs live schema | ✅ verified via `pg_constraint`/`pg_attribute` |
| Phase 1 SQL — no duplicate indexes | ✅ cross-checked vs live `pg_indexes` |
| **Advisor AFTER-counts** | **Not available** — requires applying to live; not done per safety rules. Expected: performance INFO 90→51. |

---

## Phase 8 — Deliverables

### 1. Supabase Audit (top issues)
| Issue | Object(s) | Severity | Risk | Fixed here? | Migration | Remaining |
|---|---|---|---|---|---|---|
| Unindexed FKs ×39 | 17 tables | INFO (perf) | Slow joins/cascades | ✅ file | p1_fk_covering_indexes | Apply + re-run advisor |
| SECURITY DEFINER views ×10 | listed | ERROR (sec) | RLS bypass on read | ❌ | Phase 3 (ready SQL) | Needs RLS + clone test |
| RLS disabled ×6 | outbound_* / sales_return* | ERROR (sec) | Open table access | ❌ | Phase 4 | Needs access model |
| RLS enabled, 0 policies | inventory_movements | INFO (sec) | Reads denied today | ❌ | Phase 4 | SELECT policy |
| Sensitive cols ×2 | outbound_*.session_id | ERROR (sec) | Exposure w/o RLS | ❌ | Phase 4 (coupled) | Clears with RLS |
| Mutable search_path ×19 | functions | WARN (sec) | search_path hijack | ❌ | Phase 2 (ready SQL) | Review definer fns |
| anon EXECUTE on RPCs ×31 | functions | WARN (sec) | anon can call mutators | ❌ | Phase 2 note | REVOKE from anon |
| Duplicate indexes ×5 | 3 tables | WARN (perf) | Write overhead | ❌ (documented) | later PR | Confirm usage first |
| Stale generated types | types.ts | — | drift hidden by `as any` | ❌ | FE PR | Regenerate from live |

### 2–5: see the per-phase tables above (RLS decision, view security, index fixes, schema drift).

### 6. Final Recommendation (honest)

- **Is the Supabase PR ready to merge?** The **Phase 1 migration is ready and safe** to merge (additive, verified, idempotent). The audit/plan is complete. The risky phases (2–5) are intentionally **not** implemented and should be separate, reviewed follow-ups.
- **Preview branch?** A normal Supabase preview branch **will not work** — the repo migration history is non-reproducible. Any pre-apply testing must be on a **clone seeded from a live schema dump**.
- **Maintenance window?** **Yes** for applying even Phase 1 (brief per-table SHARE lock; sub-second on these small tables). Required for Phases 2–5.
- **Migrations that must NOT be applied now:** none destructive here. But **PR #7's `p4_performance_indexes` must be fixed** (it targets `invoice_headers`, which is not live) before that PR is applied.
- **Risk to invoices / inventory?** **None from this PR** (Phase 1 only adds indexes). The riskier items are deferred precisely because flipping view security / enabling RLS *could* affect read paths for invoices, GRN, picking, returns — those will be validated on a clone before any production apply.

**Suggested order for follow-ups:** (1) regenerate `types.ts` + fix `batch_number`→`batch_no` (frontend, zero DB risk) → (2) Phase 2 low-risk function search_path → (3) Phase 4 RLS on the 6 tables + inventory_movements (one at a time, clone-tested) → (4) Phase 3 view `security_invoker` (after RLS) → (5) Phase 2 anon REVOKE + duplicate-index cleanup.
