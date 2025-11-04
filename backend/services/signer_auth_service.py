"""
Signer Authentication Service - Secure token-based access for document signers
Implements secure token generation and validation for signer access

Root Cause: Need for secure signer portal authentication without requiring user accounts
Fix: Token-based authentication with expiration, IP validation, and phone/email verification
"""

import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta
from typing import Dict, Optional, Tuple
from urllib.parse import quote, unquote

from fastapi import HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from core.config import settings
from models.document import Signer, SignatureWorkflow


class SignerAuthService:
    """
    Secure authentication service for document signers
    Provides token-based access without requiring user accounts
    """

    def __init__(self):
        self.SECRET_KEY = settings.SECRET_KEY
        self.ALGORITHM = "HS256"
        self.TOKEN_EXPIRE_DAYS = 30  # Signing links valid for 30 days
        self.VERIFICATION_CODE_LENGTH = 6
        self.VERIFICATION_EXPIRE_MINUTES = 10

    def generate_signing_token(
        self,
        signer_id: str,
        workflow_id: str,
        document_id: str,
        expires_in_days: int = None,
        require_verification: bool = True,
        ip_restriction: Optional[str] = None,
    ) -> str:
        """
        Generate a secure signing token for a signer

        Args:
            signer_id: ID of the signer
            workflow_id: ID of the workflow
            document_id: ID of the document
            expires_in_days: Custom expiration in days (default: 30)
            require_verification: Whether phone/email verification is required
            ip_restriction: Optional IP address restriction

        Returns:
            Encoded JWT token for signing access
        """
        if expires_in_days is None:
            expires_in_days = self.TOKEN_EXPIRE_DAYS

        # Create token payload
        payload = {
            "sub": signer_id,  # Subject is the signer ID
            "workflow_id": workflow_id,
            "document_id": document_id,
            "type": "signing_token",
            "require_verification": require_verification,
            "iat": datetime.utcnow(),
            "exp": datetime.utcnow() + timedelta(days=expires_in_days),
        }

        # Add optional IP restriction
        if ip_restriction:
            payload["allowed_ip"] = ip_restriction

        # Generate secure random jti (JWT ID) for one-time use tracking
        payload["jti"] = secrets.token_urlsafe(32)

        # Encode the token
        token = jwt.encode(payload, self.SECRET_KEY, algorithm=self.ALGORITHM)
        return token

    def validate_signing_token(
        self, token: str, request_ip: Optional[str] = None
    ) -> Dict:
        """
        Validate a signing token and extract signer information

        Args:
            token: The JWT signing token
            request_ip: IP address of the request for validation

        Returns:
            Dict with signer_id, workflow_id, document_id, and metadata

        Raises:
            HTTPException: If token is invalid, expired, or IP doesn't match
        """
        try:
            # Decode the token
            payload = jwt.decode(token, self.SECRET_KEY, algorithms=[self.ALGORITHM])

            # Verify token type
            if payload.get("type") != "signing_token":
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token type",
                )

            # Check expiration (JWT library handles this, but explicit check for clarity)
            exp = payload.get("exp")
            if exp and datetime.fromtimestamp(exp) < datetime.utcnow():
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Signing link has expired",
                )

            # Verify IP restriction if present
            if payload.get("allowed_ip") and request_ip:
                if payload["allowed_ip"] != request_ip:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Access denied from this IP address",
                    )

            return {
                "signer_id": payload["sub"],
                "workflow_id": payload["workflow_id"],
                "document_id": payload["document_id"],
                "require_verification": payload.get("require_verification", True),
                "jti": payload.get("jti"),
            }

        except JWTError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid or expired signing link: {str(e)}",
            )

    def generate_verification_code(self) -> str:
        """
        Generate a secure verification code for phone/email verification

        Returns:
            6-digit verification code as string
        """
        # Generate cryptographically secure random code
        code = secrets.randbelow(10**self.VERIFICATION_CODE_LENGTH)
        return str(code).zfill(self.VERIFICATION_CODE_LENGTH)

    def create_verification_token(
        self, signer_id: str, verification_code: str, contact: str
    ) -> str:
        """
        Create a verification token for storing verification codes securely

        Args:
            signer_id: ID of the signer
            verification_code: The generated verification code
            contact: Phone number or email being verified

        Returns:
            Encoded verification token
        """
        payload = {
            "signer_id": signer_id,
            "code": verification_code,
            "contact": contact,
            "type": "verification",
            "exp": datetime.utcnow() + timedelta(minutes=self.VERIFICATION_EXPIRE_MINUTES),
        }

        token = jwt.encode(payload, self.SECRET_KEY, algorithm=self.ALGORITHM)
        return token

    def verify_code(
        self, verification_token: str, submitted_code: str, contact: str
    ) -> bool:
        """
        Verify a submitted code against the stored verification token

        Args:
            verification_token: The stored verification token
            submitted_code: Code submitted by the signer
            contact: Phone/email to verify against

        Returns:
            True if code is valid, False otherwise
        """
        try:
            payload = jwt.decode(
                verification_token, self.SECRET_KEY, algorithms=[self.ALGORITHM]
            )

            # Check token type
            if payload.get("type") != "verification":
                return False

            # Verify code and contact match
            return (
                payload.get("code") == submitted_code
                and payload.get("contact") == contact
            )

        except JWTError:
            return False

    def generate_signing_url(
        self, base_url: str, token: str, workflow_id: str = None
    ) -> str:
        """
        Generate a complete signing URL with token

        Args:
            base_url: Base URL of the application
            token: The signing token
            workflow_id: Optional workflow ID for tracking

        Returns:
            Complete signing URL
        """
        # URL-safe encode the token
        encoded_token = quote(token)

        # Build the signing URL
        signing_url = f"{base_url}/sign/{encoded_token}"

        # Add optional workflow parameter for tracking
        if workflow_id:
            signing_url += f"?workflow={workflow_id}"

        return signing_url

    def validate_signer_access(
        self, db: Session, token: str, request: Request
    ) -> Tuple[Signer, SignatureWorkflow]:
        """
        Complete validation of signer access including database checks

        Args:
            db: Database session
            token: Signing token
            request: FastAPI request object for IP extraction

        Returns:
            Tuple of (Signer, SignatureWorkflow) objects

        Raises:
            HTTPException: If validation fails
        """
        # Extract client IP
        client_ip = request.client.host if request.client else None

        # Validate token
        token_data = self.validate_signing_token(token, client_ip)

        # Fetch signer from database
        signer = (
            db.query(Signer)
            .filter(Signer.id == token_data["signer_id"])
            .first()
        )

        if not signer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Signer not found",
            )

        # Check if signer has already signed
        if signer.status == "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Document already signed",
            )

        # Fetch workflow
        workflow = (
            db.query(SignatureWorkflow)
            .filter(SignatureWorkflow.id == token_data["workflow_id"])
            .first()
        )

        if not workflow:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workflow not found",
            )

        # Check workflow status
        if workflow.status == "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Workflow already completed",
            )

        if workflow.status == "cancelled":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Workflow has been cancelled",
            )

        # Check deadline if present
        if workflow.deadline and workflow.deadline < datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Signing deadline has passed",
            )

        # Log access attempt
        self._log_access_attempt(signer.id, client_ip, True)

        return signer, workflow

    def _log_access_attempt(
        self, signer_id: str, ip_address: Optional[str], success: bool
    ):
        """
        Log signer access attempts for security auditing

        Args:
            signer_id: ID of the signer
            ip_address: IP address of the attempt
            success: Whether the access was successful
        """
        # TODO: Implement logging to database or external service
        print(f"Access attempt - Signer: {signer_id}, IP: {ip_address}, Success: {success}")

    def create_session_token(
        self, signer_id: str, workflow_id: str, verified: bool = False
    ) -> str:
        """
        Create a short-lived session token after successful verification

        Args:
            signer_id: ID of the signer
            workflow_id: ID of the workflow
            verified: Whether phone/email has been verified

        Returns:
            Session token valid for 2 hours
        """
        payload = {
            "sub": signer_id,
            "workflow_id": workflow_id,
            "type": "session",
            "verified": verified,
            "exp": datetime.utcnow() + timedelta(hours=2),
        }

        return jwt.encode(payload, self.SECRET_KEY, algorithm=self.ALGORITHM)


# Global instance
signer_auth_service = SignerAuthService()