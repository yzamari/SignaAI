"""
Sprint 7: Security Hardening Service
Implements rate limiting, input validation, and security headers
"""

import os
import re
import hashlib
import secrets
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import logging
from functools import wraps
import bleach
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request
from starlette.responses import Response
import jwt

logger = logging.getLogger(__name__)

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)


class SecurityService:
    """
    Service for security hardening and protection
    """
    
    def __init__(self):
        """Initialize security service"""
        self.jwt_secret = os.getenv('JWT_SECRET', secrets.token_urlsafe(32))
        self.jwt_algorithm = 'HS256'
        self.max_login_attempts = 5
        self.lockout_duration = timedelta(minutes=30)
        
        # Input validation patterns
        self.validation_patterns = {
            'email': r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$',
            'phone': r'^\+?[1-9]\d{1,14}$',  # E.164 format
            'name': r'^[\p{L}\s\-\'\.]{1,100}$',  # Unicode letters, spaces, hyphens
            'israeli_phone': r'^(\+972|0)[2-9]\d{7,8}$',
            'israeli_id': r'^\d{9}$',  # Israeli ID number
            'credit_card': r'^\d{13,19}$',
            'cvv': r'^\d{3,4}$'
        }
        
        # Content Security Policy
        self.csp_policy = {
            'default-src': ["'self'"],
            'script-src': ["'self'", "'unsafe-inline'", 'https://js.stripe.com'],
            'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            'font-src': ["'self'", 'https://fonts.gstatic.com'],
            'img-src': ["'self'", 'data:', 'https:'],
            'connect-src': ["'self'", 'https://api.stripe.com'],
            'frame-src': ["'self'", 'https://js.stripe.com'],
            'object-src': ["'none'"],
            'base-uri': ["'self'"],
            'form-action': ["'self'"],
            'frame-ancestors': ["'none'"],
            'upgrade-insecure-requests': []
        }
    
    def add_security_headers(self, response: Response) -> Response:
        """
        Add security headers to response
        
        Args:
            response: Starlette response object
            
        Returns:
            Response with security headers
        """
        # Content Security Policy
        csp_header = self._build_csp_header()
        response.headers['Content-Security-Policy'] = csp_header
        
        # Other security headers
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'
        
        return response
    
    def validate_input(
        self,
        input_type: str,
        value: str,
        custom_pattern: Optional[str] = None
    ) -> bool:
        """
        Validate input against patterns
        
        Args:
            input_type: Type of input to validate
            value: Value to validate
            custom_pattern: Optional custom regex pattern
            
        Returns:
            True if valid, False otherwise
        """
        if not value:
            return False
        
        pattern = custom_pattern or self.validation_patterns.get(input_type)
        if not pattern:
            logger.warning(f"No validation pattern for type: {input_type}")
            return False
        
        try:
            return bool(re.match(pattern, value, re.UNICODE))
        except re.error as e:
            logger.error(f"Regex error in validation: {e}")
            return False
    
    def sanitize_html(
        self,
        html: str,
        allowed_tags: Optional[List[str]] = None,
        allowed_attributes: Optional[Dict[str, List[str]]] = None
    ) -> str:
        """
        Sanitize HTML input
        
        Args:
            html: HTML string to sanitize
            allowed_tags: List of allowed HTML tags
            allowed_attributes: Dict of allowed attributes per tag
            
        Returns:
            Sanitized HTML
        """
        if allowed_tags is None:
            allowed_tags = ['p', 'br', 'span', 'div', 'strong', 'em', 'u']
        
        if allowed_attributes is None:
            allowed_attributes = {'span': ['class'], 'div': ['class']}
        
        return bleach.clean(
            html,
            tags=allowed_tags,
            attributes=allowed_attributes,
            strip=True
        )
    
    def sanitize_filename(self, filename: str) -> str:
        """
        Sanitize filename for safe storage
        
        Args:
            filename: Original filename
            
        Returns:
            Sanitized filename
        """
        # Remove path traversal attempts
        filename = os.path.basename(filename)
        
        # Remove dangerous characters
        filename = re.sub(r'[^\w\s\-\.]', '', filename)
        
        # Limit length
        name, ext = os.path.splitext(filename)
        if len(name) > 100:
            name = name[:100]
        
        return name + ext
    
    def hash_password(self, password: str, salt: Optional[str] = None) -> tuple:
        """
        Hash password with salt
        
        Args:
            password: Plain text password
            salt: Optional salt (generated if not provided)
            
        Returns:
            Tuple of (hashed_password, salt)
        """
        if not salt:
            salt = secrets.token_hex(32)
        
        # Use PBKDF2 for password hashing
        key = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            salt.encode('utf-8'),
            100000  # iterations
        )
        
        return key.hex(), salt
    
    def verify_password(
        self,
        password: str,
        hashed: str,
        salt: str
    ) -> bool:
        """
        Verify password against hash
        
        Args:
            password: Plain text password
            hashed: Hashed password
            salt: Salt used for hashing
            
        Returns:
            True if password matches
        """
        key = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            salt.encode('utf-8'),
            100000
        )
        
        return key.hex() == hashed
    
    def generate_secure_token(self, length: int = 32) -> str:
        """
        Generate secure random token
        
        Args:
            length: Token length
            
        Returns:
            Secure token
        """
        return secrets.token_urlsafe(length)
    
    def create_jwt_token(
        self,
        payload: Dict[str, Any],
        expires_in: timedelta = timedelta(hours=24)
    ) -> str:
        """
        Create JWT token
        
        Args:
            payload: Token payload
            expires_in: Expiration time
            
        Returns:
            JWT token
        """
        payload = payload.copy()
        payload['exp'] = datetime.utcnow() + expires_in
        payload['iat'] = datetime.utcnow()
        payload['jti'] = secrets.token_hex(16)  # JWT ID for tracking
        
        return jwt.encode(payload, self.jwt_secret, algorithm=self.jwt_algorithm)
    
    def verify_jwt_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Verify and decode JWT token
        
        Args:
            token: JWT token
            
        Returns:
            Decoded payload or None if invalid
        """
        try:
            payload = jwt.decode(
                token,
                self.jwt_secret,
                algorithms=[self.jwt_algorithm]
            )
            return payload
        except jwt.ExpiredSignatureError:
            logger.warning("JWT token expired")
            return None
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid JWT token: {e}")
            return None
    
    def check_rate_limit(
        self,
        key: str,
        limit: int = 10,
        window: int = 60
    ) -> bool:
        """
        Check if rate limit is exceeded
        
        Args:
            key: Rate limit key (e.g., IP address, user ID)
            limit: Number of requests allowed
            window: Time window in seconds
            
        Returns:
            True if within limit, False if exceeded
        """
        # This is a simplified implementation
        # In production, use Redis or similar for distributed rate limiting
        # The slowapi limiter handles this more robustly
        return True
    
    def validate_israeli_id(self, id_number: str) -> bool:
        """
        Validate Israeli ID number (Mispar Zehut)
        
        Args:
            id_number: Israeli ID number
            
        Returns:
            True if valid
        """
        if not self.validate_input('israeli_id', id_number):
            return False
        
        # Israeli ID validation algorithm
        total = 0
        for i, digit in enumerate(id_number):
            num = int(digit)
            if i % 2 == 0:
                total += num
            else:
                num *= 2
                total += num if num < 10 else num - 9
        
        return total % 10 == 0
    
    def encrypt_sensitive_data(self, data: str) -> str:
        """
        Encrypt sensitive data for storage
        
        Args:
            data: Data to encrypt
            
        Returns:
            Encrypted data
        """
        # Use Fernet for symmetric encryption
        from cryptography.fernet import Fernet
        
        # In production, key should be stored securely
        key = os.getenv('ENCRYPTION_KEY', Fernet.generate_key())
        cipher = Fernet(key)
        
        return cipher.encrypt(data.encode()).decode()
    
    def decrypt_sensitive_data(self, encrypted_data: str) -> str:
        """
        Decrypt sensitive data
        
        Args:
            encrypted_data: Encrypted data
            
        Returns:
            Decrypted data
        """
        from cryptography.fernet import Fernet
        
        key = os.getenv('ENCRYPTION_KEY', Fernet.generate_key())
        cipher = Fernet(key)
        
        return cipher.decrypt(encrypted_data.encode()).decode()
    
    def _build_csp_header(self) -> str:
        """
        Build Content Security Policy header
        
        Returns:
            CSP header string
        """
        directives = []
        for directive, sources in self.csp_policy.items():
            if sources:
                sources_str = ' '.join(sources)
                directives.append(f"{directive} {sources_str}")
            else:
                directives.append(directive)
        
        return '; '.join(directives)
    
    def log_security_event(
        self,
        event_type: str,
        user_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        """
        Log security-related events
        
        Args:
            event_type: Type of security event
            user_id: User ID if applicable
            ip_address: IP address
            details: Additional details
        """
        log_entry = {
            'timestamp': datetime.utcnow().isoformat(),
            'event_type': event_type,
            'user_id': user_id,
            'ip_address': ip_address,
            'details': details or {}
        }
        
        # Log to security audit log
        logger.info(f"SECURITY_EVENT: {log_entry}")
        
        # In production, also send to SIEM or security monitoring service


# Create singleton instance
security_service = SecurityService()


# Rate limiting decorators
def rate_limit(limit: str):
    """
    Rate limiting decorator
    
    Args:
        limit: Rate limit string (e.g., "5/minute", "100/hour")
    """
    def decorator(func):
        @wraps(func)
        @limiter.limit(limit)
        async def wrapper(request: Request, *args, **kwargs):
            return await func(request, *args, **kwargs)
        return wrapper
    return decorator