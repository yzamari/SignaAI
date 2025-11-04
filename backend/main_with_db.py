"""
SignaAI Backend - Production Version with PostgreSQL Database
Complete backend with database persistence for documents and sessions
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
from sqlalchemy.orm import Session
from sqlalchemy import text
import uuid

# Simple database using PostgreSQL without complex models
import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="SignaAI API",
    version="1.0.0",
    description="SignaAI Backend API with Database Persistence"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

# Pydantic Models
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

class DocumentCreate(BaseModel):
    title: str
    content: str
    status: str = "pending"
    language: str = "en"
    signers: List[Dict[str, Any]] = []
    fields: List[Dict[str, Any]] = []

class SessionCreate(BaseModel):
    documentId: str
    status: str = "active"
    expiresAt: str
    signers: List[Dict[str, Any]]

# Helper functions
def hash_password(password: str) -> str:
    """Hash password using SHA256"""
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    return hash_password(plain_password) == hashed_password

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Get current user from JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception
    
    user = db.query(UserModel).filter(UserModel.email == email).first()
    if user is None:
        raise credentials_exception
    return user

# Startup event
@app.on_event("startup")
async def startup_event():
    """Initialize database on startup"""
    logger.info("Initializing database...")
    try:
        init_db()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")

# Root endpoint
@app.get("/")
async def root():
    return {"message": "SignaAI Backend API", "version": "1.0.0", "status": "operational"}

# Health check
@app.get("/health")
async def health(db: Session = Depends(get_db)):
    """Health check endpoint with database connectivity test"""
    try:
        # Test database connection
        db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        db_status = "error"
    
    return {
        "status": "healthy",
        "database": db_status,
        "timestamp": datetime.utcnow().isoformat()
    }

# Authentication endpoints
@app.post("/api/v1/auth/register", response_model=Token)
async def register(user_data: UserRegister, db: Session = Depends(get_db)):
    """Register new user"""
    # Check if user exists
    existing_user = db.query(UserModel).filter(UserModel.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    hashed_password = hash_password(user_data.password)
    new_user = UserModel(
        id=str(uuid.uuid4()),
        email=user_data.email,
        password_hash=hashed_password,
        name=user_data.name,
        phone=user_data.phone,
        role="sender",
        is_active=True
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Create token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user_data.email}, expires_delta=access_token_expires
    )
    
    user_response = User(
        id=str(new_user.id),
        email=new_user.email,
        name=new_user.name,
        role=new_user.role,
        phone=new_user.phone
    )
    
    return Token(access_token=access_token, user=user_response)

@app.post("/api/v1/auth/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Login user"""
    user = db.query(UserModel).filter(UserModel.email == form_data.username).first()
    
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    
    user_response = User(
        id=str(user.id),
        email=user.email,
        name=user.name,
        role=user.role,
        phone=user.phone
    )
    
    return Token(access_token=access_token, user=user_response)

@app.get("/api/v1/auth/me")
async def get_me(current_user: UserModel = Depends(get_current_user)):
    """Get current user info"""
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role,
        "phone": current_user.phone
    }

# Document endpoints
@app.post("/api/v1/documents")
async def create_document(
    doc_data: DocumentCreate, 
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Create a new document with signers and fields"""
    try:
        # Create document
        document = DocumentModel(
            id=uuid.uuid4(),
            user_id=current_user.id,
            title=doc_data.title,
            original_filename=f"{doc_data.title}.pdf",
            file_path=f"documents/{uuid.uuid4()}.pdf",
            file_size=len(doc_data.content.encode()),
            mime_type="application/pdf",
            document_hash=hashlib.sha256(doc_data.content.encode()).hexdigest(),
            status="ready",
            language_detected=doc_data.language,
            page_count=1,
            file_metadata={"content": doc_data.content}
        )
        
        db.add(document)
        db.flush()  # Get document ID before creating related records
        
        # Create signature fields
        for field_data in doc_data.fields:
            field = SignatureField(
                id=uuid.uuid4(),
                document_id=document.id,
                field_type=field_data.get("type", "signature"),
                page_number=1,
                x_position=field_data.get("x", 0.1),
                y_position=field_data.get("y", 0.1),
                width=0.2,
                height=0.05,
                is_required=field_data.get("required", True),
                field_label=field_data.get("label"),
                signer_email=doc_data.signers[field_data.get("signer", 0)]["email"] if field_data.get("signer") is not None and field_data.get("signer") < len(doc_data.signers) else None
            )
            db.add(field)
        
        db.commit()
        db.refresh(document)
        
        return {
            "id": str(document.id),
            "title": document.title,
            "status": document.status,
            "language": document.language_detected,
            "created_at": document.created_at.isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error creating document: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/signing/documents/{document_id}")
async def get_document_for_signing(document_id: str, db: Session = Depends(get_db)):
    """Get document by ID for signing (PUBLIC - no auth required)"""
    try:
        document = db.query(DocumentModel).filter(DocumentModel.id == document_id).first()
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Get signature fields
        fields = db.query(SignatureField).filter(SignatureField.document_id == document.id).all()
        
        return {
            "id": str(document.id),
            "title": document.title,
            "status": document.status,
            "language": document.language_detected,
            "content": document.file_metadata.get("content") if document.file_metadata else "",
            "fields": [field.to_dict() for field in fields],
            "created_at": document.created_at.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting document: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/documents/{document_id}")
async def get_document(document_id: str, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    """Get document by ID (requires authentication)"""
    try:
        document = db.query(DocumentModel).filter(
            DocumentModel.id == document_id,
            DocumentModel.user_id == current_user.id
        ).first()
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Get signature fields
        fields = db.query(SignatureField).filter(SignatureField.document_id == document.id).all()
        
        return {
            "id": str(document.id),
            "title": document.title,
            "status": document.status,
            "language": document.language_detected,
            "content": document.file_metadata.get("content") if document.file_metadata else "",
            "fields": [field.to_dict() for field in fields],
            "created_at": document.created_at.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting document: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/signing/documents/{document_id}/submit")
async def submit_signature(
    document_id: str,
    signature_data: dict,
    db: Session = Depends(get_db)
):
    """Submit signature for a document (PUBLIC - no auth required)"""
    try:
        document = db.query(DocumentModel).filter(DocumentModel.id == document_id).first()
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Update document status
        document.status = "signed"
        document.signed_at = datetime.utcnow()
        document.signature_data = signature_data
        
        db.commit()
        
        return {
            "success": True,
            "message": "Document signed successfully",
            "document_id": str(document.id)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting signature: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/documents")
async def list_documents(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """List user's documents"""
    documents = db.query(DocumentModel).filter(DocumentModel.user_id == current_user.id).all()
    return [doc.to_dict() for doc in documents]

# Session endpoints
@app.post("/api/v1/sessions")
async def create_session(
    session_data: SessionCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Create a signing session (workflow)"""
    try:
        # Verify document exists
        document = db.query(DocumentModel).filter(DocumentModel.id == session_data.documentId).first()
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Create workflow
        workflow = SignatureWorkflow(
            id=uuid.uuid4(),
            document_id=document.id,
            created_by=current_user.id,
            workflow_type="parallel",
            status="active",
            title=f"Signing session for {document.title}",
            deadline=datetime.fromisoformat(session_data.expiresAt.replace('Z', '+00:00')),
            require_email_verification=False,
            workflow_metadata={"signers": session_data.signers}
        )
        
        db.add(workflow)
        db.flush()
        
        # Create signers
        for signer_data in session_data.signers:
            signer = Signer(
                id=uuid.uuid4(),
                workflow_id=workflow.id,
                email=signer_data["email"],
                phone=signer_data.get("phone"),
                full_name=signer_data["name"],
                role=signer_data.get("role", "signer"),
                status="pending",
                invitation_token=str(uuid.uuid4())
            )
            db.add(signer)
        
        db.commit()
        db.refresh(workflow)
        
        return {
            "id": str(workflow.id),
            "documentId": str(workflow.document_id),
            "status": workflow.status,
            "created_at": workflow.created_at.isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating session: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/sessions/{session_id}")
async def get_session(session_id: str, db: Session = Depends(get_db)):
    """Get session by ID (public endpoint for signers)"""
    try:
        # Get workflow
        workflow = db.query(SignatureWorkflow).filter(SignatureWorkflow.id == session_id).first()
        if not workflow:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Get document
        document = db.query(DocumentModel).filter(DocumentModel.id == workflow.document_id).first()
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Get signers
        signers = db.query(Signer).filter(Signer.workflow_id == workflow.id).all()
        
        # Log session access
        logger.info(f"Session {session_id} accessed - Document: {document.title}")
        
        return {
            "id": str(workflow.id),
            "documentId": str(workflow.document_id),
            "document": {
                "id": str(document.id),
                "title": document.title,
                "content": document.file_metadata.get("content") if document.file_metadata else "",
                "language": document.language_detected
            },
            "status": workflow.status,
            "signers": [
                {
                    "id": str(signer.id),
                    "name": signer.full_name,
                    "email": signer.email,
                    "status": signer.status
                }
                for signer in signers
            ],
            "created_at": workflow.created_at.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Document processing endpoint
@app.post("/api/v1/process")
async def process_document(request: DocumentRequest):
    """Process document with AI"""
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        prompt = f"""
        Analyze this {request.language} document:
        
        {request.content}
        
        Extract:
        1. Document type and purpose
        2. Key parties involved
        3. Important dates
        4. Main obligations
        5. Signature requirements
        
        Format as JSON.
        """
        
        response = model.generate_content(prompt)
        
        return {
            "status": "processed",
            "language": request.language,
            "analysis": response.text,
            "document_type": request.document_type
        }
    except Exception as e:
        logger.error(f"Document processing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# SMS notification endpoint
@app.post("/api/v1/notify")
async def send_notification(phone: str, message: str, db: Session = Depends(get_db)):
    """Send SMS notification"""
    try:
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        
        # Send SMS
        sms_message = client.messages.create(
            body=message,
            from_=TWILIO_PHONE_NUMBER,
            to=phone
        )
        
        # Log notification in database
        logger.info(f"SMS sent to {phone}: SID={sms_message.sid}")
        
        return {
            "status": "sent",
            "sid": sms_message.sid,
            "to": phone,
            "message": message[:50] + "..." if len(message) > 50 else message
        }
        
    except Exception as e:
        logger.error(f"SMS notification error: {e}")
        return {"status": "failed", "error": str(e)}

# Dashboard statistics
@app.get("/api/v1/dashboard/stats")
async def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """Get dashboard statistics"""
    try:
        # Count user's documents
        total_docs = db.query(DocumentModel).filter(DocumentModel.user_id == current_user.id).count()
        
        # Count active workflows
        active_workflows = db.query(SignatureWorkflow).filter(
            SignatureWorkflow.created_by == current_user.id,
            SignatureWorkflow.status == "active"
        ).count()
        
        # Count completed workflows
        completed_workflows = db.query(SignatureWorkflow).filter(
            SignatureWorkflow.created_by == current_user.id,
            SignatureWorkflow.status == "completed"
        ).count()
        
        return {
            "totalDocuments": total_docs,
            "activeWorkflows": active_workflows,
            "completedWorkflows": completed_workflows,
            "pendingSignatures": active_workflows,
            "completionRate": (completed_workflows / max(1, active_workflows + completed_workflows)) * 100
        }
    except Exception as e:
        logger.error(f"Error getting dashboard stats: {e}")
        return {
            "totalDocuments": 0,
            "activeWorkflows": 0,
            "completedWorkflows": 0,
            "pendingSignatures": 0,
            "completionRate": 0
        }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)