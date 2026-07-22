# Product/image sync stabilization diagnosis

Investigated 2026-07-10 against live Supabase project
`koxtzeymsujzlqrpsims` with read-only SQL and service logs. No production
migration or business-data mutation was performed.

## Confirmed state of the reported attempt

- Remote product `11111111111` exists exactly once:
  `c5fe912e-c013-41c5-abb0-87bb2c4c46bd`, created at
  `2026-07-10 15:45:21.89436+00`.
- It has one price row and one primary barcode row.
- It is partially configured: `uom`, `category`, `brand`, `brand_id`,
  `pack_size`, and `image_path` are null. No inventory batch exists for it.
- `storage.buckets` is empty and there are no `product-images` or `documents`
  objects. The image therefore did not upload.
- The storage and atomic product migrations are not in live migration history:
  `20260706120000_storage_buckets.sql` and
  `20260710120000_upsert_product_master.sql` remain unapplied.
- Live `create_product_full` has three `SECURITY DEFINER` overloads. They do
  not check `auth.uid()` or the application role and only create a subset of
  the product master data.
- Live product writes use role-based RLS. Several UPDATE policies have no
  `WITH CHECK`, and a filtered UPDATE can affect zero rows without returning
  an error unless the client requests the affected row.
- Postgres logs also contain concrete product-flow failures for RLS on
  `product_prices` and duplicate product/barcode constraints. Those later log
  events demonstrate that the legacy flow can fail at more than one stage;
  they cannot be attributed conclusively to the original `11111111111`
  attempt from the retained log fields alone.

## User/profile attribution limitation

The product row has no creator column and the legacy definer RPC did not write
an audit event. No `audit_logs` row exists for the product or its creation
window. The exact JWT subject/profile that created this row therefore cannot be
proven from server data.

The live profile table contains an active owner profile for Mohamed Othman, but
that is not sufficient evidence to attribute this specific operation. The
original hosted-browser IndexedDB outbox/session must be inspected to confirm
the exact profile and original payload. That browser state is not stored in
this Git checkout or Supabase.

## Confirmed root causes

1. **Storage is unprovisioned.** With no `product-images` bucket, the image
   upload cannot succeed. This is a permanent configuration failure until the
   reviewed storage migration is explicitly approved and applied.
2. **The legacy product save is not atomic.** The definer RPC can commit a bare
   product before RLS-gated follow-up writes update metadata. This explains the
   confirmed partial remote row.
3. **The old client hid the failing stage.** It swallowed a follow-up update
   error, did not verify zero-row UPDATE results, retried permanent failures,
   and exposed only a generic sync count.
4. **Image and database outcomes were conflated.** Upload ran before product
   persistence and its failed bytes/key were not durably queued, so the app
   could not represent “remote product, missing image” or retry only the image
   safely.
5. **Restart and replay gaps existed.** `in_flight` rows were never recovered
   after shutdown, equivalent product operations could be enqueued repeatedly,
   and a cloud catalog refresh could replace a pending local-only product.

## Stabilization implemented in this slice

- Preflight verifies the server-authenticated user, matching active profile,
  and resolved product role before any legacy definer RPC is called.
- Every critical UPDATE requests the affected row; zero rows becomes a visible
  permission/write-not-applied error.
- Errors retain code, message, details, hint, first-failure/last-attempt times,
  retryability, local/remote IDs, and local/remote/partial state.
- Permanent errors park immediately. Network, timeout, 429, and 5xx failures
  use capped backoff. Interrupted `in_flight` rows recover on restart.
- Product operations deduplicate by item code. Replays resolve/update an
  existing remote product rather than creating another.
- Product data is saved before its image. Compressed image bytes and a stable
  Storage object key are persisted in the product outbox payload. Storage uses
  idempotent upsert; replay cannot create a duplicate image.
- Database success plus image failure is recorded as `partial_remote`, with the
  remote product ID and a storage-specific remediation hint.
- Pending local products remain visible across successful remote catalog
  refreshes until their outbox operation succeeds.
- Sync Status opens Sync Log and includes the latest real error. Sync Log shows
  operation/entity identity, product code/name, IDs, timestamps, error code,
  classification, state, remediation, Retry, and guarded Discard.

## Reviewed migrations — still blocked on approval

- `20260710120000_upsert_product_master.sql` performs the product/price/barcode
  master write in one transaction, checks active profile role before writing,
  distinguishes “preserve image” from “clear image”, and rejects barcode
  conflicts atomically.
- `20260706120000_storage_buckets.sql` creates the two required buckets and
  restricts write policies by application role. Upsert has SELECT, INSERT, and
  UPDATE coverage as required by Supabase Storage.

End-to-end image success remains intentionally blocked until the storage
migration is approved and applied. The partial test product remains untouched
pending an explicit owner decision.
