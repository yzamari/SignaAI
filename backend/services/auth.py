"""
Authentication service with JWT tokens, password hashing, and verification
Implements secure authentication following SOLID principles
"""

import logging
import secrets
import string
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.config import settings
from models.user import User, VerificationToken

logger = logging.getLogger(__name__)

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthService:
    """Authentication service for user management and JWT tokens"""

    def __init__(self):
        self.secret_key = settings.JWT_SECRET_KEY
        self.algorithm = settings.JWT_ALGORITHM
        self.access_token_expire_hours = settings.JWT_EXPIRATION_HOURS

    def hash_password(self, password: str) -> str:
        """Hash password using bcrypt"""
        return pwd_context.hash(password)

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify password against hash"""
        return pwd_context.verify(plain_password, hashed_password)

    def create_access_token(self, user_id: str, expires_delta: Optional[timedelta] = None) -> str:
        """Create JWT access token"""
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(hours=self.access_token_expire_hours)

        to_encode = {"sub": str(user_id), "exp": expire, "iat": datetime.utcnow(), "type": "access"}

        encoded_jwt = jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
        return encoded_jwt

    def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Verify JWT token and return payload"""
        logger.info(f"🔐 Token verification requested")
        logger.info(f"🎫 Token preview: {token[:20]}..." if len(token) > 20 else f"🎫 Token: {token}")
        
        # SECURITY: Remove dev token bypass - only allow in development environment
        import os
        if os.getenv("ENVIRONMENT", "production") == "development":
            if token.startswith('dev-test-token-') or token.startswith('dev-token-'):
                logger.warning("⚠️ DEVELOPMENT ONLY: Accepting test token")
                return {
                    "sub": "test-user-123",
                    "exp": (datetime.utcnow() + timedelta(hours=24)).timestamp(),
                    "iat": datetime.utcnow().timestamp(),
                    "type": "access"
                }
        
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            user_id: str = payload.get("sub")
            if user_id is None:
                logger.warning("🚫 Token payload missing 'sub' field")
                return None
            logger.info(f"✅ Token verified successfully for user: {user_id}")
            return payload
        except JWTError as e:
            logger.warning(f"❌ JWT verification failed: {e}")
            return None

    def generate_verification_token(self, length: int = 32) -> str:
        """Generate secure random token for verification"""
        alphabet = string.ascii_letters + string.digits
        return "".join(secrets.choice(alphabet) for _ in range(length))

    def register_user(
        self,
        db: Session,
        email: str,
        password: str,
        full_name: str,
        phone: Optional[str] = None,
        company_name: Optional[str] = None,
        preferred_language: str = "en",
    ) -> Dict[str, Any]:
        """
        Register a new user with email/phone verification
        Returns: {"success": bool, "user": User, "message": str, "tokens": dict}
        """
        try:
            # Check if user already exists
            existing_user = db.query(User).filter(User.email == email).first()
            if existing_user:
                return {"success": False, "message": "User with this email already exists", "user": None, "tokens": {}}

            # Hash password
            password_hash = self.hash_password(password)

            # Create user (input sanitization handled by User model)
            user = User(
                email=email,
                password_hash=password_hash,
                full_name=full_name,
                phone=phone,
                company_name=company_name,
                preferred_language=preferred_language,
                is_active=True,
                is_verified=False,
            )

            db.add(user)
            db.flush()  # Get user ID

            # Create verification tokens
            verification_tokens = {}

            # Email verification token
            email_token = self.generate_verification_token()
            email_verification = VerificationToken(
                user_id=user.id,
                token=email_token,
                token_type="email",
                expires_at=datetime.utcnow() + timedelta(hours=24),
                is_used=False,
            )
            db.add(email_verification)
            verification_tokens["email"] = email_token

            # Phone verification token (if phone provided)
            if phone:
                phone_token = self.generate_verification_token(6)  # 6-digit SMS code
                phone_verification = VerificationToken(
                    user_id=user.id,
                    token=phone_token,
                    token_type="phone",
                    expires_at=datetime.utcnow() + timedelta(minutes=15),  # SMS codes expire quickly
                    is_used=False,
                )
                db.add(phone_verification)
                verification_tokens["phone"] = phone_token

            db.commit()

            logger.info(f"User registered successfully: {email}")
            return {
                "success": True,
                "message": "User registered successfully",
                "user": user,
                "tokens": verification_tokens,
            }

        except IntegrityError as e:
            db.rollback()
            logger.error(f"Database integrity error during registration: {e}")
            return {
                "success": False,
                "message": "User registration failed due to data conflict",
                "user": None,
                "tokens": {},
            }
        except Exception as e:
            db.rollback()
            logger.error(f"Unexpected error during registration: {e}")
            return {"success": False, "message": "User registration failed", "user": None, "tokens": {}}

    def authenticate_user(self, db: Session, email: str, password: str) -> Dict[str, Any]:
        """
        Authenticate user with email and password
        Returns: {"success": bool, "user": User, "access_token": str, "message": str}
        """
        try:
            # Find user by email
            user = db.query(User).filter(User.email == email).first()
            if not user:
                return {"success": False, "message": "Invalid email or password", "user": None, "access_token": None}

            # Check password
            if not self.verify_password(password, user.password_hash):
                return {"success": False, "message": "Invalid email or password", "user": None, "access_token": None}

            # Check if user is active
            if not user.is_active:
                return {"success": False, "message": "Account is deactivated", "user": None, "access_token": None}

            # Create access token
            access_token = self.create_access_token(user_id=user.id)

            # Update last login
            user.last_login = datetime.utcnow()
            db.commit()

            logger.info(f"User authenticated successfully: {email}")
            return {"success": True, "message": "Login successful", "user": user, "access_token": access_token}

        except Exception as e:
            logger.error(f"Authentication error: {e}")
            return {"success": False, "message": "Authentication failed", "user": None, "access_token": None}

    def verify_email_token(self, db: Session, token: str) -> Dict[str, Any]:
        """Verify email verification token"""
        try:
            verification = (
                db.query(VerificationToken)
                .filter(VerificationToken.token == token, VerificationToken.token_type == "email")
                .first()
            )

            if not verification:
                return {"success": False, "message": "Invalid verification token"}

            if not verification.is_valid():
                return {"success": False, "message": "Verification token expired or already used"}

            # Mark token as used
            verification.is_used = True

            # Mark user as verified (if this was the last required verification)
            user = verification.user
            user.is_verified = True

            db.commit()

            logger.info(f"Email verified successfully for user: {user.email}")
            return {"success": True, "message": "Email verified successfully", "user": user}

        except Exception as e:
            db.rollback()
            logger.error(f"Email verification error: {e}")
            return {"success": False, "message": "Email verification failed"}

    def create_password_reset_token(self, db: Session, email: str) -> Dict[str, Any]:
        """Create password reset token for user"""
        try:
            user = db.query(User).filter(User.email == email).first()
            if not user:
                # Don't reveal if email exists or not for security
                return {"success": True, "message": "Password reset instructions sent to email if account exists"}

            # Invalidate existing reset tokens
            existing_tokens = (
                db.query(VerificationToken)
                .filter(
                    VerificationToken.user_id == user.id,
                    VerificationToken.token_type == "password_reset",
                    VerificationToken.is_used == False,
                )
                .all()
            )

            for token in existing_tokens:
                token.is_used = True

            # Create new reset token
            reset_token = self.generate_verification_token()
            password_reset = VerificationToken(
                user_id=user.id,
                token=reset_token,
                token_type="password_reset",
                expires_at=datetime.utcnow() + timedelta(hours=1),  # 1 hour expiry
                is_used=False,
            )
            db.add(password_reset)
            db.commit()

            logger.info(f"Password reset token created for user: {email}")
            return {
                "success": True,
                "message": "Password reset instructions sent to email",
                "token": reset_token,
                "user": user,
            }

        except Exception as e:
            db.rollback()
            logger.error(f"Password reset token creation error: {e}")
            return {"success": False, "message": "Password reset request failed"}

    def reset_password(self, db: Session, token: str, new_password: str) -> Dict[str, Any]:
        """Reset user password with token"""
        try:
            verification = (
                db.query(VerificationToken)
                .filter(VerificationToken.token == token, VerificationToken.token_type == "password_reset")
                .first()
            )

            if not verification:
                return {"success": False, "message": "Invalid reset token"}

            if not verification.is_valid():
                return {"success": False, "message": "Reset token expired or already used"}

            # Update password
            user = verification.user
            user.password_hash = self.hash_password(new_password)

            # Mark token as used
            verification.is_used = True

            db.commit()

            logger.info(f"Password reset successfully for user: {user.email}")
            return {"success": True, "message": "Password reset successfully", "user": user}

        except Exception as e:
            db.rollback()
            logger.error(f"Password reset error: {e}")
            return {"success": False, "message": "Password reset failed"}

    def get_current_user(self, db: Session, token: str) -> Optional[User]:
        """Get current user from JWT token"""
        payload = self.verify_token(token)
        if payload is None:
            return None

        user_id = payload.get("sub")
        if user_id is None:
            return None

        user = db.query(User).filter(User.id == user_id).first()
        return user


# Global auth service instance
auth_service = AuthService()
