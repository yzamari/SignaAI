#!/usr/bin/env python3
"""
OCR-based Field Detection API Service
Traditional image processing approach using Tesseract OCR
"""

import logging
import time
import base64
import io
import cv2
import numpy as np
from typing import Dict, Any, List
from contextlib import asynccontextmanager
from PIL import Image
import pdf2image

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

try:
    from .ocr_detector import OCRFieldDetector
except ImportError:
    from ocr_detector import OCRFieldDetector

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global detector instance
ocr_detector = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown"""
    global ocr_detector
    
    # Startup
    logger.info("🚀 OCR Field Detection Service starting up...")
    
    try:
        ocr_detector = OCRFieldDetector()
        logger.info("✅ OCR Field Detection Service initialized successfully")
        
        yield
        
    except Exception as e:
        logger.error(f"❌ Failed to initialize OCR service: {e}", exc_info=True)
        raise
    finally:
        # Shutdown
        logger.info("⏹️ OCR Field Detection Service shutting down...")


# FastAPI application
app = FastAPI(
    title="SignaAI OCR Field Detection Service",
    description="Traditional OCR-based field detection using Tesseract and OpenCV",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    version: str
    timestamp: float
    service: str = "ocr-field-detection"
    method: str = "Tesseract OCR + OpenCV"


@app.get("/", response_model=Dict[str, str])
async def root():
    """Root endpoint"""
    return {
        "service": "SignaAI OCR Field Detection Service",
        "version": "1.0.0",
        "status": "running",
        "method": "Tesseract OCR + OpenCV",
        "docs": "/docs"
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        version="1.0.0",
        timestamp=time.time()
    )


@app.post("/detect-fields")
async def detect_fields_ocr(
    file: UploadFile = File(..., description="PDF file to analyze with OCR")
):
    """
    Detect fillable fields in a PDF document using OCR
    
    Args:
        file: PDF file to analyze
        
    Returns:
        OCR-based analysis results with detected fields
    """
    start_time = time.time()
    
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported"
        )
    
    try:
        logger.info(f"Starting OCR field detection for file: {file.filename}")
        
        # Read file bytes
        pdf_bytes = await file.read()
        if len(pdf_bytes) == 0:
            raise HTTPException(
                status_code=400,
                detail="Empty file provided"
            )
        
        # Analyze document with OCR
        global ocr_detector
        if ocr_detector is None:
            raise HTTPException(
                status_code=500,
                detail="OCR detector not initialized"
            )
        
        results = ocr_detector.detect_fillable_fields_from_bytes(pdf_bytes, file.filename)
        
        if "error" in results:
            raise HTTPException(
                status_code=500,
                detail=f"OCR analysis failed: {results['error']}"
            )
        
        total_time = time.time() - start_time
        # Add visualizations for debugging
        results = add_visualizations(pdf_bytes, results)
        
        results["processing_time_ms"] = total_time * 1000
        
        logger.info(f"OCR field detection completed in {total_time:.2f}s: {results['total_fields']} fields found")
        
        return results
        
    except HTTPException as e:
        raise
    except Exception as e:
        total_time = time.time() - start_time
        logger.error(f"OCR field detection failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"OCR field detection failed: {str(e)}"
        )


@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc: HTTPException):
    """Handle HTTP exceptions"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "timestamp": time.time(),
            "service": "ocr-field-detection"
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc: Exception):
    """Handle general exceptions"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc),
            "timestamp": time.time(),
            "service": "ocr-field-detection"
        }
    )


def add_visualizations(pdf_bytes: bytes, results: Dict[str, Any]) -> Dict[str, Any]:
    """
    Add visualization data to results including original images and overlayed images
    
    Args:
        pdf_bytes: PDF file bytes
        results: Detection results
        
    Returns:
        Enhanced results with visualizations
    """
    try:
        # Convert PDF to images - MUST match DPI used in OCR detector (300)
        images = pdf2image.convert_from_bytes(pdf_bytes, dpi=300)
        
        # Add visualizations for each page
        for page_data in results.get("analysis_results", []):
            page_num = page_data.get("page", 1)
            if page_num <= len(images):
                img = images[page_num - 1]
                
                # Convert PIL image to base64 for original image
                img_buffer = io.BytesIO()
                img.save(img_buffer, format='PNG')
                img_buffer.seek(0)
                original_base64 = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
                page_data["original_image"] = f"data:image/png;base64,{original_base64}"
                
                # Create overlayed image
                img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
                
                # Draw fields on image
                for field in page_data.get("fields", []):
                    bbox = field.get("bounding_box", {})
                    x = int(bbox.get("x", 0))
                    y = int(bbox.get("y", 0))
                    w = int(bbox.get("width", 0))
                    h = int(bbox.get("height", 0))
                    
                    # Different colors for different field types
                    color_map = {
                        'text_input': (255, 0, 0),      # Blue for text
                        'checkbox': (0, 255, 0),        # Green for checkbox
                        'signature': (0, 0, 255),       # Red for signature
                        'date': (255, 255, 0),          # Cyan for date
                    }
                    
                    field_type = field.get("type", "text_input")
                    color = color_map.get(field_type, (255, 0, 0))
                    
                    # Draw rectangle
                    cv2.rectangle(img_cv, (x, y), (x + w, y + h), color, 2)
                    
                    # Add label
                    label = field.get("label", field_type)
                    if label:
                        cv2.putText(img_cv, str(label)[:20], (x, y - 5), 
                                  cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
                
                # Convert overlayed image to base64
                _, buffer = cv2.imencode('.png', img_cv)
                overlayed_base64 = base64.b64encode(buffer).decode('utf-8')
                page_data["overlayed_image"] = f"data:image/png;base64,{overlayed_base64}"
                
                # Add field overlay data summary
                page_data["overlay_summary"] = {
                    "total_fields": len(page_data.get("fields", [])),
                    "field_types": {},
                    "coverage_percentage": 0
                }
                
                # Calculate field type counts
                for field in page_data.get("fields", []):
                    field_type = field.get("type", "unknown")
                    if field_type not in page_data["overlay_summary"]["field_types"]:
                        page_data["overlay_summary"]["field_types"][field_type] = 0
                    page_data["overlay_summary"]["field_types"][field_type] += 1
                
                # Calculate coverage percentage
                total_area = img.width * img.height
                field_area = 0
                for field in page_data.get("fields", []):
                    bbox = field.get("bounding_box", {})
                    field_area += bbox.get("width", 0) * bbox.get("height", 0)
                
                if total_area > 0:
                    page_data["overlay_summary"]["coverage_percentage"] = round((field_area / total_area) * 100, 2)
        
        # Add overall visualization summary
        results["visualization_summary"] = {
            "has_original_images": any("original_image" in p for p in results.get("analysis_results", [])),
            "has_overlayed_images": any("overlayed_image" in p for p in results.get("analysis_results", [])),
            "total_pages_with_overlays": sum(1 for p in results.get("analysis_results", []) if "overlayed_image" in p)
        }
        
    except Exception as e:
        logger.error(f"Failed to add visualizations: {e}")
        results["visualization_error"] = str(e)
    
    return results


# Development server
if __name__ == "__main__":
    import uvicorn
    
    logger.info("Starting OCR Field Detection Service in development mode...")
    uvicorn.run(
        "api:app",
        host="0.0.0.0",
        port=5113,  # OCR service port in 51XX range
        reload=True,
        log_level="info"
    )