"""
Contact Management API Endpoints
CRUD operations for managing customer/signer contacts
"""

import logging
from math import ceil
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import and_, or_, desc, asc, func
from sqlalchemy.orm import Session

from core.database import get_db
from models.contact import Contact, ContactUsageLog, ContactTag
from models.user import User
from services.auth import auth_service
from schemas.contact import (
    ContactCreate,
    ContactUpdate,
    ContactResponse,
    ContactListResponse,
    ContactSearchRequest,
    ContactQuickAdd,
    ContactImportRequest,
    ContactImportResponse,
    ContactUsageUpdate,
)

router = APIRouter()
logger = logging.getLogger(__name__)
security = HTTPBearer()


def get_current_user(token: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)) -> User:
    """Get current authenticated user"""
    try:
        user = auth_service.get_current_user(db=db, token=token.credentials)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token"
            )
        return user
    except Exception as e:
        logger.error(f"Authentication error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token"
        )


# Contact CRUD Operations

@router.post("/contacts", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
async def create_contact(
    contact_data: ContactCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new contact"""
    try:
        logger.info(f"Creating contact: {contact_data.name} for user {current_user.id}")
        
        # Check if contact with same email already exists for this user
        if contact_data.email:
            existing_contact = db.query(Contact).filter(
                and_(
                    Contact.user_id == current_user.id,
                    Contact.email == contact_data.email
                )
            ).first()
            
            if existing_contact:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Contact with email {contact_data.email} already exists"
                )
        
        # Create new contact
        contact = Contact(
            user_id=current_user.id,
            name=contact_data.name,
            email=contact_data.email,
            phone=contact_data.phone,
            company=contact_data.company,
            role=contact_data.role,
            preferred_language=contact_data.preferred_language,
            preferred_channels=contact_data.preferred_channels,
            notes=contact_data.notes,
            tags=contact_data.tags or []
        )
        
        db.add(contact)
        db.commit()
        db.refresh(contact)
        
        logger.info(f"Contact created successfully: {contact.id}")
        return ContactResponse.from_orm(contact)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating contact: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create contact"
        )


@router.get("/contacts", response_model=ContactListResponse)
async def get_contacts(
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(20, ge=1, le=100, description="Page size"),
    search: Optional[str] = Query(None, description="Search query"),
    tags: Optional[List[str]] = Query(None, description="Filter by tags"),
    role: Optional[str] = Query(None, description="Filter by role"),
    company: Optional[str] = Query(None, description="Filter by company"),
    sort_by: str = Query("name", description="Sort by field"),
    sort_order: str = Query("asc", description="Sort order"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get paginated list of contacts"""
    try:
        logger.info(f"Fetching contacts for user {current_user.id} - page {page}, size {size}")
        
        # Build query
        query = db.query(Contact).filter(Contact.user_id == current_user.id)
        
        # Apply filters
        if search:
            search_filter = or_(
                Contact.name.ilike(f"%{search}%"),
                Contact.email.ilike(f"%{search}%"),
                Contact.company.ilike(f"%{search}%"),
                Contact.role.ilike(f"%{search}%"),
            )
            query = query.filter(search_filter)
        
        if tags:
            for tag in tags:
                query = query.filter(Contact.tags.contains([tag]))
        
        if role:
            query = query.filter(Contact.role.ilike(f"%{role}%"))
        
        if company:
            query = query.filter(Contact.company.ilike(f"%{company}%"))
        
        # Apply sorting
        sort_field = getattr(Contact, sort_by, Contact.name)
        if sort_order == "desc":
            query = query.order_by(desc(sort_field))
        else:
            query = query.order_by(asc(sort_field))
        
        # Get total count
        total = query.count()
        
        # Apply pagination
        offset = (page - 1) * size
        contacts = query.offset(offset).limit(size).all()
        
        # Calculate pagination info
        pages = ceil(total / size) if total > 0 else 1
        
        logger.info(f"Found {total} contacts, returning page {page}/{pages}")
        
        return ContactListResponse(
            total=total,
            page=page,
            size=size,
            pages=pages,
            contacts=[ContactResponse.from_orm(contact) for contact in contacts]
        )
        
    except Exception as e:
        logger.error(f"Error fetching contacts: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch contacts"
        )


@router.get("/contacts/{contact_id}", response_model=ContactResponse)
async def get_contact(
    contact_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific contact by ID"""
    try:
        logger.info(f"Fetching contact {contact_id} for user {current_user.id}")
        
        contact = db.query(Contact).filter(
            and_(
                Contact.id == contact_id,
                Contact.user_id == current_user.id
            )
        ).first()
        
        if not contact:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Contact not found"
            )
        
        return ContactResponse.from_orm(contact)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching contact {contact_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch contact"
        )


@router.put("/contacts/{contact_id}", response_model=ContactResponse)
async def update_contact(
    contact_id: str,
    contact_data: ContactUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update an existing contact"""
    try:
        logger.info(f"Updating contact {contact_id} for user {current_user.id}")
        
        contact = db.query(Contact).filter(
            and_(
                Contact.id == contact_id,
                Contact.user_id == current_user.id
            )
        ).first()
        
        if not contact:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Contact not found"
            )
        
        # Check for email conflicts if email is being updated
        if contact_data.email and contact_data.email != contact.email:
            existing_contact = db.query(Contact).filter(
                and_(
                    Contact.user_id == current_user.id,
                    Contact.email == contact_data.email,
                    Contact.id != contact_id
                )
            ).first()
            
            if existing_contact:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Contact with email {contact_data.email} already exists"
                )
        
        # Update fields that are provided
        update_data = contact_data.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(contact, field, value)
        
        db.commit()
        db.refresh(contact)
        
        logger.info(f"Contact updated successfully: {contact.id}")
        return ContactResponse.from_orm(contact)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating contact {contact_id}: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update contact"
        )


@router.delete("/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    contact_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a contact"""
    try:
        logger.info(f"Deleting contact {contact_id} for user {current_user.id}")
        
        contact = db.query(Contact).filter(
            and_(
                Contact.id == contact_id,
                Contact.user_id == current_user.id
            )
        ).first()
        
        if not contact:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Contact not found"
            )
        
        db.delete(contact)
        db.commit()
        
        logger.info(f"Contact deleted successfully: {contact_id}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting contact {contact_id}: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete contact"
        )


# Quick Actions

@router.post("/contacts/quick-add", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
async def quick_add_contact(
    contact_data: ContactQuickAdd,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Quickly add a contact with minimal information"""
    try:
        logger.info(f"Quick adding contact: {contact_data.name} for user {current_user.id}")
        
        # Check if contact with same email already exists
        if contact_data.email:
            existing_contact = db.query(Contact).filter(
                and_(
                    Contact.user_id == current_user.id,
                    Contact.email == contact_data.email
                )
            ).first()
            
            if existing_contact:
                # Return existing contact instead of error for quick-add
                logger.info(f"Contact already exists, returning existing: {existing_contact.id}")
                return ContactResponse.from_orm(existing_contact)
        
        # Create new contact with minimal data
        contact = Contact(
            user_id=current_user.id,
            name=contact_data.name,
            email=contact_data.email,
            phone=contact_data.phone,
            preferred_language="en",  # Default
            preferred_channels=["email"] if contact_data.email else ["sms"],
            tags=[]
        )
        
        db.add(contact)
        db.commit()
        db.refresh(contact)
        
        logger.info(f"Contact quick-added successfully: {contact.id}")
        return ContactResponse.from_orm(contact)
        
    except Exception as e:
        logger.error(f"Error quick-adding contact: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to add contact"
        )


@router.post("/contacts/bulk-import", response_model=ContactImportResponse)
async def bulk_import_contacts(
    import_data: ContactImportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Bulk import contacts from a list"""
    try:
        logger.info(f"Bulk importing {len(import_data.contacts)} contacts for user {current_user.id}")
        
        imported = 0
        skipped = 0
        errors = []
        contact_ids = []
        
        for contact_data in import_data.contacts:
            try:
                # Check if contact exists
                existing_contact = None
                if contact_data.email:
                    existing_contact = db.query(Contact).filter(
                        and_(
                            Contact.user_id == current_user.id,
                            Contact.email == contact_data.email
                        )
                    ).first()
                
                if existing_contact:
                    if import_data.overwrite_existing:
                        # Update existing contact
                        for field, value in contact_data.dict(exclude_unset=True).items():
                            setattr(existing_contact, field, value)
                        db.commit()
                        contact_ids.append(str(existing_contact.id))
                        imported += 1
                    else:
                        # Skip existing contact
                        skipped += 1
                        continue
                else:
                    # Create new contact
                    contact = Contact(
                        user_id=current_user.id,
                        name=contact_data.name,
                        email=contact_data.email,
                        phone=contact_data.phone,
                        company=contact_data.company,
                        role=contact_data.role,
                        preferred_language=contact_data.preferred_language,
                        preferred_channels=contact_data.preferred_channels,
                        notes=contact_data.notes,
                        tags=contact_data.tags or []
                    )
                    
                    db.add(contact)
                    db.commit()
                    db.refresh(contact)
                    contact_ids.append(str(contact.id))
                    imported += 1
                    
            except Exception as e:
                error_msg = f"Error importing {contact_data.name}: {str(e)}"
                errors.append(error_msg)
                logger.warning(error_msg)
                continue
        
        logger.info(f"Bulk import completed: {imported} imported, {skipped} skipped, {len(errors)} errors")
        
        return ContactImportResponse(
            imported=imported,
            skipped=skipped,
            errors=errors,
            contact_ids=contact_ids
        )
        
    except Exception as e:
        logger.error(f"Error during bulk import: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to import contacts"
        )


# Usage Tracking

@router.post("/contacts/{contact_id}/usage")
async def update_contact_usage(
    contact_id: str,
    usage_data: ContactUsageUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update contact usage statistics"""
    try:
        logger.info(f"Updating usage for contact {contact_id}")
        
        contact = db.query(Contact).filter(
            and_(
                Contact.id == contact_id,
                Contact.user_id == current_user.id
            )
        ).first()
        
        if not contact:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Contact not found"
            )
        
        # Update usage statistics
        contact.increment_usage(
            workflow_id=usage_data.workflow_id,
            document_title=usage_data.document_title
        )
        
        # Create usage log
        usage_log = ContactUsageLog(
            contact_id=contact.id,
            workflow_id=usage_data.workflow_id,
            document_title=usage_data.document_title,
            action="used_in_workflow"
        )
        
        db.add(usage_log)
        db.commit()
        
        logger.info(f"Usage updated for contact {contact_id}: count={contact.usage_count}")
        
        return {"status": "success", "usage_count": contact.usage_count}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating contact usage: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update contact usage"
        )


@router.get("/contacts/{contact_id}/usage")
async def get_contact_usage_history(
    contact_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get usage history for a contact"""
    try:
        contact = db.query(Contact).filter(
            and_(
                Contact.id == contact_id,
                Contact.user_id == current_user.id
            )
        ).first()
        
        if not contact:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Contact not found"
            )
        
        usage_logs = db.query(ContactUsageLog).filter(
            ContactUsageLog.contact_id == contact_id
        ).order_by(desc(ContactUsageLog.created_at)).limit(50).all()
        
        return {
            "contact_id": contact_id,
            "total_usage": contact.usage_count,
            "last_used": contact.last_used_at,
            "usage_history": [log.to_dict() for log in usage_logs]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching usage history: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch usage history"
        )


# Statistics

@router.get("/contacts/stats")
async def get_contact_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get contact statistics for the current user"""
    try:
        total_contacts = db.query(Contact).filter(Contact.user_id == current_user.id).count()
        
        # Most used contacts
        most_used = db.query(Contact).filter(Contact.user_id == current_user.id)\
                     .order_by(desc(Contact.usage_count))\
                     .limit(10).all()
        
        # Recently added
        recently_added = db.query(Contact).filter(Contact.user_id == current_user.id)\
                          .order_by(desc(Contact.created_at))\
                          .limit(10).all()
        
        # Tag distribution
        tag_stats = {}
        contacts_with_tags = db.query(Contact).filter(
            and_(
                Contact.user_id == current_user.id,
                Contact.tags != None,
                Contact.tags != []
            )
        ).all()
        
        for contact in contacts_with_tags:
            for tag in contact.tags or []:
                tag_stats[tag] = tag_stats.get(tag, 0) + 1
        
        return {
            "total_contacts": total_contacts,
            "most_used": [ContactResponse.from_orm(c) for c in most_used],
            "recently_added": [ContactResponse.from_orm(c) for c in recently_added],
            "tag_distribution": tag_stats,
            "total_usage": sum(c.usage_count for c in most_used)
        }
        
    except Exception as e:
        logger.error(f"Error fetching contact stats: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch contact statistics"
        )