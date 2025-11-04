"""
Sprint 5: Twilio Notification Service
Handles SMS and WhatsApp notifications with multi-language support

Features:
- SMS sending with Twilio
- WhatsApp Business API integration
- Multi-language message templates
- Delivery tracking and retry logic
- Number validation
"""

import os
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
import asyncio
from enum import Enum

from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException
import phonenumbers
from phonenumbers import NumberParseException

logger = logging.getLogger(__name__)


class NotificationType(Enum):
    SMS = "sms"
    WHATSAPP = "whatsapp"
    BOTH = "both"


class MessageStatus(Enum):
    PENDING = "pending"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"
    UNDELIVERED = "undelivered"


class TwilioService:
    """
    Twilio service for SMS and WhatsApp notifications
    """
    
    def __init__(self):
        """Initialize Twilio client with credentials"""
        self.account_sid = os.getenv('TWILIO_ACCOUNT_SID')
        self.auth_token = os.getenv('TWILIO_AUTH_TOKEN')
        self.sms_from = os.getenv('TWILIO_SMS_NUMBER')
        self.whatsapp_from = os.getenv('TWILIO_WHATSAPP_NUMBER', 'whatsapp:+14155238886')
        
        # Initialize Twilio client
        if self.account_sid and self.auth_token:
            self.client = Client(self.account_sid, self.auth_token)
            self.enabled = True
            logger.info("Twilio service initialized successfully")
        else:
            self.client = None
            self.enabled = False
            logger.warning("Twilio service disabled - missing credentials")
        
        # Message templates
        self.templates = self._load_message_templates()
        
        # Retry configuration
        self.max_retries = 3
        self.retry_delay = 5  # seconds
    
    def _load_message_templates(self) -> Dict[str, Dict[str, str]]:
        """Load multi-language message templates"""
        return {
            'signature_request': {
                'english': 'You have a document to sign from {sender}: {document_name}. Click here: {link}',
                'hebrew': 'יש לך מסמך לחתימה מאת {sender}: {document_name}. לחץ כאן: {link}',
                'arabic': 'لديك مستند للتوقيع من {sender}: {document_name}. اضغط هنا: {link}'
            },
            'signature_reminder': {
                'english': 'Reminder: Please sign "{document_name}" by {deadline}. Link: {link}',
                'hebrew': 'תזכורת: אנא חתום על "{document_name}" עד {deadline}. קישור: {link}',
                'arabic': 'تذكير: يرجى التوقيع على "{document_name}" قبل {deadline}. الرابط: {link}'
            },
            'signature_completed': {
                'english': '{signer} has signed "{document_name}". {remaining} signatures remaining.',
                'hebrew': '{signer} חתם על "{document_name}". נותרו {remaining} חתימות.',
                'arabic': '{signer} وقع على "{document_name}". {remaining} توقيعات متبقية.'
            },
            'document_ready': {
                'english': 'Your signed document "{document_name}" is ready. Download: {link}',
                'hebrew': 'המסמך החתום שלך "{document_name}" מוכן. הורדה: {link}',
                'arabic': 'المستند الموقع "{document_name}" جاهز. تحميل: {link}'
            },
            'verification_code': {
                'english': 'Your SignaAI verification code is: {code}. Valid for 10 minutes.',
                'hebrew': 'קוד האימות שלך ב-SignaAI: {code}. תקף ל-10 דקות.',
                'arabic': 'رمز التحقق الخاص بك في SignaAI: {code}. صالح لمدة 10 دقائق.'
            },
            'identity_verification': {
                'english': 'Complete your identity verification for "{document_name}": {link}',
                'hebrew': 'השלם את אימות הזהות שלך עבור "{document_name}": {link}',
                'arabic': 'أكمل التحقق من هويتك لـ "{document_name}": {link}'
            }
        }
    
    def validate_phone_number(self, phone: str, country_code: str = None) -> Optional[str]:
        """
        Validate and format phone number
        
        Args:
            phone: Phone number to validate
            country_code: ISO country code (e.g., 'IL', 'US')
            
        Returns:
            Formatted phone number in E.164 format or None if invalid
        """
        try:
            # Parse phone number
            if phone.startswith('+'):
                parsed = phonenumbers.parse(phone, None)
            else:
                # Default to Israel if no country code provided
                parsed = phonenumbers.parse(phone, country_code or 'IL')
            
            # Validate number
            if not phonenumbers.is_valid_number(parsed):
                logger.warning(f"Invalid phone number: {phone}")
                return None
            
            # Format to E.164
            formatted = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
            return formatted
            
        except NumberParseException as e:
            logger.error(f"Failed to parse phone number {phone}: {e}")
            return None
    
    async def send_sms(
        self,
        to: str,
        template_key: str,
        language: str = 'english',
        variables: Dict[str, Any] = None,
        country_code: str = None
    ) -> Dict[str, Any]:
        """
        Send SMS message
        
        Args:
            to: Recipient phone number
            template_key: Message template key
            language: Message language
            variables: Template variables
            country_code: Country code for number validation
            
        Returns:
            Message status and details
        """
        if not self.enabled:
            logger.warning("Twilio service is disabled")
            return {
                'status': MessageStatus.FAILED.value,
                'error': 'Service disabled'
            }
        
        # Validate phone number
        formatted_to = self.validate_phone_number(to, country_code)
        if not formatted_to:
            return {
                'status': MessageStatus.FAILED.value,
                'error': 'Invalid phone number'
            }
        
        # Get message template
        template = self.templates.get(template_key, {}).get(language)
        if not template:
            logger.error(f"Template not found: {template_key}/{language}")
            return {
                'status': MessageStatus.FAILED.value,
                'error': 'Template not found'
            }
        
        # Format message
        message_body = template.format(**(variables or {}))
        
        # Send with retry logic
        for attempt in range(self.max_retries):
            try:
                message = self.client.messages.create(
                    body=message_body,
                    from_=self.sms_from,
                    to=formatted_to
                )
                
                logger.info(f"SMS sent successfully to {formatted_to}: {message.sid}")
                
                return {
                    'status': MessageStatus.SENT.value,
                    'message_sid': message.sid,
                    'to': formatted_to,
                    'body': message_body,
                    'timestamp': datetime.utcnow().isoformat()
                }
                
            except TwilioRestException as e:
                logger.error(f"Failed to send SMS (attempt {attempt + 1}): {e}")
                
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay)
                else:
                    return {
                        'status': MessageStatus.FAILED.value,
                        'error': str(e),
                        'attempts': attempt + 1
                    }
    
    async def send_whatsapp(
        self,
        to: str,
        template_key: str,
        language: str = 'english',
        variables: Dict[str, Any] = None,
        media_url: Optional[str] = None,
        country_code: str = None
    ) -> Dict[str, Any]:
        """
        Send WhatsApp message
        
        Args:
            to: Recipient phone number
            template_key: Message template key
            language: Message language
            variables: Template variables
            media_url: Optional media attachment URL
            country_code: Country code for number validation
            
        Returns:
            Message status and details
        """
        if not self.enabled:
            logger.warning("Twilio service is disabled")
            return {
                'status': MessageStatus.FAILED.value,
                'error': 'Service disabled'
            }
        
        # Validate phone number
        formatted_to = self.validate_phone_number(to, country_code)
        if not formatted_to:
            return {
                'status': MessageStatus.FAILED.value,
                'error': 'Invalid phone number'
            }
        
        # Format WhatsApp number
        whatsapp_to = f"whatsapp:{formatted_to}"
        
        # Get message template
        template = self.templates.get(template_key, {}).get(language)
        if not template:
            logger.error(f"Template not found: {template_key}/{language}")
            return {
                'status': MessageStatus.FAILED.value,
                'error': 'Template not found'
            }
        
        # Format message
        message_body = template.format(**(variables or {}))
        
        # Send with retry logic
        for attempt in range(self.max_retries):
            try:
                message_params = {
                    'body': message_body,
                    'from_': self.whatsapp_from,
                    'to': whatsapp_to
                }
                
                # Add media if provided
                if media_url:
                    message_params['media_url'] = media_url
                
                message = self.client.messages.create(**message_params)
                
                logger.info(f"WhatsApp sent successfully to {formatted_to}: {message.sid}")
                
                return {
                    'status': MessageStatus.SENT.value,
                    'message_sid': message.sid,
                    'to': formatted_to,
                    'body': message_body,
                    'media_url': media_url,
                    'timestamp': datetime.utcnow().isoformat()
                }
                
            except TwilioRestException as e:
                logger.error(f"Failed to send WhatsApp (attempt {attempt + 1}): {e}")
                
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay)
                else:
                    return {
                        'status': MessageStatus.FAILED.value,
                        'error': str(e),
                        'attempts': attempt + 1
                    }
    
    async def send_notification(
        self,
        to: str,
        template_key: str,
        notification_type: NotificationType = NotificationType.SMS,
        language: str = 'english',
        variables: Dict[str, Any] = None,
        media_url: Optional[str] = None,
        country_code: str = None
    ) -> Dict[str, Any]:
        """
        Send notification via SMS, WhatsApp, or both
        
        Args:
            to: Recipient phone number
            template_key: Message template key
            notification_type: Type of notification to send
            language: Message language
            variables: Template variables
            media_url: Optional media for WhatsApp
            country_code: Country code for validation
            
        Returns:
            Notification results
        """
        results = {}
        
        if notification_type in [NotificationType.SMS, NotificationType.BOTH]:
            sms_result = await self.send_sms(
                to=to,
                template_key=template_key,
                language=language,
                variables=variables,
                country_code=country_code
            )
            results['sms'] = sms_result
        
        if notification_type in [NotificationType.WHATSAPP, NotificationType.BOTH]:
            whatsapp_result = await self.send_whatsapp(
                to=to,
                template_key=template_key,
                language=language,
                variables=variables,
                media_url=media_url,
                country_code=country_code
            )
            results['whatsapp'] = whatsapp_result
        
        return results
    
    async def send_bulk_notifications(
        self,
        recipients: List[Dict[str, Any]],
        template_key: str,
        notification_type: NotificationType = NotificationType.SMS,
        default_language: str = 'english'
    ) -> List[Dict[str, Any]]:
        """
        Send bulk notifications to multiple recipients
        
        Args:
            recipients: List of recipient dictionaries with phone, language, variables
            template_key: Message template key
            notification_type: Type of notification
            default_language: Default language if not specified
            
        Returns:
            List of results for each recipient
        """
        tasks = []
        
        for recipient in recipients:
            task = self.send_notification(
                to=recipient.get('phone'),
                template_key=template_key,
                notification_type=notification_type,
                language=recipient.get('language', default_language),
                variables=recipient.get('variables', {}),
                media_url=recipient.get('media_url'),
                country_code=recipient.get('country_code')
            )
            tasks.append(task)
        
        results = await asyncio.gather(*tasks)
        
        # Add recipient info to results
        for i, result in enumerate(results):
            result['recipient'] = recipients[i].get('phone')
        
        return results
    
    async def get_message_status(self, message_sid: str) -> Dict[str, Any]:
        """
        Get status of a sent message
        
        Args:
            message_sid: Twilio message SID
            
        Returns:
            Message status details
        """
        if not self.enabled:
            return {'error': 'Service disabled'}
        
        try:
            message = self.client.messages(message_sid).fetch()
            
            return {
                'sid': message.sid,
                'status': message.status,
                'to': message.to,
                'from': message.from_,
                'date_sent': message.date_sent.isoformat() if message.date_sent else None,
                'date_updated': message.date_updated.isoformat() if message.date_updated else None,
                'error_code': message.error_code,
                'error_message': message.error_message
            }
            
        except TwilioRestException as e:
            logger.error(f"Failed to get message status: {e}")
            return {'error': str(e)}
    
    def format_for_rtl(self, text: str, language: str) -> str:
        """
        Format text for RTL languages (Hebrew, Arabic)
        
        Args:
            text: Text to format
            language: Language code
            
        Returns:
            Formatted text with RTL markers if needed
        """
        rtl_languages = ['hebrew', 'arabic']
        
        if language in rtl_languages:
            # Add RTL Unicode markers
            return f"\u202B{text}\u202C"
        
        return text
    
    async def send_verification_code(
        self,
        to: str,
        code: str,
        language: str = 'english',
        country_code: str = None
    ) -> Dict[str, Any]:
        """
        Send verification code via SMS
        
        Args:
            to: Recipient phone number
            code: Verification code
            language: Message language
            country_code: Country code
            
        Returns:
            Message status
        """
        return await self.send_sms(
            to=to,
            template_key='verification_code',
            language=language,
            variables={'code': code},
            country_code=country_code
        )


# Create singleton instance
twilio_service = TwilioService()