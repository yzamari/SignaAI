"""
Sprint 5: Email Notification Service
Handles email notifications with SendGrid and AWS SES support

Features:
- SendGrid integration
- AWS SES fallback
- HTML email templates with RTL support
- Multi-language email templates
- Attachment support
- Delivery tracking
"""

import os
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
import asyncio
from enum import Enum
from pathlib import Path
import base64

# SendGrid
try:
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import (
        Mail, Email, To, Content, Attachment, 
        FileContent, FileName, FileType, Disposition
    )
    SENDGRID_AVAILABLE = True
except ImportError:
    SENDGRID_AVAILABLE = False
    logging.warning("SendGrid not available")

# AWS SES
try:
    import boto3
    from botocore.exceptions import ClientError
    AWS_SES_AVAILABLE = True
except ImportError:
    AWS_SES_AVAILABLE = False
    logging.warning("AWS SES not available")

logger = logging.getLogger(__name__)


class EmailProvider(Enum):
    SENDGRID = "sendgrid"
    AWS_SES = "aws_ses"
    SMTP = "smtp"


class EmailService:
    """
    Email service with multiple provider support
    """
    
    def __init__(self):
        """Initialize email service with available providers"""
        self.providers = []
        
        # Initialize SendGrid
        if SENDGRID_AVAILABLE and os.getenv('SENDGRID_API_KEY'):
            self.sendgrid_client = SendGridAPIClient(os.getenv('SENDGRID_API_KEY'))
            self.providers.append(EmailProvider.SENDGRID)
            logger.info("SendGrid email provider initialized")
        
        # Initialize AWS SES
        if AWS_SES_AVAILABLE and os.getenv('AWS_ACCESS_KEY_ID'):
            self.ses_client = boto3.client(
                'ses',
                region_name=os.getenv('AWS_REGION', 'us-east-1')
            )
            self.providers.append(EmailProvider.AWS_SES)
            logger.info("AWS SES email provider initialized")
        
        # Default sender
        self.default_sender = os.getenv('EMAIL_FROM', 'noreply@signaai.com')
        self.default_sender_name = os.getenv('EMAIL_FROM_NAME', 'SignaAI')
        
        # Load email templates
        self.templates = self._load_email_templates()
    
    def _load_email_templates(self) -> Dict[str, Dict[str, Any]]:
        """Load multi-language email templates"""
        return {
            'signature_request': {
                'subject': {
                    'english': 'Document Signature Request from {sender}',
                    'hebrew': 'בקשת חתימה על מסמך מאת {sender}',
                    'arabic': 'طلب توقيع المستند من {sender}'
                },
                'html': {
                    'english': self._get_template_html('signature_request_en'),
                    'hebrew': self._get_template_html('signature_request_he'),
                    'arabic': self._get_template_html('signature_request_ar')
                }
            },
            'signature_completed': {
                'subject': {
                    'english': 'Document "{document_name}" has been signed',
                    'hebrew': 'המסמך "{document_name}" נחתם',
                    'arabic': 'تم توقيع المستند "{document_name}"'
                },
                'html': {
                    'english': self._get_template_html('signature_completed_en'),
                    'hebrew': self._get_template_html('signature_completed_he'),
                    'arabic': self._get_template_html('signature_completed_ar')
                }
            },
            'document_ready': {
                'subject': {
                    'english': 'Your signed document is ready',
                    'hebrew': 'המסמך החתום שלך מוכן',
                    'arabic': 'المستند الموقع جاهز'
                },
                'html': {
                    'english': self._get_template_html('document_ready_en'),
                    'hebrew': self._get_template_html('document_ready_he'),
                    'arabic': self._get_template_html('document_ready_ar')
                }
            },
            'verification_email': {
                'subject': {
                    'english': 'Verify your email address',
                    'hebrew': 'אמת את כתובת הדוא"ל שלך',
                    'arabic': 'تحقق من عنوان بريدك الإلكتروني'
                },
                'html': {
                    'english': self._get_template_html('verification_en'),
                    'hebrew': self._get_template_html('verification_he'),
                    'arabic': self._get_template_html('verification_ar')
                }
            }
        }
    
    def _get_template_html(self, template_name: str) -> str:
        """Get HTML template with RTL support"""
        base_template = """
        <!DOCTYPE html>
        <html lang="{lang}" dir="{dir}">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {{
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    direction: {dir};
                }}
                .header {{
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 30px;
                    text-align: center;
                    border-radius: 10px 10px 0 0;
                }}
                .content {{
                    background: white;
                    padding: 30px;
                    border: 1px solid #e0e0e0;
                    border-radius: 0 0 10px 10px;
                }}
                .button {{
                    display: inline-block;
                    background: #667eea;
                    color: white;
                    padding: 12px 30px;
                    text-decoration: none;
                    border-radius: 5px;
                    margin: 20px 0;
                }}
                .footer {{
                    text-align: center;
                    color: #666;
                    font-size: 12px;
                    margin-top: 30px;
                }}
                .rtl {{
                    direction: rtl;
                    text-align: right;
                }}
            </style>
        </head>
        <body class="{rtl_class}">
            <div class="header">
                <h1>{header}</h1>
            </div>
            <div class="content">
                {content}
            </div>
            <div class="footer">
                {footer}
            </div>
        </body>
        </html>
        """
        
        # Template content by type and language
        templates = {
            'signature_request_en': {
                'lang': 'en',
                'dir': 'ltr',
                'rtl_class': '',
                'header': 'Document Signature Request',
                'content': """
                    <p>Hello {recipient_name},</p>
                    <p>You have been requested to sign the document: <strong>{document_name}</strong></p>
                    <p>Sender: {sender_name}</p>
                    <p>Please click the button below to review and sign the document:</p>
                    <a href="{link}" class="button">Sign Document</a>
                    <p>This link will expire on {expiry_date}.</p>
                """,
                'footer': '© 2025 SignaAI. All rights reserved.'
            },
            'signature_request_he': {
                'lang': 'he',
                'dir': 'rtl',
                'rtl_class': 'rtl',
                'header': 'בקשת חתימה על מסמך',
                'content': """
                    <p>שלום {recipient_name},</p>
                    <p>התבקשת לחתום על המסמך: <strong>{document_name}</strong></p>
                    <p>שולח: {sender_name}</p>
                    <p>אנא לחץ על הכפתור למטה כדי לעיין ולחתום על המסמך:</p>
                    <a href="{link}" class="button">חתום על המסמך</a>
                    <p>קישור זה יפוג בתאריך {expiry_date}.</p>
                """,
                'footer': '© 2025 SignaAI. כל הזכויות שמורות.'
            },
            'signature_request_ar': {
                'lang': 'ar',
                'dir': 'rtl',
                'rtl_class': 'rtl',
                'header': 'طلب توقيع المستند',
                'content': """
                    <p>مرحبا {recipient_name},</p>
                    <p>لقد طُلب منك توقيع المستند: <strong>{document_name}</strong></p>
                    <p>المرسل: {sender_name}</p>
                    <p>يرجى النقر على الزر أدناه لمراجعة المستند والتوقيع عليه:</p>
                    <a href="{link}" class="button">توقيع المستند</a>
                    <p>ستنتهي صلاحية هذا الرابط في {expiry_date}.</p>
                """,
                'footer': '© 2025 SignaAI. جميع الحقوق محفوظة.'
            }
        }
        
        template_data = templates.get(template_name, templates['signature_request_en'])
        return base_template.format(**template_data)
    
    async def send_email(
        self,
        to: str,
        template_key: str,
        language: str = 'english',
        variables: Dict[str, Any] = None,
        attachments: List[Dict[str, Any]] = None,
        cc: List[str] = None,
        bcc: List[str] = None,
        provider: Optional[EmailProvider] = None
    ) -> Dict[str, Any]:
        """
        Send email using available provider
        
        Args:
            to: Recipient email address
            template_key: Email template key
            language: Email language
            variables: Template variables
            attachments: List of attachments
            cc: CC recipients
            bcc: BCC recipients
            provider: Specific provider to use
            
        Returns:
            Send status and details
        """
        # Select provider
        if provider and provider in self.providers:
            selected_provider = provider
        elif self.providers:
            selected_provider = self.providers[0]  # Use first available
        else:
            logger.error("No email provider available")
            return {
                'status': 'failed',
                'error': 'No email provider configured'
            }
        
        # Get template
        template = self.templates.get(template_key)
        if not template:
            logger.error(f"Template not found: {template_key}")
            return {
                'status': 'failed',
                'error': 'Template not found'
            }
        
        # Prepare email data
        subject = template['subject'].get(language, template['subject']['english'])
        html_template = template['html'].get(language, template['html']['english'])
        
        # Format with variables
        if variables:
            subject = subject.format(**variables)
            html_content = html_template.format(**variables)
        else:
            html_content = html_template
        
        # Send with selected provider
        if selected_provider == EmailProvider.SENDGRID:
            return await self._send_with_sendgrid(
                to=to,
                subject=subject,
                html_content=html_content,
                attachments=attachments,
                cc=cc,
                bcc=bcc
            )
        elif selected_provider == EmailProvider.AWS_SES:
            return await self._send_with_ses(
                to=to,
                subject=subject,
                html_content=html_content,
                attachments=attachments,
                cc=cc,
                bcc=bcc
            )
        else:
            return {
                'status': 'failed',
                'error': f'Provider {selected_provider} not implemented'
            }
    
    async def _send_with_sendgrid(
        self,
        to: str,
        subject: str,
        html_content: str,
        attachments: List[Dict[str, Any]] = None,
        cc: List[str] = None,
        bcc: List[str] = None
    ) -> Dict[str, Any]:
        """Send email using SendGrid"""
        try:
            message = Mail(
                from_email=Email(self.default_sender, self.default_sender_name),
                to_emails=To(to),
                subject=subject,
                html_content=Content("text/html", html_content)
            )
            
            # Add CC recipients
            if cc:
                for cc_email in cc:
                    message.add_cc(cc_email)
            
            # Add BCC recipients
            if bcc:
                for bcc_email in bcc:
                    message.add_bcc(bcc_email)
            
            # Add attachments
            if attachments:
                for att in attachments:
                    attachment = Attachment()
                    attachment.file_content = FileContent(att['content'])
                    attachment.file_name = FileName(att['filename'])
                    attachment.file_type = FileType(att.get('type', 'application/pdf'))
                    attachment.disposition = Disposition('attachment')
                    message.add_attachment(attachment)
            
            # Send email
            response = self.sendgrid_client.send(message)
            
            logger.info(f"Email sent via SendGrid to {to}")
            
            return {
                'status': 'sent',
                'provider': 'sendgrid',
                'message_id': response.headers.get('X-Message-Id'),
                'to': to,
                'timestamp': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"SendGrid error: {e}")
            return {
                'status': 'failed',
                'provider': 'sendgrid',
                'error': str(e)
            }
    
    async def _send_with_ses(
        self,
        to: str,
        subject: str,
        html_content: str,
        attachments: List[Dict[str, Any]] = None,
        cc: List[str] = None,
        bcc: List[str] = None
    ) -> Dict[str, Any]:
        """Send email using AWS SES"""
        try:
            # Prepare destination
            destination = {'ToAddresses': [to]}
            if cc:
                destination['CcAddresses'] = cc
            if bcc:
                destination['BccAddresses'] = bcc
            
            # Send email
            response = self.ses_client.send_email(
                Source=f"{self.default_sender_name} <{self.default_sender}>",
                Destination=destination,
                Message={
                    'Subject': {'Data': subject},
                    'Body': {'Html': {'Data': html_content}}
                }
            )
            
            logger.info(f"Email sent via AWS SES to {to}")
            
            return {
                'status': 'sent',
                'provider': 'aws_ses',
                'message_id': response['MessageId'],
                'to': to,
                'timestamp': datetime.utcnow().isoformat()
            }
            
        except ClientError as e:
            logger.error(f"AWS SES error: {e}")
            return {
                'status': 'failed',
                'provider': 'aws_ses',
                'error': str(e)
            }
    
    async def send_bulk_emails(
        self,
        recipients: List[Dict[str, Any]],
        template_key: str,
        default_language: str = 'english'
    ) -> List[Dict[str, Any]]:
        """
        Send bulk emails to multiple recipients
        
        Args:
            recipients: List of recipient dictionaries
            template_key: Email template key
            default_language: Default language
            
        Returns:
            List of send results
        """
        tasks = []
        
        for recipient in recipients:
            task = self.send_email(
                to=recipient.get('email'),
                template_key=template_key,
                language=recipient.get('language', default_language),
                variables=recipient.get('variables', {}),
                attachments=recipient.get('attachments')
            )
            tasks.append(task)
        
        results = await asyncio.gather(*tasks)
        
        # Add recipient info to results
        for i, result in enumerate(results):
            result['recipient'] = recipients[i].get('email')
        
        return results
    
    async def send_with_attachment(
        self,
        to: str,
        subject: str,
        html_content: str,
        file_path: str,
        filename: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Send email with file attachment
        
        Args:
            to: Recipient email
            subject: Email subject
            html_content: HTML content
            file_path: Path to attachment file
            filename: Optional custom filename
            
        Returns:
            Send status
        """
        # Read file
        path = Path(file_path)
        if not path.exists():
            return {
                'status': 'failed',
                'error': f'File not found: {file_path}'
            }
        
        with open(path, 'rb') as f:
            content = base64.b64encode(f.read()).decode()
        
        attachment = {
            'content': content,
            'filename': filename or path.name,
            'type': 'application/pdf'  # Adjust based on file type
        }
        
        return await self.send_email(
            to=to,
            template_key='document_ready',
            variables={'subject': subject, 'content': html_content},
            attachments=[attachment]
        )


# Create singleton instance
email_service = EmailService()