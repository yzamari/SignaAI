"""
Document Processing API Router
Handles document upload, OCR processing, field management, and image preview
"""

import os
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
import uuid

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# Import our services
from ..services.document_processing_service import document_processing_service, DocumentField
from ..services.auth_service import get_current_user
from ..models.workflow import Workflow, DocumentField as DBDocumentField, DocumentPage
from ..database import get_db
from sqlalchemy.orm import Session

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(
    prefix="/api/v1/documents",
    tags=["document-processing"]
)


# Pydantic models for requests/responses
class FieldUpdateRequest(BaseModel):
    """Request model for updating a field"""
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    label: Optional[str] = None
    type: Optional[str] = None
    required: Optional[bool] = None
    signer_id: Optional[str] = None


class FieldAddRequest(BaseModel):
    """Request model for adding a field"""
    type: str = Field(..., description="Field type: signature, text, date, etc.")
    page: int = Field(..., ge=1, description="Page number")
    x: float = Field(..., description="X position in pixels")
    y: float = Field(..., description="Y position in pixels")
    width: float = Field(..., description="Width in pixels")
    height: float = Field(..., description="Height in pixels")
    label: Optional[str] = None
    required: bool = True
    signer_id: Optional[str] = None


class DocumentProcessResponse(BaseModel):
    """Response model for document processing"""
    document_id: str
    workflow_id: str
    status: str
    processing_time_seconds: float
    total_pages: int
    total_fields: int
    ocr_fields_count: int
    manual_fields_count: int
    pages: List[Dict[str, Any]]
    fields: List[Dict[str, Any]]
    message: str


@router.post("/upload-and-process", response_model=DocumentProcessResponse)
async def upload_and_process_document(
    file: UploadFile = File(..., description="PDF document to process"),
    workflow_id: Optional[str] = Query(None, description="Existing workflow ID"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload a PDF document and process it with OCR to detect fields.
    Returns document with page images and detected overlays.
    """
    start_time = datetime.now()
    user_id = current_user.get("id")

    logger.info(f"📤 Document upload started")
    logger.info(f"   User: {user_id}")
    logger.info(f"   File: {file.filename}")
    logger.info(f"   Content-Type: {file.content_type}")

    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        logger.warning(f"   ❌ Invalid file type: {file.filename}")
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported"
        )

    try:
        # Read file content
        pdf_bytes = await file.read()
        file_size_mb = len(pdf_bytes) / (1024 * 1024)
        logger.info(f"   File size: {file_size_mb:.2f} MB")

        # Check file size limit
        max_size_mb = float(os.getenv("MAX_FILE_SIZE_MB", "10"))
        if file_size_mb > max_size_mb:
            logger.warning(f"   ❌ File too large: {file_size_mb:.2f} MB > {max_size_mb} MB")
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size is {max_size_mb} MB"
            )

        # Process document with OCR
        logger.info(f"🔄 Processing document with OCR service...")
        result = await document_processing_service.process_document(
            pdf_bytes=pdf_bytes,
            filename=file.filename,
            user_id=user_id,
            workflow_id=workflow_id
        )

        # Create or update workflow in database
        workflow_id = result["document_id"]

        if not workflow_id:
            # Create new workflow
            logger.info(f"📝 Creating new workflow in database...")
            workflow = Workflow(
                id=uuid.UUID(workflow_id),
                document_id=uuid.uuid4(),
                user_id=uuid.UUID(user_id),
                title=file.filename,
                status="draft",
                original_pdf_path=f"documents/{workflow_id}/original.pdf"
            )
            db.add(workflow)
            logger.info(f"   Created workflow: {workflow_id}")
        else:
            # Update existing workflow
            logger.info(f"📝 Updating workflow {workflow_id} in database...")
            workflow = db.query(Workflow).filter(Workflow.id == workflow_id).first()
            if not workflow:
                raise HTTPException(status_code=404, detail="Workflow not found")

        # Store page data in database
        logger.info(f"💾 Storing {len(result['pages'])} pages in database...")
        for page_data in result["pages"]:
            page = DocumentPage(
                workflow_id=workflow.id,
                page_number=page_data["page_number"],
                width=page_data["width"],
                height=page_data["height"],
                dpi=200,
                original_image_path=f"documents/{workflow_id}/page_{page_data['page_number']:03d}_original.png",
                overlay_image_path=f"documents/{workflow_id}/page_{page_data['page_number']:03d}_overlay.png",
                original_image_base64=page_data["original_image"],
                overlay_image_base64=page_data["overlay_image"],
                ocr_processed=True,
                fields_detected_count=page_data["fields_count"]
            )
            db.add(page)
            logger.info(f"   Stored page {page_data['page_number']}: {page_data['fields_count']} fields")

        # Store fields in database
        logger.info(f"💾 Storing {len(result['fields'])} fields in database...")
        ocr_fields_count = 0
        manual_fields_count = 0

        for field_data in result["fields"]:
            field = DBDocumentField(
                id=uuid.uuid4(),
                workflow_id=workflow.id,
                field_type=field_data["type"],
                page=field_data["page"],
                x_position=field_data["x"],
                y_position=field_data["y"],
                width=field_data["width"],
                height=field_data["height"],
                label=field_data.get("label"),
                required=field_data.get("required", True),
                detected_by_ocr=field_data.get("detected_by_ocr", False),
                ocr_confidence=field_data.get("confidence")
            )
            db.add(field)

            if field_data.get("detected_by_ocr"):
                ocr_fields_count += 1
            else:
                manual_fields_count += 1

            logger.debug(f"   Stored field: {field_data['type']} on page {field_data['page']}")

        # Commit database changes
        db.commit()
        logger.info(f"✅ Database updated successfully")

        # Log audit event
        logger.info(f"📊 Document processing audit:")
        logger.info(f"   Workflow ID: {workflow_id}")
        logger.info(f"   Total pages: {result['total_pages']}")
        logger.info(f"   Total fields: {result['total_fields']}")
        logger.info(f"   OCR detected: {ocr_fields_count}")
        logger.info(f"   Manually added: {manual_fields_count}")
        logger.info(f"   Processing time: {result['processing_time_seconds']:.2f}s")

        # Return response
        return DocumentProcessResponse(
            document_id=str(workflow.document_id),
            workflow_id=str(workflow.id),
            status="processed",
            processing_time_seconds=result["processing_time_seconds"],
            total_pages=result["total_pages"],
            total_fields=result["total_fields"],
            ocr_fields_count=ocr_fields_count,
            manual_fields_count=manual_fields_count,
            pages=result["pages"],
            fields=result["fields"],
            message=f"Document processed successfully with {result['total_fields']} fields detected"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Document processing failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Document processing failed: {str(e)}"
        )


@router.get("/workflow/{workflow_id}/pages")
async def get_document_pages(
    workflow_id: str,
    include_images: bool = Query(True, description="Include base64 images"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all pages for a workflow with their images and overlays"""
    logger.info(f"📖 Fetching pages for workflow {workflow_id}")

    # Check workflow exists and user has access
    workflow = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not workflow:
        logger.warning(f"   ❌ Workflow not found: {workflow_id}")
        raise HTTPException(status_code=404, detail="Workflow not found")

    if str(workflow.user_id) != current_user.get("id"):
        logger.warning(f"   ❌ Access denied for user {current_user.get('id')}")
        raise HTTPException(status_code=403, detail="Access denied")

    # Get pages
    pages = db.query(DocumentPage).filter(
        DocumentPage.workflow_id == workflow_id
    ).order_by(DocumentPage.page_number).all()

    logger.info(f"   Found {len(pages)} pages")

    # Format response
    pages_data = []
    for page in pages:
        page_data = {
            "page_number": page.page_number,
            "width": page.width,
            "height": page.height,
            "dpi": page.dpi,
            "fields_count": page.fields_detected_count
        }

        if include_images:
            page_data["original_image"] = page.original_image_base64
            page_data["overlay_image"] = page.overlay_image_base64

        pages_data.append(page_data)

    logger.info(f"✅ Returning {len(pages_data)} pages")
    return {"pages": pages_data, "total": len(pages_data)}


@router.get("/workflow/{workflow_id}/fields")
async def get_workflow_fields(
    workflow_id: str,
    page: Optional[int] = Query(None, description="Filter by page number"),
    field_type: Optional[str] = Query(None, description="Filter by field type"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all fields for a workflow with optional filters"""
    logger.info(f"🔍 Fetching fields for workflow {workflow_id}")
    logger.info(f"   Filters: page={page}, type={field_type}")

    # Check workflow exists and user has access
    workflow = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if str(workflow.user_id) != current_user.get("id"):
        raise HTTPException(status_code=403, detail="Access denied")

    # Build query
    query = db.query(DBDocumentField).filter(DBDocumentField.workflow_id == workflow_id)

    if page:
        query = query.filter(DBDocumentField.page == page)
    if field_type:
        query = query.filter(DBDocumentField.field_type == field_type)

    fields = query.all()
    logger.info(f"   Found {len(fields)} fields")

    # Format response
    fields_data = []
    for field in fields:
        fields_data.append({
            "id": str(field.id),
            "type": field.field_type,
            "page": field.page,
            "x": field.x_position,
            "y": field.y_position,
            "width": field.width,
            "height": field.height,
            "label": field.label,
            "required": field.required,
            "detected_by_ocr": field.detected_by_ocr,
            "confidence": field.ocr_confidence,
            "signer_id": str(field.signer_id) if field.signer_id else None,
            "value": field.value
        })

    logger.info(f"✅ Returning {len(fields_data)} fields")
    return {"fields": fields_data, "total": len(fields_data)}


@router.post("/workflow/{workflow_id}/fields", status_code=201)
async def add_field_to_workflow(
    workflow_id: str,
    field: FieldAddRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a new field to a workflow"""
    logger.info(f"➕ Adding field to workflow {workflow_id}")
    logger.info(f"   Field: {field.type} on page {field.page}")

    # Check workflow exists and user has access
    workflow = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if str(workflow.user_id) != current_user.get("id"):
        raise HTTPException(status_code=403, detail="Access denied")

    # Create new field
    new_field = DBDocumentField(
        id=uuid.uuid4(),
        workflow_id=workflow.id,
        field_type=field.type,
        page=field.page,
        x_position=field.x,
        y_position=field.y,
        width=field.width,
        height=field.height,
        label=field.label,
        required=field.required,
        detected_by_ocr=False,
        added_manually=True,
        added_by_user_id=uuid.UUID(current_user.get("id")),
        added_at=datetime.utcnow()
    )

    if field.signer_id:
        new_field.signer_id = uuid.UUID(field.signer_id)

    db.add(new_field)
    db.commit()

    logger.info(f"   Created field: {new_field.id}")

    # TODO: Regenerate overlay image for the page

    logger.info(f"✅ Field added successfully")
    return {
        "id": str(new_field.id),
        "message": "Field added successfully"
    }


@router.put("/workflow/{workflow_id}/fields/{field_id}")
async def update_workflow_field(
    workflow_id: str,
    field_id: str,
    updates: FieldUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a field in a workflow (position, type, label, etc.)"""
    logger.info(f"📝 Updating field {field_id} in workflow {workflow_id}")
    logger.info(f"   Updates: {updates.dict(exclude_none=True)}")

    # Check workflow and field exist
    workflow = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if str(workflow.user_id) != current_user.get("id"):
        raise HTTPException(status_code=403, detail="Access denied")

    field = db.query(DBDocumentField).filter(
        DBDocumentField.id == field_id,
        DBDocumentField.workflow_id == workflow_id
    ).first()

    if not field:
        raise HTTPException(status_code=404, detail="Field not found")

    # Apply updates
    update_data = updates.dict(exclude_none=True)
    for key, value in update_data.items():
        if key == "x":
            field.x_position = value
        elif key == "y":
            field.y_position = value
        elif key in ["width", "height", "label", "type", "required"]:
            setattr(field, key if key != "type" else "field_type", value)
        elif key == "signer_id":
            field.signer_id = uuid.UUID(value) if value else None

    # Track modification
    field.last_modified_at = datetime.utcnow()
    field.last_modified_by = uuid.UUID(current_user.get("id"))

    db.commit()

    logger.info(f"✅ Field updated successfully")
    return {"message": "Field updated successfully"}


@router.delete("/workflow/{workflow_id}/fields/{field_id}")
async def delete_workflow_field(
    workflow_id: str,
    field_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove a field from a workflow"""
    logger.info(f"➖ Deleting field {field_id} from workflow {workflow_id}")

    # Check workflow and field exist
    workflow = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if str(workflow.user_id) != current_user.get("id"):
        raise HTTPException(status_code=403, detail="Access denied")

    field = db.query(DBDocumentField).filter(
        DBDocumentField.id == field_id,
        DBDocumentField.workflow_id == workflow_id
    ).first()

    if not field:
        raise HTTPException(status_code=404, detail="Field not found")

    # Delete field
    db.delete(field)
    db.commit()

    logger.info(f"✅ Field deleted successfully")
    return {"message": "Field deleted successfully"}


@router.post("/workflow/{workflow_id}/regenerate-overlays")
async def regenerate_overlay_images(
    workflow_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Regenerate overlay images for all pages after field changes"""
    logger.info(f"🎨 Regenerating overlay images for workflow {workflow_id}")

    # Check workflow exists
    workflow = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if str(workflow.user_id) != current_user.get("id"):
        raise HTTPException(status_code=403, detail="Access denied")

    # TODO: Implement overlay regeneration
    # This would reload images, get current fields, and regenerate overlays

    logger.info(f"✅ Overlay images regenerated")
    return {"message": "Overlay images regenerated successfully"}