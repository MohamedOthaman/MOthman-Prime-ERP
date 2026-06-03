# Security Posture — Food Choice ERP

This document records the desktop/client/service security posture and the hardening
applied in the P0 security pass. See `docs/ENTERPRISE-ROADMAP.md` for the broader plan.

## Secrets & environment

- **`.env` is intentionally still tracked — for now.** It is listed in `.gitignore`, but was
  committed earlier and the release pipeline currently depends on it: the Supabase client
  (`src/integrations/supabase/client.ts`) reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`
  at build time, and `release.yml` does **not** inject those values. Untracking `.env` without
  first wiring those into CI would ship an app that cannot reach Supabase (a production break).
  Because the file holds only **publishable** values, the security cost of keeping it tracked is low.
- **Planned follow-up:** inject the `VITE_SUPABASE_*` values via GitHub Actions variables/secrets in
  `release.yml` and the `frontend-build` job of `ci.yml`, then untrack with `git rm --cached .env`.
  Use `.env.example` as the template in the meantime.
- The client env only contains **`VITE_*` publishable values** (Supabase URL +
  *publishable/anon* key, app URL). These are embedded in the client bundle **by design**
  and are public; access control relies on Supabase **Row-Level Security**, not on the
  secrecy of the anon key.
- **Never** place server-only secrets (e.g. `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`)
  in `.env`/any `VITE_*` variable. They belong only to backend/service environments.
- The Gemini API key for OCR structuring lives only in the extraction service environment
  (`services/extraction-service/.env`) or is passed per-request via the `X-Gemini-API-Key`
  header — never in the client bundle.

## Desktop (Tauri v2)

- **`withGlobalTauri` is disabled** (`app.withGlobalTauri: false`). This stops the full
  Tauri API object (`window.__TAURI__`) from being exposed to all page JavaScript, which
  would otherwise be reachable by any injected/XSS script. The app uses the typed
  `@tauri-apps/*` plugin imports, which route through `window.__TAURI_INTERNALS__` and are
  unaffected. Runtime detection uses `isTauriRuntime()` (`src/platform/runtime.ts`), which
  is independent of this flag.
- **Content Security Policy** is now set (previously `null` = no CSP):
  - Production `csp`: `script-src 'self'`, `object-src 'none'`, `base-uri 'self'`,
    `frame-ancestors 'none'`, `form-action 'self'`; `connect-src` pinned to
    `*.supabase.co` (https + wss) and the local extraction service.
  - Separate `devCsp` keeps Vite HMR working (`'unsafe-inline'`/`'unsafe-eval'`/ws) without
    weakening the production policy.
  - Tauri augments the CSP with hashes for its own IPC bootstrap
    (`dangerousDisableAssetCspModification` remains `false`).
- IPC access is governed by Tauri **capabilities** (`src-tauri/capabilities/default.json`):
  scoped `sql`, `dialog`, `fs`, and `updater` permissions for the single `main` window.

## Extraction service (FastAPI)

- **CORS hardened.** Replaced `allow_origins=["*"] + allow_credentials=True` (an invalid,
  insecure combination) with an env-configurable allow-list
  (`EXTRACTION_ALLOWED_ORIGINS`, default = Tauri desktop + Vite dev origins),
  `allow_credentials=False`, and explicit method/header allow-lists. The service
  authenticates via the `X-Gemini-API-Key` header, not cookies.

## Deferred: AI Assistant + Semantic Search (foundation only — NOT user-facing)

`src/lib/ai/` (assistant + embeddings + hooks) is intentionally **not wired into any
UI** (verified: no `.tsx` imports `@/lib/ai`). It is deferred for concrete, verified
reasons — do **not** build a `/assistant` screen on it until these are fixed:

1. **Wrong table names in the tool queries** (`src/lib/ai/assistant.ts`). The tools
   query `invoice_headers` and `stock_batches`, but the real tables are
   `sales_headers` and `inventory_batches`; it also reads a non-existent
   `products.min_qty`. As written, the assistant's tools would error at runtime.
2. **Browser-side Gemini key.** Both the assistant and `embeddings.ts` call
   `generativelanguage.googleapis.com` directly from the client, exposing the API
   key. Route through a backend proxy before any UI ships.
3. **Semantic search needs an unapplied migration.** `semanticSearch()` depends on the
   `match_entities` RPC + `entity_embeddings` table from
   `20260529100000_p5_pgvector_embeddings.sql`, which is **not applied** to the live DB.

**Fix plan (separate PR):** correct table/column names → add a server-side proxy for
Gemini → apply the P5 migration in a maintenance window → only then add a read-only
`/assistant` UI with explicit "no write/delete" boundaries.

## Known gaps / follow-ups (tracked, not yet addressed)

- **CSP must be smoke-tested** with `npm run tauri:dev` and a real `tauri build` before
  release — a static CSP cannot be fully verified without running the desktop shell.
  If a legitimate origin is blocked, widen `connect-src`/`img-src` deliberately.
- **Automation triggers `stock.low` and `sync.failed`** are defined but have no
  producer yet (only `ocr.completed` and `invoice.posted` fire). The `/automation` UI
  labels them "not fired yet". Wiring them is a small follow-up (emit from the stock
  and sync layers).
- The extraction `/extract` endpoint is currently **unauthenticated**; acceptable only
  when the service runs locally beside the client. Add a shared-secret/bearer check before
  exposing it on a network. (Roadmap P1/P3.)
- Consider scoping the Tauri `fs` capability to specific directories once the exact
  app-data read/write paths are enumerated (currently `fs:default`).
- Consider enabling `app.security.freezePrototype` after verifying no dependency relies on
  prototype mutation.

## Verification performed in this pass

| Check | Result |
| ----- | ------ |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `python3 -m py_compile services/extraction-service/main.py` | OK |
| `tauri.conf.json` / `capabilities/default.json` JSON validity | valid |
| Supabase advisors (live, 2026-05-30) — SECURITY | 18 ERROR, 85 WARN, 1 INFO (104 total) — see `docs/MIGRATION_NOTES.md` §5 |
| Supabase advisors (live, 2026-05-30) — PERFORMANCE | 0 ERROR, 35 WARN, 90 INFO (125 total) — see `docs/MIGRATION_NOTES.md` §5.4 |
| Runtime smoke test of CSP in packaged app | **pending — requires desktop build** |

> The advisor findings above are **pre-existing** and unrelated to the P0 hardening
> in this document; they are tracked for separate remediation in
> `docs/MIGRATION_NOTES.md` §5. Counts were produced by parsing the saved advisor
> JSON (its `categories` field partitions security vs. performance); re-run
> `get_advisors` for the live number before remediation.
