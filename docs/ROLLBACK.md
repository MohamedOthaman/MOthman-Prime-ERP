# Rollback & Recovery — Food Choice ERP

> Status: stabilization / deployment-readiness pass (PR #7).
> Companion to `docs/DEPLOYMENT.md` and `docs/MIGRATION_NOTES.md`.
> This document covers **how to undo** each part of a deployment.

## 1. Rollback principles

- The desktop client, the extraction service, and the database version **somewhat
  independently**. Roll back the layer that broke; you rarely need to roll back all
  three.
- The P0–P5 changes are **additive**: new files, new env-gated code paths, new
  (unapplied) migrations. Reverting them is low-risk.
- **Always** take a Supabase snapshot before applying migrations (§3).

## 2. Desktop client rollback

The client is distributed as versioned installers (Tauri bundles from
`release.yml`). To roll back:

1. Re-publish the previous release tag, or point the updater channel
   (`src-tauri/tauri.conf.json` → `plugins.updater.endpoints`) back at the prior
   `stable.json` entry.
2. Because the updater `installMode` is `passive`, clients pick up the previous
   version on next launch.
3. If a bad build is already installed, users reinstall the previous installer; no
   data is lost (state lives in Supabase + local IndexedDB outbox).

**Code-only revert (this PR):** the stabilization changes are isolated. To disable
without a full rollback:
- Automation engine: it is already wrapped in try/catch in `src/main.tsx`, so a
  failure disables automation rather than white-screening the app.
- Operations Dashboard: remove the `/operations` route and the sidebar item; the
  rest of the app is unaffected (it imports only existing primitives).
- CSP: revert the `connect-src` addition of `generativelanguage.googleapis.com` in
  `src-tauri/tauri.conf.json` if P5 must be fully sealed off.

## 3. Database / migration rollback

### Before applying (preferred safety net)
Take a **Supabase point-in-time snapshot** (Dashboard → Database → Backups) or a
`pg_dump`. This is the fastest, safest recovery path — restore the snapshot to undo
**any** schema change.

### Reverting P4 (performance indexes)
Indexes are non-destructive. To remove them:
```sql
-- Drop the P4 indexes by name (see the migration file for the full list).
DROP INDEX IF EXISTS public.<index_name>;
```
No data is affected — only query plans revert.

### Reverting P5 (pgvector + AI tables)
All P5 objects are new, so dropping them is clean:
```sql
DROP FUNCTION IF EXISTS public.match_entities(extensions.vector, text, int, float);
DROP TABLE IF EXISTS public.entity_embeddings;
DROP TABLE IF EXISTS public.assistant_sessions;
-- Leave the `vector` extension in place unless you are certain nothing else uses it:
-- DROP EXTENSION IF EXISTS vector;
```
Because P5 is dormant (not wired into the UI), dropping these has no app impact.

> Do **not** attempt to "roll back" the pre-existing RLS/advisor findings here —
> those are not introduced by this PR. They are tracked in
> `docs/MIGRATION_NOTES.md` §5 for a separate, deliberate remediation.

## 4. Extraction service rollback

The service is stateless. To roll back:
1. Redeploy the previous image/commit of `services/extraction-service/`.
2. Restart with the previous env (`HOST`, `PORT`, provider flags).
3. Verify `GET /ready` then `GET /health`.

**Config-only mitigations (no redeploy):**
- Misbehaving provider? Flip the env flag and restart: set `USE_MINICPM_V=false`
  and/or `USE_ULTRALYTICS=false` to fall back to the Gemini/Paddle path.
- Exposed by mistake? Set `HOST=127.0.0.1` and restart to remove external exposure
  immediately (the endpoints are unauthenticated — see `docs/SECURITY.md`).

## 5. Recovery checklist (incident)

1. **Identify the layer**: client crash, API 5xx, or DB error?
2. **Client**: roll back the release / updater channel (§2).
3. **API**: restart with previous config or redeploy previous build (§4); check
   `/health`.
4. **DB**: if a migration caused it, restore the pre-migration snapshot (§3).
5. **Confirm**: app loads, a Supabase read works, an OCR upload reaches the service,
   no CSP violations in the console.
6. **Record**: note what broke and which step fixed it, for the post-mortem.

## 6. What you cannot roll back automatically

- **Data written after a migration**: restoring an older snapshot loses rows
  created in between. Prefer forward-fixes (a new corrective migration) once real
  data exists, rather than snapshot restores.
- **Service-role-written embeddings** (if P5 is ever activated): re-indexable from
  source rows, but the embeddings themselves are derived and disposable.
