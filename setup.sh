#!/bin/bash

# Setup script for Smart Content Aggregator (Mac/Linux)

echo "🚀 Starting Smart Content Aggregator Setup..."

# Check for Python
if ! command -v python3 &> /dev/null
then
    echo "❌ Python3 could not be found. Please install it from python.org."
    exit
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "📥 Installing dependencies (this may take a minute)..."
pip install -r requirements.txt

# Start the application
echo "✅ Setup complete! Starting the app..."
python3 app.py
