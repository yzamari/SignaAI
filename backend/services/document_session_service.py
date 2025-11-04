"""
Document Session Service - Manages complete document sessions with all extracted data
Stores images, fields, metadata, and status for each document processing session
"""

import json
import uuid
import logging
import os
import base64
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from pathlib import Path
import tempfile
import shutil
from PIL import Image
import io

logger = logging.getLogger(__name__)

class DocumentSession:
    """Represents a complete document processing session"""
    
    def __init__(self, session_id: str = None):
        self.session_id = session_id or str(uuid.uuid4())
        self.created_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
        self.document_id = None
        self.user_id = None
        self.status = "initialized"  # initialized, processing, ready, completed, failed
        
        # Document metadata
        self.metadata = {
            "filename": None,
            "mime_type": None,
            "file_size": 0,
            "page_count": 0,
            "language": None,
            "title": None
        }
        
        # Extracted data
        self.page_images = []  # List of page image data with base64 and metadata
        self.detected_fields = []  # All detected fields from AI
        self.workflow = None  # Workflow configuration
        self.signers = []  # List of signers
        
        # Processing history
        self.processing_log = []
        
    def to_dict(self) -> dict:
        """Convert session to dictionary for storage"""
        return {
            "session_id": self.session_id,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "document_id": self.document_id,
            "user_id": self.user_id,
            "status": self.status,
            "metadata": self.metadata,
            "page_images": self.page_images,
            "detected_fields": self.detected_fields,
            "workflow": self.workflow,
            "signers": self.signers,
            "processing_log": self.processing_log
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'DocumentSession':
        """Create session from dictionary"""
        session = cls(session_id=data.get("session_id"))
        session.created_at = datetime.fromisoformat(data.get("created_at", datetime.utcnow().isoformat()))
        session.updated_at = datetime.fromisoformat(data.get("updated_at", datetime.utcnow().isoformat()))
        session.document_id = data.get("document_id")
        session.user_id = data.get("user_id")
        session.status = data.get("status", "initialized")
        session.metadata = data.get("metadata", {})
        session.page_images = data.get("page_images", [])
        session.detected_fields = data.get("detected_fields", [])
        session.workflow = data.get("workflow")
        session.signers = data.get("signers", [])
        session.processing_log = data.get("processing_log", [])
        return session


class DocumentSessionService:
    """Service for managing document sessions with persistent storage"""
    
    def __init__(self, storage_path: str = None):
        """Initialize the session service with storage path"""
        if storage_path:
            self.storage_path = Path(storage_path)
        else:
            # Use temp directory for development
            self.storage_path = Path(tempfile.gettempdir()) / "signaai_sessions"
        
        self.storage_path.mkdir(parents=True, exist_ok=True)
        self.sessions: Dict[str, DocumentSession] = {}
        
        logger.info(f"📁 Document Session Service initialized with storage at: {self.storage_path}")
        
        # Load existing sessions from disk
        self._load_sessions()
    
    def _load_sessions(self):
        """Load existing sessions from disk storage"""
        try:
            session_files = self.storage_path.glob("*.json")
            for session_file in session_files:
                try:
                    with open(session_file, 'r') as f:
                        data = json.load(f)
                        session = DocumentSession.from_dict(data)
                        self.sessions[session.session_id] = session
                        logger.info(f"✅ Loaded session: {session.session_id}")
                except Exception as e:
                    logger.error(f"Failed to load session from {session_file}: {e}")
            
            logger.info(f"📚 Loaded {len(self.sessions)} existing sessions")
        except Exception as e:
            logger.error(f"Error loading sessions: {e}")
    
    def _save_session(self, session: DocumentSession):
        """Save session to disk storage"""
        try:
            session_file = self.storage_path / f"{session.session_id}.json"
            session.updated_at = datetime.utcnow()
            
            with open(session_file, 'w') as f:
                json.dump(session.to_dict(), f, indent=2)
            
            logger.info(f"💾 Saved session {session.session_id} to disk")
        except Exception as e:
            logger.error(f"Failed to save session {session.session_id}: {e}")
            raise
    
    def create_session(self, document_id: str, user_id: str = None) -> DocumentSession:
        """Create a new document session"""
        session = DocumentSession()
        session.document_id = document_id
        session.user_id = user_id or "anonymous"
        session.status = "initialized"
        
        # Store in memory and disk
        self.sessions[session.session_id] = session
        self._save_session(session)
        
        logger.info(f"🆕 Created new session {session.session_id} for document {document_id}")
        return session
    
    def get_session(self, session_id: str) -> Optional[DocumentSession]:
        """Get a session by ID"""
        return self.sessions.get(session_id)
    
    def get_session_by_document(self, document_id: str) -> Optional[DocumentSession]:
        """Get the most recent session for a document"""
        document_sessions = [
            s for s in self.sessions.values() 
            if s.document_id == document_id
        ]
        
        if document_sessions:
            # Return the most recent session
            return max(document_sessions, key=lambda s: s.updated_at)
        return None
    
    def store_page_images(self, session_id: str, page_images: List[Dict[str, Any]]):
        """Store extracted page images in the session"""
        session = self.get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")
        
        session.page_images = page_images
        session.metadata["page_count"] = len(page_images)
        session.status = "images_extracted"
        
        # Log the operation
        session.processing_log.append({
            "timestamp": datetime.utcnow().isoformat(),
            "action": "page_images_stored",
            "details": f"Stored {len(page_images)} page images"
        })
        
        self._save_session(session)
        logger.info(f"🖼️ Stored {len(page_images)} page images for session {session_id}")
    
    def store_detected_fields(self, session_id: str, fields: List[Dict[str, Any]]):
        """Store detected fields in the session"""
        session = self.get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")
        
        session.detected_fields = fields
        session.status = "fields_detected"
        
        # Log the operation
        session.processing_log.append({
            "timestamp": datetime.utcnow().isoformat(),
            "action": "fields_detected",
            "details": f"Detected {len(fields)} fields"
        })
        
        self._save_session(session)
        logger.info(f"📝 Stored {len(fields)} detected fields for session {session_id}")
    
    def update_workflow(self, session_id: str, workflow: Dict[str, Any]):
        """Update workflow configuration in the session"""
        session = self.get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")
        
        session.workflow = workflow
        session.status = "workflow_configured"
        
        # Log the operation
        session.processing_log.append({
            "timestamp": datetime.utcnow().isoformat(),
            "action": "workflow_updated",
            "details": f"Workflow type: {workflow.get('type', 'unknown')}"
        })
        
        self._save_session(session)
        logger.info(f"🔄 Updated workflow for session {session_id}")
    
    def update_signers(self, session_id: str, signers: List[Dict[str, Any]]):
        """Update signers list in the session"""
        session = self.get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")
        
        session.signers = signers
        session.status = "signers_configured"
        
        # Log the operation
        session.processing_log.append({
            "timestamp": datetime.utcnow().isoformat(),
            "action": "signers_updated",
            "details": f"Configured {len(signers)} signers"
        })
        
        self._save_session(session)
        logger.info(f"👥 Updated {len(signers)} signers for session {session_id}")
    
    def update_status(self, session_id: str, status: str, details: str = None):
        """Update session status"""
        session = self.get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")
        
        session.status = status
        
        # Log the operation
        session.processing_log.append({
            "timestamp": datetime.utcnow().isoformat(),
            "action": "status_changed",
            "old_status": session.status,
            "new_status": status,
            "details": details
        })
        
        self._save_session(session)
        logger.info(f"📊 Updated status to '{status}' for session {session_id}")
    
    def get_session_summary(self, session_id: str) -> Dict[str, Any]:
        """Get a summary of the session"""
        session = self.get_session(session_id)
        if not session:
            return None
        
        return {
            "session_id": session.session_id,
            "document_id": session.document_id,
            "status": session.status,
            "created_at": session.created_at.isoformat(),
            "updated_at": session.updated_at.isoformat(),
            "page_count": session.metadata.get("page_count", 0),
            "field_count": len(session.detected_fields),
            "signer_count": len(session.signers),
            "has_workflow": session.workflow is not None,
            "filename": session.metadata.get("filename"),
            "processing_steps": len(session.processing_log)
        }
    
    def cleanup_old_sessions(self, days: int = 7):
        """Clean up sessions older than specified days"""
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        sessions_to_remove = []
        
        for session_id, session in self.sessions.items():
            if session.updated_at < cutoff_date:
                sessions_to_remove.append(session_id)
        
        for session_id in sessions_to_remove:
            try:
                # Remove from memory
                del self.sessions[session_id]
                
                # Remove from disk
                session_file = self.storage_path / f"{session_id}.json"
                if session_file.exists():
                    session_file.unlink()
                
                logger.info(f"🗑️ Cleaned up old session {session_id}")
            except Exception as e:
                logger.error(f"Failed to cleanup session {session_id}: {e}")
        
        logger.info(f"🧹 Cleaned up {len(sessions_to_remove)} old sessions")
        return len(sessions_to_remove)


# Global instance
_session_service: Optional[DocumentSessionService] = None

def get_session_service() -> DocumentSessionService:
    """Get or create the global session service instance"""
    global _session_service
    if _session_service is None:
        _session_service = DocumentSessionService()
    return _session_service