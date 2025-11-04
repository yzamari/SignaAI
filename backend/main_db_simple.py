"""
SignaAI Backend - Production Version with Simple PostgreSQL
Using PostgreSQL for persistent storage without complex ORM
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
import psycopg2
from psycopg2.extras import RealDictCursor
import uuid
from twilio.rest import Client

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="SignaAI API",
    version="1.0.0",
    description="SignaAI Backend with PostgreSQL Persistence"
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

# Database URL - Use Cloud SQL proxy
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://signaai:SignaAI2024!@localhost:5432/signaai")

# Parse database URL for connection
import re
db_match = re.match(r'postgresql://([^:]+):([^@]+)@([^/]+)/(.+)', DATABASE_URL)
if db_match:
    DB_USER, DB_PASSWORD, DB_HOST, DB_NAME = db_match.groups()
    # Handle Cloud SQL socket path
    if 'cloudsql' in DB_HOST:
        DB_HOST = DB_HOST.split('?host=')[-1] if '?host=' in DB_HOST else DB_HOST
else:
    DB_USER = "signaai"
    DB_PASSWORD = "SignaAI2024!"
    DB_HOST = "/cloudsql/signaai-prod-1758272250:us-central1:signaai-db-prod"
    DB_NAME = "signaai"

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

class DocumentRequest(BaseModel):
    content: str
    document_type: Optional[str] = "general"
    language: Optional[str] = "en"

# Database connection
def get_db_connection():
    """Get PostgreSQL database connection"""
    try:
        # For Cloud SQL, use Unix socket
        if '/cloudsql/' in DB_HOST:
            conn = psycopg2.connect(
                host=DB_HOST,
                database=DB_NAME,
                user=DB_USER,
                password=DB_PASSWORD
            )
        else:
            conn = psycopg2.connect(
                host=DB_HOST.split(':')[0] if ':' in DB_HOST else DB_HOST,
                port=int(DB_HOST.split(':')[1]) if ':' in DB_HOST else 5432,
                database=DB_NAME,
                user=DB_USER,
                password=DB_PASSWORD
            )
        return conn
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        # Fallback to in-memory if DB not available
        return None

# Initialize database tables
def init_db():
    """Create database tables if they don't exist"""
    try:
        conn = get_db_connection()
        if not conn:
            logger.warning("Database not available, using in-memory storage")
            return
            
        cur = conn.cursor()
        
        # Create users table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(50) PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                role VARCHAR(50) DEFAULT 'sender',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create documents table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id VARCHAR(50) PRIMARY KEY,
                user_id VARCHAR(50),
                title VARCHAR(255) NOT NULL,
                content TEXT,
                status VARCHAR(50) DEFAULT 'pending',
                language VARCHAR(10) DEFAULT 'en',
                signers JSONB,
                fields JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        
        # Create sessions table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id VARCHAR(50) PRIMARY KEY,
                document_id VARCHAR(50),
                user_id VARCHAR(50),
                status VARCHAR(50) DEFAULT 'active',
                signers JSONB,
                expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (document_id) REFERENCES documents(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        
        # Create activity log table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS activity_log (
                id SERIAL PRIMARY KEY,
                action VARCHAR(100),
                user_id VARCHAR(50),
                document_id VARCHAR(50),
                session_id VARCHAR(50),
                details JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        conn.commit()
        cur.close()
        conn.close()
        logger.info("Database initialized successfully")
        
    except Exception as e:
        logger.error(f"Database initialization error: {e}")

# In-memory fallback storage
users_db = {}
documents_db = {}
sessions_db = {}

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

async def get_current_user(token: str = Depends(oauth2_scheme)):
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
    
    # Try database first
    conn = get_db_connection()
    if conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM users WHERE email = %s", (email,))
        user = cur.fetchone()
        cur.close()
        conn.close()
        if user:
            return user
    
    # Fallback to in-memory
    user = users_db.get(email)
    if user is None:
        raise credentials_exception
    return user

def log_activity(action: str, user_id: str = None, document_id: str = None, 
                 session_id: str = None, details: dict = None):
    """Log activity to database"""
    try:
        conn = get_db_connection()
        if conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO activity_log (action, user_id, document_id, session_id, details)
                VALUES (%s, %s, %s, %s, %s)
            """, (action, user_id, document_id, session_id, json.dumps(details) if details else None))
            conn.commit()
            cur.close()
            conn.close()
    except Exception as e:
        logger.error(f"Activity logging error: {e}")

# Startup event
@app.on_event("startup")
async def startup_event():
    """Initialize database on startup"""
    logger.info("Initializing database...")
    init_db()

# Root endpoint
@app.get("/")
async def root():
    return {"message": "SignaAI Backend API", "version": "1.0.0", "status": "operational"}

# Health check
@app.get("/health")
async def health():
    """Health check endpoint with database connectivity test"""
    db_status = "error"
    try:
        conn = get_db_connection()
        if conn:
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.close()
            conn.close()
            db_status = "connected"
    except:
        db_status = "disconnected"
    
    return {
        "status": "healthy",
        "database": db_status,
        "timestamp": datetime.utcnow().isoformat()
    }

# Authentication endpoints
@app.post("/api/v1/auth/register", response_model=Token)
async def register(user_data: UserRegister):
    """Register new user"""
    user_id = str(uuid.uuid4())
    hashed_password = hash_password(user_data.password)
    
    # Try database first
    conn = get_db_connection()
    if conn:
        try:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO users (id, email, password_hash, name, phone, role)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (user_id, user_data.email, hashed_password, user_data.name, 
                  user_data.phone, "sender"))
            conn.commit()
            cur.close()
            conn.close()
            
            log_activity("user_registered", user_id=user_id, 
                        details={"email": user_data.email})
        except psycopg2.IntegrityError:
            raise HTTPException(status_code=400, detail="Email already registered")
    else:
        # Fallback to in-memory
        if user_data.email in users_db:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        users_db[user_data.email] = {
            "id": user_id,
            "email": user_data.email,
            "password_hash": hashed_password,
            "name": user_data.name,
            "phone": user_data.phone,
            "role": "sender"
        }
    
    # Create token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user_data.email}, expires_delta=access_token_expires
    )
    
    user_response = User(
        id=user_id,
        email=user_data.email,
        name=user_data.name,
        role="sender",
        phone=user_data.phone
    )
    
    return Token(access_token=access_token, user=user_response)

@app.post("/api/v1/auth/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Login user"""
    user = None
    
    # Try database first
    conn = get_db_connection()
    if conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM users WHERE email = %s", (form_data.username,))
        user = cur.fetchone()
        cur.close()
        conn.close()
    else:
        # Fallback to in-memory
        user = users_db.get(form_data.username)
    
    if not user or not verify_password(form_data.password, user['password_hash']):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    log_activity("user_login", user_id=user['id'])
    
    # Create token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user['email']}, expires_delta=access_token_expires
    )
    
    user_response = User(
        id=user['id'],
        email=user['email'],
        name=user['name'],
        role=user.get('role', 'sender'),
        phone=user.get('phone')
    )
    
    return Token(access_token=access_token, user=user_response)

@app.get("/api/v1/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current user info"""
    return {
        "id": current_user['id'],
        "email": current_user['email'],
        "name": current_user['name'],
        "role": current_user.get('role', 'sender'),
        "phone": current_user.get('phone')
    }

# Document endpoints
@app.post("/api/v1/documents")
async def create_document(doc_data: DocumentCreate, current_user: dict = Depends(get_current_user)):
    """Create a new document"""
    doc_id = str(uuid.uuid4())
    
    # Try database first
    conn = get_db_connection()
    if conn:
        try:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO documents (id, user_id, title, content, status, language, signers, fields)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (doc_id, current_user['id'], doc_data.title, doc_data.content,
                  doc_data.status, doc_data.language, 
                  json.dumps(doc_data.signers), json.dumps(doc_data.fields)))
            conn.commit()
            cur.close()
            conn.close()
            
            log_activity("document_created", user_id=current_user['id'], 
                        document_id=doc_id, details={"title": doc_data.title})
        except Exception as e:
            logger.error(f"Error creating document: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    else:
        # Fallback to in-memory
        documents_db[doc_id] = {
            "id": doc_id,
            "user_id": current_user['id'],
            "title": doc_data.title,
            "content": doc_data.content,
            "status": doc_data.status,
            "language": doc_data.language,
            "signers": doc_data.signers,
            "fields": doc_data.fields,
            "created_at": datetime.utcnow().isoformat()
        }
    
    return {
        "id": doc_id,
        "title": doc_data.title,
        "status": doc_data.status,
        "language": doc_data.language,
        "created_at": datetime.utcnow().isoformat()
    }

@app.get("/api/v1/documents/{document_id}")
async def get_document(document_id: str):
    """Get document by ID (public endpoint for signers)"""
    document = None
    
    # Try database first
    conn = get_db_connection()
    if conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM documents WHERE id = %s", (document_id,))
        document = cur.fetchone()
        cur.close()
        conn.close()
    else:
        # Fallback to in-memory
        document = documents_db.get(document_id)
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    log_activity("document_accessed", document_id=document_id)
    
    return {
        "id": document['id'],
        "title": document['title'],
        "content": document['content'],
        "status": document['status'],
        "language": document.get('language', 'en'),
        "signers": document.get('signers', []),
        "fields": document.get('fields', []),
        "created_at": document.get('created_at', datetime.utcnow()).isoformat()
    }

@app.get("/api/v1/documents")
async def list_documents(current_user: dict = Depends(get_current_user)):
    """List user's documents"""
    documents = []
    
    # Try database first
    conn = get_db_connection()
    if conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM documents WHERE user_id = %s ORDER BY created_at DESC", 
                    (current_user['id'],))
        documents = cur.fetchall()
        cur.close()
        conn.close()
    else:
        # Fallback to in-memory
        documents = [doc for doc in documents_db.values() 
                    if doc.get('user_id') == current_user['id']]
    
    return documents

# Session endpoints
@app.post("/api/v1/sessions")
async def create_session(session_data: SessionCreate, current_user: dict = Depends(get_current_user)):
    """Create a signing session"""
    session_id = str(uuid.uuid4())
    
    # Try database first
    conn = get_db_connection()
    if conn:
        try:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO sessions (id, document_id, user_id, status, signers, expires_at)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (session_id, session_data.documentId, current_user['id'],
                  session_data.status, json.dumps(session_data.signers),
                  session_data.expiresAt))
            conn.commit()
            cur.close()
            conn.close()
            
            log_activity("session_created", user_id=current_user['id'],
                        document_id=session_data.documentId, session_id=session_id)
        except Exception as e:
            logger.error(f"Error creating session: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    else:
        # Fallback to in-memory
        sessions_db[session_id] = {
            "id": session_id,
            "documentId": session_data.documentId,
            "user_id": current_user['id'],
            "status": session_data.status,
            "signers": session_data.signers,
            "expires_at": session_data.expiresAt,
            "created_at": datetime.utcnow().isoformat()
        }
    
    return {
        "id": session_id,
        "documentId": session_data.documentId,
        "status": session_data.status,
        "created_at": datetime.utcnow().isoformat()
    }

@app.get("/api/v1/sessions/{session_id}")
async def get_session(session_id: str):
    """Get session by ID (public endpoint for signers)"""
    session = None
    document = None
    
    # Try database first
    conn = get_db_connection()
    if conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get session
        cur.execute("SELECT * FROM sessions WHERE id = %s", (session_id,))
        session = cur.fetchone()
        
        if session:
            # Get document
            cur.execute("SELECT * FROM documents WHERE id = %s", (session['document_id'],))
            document = cur.fetchone()
        
        cur.close()
        conn.close()
    else:
        # Fallback to in-memory
        session = sessions_db.get(session_id)
        if session:
            document = documents_db.get(session['documentId'])
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    log_activity("session_accessed", session_id=session_id,
                document_id=document['id'])
    
    return {
        "id": session['id'],
        "documentId": session.get('document_id') or session.get('documentId'),
        "document": {
            "id": document['id'],
            "title": document['title'],
            "content": document['content'],
            "language": document.get('language', 'en')
        },
        "status": session['status'],
        "signers": session.get('signers', []),
        "created_at": session.get('created_at', datetime.utcnow()).isoformat()
    }

# Document processing
@app.post("/api/v1/process")
async def process_document(request: DocumentRequest):
    """Process document with AI"""
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        prompt = f"""
        Analyze this {request.language} document:
        
        {request.content}
        
        Extract key information and structure.
        """
        
        response = model.generate_content(prompt)
        
        log_activity("document_processed", details={
            "language": request.language,
            "type": request.document_type
        })
        
        return {
            "status": "processed",
            "language": request.language,
            "analysis": response.text,
            "document_type": request.document_type
        }
    except Exception as e:
        logger.error(f"Document processing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# SMS notification
@app.post("/api/v1/notify")
async def send_notification(phone: str, message: str):
    """Send SMS notification"""
    try:
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        
        sms_message = client.messages.create(
            body=message,
            from_=TWILIO_PHONE_NUMBER,
            to=phone
        )
        
        log_activity("sms_sent", details={
            "phone": phone,
            "sid": sms_message.sid
        })
        
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
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    """Get dashboard statistics"""
    stats = {
        "totalDocuments": 0,
        "activeWorkflows": 0,
        "completedWorkflows": 0,
        "pendingSignatures": 0
    }
    
    # Try database first
    conn = get_db_connection()
    if conn:
        cur = conn.cursor()
        
        # Count documents
        cur.execute("SELECT COUNT(*) FROM documents WHERE user_id = %s", (current_user['id'],))
        stats["totalDocuments"] = cur.fetchone()[0]
        
        # Count sessions
        cur.execute("SELECT COUNT(*) FROM sessions WHERE user_id = %s AND status = 'active'", 
                    (current_user['id'],))
        stats["activeWorkflows"] = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM sessions WHERE user_id = %s AND status = 'completed'",
                    (current_user['id'],))
        stats["completedWorkflows"] = cur.fetchone()[0]
        
        cur.close()
        conn.close()
    else:
        # Fallback to in-memory
        user_docs = [d for d in documents_db.values() if d.get('user_id') == current_user['id']]
        user_sessions = [s for s in sessions_db.values() if s.get('user_id') == current_user['id']]
        
        stats["totalDocuments"] = len(user_docs)
        stats["activeWorkflows"] = len([s for s in user_sessions if s.get('status') == 'active'])
        stats["completedWorkflows"] = len([s for s in user_sessions if s.get('status') == 'completed'])
    
    stats["pendingSignatures"] = stats["activeWorkflows"]
    stats["completionRate"] = (stats["completedWorkflows"] / max(1, stats["activeWorkflows"] + stats["completedWorkflows"])) * 100
    
    return stats

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)