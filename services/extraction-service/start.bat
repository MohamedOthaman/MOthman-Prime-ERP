@echo off
title ERP Extraction Service
cd /d "%~dp0"

echo ============================================
echo  ERP Invoice Extraction Service v2.0
echo ============================================
echo.

REM Check if venv exists, create if not
if not exist "venv\Scripts\activate.bat" (
    echo [SETUP] Creating Python virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo [ERROR] Failed to create venv. Make sure Python 3.9+ is installed.
        pause
        exit /b 1
    )
)

echo [SETUP] Activating virtual environment...
call venv\Scripts\activate.bat

REM Install/upgrade dependencies
echo [SETUP] Installing dependencies (this may take a few minutes on first run)...
pip install -r requirements.txt --quiet

REM Set Poppler path if it exists in common locations
if exist "C:\Program Files\poppler\Library\bin\pdfinfo.exe" (
    set POPPLER_PATH=C:\Program Files\poppler\Library\bin
    echo [SETUP] Poppler found at: %POPPLER_PATH%
) else if exist "C:\poppler\Library\bin\pdfinfo.exe" (
    set POPPLER_PATH=C:\poppler\Library\bin
    echo [SETUP] Poppler found at: %POPPLER_PATH%
) else (
    echo [WARN]  Poppler not found in common locations. Scanned PDF support may be limited.
    echo         Download: https://github.com/oschwartz10612/poppler-windows/releases
    echo         Extract and set POPPLER_PATH env var to the bin/ folder.
)

echo.
echo [INFO]  Starting server on http://127.0.0.1:8000
echo [INFO]  Health check: http://127.0.0.1:8000/health
echo [INFO]  API docs:     http://127.0.0.1:8000/docs
echo [INFO]  Press Ctrl+C to stop
echo.

python main.py

pause
