"""
Bulk Operations API Endpoints
Provides RESTful API for sending documents to multiple recipients
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from typing import List, Dict, Optional
import logging
from datetime import datetime

from services.bulk_operations_service import (
    BulkOperationsServiceFactory,
    DeliveryMethod,
    BulkOperationStatus
)
from api.v1.auth import get_current_user

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/v1/bulk", tags=["bulk-operations"])

# Create bulk operations service instance
bulk_service = BulkOperationsServiceFactory.create()


@router.post("/send")
async def send_bulk_documents(
    document_id: str = Body(..., description="Document ID to send"),
    recipients: List[Dict] = Body(..., description="List of recipients"),
    delivery_method: str = Body("email", description="Delivery method (email, sms, whatsapp, multi_channel)"),
    template_id: Optional[str] = Body(None, description="Template ID for personalized messages"),
    workflow_type: str = Body("parallel", description="Workflow type (parallel or sequential)"),
    current_user: dict = Depends(get_current_user)
) -> Dict:
    """
    Send document to multiple recipients
    
    Recipients should include:
    - name: Recipient name (required)
    - email: Email address (required for email delivery)
    - phone: Phone number (required for SMS/WhatsApp)
    - role: Recipient role (signer, viewer, approver)
    - order: Order for sequential signing
    - required: Whether signature is required
    - metadata: Additional recipient data for personalization
    """
    try:
        # Validate recipients
        if not recipients:
            raise HTTPException(status_code=400, detail="At least one recipient is required")
        
        if len(recipients) > 100:
            raise HTTPException(status_code=400, detail="Maximum 100 recipients per bulk operation")
        
        # Validate delivery method
        if delivery_method not in ["email", "sms", "whatsapp", "multi_channel"]:
            raise HTTPException(status_code=400, detail="Invalid delivery method")
        
        # Send to recipients
        result = await bulk_service.send_bulk(
            document_id=document_id,
            recipients=recipients,
            delivery_method=delivery_method,
            template_id=template_id,
            workflow_type=workflow_type
        )
        
        return {
            "success": True,
            "data": result,
            "message": f"Bulk operation started for {len(recipients)} recipients"
        }
        
    except ValueError as e:
        logger.error(f"Invalid parameter: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error sending bulk documents: {e}")
        raise HTTPException(status_code=500, detail="Failed to send bulk documents")


@router.get("/status/{operation_id}")
async def get_bulk_operation_status(
    operation_id: str,
    current_user: dict = Depends(get_current_user)
) -> Dict:
    """
    Get status of a bulk operation
    """
    try:
        status = await bulk_service.get_status(operation_id)
        
        return {
            "success": True,
            "data": status
        }
        
    except ValueError as e:
        raise HTTPException(status_code=404, detail="Operation not found")
    except Exception as e:
        logger.error(f"Error getting operation status: {e}")
        raise HTTPException(status_code=500, detail="Failed to get operation status")


@router.post("/cancel/{operation_id}")
async def cancel_bulk_operation(
    operation_id: str,
    current_user: dict = Depends(get_current_user)
) -> Dict:
    """
    Cancel a bulk operation in progress
    """
    try:
        cancelled = await bulk_service.cancel(operation_id)
        
        if not cancelled:
            raise HTTPException(status_code=400, detail="Operation cannot be cancelled")
        
        return {
            "success": True,
            "message": "Operation cancelled successfully"
        }
        
    except Exception as e:
        logger.error(f"Error cancelling operation: {e}")
        raise HTTPException(status_code=500, detail="Failed to cancel operation")


@router.post("/retry/{operation_id}")
async def retry_failed_recipients(
    operation_id: str,
    current_user: dict = Depends(get_current_user)
) -> Dict:
    """
    Retry sending to failed recipients
    """
    try:
        results = await bulk_service.retry_failed(operation_id)
        
        return {
            "success": True,
            "data": {
                "retriedCount": len(results),
                "results": results
            },
            "message": f"Retried {len(results)} failed recipients"
        }
        
    except Exception as e:
        logger.error(f"Error retrying failed recipients: {e}")
        raise HTTPException(status_code=500, detail="Failed to retry recipients")


@router.post("/templates")
async def create_template(
    name: str = Body(..., description="Template name"),
    subject: str = Body(..., description="Email subject"),
    message: str = Body(..., description="Message template with variables"),
    variables: List[str] = Body(..., description="List of variable names"),
    current_user: dict = Depends(get_current_user)
) -> Dict:
    """
    Create a message template for bulk operations
    
    Variables can include:
    - {{name}} - Recipient name
    - {{role}} - Recipient role
    - {{deadline}} - Signing deadline
    - Custom metadata fields
    """
    try:
        template_id = bulk_service.create_template(
            name=name,
            subject=subject,
            message=message,
            variables=variables
        )
        
        return {
            "success": True,
            "data": {
                "templateId": template_id,
                "name": name
            },
            "message": "Template created successfully"
        }
        
    except Exception as e:
        logger.error(f"Error creating template: {e}")
        raise HTTPException(status_code=500, detail="Failed to create template")


@router.get("/templates")
async def get_templates(
    current_user: dict = Depends(get_current_user)
) -> Dict:
    """
    Get all message templates
    """
    try:
        templates = bulk_service.get_templates()
        
        # Add default templates if none exist
        if not templates:
            # Create default templates
            bulk_service.create_template(
                name="Standard Signature Request",
                subject="Document Signature Required - {{document_name}}",
                message="Hello {{name}},\n\nYou have been requested to sign the document '{{document_name}}'.\n\nPlease click the link below to review and sign:\n{{signing_link}}\n\nDeadline: {{deadline}}\n\nThank you,\n{{sender_name}}",
                variables=["name", "document_name", "signing_link", "deadline", "sender_name"]
            )
            
            bulk_service.create_template(
                name="Urgent Signature Request",
                subject="URGENT: Signature Required - {{document_name}}",
                message="Hello {{name}},\n\nThis is an urgent request to sign '{{document_name}}'.\n\nYour role: {{role}}\n\nPlease sign immediately:\n{{signing_link}}\n\nThis document expires on {{deadline}}.\n\nContact {{sender_email}} if you have questions.",
                variables=["name", "document_name", "role", "signing_link", "deadline", "sender_email"]
            )
            
            templates = bulk_service.get_templates()
        
        return {
            "success": True,
            "data": {
                "templates": templates,
                "count": len(templates)
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting templates: {e}")
        raise HTTPException(status_code=500, detail="Failed to get templates")


@router.post("/validate")
async def validate_recipients(
    recipients: List[Dict] = Body(..., description="List of recipients to validate"),
    delivery_method: str = Body("email", description="Delivery method"),
    current_user: dict = Depends(get_current_user)
) -> Dict:
    """
    Validate recipients before sending
    """
    try:
        valid_recipients = []
        invalid_recipients = []
        
        for recipient in recipients:
            errors = []
            
            # Validate required fields
            if not recipient.get("name"):
                errors.append("Name is required")
            
            # Validate based on delivery method
            if delivery_method in ["email", "multi_channel"]:
                email = recipient.get("email")
                if not email:
                    errors.append("Email is required for email delivery")
                elif "@" not in email:
                    errors.append("Invalid email format")
            
            if delivery_method in ["sms", "whatsapp"]:
                phone = recipient.get("phone")
                if not phone:
                    errors.append("Phone is required for SMS/WhatsApp delivery")
                elif not phone.startswith("+"):
                    errors.append("Phone must include country code (e.g., +1234567890)")
            
            if errors:
                invalid_recipients.append({
                    "recipient": recipient,
                    "errors": errors
                })
            else:
                valid_recipients.append(recipient)
        
        return {
            "success": True,
            "data": {
                "validCount": len(valid_recipients),
                "invalidCount": len(invalid_recipients),
                "validRecipients": valid_recipients,
                "invalidRecipients": invalid_recipients
            }
        }
        
    except Exception as e:
        logger.error(f"Error validating recipients: {e}")
        raise HTTPException(status_code=500, detail="Failed to validate recipients")


@router.post("/import/csv")
async def import_recipients_from_csv(
    csv_content: str = Body(..., description="CSV content"),
    has_header: bool = Body(True, description="Whether CSV has header row"),
    current_user: dict = Depends(get_current_user)
) -> Dict:
    """
    Import recipients from CSV
    
    Expected CSV format:
    name,email,phone,role,company
    John Doe,john@example.com,+1234567890,signer,Acme Corp
    """
    try:
        import csv
        import io
        
        # Parse CSV
        csv_file = io.StringIO(csv_content)
        reader = csv.DictReader(csv_file) if has_header else csv.reader(csv_file)
        
        recipients = []
        errors = []
        
        for i, row in enumerate(reader):
            try:
                if has_header:
                    recipient = {
                        "name": row.get("name", ""),
                        "email": row.get("email", ""),
                        "phone": row.get("phone", ""),
                        "role": row.get("role", "signer"),
                        "metadata": {
                            "company": row.get("company", ""),
                            "department": row.get("department", ""),
                            "title": row.get("title", "")
                        }
                    }
                else:
                    # Assume order: name, email, phone, role
                    recipient = {
                        "name": row[0] if len(row) > 0 else "",
                        "email": row[1] if len(row) > 1 else "",
                        "phone": row[2] if len(row) > 2 else "",
                        "role": row[3] if len(row) > 3 else "signer"
                    }
                
                recipients.append(recipient)
                
            except Exception as e:
                errors.append(f"Row {i+1}: {str(e)}")
        
        return {
            "success": True,
            "data": {
                "recipients": recipients,
                "count": len(recipients),
                "errors": errors
            },
            "message": f"Imported {len(recipients)} recipients"
        }
        
    except Exception as e:
        logger.error(f"Error importing CSV: {e}")
        raise HTTPException(status_code=500, detail="Failed to import CSV")


@router.get("/limits")
async def get_bulk_limits(
    current_user: dict = Depends(get_current_user)
) -> Dict:
    """
    Get bulk operation limits for current user
    """
    try:
        # In production, these would be based on user's subscription plan
        limits = {
            "maxRecipientsPerOperation": 100,
            "maxOperationsPerDay": 10,
            "maxOperationsPerMonth": 100,
            "currentDayUsage": 2,
            "currentMonthUsage": 15,
            "rateLimitPerMinute": 60
        }
        
        return {
            "success": True,
            "data": limits
        }
        
    except Exception as e:
        logger.error(f"Error getting limits: {e}")
        raise HTTPException(status_code=500, detail="Failed to get limits")


@router.get("/history")
async def get_bulk_operation_history(
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None, description="Filter by status"),
    current_user: dict = Depends(get_current_user)
) -> Dict:
    """
    Get history of bulk operations
    """
    try:
        # In production, this would query the database
        # For now, return mock data
        operations = [
            {
                "operationId": "op_001",
                "documentId": "doc_123",
                "documentName": "Contract Agreement",
                "totalRecipients": 25,
                "successfulCount": 23,
                "failedCount": 2,
                "status": "partial",
                "createdAt": "2025-01-10T10:00:00Z",
                "completedAt": "2025-01-10T10:05:00Z"
            },
            {
                "operationId": "op_002",
                "documentId": "doc_124",
                "documentName": "NDA Document",
                "totalRecipients": 10,
                "successfulCount": 10,
                "failedCount": 0,
                "status": "completed",
                "createdAt": "2025-01-09T14:30:00Z",
                "completedAt": "2025-01-09T14:32:00Z"
            }
        ]
        
        # Filter by status if provided
        if status:
            operations = [op for op in operations if op["status"] == status]
        
        return {
            "success": True,
            "data": {
                "operations": operations[offset:offset+limit],
                "total": len(operations),
                "limit": limit,
                "offset": offset
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting operation history: {e}")
        raise HTTPException(status_code=500, detail="Failed to get history")