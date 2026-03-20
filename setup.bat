@echo off
TITLE Smart Content Aggregator Setup

echo 🚀 Starting Smart Content Aggregator Setup...

:: Check for Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Python could not be found. Please install it from python.org.
    pause
    exit
)

:: Create virtual environment if it doesn't exist
if not exist "venv" (
    echo 📦 Creating virtual environment...
    python -m venv venv
)

:: Activate virtual environment
call venv\Scripts\activate

:: Install dependencies
echo 📥 Installing dependencies (this may take a minute)...
pip install -r requirements.txt

:: Start the application
echo ✅ Setup complete! Starting the app...
python app.py
pause
