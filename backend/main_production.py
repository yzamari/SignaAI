"""
SignaAI Backend - Production Version with Authentication
Complete backend with signup/signin functionality
"""

import os
import logging
from fastapi import FastAPI, HTTPException, Depends, status
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

# Document processing
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
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)