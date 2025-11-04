"""
Sprint 5: Notification Services Module
Unified notification system for SMS, WhatsApp, and Email

Provides:
- Multi-channel notifications (SMS, WhatsApp, Email)
- Multi-language support (Hebrew, Arabic, English)
- RTL text handling
- Delivery tracking and retry logic
"""

from .twilio_service import TwilioService, twilio_service, NotificationType, MessageStatus
from .email_service import EmailService, email_service, EmailProvider

__all__ = [
    'TwilioService',
    'twilio_service',
    'NotificationType',
    'MessageStatus',
    'EmailService',
    'email_service',
    'EmailProvider',
    'NotificationManager'
]


class NotificationManager:
    """
    Unified notification manager for all channels
    """
    
    def __init__(self):
        self.twilio = twilio_service
        self.email = email_service
    
    async def send_signature_request(
        self,
        recipient: dict,
        document_name: str,
        sender_name: str,
        link: str,
        channels: list = None
    ):
        """
        Send signature request via specified channels
        
        Args:
            recipient: Recipient info (email, phone, language, name)
            document_name: Name of document
            sender_name: Name of sender
            link: Signing link
            channels: List of channels to use ['sms', 'whatsapp', 'email']
        """
        language = recipient.get('language', 'english')
        results = {}
        
        # Default to all available channels
        if not channels:
            channels = ['email']
            if recipient.get('phone'):
                channels.append('sms')
        
        variables = {
            'sender': sender_name,
            'sender_name': sender_name,
            'document_name': document_name,
            'link': link,
            'recipient_name': recipient.get('name', 'User'),
            'expiry_date': recipient.get('expiry_date', '7 days')
        }
        
        # Send SMS
        if 'sms' in channels and recipient.get('phone'):
            sms_result = await self.twilio.send_sms(
                to=recipient['phone'],
                template_key='signature_request',
                language=language,
                variables=variables,
                country_code=recipient.get('country_code')
            )
            results['sms'] = sms_result
        
        # Send WhatsApp
        if 'whatsapp' in channels and recipient.get('phone'):
            whatsapp_result = await self.twilio.send_whatsapp(
                to=recipient['phone'],
                template_key='signature_request',
                language=language,
                variables=variables,
                country_code=recipient.get('country_code')
            )
            results['whatsapp'] = whatsapp_result
        
        # Send Email
        if 'email' in channels and recipient.get('email'):
            email_result = await self.email.send_email(
                to=recipient['email'],
                template_key='signature_request',
                language=language,
                variables=variables
            )
            results['email'] = email_result
        
        return results
    
    async def send_signature_completed(
        self,
        recipient: dict,
        signer_name: str,
        document_name: str,
        remaining_signatures: int,
        channels: list = None
    ):
        """
        Notify that someone has signed a document
        """
        language = recipient.get('language', 'english')
        results = {}
        
        variables = {
            'signer': signer_name,
            'document_name': document_name,
            'remaining': str(remaining_signatures)
        }
        
        # Send notifications
        if 'email' in (channels or ['email']) and recipient.get('email'):
            results['email'] = await self.email.send_email(
                to=recipient['email'],
                template_key='signature_completed',
                language=language,
                variables=variables
            )
        
        if 'sms' in (channels or []) and recipient.get('phone'):
            results['sms'] = await self.twilio.send_sms(
                to=recipient['phone'],
                template_key='signature_completed',
                language=language,
                variables=variables,
                country_code=recipient.get('country_code')
            )
        
        return results
    
    async def send_document_ready(
        self,
        recipient: dict,
        document_name: str,
        download_link: str,
        channels: list = None,
        attachment_path: str = None
    ):
        """
        Notify that signed document is ready for download
        """
        language = recipient.get('language', 'english')
        results = {}
        
        variables = {
            'document_name': document_name,
            'link': download_link,
            'recipient_name': recipient.get('name', 'User')
        }
        
        # Send email with attachment if available
        if 'email' in (channels or ['email']) and recipient.get('email'):
            if attachment_path:
                results['email'] = await self.email.send_with_attachment(
                    to=recipient['email'],
                    subject=f"Your signed document: {document_name}",
                    html_content="Please find your signed document attached.",
                    file_path=attachment_path,
                    filename=f"{document_name}.pdf"
                )
            else:
                results['email'] = await self.email.send_email(
                    to=recipient['email'],
                    template_key='document_ready',
                    language=language,
                    variables=variables
                )
        
        # Send SMS/WhatsApp
        if recipient.get('phone'):
            if 'sms' in (channels or []):
                results['sms'] = await self.twilio.send_sms(
                    to=recipient['phone'],
                    template_key='document_ready',
                    language=language,
                    variables=variables,
                    country_code=recipient.get('country_code')
                )
            
            if 'whatsapp' in (channels or []):
                results['whatsapp'] = await self.twilio.send_whatsapp(
                    to=recipient['phone'],
                    template_key='document_ready',
                    language=language,
                    variables=variables,
                    media_url=download_link if download_link.startswith('http') else None,
                    country_code=recipient.get('country_code')
                )
        
        return results
    
    async def send_verification_code(
        self,
        recipient: dict,
        code: str,
        channel: str = 'sms'
    ):
        """
        Send verification code via SMS or email
        """
        language = recipient.get('language', 'english')
        
        if channel == 'sms' and recipient.get('phone'):
            return await self.twilio.send_verification_code(
                to=recipient['phone'],
                code=code,
                language=language,
                country_code=recipient.get('country_code')
            )
        elif channel == 'email' and recipient.get('email'):
            return await self.email.send_email(
                to=recipient['email'],
                template_key='verification_email',
                language=language,
                variables={'code': code}
            )
        
        return {'status': 'failed', 'error': 'Invalid channel or missing contact info'}


# Create singleton instance
notification_manager = NotificationManager()