"""
SignaAI Backend - Complete Production Version with API Router Architecture
Includes all API v1 endpoints with proper router mounting
"""

import os
import logging
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

# Import core modules
from core.config import settings
from core.database import get_db, init_db, Base, engine

# Import all API v1 routers
from api.v1 import auth, users, documents, workflows, sessions, dashboard, health, analytics, contacts

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="SignaAI API",
    version="1.0.0",
    description="SignaAI Backend API with Complete Router Architecture",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all API v1 routers
app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["authentication"])
app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(documents.router, prefix="/api/v1/documents", tags=["documents"])
app.include_router(workflows.router, prefix="/api/v1/workflows", tags=["workflows"])
app.include_router(sessions.router, prefix="/api/v1/sessions", tags=["sessions"])
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["dashboard"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["analytics"])
app.include_router(contacts.router, prefix="/api/v1/contacts", tags=["contacts"])

# Root endpoint
@app.get("/")
async def root():
    """API root with endpoint discovery"""
    return {
        "service": "SignaAI Backend API",
        "status": "running", 
        "version": "1.0.0",
        "documentation": "/docs",
        "endpoints": {
            "health": "/health",
            "auth": "/api/v1/auth",
            "users": "/api/v1/users",
            "documents": "/api/v1/documents",
            "workflows": "/api/v1/workflows", 
            "sessions": "/api/v1/sessions",
            "dashboard": "/api/v1/dashboard",
            "analytics": "/api/v1/analytics",
            "contacts": "/api/v1/contacts",
        }
    }

# Application startup
@app.on_event("startup")
async def startup_event():
    """Initialize database and create demo data"""
    try:
        logger.info("🚀 Starting SignaAI Backend API...")
        
        # Initialize database tables
        logger.info("📊 Initializing database...")
        init_db()
        Base.metadata.create_all(bind=engine)
        
        # Create demo user if not exists
        from models.user import User
        from services.auth import auth_service
        
        db = next(get_db())
        existing_user = db.query(User).filter(User.email == "demo@signaai.com").first()
        
        if not existing_user:
            demo_user = User(
                email="demo@signaai.com",
                password_hash=auth_service.hash_password("Demo123!"),
                full_name="Demo User",
                company_name="SignaAI Demo",
                preferred_language="en",
                is_active=True,
                is_verified=True,
            )
            db.add(demo_user)
            db.commit()
            logger.info("✅ Demo user created: demo@signaai.com / Demo123!")
        else:
            logger.info("ℹ️ Demo user already exists")
            
        db.close()
        logger.info("🎯 SignaAI Backend API started successfully!")
        
    except Exception as e:
        logger.error(f"❌ Startup failed: {e}")
        raise

@app.on_event("shutdown") 
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("🛑 SignaAI Backend API shutting down...")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 5112))
    logger.info(f"🌟 Starting server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
