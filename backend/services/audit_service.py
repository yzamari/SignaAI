"""
Audit Trail Service - Sprint 3 Implementation
Comprehensive audit logging and trail generation
"""

import json
import hashlib
from datetime import datetime
from typing import Dict, List, Any, Optional
from uuid import uuid4
import asyncio
from enum import Enum

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from fpdf import FPDF
import pytz

from core.database import get_db
from core.config import settings


class AuditEventType(Enum):
    """Audit event types for tracking"""
    # Workflow events
    WORKFLOW_CREATED = "workflow_created"
    WORKFLOW_STARTED = "workflow_started"
    WORKFLOW_COMPLETED = "workflow_completed"
    WORKFLOW_CANCELLED = "workflow_cancelled"
    WORKFLOW_EXPIRED = "workflow_expired"
    
    # Signer events
    SIGNER_ADDED = "signer_added"
    SIGNER_NOTIFIED = "signer_notified"
    SIGNER_VIEWED = "signer_viewed"
    SIGNER_SIGNED = "signer_signed"
    SIGNER_DECLINED = "signer_declined"
    SIGNER_REMINDER_SENT = "signer_reminder_sent"
    
    # Document events
    DOCUMENT_UPLOADED = "document_uploaded"
    DOCUMENT_PROCESSED = "document_processed"
    DOCUMENT_FINALIZED = "document_finalized"
    DOCUMENT_DOWNLOADED = "document_downloaded"
    
    # Security events
    AUTH_SUCCESS = "auth_success"
    AUTH_FAILED = "auth_failed"
    MFA_VERIFIED = "mfa_verified"
    ID_VERIFIED = "id_verified"
    LIVENESS_CHECKED = "liveness_checked"
    
    # System events
    SYSTEM_ERROR = "system_error"
    SYSTEM_WARNING = "system_warning"
    API_CALL = "api_call"


class AuditEntry:
    """Represents a single audit trail entry"""
    
    def __init__(
        self,
        event_type: AuditEventType,
        workflow_id: Optional[str] = None,
        signer_id: Optional[str] = None,
        user_id: Optional[str] = None,
        description: str = "",
        metadata: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ):
        self.id = str(uuid4())
        self.timestamp = datetime.utcnow()
        self.event_type = event_type.value
        self.workflow_id = workflow_id
        self.signer_id = signer_id
        self.user_id = user_id
        self.description = description
        self.metadata = metadata or {}
        self.ip_address = ip_address
        self.user_agent = user_agent
        self.hash = self._calculate_hash()
        self.previous_hash = None
    
    def _calculate_hash(self) -> str:
        """Calculate SHA-256 hash of the entry for integrity"""
        data = {
            "id": self.id,
            "timestamp": self.timestamp.isoformat(),
            "event_type": self.event_type,
            "workflow_id": self.workflow_id,
            "signer_id": self.signer_id,
            "user_id": self.user_id,
            "description": self.description,
            "metadata": json.dumps(self.metadata, sort_keys=True)
        }
        
        hash_string = json.dumps(data, sort_keys=True)
        return hashlib.sha256(hash_string.encode()).hexdigest()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary format"""
        return {
            "id": self.id,
            "timestamp": self.timestamp.isoformat(),
            "event_type": self.event_type,
            "workflow_id": self.workflow_id,
            "signer_id": self.signer_id,
            "user_id": self.user_id,
            "description": self.description,
            "metadata": self.metadata,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "hash": self.hash,
            "previous_hash": self.previous_hash
        }


class AuditTrailService:
    """Service for managing audit trails"""
    
    def __init__(self):
        # In-memory storage (replace with database in production)
        self.audit_entries: Dict[str, List[AuditEntry]] = {}
        self.entry_chain: List[AuditEntry] = []
        
    async def log_action(
        self,
        workflow_id: str,
        action: str,
        metadata: Optional[Dict[str, Any]] = None,
        signer_id: Optional[str] = None,
        user_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> AuditEntry:
        """Log an action to the audit trail"""
        
        # Map action to event type
        event_type = self._get_event_type(action)
        
        # Create description
        description = self._generate_description(action, metadata)
        
        # Create audit entry
        entry = AuditEntry(
            event_type=event_type,
            workflow_id=workflow_id,
            signer_id=signer_id,
            user_id=user_id,
            description=description,
            metadata=metadata,
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        # Link to previous entry for blockchain-style integrity
        if self.entry_chain:
            entry.previous_hash = self.entry_chain[-1].hash
        
        # Store entry
        if workflow_id not in self.audit_entries:
            self.audit_entries[workflow_id] = []
        
        self.audit_entries[workflow_id].append(entry)
        self.entry_chain.append(entry)
        
        # Log to system logger
        self._log_to_system(entry)
        
        return entry
    
    async def get_audit_trail(
        self,
        workflow_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        event_types: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Get audit trail for a workflow"""
        
        if workflow_id not in self.audit_entries:
            return []
        
        entries = self.audit_entries[workflow_id]
        
        # Filter by date range
        if start_date:
            entries = [e for e in entries if e.timestamp >= start_date]
        if end_date:
            entries = [e for e in entries if e.timestamp <= end_date]
        
        # Filter by event types
        if event_types:
            entries = [e for e in entries if e.event_type in event_types]
        
        # Sort by timestamp
        entries.sort(key=lambda x: x.timestamp)
        
        return [e.to_dict() for e in entries]
    
    async def generate_audit_report_pdf(
        self,
        workflow_id: str,
        document_title: str = "Document",
        include_technical: bool = False
    ) -> bytes:
        """Generate PDF audit report"""
        
        entries = await self.get_audit_trail(workflow_id)
        
        if not entries:
            raise ValueError(f"No audit trail found for workflow {workflow_id}")
        
        # Create PDF
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Arial", size=12)
        
        # Header
        pdf.set_font("Arial", "B", 16)
        pdf.cell(0, 10, "Digital Signature Audit Trail", ln=True, align="C")
        pdf.ln(5)
        
        # Document info
        pdf.set_font("Arial", size=10)
        pdf.cell(0, 5, f"Document: {document_title}", ln=True)
        pdf.cell(0, 5, f"Workflow ID: {workflow_id}", ln=True)
        pdf.cell(0, 5, f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}", ln=True)
        pdf.ln(10)
        
        # Summary section
        pdf.set_font("Arial", "B", 12)
        pdf.cell(0, 8, "Summary", ln=True)
        pdf.set_font("Arial", size=10)
        
        # Calculate summary stats
        signers = set()
        signed_count = 0
        for entry in entries:
            if entry.get("signer_id"):
                signers.add(entry["signer_id"])
            if entry["event_type"] == AuditEventType.SIGNER_SIGNED.value:
                signed_count += 1
        
        pdf.cell(0, 5, f"Total Events: {len(entries)}", ln=True)
        pdf.cell(0, 5, f"Total Signers: {len(signers)}", ln=True)
        pdf.cell(0, 5, f"Signatures Completed: {signed_count}", ln=True)
        
        if entries:
            start_time = datetime.fromisoformat(entries[0]["timestamp"])
            end_time = datetime.fromisoformat(entries[-1]["timestamp"])
            duration = end_time - start_time
            pdf.cell(0, 5, f"Duration: {self._format_duration(duration)}", ln=True)
        
        pdf.ln(10)
        
        # Event timeline
        pdf.set_font("Arial", "B", 12)
        pdf.cell(0, 8, "Event Timeline", ln=True)
        pdf.set_font("Arial", size=9)
        
        for entry in entries:
            timestamp = datetime.fromisoformat(entry["timestamp"])
            formatted_time = timestamp.strftime("%Y-%m-%d %H:%M:%S UTC")
            
            # Event line
            event_text = f"{formatted_time} - {entry['description']}"
            
            # Add metadata if relevant
            if entry.get("ip_address"):
                event_text += f" (IP: {entry['ip_address']})"
            
            # Wrap long text
            if len(event_text) > 80:
                lines = [event_text[i:i+80] for i in range(0, len(event_text), 80)]
                for line in lines:
                    pdf.cell(0, 4, line, ln=True)
            else:
                pdf.cell(0, 4, event_text, ln=True)
            
            pdf.ln(1)
        
        # Technical details section (if requested)
        if include_technical:
            pdf.add_page()
            pdf.set_font("Arial", "B", 12)
            pdf.cell(0, 8, "Technical Details", ln=True)
            pdf.set_font("Arial", size=8)
            
            for entry in entries:
                pdf.cell(0, 4, f"Event ID: {entry['id']}", ln=True)
                pdf.cell(0, 4, f"Hash: {entry['hash']}", ln=True)
                if entry.get("previous_hash"):
                    pdf.cell(0, 4, f"Previous Hash: {entry['previous_hash']}", ln=True)
                pdf.ln(3)
        
        # Footer
        pdf.ln(20)
        pdf.set_font("Arial", "I", 8)
        pdf.cell(0, 5, "This audit trail is tamper-evident and cryptographically secured", ln=True, align="C")
        pdf.cell(0, 5, "Generated by SignaAI Digital Signature Platform", ln=True, align="C")
        
        # Return PDF bytes
        return bytes(pdf.output(dest='S').encode('latin-1'))
    
    async def verify_integrity(self, workflow_id: str) -> Dict[str, Any]:
        """Verify the integrity of an audit trail"""
        
        if workflow_id not in self.audit_entries:
            return {
                "valid": False,
                "error": "No audit trail found"
            }
        
        entries = self.audit_entries[workflow_id]
        
        # Verify each entry's hash
        for i, entry in enumerate(entries):
            calculated_hash = entry._calculate_hash()
            if calculated_hash != entry.hash:
                return {
                    "valid": False,
                    "error": f"Hash mismatch at entry {i}",
                    "entry_id": entry.id
                }
            
            # Verify chain integrity
            if i > 0 and entry.previous_hash != entries[i-1].hash:
                return {
                    "valid": False,
                    "error": f"Chain broken at entry {i}",
                    "entry_id": entry.id
                }
        
        return {
            "valid": True,
            "entries_verified": len(entries),
            "first_entry": entries[0].timestamp.isoformat() if entries else None,
            "last_entry": entries[-1].timestamp.isoformat() if entries else None
        }
    
    async def get_signer_activity(
        self,
        signer_id: str,
        workflow_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get all activity for a specific signer"""
        
        activities = []
        
        workflows = [workflow_id] if workflow_id else self.audit_entries.keys()
        
        for wf_id in workflows:
            if wf_id in self.audit_entries:
                for entry in self.audit_entries[wf_id]:
                    if entry.signer_id == signer_id:
                        activities.append(entry.to_dict())
        
        # Sort by timestamp
        activities.sort(key=lambda x: x["timestamp"])
        
        return activities
    
    async def export_audit_trail(
        self,
        workflow_id: str,
        format: str = "json"
    ) -> Any:
        """Export audit trail in various formats"""
        
        entries = await self.get_audit_trail(workflow_id)
        
        if format == "json":
            return json.dumps(entries, indent=2)
        elif format == "csv":
            import csv
            import io
            
            output = io.StringIO()
            if entries:
                writer = csv.DictWriter(
                    output,
                    fieldnames=entries[0].keys()
                )
                writer.writeheader()
                writer.writerows(entries)
            
            return output.getvalue()
        elif format == "pdf":
            return await self.generate_audit_report_pdf(workflow_id)
        else:
            raise ValueError(f"Unsupported format: {format}")
    
    def _get_event_type(self, action: str) -> AuditEventType:
        """Map action string to event type"""
        action_map = {
            "workflow_created": AuditEventType.WORKFLOW_CREATED,
            "workflow_started": AuditEventType.WORKFLOW_STARTED,
            "workflow_completed": AuditEventType.WORKFLOW_COMPLETED,
            "workflow_cancelled": AuditEventType.WORKFLOW_CANCELLED,
            "workflow_sent": AuditEventType.WORKFLOW_STARTED,
            "signer_added": AuditEventType.SIGNER_ADDED,
            "signer_notified": AuditEventType.SIGNER_NOTIFIED,
            "signer_viewed": AuditEventType.SIGNER_VIEWED,
            "signer_completed": AuditEventType.SIGNER_SIGNED,
            "signer_declined": AuditEventType.SIGNER_DECLINED,
            "reminder_sent": AuditEventType.SIGNER_REMINDER_SENT,
            "document_uploaded": AuditEventType.DOCUMENT_UPLOADED,
            "document_finalized": AuditEventType.DOCUMENT_FINALIZED,
            "auth_success": AuditEventType.AUTH_SUCCESS,
            "auth_failed": AuditEventType.AUTH_FAILED,
            "mfa_verified": AuditEventType.MFA_VERIFIED,
            "id_verified": AuditEventType.ID_VERIFIED
        }
        
        return action_map.get(action, AuditEventType.SYSTEM_EVENT)
    
    def _generate_description(self, action: str, metadata: Optional[Dict[str, Any]]) -> str:
        """Generate human-readable description"""
        
        descriptions = {
            "workflow_created": "Signature workflow created",
            "workflow_started": "Workflow started and invitations sent",
            "workflow_completed": "All signatures completed",
            "workflow_cancelled": "Workflow cancelled",
            "workflow_sent": "Workflow activated and notifications sent",
            "signer_added": f"Signer added: {metadata.get('signer_name', 'Unknown') if metadata else 'Unknown'}",
            "signer_notified": f"Invitation sent to {metadata.get('signer_name', 'signer') if metadata else 'signer'}",
            "signer_viewed": f"Document viewed by {metadata.get('signer_name', 'signer') if metadata else 'signer'}",
            "signer_completed": f"{metadata.get('signer_name', 'Signer') if metadata else 'Signer'} completed signature",
            "signer_declined": f"{metadata.get('signer_name', 'Signer') if metadata else 'Signer'} declined to sign",
            "reminder_sent": f"Reminder sent to {metadata.get('signers_reminded', 0) if metadata else 0} signers",
            "document_uploaded": "Document uploaded for signature",
            "document_finalized": "Document finalized with all signatures"
        }
        
        return descriptions.get(action, f"Action performed: {action}")
    
    def _format_duration(self, duration) -> str:
        """Format duration in human-readable format"""
        days = duration.days
        hours, remainder = divmod(duration.seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        
        parts = []
        if days:
            parts.append(f"{days} day{'s' if days != 1 else ''}")
        if hours:
            parts.append(f"{hours} hour{'s' if hours != 1 else ''}")
        if minutes:
            parts.append(f"{minutes} minute{'s' if minutes != 1 else ''}")
        if seconds and not (days or hours):
            parts.append(f"{seconds} second{'s' if seconds != 1 else ''}")
        
        return " ".join(parts) if parts else "Less than a second"
    
    def _log_to_system(self, entry: AuditEntry):
        """Log to system logger for persistence"""
        import logging
        logger = logging.getLogger(__name__)
        
        log_message = (
            f"AUDIT: {entry.event_type} | "
            f"Workflow: {entry.workflow_id} | "
            f"Description: {entry.description}"
        )
        
        logger.info(log_message)


# Singleton instance
audit_service = AuditTrailService()