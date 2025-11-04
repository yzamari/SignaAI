"""
Document Processing Service with OCR Integration
Handles document upload, OCR field detection, and image generation with overlays
"""

import os
import logging
import base64
import io
import json
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from pathlib import Path
import tempfile
import uuid

import pdf2image
from PIL import Image, ImageDraw, ImageFont
import httpx
import asyncio
from dataclasses import dataclass, asdict

# Load configuration from environment
from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

@dataclass
class DocumentField:
    """Represents a detected or manually added field on a document"""
    id: str
    type: str  # signature, date, text, initial, checkbox
    page: int
    x: float  # Absolute pixel coordinates
    y: float
    width: float
    height: float
    label: Optional[str] = None
    required: bool = True
    confidence: Optional[float] = None
    detected_by_ocr: bool = False
    signer_id: Optional[str] = None
    value: Optional[str] = None
    filled_at: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        data = asdict(self)
        if data.get('filled_at'):
            data['filled_at'] = data['filled_at'].isoformat()
        return data


class DocumentProcessingService:
    """
    Comprehensive document processing service that:
    1. Accepts PDF uploads
    2. Processes with OCR to detect fields
    3. Generates page images with overlays
    4. Stores everything in database
    5. Provides extensive logging
    """

    def __init__(self, ocr_service_url: str = None, storage_path: str = None):
        """Initialize document processing service"""
        # Read from environment variables
        self.ocr_service_url = ocr_service_url or os.getenv("OCR_SERVICE_URL", "http://localhost:5113")
        storage_path = storage_path or os.getenv("DOCUMENT_STORAGE_PATH")
        self.storage_path = Path(storage_path) if storage_path else Path(tempfile.gettempdir()) / "signaai_docs"
        self.storage_path.mkdir(parents=True, exist_ok=True)

        logger.info(f"📄 Document Processing Service initialized")
        logger.info(f"   OCR Service: {self.ocr_service_url}")
        logger.info(f"   Storage Path: {self.storage_path}")

    async def process_document(
        self,
        pdf_bytes: bytes,
        filename: str,
        user_id: str,
        workflow_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process a PDF document completely:
        1. Call OCR service for field detection
        2. Convert PDF to images
        3. Generate overlays
        4. Store everything

        Returns:
            Complete document data with fields, images, and overlays
        """
        start_time = datetime.now()
        document_id = workflow_id or str(uuid.uuid4())

        logger.info(f"🚀 Starting document processing for {filename}")
        logger.info(f"   Document ID: {document_id}")
        logger.info(f"   User ID: {user_id}")
        logger.info(f"   File size: {len(pdf_bytes)} bytes")

        try:
            # Step 1: OCR Field Detection
            logger.info("📋 Step 1: Detecting fields with OCR service...")
            ocr_result = await self._detect_fields_with_ocr(pdf_bytes, filename)

            # Step 2: Convert PDF to Images
            logger.info("🖼️ Step 2: Converting PDF to images...")
            page_images = self._convert_pdf_to_images(pdf_bytes)
            logger.info(f"   Generated {len(page_images)} page images")

            # Step 3: Process OCR Results and Create Fields
            logger.info("🔍 Step 3: Processing OCR results...")
            fields = self._process_ocr_results(ocr_result)
            logger.info(f"   Detected {len(fields)} fields from OCR")

            # Step 4: Generate Images with Overlays
            logger.info("🎨 Step 4: Generating overlay images...")
            overlay_images = self._generate_overlay_images(page_images, fields)

            # Step 5: Store Document Data
            logger.info("💾 Step 5: Storing document data...")
            document_data = await self._store_document_data(
                document_id=document_id,
                user_id=user_id,
                filename=filename,
                pdf_bytes=pdf_bytes,
                page_images=page_images,
                overlay_images=overlay_images,
                fields=fields,
                ocr_result=ocr_result
            )

            # Calculate processing time
            processing_time = (datetime.now() - start_time).total_seconds()

            # Prepare response
            result = {
                "document_id": document_id,
                "filename": filename,
                "status": "processed",
                "processing_time_seconds": processing_time,
                "total_pages": len(page_images),
                "total_fields": len(fields),
                "pages": [],
                "fields": [field.to_dict() for field in fields],
                "ocr_metadata": {
                    "service_url": self.ocr_service_url,
                    "processing_time_ms": ocr_result.get("processing_time_ms", 0),
                    "method": ocr_result.get("method", "OCR")
                }
            }

            # Add page data with images
            for i, (page_img, overlay_img) in enumerate(zip(page_images, overlay_images), 1):
                page_fields = [f for f in fields if f.page == i]
                result["pages"].append({
                    "page_number": i,
                    "width": page_img.width,
                    "height": page_img.height,
                    "original_image": self._image_to_base64(page_img),
                    "overlay_image": self._image_to_base64(overlay_img),
                    "fields_count": len(page_fields),
                    "field_ids": [f.id for f in page_fields]
                })

            logger.info(f"✅ Document processing completed in {processing_time:.2f} seconds")
            logger.info(f"   Pages: {len(page_images)}, Fields: {len(fields)}")

            return result

        except Exception as e:
            logger.error(f"❌ Document processing failed: {e}", exc_info=True)
            raise

    async def _detect_fields_with_ocr(self, pdf_bytes: bytes, filename: str) -> Dict[str, Any]:
        """Call OCR service to detect fields"""
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                files = {"file": (filename, pdf_bytes, "application/pdf")}

                logger.info(f"   Calling OCR service at {self.ocr_service_url}/detect-fields")
                response = await client.post(
                    f"{self.ocr_service_url}/detect-fields",
                    files=files
                )

                if response.status_code != 200:
                    logger.error(f"   OCR service returned {response.status_code}")
                    return {"analysis_results": [], "error": f"OCR service error: {response.status_code}"}

                data = response.json()
                logger.info(f"   OCR service returned {data.get('total_fields', 0)} fields")
                return data

        except Exception as e:
            logger.error(f"   OCR service call failed: {e}")
            return {"analysis_results": [], "error": str(e)}

    def _convert_pdf_to_images(self, pdf_bytes: bytes, dpi: int = 200) -> List[Image.Image]:
        """Convert PDF pages to PIL images"""
        try:
            images = pdf2image.convert_from_bytes(pdf_bytes, dpi=dpi)
            logger.info(f"   Converted PDF to {len(images)} images at {dpi} DPI")
            return images
        except Exception as e:
            logger.error(f"   PDF to image conversion failed: {e}")
            raise

    def _process_ocr_results(self, ocr_result: Dict[str, Any]) -> List[DocumentField]:
        """Process OCR results into DocumentField objects"""
        fields = []

        for page_data in ocr_result.get("analysis_results", []):
            page_num = page_data.get("page", 1)

            for field_data in page_data.get("fields", []):
                # Extract bounding box
                bbox = field_data.get("bounding_box", {})
                if not all(k in bbox for k in ["x", "y", "width", "height"]):
                    continue

                field = DocumentField(
                    id=f"ocr-{page_num}-{len(fields)}",
                    type=field_data.get("type", "text"),
                    page=page_num,
                    x=float(bbox["x"]),
                    y=float(bbox["y"]),
                    width=float(bbox["width"]),
                    height=float(bbox["height"]),
                    label=field_data.get("label"),
                    confidence=field_data.get("confidence", 0.5),
                    detected_by_ocr=True
                )
                fields.append(field)

                logger.debug(f"   Field {field.id}: {field.type} at ({field.x}, {field.y})")

        return fields

    def _generate_overlay_images(
        self,
        page_images: List[Image.Image],
        fields: List[DocumentField]
    ) -> List[Image.Image]:
        """Generate images with field overlays"""
        overlay_images = []

        for page_num, page_img in enumerate(page_images, 1):
            # Create a copy for overlay
            overlay_img = page_img.copy()
            draw = ImageDraw.Draw(overlay_img, 'RGBA')

            # Get fields for this page
            page_fields = [f for f in fields if f.page == page_num]

            for field in page_fields:
                # Draw field rectangle
                color = self._get_field_color(field.type)
                x1, y1 = field.x, field.y
                x2, y2 = field.x + field.width, field.y + field.height

                # Draw semi-transparent fill
                draw.rectangle(
                    [(x1, y1), (x2, y2)],
                    outline=color,
                    fill=(*color, 50),  # Add transparency
                    width=2
                )

                # Add field label if available
                if field.label:
                    # Try to load a font, fall back to default if not available
                    try:
                        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 14)
                    except:
                        font = ImageFont.load_default()

                    # Draw label background
                    label_bbox = draw.textbbox((x1, y1 - 20), field.label, font=font)
                    draw.rectangle(label_bbox, fill=(*color, 200))
                    draw.text((x1, y1 - 20), field.label, fill=(255, 255, 255), font=font)

            overlay_images.append(overlay_img)
            logger.info(f"   Generated overlay for page {page_num} with {len(page_fields)} fields")

        return overlay_images

    def _get_field_color(self, field_type: str) -> Tuple[int, int, int]:
        """Get color for field type"""
        color_map = {
            'signature': (0, 0, 255),      # Blue
            'initial': (0, 128, 255),       # Light Blue
            'date': (255, 165, 0),          # Orange
            'text': (0, 255, 0),            # Green
            'checkbox': (128, 0, 128),     # Purple
            'name': (255, 0, 255),          # Magenta
            'email': (255, 255, 0),         # Yellow
            'phone': (0, 255, 255)          # Cyan
        }
        return color_map.get(field_type, (128, 128, 128))  # Gray default

    def _image_to_base64(self, image: Image.Image) -> str:
        """Convert PIL image to base64 string"""
        buffer = io.BytesIO()
        image.save(buffer, format='PNG')
        buffer.seek(0)
        return f"data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode()}"

    async def _store_document_data(
        self,
        document_id: str,
        user_id: str,
        filename: str,
        pdf_bytes: bytes,
        page_images: List[Image.Image],
        overlay_images: List[Image.Image],
        fields: List[DocumentField],
        ocr_result: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Store document data to filesystem and prepare for database"""

        # Create document directory
        doc_dir = self.storage_path / document_id
        doc_dir.mkdir(parents=True, exist_ok=True)

        # Store original PDF
        pdf_path = doc_dir / "original.pdf"
        pdf_path.write_bytes(pdf_bytes)
        logger.info(f"   Saved original PDF: {pdf_path}")

        # Store page images
        for i, (orig_img, overlay_img) in enumerate(zip(page_images, overlay_images), 1):
            orig_path = doc_dir / f"page_{i:03d}_original.png"
            overlay_path = doc_dir / f"page_{i:03d}_overlay.png"

            orig_img.save(orig_path)
            overlay_img.save(overlay_path)

            logger.info(f"   Saved page {i} images")

        # Store fields data
        fields_data = {
            "document_id": document_id,
            "user_id": user_id,
            "filename": filename,
            "created_at": datetime.now().isoformat(),
            "total_pages": len(page_images),
            "fields": [field.to_dict() for field in fields],
            "ocr_result": ocr_result
        }

        fields_path = doc_dir / "fields.json"
        fields_path.write_text(json.dumps(fields_data, indent=2))
        logger.info(f"   Saved fields data: {fields_path}")

        return fields_data

    async def update_field(
        self,
        document_id: str,
        field_id: str,
        updates: Dict[str, Any]
    ) -> DocumentField:
        """Update a field (position, type, label, etc.)"""
        logger.info(f"📝 Updating field {field_id} in document {document_id}")
        logger.info(f"   Updates: {updates}")

        # Load current fields
        doc_dir = self.storage_path / document_id
        fields_path = doc_dir / "fields.json"

        if not fields_path.exists():
            raise FileNotFoundError(f"Document {document_id} not found")

        fields_data = json.loads(fields_path.read_text())

        # Find and update field
        field_found = False
        for field_dict in fields_data["fields"]:
            if field_dict["id"] == field_id:
                field_dict.update(updates)
                field_found = True
                logger.info(f"   Field updated: {field_dict}")
                break

        if not field_found:
            raise ValueError(f"Field {field_id} not found")

        # Save updated fields
        fields_path.write_text(json.dumps(fields_data, indent=2))

        # Regenerate overlay image for affected page
        # TODO: Implement overlay regeneration

        return DocumentField(**field_dict)

    async def add_field(
        self,
        document_id: str,
        field_data: Dict[str, Any]
    ) -> DocumentField:
        """Add a new field to document"""
        logger.info(f"➕ Adding new field to document {document_id}")
        logger.info(f"   Field data: {field_data}")

        # Generate field ID
        field_id = f"manual-{str(uuid.uuid4())[:8]}"
        field_data["id"] = field_id
        field_data["detected_by_ocr"] = False

        # Create DocumentField
        field = DocumentField(**field_data)

        # Load and update fields data
        doc_dir = self.storage_path / document_id
        fields_path = doc_dir / "fields.json"

        if not fields_path.exists():
            raise FileNotFoundError(f"Document {document_id} not found")

        fields_data = json.loads(fields_path.read_text())
        fields_data["fields"].append(field.to_dict())

        # Save updated fields
        fields_path.write_text(json.dumps(fields_data, indent=2))
        logger.info(f"   Added field {field_id}")

        # TODO: Regenerate overlay image for affected page

        return field

    async def remove_field(self, document_id: str, field_id: str) -> bool:
        """Remove a field from document"""
        logger.info(f"➖ Removing field {field_id} from document {document_id}")

        # Load fields data
        doc_dir = self.storage_path / document_id
        fields_path = doc_dir / "fields.json"

        if not fields_path.exists():
            raise FileNotFoundError(f"Document {document_id} not found")

        fields_data = json.loads(fields_path.read_text())

        # Remove field
        original_count = len(fields_data["fields"])
        fields_data["fields"] = [
            f for f in fields_data["fields"]
            if f["id"] != field_id
        ]

        if len(fields_data["fields"]) == original_count:
            logger.warning(f"   Field {field_id} not found")
            return False

        # Save updated fields
        fields_path.write_text(json.dumps(fields_data, indent=2))
        logger.info(f"   Removed field {field_id}")

        # TODO: Regenerate overlay image for affected page

        return True

    async def get_document_data(self, document_id: str) -> Dict[str, Any]:
        """Get complete document data"""
        logger.info(f"📖 Loading document {document_id}")

        doc_dir = self.storage_path / document_id
        fields_path = doc_dir / "fields.json"

        if not fields_path.exists():
            raise FileNotFoundError(f"Document {document_id} not found")

        # Load fields data
        fields_data = json.loads(fields_path.read_text())

        # Load images
        pages = []
        page_num = 1
        while True:
            orig_path = doc_dir / f"page_{page_num:03d}_original.png"
            overlay_path = doc_dir / f"page_{page_num:03d}_overlay.png"

            if not orig_path.exists():
                break

            orig_img = Image.open(orig_path)
            overlay_img = Image.open(overlay_path)

            pages.append({
                "page_number": page_num,
                "original_image": self._image_to_base64(orig_img),
                "overlay_image": self._image_to_base64(overlay_img),
                "width": orig_img.width,
                "height": orig_img.height
            })

            page_num += 1

        fields_data["pages"] = pages
        logger.info(f"   Loaded {len(pages)} pages with {len(fields_data['fields'])} fields")

        return fields_data


# Global service instance
document_processing_service = DocumentProcessingService()