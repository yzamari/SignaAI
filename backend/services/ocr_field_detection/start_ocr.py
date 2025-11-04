#!/usr/bin/env python3
"""
Start the OCR Field Detection Service
This handles the import issues properly
"""

import sys
import os

# Add parent directory to path to resolve imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Now import and run the app
from api import app
import uvicorn

if __name__ == "__main__":
    print("Starting Real OCR Field Detection Service...")
    print("This will use actual Tesseract OCR, not mock data")
    uvicorn.run(
        "api:app",
        host="0.0.0.0",
        port=5113,
        reload=True,
        log_level="info"
    )