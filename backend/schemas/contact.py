"""
Contact Management Schemas for SignaAI
Pydantic models for contact CRUD operations and validation
"""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field, validator
import re


class ContactCreate(BaseModel):
    """Schema for creating a new contact"""
    name: str = Field(..., min_length=1, max_length=255, description="Full name of the contact")
    email: Optional[EmailStr] = Field(None, description="Email address")
    phone: Optional[str] = Field(None, max_length=50, description="Phone number")
    company: Optional[str] = Field(None, max_length=255, description="Company name")
    role: Optional[str] = Field(None, max_length=100, description="Professional role")
    preferred_language: str = Field("en", max_length=10, description="Preferred language (en, he, ar)")
    preferred_channels: List[str] = Field(["email"], description="Preferred notification channels")
    notes: Optional[str] = Field(None, description="Additional notes about the contact")
    tags: Optional[List[str]] = Field([], description="Tags for categorization")
    
    @validator('phone')
    def validate_phone(cls, v):
        if v and not re.match(r'^[\+]?[1-9][\d]{0,15}$', v.replace(' ', '').replace('-', '')):
            raise ValueError('Invalid phone number format')
        return v
    
    @validator('preferred_language')
    def validate_language(cls, v):
        if v not in ['en', 'he', 'ar', 'es', 'fr']:
            raise ValueError('Unsupported language')
        return v
    
    @validator('preferred_channels')
    def validate_channels(cls, v):
        valid_channels = ['email', 'sms', 'whatsapp']
        for channel in v:
            if channel not in valid_channels:
                raise ValueError(f'Invalid notification channel: {channel}')
        return v
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "John Doe",
                "email": "john.doe@example.com",
                "phone": "+1234567890",
                "company": "Example Corp",
                "role": "Client",
                "preferred_language": "en",
                "preferred_channels": ["email", "sms"],
                "notes": "VIP client, prefers morning meetings",
                "tags": ["vip", "client", "real_estate"]
            }
        }


class ContactUpdate(BaseModel):
    """Schema for updating an existing contact"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    company: Optional[str] = Field(None, max_length=255)
    role: Optional[str] = Field(None, max_length=100)
    preferred_language: Optional[str] = Field(None, max_length=10)
    preferred_channels: Optional[List[str]] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    
    @validator('phone')
    def validate_phone(cls, v):
        if v and not re.match(r'^[\+]?[1-9][\d]{0,15}$', v.replace(' ', '').replace('-', '')):
            raise ValueError('Invalid phone number format')
        return v
    
    @validator('preferred_language')
    def validate_language(cls, v):
        if v and v not in ['en', 'he', 'ar', 'es', 'fr']:
            raise ValueError('Unsupported language')
        return v
    
    @validator('preferred_channels')
    def validate_channels(cls, v):
        if v:
            valid_channels = ['email', 'sms', 'whatsapp']
            for channel in v:
                if channel not in valid_channels:
                    raise ValueError(f'Invalid notification channel: {channel}')
        return v


class ContactResponse(BaseModel):
    """Schema for contact response"""
    id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    role: Optional[str] = None
    preferred_language: str
    preferred_channels: List[str]
    usage_count: int
    last_used_at: Optional[datetime] = None
    notes: Optional[str] = None
    tags: List[str]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": "12345678-1234-1234-1234-123456789012",
                "name": "John Doe",
                "email": "john.doe@example.com",
                "phone": "+1234567890",
                "company": "Example Corp",
                "role": "Client",
                "preferred_language": "en",
                "preferred_channels": ["email", "sms"],
                "usage_count": 5,
                "last_used_at": "2024-08-28T10:30:00Z",
                "notes": "VIP client, prefers morning meetings",
                "tags": ["vip", "client", "real_estate"],
                "created_at": "2024-08-01T09:00:00Z",
                "updated_at": "2024-08-28T10:30:00Z"
            }
        }


class ContactListResponse(BaseModel):
    """Schema for paginated contact list response"""
    total: int
    page: int
    size: int
    pages: int
    contacts: List[ContactResponse]
    
    class Config:
        json_schema_extra = {
            "example": {
                "total": 25,
                "page": 1,
                "size": 10,
                "pages": 3,
                "contacts": [
                    {
                        "id": "12345678-1234-1234-1234-123456789012",
                        "name": "John Doe",
                        "email": "john.doe@example.com",
                        "phone": "+1234567890",
                        "company": "Example Corp",
                        "role": "Client",
                        "preferred_language": "en",
                        "preferred_channels": ["email"],
                        "usage_count": 5,
                        "last_used_at": "2024-08-28T10:30:00Z",
                        "notes": "VIP client",
                        "tags": ["vip", "client"],
                        "created_at": "2024-08-01T09:00:00Z",
                        "updated_at": "2024-08-28T10:30:00Z"
                    }
                ]
            }
        }


class ContactSearchRequest(BaseModel):
    """Schema for contact search request"""
    query: Optional[str] = Field(None, description="Search query (name, email, company)")
    tags: Optional[List[str]] = Field(None, description="Filter by tags")
    role: Optional[str] = Field(None, description="Filter by role")
    company: Optional[str] = Field(None, description="Filter by company")
    language: Optional[str] = Field(None, description="Filter by preferred language")
    page: int = Field(1, ge=1, description="Page number")
    size: int = Field(20, ge=1, le=100, description="Page size")
    sort_by: str = Field("name", description="Sort by field (name, created_at, last_used_at, usage_count)")
    sort_order: str = Field("asc", description="Sort order (asc, desc)")
    
    @validator('sort_by')
    def validate_sort_by(cls, v):
        valid_fields = ['name', 'created_at', 'last_used_at', 'usage_count', 'company', 'role']
        if v not in valid_fields:
            raise ValueError(f'Invalid sort field. Valid options: {valid_fields}')
        return v
    
    @validator('sort_order')
    def validate_sort_order(cls, v):
        if v not in ['asc', 'desc']:
            raise ValueError('Sort order must be asc or desc')
        return v


class ContactQuickAdd(BaseModel):
    """Schema for quick contact creation (minimal fields)"""
    name: str = Field(..., min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    
    @validator('phone')
    def validate_phone(cls, v):
        if v and not re.match(r'^[\+]?[1-9][\d]{0,15}$', v.replace(' ', '').replace('-', '')):
            raise ValueError('Invalid phone number format')
        return v
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "Jane Smith",
                "email": "jane.smith@example.com",
                "phone": "+1987654321"
            }
        }


class ContactImportRequest(BaseModel):
    """Schema for bulk contact import"""
    contacts: List[ContactCreate] = Field(..., max_items=100, description="List of contacts to import")
    overwrite_existing: bool = Field(False, description="Overwrite existing contacts with same email")
    
    class Config:
        json_schema_extra = {
            "example": {
                "contacts": [
                    {
                        "name": "John Doe",
                        "email": "john@example.com",
                        "phone": "+1234567890"
                    },
                    {
                        "name": "Jane Smith", 
                        "email": "jane@example.com",
                        "phone": "+1987654321"
                    }
                ],
                "overwrite_existing": False
            }
        }


class ContactImportResponse(BaseModel):
    """Schema for bulk import response"""
    imported: int
    skipped: int
    errors: List[str]
    contact_ids: List[str]
    
    class Config:
        json_schema_extra = {
            "example": {
                "imported": 2,
                "skipped": 0,
                "errors": [],
                "contact_ids": [
                    "12345678-1234-1234-1234-123456789012",
                    "87654321-4321-4321-4321-210987654321"
                ]
            }
        }


class ContactUsageUpdate(BaseModel):
    """Schema for updating contact usage statistics"""
    contact_id: str
    workflow_id: Optional[str] = None
    document_title: Optional[str] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "contact_id": "12345678-1234-1234-1234-123456789012",
                "workflow_id": "87654321-4321-4321-4321-210987654321",
                "document_title": "Service Agreement"
            }
        }


class ContactTag(BaseModel):
    """Schema for contact tag"""
    name: str = Field(..., min_length=1, max_length=50, description="Tag name")
    color: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$', description="Hex color code")
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "VIP Client",
                "color": "#FF5722"
            }
        }