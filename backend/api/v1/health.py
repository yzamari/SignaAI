"""
Health check endpoints for monitoring and system status
"""

import logging

import redis
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.config import settings
from core.database import get_db

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/health")
async def health_check():
    """Basic health check endpoint"""
    return {"status": "healthy", "service": "SignaAI API", "version": settings.VERSION}


@router.get("/health/detailed")
async def detailed_health_check(db: Session = Depends(get_db)):
    """Detailed health check with service dependencies"""
    health_status = {"status": "healthy", "services": {}}

    # Check database connection
    try:
        db.execute(text("SELECT 1"))
        health_status["services"]["database"] = {"status": "healthy", "type": "PostgreSQL"}
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        health_status["services"]["database"] = {"status": "unhealthy", "error": str(e)}
        health_status["status"] = "unhealthy"

    # Check Redis connection
    try:
        r = redis.from_url(settings.REDIS_URL)
        r.ping()
        health_status["services"]["redis"] = {"status": "healthy", "type": "Redis Cache"}
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        health_status["services"]["redis"] = {"status": "unhealthy", "error": str(e)}
        health_status["status"] = "degraded"  # Non-critical for basic functionality

    # Check storage (MinIO) - Basic connectivity
    try:
        from minio import Minio

        client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
        # Try to list buckets (basic connectivity test)
        list(client.list_buckets())
        health_status["services"]["storage"] = {"status": "healthy", "type": "MinIO S3"}
    except Exception as e:
        logger.error(f"Storage health check failed: {e}")
        health_status["services"]["storage"] = {"status": "unhealthy", "error": str(e)}
        health_status["status"] = "degraded"

    return health_status


@router.get("/health/ready")
async def readiness_check(db: Session = Depends(get_db)):
    """Kubernetes readiness probe endpoint"""
    try:
        # Check critical dependencies
        db.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        raise HTTPException(status_code=503, detail="Service not ready")


@router.get("/health/live")
async def liveness_check():
    """Kubernetes liveness probe endpoint"""
    return {"status": "alive"}
