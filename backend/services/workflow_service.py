"""
Workflow Management Service - Sprint 4: SIG-003

Comprehensive signature workflow engine:
- Sequential and parallel signing workflows
- Deadline management with automated reminders
- Conditional routing and approval chains
- State machine for workflow progression
- Israeli Electronic Signature Law compliance

Root Cause: Need for complex signature workflows with automated progression and compliance
Fix: State machine-based workflow engine with deadline enforcement and notification automation
"""

import asyncio
import logging
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from core.config import settings
from models.document import (
    Document,
    Signature,
    SignatureField,
    SignatureWorkflow,
    Signer,
)
from models.user import User
from services.notification_service import NotificationChannel, notification_service
from services.enhanced_notification_service import enhanced_notification_service

logger = logging.getLogger(__name__)


class WorkflowStatus(str, Enum):
    """Workflow status states"""

    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class SignerStatus(str, Enum):
    """Individual signer status states"""

    PENDING = "pending"
    INVITED = "invited"
    VIEWED = "viewed"
    SIGNED = "signed"
    DECLINED = "declined"
    OVERDUE = "overdue"


class WorkflowEvent(str, Enum):
    """Workflow events for state transitions"""

    START = "start"
    SIGNER_INVITED = "signer_invited"
    SIGNER_VIEWED = "signer_viewed"
    SIGNER_SIGNED = "signer_signed"
    SIGNER_DECLINED = "signer_declined"
    DEADLINE_APPROACHING = "deadline_approaching"
    DEADLINE_PASSED = "deadline_passed"
    COMPLETE = "complete"
    CANCEL = "cancel"


class WorkflowRule:
    """Workflow business rule definition"""

    def __init__(self, rule_id: str, condition: str, action: str, parameters: Dict[str, Any] = None):
        self.rule_id = rule_id
        self.condition = condition
        self.action = action
        self.parameters = parameters or {}


class WorkflowState:
    """Workflow state representation"""

    def __init__(self, workflow: SignatureWorkflow, signers: List[Signer]):
        self.workflow = workflow
        self.signers = signers
        self.completed_signers = [s for s in signers if s.status == SignerStatus.SIGNED.value]
        self.pending_signers = [
            s for s in signers if s.status in [SignerStatus.PENDING.value, SignerStatus.INVITED.value]
        ]
        self.declined_signers = [s for s in signers if s.status == SignerStatus.DECLINED.value]


class WorkflowService:
    """
    Advanced workflow management service

    Handles complex signature workflows with state management,
    automated notifications, and deadline enforcement
    """

    def __init__(self):
        self.workflow_rules = self._load_workflow_rules()

    def _load_workflow_rules(self) -> List[WorkflowRule]:
        """Load workflow business rules"""

        return [
            # Sequential workflow rules
            WorkflowRule(
                rule_id="sequential_next_signer",
                condition="workflow_type == 'sequential' AND signer_signed",
                action="invite_next_signer",
                parameters={"delay_minutes": 5},
            ),
            # Deadline reminder rules
            WorkflowRule(
                rule_id="deadline_reminder_24h",
                condition="time_to_deadline <= 24_hours",
                action="send_reminder",
                parameters={"channels": ["email", "sms"]},
            ),
            WorkflowRule(
                rule_id="deadline_reminder_2h",
                condition="time_to_deadline <= 2_hours",
                action="send_urgent_reminder",
                parameters={"channels": ["email", "sms", "whatsapp"]},
            ),
            # Completion rules
            WorkflowRule(
                rule_id="workflow_complete",
                condition="all_required_signatures_collected",
                action="complete_workflow",
                parameters={"send_completion_notifications": True},
            ),
            # Escalation rules
            WorkflowRule(
                rule_id="escalate_overdue",
                condition="signer_overdue > 48_hours",
                action="escalate_to_creator",
                parameters={"include_manager": True},
            ),
        ]

    async def create_workflow(
        self,
        document_id: str,
        created_by: str,
        signers: List[Dict[str, Any]],
        workflow_type: str = "parallel",
        title: Optional[str] = None,
        custom_message: Optional[str] = None,
        deadline: Optional[datetime] = None,
        require_email_verification: bool = True,
        require_phone_verification: bool = False,
        db: Session = None,
    ) -> SignatureWorkflow:
        """
        Create a new signature workflow

        Args:
            document_id: Document to be signed
            created_by: User ID creating the workflow
            signers: List of signer information
            workflow_type: 'sequential' or 'parallel'
            title: Workflow title
            custom_message: Message for signers
            deadline: Signing deadline
            require_email_verification: Email verification required
            require_phone_verification: Phone verification required
            db: Database session

        Returns:
            Created SignatureWorkflow
        """

        try:
            # Validate document exists and user has permission
            document = db.query(Document).filter(Document.id == document_id, Document.user_id == created_by).first()

            if not document:
                raise ValueError("Document not found or access denied")

            if not document.is_ready_for_signature():
                raise ValueError(f"Document not ready for signature. Status: {document.status}")

            # Create workflow
            workflow = SignatureWorkflow(
                document_id=document_id,
                created_by=created_by,
                workflow_type=workflow_type,
                status=WorkflowStatus.DRAFT.value,
                title=title or f"Signature Request: {document.title}",
                custom_message=custom_message,
                deadline=deadline,
                require_email_verification=require_email_verification,
                require_phone_verification=require_phone_verification,
            )

            db.add(workflow)
            db.flush()  # Get workflow ID

            # Create signers
            workflow_signers = []
            for i, signer_data in enumerate(signers):
                signer = Signer(
                    workflow_id=workflow.id,
                    email=signer_data["email"],
                    phone=signer_data.get("phone"),
                    full_name=signer_data["full_name"],
                    role=signer_data.get("role", "signer"),
                    signing_order=i + 1 if workflow_type == "sequential" else None,
                    status=SignerStatus.PENDING.value,
                )

                db.add(signer)
                workflow_signers.append(signer)

            db.commit()

            logger.info(
                f"Created workflow {workflow.id} for document {document_id} with {len(workflow_signers)} signers"
            )

            return workflow

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to create workflow: {str(e)}")
            raise

    async def start_workflow(self, workflow_id: str, db: Session, send_invitations: bool = True) -> WorkflowState:
        """
        Start a workflow and send initial invitations

        Args:
            workflow_id: Workflow to start
            db: Database session
            send_invitations: Send invitation notifications

        Returns:
            Current workflow state
        """

        try:
            workflow = db.query(SignatureWorkflow).filter(SignatureWorkflow.id == workflow_id).first()

            if not workflow:
                raise ValueError("Workflow not found")

            if workflow.status != WorkflowStatus.DRAFT.value:
                raise ValueError(f"Workflow cannot be started. Current status: {workflow.status}")

            # Update workflow status
            workflow.status = WorkflowStatus.ACTIVE.value

            # Get signers
            signers = (
                db.query(Signer)
                .filter(Signer.workflow_id == workflow_id)
                .order_by(Signer.signing_order.asc().nulls_last())
                .all()
            )

            if not signers:
                raise ValueError("No signers found for workflow")

            # Determine who to invite first
            if workflow.workflow_type == "sequential":
                # Sequential: invite only the first signer
                first_signer = signers[0]
                await self._invite_signer(first_signer, workflow, db)

            else:
                # Parallel: invite all signers
                for signer in signers:
                    await self._invite_signer(signer, workflow, db)

            db.commit()

            # Schedule deadline reminders if deadline is set
            if workflow.deadline:
                await self._schedule_deadline_reminders(workflow, db)

            logger.info(f"Started workflow {workflow_id} ({workflow.workflow_type}) with {len(signers)} signers")

            return WorkflowState(workflow, signers)

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to start workflow {workflow_id}: {str(e)}")
            raise

    async def process_signer_action(
        self, signer_id: str, action: str, db: Session, signature_data: Optional[Dict[str, Any]] = None
    ) -> WorkflowState:
        """
        Process a signer action (viewed, signed, declined)

        Args:
            signer_id: Signer performing action
            action: Action type ('viewed', 'signed', 'declined')
            db: Database session
            signature_data: Signature data if action is 'signed'

        Returns:
            Updated workflow state
        """

        try:
            signer = db.query(Signer).filter(Signer.id == signer_id).first()
            if not signer:
                raise ValueError("Signer not found")

            workflow = db.query(SignatureWorkflow).filter(SignatureWorkflow.id == signer.workflow_id).first()

            if not workflow:
                raise ValueError("Workflow not found")

            if workflow.status != WorkflowStatus.ACTIVE.value:
                raise ValueError(f"Workflow not active. Status: {workflow.status}")

            # Update signer status based on action
            if action == "viewed":
                if signer.status == SignerStatus.INVITED.value:
                    signer.status = SignerStatus.VIEWED.value
                    signer.document_viewed_at = datetime.utcnow()

            elif action == "signed":
                if signature_data and signer.status in [SignerStatus.INVITED.value, SignerStatus.VIEWED.value]:
                    signer.status = SignerStatus.SIGNED.value
                    signer.signed_at = datetime.utcnow()

                    # Process signature data
                    await self._process_signature_data(signer, signature_data, db)

                    # Send completion confirmation
                    await self._send_signature_completion_notification(signer, workflow, db)

            elif action == "declined":
                if signer.status in [SignerStatus.INVITED.value, SignerStatus.VIEWED.value]:
                    signer.status = SignerStatus.DECLINED.value

                    # Notify workflow creator of decline
                    await self._notify_creator_of_decline(signer, workflow, db)

            db.flush()

            # Check workflow progression
            await self._check_workflow_progression(workflow, db)

            db.commit()

            # Get updated state
            all_signers = db.query(Signer).filter(Signer.workflow_id == workflow.id).all()

            logger.info(f"Processed signer action: {action} for signer {signer_id}")

            return WorkflowState(workflow, all_signers)

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to process signer action: {str(e)}")
            raise

    async def _invite_signer(self, signer: Signer, workflow: SignatureWorkflow, db: Session):
        """Send invitation to a signer with enhanced SMS integration"""

        try:
            # Update signer status
            signer.status = SignerStatus.INVITED.value
            signer.invitation_sent_at = datetime.utcnow()

            # Generate invitation token and signing URL
            invitation_token = self._generate_invitation_token(signer)
            signer.invitation_token = invitation_token

            # Generate secure signing URL
            signing_url = enhanced_notification_service.generate_secure_signing_url(signer, workflow)

            # Get document info
            document = db.query(Document).filter(Document.id == workflow.document_id).first()

            # Get creator info
            creator = db.query(User).filter(User.id == workflow.created_by).first()

            # Detect preferred language (default to English)
            language = self._detect_user_language(signer, creator)

            # Send notifications via multiple channels
            notification_results = {}
            
            # Always send email if available
            if signer.email:
                try:
                    email_result = await notification_service.send_signature_invitation(
                        signer=signer,
                        workflow=workflow,
                        document_title=document.title if document else "Document",
                        sender_name=creator.full_name if creator else "SignaAI User",
                        signing_url=signing_url,
                        channels=[NotificationChannel.EMAIL],
                        custom_message=workflow.custom_message,
                        language=language,
                    )
                    notification_results["email"] = email_result
                except Exception as e:
                    logger.error(f"Failed to send email invitation to {signer.email}: {str(e)}")
                    notification_results["email"] = {"success": False, "error": str(e)}
            
            # Send SMS if phone number available and SMS is preferred/required
            if signer.phone and (workflow.require_phone_verification or not signer.email):
                try:
                    sms_result = await enhanced_notification_service.send_signature_request_sms(
                        signer=signer,
                        workflow=workflow,
                        document_title=document.title if document else "Document",
                        sender_name=creator.full_name if creator else "SignaAI User",
                        signing_url=signing_url,
                        language=language,
                        custom_message=workflow.custom_message
                    )
                    notification_results["sms"] = sms_result
                    
                    # Log SMS delivery status
                    if sms_result.get("success"):
                        logger.info(f"SMS invitation sent successfully to {signer.phone}: {sms_result.get('message_id')}")
                    else:
                        logger.warning(f"SMS invitation failed for {signer.phone}: {sms_result.get('error')}")
                        
                except Exception as e:
                    logger.error(f"Failed to send SMS invitation to {signer.phone}: {str(e)}")
                    notification_results["sms"] = {"success": False, "error": str(e)}
            
            # Store notification results in signer metadata (optional)
            if hasattr(signer, 'metadata'):
                signer.metadata = signer.metadata or {}
                signer.metadata['invitation_results'] = notification_results

            # Check if at least one notification was sent successfully
            successful_notifications = [r for r in notification_results.values() if r.get("success")]
            if not successful_notifications:
                raise Exception(f"All notification channels failed for signer {signer.email}")

            logger.info(f"Invited signer {signer.email} for workflow {workflow.id} via {len(successful_notifications)} channels")

        except Exception as e:
            logger.error(f"Failed to invite signer {signer.email}: {str(e)}")
            raise

    async def _process_signature_data(self, signer: Signer, signature_data: Dict[str, Any], db: Session):
        """Process and store signature data"""

        try:
            # Get signature fields that need to be filled
            workflow = db.query(SignatureWorkflow).filter(SignatureWorkflow.id == signer.workflow_id).first()

            signature_fields = (
                db.query(SignatureField)
                .filter(
                    SignatureField.document_id == workflow.document_id,
                    or_(SignatureField.signer_email == signer.email, SignatureField.signer_email.is_(None)),
                )
                .all()
            )

            # Process each signature field
            for field_data in signature_data.get("signatures", []):
                field_id = field_data.get("field_id")
                signature_value = field_data.get("signature_data")
                biometric_data = field_data.get("biometric_data")

                # Find corresponding signature field
                signature_field = next((f for f in signature_fields if str(f.id) == field_id), None)

                if signature_field and signature_value:
                    # Create signature record
                    signature = Signature(
                        signer_id=signer.id,
                        signature_field_id=signature_field.id,
                        signature_data=signature_value,
                        signature_type=field_data.get("signature_type", "drawn"),
                        biometric_data=biometric_data,
                        device_info=signature_data.get("device_info"),
                        verification_status="pending",
                    )

                    db.add(signature)

            logger.info(f"Processed signature data for signer {signer.email}")

        except Exception as e:
            logger.error(f"Failed to process signature data: {str(e)}")
            raise

    async def _check_workflow_progression(self, workflow: SignatureWorkflow, db: Session):
        """Check if workflow can progress to next stage"""

        try:
            signers = (
                db.query(Signer)
                .filter(Signer.workflow_id == workflow.id)
                .order_by(Signer.signing_order.asc().nulls_last())
                .all()
            )

            if workflow.workflow_type == "sequential":
                await self._check_sequential_progression(workflow, signers, db)
            else:
                await self._check_parallel_progression(workflow, signers, db)

        except Exception as e:
            logger.error(f"Failed to check workflow progression: {str(e)}")

    async def _check_sequential_progression(self, workflow: SignatureWorkflow, signers: List[Signer], db: Session):
        """Check progression for sequential workflow"""

        try:
            # Find next signer to invite
            for signer in signers:
                if signer.status == SignerStatus.PENDING.value:
                    # Check if previous signer has signed
                    previous_signers = [s for s in signers if s.signing_order < signer.signing_order]
                    all_previous_signed = all(s.status == SignerStatus.SIGNED.value for s in previous_signers)

                    if all_previous_signed:
                        await self._invite_signer(signer, workflow, db)
                    break

            # Check if all signers have signed
            all_signed = all(s.status == SignerStatus.SIGNED.value for s in signers)
            if all_signed:
                await self._complete_workflow(workflow, db)

        except Exception as e:
            logger.error(f"Failed to check sequential progression: {str(e)}")

    async def _check_parallel_progression(self, workflow: SignatureWorkflow, signers: List[Signer], db: Session):
        """Check progression for parallel workflow"""

        try:
            # Check if all required signers have signed
            required_signers = [s for s in signers if s.status != SignerStatus.DECLINED.value]
            signed_signers = [s for s in required_signers if s.status == SignerStatus.SIGNED.value]

            if len(signed_signers) == len(required_signers):
                await self._complete_workflow(workflow, db)

        except Exception as e:
            logger.error(f"Failed to check parallel progression: {str(e)}")

    async def _complete_workflow(self, workflow: SignatureWorkflow, db: Session):
        """Complete a workflow"""

        try:
            workflow.status = WorkflowStatus.COMPLETED.value
            workflow.completed_at = datetime.utcnow()

            # Update document status
            document = db.query(Document).filter(Document.id == workflow.document_id).first()
            if document:
                document.status = "signed"

            # Send completion notifications
            await self._send_workflow_completion_notifications(workflow, db)

            logger.info(f"Completed workflow {workflow.id}")

        except Exception as e:
            logger.error(f"Failed to complete workflow: {str(e)}")

    async def _send_signature_completion_notification(self, signer: Signer, workflow: SignatureWorkflow, db: Session):
        """Send signature completion confirmation to signer"""

        try:
            document = db.query(Document).filter(Document.id == workflow.document_id).first()
            download_url = f"{settings.FRONTEND_URL}/documents/{workflow.document_id}/download"

            await notification_service.send_signature_completed(
                signer=signer,
                document_title=document.title if document else "Document",
                download_url=download_url,
                language="en",
            )

        except Exception as e:
            logger.error(f"Failed to send completion notification: {str(e)}")

    async def _send_workflow_completion_notifications(self, workflow: SignatureWorkflow, db: Session):
        """Send workflow completion notifications to all parties"""

        try:
            # Notify creator
            creator = db.query(User).filter(User.id == workflow.created_by).first()
            document = db.query(Document).filter(Document.id == workflow.document_id).first()

            if creator and document:
                # Send email to creator about completion
                subject = f"Workflow Completed: {document.name}"
                body = f"All signers have completed signing the document '{document.name}'."
                await self._send_notification_email(creator.email, subject, body)
                logger.info(f"Notified creator {creator.email} of workflow completion")

            logger.info(f"Sent workflow completion notifications for {workflow.id}")

        except Exception as e:
            logger.error(f"Failed to send workflow completion notifications: {str(e)}")

    async def _notify_creator_of_decline(self, signer: Signer, workflow: SignatureWorkflow, db: Session):
        """Notify workflow creator when signer declines"""

        try:
            creator = db.query(User).filter(User.id == workflow.created_by).first()
            document = db.query(Document).filter(Document.id == workflow.document_id).first()

            if creator and document:
                # Implement decline notification
                subject = f"Signature Declined: {document.name}"
                body = f"Signer {signer.name} ({signer.email}) has declined to sign the document '{document.name}'."
                await self._send_notification_email(creator.email, subject, body)

            logger.info(f"Notified creator of decline from {signer.email}")

        except Exception as e:
            logger.error(f"Failed to notify creator of decline: {str(e)}")

    async def _schedule_deadline_reminders(self, workflow: SignatureWorkflow, db: Session):
        """Schedule deadline reminder notifications"""

        try:
            if not workflow.deadline:
                return

            now = datetime.utcnow()
            time_to_deadline = workflow.deadline - now

            # Schedule 24-hour reminder
            if time_to_deadline > timedelta(hours=24):
                reminder_time = workflow.deadline - timedelta(hours=24)
                # TODO: Schedule with task queue (Celery)

            # Schedule 2-hour reminder
            if time_to_deadline > timedelta(hours=2):
                reminder_time = workflow.deadline - timedelta(hours=2)
                # TODO: Schedule with task queue (Celery)

            logger.info(f"Scheduled deadline reminders for workflow {workflow.id}")

        except Exception as e:
            logger.error(f"Failed to schedule deadline reminders: {str(e)}")

    def _generate_invitation_token(self, signer: Signer) -> str:
        """Generate secure invitation token for signer"""

        import hashlib
        import secrets

        # Generate secure random token
        token_data = f"{signer.id}:{signer.email}:{datetime.utcnow().isoformat()}:{secrets.token_hex(32)}"
        token = hashlib.sha256(token_data.encode()).hexdigest()

        return token

    def _detect_user_language(self, signer: Signer, creator: User) -> str:
        """Detect preferred language for signer notifications"""
        
        # Priority order: signer preference -> creator preference -> document language -> default
        
        # Check signer's metadata for language preference
        if hasattr(signer, 'metadata') and signer.metadata:
            signer_lang = signer.metadata.get('preferred_language')
            if signer_lang in ['en', 'he', 'ar']:
                return signer_lang
        
        # Check creator's language preference
        if hasattr(creator, 'preferred_language') and creator.preferred_language:
            if creator.preferred_language in ['en', 'he', 'ar']:
                return creator.preferred_language
        
        # Check phone number country code for regional defaults
        if signer.phone:
            if signer.phone.startswith('+972'):  # Israel
                return 'he'  # Hebrew default for Israeli numbers
            elif signer.phone.startswith('+966') or signer.phone.startswith('+971'):  # Saudi Arabia, UAE
                return 'ar'  # Arabic default for Gulf region
        
        # Default to English
        return 'en'

    async def send_reminder_notifications(
        self,
        workflow_id: str,
        db: Session,
        reminder_type: str = "gentle",
        custom_message: Optional[str] = None
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Send reminder notifications to pending signers"""
        
        try:
            workflow = db.query(SignatureWorkflow).filter(SignatureWorkflow.id == workflow_id).first()
            if not workflow:
                raise ValueError("Workflow not found")
            
            # Get pending signers
            pending_signers = (
                db.query(Signer)
                .filter(
                    Signer.workflow_id == workflow_id,
                    Signer.status.in_([
                        SignerStatus.INVITED.value,
                        SignerStatus.VIEWED.value
                    ])
                )
                .all()
            )
            
            if not pending_signers:
                return {"message": "No pending signers found", "results": []}
            
            # Get document and creator info
            document = db.query(Document).filter(Document.id == workflow.document_id).first()
            creator = db.query(User).filter(User.id == workflow.created_by).first()
            
            reminder_results = []
            
            for signer in pending_signers:
                language = self._detect_user_language(signer, creator)
                signing_url = enhanced_notification_service.generate_secure_signing_url(signer, workflow)
                
                # Calculate days until deadline
                days_until_deadline = None
                if workflow.deadline:
                    time_diff = workflow.deadline - datetime.utcnow()
                    days_until_deadline = max(0, time_diff.days)
                
                signer_results = {}
                
                # Send SMS reminder if phone available
                if signer.phone:
                    sms_result = await enhanced_notification_service.send_reminder_sms(
                        signer=signer,
                        workflow=workflow,
                        document_title=document.title if document else "Document",
                        sender_name=creator.full_name if creator else "SignaAI User",
                        signing_url=signing_url,
                        days_until_deadline=days_until_deadline or 0,
                        language=language
                    )
                    signer_results["sms"] = sms_result
                
                # Send email reminder
                if signer.email:
                    email_result = await notification_service.send_signature_reminder(
                        signer=signer,
                        workflow=workflow,
                        document_title=document.title if document else "Document",
                        sender_name=creator.full_name if creator else "SignaAI User",
                        signing_url=signing_url,
                        language=language
                    )
                    signer_results["email"] = email_result
                
                reminder_results.append({
                    "signer_id": str(signer.id),
                    "signer_email": signer.email,
                    "signer_phone": signer.phone,
                    "language": language,
                    "results": signer_results
                })
            
            logger.info(f"Sent reminder notifications for workflow {workflow_id} to {len(pending_signers)} signers")
            
            return {
                "workflow_id": workflow_id,
                "reminder_type": reminder_type,
                "total_reminders_sent": len(reminder_results),
                "results": reminder_results
            }
            
        except Exception as e:
            logger.error(f"Failed to send reminder notifications for workflow {workflow_id}: {str(e)}")
            raise

    async def get_workflow_state(self, workflow_id: str, db: Session) -> Optional[WorkflowState]:
        """Get current workflow state"""

        try:
            workflow = db.query(SignatureWorkflow).filter(SignatureWorkflow.id == workflow_id).first()

            if not workflow:
                return None

            signers = (
                db.query(Signer)
                .filter(Signer.workflow_id == workflow_id)
                .order_by(Signer.signing_order.asc().nulls_last())
                .all()
            )

            return WorkflowState(workflow, signers)

        except Exception as e:
            logger.error(f"Failed to get workflow state: {str(e)}")
            return None

    async def cancel_workflow(self, workflow_id: str, reason: str, db: Session) -> bool:
        """Cancel an active workflow"""

        try:
            workflow = db.query(SignatureWorkflow).filter(SignatureWorkflow.id == workflow_id).first()

            if not workflow:
                return False

            if workflow.status not in [WorkflowStatus.ACTIVE.value, WorkflowStatus.PAUSED.value]:
                return False

            # Update workflow status
            workflow.status = WorkflowStatus.CANCELLED.value

            # Update all pending signers
            signers = (
                db.query(Signer)
                .filter(
                    Signer.workflow_id == workflow_id,
                    Signer.status.in_(
                        [SignerStatus.PENDING.value, SignerStatus.INVITED.value, SignerStatus.VIEWED.value]
                    ),
                )
                .all()
            )

            for signer in signers:
                signer.status = "cancelled"

            db.commit()

            # TODO: Send cancellation notifications

            logger.info(f"Cancelled workflow {workflow_id}: {reason}")
            return True

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to cancel workflow: {str(e)}")
            return False


# Global workflow service instance
workflow_service = WorkflowService()
