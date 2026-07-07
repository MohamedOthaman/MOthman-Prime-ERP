# Inventory Correctness — Verification Map (Phase E, 2026-07-07)

Evidence-based audit of every stock-changing path. **All function bodies were
verified against LIVE** (`pg_get_functiondef`, project koxtzeymsujzlqrpsims,
2026-07-07); the pre-migration live bodies are snapshotted verbatim in
`docs/rollback/20260707100000_pre_apply_snapshot.sql` for rollback.

## Verified exact-once ✅

| Path | Function | Guards (repo body) |
|---|---|---|
| GRN → stock IN | `post_receiving_to_inventory` (phase_h) | header `FOR UPDATE`; status gate `approved` only; **idempotency guard** (existing INBOUND movement for the GRN → refuse); per-line validation before any write; movements + `qty_available` updated atomically |
| Picking → stock OUT | `confirm_picking_done` (phase_f final) | header `FOR UPDATE`; status gate `ready` only; full-scan check; pre-flight stock check; FEFO loop `FOR UPDATE`; `inventory_movements` + `qty_available` atomic |
| Return → stock IN | `post_sales_return` (phase_g final) | return `FOR UPDATE`; status gate `received/reviewed` only; restores via `qty_available` increment + `inventory_movements` records (allocation-aware) |

## Confirmed gaps 🔴 (fixed by reviewed migration `20260707100000_invoice_lifecycle_stock_reconciliation.sql` — NOT applied yet)

### 1. `cancel_invoice` never restores stock
The phase_c body flips status to `cancelled` and writes an audit row — it
does **not** reverse any deduction. Any invoice cancelled after stock was
deducted (at post or at picking-done, see below) permanently loses that
stock. The migration adds movement-based restoration with an idempotency
guard (`INVOICE_CANCEL` movements already present → skip).

### 2. Invoice deduction happens twice on LIVE (confirmed)
Verified live bodies (2026-07-07):
- `post_sales_invoice` (draft→ready): **deducts** (FEFO, writes legacy-shaped
  `stock_movements`, decrements `qty_available`).
- `confirm_picking_done` (ready→done): **deducts again** (FEFO, writes
  `inventory_movements`) — no guard against the posting-time deduction.
- `mark_invoice_done` (ready→done, non-picking path): **no deduction** —
  correct only as long as post deducts; wrong the moment post stops.

Both ready→done paths are live in the UI (InvoiceDetailsPage "Mark DONE" and
PickingScreenPage) → **every invoice completed through picking is
double-deducted**.

**Historical damage: NONE.** Live data check (2026-07-07): zero invoices have
ever been posted, picked or cancelled (`stock_movements` and INVOICE
`inventory_movements` are both empty, no cancelled headers). The bugs are
latent — fixing the functions before go-live requires no data repair.

The migration converges on ONE model — deduction happens exactly once at
ready→done, movement-based via `inventory_movements`:
- `post_sales_invoice`: validation-only (stock availability + draft→ready);
- `mark_invoice_done`: performs the FEFO deduction, guarded by "no INVOICE
  movements exist yet for this header" (in either movements table);
- `confirm_picking_done`: same idempotency guard added;
- `cancel_invoice`: reverses whatever WAS recorded (both movement tables),
  idempotent.
The guards make the functions safe to deploy REGARDLESS of which drift
variant is currently live, and safe against double-click/replay.

## Adjustment flow (reviewed migration `20260707110000_stock_adjustment_rpc.sql` — NOT applied yet)

There is no way to correct stock without faking a GRN or a sale.
`record_stock_adjustment(p_batch_id, p_qty_delta, p_reason)` adds a
SECURITY DEFINER, authenticated-only RPC that atomically writes an
ADJUSTMENT movement + updates `qty_available` (never below zero), keeping
quantities movement-backed. The client exposes it on the batch trace page
and degrades with a clear message until the migration is applied.

## Client-side changes shipped with this slice (no DDL needed)

- FEFO preview for invoice entry now calls the live `get_fefo_batches` RPC
  (server-side ordering identical to the posting engines) with the previous
  client-side computation as fallback.
- Batch metadata edits (ProductDialog editor) write an audit_logs revision
  entry (old → new per field) — quantities remain untouched by design.
- Batch quantity adjustments UI on BatchTracePage (via the RPC above).

## Live verification status (2026-07-07)

- ✅ All four lifecycle bodies read from live and snapshotted
  (docs/rollback/20260707100000_pre_apply_snapshot.sql).
- ✅ `stock_movements` / INVOICE `inventory_movements` confirmed empty — the
  reconciliation migration affects logic only, no data repair needed.
- ⏳ The reconciliation + adjustment migrations await explicit approval to
  apply (production function replacement, reversible via the snapshot).
