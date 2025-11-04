"""
Authentication Service - Sprint 2 Implementation
JWT authentication with MFA support
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import secrets
import hashlib
import hmac

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from core.config import settings
from models.user import User
from schemas.auth import TokenData


class AuthService:
    """Authentication service with JWT and MFA support"""
    
    def __init__(self):
        self.pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        self.SECRET_KEY = settings.SECRET_KEY
        self.ALGORITHM = "HS256"
        self.ACCESS_TOKEN_EXPIRE_MINUTES = 30
        self.REFRESH_TOKEN_EXPIRE_DAYS = 7
        self.OTP_EXPIRE_MINUTES = 5
        
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify a password against its hash"""
        return self.pwd_context.verify(plain_password, hashed_password)
    
    def get_password_hash(self, password: str) -> str:
        """Hash a password"""
        return self.pwd_context.hash(password)
    
    def create_access_token(self, data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
        """Create a JWT access token"""
        to_encode = data.copy()
        
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=self.ACCESS_TOKEN_EXPIRE_MINUTES)
            
        to_encode.update({"exp": expire, "type": "access"})
        encoded_jwt = jwt.encode(to_encode, self.SECRET_KEY, algorithm=self.ALGORITHM)
        return encoded_jwt
    
    def create_refresh_token(self, data: Dict[str, Any]) -> str:
        """Create a JWT refresh token"""
        to_encode = data.copy()
        expire = datetime.utcnow() + timedelta(days=self.REFRESH_TOKEN_EXPIRE_DAYS)
        to_encode.update({"exp": expire, "type": "refresh"})
        encoded_jwt = jwt.encode(to_encode, self.SECRET_KEY, algorithm=self.ALGORITHM)
        return encoded_jwt
    
    def verify_token(self, token: str, token_type: str = "access") -> TokenData:
        """Verify and decode a JWT token"""
        credentials_exception = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
        try:
            payload = jwt.decode(token, self.SECRET_KEY, algorithms=[self.ALGORITHM])
            
            # Check token type
            if payload.get("type") != token_type:
                raise credentials_exception
                
            # Extract user info
            user_id: str = payload.get("sub")
            if user_id is None:
                raise credentials_exception
                
            # Check expiration
            exp = payload.get("exp")
            if exp and datetime.fromtimestamp(exp) < datetime.utcnow():
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token has expired",
                    headers={"WWW-Authenticate": "Bearer"},
                )
                
            return TokenData(user_id=user_id)
            
        except JWTError:
            raise credentials_exception
    
    async def authenticate_user(self, db: Session, email: str, password: str) -> Optional[User]:
        """Authenticate a user with email and password"""
        user = db.query(User).filter(User.email == email).first()
        
        if not user:
            return None
            
        if not self.verify_password(password, user.hashed_password):
            return None
            
        return user
    
    def generate_otp(self, length: int = 6) -> str:
        """Generate a random OTP"""
        return ''.join(secrets.choice('0123456789') for _ in range(length))
    
    def generate_otp_secret(self, user_id: str) -> str:
        """Generate a unique OTP secret for a user"""
        # Combine user ID with a random value for uniqueness
        data = f"{user_id}{secrets.token_hex(16)}"
        return hashlib.sha256(data.encode()).hexdigest()
    
    def verify_otp(self, stored_otp: str, provided_otp: str, timestamp: datetime) -> bool:
        """Verify an OTP code"""
        # Check if OTP has expired
        if datetime.utcnow() - timestamp > timedelta(minutes=self.OTP_EXPIRE_MINUTES):
            return False
            
        # Constant-time comparison to prevent timing attacks
        return hmac.compare_digest(stored_otp, provided_otp)
    
    def create_password_reset_token(self, email: str) -> str:
        """Create a password reset token"""
        data = {"sub": email, "purpose": "password_reset"}
        expire = datetime.utcnow() + timedelta(hours=1)
        data.update({"exp": expire})
        return jwt.encode(data, self.SECRET_KEY, algorithm=self.ALGORITHM)
    
    def verify_password_reset_token(self, token: str) -> Optional[str]:
        """Verify a password reset token and return the email"""
        try:
            payload = jwt.decode(token, self.SECRET_KEY, algorithms=[self.ALGORITHM])
            
            if payload.get("purpose") != "password_reset":
                return None
                
            email: str = payload.get("sub")
            return email
            
        except JWTError:
            return None
    
    def create_email_verification_token(self, email: str) -> str:
        """Create an email verification token"""
        data = {"sub": email, "purpose": "email_verification"}
        expire = datetime.utcnow() + timedelta(hours=24)
        data.update({"exp": expire})
        return jwt.encode(data, self.SECRET_KEY, algorithm=self.ALGORITHM)
    
    def verify_email_verification_token(self, token: str) -> Optional[str]:
        """Verify an email verification token and return the email"""
        try:
            payload = jwt.decode(token, self.SECRET_KEY, algorithms=[self.ALGORITHM])
            
            if payload.get("purpose") != "email_verification":
                return None
                
            email: str = payload.get("sub")
            return email
            
        except JWTError:
            return None


# Singleton instance
auth_service = AuthService()