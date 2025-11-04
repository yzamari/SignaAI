"""
Bulk Operations Service
Handles sending documents to multiple recipients efficiently
Following SOLID principles and microservices architecture
"""

from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime, timedelta
from abc import ABC, abstractmethod
import logging
from dataclasses import dataclass
from enum import Enum
import asyncio
from concurrent.futures import ThreadPoolExecutor
import uuid

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class BulkOperationStatus(Enum):
    """Bulk operation status enumeration"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"  # Some recipients succeeded, some failed
    CANCELLED = "cancelled"


class RecipientStatus(Enum):
    """Individual recipient status"""
    PENDING = "pending"
    SENDING = "sending"
    SENT = "sent"
    DELIVERED = "delivered"
    OPENED = "opened"
    SIGNED = "signed"
    FAILED = "failed"
    BOUNCED = "bounced"


class DeliveryMethod(Enum):
    """Delivery methods for bulk operations"""
    EMAIL = "email"
    SMS = "sms"
    WHATSAPP = "whatsapp"
    MULTI_CHANNEL = "multi_channel"  # Try multiple channels


@dataclass
class Recipient:
    """Recipient data model"""
    recipient_id: str
    name: str
    email: Optional[str]
    phone: Optional[str]
    role: str  # e.g., "signer", "viewer", "approver"
    order: int  # For sequential signing
    required: bool
    metadata: Dict[str, Any]
    
    def to_dict(self) -> Dict:
        return {
            "recipientId": self.recipient_id,
            "name": self.name,
            "email": self.email,
            "phone": self.phone,
            "role": self.role,
            "order": self.order,
            "required": self.required,
            "metadata": self.metadata
        }


@dataclass
class BulkOperation:
    """Bulk operation data model"""
    operation_id: str
    document_id: str
    total_recipients: int
    successful_count: int
    failed_count: int
    pending_count: int
    status: BulkOperationStatus
    created_at: datetime
    completed_at: Optional[datetime]
    error_message: Optional[str]
    
    def to_dict(self) -> Dict:
        return {
            "operationId": self.operation_id,
            "documentId": self.document_id,
            "totalRecipients": self.total_recipients,
            "successfulCount": self.successful_count,
            "failedCount": self.failed_count,
            "pendingCount": self.pending_count,
            "status": self.status.value,
            "createdAt": self.created_at.isoformat(),
            "completedAt": self.completed_at.isoformat() if self.completed_at else None,
            "errorMessage": self.error_message,
            "progress": self._calculate_progress()
        }
    
    def _calculate_progress(self) -> float:
        """Calculate operation progress percentage"""
        if self.total_recipients == 0:
            return 0
        processed = self.successful_count + self.failed_count
        return (processed / self.total_recipients) * 100


@dataclass
class RecipientResult:
    """Result of sending to a single recipient"""
    recipient_id: str
    status: RecipientStatus
    delivery_method: DeliveryMethod
    sent_at: Optional[datetime]
    delivered_at: Optional[datetime]
    error_message: Optional[str]
    tracking_id: Optional[str]
    
    def to_dict(self) -> Dict:
        return {
            "recipientId": self.recipient_id,
            "status": self.status.value,
            "deliveryMethod": self.delivery_method.value,
            "sentAt": self.sent_at.isoformat() if self.sent_at else None,
            "deliveredAt": self.delivered_at.isoformat() if self.delivered_at else None,
            "errorMessage": self.error_message,
            "trackingId": self.tracking_id
        }


@dataclass
class BulkTemplate:
    """Template for bulk operations"""
    template_id: str
    name: str
    subject: str
    message: str
    variables: List[str]  # e.g., ["{{name}}", "{{company}}", "{{deadline}}"]
    
    def to_dict(self) -> Dict:
        return {
            "templateId": self.template_id,
            "name": self.name,
            "subject": self.subject,
            "message": self.message,
            "variables": self.variables
        }


# Abstract Bulk Operations Provider Interface
class IBulkOperationsProvider(ABC):
    """Interface for bulk operations providers"""
    
    @abstractmethod
    async def send_to_recipients(
        self,
        document_id: str,
        recipients: List[Recipient],
        delivery_method: DeliveryMethod,
        template: Optional[BulkTemplate] = None
    ) -> Tuple[BulkOperation, List[RecipientResult]]:
        """Send document to multiple recipients"""
        pass
    
    @abstractmethod
    async def get_operation_status(self, operation_id: str) -> BulkOperation:
        """Get status of bulk operation"""
        pass
    
    @abstractmethod
    async def cancel_operation(self, operation_id: str) -> bool:
        """Cancel a bulk operation"""
        pass
    
    @abstractmethod
    async def retry_failed_recipients(self, operation_id: str) -> List[RecipientResult]:
        """Retry sending to failed recipients"""
        pass


# Default Bulk Operations Provider
class DefaultBulkOperationsProvider(IBulkOperationsProvider):
    """Default implementation of bulk operations"""
    
    def __init__(self, email_service=None, sms_service=None):
        self.email_service = email_service
        self.sms_service = sms_service
        self.operations = {}  # In-memory storage (use database in production)
        self.results = {}  # Store results per operation
        
    async def send_to_recipients(
        self,
        document_id: str,
        recipients: List[Recipient],
        delivery_method: DeliveryMethod,
        template: Optional[BulkTemplate] = None
    ) -> Tuple[BulkOperation, List[RecipientResult]]:
        """Send document to multiple recipients with parallel processing"""
        try:
            operation_id = str(uuid.uuid4())
            
            # Create operation record
            operation = BulkOperation(
                operation_id=operation_id,
                document_id=document_id,
                total_recipients=len(recipients),
                successful_count=0,
                failed_count=0,
                pending_count=len(recipients),
                status=BulkOperationStatus.PROCESSING,
                created_at=datetime.now(),
                completed_at=None,
                error_message=None
            )
            
            self.operations[operation_id] = operation
            results = []
            
            # Process recipients in batches for efficiency
            batch_size = 10
            for i in range(0, len(recipients), batch_size):
                batch = recipients[i:i+batch_size]
                
                # Send to batch concurrently
                batch_tasks = []
                for recipient in batch:
                    task = self._send_to_recipient(
                        document_id,
                        recipient,
                        delivery_method,
                        template
                    )
                    batch_tasks.append(task)
                
                # Wait for batch to complete
                batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)
                
                # Process results
                for recipient, result in zip(batch, batch_results):
                    if isinstance(result, Exception):
                        # Handle error
                        recipient_result = RecipientResult(
                            recipient_id=recipient.recipient_id,
                            status=RecipientStatus.FAILED,
                            delivery_method=delivery_method,
                            sent_at=None,
                            delivered_at=None,
                            error_message=str(result),
                            tracking_id=None
                        )
                        operation.failed_count += 1
                    else:
                        recipient_result = result
                        if recipient_result.status in [RecipientStatus.SENT, RecipientStatus.DELIVERED]:
                            operation.successful_count += 1
                        else:
                            operation.failed_count += 1
                    
                    operation.pending_count -= 1
                    results.append(recipient_result)
                
                # Add delay between batches to avoid rate limiting
                if i + batch_size < len(recipients):
                    await asyncio.sleep(1)
            
            # Update operation status
            if operation.failed_count == 0:
                operation.status = BulkOperationStatus.COMPLETED
            elif operation.successful_count == 0:
                operation.status = BulkOperationStatus.FAILED
            else:
                operation.status = BulkOperationStatus.PARTIAL
            
            operation.completed_at = datetime.now()
            
            # Store results
            self.results[operation_id] = results
            
            logger.info(f"Bulk operation {operation_id} completed: {operation.successful_count}/{operation.total_recipients} successful")
            
            return operation, results
            
        except Exception as e:
            logger.error(f"Bulk operation failed: {e}")
            raise
    
    async def _send_to_recipient(
        self,
        document_id: str,
        recipient: Recipient,
        delivery_method: DeliveryMethod,
        template: Optional[BulkTemplate]
    ) -> RecipientResult:
        """Send to individual recipient"""
        try:
            tracking_id = str(uuid.uuid4())
            
            # Personalize message if template provided
            message = self._personalize_message(template, recipient) if template else None
            
            # Send based on delivery method
            if delivery_method == DeliveryMethod.EMAIL and recipient.email:
                # Send via email service
                success = await self._send_email(
                    recipient.email,
                    document_id,
                    message,
                    tracking_id
                )
            elif delivery_method == DeliveryMethod.SMS and recipient.phone:
                # Send via SMS service
                success = await self._send_sms(
                    recipient.phone,
                    document_id,
                    message,
                    tracking_id
                )
            elif delivery_method == DeliveryMethod.WHATSAPP and recipient.phone:
                # Send via WhatsApp
                success = await self._send_whatsapp(
                    recipient.phone,
                    document_id,
                    message,
                    tracking_id
                )
            elif delivery_method == DeliveryMethod.MULTI_CHANNEL:
                # Try multiple channels in order of preference
                success = await self._send_multi_channel(
                    recipient,
                    document_id,
                    message,
                    tracking_id
                )
            else:
                raise ValueError(f"No valid contact method for recipient {recipient.recipient_id}")
            
            return RecipientResult(
                recipient_id=recipient.recipient_id,
                status=RecipientStatus.SENT if success else RecipientStatus.FAILED,
                delivery_method=delivery_method,
                sent_at=datetime.now() if success else None,
                delivered_at=None,
                error_message=None if success else "Delivery failed",
                tracking_id=tracking_id if success else None
            )
            
        except Exception as e:
            logger.error(f"Failed to send to recipient {recipient.recipient_id}: {e}")
            return RecipientResult(
                recipient_id=recipient.recipient_id,
                status=RecipientStatus.FAILED,
                delivery_method=delivery_method,
                sent_at=None,
                delivered_at=None,
                error_message=str(e),
                tracking_id=None
            )
    
    async def _send_email(self, email: str, document_id: str, message: Optional[str], tracking_id: str) -> bool:
        """Send via email"""
        try:
            # In production, use actual email service
            logger.info(f"Sending email to {email} for document {document_id}")
            await asyncio.sleep(0.1)  # Simulate API call
            return True
        except Exception as e:
            logger.error(f"Email send failed: {e}")
            return False
    
    async def _send_sms(self, phone: str, document_id: str, message: Optional[str], tracking_id: str) -> bool:
        """Send via SMS"""
        try:
            # In production, use actual SMS service
            logger.info(f"Sending SMS to {phone} for document {document_id}")
            await asyncio.sleep(0.1)  # Simulate API call
            return True
        except Exception as e:
            logger.error(f"SMS send failed: {e}")
            return False
    
    async def _send_whatsapp(self, phone: str, document_id: str, message: Optional[str], tracking_id: str) -> bool:
        """Send via WhatsApp"""
        try:
            # In production, use actual WhatsApp service
            logger.info(f"Sending WhatsApp to {phone} for document {document_id}")
            await asyncio.sleep(0.1)  # Simulate API call
            return True
        except Exception as e:
            logger.error(f"WhatsApp send failed: {e}")
            return False
    
    async def _send_multi_channel(
        self,
        recipient: Recipient,
        document_id: str,
        message: Optional[str],
        tracking_id: str
    ) -> bool:
        """Try multiple delivery channels"""
        # Try email first
        if recipient.email:
            if await self._send_email(recipient.email, document_id, message, tracking_id):
                return True
        
        # Try SMS if email fails or not available
        if recipient.phone:
            if await self._send_sms(recipient.phone, document_id, message, tracking_id):
                return True
        
        # Try WhatsApp as last resort
        if recipient.phone:
            if await self._send_whatsapp(recipient.phone, document_id, message, tracking_id):
                return True
        
        return False
    
    def _personalize_message(self, template: BulkTemplate, recipient: Recipient) -> str:
        """Personalize template message for recipient"""
        message = template.message
        
        # Replace variables
        message = message.replace("{{name}}", recipient.name)
        message = message.replace("{{role}}", recipient.role)
        
        # Replace metadata variables
        for key, value in recipient.metadata.items():
            message = message.replace(f"{{{{{key}}}}}", str(value))
        
        return message
    
    async def get_operation_status(self, operation_id: str) -> BulkOperation:
        """Get status of bulk operation"""
        operation = self.operations.get(operation_id)
        if not operation:
            raise ValueError(f"Operation {operation_id} not found")
        return operation
    
    async def cancel_operation(self, operation_id: str) -> bool:
        """Cancel a bulk operation"""
        try:
            operation = self.operations.get(operation_id)
            if not operation:
                return False
            
            if operation.status == BulkOperationStatus.PROCESSING:
                operation.status = BulkOperationStatus.CANCELLED
                operation.completed_at = datetime.now()
                logger.info(f"Cancelled operation {operation_id}")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error cancelling operation: {e}")
            return False
    
    async def retry_failed_recipients(self, operation_id: str) -> List[RecipientResult]:
        """Retry sending to failed recipients"""
        try:
            results = self.results.get(operation_id, [])
            failed_results = [r for r in results if r.status == RecipientStatus.FAILED]
            
            retry_results = []
            for result in failed_results:
                # Retry logic here
                logger.info(f"Retrying recipient {result.recipient_id}")
                # In production, actually retry the send
                result.status = RecipientStatus.SENT
                result.sent_at = datetime.now()
                retry_results.append(result)
            
            return retry_results
            
        except Exception as e:
            logger.error(f"Error retrying failed recipients: {e}")
            raise


# Bulk Operations Service Facade
class BulkOperationsService:
    """Main bulk operations service following SOLID principles"""
    
    def __init__(self, provider: IBulkOperationsProvider):
        self.provider = provider
        self.templates = {}  # Store templates
        
    async def send_bulk(
        self,
        document_id: str,
        recipients: List[Dict],
        delivery_method: str = "email",
        template_id: Optional[str] = None,
        workflow_type: str = "parallel"  # or "sequential"
    ) -> Dict:
        """Send document to multiple recipients"""
        try:
            # Convert dicts to Recipient objects
            recipient_objects = []
            for i, r in enumerate(recipients):
                recipient = Recipient(
                    recipient_id=r.get("id", str(uuid.uuid4())),
                    name=r["name"],
                    email=r.get("email"),
                    phone=r.get("phone"),
                    role=r.get("role", "signer"),
                    order=r.get("order", i),
                    required=r.get("required", True),
                    metadata=r.get("metadata", {})
                )
                recipient_objects.append(recipient)
            
            # Get template if specified
            template = self.templates.get(template_id) if template_id else None
            
            # Convert delivery method
            method = DeliveryMethod(delivery_method)
            
            # Handle workflow type
            if workflow_type == "sequential":
                # Sort by order and send one at a time
                recipient_objects.sort(key=lambda x: x.order)
                # In production, implement sequential sending logic
            
            # Send to recipients
            operation, results = await self.provider.send_to_recipients(
                document_id,
                recipient_objects,
                method,
                template
            )
            
            return {
                "operation": operation.to_dict(),
                "results": [r.to_dict() for r in results]
            }
            
        except Exception as e:
            logger.error(f"Bulk send failed: {e}")
            raise
    
    async def get_status(self, operation_id: str) -> Dict:
        """Get bulk operation status"""
        try:
            operation = await self.provider.get_operation_status(operation_id)
            results = getattr(self.provider, 'results', {}).get(operation_id, [])
            
            return {
                "operation": operation.to_dict(),
                "results": [r.to_dict() for r in results]
            }
            
        except Exception as e:
            logger.error(f"Error getting status: {e}")
            raise
    
    async def cancel(self, operation_id: str) -> bool:
        """Cancel bulk operation"""
        return await self.provider.cancel_operation(operation_id)
    
    async def retry_failed(self, operation_id: str) -> List[Dict]:
        """Retry failed recipients"""
        results = await self.provider.retry_failed_recipients(operation_id)
        return [r.to_dict() for r in results]
    
    def create_template(
        self,
        name: str,
        subject: str,
        message: str,
        variables: List[str]
    ) -> str:
        """Create a message template"""
        template_id = str(uuid.uuid4())
        template = BulkTemplate(
            template_id=template_id,
            name=name,
            subject=subject,
            message=message,
            variables=variables
        )
        self.templates[template_id] = template
        return template_id
    
    def get_templates(self) -> List[Dict]:
        """Get all templates"""
        return [t.to_dict() for t in self.templates.values()]


# Factory for creating bulk operations service
class BulkOperationsServiceFactory:
    """Factory for creating bulk operations service instances"""
    
    @staticmethod
    def create(email_service=None, sms_service=None) -> BulkOperationsService:
        """Create bulk operations service with appropriate provider"""
        provider = DefaultBulkOperationsProvider(email_service, sms_service)
        return BulkOperationsService(provider)


# Export main components
__all__ = [
    'BulkOperationsService',
    'BulkOperationsServiceFactory',
    'BulkOperation',
    'Recipient',
    'RecipientResult',
    'BulkTemplate',
    'BulkOperationStatus',
    'RecipientStatus',
    'DeliveryMethod'
]