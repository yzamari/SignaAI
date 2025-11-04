"""
Signature Workflow API Endpoints - Sprint 4: SIG-003, SIG-004

RESTful API for signature workflow management:
- Workflow creation and management
- Signer invitation and tracking
- Real-time progress monitoring
- Deadline management
- Sequential and parallel workflow support

Root Cause: Need for comprehensive workflow API with real-time capabilities
Fix: Full REST API with WebSocket support for real-time updates
"""

import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Union

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, validator
from sqlalchemy.orm import Session

from core.config import settings
from core.database import get_db
from models.document import Document, Signature, SignatureWorkflow, Signer
from models.user import User
from services.auth import auth_service
from services.notification_service import NotificationChannel
from services.workflow_service import SignerStatus, WorkflowStatus, workflow_service
from services.enhanced_notification_service import enhanced_notification_service

router = APIRouter()
logger = logging.getLogger(__name__)
security = HTTPBearer()


# WebSocket connection manager for real-time updates
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, workflow_id: str):
        await websocket.accept()
        if workflow_id not in self.active_connections:
            self.active_connections[workflow_id] = []
        self.active_connections[workflow_id].append(websocket)

    def disconnect(self, websocket: WebSocket, workflow_id: str):
        if workflow_id in self.active_connections:
            self.active_connections[workflow_id].remove(websocket)
            if not self.active_connections[workflow_id]:
                del self.active_connections[workflow_id]

    async def send_workflow_update(self, workflow_id: str, data: dict):
        if workflow_id in self.active_connections:
            for connection in self.active_connections[workflow_id]:
                try:
                    await connection.send_text(json.dumps(data))
                except:
                    # Remove dead connections
                    self.active_connections[workflow_id].remove(connection)


manager = ConnectionManager()


# Request/Response Models
class SignerRequest(BaseModel):
    """Signer information for workflow creation"""

    email: str = Field(..., description="Signer email address")
    full_name: str = Field(..., description="Signer full name")
    phone: Optional[str] = Field(None, description="Signer phone number")
    role: str = Field("signer", description="Signer role")

    @validator("email")
    def validate_email(cls, v):
        # Basic email validation
        if "@" not in v or "." not in v.split("@")[1]:
            raise ValueError("Invalid email format")
        return v.lower()


class WorkflowCreateRequest(BaseModel):
    """Create signature workflow request"""

    document_id: str = Field(..., description="Document UUID to be signed")
    signers: List[SignerRequest] = Field(..., min_items=1, description="List of signers")
    workflow_type: str = Field("parallel", description="Workflow type: 'sequential' or 'parallel'")
    title: Optional[str] = Field(None, description="Workflow title")
    custom_message: Optional[str] = Field(None, max_length=1000, description="Custom message for signers")
    deadline: Optional[datetime] = Field(None, description="Signing deadline")
    require_email_verification: bool = Field(True, description="Require email verification")
    require_phone_verification: bool = Field(False, description="Require phone verification")
    send_invitations_immediately: bool = Field(True, description="Send invitations when workflow is created")
    notification_channels: List[str] = Field(["email"], description="Notification channels to use")

    @validator("workflow_type")
    def validate_workflow_type(cls, v):
        if v not in ["sequential", "parallel"]:
            raise ValueError('Workflow type must be "sequential" or "parallel"')
        return v

    @validator("deadline")
    def validate_deadline(cls, v):
        if v and v <= datetime.utcnow():
            raise ValueError("Deadline must be in the future")
        return v

    @validator("notification_channels")
    def validate_channels(cls, v):
        valid_channels = [c.value for c in NotificationChannel]
        for channel in v:
            if channel not in valid_channels:
                raise ValueError(f"Invalid notification channel: {channel}")
        return v


class WorkflowResponse(BaseModel):
    """Workflow response model"""

    id: str
    document_id: str
    created_by: str
    workflow_type: str
    status: str
    title: Optional[str]
    custom_message: Optional[str]
    deadline: Optional[datetime]
    require_email_verification: bool
    require_phone_verification: bool
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class SignerResponse(BaseModel):
    """Signer response model"""

    id: str
    workflow_id: str
    email: str
    phone: Optional[str]
    full_name: str
    role: str
    signing_order: Optional[int]
    status: str
    invitation_sent_at: Optional[datetime]
    document_viewed_at: Optional[datetime]
    signed_at: Optional[datetime]
    signer_comments: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class WorkflowDetailResponse(WorkflowResponse):
    """Detailed workflow response with signers"""

    signers: List[SignerResponse]
    progress_percentage: float
    next_action: Optional[str]

    class Config:
        from_attributes = True


class SignatureData(BaseModel):
    """Signature data for processing"""

    field_id: str
    signature_data: str  # Base64 encoded
    signature_type: str = "drawn"
    biometric_data: Optional[Dict[str, Any]] = None


class SignerActionRequest(BaseModel):
    """Signer action request"""

    action: str = Field(..., description="Action: 'viewed', 'signed', 'declined'")
    signatures: Optional[List[SignatureData]] = Field(None, description="Signature data if action is 'signed'")
    device_info: Optional[Dict[str, Any]] = Field(None, description="Device information")
    comments: Optional[str] = Field(None, max_length=500, description="Signer comments")

    @validator("action")
    def validate_action(cls, v):
        if v not in ["viewed", "signed", "declined"]:
            raise ValueError('Action must be "viewed", "signed", or "declined"')
        return v


def get_current_user(token: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)) -> User:
    """Get current authenticated user"""
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    payload = auth_service.verify_token(token.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    return user


@router.post("/", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    workflow_data: WorkflowCreateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """
    Create a new signature workflow

    Creates a workflow with the specified signers and configuration.
    Optionally starts the workflow and sends invitations immediately.
    """
    try:
        # Validate document access
        document = (
            db.query(Document)
            .filter(Document.id == uuid.UUID(workflow_data.document_id), Document.user_id == current_user.id)
            .first()
        )

        if not document:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

        if not document.is_ready_for_signature():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Document not ready for signature. Status: {document.status}",
            )

        # Convert signers to dict format
        signers_data = [
            {"email": signer.email, "full_name": signer.full_name, "phone": signer.phone, "role": signer.role}
            for signer in workflow_data.signers
        ]

        # Create workflow
        workflow = await workflow_service.create_workflow(
            document_id=workflow_data.document_id,
            created_by=str(current_user.id),
            signers=signers_data,
            workflow_type=workflow_data.workflow_type,
            title=workflow_data.title,
            custom_message=workflow_data.custom_message,
            deadline=workflow_data.deadline,
            require_email_verification=workflow_data.require_email_verification,
            require_phone_verification=workflow_data.require_phone_verification,
            db=db,
        )

        # Start workflow immediately if requested
        if workflow_data.send_invitations_immediately:
            await workflow_service.start_workflow(workflow_id=str(workflow.id), db=db, send_invitations=True)

            # Refresh workflow to get updated status
            db.refresh(workflow)

        logger.info(f"Created workflow {workflow.id} for document {workflow_data.document_id}")

        return WorkflowResponse(
            id=str(workflow.id),
            document_id=str(workflow.document_id),
            created_by=str(workflow.created_by),
            workflow_type=workflow.workflow_type,
            status=workflow.status,
            title=workflow.title,
            custom_message=workflow.custom_message,
            deadline=workflow.deadline,
            require_email_verification=workflow.require_email_verification,
            require_phone_verification=workflow.require_phone_verification,
            created_at=workflow.created_at,
            updated_at=workflow.updated_at,
            completed_at=workflow.completed_at,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create workflow: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create workflow")


@router.get("/{workflow_id}", response_model=WorkflowDetailResponse)
async def get_workflow(workflow_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Get workflow details with signers and progress information
    """
    try:
        # Validate workflow ID
        try:
            workflow_uuid = uuid.UUID(workflow_id)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid workflow ID format")

        # Get workflow
        workflow = (
            db.query(SignatureWorkflow)
            .filter(SignatureWorkflow.id == workflow_uuid, SignatureWorkflow.created_by == current_user.id)
            .first()
        )

        if not workflow:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

        # Get signers
        signers = (
            db.query(Signer)
            .filter(Signer.workflow_id == workflow_uuid)
            .order_by(Signer.signing_order.asc().nulls_last())
            .all()
        )

        # Calculate progress
        total_signers = len(signers)
        signed_signers = len([s for s in signers if s.status == SignerStatus.SIGNED.value])
        progress_percentage = (signed_signers / total_signers * 100) if total_signers > 0 else 0

        # Determine next action
        next_action = None
        if workflow.status == WorkflowStatus.DRAFT.value:
            next_action = "Start workflow and send invitations"
        elif workflow.status == WorkflowStatus.ACTIVE.value:
            pending_signers = [
                s for s in signers if s.status in [SignerStatus.PENDING.value, SignerStatus.INVITED.value]
            ]
            if pending_signers:
                if workflow.workflow_type == "sequential":
                    next_signer = min(pending_signers, key=lambda s: s.signing_order or 999)
                    next_action = f"Waiting for {next_signer.full_name} to sign"
                else:
                    next_action = f"Waiting for {len(pending_signers)} signers to complete"

        # Convert signers to response models
        signer_responses = [
            SignerResponse(
                id=str(signer.id),
                workflow_id=str(signer.workflow_id),
                email=signer.email,
                phone=signer.phone,
                full_name=signer.full_name,
                role=signer.role,
                signing_order=signer.signing_order,
                status=signer.status,
                invitation_sent_at=signer.invitation_sent_at,
                document_viewed_at=signer.document_viewed_at,
                signed_at=signer.signed_at,
                signer_comments=signer.signer_comments,
                created_at=signer.created_at,
            )
            for signer in signers
        ]

        return WorkflowDetailResponse(
            id=str(workflow.id),
            document_id=str(workflow.document_id),
            created_by=str(workflow.created_by),
            workflow_type=workflow.workflow_type,
            status=workflow.status,
            title=workflow.title,
            custom_message=workflow.custom_message,
            deadline=workflow.deadline,
            require_email_verification=workflow.require_email_verification,
            require_phone_verification=workflow.require_phone_verification,
            created_at=workflow.created_at,
            updated_at=workflow.updated_at,
            completed_at=workflow.completed_at,
            signers=signer_responses,
            progress_percentage=progress_percentage,
            next_action=next_action,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get workflow {workflow_id}: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve workflow")


@router.post("/{workflow_id}/start")
async def start_workflow(
    workflow_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """
    Start a draft workflow and send invitations
    """
    try:
        # Validate workflow access
        workflow_uuid = uuid.UUID(workflow_id)
        workflow = (
            db.query(SignatureWorkflow)
            .filter(SignatureWorkflow.id == workflow_uuid, SignatureWorkflow.created_by == current_user.id)
            .first()
        )

        if not workflow:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

        if workflow.status != WorkflowStatus.DRAFT.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Workflow cannot be started. Current status: {workflow.status}",
            )

        # Start workflow
        workflow_state = await workflow_service.start_workflow(workflow_id=workflow_id, db=db, send_invitations=True)

        # Send real-time update
        await manager.send_workflow_update(
            workflow_id,
            {
                "type": "workflow_started",
                "workflow_id": workflow_id,
                "status": workflow_state.workflow.status,
                "message": "Workflow started and invitations sent",
            },
        )

        logger.info(f"Started workflow {workflow_id}")

        return {
            "message": "Workflow started successfully",
            "status": workflow_state.workflow.status,
            "invitations_sent": len(workflow_state.signers),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to start workflow {workflow_id}: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to start workflow")


@router.post("/{workflow_id}/cancel")
async def cancel_workflow(
    workflow_id: str,
    reason: str = "Cancelled by user",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Cancel an active workflow
    """
    try:
        # Validate workflow access
        workflow_uuid = uuid.UUID(workflow_id)
        workflow = (
            db.query(SignatureWorkflow)
            .filter(SignatureWorkflow.id == workflow_uuid, SignatureWorkflow.created_by == current_user.id)
            .first()
        )

        if not workflow:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

        # Cancel workflow
        success = await workflow_service.cancel_workflow(workflow_id=workflow_id, reason=reason, db=db)

        if not success:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Workflow cannot be cancelled")

        # Send real-time update
        await manager.send_workflow_update(
            workflow_id,
            {"type": "workflow_cancelled", "workflow_id": workflow_id, "status": "cancelled", "reason": reason},
        )

        logger.info(f"Cancelled workflow {workflow_id}: {reason}")

        return {"message": "Workflow cancelled successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to cancel workflow {workflow_id}: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to cancel workflow")


@router.post("/sign/{invitation_token}")
async def process_signer_action(invitation_token: str, action_data: SignerActionRequest, db: Session = Depends(get_db)):
    """
    Process signer action (viewed, signed, declined)
    This endpoint is called by signers without authentication
    """
    try:
        # Find signer by invitation token
        signer = db.query(Signer).filter(Signer.invitation_token == invitation_token).first()

        if not signer:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid invitation token")

        # Get workflow
        workflow = db.query(SignatureWorkflow).filter(SignatureWorkflow.id == signer.workflow_id).first()

        if not workflow or workflow.status != WorkflowStatus.ACTIVE.value:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Workflow is not active")

        # Check deadline
        if workflow.deadline and workflow.deadline < datetime.utcnow():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Signing deadline has passed")

        # Process action
        signature_data = None
        if action_data.action == "signed" and action_data.signatures:
            signature_data = {
                "signatures": [s.dict() for s in action_data.signatures],
                "device_info": action_data.device_info,
            }

        # Update signer comments
        if action_data.comments:
            signer.signer_comments = action_data.comments

        # Process the action
        workflow_state = await workflow_service.process_signer_action(
            signer_id=str(signer.id), action=action_data.action, db=db, signature_data=signature_data
        )

        # Send real-time update
        await manager.send_workflow_update(
            str(workflow.id),
            {
                "type": "signer_action",
                "workflow_id": str(workflow.id),
                "signer_id": str(signer.id),
                "signer_name": signer.full_name,
                "action": action_data.action,
                "status": workflow_state.workflow.status,
                "progress": len(workflow_state.completed_signers) / len(workflow_state.signers) * 100,
            },
        )

        logger.info(f"Processed signer action: {action_data.action} from {signer.email}")

        return {
            "message": f"Action '{action_data.action}' processed successfully",
            "workflow_status": workflow_state.workflow.status,
            "signer_status": signer.status,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to process signer action: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to process signer action")


@router.get("/{workflow_id}/progress")
async def get_workflow_progress(
    workflow_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """
    Get real-time workflow progress information
    """
    try:
        workflow_uuid = uuid.UUID(workflow_id)

        # Get workflow state
        workflow_state = await workflow_service.get_workflow_state(workflow_id, db)

        if not workflow_state:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

        # Verify user access
        if str(workflow_state.workflow.created_by) != str(current_user.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

        # Calculate detailed progress
        total_signers = len(workflow_state.signers)
        completed_signers = len(workflow_state.completed_signers)
        pending_signers = len(workflow_state.pending_signers)
        declined_signers = len(workflow_state.declined_signers)

        # Time-based metrics
        created_at = workflow_state.workflow.created_at
        elapsed_time = datetime.utcnow() - created_at

        deadline_info = None
        if workflow_state.workflow.deadline:
            time_remaining = workflow_state.workflow.deadline - datetime.utcnow()
            deadline_info = {
                "deadline": workflow_state.workflow.deadline,
                "time_remaining_seconds": max(0, int(time_remaining.total_seconds())),
                "is_overdue": time_remaining.total_seconds() < 0,
                "urgency_level": "high" if time_remaining.total_seconds() < 7200 else "normal",  # 2 hours
            }

        return {
            "workflow_id": workflow_id,
            "status": workflow_state.workflow.status,
            "progress": {
                "total_signers": total_signers,
                "completed_signers": completed_signers,
                "pending_signers": pending_signers,
                "declined_signers": declined_signers,
                "completion_percentage": (completed_signers / total_signers * 100) if total_signers > 0 else 0,
            },
            "timing": {
                "created_at": created_at,
                "elapsed_seconds": int(elapsed_time.total_seconds()),
                "deadline_info": deadline_info,
            },
            "signers": [
                {
                    "id": str(s.id),
                    "name": s.full_name,
                    "email": s.email,
                    "status": s.status,
                    "signing_order": s.signing_order,
                    "invited_at": s.invitation_sent_at,
                    "viewed_at": s.document_viewed_at,
                    "signed_at": s.signed_at,
                }
                for s in workflow_state.signers
            ],
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get workflow progress: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve workflow progress"
        )


@router.websocket("/ws/{workflow_id}")
async def workflow_websocket_endpoint(
    websocket: WebSocket, workflow_id: str, token: str, db: Session = Depends(get_db)
):
    """
    WebSocket endpoint for real-time workflow updates

    Connect to receive live updates about workflow progress, signer actions,
    and status changes. Requires authentication token as query parameter.
    """
    try:
        # Verify token
        payload = auth_service.verify_token(token)
        if not payload:
            await websocket.close(code=1008, reason="Invalid token")
            return

        user_id = payload.get("sub")
        user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
        if not user:
            await websocket.close(code=1008, reason="User not found")
            return

        # Verify workflow access
        workflow_uuid = uuid.UUID(workflow_id)
        workflow = (
            db.query(SignatureWorkflow)
            .filter(SignatureWorkflow.id == workflow_uuid, SignatureWorkflow.created_by == user.id)
            .first()
        )

        if not workflow:
            await websocket.close(code=1008, reason="Workflow not found")
            return

        # Connect to workflow updates
        await manager.connect(websocket, workflow_id)

        # Send initial workflow state
        workflow_state = await workflow_service.get_workflow_state(workflow_id, db)
        if workflow_state:
            initial_data = {
                "type": "initial_state",
                "workflow_id": workflow_id,
                "status": workflow_state.workflow.status,
                "progress": len(workflow_state.completed_signers) / len(workflow_state.signers) * 100,
                "signers": len(workflow_state.signers),
                "completed": len(workflow_state.completed_signers),
                "pending": len(workflow_state.pending_signers),
            }
            await websocket.send_text(json.dumps(initial_data))

        # Keep connection alive and handle disconnect
        try:
            while True:
                await websocket.receive_text()  # Keep connection alive
        except WebSocketDisconnect:
            manager.disconnect(websocket, workflow_id)

    except Exception as e:
        logger.error(f"WebSocket error for workflow {workflow_id}: {str(e)}")
        await websocket.close(code=1011, reason="Internal error")


# List workflows endpoint
@router.get("/", response_model=List[WorkflowResponse])
async def list_workflows(
    status: Optional[str] = None,
    document_id: Optional[str] = None,
    page: int = 1,
    per_page: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List user's signature workflows with filtering and pagination
    """
    try:
        # Base query
        query = db.query(SignatureWorkflow).filter(SignatureWorkflow.created_by == current_user.id)

        # Apply filters
        if status:
            if status not in [s.value for s in WorkflowStatus]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid status. Valid options: {[s.value for s in WorkflowStatus]}",
                )
            query = query.filter(SignatureWorkflow.status == status)

        if document_id:
            try:
                doc_uuid = uuid.UUID(document_id)
                query = query.filter(SignatureWorkflow.document_id == doc_uuid)
            except ValueError:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid document ID format")

        # Apply pagination
        offset = (page - 1) * per_page
        workflows = query.order_by(SignatureWorkflow.created_at.desc()).offset(offset).limit(per_page).all()

        # Convert to response models
        workflow_responses = [
            WorkflowResponse(
                id=str(w.id),
                document_id=str(w.document_id),
                created_by=str(w.created_by),
                workflow_type=w.workflow_type,
                status=w.status,
                title=w.title,
                custom_message=w.custom_message,
                deadline=w.deadline,
                require_email_verification=w.require_email_verification,
                require_phone_verification=w.require_phone_verification,
                created_at=w.created_at,
                updated_at=w.updated_at,
                completed_at=w.completed_at,
            )
            for w in workflows
        ]

        return workflow_responses

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to list workflows: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve workflows")


# SMS Testing and Management Endpoints

class SMSTestRequest(BaseModel):
    """SMS test message request"""
    
    phone_number: str = Field(..., description="Phone number to test (with country code)")
    language: str = Field("en", description="Message language: en, he, ar")
    message_type: str = Field("test", description="Message type: test, signature_request")
    custom_message: Optional[str] = Field(None, description="Custom test message")
    
    @validator("phone_number")
    def validate_phone(cls, v):
        if not v.startswith("+") and len(v.replace("+", "").replace("-", "").replace(" ", "")) < 8:
            raise ValueError("Invalid phone number format. Use international format (+1234567890)")
        return v
        
    @validator("language")
    def validate_language(cls, v):
        if v not in ["en", "he", "ar"]:
            raise ValueError("Language must be en, he, or ar")
        return v


@router.post("/sms/test", summary="Test SMS functionality")
async def test_sms(
    sms_request: SMSTestRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Test SMS functionality with Twilio integration
    
    This endpoint allows testing SMS delivery before sending actual signature requests.
    Useful for:
    - Verifying Twilio configuration
    - Testing phone number formatting
    - Validating multi-language support
    - Debugging delivery issues
    """
    try:
        # Create mock signer and workflow for testing
        mock_signer = type('MockSigner', (), {
            'id': 'test-signer-id',
            'full_name': 'Test User',
            'phone': sms_request.phone_number,
            'email': current_user.email
        })
        
        mock_workflow = type('MockWorkflow', (), {
            'id': 'test-workflow-id',
            'deadline': datetime.utcnow() + timedelta(days=7)
        })
        
        # Send test message
        if sms_request.message_type == "signature_request":
            # Test signature request SMS
            result = await enhanced_notification_service.send_signature_request_sms(
                signer=mock_signer,
                workflow=mock_workflow,
                document_title="Test Document - SignaAI",
                sender_name=current_user.full_name or "SignaAI Test User",
                signing_url="https://signaai.com/sign/test-token",
                language=sms_request.language,
                custom_message=sms_request.custom_message
            )
        else:
            # Send simple test message
            test_messages = {
                "en": f"📱 SignaAI SMS Test - Hello {current_user.full_name or 'User'}! Your SMS integration is working correctly. Time: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
                "he": f"📱 בדיקת SMS של SignaAI - שלום {current_user.full_name or 'משתמש'}! האינטגרציה של ה-SMS שלך עובדת כהלכה. זמן: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
                "ar": f"📱 اختبار SMS من SignaAI - مرحبا {current_user.full_name or 'المستخدم'}! تكامل الرسائل النصية يعمل بشكل صحيح. الوقت: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}"
            }
            
            test_message = sms_request.custom_message or test_messages.get(sms_request.language, test_messages["en"])
            
            # Use the internal SMS method for simple test
            result = await enhanced_notification_service._send_sms_with_retry(
                phone_number=sms_request.phone_number,
                message=test_message,
                signer_id="test",
                workflow_id="test"
            )
        
        logger.info(f"SMS test sent by {current_user.email} to {sms_request.phone_number}: {result.get('success')}")
        
        return {
            "success": result.get("success", False),
            "message_id": result.get("message_id"),
            "recipient": result.get("recipient"),
            "language": sms_request.language,
            "message_type": sms_request.message_type,
            "sent_at": result.get("sent_at"),
            "status": result.get("status"),
            "error": result.get("error") if not result.get("success") else None,
            "attempt": result.get("attempt", 1)
        }
        
    except Exception as e:
        logger.error(f"SMS test failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"SMS test failed: {str(e)}"
        )


@router.post("/{workflow_id}/reminders", summary="Send reminder notifications")
async def send_workflow_reminders(
    workflow_id: str,
    reminder_type: str = "gentle",
    custom_message: Optional[str] = None,
    channels: List[str] = ["email", "sms"],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Send reminder notifications to pending signers
    
    Reminder types:
    - gentle: Standard reminder message
    - urgent: Urgent reminder for approaching deadline
    - final: Final reminder before expiration
    
    Channels:
    - email: Send email reminder
    - sms: Send SMS reminder (if phone number available)
    - both: Send both email and SMS
    """
    try:
        # Validate workflow access
        workflow_uuid = uuid.UUID(workflow_id)
        workflow = (
            db.query(SignatureWorkflow)
            .filter(SignatureWorkflow.id == workflow_uuid, SignatureWorkflow.created_by == current_user.id)
            .first()
        )

        if not workflow:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

        if workflow.status != WorkflowStatus.ACTIVE.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot send reminders for workflow with status: {workflow.status}"
            )
        
        # Send reminders using enhanced workflow service
        reminder_results = await workflow_service.send_reminder_notifications(
            workflow_id=workflow_id,
            db=db,
            reminder_type=reminder_type,
            custom_message=custom_message
        )
        
        # Send real-time update
        await manager.send_workflow_update(
            workflow_id,
            {
                "type": "reminders_sent",
                "workflow_id": workflow_id,
                "reminder_type": reminder_type,
                "total_reminders": reminder_results.get("total_reminders_sent", 0),
                "timestamp": datetime.utcnow().isoformat()
            }
        )
        
        logger.info(f"Sent {reminder_type} reminders for workflow {workflow_id} by {current_user.email}")
        
        return {
            "message": f"{reminder_type.title()} reminders sent successfully",
            "workflow_id": workflow_id,
            "reminder_type": reminder_type,
            "results": reminder_results
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to send reminders for workflow {workflow_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send reminder notifications"
        )


@router.get("/sms/status/{message_id}", summary="Get SMS delivery status")
async def get_sms_delivery_status(
    message_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get delivery status for a sent SMS message
    
    Returns detailed information about SMS delivery including:
    - Delivery status (queued, sent, delivered, failed)
    - Timestamps for each status change
    - Error messages if delivery failed
    - Pricing information
    - Twilio-specific details
    """
    try:
        # Get delivery status from enhanced notification service
        status_info = await enhanced_notification_service.get_delivery_status(message_id)
        
        if "error" in status_info:
            return {
                "message_id": message_id,
                "success": False,
                "error": status_info["error"]
            }
        
        return {
            "message_id": message_id,
            "success": True,
            "delivery_info": status_info
        }
        
    except Exception as e:
        logger.error(f"Failed to get SMS delivery status for {message_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve SMS delivery status"
        )


@router.get("/sms/metrics", summary="Get SMS service metrics")
async def get_sms_metrics(
    current_user: User = Depends(get_current_user)
):
    """
    Get SMS service performance metrics and statistics
    
    Returns information about:
    - Message delivery success rates
    - Service uptime and performance
    - Rate limiting statistics
    - Twilio service configuration status
    - Retry attempt statistics
    """
    try:
        # Get metrics from enhanced notification service
        metrics = enhanced_notification_service.get_service_metrics()
        
        return {
            "user_id": str(current_user.id),
            "timestamp": datetime.utcnow().isoformat(),
            "sms_service_metrics": metrics
        }
        
    except Exception as e:
        logger.error(f"Failed to get SMS metrics: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve SMS metrics"
        )
