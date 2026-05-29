# Hosting Topology — Food Choice ERP

> Status: stabilization / deployment-readiness pass (PR #7).
> Companion to `docs/DEPLOYMENT.md` (how to deploy) and `docs/ROLLBACK.md`
> (how to undo). This document is the **topology + port/service map**.

## 1. Topology diagram

```
                          ┌─────────────────────────────┐
                          │      End-user machine        │
                          │  ┌───────────────────────┐   │
                          │  │  Food Choice ERP       │   │
                          │  │  (Tauri v2 desktop)    │   │
                          │  │  React/Vite webview    │   │
                          │  └───────────┬───────────┘   │
                          └──────────────┼───────────────┘
                                         │ HTTPS (443)
              ┌──────────────────────────┼───────────────────────────┐
              │ outbound only            │                            │
              ▼                          ▼                            ▼
   ┌──────────────────┐      ┌────────────────────┐     ┌──────────────────────┐
   │  Supabase cloud  │      │  Extraction service│     │ Gemini API (P5 only,  │
   │  Postgres 17 +   │      │  FastAPI :8080     │     │ dormant — direct from │
   │  Auth + RLS +    │      │  (public entry)    │     │ browser, gated by CSP)│
   │  PostgREST :443  │      └─────────┬──────────┘     └──────────────────────┘
   └──────────────────┘                │ private network
                          ┌────────────┴────────────┐
                          ▼                          ▼
                 ┌──────────────────┐      ┌──────────────────┐
                 │  MiniCPM-V :8001 │      │ Ultralytics :8002│
                 │  (internal only) │      │ (internal only)  │
                 └──────────────────┘      └──────────────────┘
```

The **extraction service on :8080 is the only backend the client talks to**
directly (besides Supabase and, for dormant P5, Gemini). MiniCPM-V and
Ultralytics sit on a private network behind the extraction service.

## 2. Port / service map

| Service | Port | Bind | Exposure | Auth | Notes |
| ------- | ---- | ---- | -------- | ---- | ----- |
| Desktop client | — | — | local window | Supabase session | No inbound ports; loads bundled assets |
| Extraction service | **8080** | `0.0.0.0` (hosted) / `127.0.0.1` (local) | public entry, **must be firewalled** | **none** | `/extract`, `/detect` unauthenticated |
| MiniCPM-V | 8001 | `127.0.0.1` / private | internal only | none | Only the extraction service should reach it |
| Ultralytics | 8002 | `127.0.0.1` / private | internal only | none | Only the extraction service should reach it |
| Supabase | 443 | managed | public (Supabase cloud) | Anon key + RLS | `koxtzeymsujzlqrpsims`, region `ap-southeast-2`, PG 17.6 |
| Gemini API | 443 | — | public (Google) | API key | P5 only, dormant; allowed in CSP for forward-readiness |

## 3. Firewall expectations

- **Extraction service (:8080)** — when `HOST=0.0.0.0`, it has **no authentication**.
  It MUST sit behind one of:
  - a host firewall allowing only the client subnet, **or**
  - a reverse proxy (nginx/Caddy/Traefik) that adds auth/TLS, **or**
  - the same machine as the client with `HOST=127.0.0.1` (no external exposure).
- **MiniCPM-V (:8001) / Ultralytics (:8002)** — never expose to clients or the
  internet. Bind to loopback or a private network reachable only by the
  extraction service.
- **Supabase** — access is controlled by the anon/publishable key + RLS. The
  service-role key must never reach the client or the extraction service.

## 4. Health / probe wiring

| Probe | Endpoint | Use for |
| ----- | -------- | ------- |
| Liveness | `GET :8080/ready` | returns instantly; does not init PaddleOCR |
| Readiness | `GET :8080/health` | full provider status (OCR engines, Gemini key, MiniCPM-V/Ultralytics reachability, pandas/numpy/pillow) |

The in-app **Operations Dashboard** (`/operations`, admin/ops_manager only) polls
`GET /health` every 30 s and surfaces provider status, the offline sync-queue
depth, automation run history, and Supabase reachability — a single pane for
deployment monitoring.

## 5. Startup order (summary)

1. Supabase (apply migrations — see `docs/MIGRATION_NOTES.md`).
2. Optional ML upstreams: MiniCPM-V (:8001), Ultralytics (:8002).
3. Extraction service (:8080) — verify `/ready` then `/health`.
4. Desktop client — built with `VITE_*` pointing at the right Supabase project and
   `VITE_EXTRACTION_SERVICE_URL`.

Full commands are in `docs/DEPLOYMENT.md` §3–§4.

## 6. Scaling notes

- The extraction service is stateless per request → safe to run multiple workers
  (`uvicorn --workers N`) or replicas behind a load balancer. PaddleOCR init is
  lazy and per-process; the first request to each worker pays the init cost.
- Gemini and MiniCPM-V calls are the latency-dominant step; size workers for
  concurrent structuring calls, not for CPU.
- Supabase scaling is managed; the P4 indexes (once applied) reduce query load for
  the heavier reports/search paths.
