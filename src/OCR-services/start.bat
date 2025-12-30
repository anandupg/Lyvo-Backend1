@echo off
REM OCR Service Startup Script for Windows

echo Starting Lyvo OCR Service with OCR.space API...

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo Python is not installed. Please install Python 3.8+ first.
    pause
    exit /b 1
)

REM Check if virtual environment exists
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Install dependencies
echo Installing dependencies...
pip install -r requirements.txt

REM Check if .env file exists
if not exist ".env" (
    echo Creating .env file from template...
    copy env.example .env
    echo Please edit .env file with your OCR.space API key before running again.
    echo Get your free API key from: https://ocr.space/
    pause
    exit /b 1
)

REM Check if OCR.space API key is configured
findstr /C:"OCR_SPACE_API_KEY=" .env | findstr /V "OCR_SPACE_API_KEY=$" >nul
if errorlevel 1 (
    echo Please configure your OCR.space API key in the .env file.
    echo Get your free API key from: https://ocr.space/
    pause
    exit /b 1
)

REM Start the service
echo Starting OCR Service on port 5003...
echo Using OCR.space API for text extraction...
python app.py

pause
