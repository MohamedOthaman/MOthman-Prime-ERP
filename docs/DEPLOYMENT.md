# Deployment Guide — Food Choice ERP

> Status: stabilization / deployment-readiness pass for the P0–P5 program (PR #7).
> This document is **operational**: it describes how to deploy what exists today,
> with honest notes on what must still be verified manually.

## 1. Components

| Component | Tech | Where it runs | Network port |
| --------- | ---- | ------------- | ------------ |
| **Desktop client** | Tauri v2 + React/Vite | End-user machine (native window) | none (loads bundled assets) |
| **Extraction service** | FastAPI (Python) | Server / same machine as client | **8080** (hosted) / 8000 (local default) |
| **MiniCPM-V** (optional) | OpenAI-compatible vision server | Internal upstream | 8001 (internal only) |
| **Ultralytics** (optional) | YOLO inference HTTP server | Internal upstream | 8002 (internal only) |
| **Supabase** | Managed Postgres 17 + Auth + RLS | Supabase cloud (`koxtzeymsujzlqrpsims`) | 443 |

The **extraction service is the single public backend entry point**. MiniCPM-V and
Ultralytics are private upstreams the extraction service calls; they are never
exposed directly to clients. See `docs/HOSTING.md` for the topology diagram.

## 2. Required environment variables

### 2.1 Desktop client (build-time, `VITE_*` — embedded in the bundle, PUBLIC)
| Var | Required | Notes |
| --- | -------- | ----- |
| `VITE_SUPABASE_URL` | ✅ | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Anon/publishable key only — **never** the service-role key |
| `VITE_SUPABASE_PROJECT_ID` | ✅ | Project ref |
| `VITE_APP_URL` | ✅ | Public app URL |
| `VITE_EXTRACTION_SERVICE_URL` | ✅ | Base URL of the extraction service. Default `http://127.0.0.1:8000`. **If non-localhost, add the origin to the Tauri CSP `connect-src`** (`src-tauri/tauri.conf.json`). |

### 2.2 Extraction service (server-side, secrets — NEVER in `VITE_*`)
| Var | Default | Notes |
| --- | ------- | ----- |
| `HOST` | `127.0.0.1` | Set `0.0.0.0` only behind a firewall/reverse proxy (endpoints are unauthenticated) |
| `PORT` | `8000` | Set `8080` for the hosted target |
| `EXTRACTION_RELOAD` | `false` | Dev auto-reload; keep `false` in production |
| `LOG_LEVEL` | `info` | uvicorn log level |
| `GEMINI_API_KEY` | — | **Not required** — AI structuring is disabled at runtime. Retained in `.env.example` as a future reference option. Set `AI_STRUCTURING_ENABLED=true` to re-enable (separate future work). |
| `AI_STRUCTURING_ENABLED` | `false` | Master switch for AI structuring. Keep `false`; local text parsing is used instead. |
| `EXTRACTION_PROVIDER` | `paddle` | `paddle` \| `tesseract` |
| `EXTRACTION_ALLOWED_ORIGINS` | Tauri+dev origins | Comma-separated CORS allow-list |
| `USE_MINICPM_V` | `false` | MiniCPM-V is retained as a future option but inactive at runtime. |
| `MINICPM_V_URL` | `http://127.0.0.1:8001` | MiniCPM-V upstream (future use) |
| `MINICPM_V_MODEL` | `MiniCPM-V` | Model name reported by the upstream (future use) |
| `USE_ULTRALYTICS` | `false` | Enable the `/detect` proxy endpoint |
| `ULTRALYTICS_URL` | `http://127.0.0.1:8002` | Ultralytics upstream |
| `POPPLER_PATH` | — | Windows-only, for scanned PDFs |

> **No API key is required.** AI structuring (Gemini / MiniCPM-V) is intentionally
> disabled at runtime. The extraction service performs OCR only (pdfplumber +
> PaddleOCR + Tesseract); the frontend runs local rule-based parsing on the
> extracted text. Gemini and MiniCPM-V are kept in the codebase as documented
> future options — they are not called.

## 3. Startup order

1. **Supabase** — apply migrations first (see `docs/MIGRATION_NOTES.md`). The DB
   must be reachable before anything else is useful.
2. **Optional ML upstreams** (only if enabled): start **MiniCPM-V** (`:8001`)
   and/or **Ultralytics** (`:8002`). They must be up *before* the extraction
   service if you want it to report them healthy at boot — but the extraction
   service degrades gracefully and falls back if they are down.
3. **Extraction service** (`:8080`). On boot it logs effective config and warns
   about missing providers (`@app.on_event("startup")`). Verify with
   `GET /health` and `GET /ready`.
4. **Desktop client** — build with the `VITE_*` vars pointing at the right
   Supabase project and extraction service URL, then distribute the bundle.

## 4. Build & run

### Extraction service
```bash
cd services/extraction-service
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env   # no API keys required — AI structuring is disabled
# Local:
python main.py
# Hosted on 0.0.0.0:8080 (behind firewall/proxy):
HOST=0.0.0.0 PORT=8080 EXTRACTION_RELOAD=false python main.py
# Or with a process manager:
HOST=0.0.0.0 PORT=8080 uvicorn main:app --host 0.0.0.0 --port 8080 --workers 2
```

### Desktop client
```bash
npm ci
npm run typecheck && npm run lint && npm test   # gate (all currently green)
npm run build                                   # web bundle → dist/
npm run tauri build                             # native installers (per release.yml)
```

CI (`.github/workflows/ci.yml`) runs typecheck + lint on PRs to `main`.
Release (`.github/workflows/release.yml`) builds multi-platform Tauri bundles on tags.

## 5. Health checks

| Endpoint | Purpose |
| -------- | ------- |
| `GET /ready` | Liveness — returns instantly, does not init PaddleOCR |
| `GET /health` | Readiness — reports every provider's availability (OCR engines, AI structuring status, MiniCPM-V reachability, Ultralytics reachability, pandas/numpy/pillow) |

Wire `/ready` to your orchestrator's liveness probe and `/health` to readiness.

## 6. Pre-release verification — REQUIRED (cannot be done in CI)

- [ ] **Tauri CSP smoke test**: `npm run tauri:dev` and a real `tauri build`.
      Confirm the app loads, a Supabase request succeeds, an OCR upload reaches
      the extraction service (local text parsing only — no external AI calls),
      and the console shows **no CSP violations**.
- [ ] **Migrations applied** to the target Supabase project (`docs/MIGRATION_NOTES.md`).
- [ ] **`/health` green** on the deployed extraction service.
- [ ] If `HOST=0.0.0.0`: confirm a firewall/reverse proxy restricts access — the
      `/extract` and `/detect` endpoints are **unauthenticated**.

## 7. Known security notes

- `/extract` and `/detect` are **unauthenticated**. Intended to run locally next
  to the client, or behind a network boundary. Documented in `docs/SECURITY.md`.
- The P5 AI client (`src/lib/ai/`) calls Gemini **directly from the browser**,
  exposing the API key client-side. It is **dormant** (not wired into any UI) and
  is allowed by CSP for forward-readiness. Before shipping P5 to users, route
  these calls through a backend proxy. Tracked in `docs/SECURITY.md`.
- Pre-existing Supabase RLS gaps (unrelated to P0–P5) are listed in
  `docs/MIGRATION_NOTES.md` §5 and must be remediated separately.
