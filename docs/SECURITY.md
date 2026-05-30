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

## Known gaps / follow-ups (tracked, not yet addressed)

- **CSP must be smoke-tested** with `npm run tauri:dev` and a real `tauri build` before
  release — a static CSP cannot be fully verified without running the desktop shell.
  If a legitimate origin is blocked, widen `connect-src`/`img-src` deliberately.
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
