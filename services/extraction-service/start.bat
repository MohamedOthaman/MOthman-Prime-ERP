@echo off
setlocal EnableDelayedExpansion
title ERP Extraction Service v2.1
cd /d "%~dp0"

echo.
echo  ============================================================
echo   ERP Invoice Extraction Service v2.1
echo   Local AI pipeline: PaddleOCR + pdfplumber + Gemini 2.5
echo  ============================================================
echo.

REM ── 1. Check Python 3.9+ is available ────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found in PATH.
    echo         Install Python 3.10+ from https://python.org/downloads
    echo         Make sure "Add Python to PATH" is checked during install.
    echo.
    pause
    exit /b 1
)
for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo [OK]    Python %PYVER% found

REM ── 2. Create venv if needed ─────────────────────────────────────────────────
if not exist "venv\Scripts\activate.bat" (
    echo [SETUP] Creating virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo [ERROR] Failed to create venv.
        pause
        exit /b 1
    )
    echo [OK]    Virtual environment created.
)

echo [SETUP] Activating virtual environment...
call venv\Scripts\activate.bat

REM ── 3. Upgrade pip silently ───────────────────────────────────────────────────
echo [SETUP] Upgrading pip...
python -m pip install --upgrade pip --quiet

REM ── 4. Install dependencies ───────────────────────────────────────────────────
echo [SETUP] Installing/verifying dependencies (first run may take 2-5 minutes)...
pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo [ERROR] Dependency installation failed. Check internet connection.
    pause
    exit /b 1
)
echo [OK]    Dependencies ready.

REM ── 5. Detect Poppler (needed for scanned PDFs) ───────────────────────────────
set POPPLER_FOUND=0
if exist "C:\Program Files\poppler\Library\bin\pdfinfo.exe" (
    set POPPLER_PATH=C:\Program Files\poppler\Library\bin
    set POPPLER_FOUND=1
) else if exist "C:\poppler\Library\bin\pdfinfo.exe" (
    set POPPLER_PATH=C:\poppler\Library\bin
    set POPPLER_FOUND=1
) else if exist "C:\tools\poppler\Library\bin\pdfinfo.exe" (
    set POPPLER_PATH=C:\tools\poppler\Library\bin
    set POPPLER_FOUND=1
) else if exist "C:\Program Files\poppler-windows\Library\bin\pdfinfo.exe" (
    set POPPLER_PATH=C:\Program Files\poppler-windows\Library\bin
    set POPPLER_FOUND=1
)

if "!POPPLER_FOUND!"=="1" (
    echo [OK]    Poppler found at: !POPPLER_PATH!
) else (
    echo [WARN]  Poppler not found — scanned PDF support will be limited.
    echo         Download: https://github.com/oschwartz10612/poppler-windows/releases
    echo         Extract to C:\poppler\ and re-run this script.
    echo         Digital PDFs and images will still work without Poppler.
)

REM ── 6. Ensure Gemini API key is set ──────────────────────────────────────────
if not exist ".env" (
    echo.
    echo [SETUP] No .env file found. Creating from template...
    copy .env.example .env >nul 2>&1
    echo.
    echo  *** IMPORTANT: Gemini API Key Required ***
    echo  Open services\extraction-service\.env in a text editor
    echo  and replace "your_gemini_api_key_here" with your actual key.
    echo  Get a free key at: https://aistudio.google.com/app/apikey
    echo.
)

REM Check if key is still the placeholder
findstr /c:"your_gemini_api_key_here" .env >nul 2>&1
if not errorlevel 1 (
    echo [WARN]  Gemini API key is still the placeholder value.
    echo         Edit .env and set GEMINI_API_KEY= to your real key,
    echo         OR open the ERP and enter the key via the Upload PO button.
    echo.
)

REM ── 7. Start server ───────────────────────────────────────────────────────────
echo.
echo  ────────────────────────────────────────────────────────────
echo   Server starting on http://127.0.0.1:8000
echo   Health check:  http://127.0.0.1:8000/health
echo   API docs:      http://127.0.0.1:8000/docs
echo   Press Ctrl+C to stop
echo  ────────────────────────────────────────────────────────────
echo.

python main.py

echo.
echo [INFO]  Server stopped.
pause
