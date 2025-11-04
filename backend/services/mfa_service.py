"""
Multi-Factor Authentication Service - Sprint 2
SMS OTP and TOTP implementation
"""

import pyotp
import qrcode
from io import BytesIO
import base64
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import random
import redis
import json

from twilio.rest import Client
from twilio.base.exceptions import TwilioException

from core.config import settings


class MFAService:
    """Multi-factor authentication service with SMS and TOTP support"""
    
    def __init__(self):
        # Initialize Twilio client for SMS
        self.twilio_client = None
        if settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN:
            self.twilio_client = Client(
                settings.TWILIO_ACCOUNT_SID,
                settings.TWILIO_AUTH_TOKEN
            )
        
        # Initialize Redis for OTP storage
        self.redis_client = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            db=0,
            decode_responses=True
        )
        
        self.OTP_EXPIRE_SECONDS = 300  # 5 minutes
        self.MAX_OTP_ATTEMPTS = 3
        
    async def send_sms_otp(self, phone: str, user_id: str) -> Dict[str, Any]:
        """Generate and send OTP via SMS"""
        try:
            # Generate 6-digit OTP
            otp = str(random.randint(100000, 999999))
            
            # Store OTP in Redis with expiration
            otp_key = f"otp:sms:{user_id}"
            otp_data = {
                "code": otp,
                "phone": phone,
                "attempts": 0,
                "created_at": datetime.utcnow().isoformat()
            }
            
            self.redis_client.setex(
                otp_key,
                self.OTP_EXPIRE_SECONDS,
                json.dumps(otp_data)
            )
            
            # Send SMS via Twilio
            if self.twilio_client and not settings.TESTING:
                message = self.twilio_client.messages.create(
                    body=f"Your SignaAI verification code is: {otp}. Valid for 5 minutes.",
                    from_=settings.TWILIO_PHONE_NUMBER,
                    to=phone
                )
                
                return {
                    "success": True,
                    "message": "OTP sent successfully",
                    "expires_in": self.OTP_EXPIRE_SECONDS,
                    "message_sid": message.sid
                }
            else:
                # Testing mode or Twilio not configured
                print(f"[TEST MODE] OTP for {phone}: {otp}")
                return {
                    "success": True,
                    "message": "OTP generated (test mode)",
                    "expires_in": self.OTP_EXPIRE_SECONDS,
                    "test_otp": otp if settings.TESTING else None
                }
                
        except TwilioException as e:
            return {
                "success": False,
                "message": f"Failed to send SMS: {str(e)}"
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Error generating OTP: {str(e)}"
            }
    
    async def verify_sms_otp(self, user_id: str, otp: str) -> Dict[str, Any]:
        """Verify SMS OTP"""
        try:
            otp_key = f"otp:sms:{user_id}"
            stored_data = self.redis_client.get(otp_key)
            
            if not stored_data:
                return {
                    "success": False,
                    "message": "OTP expired or not found"
                }
            
            otp_data = json.loads(stored_data)
            
            # Check attempts
            if otp_data["attempts"] >= self.MAX_OTP_ATTEMPTS:
                self.redis_client.delete(otp_key)
                return {
                    "success": False,
                    "message": "Maximum attempts exceeded"
                }
            
            # Increment attempts
            otp_data["attempts"] += 1
            self.redis_client.setex(
                otp_key,
                self.redis_client.ttl(otp_key),
                json.dumps(otp_data)
            )
            
            # Verify OTP
            if otp_data["code"] == otp:
                self.redis_client.delete(otp_key)
                return {
                    "success": True,
                    "message": "OTP verified successfully"
                }
            else:
                return {
                    "success": False,
                    "message": f"Invalid OTP. {self.MAX_OTP_ATTEMPTS - otp_data['attempts']} attempts remaining"
                }
                
        except Exception as e:
            return {
                "success": False,
                "message": f"Error verifying OTP: {str(e)}"
            }
    
    def generate_totp_secret(self, user_email: str) -> str:
        """Generate TOTP secret for authenticator apps"""
        secret = pyotp.random_base32()
        
        # Store secret in Redis (should be moved to database in production)
        secret_key = f"totp:secret:{user_email}"
        self.redis_client.set(secret_key, secret)
        
        return secret
    
    def generate_totp_qr_code(self, user_email: str, secret: str) -> str:
        """Generate QR code for TOTP setup"""
        # Create TOTP URI
        totp_uri = pyotp.totp.TOTP(secret).provisioning_uri(
            name=user_email,
            issuer_name='SignaAI'
        )
        
        # Generate QR code
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(totp_uri)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Convert to base64
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)
        
        img_base64 = base64.b64encode(buffer.getvalue()).decode()
        return f"data:image/png;base64,{img_base64}"
    
    def verify_totp(self, user_email: str, token: str) -> bool:
        """Verify TOTP token from authenticator app"""
        secret_key = f"totp:secret:{user_email}"
        secret = self.redis_client.get(secret_key)
        
        if not secret:
            return False
        
        totp = pyotp.TOTP(secret)
        # Allow for time drift (±30 seconds)
        return totp.verify(token, valid_window=1)
    
    async def send_whatsapp_otp(self, phone: str, user_id: str) -> Dict[str, Any]:
        """Send OTP via WhatsApp (using Twilio WhatsApp API)"""
        try:
            # Generate OTP
            otp = str(random.randint(100000, 999999))
            
            # Store OTP in Redis
            otp_key = f"otp:whatsapp:{user_id}"
            otp_data = {
                "code": otp,
                "phone": phone,
                "attempts": 0,
                "created_at": datetime.utcnow().isoformat()
            }
            
            self.redis_client.setex(
                otp_key,
                self.OTP_EXPIRE_SECONDS,
                json.dumps(otp_data)
            )
            
            # Send WhatsApp message via Twilio
            if self.twilio_client and not settings.TESTING:
                message = self.twilio_client.messages.create(
                    body=f"Your SignaAI verification code is: {otp}\nValid for 5 minutes.",
                    from_=f"whatsapp:{settings.TWILIO_WHATSAPP_NUMBER}",
                    to=f"whatsapp:{phone}"
                )
                
                return {
                    "success": True,
                    "message": "WhatsApp OTP sent successfully",
                    "expires_in": self.OTP_EXPIRE_SECONDS,
                    "message_sid": message.sid
                }
            else:
                # Testing mode
                print(f"[TEST MODE] WhatsApp OTP for {phone}: {otp}")
                return {
                    "success": True,
                    "message": "WhatsApp OTP generated (test mode)",
                    "expires_in": self.OTP_EXPIRE_SECONDS,
                    "test_otp": otp if settings.TESTING else None
                }
                
        except Exception as e:
            return {
                "success": False,
                "message": f"Error sending WhatsApp OTP: {str(e)}"
            }
    
    async def verify_whatsapp_otp(self, user_id: str, otp: str) -> Dict[str, Any]:
        """Verify WhatsApp OTP"""
        # Similar to SMS OTP verification
        otp_key = f"otp:whatsapp:{user_id}"
        return await self.verify_sms_otp(user_id, otp)  # Reuse SMS verification logic
    
    def generate_backup_codes(self, user_id: str, count: int = 10) -> list:
        """Generate backup codes for account recovery"""
        codes = []
        for _ in range(count):
            code = f"{random.randint(1000, 9999)}-{random.randint(1000, 9999)}"
            codes.append(code)
        
        # Store hashed codes in Redis
        backup_key = f"backup:codes:{user_id}"
        hashed_codes = [hashlib.sha256(code.encode()).hexdigest() for code in codes]
        self.redis_client.set(backup_key, json.dumps(hashed_codes))
        
        return codes
    
    def verify_backup_code(self, user_id: str, code: str) -> bool:
        """Verify and consume a backup code"""
        backup_key = f"backup:codes:{user_id}"
        stored_codes = self.redis_client.get(backup_key)
        
        if not stored_codes:
            return False
        
        hashed_codes = json.loads(stored_codes)
        code_hash = hashlib.sha256(code.encode()).hexdigest()
        
        if code_hash in hashed_codes:
            # Remove used code
            hashed_codes.remove(code_hash)
            self.redis_client.set(backup_key, json.dumps(hashed_codes))
            return True
        
        return False


# Singleton instance
mfa_service = MFAService()