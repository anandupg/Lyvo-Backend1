#!/bin/bash

# OCR Service Startup Script
echo "Starting Lyvo OCR Service with OCR.space API..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is not installed. Please install Python 3.8+ first."
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "Creating .env file from template..."
    cp env.example .env
    echo "Please edit .env file with your OCR.space API key before running again."
    exit 1
fi

# Check if OCR.space API key is configured
if ! grep -q "OCR_SPACE_API_KEY=" .env || grep -q "OCR_SPACE_API_KEY=$" .env; then
    echo "Please configure your OCR.space API key in the .env file."
    echo "Get your free API key from: https://ocr.space/"
    exit 1
fi

# Start the service
echo "Starting OCR Service on port 5003..."
echo "Using OCR.space API for text extraction..."
python app.py
