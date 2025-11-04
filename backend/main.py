"""
SignaAI Backend - Production Version with Authentication
Complete backend with signup/signin functionality
"""

import os
import logging
from fastapi import FastAPI, HTTPException, Depends, status, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any, List
import httpx
import google.generativeai as genai
from datetime import datetime, timedelta
import hashlib
import jwt
import json
from twilio.rest import Client
import secrets
import uuid

# Import database support
try:
    from sqlalchemy.orm import Session
    from database import get_db
except ImportError:
    # Fallback if database module doesn't exist
    def get_db():
        return None

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="SignaAI API",
    version="1.0.0",
    description="SignaAI Backend API for Document Processing with Authentication"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins in production for now
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-key-for-production-2024")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Configure Gemini AI
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyCtw5XG_XTbxxNRajkbGWj9feoaqwFoptA")
genai.configure(api_key=GEMINI_API_KEY)

# Configure Twilio
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "")

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

# In-memory user storage (for demo - in production use database)
users_db = {}
documents_db = {}
sessions_db = {}
signing_tokens_db = {}  # Store signing tokens for verification
workflows_db = {}  # Store workflows

# Models
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    phone: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    id: str
    email: str
    name: str
    role: str = "sender"
    phone: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User

class DocumentRequest(BaseModel):
    content: str
    document_type: Optional[str] = "general"
    language: Optional[str] = "en"

class Document(BaseModel):
    id: str
    title: str
    status: str = "pending"
    uploadedAt: datetime
    signers: List[Dict[str, Any]] = []
    fields: List[Dict[str, Any]] = []

# Helper functions
def hash_password(password: str) -> str:
    """Hash password using SHA256"""
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password"""
    return hash_password(plain_password) == hashed_password

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """Get current user from token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_email = payload.get("sub")
        if user_email is None or user_email not in users_db:
            raise HTTPException(status_code=401, detail="Invalid authentication")
        user_data = users_db[user_email]
        return User(**user_data)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid authentication")

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
            "auth": {
                "register": "/api/v1/auth/register",
                "login": "/api/v1/auth/login"
            },
            "api": {
                "process": "/api/v1/process",
                "documents": "/api/v1/documents",
                "sessions": "/api/v1/sessions"
            }
        }
    }

# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "signaai-backend",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat()
    }

# Authentication endpoints
@app.post("/api/v1/auth/register", response_model=Token)
async def register(user: UserRegister):
    """Register new user"""
    try:
        # Check if user exists
        if user.email in users_db:
            raise HTTPException(
                status_code=400,
                detail="Email already registered"
            )
        
        # Create user
        user_id = str(len(users_db) + 1)
        user_data = {
            "id": user_id,
            "email": user.email,
            "name": user.name,
            "role": "sender",
            "phone": user.phone,
            "password": hash_password(user.password)
        }
        users_db[user.email] = user_data
        
        # Create token
        access_token = create_access_token(
            data={"sub": user.email},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        
        # Return user without password
        user_response = User(
            id=user_id,
            email=user.email,
            name=user.name,
            role="sender",
            phone=user.phone
        )
        
        logger.info(f"New user registered: {user.email}")
        
        return Token(
            access_token=access_token,
            user=user_response
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/auth/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Login user"""
    try:
        # Find user
        user_data = users_db.get(form_data.username)
        if not user_data:
            raise HTTPException(
                status_code=401,
                detail="Invalid credentials"
            )
        
        # Verify password
        if not verify_password(form_data.password, user_data["password"]):
            raise HTTPException(
                status_code=401,
                detail="Invalid credentials"
            )
        
        # Create token
        access_token = create_access_token(
            data={"sub": user_data["email"]},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        
        # Return user without password
        user_response = User(
            id=user_data["id"],
            email=user_data["email"],
            name=user_data["name"],
            role=user_data.get("role", "sender"),
            phone=user_data.get("phone")
        )
        
        logger.info(f"User logged in: {user_data['email']}")
        
        return Token(
            access_token=access_token,
            user=user_response
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# API v1 endpoints for frontend compatibility
@app.get("/api/v1/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user info"""
    return current_user

# Add /api/v1/users/me endpoint for compatibility
@app.get("/api/v1/users/me", response_model=User)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user info"""
    return current_user

# User settings endpoints
@app.get("/api/v1/users/settings", response_model=Dict[str, Any])
async def get_user_settings(current_user: dict = Depends(get_current_user)):
    """Get user settings"""
    return {
        "user": {
            "id": current_user["id"],
            "email": current_user["email"],
            "name": current_user.get("name", ""),
            "phone": current_user.get("phone", ""),
            "role": current_user.get("role", "user")
        },
        "notifications": {
            "email": True,
            "sms": True,
            "whatsapp": False
        },
        "preferences": {
            "language": "en",
            "timezone": "UTC",
            "dateFormat": "MM/DD/YYYY"
        }
    }

@app.put("/api/v1/users/settings", response_model=Dict[str, Any])
async def update_user_settings(
    settings: Dict[str, Any],
    current_user: dict = Depends(get_current_user)
):
    """Update user settings"""
    # In production, save to database
    return {
        "message": "Settings updated successfully",
        "settings": settings
    }

# Document endpoints
@app.post("/api/v1/documents")
async def create_document(document: Dict[str, Any], current_user: User = Depends(get_current_user)):
    """Create new document"""
    doc_id = str(len(documents_db) + 1)
    doc = {
        "id": doc_id,
        "userId": current_user.id,
        "createdAt": datetime.utcnow().isoformat(),
        **document
    }
    documents_db[doc_id] = doc
    return doc

@app.post("/api/v1/documents/create")
async def create_document_workflow(data: Dict[str, Any], current_user: User = Depends(get_current_user)):
    """Create document with workflow and send SMS invitations"""
    doc_id = str(uuid.uuid4())
    
    # Get FRONTEND_URL
    frontend_url = os.getenv("FRONTEND_URL", "https://signaai-frontend-691837885081.us-central1.run.app")
    
    # Detect document language (default to Hebrew for heskem.pdf)
    document_language = 'hebrew' if 'heskem' in data.get('title', '').lower() else 'english'
    
    # Process signers and generate unique tokens
    processed_signers = []
    for signer in data.get("signers", []):
        # Generate unique signing token for each signer
        signing_token = secrets.token_urlsafe(32)
        
        # Store token for verification
        signing_tokens_db[signing_token] = {
            "document_id": doc_id,
            "signer_email": signer.get("email"),
            "signer_name": signer.get("name"),
            "signer_phone": signer.get("phone"),
            "created_at": datetime.utcnow().isoformat(),
            "expires_at": (datetime.utcnow() + timedelta(days=7)).isoformat()
        }
        
        # Add token to signer data
        signer_data = {
            **signer,
            "token": signing_token,
            "status": "pending",
            "invited_at": datetime.utcnow().isoformat()
        }
        processed_signers.append(signer_data)
        
        # Send SMS if phone number provided
        if signer.get("phone"):
            try:
                # Generate signing link with unique token
                signing_link = f"{frontend_url}/sign/{signing_token}"
                
                # Create multi-language message
                if document_language == 'hebrew':
                    message_body = f"שלום {signer.get('name', 'חבר/ה')},\n\nהוזמנת לחתום על המסמך '{data.get('title', 'מסמך')}'.\n\nלחתימה: {signing_link}\n\n- צוות SignaAI"
                elif document_language == 'arabic':
                    message_body = f"مرحبا {signer.get('name', '')},\n\nتمت دعوتك للتوقيع على '{data.get('title', 'مستند')}'.\n\nللتوقيع: {signing_link}\n\n- فريق SignaAI"
                else:
                    message_body = f"Hello {signer.get('name', 'there')},\n\nYou've been invited to sign '{data.get('title', 'Document')}'.\n\nClick here to sign: {signing_link}\n\n- SignaAI Team"
                
                # Send SMS using Twilio
                client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
                message = client.messages.create(
                    body=message_body,
                    from_=TWILIO_PHONE_NUMBER,
                    to=signer.get('phone')
                )
                logger.info(f"✅ SMS sent to {signer.get('phone')}: {message.sid}")
                logger.info(f"   Signing link: {signing_link}")
                logger.info(f"   Token: {signing_token[:8]}...")
                    
            except Exception as e:
                logger.error(f"❌ Failed to send SMS to {signer.get('phone')}: {str(e)}")
    
    # Create document with processed signers
    doc = {
        "id": doc_id,
        "userId": current_user.id,
        "title": data.get("title", "Untitled Document"),
        "file_path": data.get("file_path"),
        "signers": processed_signers,
        "fields": data.get("fields", []),
        "workflow": data.get("workflow", {}),
        "status": "pending",
        "language": document_language,
        "createdAt": datetime.utcnow().isoformat()
    }
    documents_db[doc_id] = doc
    
    # Log document creation
    logger.info(f"📄 Document created: {doc_id} with {len(processed_signers)} signers")
    for signer in processed_signers:
        logger.info(f"   - {signer.get('name')} ({signer.get('email')}, {signer.get('phone')}) - Token: {signer.get('token')[:8]}...")
    
    # Return success with document ID
    return {"id": doc_id, "message": "Document created and SMS invitations sent", **doc}

@app.get("/api/v1/documents")
async def get_documents(current_user: User = Depends(get_current_user)):
    """Get user documents"""
    user_docs = [
        doc for doc in documents_db.values() 
        if doc.get("userId") == current_user.id
    ]
    return user_docs

@app.get("/api/v1/documents/{doc_id}")
async def get_document(doc_id: str, current_user: User = Depends(get_current_user)):
    """Get specific document"""
    doc = documents_db.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.get("userId") != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return doc

# Public signing endpoints (no auth required)
@app.get("/api/v1/signing/documents/{token}")
async def get_document_for_signing(token: str):
    """Get document by signing token (PUBLIC - no auth required)"""
    # Validate token
    token_data = signing_tokens_db.get(token)
    if not token_data:
        # Try as document ID for backward compatibility
        doc = documents_db.get(token)
        if not doc:
            raise HTTPException(status_code=404, detail="Invalid signing link")
        document_id = token
        signer_name = "Guest"
    else:
        # Check if token is expired
        expires_at = datetime.fromisoformat(token_data['expires_at'])
        if datetime.utcnow() > expires_at:
            raise HTTPException(status_code=400, detail="Signing link has expired")
        
        document_id = token_data['document_id']
        signer_name = token_data.get('signer_name', 'Guest')
        
        # Get document
        doc = documents_db.get(document_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
    
    # Return document info without sensitive data
    return {
        "id": doc["id"],
        "title": doc.get("title", "Untitled Document"),
        "content": doc.get("content", ""),
        "fields": doc.get("fields", []),
        "status": doc.get("status", "pending"),
        "createdAt": doc.get("createdAt"),
        "signerName": signer_name,
        "documentId": document_id,
        "token": token,
        "language": doc.get("language", "english")
    }

@app.post("/api/v1/signing/documents/{document_id}/submit")
async def submit_signature(document_id: str, signature_data: dict):
    """Submit signature for a document (PUBLIC - no auth required)"""
    doc = documents_db.get(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Update document status
    doc["status"] = "signed"
    doc["signedAt"] = datetime.utcnow().isoformat()
    doc["signatureData"] = signature_data.get("signature_data", {})
    
    return {"message": "Document signed successfully", "documentId": document_id}

# Session endpoints
@app.post("/api/v1/sessions")
async def create_session(session: Dict[str, Any], current_user: User = Depends(get_current_user)):
    """Create signing session"""
    session_id = str(len(sessions_db) + 1)
    session_data = {
        "id": session_id,
        "userId": current_user.id,
        "createdAt": datetime.utcnow().isoformat(),
        "status": "active",
        **session
    }
    sessions_db[session_id] = session_data
    return session_data

@app.get("/api/v1/sessions/{session_id}")
async def get_session(session_id: str):
    """Get session (public for signers)"""
    session = sessions_db.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

# Document processing with OCR integration
@app.post("/api/v1/documents/process")
async def process_document_with_ocr(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Process document through OCR service and store results"""
    try:
        # Read file content
        content = await file.read()

        # Call OCR service
        ocr_service_url = os.getenv("OCR_SERVICE_URL", "http://localhost:5113")

        async with httpx.AsyncClient(timeout=60.0) as client:
            files = {'file': (file.filename, content, file.content_type)}
            response = await client.post(f"{ocr_service_url}/detect-fields", files=files)

            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="OCR service error")

            ocr_result = response.json()

        # Create document record
        doc_id = str(uuid.uuid4())
        document = {
            "document_id": doc_id,
            "user_id": current_user.id,
            "filename": file.filename,
            "pages": ocr_result.get("analysis_results", []),
            "fields": [],
            "total_pages": ocr_result.get("total_pages", 0),
            "total_fields": ocr_result.get("total_fields", 0),
            "processing_time_ms": ocr_result.get("processing_time_ms", 0),
            "created_at": datetime.utcnow().isoformat(),
            "status": "processed"
        }

        # Extract fields from analysis_results
        for page_data in ocr_result.get("analysis_results", []):
            for field in page_data.get("fields", []):
                document["fields"].append({
                    "page": page_data.get("page", 1),
                    "type": field.get("type"),
                    "bounding_box": field.get("bounding_box"),
                    "confidence": field.get("confidence", 0),
                    "label": field.get("label", "")
                })

        # Store document
        documents_db[doc_id] = document

        logger.info(f"Document processed: {doc_id} with {document['total_fields']} fields")

        return document

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Document processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Old document processing endpoint
@app.post("/api/v1/process")
async def process_document(request: DocumentRequest):
    """Process document with Gemini AI"""
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        
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
        
        return {
            "status": "success",
            "message": "Document processed successfully",
            "data": {
                "analysis": response.text,
                "document_type": request.document_type,
                "language": request.language
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# SMS notification
@app.post("/api/v1/notify")
async def send_notification(phone: str, message: str):
    """Send SMS notification"""
    try:
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        
        message = client.messages.create(
            body=message,
            from_=TWILIO_PHONE_NUMBER,
            to=phone
        )
        
        logger.info(f"SMS sent to {phone}: {message.sid}")
        return {"status": "sent", "sid": message.sid}
        
    except Exception as e:
        logger.error(f"SMS error: {str(e)}")
        return {"status": "error", "message": str(e)}

# Dashboard stats
@app.get("/api/v1/dashboard/stats")
async def get_dashboard_stats(current_user: User = Depends(get_current_user)):
    """Get dashboard statistics"""
    user_docs = [
        doc for doc in documents_db.values() 
        if doc.get("userId") == current_user.id
    ]
    
    return {
        "totalDocuments": len(user_docs),
        "pendingSignatures": sum(1 for doc in user_docs if doc.get("status") == "pending"),
        "completedThisMonth": sum(1 for doc in user_docs if doc.get("status") == "completed"),
        "totalSigners": sum(len(doc.get("signers", [])) for doc in user_docs)
    }

# Workflow creation
@app.post("/api/v1/workflows/create")
async def create_workflow(workflow_data: Dict[Any, Any]):
    """Create a signing workflow"""
    try:
        workflow_id = str(uuid.uuid4())

        # Store workflow in memory for now
        workflows_db[workflow_id] = {
            "workflow_id": workflow_id,
            "document_id": workflow_data.get("document_id"),
            "title": workflow_data.get("title"),
            "signers": workflow_data.get("signers", []),
            "fields": workflow_data.get("fields", []),
            "workflow": workflow_data.get("workflow", {}),
            "created_at": datetime.utcnow().isoformat(),
            "status": "pending"
        }

        logger.info(f"Workflow created: {workflow_id}")
        return {"workflow_id": workflow_id, "status": "created"}

    except Exception as e:
        logger.error(f"Workflow creation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Create demo user for testing
@app.on_event("startup")
async def startup_event():
    """Create demo user on startup"""
    demo_user = {
        "id": "demo1",
        "email": "demo@signaai.com",
        "name": "Demo User",
        "role": "sender",
        "phone": "+972501234567",
        "password": hash_password("Demo123!")
    }
    users_db["demo@signaai.com"] = demo_user
    logger.info("Demo user created: demo@signaai.com / Demo123!")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 5112))
    uvicorn.run(app, host="0.0.0.0", port=port)