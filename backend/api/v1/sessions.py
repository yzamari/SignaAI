"""
Session management API endpoints
Provides access to document processing sessions and their stored data
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, Dict, Any
import logging
from services.document_session_service import get_session_service

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/sessions",
    tags=["sessions"],
)

@router.get("/{session_id}")
async def get_session(session_id: str):
    """Get session details by ID"""
    logger.info(f"📋 Getting session: {session_id}")
    try:
        session_service = get_session_service()
        session = session_service.get_session(session_id)
        
        if not session:
            logger.info(f"❌ Session not found: {session_id}")
            # Return empty session for frontend compatibility
            return {
                "status": "not_found",
                "session": None,
                "message": f"Session {session_id} not found"
            }
        
        logger.info(f"✅ Session retrieved: {session_id}")
        return {
            "status": "success",
            "session": session.to_dict()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get session {session_id}: {str(e)}")
        # Return error response instead of raising
        return {
            "status": "error",
            "session": None,
            "message": str(e) if str(e) else "Unknown error"
        }

@router.get("/document/{document_id}")
async def get_document_session(document_id: str):
    """Get the most recent session for a document"""
    try:
        session_service = get_session_service()
        session = session_service.get_session_by_document(document_id)
        
        if not session:
            raise HTTPException(status_code=404, detail="No session found for this document")
        
        return {
            "status": "success",
            "session": session.to_dict()
        }
    except Exception as e:
        logger.error(f"Failed to get session for document {document_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{session_id}/summary")
async def get_session_summary(session_id: str):
    """Get a summary of the session"""
    try:
        session_service = get_session_service()
        summary = session_service.get_session_summary(session_id)
        
        if not summary:
            raise HTTPException(status_code=404, detail="Session not found")
        
        return {
            "status": "success",
            "summary": summary
        }
    except Exception as e:
        logger.error(f"Failed to get session summary {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{session_id}/page-images")
async def get_session_page_images(session_id: str):
    """Get page images from session"""
    try:
        session_service = get_session_service()
        session = session_service.get_session(session_id)
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Return page images without base64 data for listing
        page_images_summary = []
        for page_image in session.page_images:
            summary = {k: v for k, v in page_image.items() if k != 'base64'}
            summary['has_image'] = 'base64' in page_image
            page_images_summary.append(summary)
        
        return {
            "status": "success",
            "page_count": len(session.page_images),
            "page_images": page_images_summary
        }
    except Exception as e:
        logger.error(f"Failed to get page images for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{session_id}/page-image/{page_number}")
async def get_session_page_image(session_id: str, page_number: int):
    """Get a specific page image from session"""
    try:
        session_service = get_session_service()
        session = session_service.get_session(session_id)
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Find the requested page
        for page_image in session.page_images:
            if page_image.get('page_number') == page_number:
                return {
                    "status": "success",
                    "page_image": page_image
                }
        
        raise HTTPException(status_code=404, detail=f"Page {page_number} not found in session")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get page {page_number} for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{session_id}/fields")
async def get_session_fields(session_id: str):
    """Get detected fields from session"""
    try:
        session_service = get_session_service()
        session = session_service.get_session(session_id)
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        return {
            "status": "success",
            "field_count": len(session.detected_fields),
            "fields": session.detected_fields
        }
    except Exception as e:
        logger.error(f"Failed to get fields for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{session_id}/workflow")
async def update_session_workflow(
    session_id: str,
    workflow: Dict[str, Any]
):
    """Update workflow configuration in session"""
    try:
        session_service = get_session_service()
        session = session_service.get_session(session_id)
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        session_service.update_workflow(session_id, workflow)
        
        return {
            "status": "success",
            "message": "Workflow updated successfully"
        }
    except Exception as e:
        logger.error(f"Failed to update workflow for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{session_id}/signers")
async def update_session_signers(
    session_id: str,
    signers: list
):
    """Update signers list in session"""
    try:
        session_service = get_session_service()
        session = session_service.get_session(session_id)
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        session_service.update_signers(session_id, signers)
        
        return {
            "status": "success",
            "message": f"Updated {len(signers)} signers"
        }
    except Exception as e:
        logger.error(f"Failed to update signers for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/cleanup")
async def cleanup_old_sessions(days: int = Query(7, description="Days to keep sessions")):
    """Clean up sessions older than specified days"""
    try:
        session_service = get_session_service()
        removed_count = session_service.cleanup_old_sessions(days)
        
        return {
            "status": "success",
            "message": f"Cleaned up {removed_count} old sessions"
        }
    except Exception as e:
        logger.error(f"Failed to cleanup sessions: {e}")
        raise HTTPException(status_code=500, detail=str(e))