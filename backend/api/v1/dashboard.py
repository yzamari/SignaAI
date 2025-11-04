"""
Dashboard endpoints for user statistics and analytics
"""

import logging
from typing import Dict, Any
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from core.database import get_db
from models.user import User
from models.document import Document
from api.v1.auth import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/stats", response_model=Dict[str, Any])
async def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get dashboard statistics for the current user
    Returns document counts, recent activity, and other metrics
    """
    try:
        logger.info(f"Fetching dashboard stats for user: {current_user.email}")
        
        # Get document statistics
        total_documents = db.query(Document).filter(
            Document.user_id == current_user.id
        ).count()
        
        pending_documents = db.query(Document).filter(
            Document.user_id == current_user.id,
            Document.status == "pending"
        ).count()
        
        completed_documents = db.query(Document).filter(
            Document.user_id == current_user.id,
            Document.status == "completed"
        ).count()
        
        # Get recent documents (last 5)
        recent_docs = db.query(Document).filter(
            Document.user_id == current_user.id
        ).order_by(Document.created_at.desc()).limit(5).all()
        
        recent_documents = [
            {
                "id": str(doc.id),
                "name": doc.name,
                "status": doc.status,
                "created_at": doc.created_at.isoformat() if doc.created_at else None,
                "updated_at": doc.updated_at.isoformat() if doc.updated_at else None
            }
            for doc in recent_docs
        ]
        
        # Calculate activity metrics for the last 30 days
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        recent_uploads = db.query(Document).filter(
            Document.user_id == current_user.id,
            Document.created_at >= thirty_days_ago
        ).count()
        
        # Get signature statistics
        awaiting_signature = db.query(Document).filter(
            Document.user_id == current_user.id,
            Document.status == "awaiting_signature"
        ).count()
        
        # Build response
        stats = {
            "overview": {
                "total_documents": total_documents,
                "pending_documents": pending_documents,
                "completed_documents": completed_documents,
                "awaiting_signature": awaiting_signature
            },
            "recent_activity": {
                "uploads_last_30_days": recent_uploads,
                "last_login": current_user.last_login.isoformat() if hasattr(current_user, 'last_login') and current_user.last_login else None,
                "account_created": current_user.created_at.isoformat() if current_user.created_at else None
            },
            "recent_documents": recent_documents,
            "user_info": {
                "email": current_user.email,
                "full_name": current_user.full_name,
                "is_verified": current_user.is_verified,
                "preferred_language": current_user.preferred_language
            },
            "quick_actions": {
                "can_upload": True,
                "can_send": total_documents > 0,
                "has_pending": pending_documents > 0
            }
        }
        
        return stats
        
    except Exception as e:
        logger.error(f"Failed to fetch dashboard stats: {e}")
        # Return minimal stats on error to prevent dashboard from breaking
        return {
            "overview": {
                "total_documents": 0,
                "pending_documents": 0,
                "completed_documents": 0,
                "awaiting_signature": 0
            },
            "recent_activity": {
                "uploads_last_30_days": 0,
                "last_login": None,
                "account_created": current_user.created_at.isoformat() if current_user.created_at else None
            },
            "recent_documents": [],
            "user_info": {
                "email": current_user.email,
                "full_name": current_user.full_name,
                "is_verified": current_user.is_verified,
                "preferred_language": current_user.preferred_language
            },
            "quick_actions": {
                "can_upload": True,
                "can_send": False,
                "has_pending": False
            }
        }


@router.get("/notifications", response_model=list)
async def get_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> list:
    """
    Get user notifications
    Returns list of recent notifications for the dashboard
    """
    logger.info(f"Fetching notifications for user: {current_user.email}")
    
    # For now, return empty list (to be implemented with notification system)
    notifications = []
    
    # Add welcome notification for new users
    if current_user.created_at:
        time_since_creation = datetime.utcnow() - current_user.created_at
        if time_since_creation.days < 7:
            notifications.append({
                "id": "welcome",
                "type": "info",
                "title": "Welcome to SignaAI",
                "message": "Start by uploading your first document to get started",
                "timestamp": current_user.created_at.isoformat(),
                "read": False
            })
    
    # Add verification reminder if not verified
    if not current_user.is_verified:
        notifications.append({
            "id": "verify_email",
            "type": "warning",
            "title": "Verify your email",
            "message": "Please verify your email address to access all features",
            "timestamp": datetime.utcnow().isoformat(),
            "read": False
        })
    
    return notifications