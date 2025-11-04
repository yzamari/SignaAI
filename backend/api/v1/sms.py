"""
SMS API Endpoints - RESTful Microservice
Following REST principles and microservices architecture
"""

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, status
from pydantic import BaseModel, Field, validator
from typing import Optional, Dict, Any, List
from datetime import datetime
import logging
import re

from services.sms_service import (
    SMSService, 
    get_sms_service,
    SMSResponse,
    SMSStatus
)
from api.v1.auth import get_current_user
from models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/sms", tags=["SMS"])


# Request/Response DTOs following Single Responsibility
class SMSInvitationRequest(BaseModel):
    """DTO for sending signing invitations"""
    recipient_phone: str = Field(..., description="Recipient phone number with country code")
    signer_name: str = Field(..., description="Name of the person to sign")
    document_name: str = Field(..., description="Name of the document to sign")
    signing_link: str = Field(..., description="Unique signing link")
    
    @validator('recipient_phone')
    def validate_phone(cls, v):
        # Basic phone validation
        if not re.match(r'^\+?[1-9]\d{1,14}$', v):
            raise ValueError('Invalid phone number format')
        return v


class SMSOTPRequest(BaseModel):
    """DTO for sending OTP codes"""
    recipient_phone: str = Field(..., description="Recipient phone number")
    otp_code: str = Field(..., description="OTP verification code")
    expires_minutes: int = Field(default=5, description="OTP expiry time in minutes")
    
    @validator('otp_code')
    def validate_otp(cls, v):
        if not v or len(v) < 4:
            raise ValueError('OTP code must be at least 4 characters')
        return v


class SMSCompletionRequest(BaseModel):
    """DTO for sending completion notifications"""
    recipient_phone: str = Field(..., description="Recipient phone number")
    document_name: str = Field(..., description="Name of the completed document")
    download_link: str = Field(..., description="Link to download signed document")


class SMSReminderRequest(BaseModel):
    """DTO for sending signing reminders"""
    recipient_phone: str = Field(..., description="Recipient phone number")
    signer_name: str = Field(..., description="Name of the signer")
    document_name: str = Field(..., description="Document name")
    signing_link: str = Field(..., description="Signing link")
    days_remaining: int = Field(..., description="Days until expiry")


class SMSStatusRequest(BaseModel):
    """DTO for checking message status"""
    message_id: str = Field(..., description="Message ID to check status")


class SMSServiceResponse(BaseModel):
    """Standard API response for SMS operations"""
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class SMSBulkRequest(BaseModel):
    """DTO for bulk SMS operations"""
    recipients: List[str] = Field(..., description="List of recipient phone numbers")
    message_template: str = Field(..., description="Message template with placeholders")
    variables: Optional[List[Dict[str, str]]] = Field(default=None, description="Variables for each recipient")


# API Endpoints
@router.post("/send", response_model=SMSServiceResponse)
async def send_sms_invitation(
    request: SMSInvitationRequest,
    background_tasks: BackgroundTasks,
    sms_service: SMSService = Depends(get_sms_service),
    current_user: User = Depends(get_current_user)
):
    """
    Send SMS invitation for document signing
    
    This endpoint sends an SMS to invite someone to sign a document.
    Requires authentication.
    """
    try:
        logger.info(f"User {current_user.email} sending SMS invitation to {request.recipient_phone}")
        
        response = await sms_service.send_invitation(
            recipient=request.recipient_phone,
            signer_name=request.signer_name,
            document_name=request.document_name,
            signing_link=request.signing_link
        )
        
        if response.success:
            return SMSServiceResponse(
                success=True,
                message="SMS invitation sent successfully",
                data={
                    "message_id": response.message_id,
                    "status": response.status.value if response.status else None,
                    "provider": response.provider
                }
            )
        else:
            return SMSServiceResponse(
                success=False,
                message="Failed to send SMS invitation",
                error=response.error
            )
            
    except Exception as e:
        logger.error(f"SMS send failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send SMS: {str(e)}"
        )


@router.post("/otp", response_model=SMSServiceResponse)
async def send_otp_code(
    request: SMSOTPRequest,
    sms_service: SMSService = Depends(get_sms_service)
):
    """
    Send OTP verification code via SMS
    
    Public endpoint for sending OTP codes for verification.
    """
    try:
        logger.info(f"Sending OTP to {request.recipient_phone}")
        
        response = await sms_service.send_otp(
            recipient=request.recipient_phone,
            otp_code=request.otp_code,
            expires_minutes=request.expires_minutes
        )
        
        if response.success:
            return SMSServiceResponse(
                success=True,
                message=f"OTP sent successfully, expires in {request.expires_minutes} minutes",
                data={
                    "message_id": response.message_id,
                    "expires_minutes": request.expires_minutes
                }
            )
        else:
            return SMSServiceResponse(
                success=False,
                message="Failed to send OTP",
                error=response.error
            )
            
    except Exception as e:
        logger.error(f"OTP send failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send OTP: {str(e)}"
        )


@router.post("/completion", response_model=SMSServiceResponse)
async def send_completion_notification(
    request: SMSCompletionRequest,
    sms_service: SMSService = Depends(get_sms_service),
    current_user: User = Depends(get_current_user)
):
    """
    Send document completion notification via SMS
    
    Notifies signer that document has been completed.
    Requires authentication.
    """
    try:
        logger.info(f"Sending completion notification to {request.recipient_phone}")
        
        response = await sms_service.send_completion_notification(
            recipient=request.recipient_phone,
            document_name=request.document_name,
            download_link=request.download_link
        )
        
        if response.success:
            return SMSServiceResponse(
                success=True,
                message="Completion notification sent successfully",
                data={
                    "message_id": response.message_id,
                    "document": request.document_name
                }
            )
        else:
            return SMSServiceResponse(
                success=False,
                message="Failed to send completion notification",
                error=response.error
            )
            
    except Exception as e:
        logger.error(f"Completion notification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send notification: {str(e)}"
        )


@router.post("/reminder", response_model=SMSServiceResponse)
async def send_signing_reminder(
    request: SMSReminderRequest,
    background_tasks: BackgroundTasks,
    sms_service: SMSService = Depends(get_sms_service),
    current_user: User = Depends(get_current_user)
):
    """
    Send signing reminder via SMS
    
    Sends a reminder to sign a document before it expires.
    Requires authentication.
    """
    try:
        logger.info(f"Sending reminder to {request.recipient_phone}")
        
        response = await sms_service.send_reminder(
            recipient=request.recipient_phone,
            signer_name=request.signer_name,
            document_name=request.document_name,
            signing_link=request.signing_link,
            days_remaining=request.days_remaining
        )
        
        if response.success:
            return SMSServiceResponse(
                success=True,
                message=f"Reminder sent successfully ({request.days_remaining} days remaining)",
                data={
                    "message_id": response.message_id,
                    "days_remaining": request.days_remaining
                }
            )
        else:
            return SMSServiceResponse(
                success=False,
                message="Failed to send reminder",
                error=response.error
            )
            
    except Exception as e:
        logger.error(f"Reminder send failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send reminder: {str(e)}"
        )


@router.post("/status", response_model=SMSServiceResponse)
async def check_message_status(
    request: SMSStatusRequest,
    sms_service: SMSService = Depends(get_sms_service),
    current_user: User = Depends(get_current_user)
):
    """
    Check delivery status of an SMS message
    
    Returns the current delivery status of a previously sent message.
    Requires authentication.
    """
    try:
        logger.info(f"Checking status for message {request.message_id}")
        
        response = await sms_service.check_delivery_status(request.message_id)
        
        if response.success:
            return SMSServiceResponse(
                success=True,
                message="Status retrieved successfully",
                data={
                    "message_id": request.message_id,
                    "status": response.status.value if response.status else "unknown",
                    "provider": response.provider
                }
            )
        else:
            return SMSServiceResponse(
                success=False,
                message="Failed to retrieve status",
                error=response.error
            )
            
    except Exception as e:
        logger.error(f"Status check failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to check status: {str(e)}"
        )


@router.post("/bulk", response_model=SMSServiceResponse)
async def send_bulk_sms(
    request: SMSBulkRequest,
    background_tasks: BackgroundTasks,
    sms_service: SMSService = Depends(get_sms_service),
    current_user: User = Depends(get_current_user)
):
    """
    Send bulk SMS messages
    
    Sends the same message to multiple recipients.
    Process in background to avoid timeout.
    Requires authentication.
    """
    try:
        logger.info(f"Sending bulk SMS to {len(request.recipients)} recipients")
        
        # Queue bulk send in background
        background_tasks.add_task(
            process_bulk_sms,
            request.recipients,
            request.message_template,
            request.variables,
            sms_service
        )
        
        return SMSServiceResponse(
            success=True,
            message=f"Bulk SMS queued for {len(request.recipients)} recipients",
            data={
                "recipient_count": len(request.recipients),
                "status": "queued"
            }
        )
        
    except Exception as e:
        logger.error(f"Bulk SMS failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to queue bulk SMS: {str(e)}"
        )


async def process_bulk_sms(
    recipients: List[str],
    message_template: str,
    variables: Optional[List[Dict[str, str]]],
    sms_service: SMSService
):
    """Background task to process bulk SMS"""
    success_count = 0
    failed_count = 0
    
    for i, recipient in enumerate(recipients):
        try:
            # Format message with variables if provided
            message = message_template
            if variables and i < len(variables):
                for key, value in variables[i].items():
                    message = message.replace(f"{{{key}}}", value)
            
            # Send individual SMS
            from services.sms_service import SMSMessage
            sms_message = SMSMessage(
                recipient=recipient,
                message=message
            )
            
            response = await sms_service.provider.send_sms(sms_message)
            
            if response.success:
                success_count += 1
            else:
                failed_count += 1
                
        except Exception as e:
            logger.error(f"Failed to send to {recipient}: {e}")
            failed_count += 1
    
    logger.info(f"Bulk SMS complete: {success_count} sent, {failed_count} failed")


@router.get("/health", response_model=SMSServiceResponse)
async def health_check():
    """
    SMS service health check
    
    Returns the health status of the SMS service.
    """
    return SMSServiceResponse(
        success=True,
        message="SMS service is healthy",
        data={
            "service": "sms",
            "status": "operational",
            "provider": "configured"
        }
    )