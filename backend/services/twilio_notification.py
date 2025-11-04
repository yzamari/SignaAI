"""
Twilio Notification Service
Handles SMS and WhatsApp notifications for signature requests
Supports Hebrew, Arabic, and English messaging
"""

import logging
import os
from typing import Dict, List, Optional, Any
from datetime import datetime
from dataclasses import dataclass
from enum import Enum
import httpx
from twilio.rest import Client
from twilio.base.exceptions import TwilioException

logger = logging.getLogger(__name__)

# Twilio Configuration (would be in environment variables)
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "your_account_sid")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "your_auth_token")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "+1234567890")
TWILIO_WHATSAPP_NUMBER = os.getenv("TWILIO_WHATSAPP_NUMBER", "whatsapp:+1234567890")


class NotificationChannel(str, Enum):
    """Notification delivery channels"""
    SMS = "sms"
    WHATSAPP = "whatsapp"
    EMAIL = "email"


class MessageTemplate(str, Enum):
    """Pre-defined message templates"""
    SIGNATURE_REQUEST = "signature_request"
    REMINDER = "reminder"
    COMPLETED = "completed"
    EXPIRED = "expired"


@dataclass
class NotificationResult:
    """Result of a notification attempt"""
    channel: str
    recipient: str
    success: bool
    message_id: Optional[str] = None
    error: Optional[str] = None
    sent_at: Optional[datetime] = None


class TwilioNotificationService:
    """Service for sending SMS and WhatsApp notifications via Twilio"""
    
    def __init__(self):
        self.client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        self.templates = self._load_templates()
    
    async def send_signature_request(
        self,
        signer_name: str,
        signer_phone: Optional[str],
        signer_email: Optional[str],
        document_title: str,
        sender_name: str,
        signing_url: str,
        deadline: Optional[datetime],
        channels: List[NotificationChannel],
        language: str = 'en'
    ) -> List[NotificationResult]:
        """
        Send signature request notification via specified channels
        
        Args:
            signer_name: Name of the person who needs to sign
            signer_phone: Phone number for SMS/WhatsApp
            signer_email: Email address
            document_title: Title of the document to sign
            sender_name: Name of the person requesting signature
            signing_url: Secure URL for signing
            deadline: Optional signing deadline
            channels: List of channels to use
            language: Language for the message (en, he, ar)
            
        Returns:
            List of notification results
        """
        results = []
        
        try:
            # Generate message content
            message = self._format_signature_request(
                signer_name=signer_name,
                document_title=document_title,
                sender_name=sender_name,
                signing_url=signing_url,
                deadline=deadline,
                language=language
            )
            
            # Send via each requested channel
            for channel in channels:
                if channel == NotificationChannel.SMS and signer_phone:
                    result = await self._send_sms(signer_phone, message['sms'])
                    results.append(result)
                    
                elif channel == NotificationChannel.WHATSAPP and signer_phone:
                    result = await self._send_whatsapp(signer_phone, message['whatsapp'])
                    results.append(result)
                    
                elif channel == NotificationChannel.EMAIL and signer_email:
                    # Email would be handled by email service
                    result = NotificationResult(
                        channel=NotificationChannel.EMAIL,
                        recipient=signer_email,
                        success=True,
                        message_id=f"email_{datetime.utcnow().timestamp()}",
                        sent_at=datetime.utcnow()
                    )
                    results.append(result)
            
            logger.info(f"Sent {len(results)} notifications for signature request")
            return results
            
        except Exception as e:
            logger.error(f"Failed to send signature request: {e}")
            raise
    
    async def _send_sms(self, phone_number: str, message: str) -> NotificationResult:
        """
        Send SMS message via Twilio
        
        Args:
            phone_number: Recipient phone number (with country code)
            message: Message content
            
        Returns:
            Notification result
        """
        try:
            # Ensure phone number has country code
            if not phone_number.startswith('+'):
                # Default to Israel if no country code
                phone_number = f"+972{phone_number.lstrip('0')}"
            
            # Send SMS via Twilio
            message_obj = self.client.messages.create(
                body=message,
                from_=TWILIO_PHONE_NUMBER,
                to=phone_number
            )
            
            logger.info(f"SMS sent successfully to {phone_number}: {message_obj.sid}")
            
            return NotificationResult(
                channel=NotificationChannel.SMS,
                recipient=phone_number,
                success=True,
                message_id=message_obj.sid,
                sent_at=datetime.utcnow()
            )
            
        except TwilioException as e:
            logger.error(f"Failed to send SMS to {phone_number}: {e}")
            return NotificationResult(
                channel=NotificationChannel.SMS,
                recipient=phone_number,
                success=False,
                error=str(e),
                sent_at=datetime.utcnow()
            )
    
    async def _send_whatsapp(self, phone_number: str, message: str) -> NotificationResult:
        """
        Send WhatsApp message via Twilio
        
        Args:
            phone_number: Recipient phone number (with country code)
            message: Message content
            
        Returns:
            Notification result
        """
        try:
            # Ensure phone number has country code
            if not phone_number.startswith('+'):
                phone_number = f"+972{phone_number.lstrip('0')}"
            
            # Format for WhatsApp
            whatsapp_to = f"whatsapp:{phone_number}"
            
            # Send WhatsApp message via Twilio
            message_obj = self.client.messages.create(
                body=message,
                from_=TWILIO_WHATSAPP_NUMBER,
                to=whatsapp_to
            )
            
            logger.info(f"WhatsApp sent successfully to {phone_number}: {message_obj.sid}")
            
            return NotificationResult(
                channel=NotificationChannel.WHATSAPP,
                recipient=phone_number,
                success=True,
                message_id=message_obj.sid,
                sent_at=datetime.utcnow()
            )
            
        except TwilioException as e:
            logger.error(f"Failed to send WhatsApp to {phone_number}: {e}")
            return NotificationResult(
                channel=NotificationChannel.WHATSAPP,
                recipient=phone_number,
                success=False,
                error=str(e),
                sent_at=datetime.utcnow()
            )
    
    def _format_signature_request(
        self,
        signer_name: str,
        document_title: str,
        sender_name: str,
        signing_url: str,
        deadline: Optional[datetime],
        language: str
    ) -> Dict[str, str]:
        """
        Format signature request message in different languages
        
        Returns:
            Dictionary with 'sms' and 'whatsapp' formatted messages
        """
        deadline_str = deadline.strftime("%d/%m/%Y") if deadline else ""
        
        if language == 'he':  # Hebrew
            sms = f"""
שלום {signer_name},
יש לך מסמך לחתימה מ{sender_name}
מסמך: {document_title}
לחץ כאן: {signing_url}
{"עד תאריך: " + deadline_str if deadline else ""}
            """.strip()
            
            whatsapp = f"""
*בקשת חתימה דיגיטלית - SignaAI*

שלום {signer_name},

התבקשת לחתום על:
📄 *{document_title}*

מאת: {sender_name}

🔗 לחץ כאן לחתימה:
{signing_url}

✅ חתימה מאובטחת על פי החוק הישראלי
🔒 הקישור אישי ומאובטח
{"⏰ יש לחתום עד: " + deadline_str if deadline else ""}

_אל תשתף קישור זה עם אחרים_
            """.strip()
            
        elif language == 'ar':  # Arabic
            sms = f"""
مرحبا {signer_name}،
لديك وثيقة للتوقيع من {sender_name}
الوثيقة: {document_title}
اضغط هنا: {signing_url}
{"حتى تاريخ: " + deadline_str if deadline else ""}
            """.strip()
            
            whatsapp = f"""
*طلب التوقيع الرقمي - SignaAI*

مرحبا {signer_name}،

طُلب منك التوقيع على:
📄 *{document_title}*

من: {sender_name}

🔗 اضغط هنا للتوقيع:
{signing_url}

✅ توقيع آمن وملزم قانونياً
🔒 الرابط شخصي ومحمي
{"⏰ الموعد النهائي: " + deadline_str if deadline else ""}

_لا تشارك هذا الرابط مع الآخرين_
            """.strip()
            
        else:  # English (default)
            sms = f"""
Hi {signer_name},
You have a document to sign from {sender_name}
Document: {document_title}
Click here: {signing_url}
{"Deadline: " + deadline_str if deadline else ""}
            """.strip()
            
            whatsapp = f"""
*SignaAI Digital Signature Request*

Hello {signer_name},

You have been requested to sign:
📄 *{document_title}*

From: {sender_name}

🔗 Click here to sign:
{signing_url}

✅ Secure & legally binding
🔒 Personal protected link
{"⏰ Deadline: " + deadline_str if deadline else ""}

_Do not share this link with others_
            """.strip()
        
        return {
            'sms': sms[:160],  # SMS character limit
            'whatsapp': whatsapp
        }
    
    async def send_reminder(
        self,
        signer_name: str,
        signer_phone: str,
        document_title: str,
        signing_url: str,
        days_until_deadline: int,
        language: str = 'en'
    ) -> NotificationResult:
        """Send reminder notification"""
        
        messages = {
            'en': f"Reminder: You have {days_until_deadline} days to sign '{document_title}'. {signing_url}",
            'he': f"תזכורת: נותרו {days_until_deadline} ימים לחתום על '{document_title}'. {signing_url}",
            'ar': f"تذكير: لديك {days_until_deadline} أيام للتوقيع على '{document_title}'. {signing_url}"
        }
        
        message = messages.get(language, messages['en'])
        return await self._send_sms(signer_phone, message)
    
    async def send_completion_notification(
        self,
        recipient_name: str,
        recipient_phone: str,
        document_title: str,
        download_url: str,
        language: str = 'en'
    ) -> NotificationResult:
        """Send notification when all signatures are complete"""
        
        messages = {
            'en': f"✅ All signatures complete for '{document_title}'. Download: {download_url}",
            'he': f"✅ כל החתימות הושלמו עבור '{document_title}'. הורדה: {download_url}",
            'ar': f"✅ اكتملت جميع التوقيعات لـ '{document_title}'. تحميل: {download_url}"
        }
        
        message = messages.get(language, messages['en'])
        return await self._send_whatsapp(recipient_phone, message)
    
    def _load_templates(self) -> Dict[str, Dict[str, str]]:
        """Load message templates for different languages"""
        return {
            'signature_request': {
                'en': "You have a document to sign",
                'he': "יש לך מסמך לחתימה",
                'ar': "لديك وثيقة للتوقيع"
            },
            'reminder': {
                'en': "Reminder: Please sign your document",
                'he': "תזכורת: אנא חתום על המסמך שלך",
                'ar': "تذكير: يرجى التوقيع على المستند"
            },
            'completed': {
                'en': "All signatures complete",
                'he': "כל החתימות הושלמו",
                'ar': "اكتملت جميع التوقيعات"
            }
        }
    
    async def get_delivery_status(self, message_id: str) -> Dict[str, Any]:
        """
        Get delivery status of a sent message
        
        Args:
            message_id: Twilio message SID
            
        Returns:
            Delivery status information
        """
        try:
            message = self.client.messages(message_id).fetch()
            
            return {
                'message_id': message.sid,
                'status': message.status,
                'sent_at': message.date_sent,
                'delivered_at': message.date_updated if message.status == 'delivered' else None,
                'error_message': message.error_message,
                'price': message.price,
                'price_unit': message.price_unit
            }
            
        except TwilioException as e:
            logger.error(f"Failed to get message status: {e}")
            return {'error': str(e)}