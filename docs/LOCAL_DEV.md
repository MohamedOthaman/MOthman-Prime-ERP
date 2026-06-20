# Local Development

This guide is for running the ERP locally after the large merge set. Keep local work isolated from production services.

## Required Tools

- Node.js: use the current repo-tested runtime, Node `24.x` (`node --version` showed `v24.14.0`).
- Rust: stable Rust with Cargo (`rustc --version` showed `1.95.0`).
- Python: Python `3.10+` for the extraction service (`python --version` showed `3.13.13`).
- Windows WebView2 runtime for Tauri desktop.

## Install

From the repo root:

```powershell
npm install
```

Create local env files from the examples as needed:

```powershell
Copy-Item .env.example .env
Copy-Item services\extraction-service\.env.example services\extraction-service\.env
```

Use publishable Supabase values only. Do not add a service role key to `.env`.

## Frontend

Run the browser frontend:

```powershell
npm run dev
```

The Vite default for non-Tauri local hosting is `http://localhost:8080`.

## Tauri App

Run the desktop app:

```powershell
npm run tauri:dev
```

Tauri starts Vite on the default frontend port `1420` and opens the desktop shell at `http://localhost:1420`.

## Extraction Service

The extraction service lives in `services/extraction-service` and defaults to port `8000`.

Quick Windows start:

```powershell
cd services\extraction-service
.\start.bat
```

Manual start:

```powershell
cd services\extraction-service
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python main.py
```

Default extraction service URL:

```text
http://127.0.0.1:8000
```

Verify health:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

Expected result: JSON with `"status": "healthy"` plus provider availability fields. Missing optional providers may show as unavailable; that is not the same as the service failing to start.

## Ports

- Tauri frontend: `1420`
- Extraction service: `8000`
- Optional browser hosting: `8080`

### Fix Port 1420 Already In Use

Find the process:

```powershell
Get-NetTCPConnection -LocalPort 1420 -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess
Get-Process -Id <PID>
```

Stop it:

```powershell
Stop-Process -Id <PID> -Force
```

If the process is a stuck local dev process, it is usually safe to stop `node`, `vite`, `cargo`, or `food_choice_erp` processes that belong to this repo.

### Fix Port 8000 Already In Use

Find the process:

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess
Get-Process -Id <PID>
```

Stop it:

```powershell
Stop-Process -Id <PID> -Force
```

If it is the local extraction service, the process is usually `python`.

## Stop Stuck Local Processes On Windows

Use this only for stuck local development processes. Check the process list before stopping broad names.

```powershell
Get-Process node,vite,cargo,food_choice_erp,python -ErrorAction SilentlyContinue
```

Stop a specific process:

```powershell
Stop-Process -Id <PID> -Force
```

Stop all matching local process names when you are sure they are only dev processes:

```powershell
Get-Process node,vite,cargo,food_choice_erp,python -ErrorAction SilentlyContinue | Stop-Process -Force
```

## Quality Checks

Run the frontend checks:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Optional grouped checks:

```powershell
npm run check:frontend
npm run check:tauri
npm run check:python
npm run check
```

## Do Not Do Locally

- Do not run production Supabase migrations.
- Do not apply migrations unless a task explicitly approves local migration work.
- Do not change RLS policies.
- Do not point local testing at the production database for write flows.
- Do not put `SUPABASE_SERVICE_ROLE_KEY` in `.env`, `.env.example`, or any `VITE_*` variable.
- Do not commit real secrets.
