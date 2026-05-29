# Food Choice ERP — Enterprise Architecture & Execution Plan

> Status: living document. This is the honest, grounded analysis and the phased
> plan for evolving Food Choice ERP into an enterprise-grade, AI/OCR-enabled,
> offline-first desktop ERP. It deliberately avoids over-promising: each phase
> is independently shippable and verifiable.

## 1. What this project actually is (ground truth)

`MOthman-Prime-ERP` (product name **Food Choice ERP**) is a **mature React + TypeScript
ERP**, not a scaffold. Key facts established by reading the codebase:

| Area            | Reality |
| --------------- | ------- |
| Frontend        | Vite + React 18 + TypeScript, shadcn/ui (Radix), Tailwind (RTL-aware) |
| Desktop shell   | **Tauri v2** (Rust, `src-tauri/`) — *not* Electron |
| Mobile shell    | Capacitor config (Android/iOS scaffold) |
| Backend / data  | Supabase (Postgres + 30+ SQL migrations), RLS-based access |
| Offline-first   | Dexie + idb-keyval + TanStack Query persistence + a `sync/` engine |
| i18n            | i18next, Arabic + English, `tailwindcss-rtl` |
| Barcode         | `@zxing/library` already integrated (`useBarcodeScanner.ts`) |
| OCR / AI        | Python FastAPI `services/extraction-service` (pdfplumber → PaddleOCR/Tesseract → Gemini), `ocr_documents` table, frontend extraction pipeline |
| Build / release | GitHub Actions: `ci.yml` (typecheck + lint) and `release.yml` (tagged multi-platform Tauri builds + updater channels) |

### Three corrections to the original brief

1. **Desktop is Tauri, not Electron.** The brief asked for Electron + electron-builder
   hardening. The repo is Tauri v2. The *security goals* (secure IPC, CSP, sandboxing,
   capability isolation) all have direct Tauri equivalents and are addressed here.
   Decision (confirmed with the product owner): **keep Tauri and harden it**; do not
   rewrite to Electron.
2. **OCR/AI already exists and works.** "Build an OCR pipeline" is therefore reframed as
   **harden, structure, and validate** the existing pipeline rather than build from zero.
3. **"Merge 8 repositories" is not literally feasible or desirable.** n8n (Node platform),
   electron-builder (Node build tool), MiniCPM-V & Ultralytics (Python ML), Tesseract
   (C++), ZXing (Java/C++), ERPNext (Python/Frappe) are heterogeneous in language and
   runtime. The correct enterprise pattern — and the pattern this repo already follows —
   is **integration across clean service/library boundaries + architectural inspiration**,
   never a monolithic source merge.

## 2. Reference projects → realistic integration strategy

| Project        | What we take | How (boundary) | Status |
| -------------- | ------------ | -------------- | ------ |
| **Tesseract**  | Arabic/English OCR engine | Already used via `pytesseract` inside the extraction microservice | ✅ integrated |
| **PaddleOCR**  | Higher-accuracy OCR + layout | Already a dependency of the extraction service | ✅ integrated |
| **ZXing**      | Barcode/QR scanning | `@zxing/library` in the web/Tauri client | ✅ integrated |
| **MiniCPM-V**  | Multimodal document/invoice understanding | Add as an *optional vision provider* behind the extraction service's provider interface (HTTP boundary). Falls back to Gemini/OCR | 🔜 P2 |
| **Ultralytics**| Product/object detection for smart inventory & POS vision | Separate optional Python inference service; client calls over HTTP, results feed inventory workflows | 🔜 P4 |
| **n8n**        | Workflow automation patterns | Build an internal, typed automation abstraction (triggers → actions); optionally bridge to a self-hosted n8n later via webhooks | 🔜 P3 |
| **ERPNext**    | Mature ERP domain logic (accounting, inventory valuation, purchasing, permissions, audit) | **Inspiration only** — port engineering ideas (FEFO, double-entry, approval chains) into our Supabase schema/services | 🔄 ongoing |
| **electron-builder** | Packaging/auto-update know-how | Inspiration only; our packaging is Tauri's bundler + updater (`release.yml`) | n/a (Tauri) |

## 3. Phased roadmap

Each phase is a reviewable PR (or small set of PRs), keeps `typecheck`/`lint` green,
and never breaks production flows.

- **P0 — Security & production hardening** *(this PR)*
  Harden extraction-service CORS; add Tauri CSP + dev CSP; disable `withGlobalTauri` (with a
  flag-independent runtime detector); make the extraction service URL configurable; add
  `.env.example`; document the security posture and the `.env`/CI-injection follow-up
  (the file stays tracked for now to avoid breaking the release build). See `docs/SECURITY.md`.
- **P1 — OCR robustness & structured extraction**
  Confidence scoring surfaced in the review UI; validation layer (totals, tax, date,
  currency, SKU match) using `zod`; preprocessing (deskew/denoise/rotation) consolidated;
  Arabic/English mixed-invoice test corpus + golden tests.
- **P2 — Provider abstraction + MiniCPM-V**
  A single extraction provider interface in the service; pluggable backends
  (pdfplumber-text / PaddleOCR / Tesseract / Gemini / **MiniCPM-V**) with capability flags
  and graceful fallback. No client changes required.
- **P3 — Internal automation layer (n8n-inspired)**
  Typed trigger→action engine (triggers: `ocr.completed`, `stock.low`, `invoice.posted`;
  actions: email/WhatsApp/sync/approval). Persisted, observable, idempotent. Optional
  n8n bridge via outbound webhooks.
- **P4 — Performance & vision**
  Query indexing review, list virtualization audit, Tauri startup/memory profiling,
  background workers for heavy parsing; optional Ultralytics inventory/POS vision service.
- **P5 — AI assistant & semantic search**
  Embeddings over products/customers/invoices (pgvector), assistant with tool-calling over
  read-only ERP queries, smart autofill/categorization.

## 4. Risk register

| Risk | Mitigation |
| ---- | ---------- |
| A too-strict CSP can white-screen the desktop build | Separate permissive `devCsp`; production `connect-src` pinned to Supabase + localhost service; **must be smoke-tested with `tauri dev` and `tauri build` before release** |
| Disabling `withGlobalTauri` could break runtime detection | Replaced `window.__TAURI__` checks with `isTauriRuntime()` which reads `__TAURI_INTERNALS__` (always injected) — verified by typecheck |
| Tightened CORS could block an unlisted web origin | Origins are env-configurable (`EXTRACTION_ALLOWED_ORIGINS`); defaults cover Tauri + dev |
| Extraction service `/extract` has no authentication | Tracked for a later phase; service is intended to run locally next to the client. Documented in `docs/SECURITY.md` |
| Heavy ML providers (MiniCPM-V, Ultralytics) increase footprint | Kept as optional, out-of-process services behind HTTP; never bundled into the client |

## 5. Verification (P0)

- `npm run typecheck` → exit 0
- `npm run lint` → exit 0
- `python3 -m py_compile services/extraction-service/main.py` → OK
- `node -e "JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json'))"` → valid
- **Manual (required before release):** `npm run tauri:dev` — confirm the app loads, a
  Supabase request succeeds, the OCR upload reaches the extraction service, and the
  console shows no CSP violations.
