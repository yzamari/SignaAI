"""
Pydantic schemas for Workflow API
"""

from pydantic import BaseModel, Field, EmailStr, validator
from typing import List, Optional, Dict, Any
from datetime import datetime
from uuid import UUID
from enum import Enum


class WorkflowType(str, Enum):
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"
    CONDITIONAL = "conditional"


class WorkflowStatus(str, Enum):
    DRAFT = "draft"
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class SignerStatus(str, Enum):
    PENDING = "pending"
    NOTIFIED = "notified"
    VIEWED = "viewed"
    SIGNED = "signed"
    DECLINED = "declined"
    EXPIRED = "expired"


class FieldType(str, Enum):
    SIGNATURE = "signature"
    INITIAL = "initial"
    DATE = "date"
    TEXT = "text"
    CHECKBOX = "checkbox"
    NAME = "name"
    EMAIL = "email"
    PHONE = "phone"


class NotificationChannel(str, Enum):
    SMS = "sms"
    WHATSAPP = "whatsapp"
    EMAIL = "email"


# Workflow Schemas
class WorkflowCreate(BaseModel):
    document_id: UUID
    workflow_type: WorkflowType = WorkflowType.PARALLEL
    title: str
    description: Optional[str] = None
    custom_message: Optional[str] = None
    deadline: Optional[datetime] = None
    reminder_enabled: bool = True
    reminder_days: List[int] = Field(default_factory=lambda: [3, 7, 14])
    require_authentication: bool = True
    authentication_methods: List[str] = Field(default_factory=lambda: ["sms", "email"])
    
    @validator('reminder_days')
    def validate_reminder_days(cls, v):
        if any(d < 1 or d > 365 for d in v):
            raise ValueError("Reminder days must be between 1 and 365")
        return v


class WorkflowUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    custom_message: Optional[str] = None
    deadline: Optional[datetime] = None
    reminder_enabled: Optional[bool] = None
    reminder_days: Optional[List[int]] = None


class WorkflowResponse(BaseModel):
    workflow_id: UUID
    document_id: UUID
    user_id: UUID
    workflow_type: WorkflowType
    status: WorkflowStatus
    title: str
    description: Optional[str]
    custom_message: Optional[str]
    created_at: datetime
    updated_at: datetime
    sent_at: Optional[datetime]
    completed_at: Optional[datetime]
    deadline: Optional[datetime]
    reminder_enabled: bool
    reminder_days: List[int]
    signers_count: int = 0
    fields_count: int = 0
    
    class Config:
        orm_mode = True
        
    @classmethod
    def from_orm(cls, workflow):
        return cls(
            workflow_id=workflow.id,
            document_id=workflow.document_id,
            user_id=workflow.user_id,
            workflow_type=workflow.workflow_type,
            status=workflow.status,
            title=workflow.title,
            description=workflow.description,
            custom_message=workflow.custom_message,
            created_at=workflow.created_at,
            updated_at=workflow.updated_at,
            sent_at=workflow.sent_at,
            completed_at=workflow.completed_at,
            deadline=workflow.deadline,
            reminder_enabled=workflow.reminder_enabled,
            reminder_days=workflow.reminder_days,
            signers_count=len(workflow.signers) if hasattr(workflow, 'signers') else 0,
            fields_count=len(workflow.fields) if hasattr(workflow, 'fields') else 0
        )


# Signer Schemas
class SignerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, regex=r'^\+?[1-9]\d{1,14}$')
    role: Optional[str] = None
    order: int = 0
    notification_channels: List[NotificationChannel] = Field(default_factory=lambda: [NotificationChannel.EMAIL])
    language: str = Field(default="en", regex=r'^[a-z]{2}$')
    
    @validator('notification_channels')
    def validate_channels(cls, v, values):
        if NotificationChannel.EMAIL in v and not values.get('email'):
            raise ValueError("Email required for email notifications")
        if NotificationChannel.SMS in v and not values.get('phone'):
            raise ValueError("Phone required for SMS notifications")
        if NotificationChannel.WHATSAPP in v and not values.get('phone'):
            raise ValueError("Phone required for WhatsApp notifications")
        return v


class SignerUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    order: Optional[int] = None
    notification_channels: Optional[List[NotificationChannel]] = None
    language: Optional[str] = None


class SignerResponse(BaseModel):
    signer_id: UUID
    workflow_id: UUID
    name: str
    email: Optional[str]
    phone: Optional[str]
    role: Optional[str]
    status: SignerStatus
    order: int
    notification_channels: List[str]
    language: str
    invited_at: Optional[datetime]
    viewed_at: Optional[datetime]
    signed_at: Optional[datetime]
    declined_at: Optional[datetime]
    authentication_completed: bool
    
    class Config:
        orm_mode = True


# Field Schemas
class FieldCreate(BaseModel):
    field_type: FieldType
    page: int = Field(..., ge=1)
    x: float = Field(..., ge=0, le=100)
    y: float = Field(..., ge=0, le=100)
    width: float = Field(default=15.0, ge=1, le=100)
    height: float = Field(default=5.0, ge=1, le=100)
    signer_id: Optional[UUID] = None
    label: Optional[str] = None
    placeholder: Optional[str] = None
    required: bool = True
    default_value: Optional[str] = None
    validation_rules: Optional[Dict[str, Any]] = None


class FieldUpdate(BaseModel):
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    signer_id: Optional[UUID] = None
    label: Optional[str] = None
    placeholder: Optional[str] = None
    required: Optional[bool] = None
    default_value: Optional[str] = None


class FieldResponse(BaseModel):
    field_id: UUID
    workflow_id: UUID
    field_type: FieldType
    page: int
    x: float
    y: float
    width: float
    height: float
    signer_id: Optional[UUID]
    label: Optional[str]
    placeholder: Optional[str]
    required: bool
    detected_by_ai: bool
    ai_confidence: Optional[float]
    detected_text: Optional[str]
    value: Optional[str]
    filled_at: Optional[datetime]
    
    class Config:
        orm_mode = True


# Detection Request
class FieldDetectRequest(BaseModel):
    document_type: Optional[str] = None
    language_hint: Optional[str] = None
    use_customer_template: bool = True


# Send Request
class WorkflowSendRequest(BaseModel):
    send_immediately: bool = True
    schedule_for: Optional[datetime] = None
    custom_message: Optional[str] = None


# Status Response
class WorkflowStatusResponse(BaseModel):
    workflow_id: UUID
    status: WorkflowStatus
    progress: float
    total_signers: int
    signed_count: int
    signer_statuses: List[Dict[str, Any]]
    created_at: datetime
    sent_at: Optional[datetime]
    completed_at: Optional[datetime]
    deadline: Optional[datetime]