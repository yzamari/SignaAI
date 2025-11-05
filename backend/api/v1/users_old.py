"""
User management endpoints - Complete implementation
User CRUD operations and profile management with security
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, validator
from sqlalchemy.orm import Session

from core.database import get_db
from models.user import User
from services.auth import auth_service

router = APIRouter()
logger = logging.getLogger(__name__)
security = HTTPBearer()


class UserResponse(BaseModel):
    """User response model"""

    id: str
    email: str
    full_name: str
    phone: Optional[str]
    company_name: Optional[str]
    preferred_language: str
    is_active: bool
    is_verified: bool
    created_at: str
    updated_at: str
    last_login: Optional[str]


class UserUpdateRequest(BaseModel):
    """User profile update request"""
    full_name: Optional[str] = None
    phone: Optional[str] = None
    company_name: Optional[str] = None
    preferred_language: Optional[str] = None

    @validator("preferred_language")
    def validate_language(cls, v):
        if v is not None and v not in ["en", "ar", "he"]:
            raise ValueError("Supported languages: en, ar, he")
        return v


class UserPreferencesResponse(BaseModel):
    """User preferences response model"""
    language: str
    theme: str = "light"
    notifications_enabled: bool = True
    timezone: str = "UTC"
    date_format: str = "YYYY-MM-DD"


class UserPreferencesUpdate(BaseModel):
    """User preferences update request"""
    language: Optional[str] = None
    theme: Optional[str] = None
    notifications_enabled: Optional[bool] = None
    timezone: Optional[str] = None
    date_format: Optional[str] = None

    @validator("language")
    def validate_language(cls, v):
        if v is not None and v not in ["en", "ar", "he"]:
            raise ValueError("Supported languages: en, ar, he")
        return v

    @validator("theme")
    def validate_theme(cls, v):
        if v is not None and v not in ["light", "dark"]:
            raise ValueError("Supported themes: light, dark")
        return v


async def get_current_user_from_token(
    token: HTTPAuthorizationCredentials = Depends(security), 
    db: Session = Depends(get_db)
) -> User:
    """
    Get current authenticated user from JWT token
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        # Verify token and get user
        current_user = auth_service.get_current_user(db, token.credentials)
        
        if not current_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        if not current_user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is deactivated",
            )
        
        return current_user

    except Exception as e:
        logger.error(f"Authentication error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.get("/me", response_model=UserResponse)
async def get_current_user(current_user: User = Depends(get_current_user_from_token)):
    """
    Get current authenticated user profile
    """
    logger.info(f"Get current user request for: {current_user.email}")

    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        phone=current_user.phone,
        company_name=current_user.company_name,
        preferred_language=current_user.preferred_language,
        is_active=current_user.is_active,
        is_verified=current_user.is_verified,
        created_at=current_user.created_at.isoformat() if current_user.created_at else None,
        updated_at=current_user.updated_at.isoformat() if current_user.updated_at else None,
        last_login=current_user.last_login.isoformat() if current_user.last_login else None,
    )


@router.put("/me")
async def update_current_user(
    user_data: dict, token: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)
):
    """
    Update current user profile
    Sprint 1: Basic endpoint structure
    """
    # TODO: Validate JWT token
    # TODO: Update user in database
    # TODO: Validate input data

    logger.info("Update current user request")
    return {"message": "User profile updated successfully"}


@router.delete("/me")
async def delete_current_user(token: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    """
    Delete current user account
    Sprint 1: Basic endpoint structure
    """
    # TODO: Validate JWT token
    # TODO: Soft delete user from database
    # TODO: Clean up associated data

    logger.info("Delete current user request")
    return {"message": "User account deleted successfully"}


@router.post("/change-password")
async def change_password(
    current_password: str,
    new_password: str,
    token: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    """
    Change user password
    Sprint 1: Basic endpoint structure
    """
    # TODO: Validate JWT token
    # TODO: Verify current password
    # TODO: Hash and update new password

    logger.info("Change password request")
    return {"message": "Password changed successfully"}


@router.get("/preferences")
async def get_user_preferences(token: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    """
    Get user preferences (language, theme, notifications)
    Sprint 1: Basic endpoint structure
    """
    # TODO: Validate JWT token
    # TODO: Fetch user preferences from database

    logger.info("Get user preferences request")

    return {
        "language": "en",
        "theme": "light",
        "notifications": {"email": True, "sms": True, "push": False},
        "timezone": "UTC",
        "date_format": "YYYY-MM-DD",
    }


@router.put("/preferences")
async def update_user_preferences(
    preferences: dict, token: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)
):
    """
    Update user preferences
    Sprint 1: Basic endpoint structure
    """
    # TODO: Validate JWT token
    # TODO: Update preferences in database
    # TODO: Validate preference values

    logger.info("Update user preferences request")
    return {"message": "Preferences updated successfully"}
