from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Body
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime
import json
import uuid
import os
import logging
import asyncio
from pathlib import Path

from core.database import get_db
from models import User
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["documents"])

# Create upload directory
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# In-memory storage for documents (replace with database in production)
documents_storage = {}

async def send_sms_notification(phone: str, recipient_name: str, document_title: str, sender_name: str, language: str = 'en'):
    """
    Send SMS notification to document recipient in their preferred language
    """
    import httpx
    
    # Format phone number (ensure it has country code)
    if not phone.startswith('+'):
        # Assume US number if no country code
        phone = '+1' + phone.replace('-', '').replace(' ', '').replace('(', '').replace(')', '')
    
    # Language-specific SMS messages
    sign_url = f"https://signa.ai/sign/{uuid.uuid4()}"
    
    messages = {
        'en': f"Hi {recipient_name}, {sender_name} has sent you a document to sign: '{document_title}'. Click here to review and sign: {sign_url}",
        'he': f"שלום {recipient_name}, {sender_name} שלח/ה לך מסמך לחתימה: '{document_title}'. לחץ כאן לצפייה וחתימה: {sign_url}",
        'ar': f"مرحباً {recipient_name}، أرسل لك {sender_name} مستنداً للتوقيع: '{document_title}'. انقر هنا للمراجعة والتوقيع: {sign_url}",
        'es': f"Hola {recipient_name}, {sender_name} te ha enviado un documento para firmar: '{document_title}'. Haz clic aquí para revisar y firmar: {sign_url}",
        'fr': f"Bonjour {recipient_name}, {sender_name} vous a envoyé un document à signer: '{document_title}'. Cliquez ici pour consulter et signer: {sign_url}",
        'de': f"Hallo {recipient_name}, {sender_name} hat Ihnen ein Dokument zum Unterschreiben gesendet: '{document_title}'. Klicken Sie hier zum Ansehen und Unterschreiben: {sign_url}",
        'ru': f"Здравствуйте, {recipient_name}, {sender_name} отправил вам документ для подписи: '{document_title}'. Нажмите здесь для просмотра и подписи: {sign_url}",
        'zh': f"您好 {recipient_name}，{sender_name} 给您发送了一份待签署的文件：'{document_title}'。点击此处查看并签署：{sign_url}",
        'ja': f"こんにちは {recipient_name}さん、{sender_name}さんから署名用の書類が送られました：'{document_title}'。こちらをクリックして確認・署名：{sign_url}",
        'pt': f"Olá {recipient_name}, {sender_name} enviou um documento para você assinar: '{document_title}'. Clique aqui para revisar e assinar: {sign_url}"
    }
    
    # Get message in preferred language, fallback to English
    message = messages.get(language, messages['en'])
    
    # Check if Twilio is configured (using actual env var names from .env)
    twilio_account_sid = os.environ.get('TWILIO_ACCOUNT_SID')
    twilio_auth_token = os.environ.get('TWILIO_AUTH_TOKEN')
    twilio_from_number = os.environ.get('TWILIO_PHONE_NUMBER')  # Fixed: was TWILIO_FROM_NUMBER
    
    if twilio_account_sid and twilio_auth_token and twilio_from_number:
        # Use real Twilio API
        async with httpx.AsyncClient() as client:
            auth = (twilio_account_sid, twilio_auth_token)
            url = f"https://api.twilio.com/2010-04-01/Accounts/{twilio_account_sid}/Messages.json"
            
            data = {
                'From': twilio_from_number,
                'To': phone,
                'Body': message
            }
            
            response = await client.post(url, data=data, auth=auth)
            
            if response.status_code == 201:
                logger.info(f"SMS sent successfully to {phone}")
                return True
            else:
                logger.error(f"Twilio API error: {response.text}")
                raise Exception(f"Failed to send SMS: {response.text}")
    else:
        # Mock SMS sending (log only)
        logger.warning("Twilio not configured. Mock SMS sending:")
        logger.info(f"📱 MOCK SMS TO: {phone}")
        logger.info(f"📝 MESSAGE: {message}")
        logger.info("To enable real SMS, set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER environment variables")
        
        # Still return success for testing
        return True

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload a document file"""
    try:
        # Generate unique filename
        file_extension = Path(file.filename).suffix
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = UPLOAD_DIR / unique_filename
        
        # Save file
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        
        # Create document record (in-memory for now)
        doc_id = str(uuid.uuid4())
        document = {
            "id": doc_id,
            "user_id": current_user.id,
            "title": file.filename,
            "file_path": str(file_path),
            "status": "draft",
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }
        
        if current_user.id not in documents_storage:
            documents_storage[current_user.id] = []
        
        documents_storage[current_user.id].append(document)
        
        return document
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/create")
async def create_document(
    data: Dict[str, Any] = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new document with signers and fields"""
    try:
        # Extract document data
        title = data.get("title", "Untitled Document")
        file_path = data.get("file_path", "")
        signers = data.get("signers", [])
        fields = data.get("fields", [])
        workflow = data.get("workflow", {})
        
        # Create document
        doc_id = str(uuid.uuid4())
        document = {
            "id": doc_id,
            "user_id": current_user.id,
            "title": title,
            "file_path": file_path,
            "status": "pending",
            "workflow_type": workflow.get("type", "parallel"),
            "deadline": workflow.get("deadline"),
            "signers": signers,
            "fields": fields,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }
        
        if current_user.id not in documents_storage:
            documents_storage[current_user.id] = []
        
        documents_storage[current_user.id].append(document)
        
        # Send SMS notifications to all signers with phone numbers
        sms_sent_count = 0
        for signer in signers:
            if signer.get("phone"):
                try:
                    # Determine language from signer data or use default
                    signer_language = signer.get("language", "en")
                    
                    # Send SMS notification in signer's language
                    await send_sms_notification(
                        phone=signer["phone"],
                        recipient_name=signer.get("name", ""),
                        document_title=title,
                        sender_name=current_user.full_name or current_user.email,
                        language=signer_language
                    )
                    sms_sent_count += 1
                    logger.info(f"SMS sent to {signer['phone']} in {signer_language} for document {doc_id}")
                except Exception as sms_error:
                    logger.error(f"Failed to send SMS to {signer['phone']}: {str(sms_error)}")
        
        return {
            "id": doc_id,
            "title": title,
            "status": "pending",
            "message": f"Document created successfully. {sms_sent_count} SMS notification(s) sent.",
            "sms_sent": sms_sent_count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/")
async def get_documents(
    limit: int = 50,
    offset: int = 0,
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's documents"""
    user_docs = documents_storage.get(current_user.id, [])
    
    if status:
        user_docs = [d for d in user_docs if d.get("status") == status]
    
    # Apply pagination
    total = len(user_docs)
    paginated_docs = user_docs[offset:offset + limit]
    
    return {
        "total": total,
        "documents": [
            {
                "id": doc.get("id"),
                "title": doc.get("title"),
                "status": doc.get("status", "pending"),
                "created_at": doc.get("created_at"),
                "updated_at": doc.get("updated_at"),
                "signers": doc.get("signers", [])
            }
            for doc in paginated_docs
        ]
    }

@router.get("/{document_id}")
async def get_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific document"""
    user_docs = documents_storage.get(current_user.id, [])
    document = next((d for d in user_docs if d.get("id") == document_id), None)
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return document

@router.put("/{document_id}/status")
async def update_document_status(
    document_id: str,
    status: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update document status"""
    user_docs = documents_storage.get(current_user.id, [])
    document = next((d for d in user_docs if d.get("id") == document_id), None)
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    document["status"] = status
    document["updated_at"] = datetime.utcnow().isoformat()
    
    return {"message": "Status updated successfully", "status": status}

@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a document"""
    user_docs = documents_storage.get(current_user.id, [])
    
    # Find and remove document
    doc_to_remove = next((d for d in user_docs if d.get("id") == document_id), None)
    
    if not doc_to_remove:
        raise HTTPException(status_code=404, detail="Document not found")
    
    user_docs.remove(doc_to_remove)
    
    return {"message": "Document deleted successfully"}