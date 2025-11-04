"""
SMS Service Module - Following SOLID Principles
Single Responsibility: Each class has one reason to change
Open/Closed: Extensible for new SMS providers without modification
Liskov Substitution: Any SMS provider can replace another
Interface Segregation: Clean interfaces for SMS operations
Dependency Inversion: Depend on abstractions, not concretions
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, Dict, Any, List
from enum import Enum
import logging
import httpx
from datetime import datetime
import json

logger = logging.getLogger(__name__)


class SMSStatus(Enum):
    """SMS delivery status enumeration"""
    PENDING = "pending"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"
    QUEUED = "queued"


@dataclass
class SMSMessage:
    """SMS message data transfer object"""
    recipient: str
    message: str
    sender: Optional[str] = None
    message_id: Optional[str] = None
    status: SMSStatus = SMSStatus.PENDING
    created_at: datetime = None
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    error_message: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.utcnow()


@dataclass
class SMSResponse:
    """SMS operation response"""
    success: bool
    message_id: Optional[str] = None
    status: Optional[SMSStatus] = None
    error: Optional[str] = None
    provider: Optional[str] = None
    raw_response: Optional[Dict[str, Any]] = None


class ISMSProvider(ABC):
    """Abstract base class for SMS providers - Interface Segregation Principle"""
    
    @abstractmethod
    async def send_sms(self, message: SMSMessage) -> SMSResponse:
        """Send an SMS message"""
        pass
    
    @abstractmethod
    async def get_status(self, message_id: str) -> SMSResponse:
        """Get delivery status of a message"""
        pass
    
    @abstractmethod
    def validate_phone_number(self, phone: str) -> bool:
        """Validate phone number format"""
        pass
    
    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return provider name"""
        pass


class TwilioSMSProvider(ISMSProvider):
    """Twilio SMS provider implementation"""
    
    def __init__(self, account_sid: str, auth_token: str, from_number: str):
        self.account_sid = account_sid
        self.auth_token = auth_token
        self.from_number = from_number
        self.base_url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}"
        
    async def send_sms(self, message: SMSMessage) -> SMSResponse:
        """Send SMS via Twilio API"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/Messages.json",
                    auth=(self.account_sid, self.auth_token),
                    data={
                        "From": message.sender or self.from_number,
                        "To": message.recipient,
                        "Body": message.message
                    }
                )
                
                if response.status_code == 201:
                    data = response.json()
                    return SMSResponse(
                        success=True,
                        message_id=data.get("sid"),
                        status=SMSStatus.SENT,
                        provider=self.provider_name,
                        raw_response=data
                    )
                else:
                    return SMSResponse(
                        success=False,
                        error=f"Twilio error: {response.text}",
                        provider=self.provider_name
                    )
                    
        except Exception as e:
            logger.error(f"Twilio SMS failed: {e}")
            return SMSResponse(
                success=False,
                error=str(e),
                provider=self.provider_name
            )
    
    async def get_status(self, message_id: str) -> SMSResponse:
        """Get message status from Twilio"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/Messages/{message_id}.json",
                    auth=(self.account_sid, self.auth_token)
                )
                
                if response.status_code == 200:
                    data = response.json()
                    status_map = {
                        "delivered": SMSStatus.DELIVERED,
                        "sent": SMSStatus.SENT,
                        "failed": SMSStatus.FAILED,
                        "queued": SMSStatus.QUEUED
                    }
                    return SMSResponse(
                        success=True,
                        message_id=message_id,
                        status=status_map.get(data.get("status"), SMSStatus.PENDING),
                        provider=self.provider_name,
                        raw_response=data
                    )
                else:
                    return SMSResponse(
                        success=False,
                        error=f"Status check failed: {response.text}",
                        provider=self.provider_name
                    )
                    
        except Exception as e:
            logger.error(f"Status check failed: {e}")
            return SMSResponse(
                success=False,
                error=str(e),
                provider=self.provider_name
            )
    
    def validate_phone_number(self, phone: str) -> bool:
        """Validate phone number format for Twilio"""
        # Basic validation - should start with + and country code
        import re
        pattern = r'^\+[1-9]\d{1,14}$'
        return bool(re.match(pattern, phone))
    
    @property
    def provider_name(self) -> str:
        return "Twilio"


class MockSMSProvider(ISMSProvider):
    """Mock SMS provider for testing - follows Liskov Substitution Principle"""
    
    def __init__(self):
        self.sent_messages: List[SMSMessage] = []
        
    async def send_sms(self, message: SMSMessage) -> SMSResponse:
        """Mock SMS sending"""
        import uuid
        message_id = str(uuid.uuid4())
        message.message_id = message_id
        message.sent_at = datetime.utcnow()
        message.status = SMSStatus.SENT
        self.sent_messages.append(message)
        
        logger.info(f"Mock SMS sent to {message.recipient}: {message.message[:50]}")
        
        return SMSResponse(
            success=True,
            message_id=message_id,
            status=SMSStatus.SENT,
            provider=self.provider_name
        )
    
    async def get_status(self, message_id: str) -> SMSResponse:
        """Mock status check"""
        for msg in self.sent_messages:
            if msg.message_id == message_id:
                return SMSResponse(
                    success=True,
                    message_id=message_id,
                    status=msg.status,
                    provider=self.provider_name
                )
        
        return SMSResponse(
            success=False,
            error="Message not found",
            provider=self.provider_name
        )
    
    def validate_phone_number(self, phone: str) -> bool:
        """Basic phone validation for mock"""
        return len(phone) >= 10
    
    @property
    def provider_name(self) -> str:
        return "Mock"


class SMSService:
    """
    SMS Service Facade - Single Responsibility Principle
    Manages SMS operations using configured providers
    """
    
    def __init__(self, provider: ISMSProvider):
        """
        Dependency Injection - Dependency Inversion Principle
        Depends on ISMSProvider abstraction, not concrete implementations
        """
        self.provider = provider
        self.message_queue: List[SMSMessage] = []
        
    async def send_invitation(
        self,
        recipient: str,
        signer_name: str,
        document_name: str,
        signing_link: str
    ) -> SMSResponse:
        """Send document signing invitation via SMS"""
        
        if not self.provider.validate_phone_number(recipient):
            return SMSResponse(
                success=False,
                error=f"Invalid phone number format: {recipient}"
            )
        
        message_text = (
            f"Hi {signer_name},\n\n"
            f"You have been invited to sign '{document_name}'.\n"
            f"Click here to review and sign: {signing_link}\n\n"
            f"This link expires in 48 hours.\n"
            f"- SignaAI Team"
        )
        
        message = SMSMessage(
            recipient=recipient,
            message=message_text,
            metadata={
                "type": "signing_invitation",
                "signer_name": signer_name,
                "document_name": document_name,
                "link": signing_link
            }
        )
        
        response = await self.provider.send_sms(message)
        
        if response.success:
            logger.info(f"Invitation SMS sent to {recipient} (ID: {response.message_id})")
        else:
            logger.error(f"Failed to send invitation SMS: {response.error}")
            
        return response
    
    async def send_otp(
        self,
        recipient: str,
        otp_code: str,
        expires_minutes: int = 5
    ) -> SMSResponse:
        """Send OTP verification code via SMS"""
        
        if not self.provider.validate_phone_number(recipient):
            return SMSResponse(
                success=False,
                error=f"Invalid phone number format: {recipient}"
            )
        
        message_text = (
            f"Your SignaAI verification code is: {otp_code}\n"
            f"This code expires in {expires_minutes} minutes.\n"
            f"Do not share this code with anyone."
        )
        
        message = SMSMessage(
            recipient=recipient,
            message=message_text,
            metadata={
                "type": "otp",
                "otp_code": otp_code,
                "expires_minutes": expires_minutes
            }
        )
        
        response = await self.provider.send_sms(message)
        
        if response.success:
            logger.info(f"OTP SMS sent to {recipient}")
        else:
            logger.error(f"Failed to send OTP SMS: {response.error}")
            
        return response
    
    async def send_completion_notification(
        self,
        recipient: str,
        document_name: str,
        download_link: str
    ) -> SMSResponse:
        """Send document completion notification via SMS"""
        
        if not self.provider.validate_phone_number(recipient):
            return SMSResponse(
                success=False,
                error=f"Invalid phone number format: {recipient}"
            )
        
        message_text = (
            f"Document '{document_name}' has been successfully signed!\n"
            f"Download your copy: {download_link}\n"
            f"Thank you for using SignaAI."
        )
        
        message = SMSMessage(
            recipient=recipient,
            message=message_text,
            metadata={
                "type": "completion",
                "document_name": document_name,
                "download_link": download_link
            }
        )
        
        response = await self.provider.send_sms(message)
        
        if response.success:
            logger.info(f"Completion SMS sent to {recipient}")
        else:
            logger.error(f"Failed to send completion SMS: {response.error}")
            
        return response
    
    async def send_reminder(
        self,
        recipient: str,
        signer_name: str,
        document_name: str,
        signing_link: str,
        days_remaining: int
    ) -> SMSResponse:
        """Send signing reminder via SMS"""
        
        if not self.provider.validate_phone_number(recipient):
            return SMSResponse(
                success=False,
                error=f"Invalid phone number format: {recipient}"
            )
        
        message_text = (
            f"Reminder: Hi {signer_name},\n"
            f"You have {days_remaining} days left to sign '{document_name}'.\n"
            f"Sign now: {signing_link}"
        )
        
        message = SMSMessage(
            recipient=recipient,
            message=message_text,
            metadata={
                "type": "reminder",
                "signer_name": signer_name,
                "document_name": document_name,
                "days_remaining": days_remaining
            }
        )
        
        response = await self.provider.send_sms(message)
        
        if response.success:
            logger.info(f"Reminder SMS sent to {recipient}")
        else:
            logger.error(f"Failed to send reminder SMS: {response.error}")
            
        return response
    
    async def check_delivery_status(self, message_id: str) -> SMSResponse:
        """Check delivery status of a sent message"""
        return await self.provider.get_status(message_id)
    
    def switch_provider(self, new_provider: ISMSProvider):
        """
        Open/Closed Principle - Can extend with new providers
        without modifying existing code
        """
        logger.info(f"Switching SMS provider from {self.provider.provider_name} to {new_provider.provider_name}")
        self.provider = new_provider


class SMSServiceFactory:
    """Factory pattern for creating SMS service instances"""
    
    @staticmethod
    def create_service(provider_type: str = "mock", **kwargs) -> SMSService:
        """Create SMS service with specified provider"""
        
        if provider_type.lower() == "twilio":
            provider = TwilioSMSProvider(
                account_sid=kwargs.get("account_sid"),
                auth_token=kwargs.get("auth_token"),
                from_number=kwargs.get("from_number")
            )
        elif provider_type.lower() == "mock":
            provider = MockSMSProvider()
        else:
            raise ValueError(f"Unknown SMS provider: {provider_type}")
        
        return SMSService(provider)


# Singleton pattern for default service instance
_default_service: Optional[SMSService] = None


def get_sms_service() -> SMSService:
    """Get singleton SMS service instance"""
    global _default_service
    
    if _default_service is None:
        import os
        # Check if Twilio credentials are configured
        if all([
            os.getenv("TWILIO_ACCOUNT_SID"),
            os.getenv("TWILIO_AUTH_TOKEN"),
            os.getenv("TWILIO_PHONE_NUMBER")
        ]):
            logger.info("Initializing Twilio SMS provider with real credentials")
            _default_service = SMSServiceFactory.create_service(
                "twilio",
                account_sid=os.getenv("TWILIO_ACCOUNT_SID"),
                auth_token=os.getenv("TWILIO_AUTH_TOKEN"),
                from_number=os.getenv("TWILIO_PHONE_NUMBER")
            )
        else:
            logger.warning("Twilio credentials not found, using mock SMS provider")
            _default_service = SMSServiceFactory.create_service("mock")
    
    return _default_service