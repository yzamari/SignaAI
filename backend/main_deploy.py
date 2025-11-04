"""
SignaAI Backend - Production Deployment
Minimal version for Cloud Run deployment
"""

import os
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
import httpx
import google.generativeai as genai
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="SignaAI API",
    version="1.0.0",
    description="SignaAI Backend API for Document Processing"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Gemini AI
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyCtw5XG_XTbxxNRajkbGWj9feoaqwFoptA")
genai.configure(api_key=GEMINI_API_KEY)

# Request/Response Models
class DocumentRequest(BaseModel):
    content: str
    document_type: Optional[str] = "general"
    language: Optional[str] = "en"

class ProcessResponse(BaseModel):
    status: str
    message: str
    data: Optional[Dict[str, Any]] = None
    timestamp: str

class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    timestamp: str

# Health check endpoint
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint for Cloud Run"""
    return HealthResponse(
        status="healthy",
        service="signaai-backend",
        version="1.0.0",
        timestamp=datetime.utcnow().isoformat()
    )

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "SignaAI Backend API",
        "status": "running",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "docs": "/docs",
            "process": "/api/v1/process"
        }
    }

# Document processing endpoint
@app.post("/api/v1/process", response_model=ProcessResponse)
async def process_document(request: DocumentRequest):
    """Process document with Gemini AI"""
    try:
        # Initialize Gemini model
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        # Process the document
        prompt = f"""
        Analyze the following document:
        Type: {request.document_type}
        Language: {request.language}
        
        Content:
        {request.content}
        
        Please provide:
        1. A summary of the document
        2. Key information extracted
        3. Any recommendations or insights
        """
        
        response = model.generate_content(prompt)
        
        return ProcessResponse(
            status="success",
            message="Document processed successfully",
            data={
                "analysis": response.text,
                "document_type": request.document_type,
                "language": request.language
            },
            timestamp=datetime.utcnow().isoformat()
        )
    except Exception as e:
        logger.error(f"Error processing document: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# SMS notification endpoint (placeholder)
@app.post("/api/v1/notify")
async def send_notification(phone: str, message: str):
    """Send SMS notification"""
    try:
        # For now, just log the notification
        logger.info(f"Notification to {phone}: {message}")
        
        # In production, integrate with Twilio
        if os.getenv("TWILIO_ACCOUNT_SID"):
            from twilio.rest import Client
            account_sid = os.getenv("TWILIO_ACCOUNT_SID")
            auth_token = os.getenv("TWILIO_AUTH_TOKEN")
            from_phone = os.getenv("TWILIO_PHONE_NUMBER")
            
            client = Client(account_sid, auth_token)
            message = client.messages.create(
                body=message,
                from_=from_phone,
                to=phone
            )
            return {"status": "sent", "sid": message.sid}
        
        return {"status": "logged", "message": "SMS service not configured"}
    except Exception as e:
        logger.error(f"Error sending notification: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Error handling
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "message": exc.detail,
            "timestamp": datetime.utcnow().isoformat()
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "message": "Internal server error",
            "timestamp": datetime.utcnow().isoformat()
        }
    )

# Run the application (for local testing)
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)