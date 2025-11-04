"""
Document processing service with security scanning, validation, and metadata extraction
Handles file type validation, virus scanning, metadata extraction, and processing
"""

import asyncio
import base64
import hashlib
import io
import json
import logging
import mimetypes
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, BinaryIO, Dict, List, Optional, Tuple

from pdf2image import convert_from_bytes  # Poppler-based PDF processing (replaces PyMuPDF)
import magic  # python-magic for file type detection
from docx import Document as DocxDocument
from PIL import Image
from sqlalchemy.orm import Session

from core.config import settings
from models.document import Document, DocumentStatus
from services.storage import storage_service

logger = logging.getLogger(__name__)


class FileValidationError(Exception):
    """Custom exception for file validation errors"""

    pass


class SecurityScanError(Exception):
    """Custom exception for security scan errors"""

    pass


class DocumentProcessingService:
    """Service for document processing, validation, and security scanning"""

    # Allowed MIME types for document upload
    ALLOWED_MIME_TYPES = {
        "application/pdf": [".pdf"],
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
        "application/msword": [".doc"],
        "image/jpeg": [".jpg", ".jpeg"],
        "image/png": [".png"],
        "image/tiff": [".tiff", ".tif"],
        "image/bmp": [".bmp"],
        "image/webp": [".webp"],
    }

    # Maximum file size per type (in bytes)
    MAX_FILE_SIZES = {
        "application/pdf": 50 * 1024 * 1024,  # 50MB for PDF
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": 25 * 1024 * 1024,  # 25MB for DOCX
        "application/msword": 25 * 1024 * 1024,  # 25MB for DOC
        "image/jpeg": 10 * 1024 * 1024,  # 10MB for images
        "image/png": 10 * 1024 * 1024,
        "image/tiff": 15 * 1024 * 1024,
        "image/bmp": 10 * 1024 * 1024,
        "image/webp": 10 * 1024 * 1024,
    }

    def __init__(self):
        self.magic_mime = magic.Magic(mime=True)
        self.magic_type = magic.Magic()

    async def validate_file(
        self, file_data: BinaryIO, filename: str, declared_content_type: str
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Comprehensive file validation including type detection, size limits, and security checks

        Args:
            file_data: File data stream
            filename: Original filename
            declared_content_type: Content type declared by client

        Returns:
            Tuple of (actual_mime_type, validation_metadata)

        Raises:
            FileValidationError: If file validation fails
        """
        try:
            # Reset file pointer
            file_data.seek(0)
            file_content = file_data.read()
            file_size = len(file_content)

            # Detect actual file type using magic numbers
            actual_mime_type = self.magic_mime.from_buffer(file_content)
            file_description = self.magic_type.from_buffer(file_content)

            logger.info(f"File validation: {filename}, declared: {declared_content_type}, actual: {actual_mime_type}")

            # Validate file type is allowed
            if actual_mime_type not in self.ALLOWED_MIME_TYPES:
                raise FileValidationError(
                    f"File type '{actual_mime_type}' not allowed. "
                    f"Supported types: {list(self.ALLOWED_MIME_TYPES.keys())}"
                )

            # Check file extension matches content type
            file_ext = Path(filename).suffix.lower()
            allowed_extensions = self.ALLOWED_MIME_TYPES[actual_mime_type]
            if file_ext not in allowed_extensions:
                raise FileValidationError(
                    f"File extension '{file_ext}' does not match content type '{actual_mime_type}'. "
                    f"Expected extensions: {allowed_extensions}"
                )

            # Validate file size
            max_size = self.MAX_FILE_SIZES.get(actual_mime_type, settings.MAX_FILE_SIZE)
            if file_size > max_size:
                raise FileValidationError(
                    f"File size {file_size:,} bytes exceeds maximum allowed size "
                    f"{max_size:,} bytes for type '{actual_mime_type}'"
                )

            # Validate file is not empty
            if file_size == 0:
                raise FileValidationError("File is empty")

            # Perform content-specific validation
            file_data.seek(0)
            content_validation = await self._validate_file_content(file_data, actual_mime_type, filename)

            # Calculate file hash for integrity
            file_hash = hashlib.sha256(file_content).hexdigest()

            validation_metadata = {
                "file_size": file_size,
                "file_hash": file_hash,
                "actual_mime_type": actual_mime_type,
                "declared_mime_type": declared_content_type,
                "file_description": file_description,
                "file_extension": file_ext,
                "validation_passed": True,
                "validation_timestamp": datetime.utcnow().isoformat(),
                **content_validation,
            }

            # Reset file pointer for further processing
            file_data.seek(0)

            return actual_mime_type, validation_metadata

        except Exception as e:
            logger.error(f"File validation failed for {filename}: {str(e)}")
            if isinstance(e, FileValidationError):
                raise
            raise FileValidationError(f"File validation failed: {str(e)}")

    async def _validate_file_content(self, file_data: BinaryIO, mime_type: str, filename: str) -> Dict[str, Any]:
        """
        Perform content-specific validation based on file type

        Args:
            file_data: File data stream
            mime_type: Detected MIME type
            filename: Original filename

        Returns:
            Dict containing content validation results
        """
        try:
            if mime_type == "application/pdf":
                return await self._validate_pdf_content(file_data)
            elif mime_type in ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]:
                return await self._validate_docx_content(file_data)
            elif mime_type.startswith("image/"):
                return await self._validate_image_content(file_data, mime_type)
            else:
                return {"content_validation": "unsupported"}

        except Exception as e:
            logger.warning(f"Content validation failed for {filename}: {str(e)}")
            return {"content_validation": "failed", "content_error": str(e)}

    def extract_pdf_text(self, pdf_bytes: bytes) -> str:
        """
        Extract full text content from a PDF document
        
        Args:
            pdf_bytes: PDF document as bytes
            
        Returns:
            Extracted text content as string
        """
        try:
            import fitz  # PyMuPDF
            
            pdf_document = fitz.open(stream=pdf_bytes, filetype="pdf")
            full_text = ""
            
            for page_num in range(pdf_document.page_count):
                page = pdf_document[page_num]
                page_text = page.get_text()
                full_text += f"--- Page {page_num + 1} ---\n{page_text}\n"
            
            pdf_document.close()
            return full_text.strip()
            
        except Exception as e:
            logger.error(f"Failed to extract PDF text: {str(e)}")
            # Fallback to OCR if text extraction fails
            return self.extract_pdf_text_with_ocr(pdf_bytes)
    
    def extract_pdf_text_with_ocr(self, pdf_bytes: bytes) -> str:
        """
        Extract text from PDF using OCR (for scanned documents)
        
        Args:
            pdf_bytes: PDF document as bytes
            
        Returns:
            OCR-extracted text content
        """
        try:
            import pytesseract
            from pdf2image import convert_from_bytes
            
            # Convert PDF pages to images
            images = convert_from_bytes(pdf_bytes, dpi=200)
            full_text = ""
            
            for i, image in enumerate(images):
                # Use Tesseract OCR to extract text
                # Support for Hebrew and Arabic languages
                page_text = pytesseract.image_to_string(
                    image, 
                    lang='eng+heb+ara'  # English, Hebrew, Arabic
                )
                full_text += f"--- Page {i + 1} ---\n{page_text}\n"
            
            return full_text.strip()
            
        except Exception as e:
            logger.error(f"OCR extraction failed: {str(e)}")
            return ""

    async def _validate_pdf_content(self, file_data: BinaryIO) -> Dict[str, Any]:
        """Validate PDF file content and extract metadata"""
        try:
            file_data.seek(0)
            pdf_document = fitz.open(stream=file_data.read(), filetype="pdf")

            page_count = pdf_document.page_count
            if page_count == 0:
                raise FileValidationError("PDF contains no pages")

            # Extract basic metadata
            metadata = pdf_document.metadata

            # Check for password protection
            is_encrypted = pdf_document.is_encrypted
            if is_encrypted:
                raise FileValidationError("Password-protected PDFs are not supported")

            # Detect language from text content (sample first few pages)
            detected_language = None
            text_sample = ""

            for page_num in range(min(3, page_count)):  # Sample first 3 pages
                page = pdf_document[page_num]
                page_text = page.get_text()
                text_sample += page_text[:500]  # First 500 chars per page

            if text_sample.strip():
                detected_language = self._detect_language(text_sample)

            pdf_document.close()

            return {
                "content_validation": "passed",
                "page_count": page_count,
                "is_encrypted": is_encrypted,
                "detected_language": detected_language,
                "pdf_metadata": {
                    "title": metadata.get("title", ""),
                    "author": metadata.get("author", ""),
                    "creator": metadata.get("creator", ""),
                    "producer": metadata.get("producer", ""),
                    "creation_date": metadata.get("creationDate", ""),
                    "modification_date": metadata.get("modDate", ""),
                },
                "text_sample": text_sample[:200] if text_sample else None,
            }

        except Exception as e:
            if isinstance(e, FileValidationError):
                raise
            raise FileValidationError(f"PDF validation failed: {str(e)}")

    async def _validate_docx_content(self, file_data: BinaryIO) -> Dict[str, Any]:
        """Validate DOCX file content and extract metadata"""
        try:
            file_data.seek(0)

            # Check if it's a valid ZIP file (DOCX is a ZIP archive)
            try:
                with zipfile.ZipFile(file_data, "r") as zip_file:
                    zip_files = zip_file.namelist()
                    # Check for required DOCX files
                    required_files = ["[Content_Types].xml", "word/document.xml"]
                    if not all(req_file in zip_files for req_file in required_files):
                        raise FileValidationError("Invalid DOCX file structure")
            except zipfile.BadZipFile:
                raise FileValidationError("DOCX file is corrupted or invalid")

            # Reset and parse document
            file_data.seek(0)
            try:
                doc = DocxDocument(file_data)
            except Exception as e:
                raise FileValidationError(f"Failed to parse DOCX: {str(e)}")

            # Extract text content for language detection
            text_content = ""
            paragraph_count = 0
            for paragraph in doc.paragraphs:
                if paragraph.text.strip():
                    text_content += paragraph.text + " "
                    paragraph_count += 1
                if len(text_content) > 1000:  # Limit sample size
                    break

            detected_language = None
            if text_content.strip():
                detected_language = self._detect_language(text_content)

            # Extract core properties
            props = doc.core_properties

            return {
                "content_validation": "passed",
                "page_count": 1,  # DOCX doesn't have fixed pages
                "paragraph_count": paragraph_count,
                "detected_language": detected_language,
                "docx_metadata": {
                    "title": props.title or "",
                    "author": props.author or "",
                    "creator": props.creator or "",
                    "created": props.created.isoformat() if props.created else None,
                    "modified": props.modified.isoformat() if props.modified else None,
                    "subject": props.subject or "",
                    "category": props.category or "",
                },
                "text_sample": text_content[:200] if text_content else None,
            }

        except Exception as e:
            if isinstance(e, FileValidationError):
                raise
            raise FileValidationError(f"DOCX validation failed: {str(e)}")

    async def _validate_image_content(self, file_data: BinaryIO, mime_type: str) -> Dict[str, Any]:
        """Validate image file content and extract metadata"""
        try:
            file_data.seek(0)

            with Image.open(file_data) as img:
                # Validate image can be opened
                img.verify()

                # Reset and reopen for metadata extraction
                file_data.seek(0)
                with Image.open(file_data) as img:
                    width, height = img.size
                    format_name = img.format
                    mode = img.mode

                    # Check minimum size requirements
                    if width < 100 or height < 100:
                        raise FileValidationError("Image too small (minimum 100x100 pixels)")

                    # Check maximum size requirements
                    if width > 10000 or height > 10000:
                        raise FileValidationError("Image too large (maximum 10000x10000 pixels)")

                    # Extract EXIF data if available
                    exif_data = {}
                    if hasattr(img, "_getexif") and img._getexif() is not None:
                        exif = img._getexif()
                        if exif:
                            for tag_id, value in exif.items():
                                try:
                                    tag_name = Image.ExifTags.TAGS.get(tag_id, tag_id)
                                    if isinstance(value, (str, int, float)):
                                        exif_data[str(tag_name)] = value
                                except:
                                    continue

                    return {
                        "content_validation": "passed",
                        "page_count": 1,
                        "image_metadata": {
                            "width": width,
                            "height": height,
                            "format": format_name,
                            "mode": mode,
                            "has_transparency": mode in ("RGBA", "LA") or "transparency" in img.info,
                        },
                        "exif_data": exif_data if exif_data else None,
                        "detected_language": None,  # Images don't have text language
                    }

        except Exception as e:
            if isinstance(e, FileValidationError):
                raise
            raise FileValidationError(f"Image validation failed: {str(e)}")

    def _detect_language(self, text_sample: str) -> Optional[str]:
        """
        Simple language detection based on character patterns
        For production, consider using langdetect or similar libraries
        """
        if not text_sample or len(text_sample.strip()) < 10:
            return None

        # Count character types
        arabic_chars = sum(1 for c in text_sample if "\u0600" <= c <= "\u06FF")
        hebrew_chars = sum(1 for c in text_sample if "\u0590" <= c <= "\u05FF")
        latin_chars = sum(1 for c in text_sample if c.isalpha() and ord(c) < 256)

        total_chars = len([c for c in text_sample if c.isalpha()])

        if total_chars < 10:
            return None

        # Calculate percentages
        if arabic_chars / total_chars > 0.3:
            return "ar"
        elif hebrew_chars / total_chars > 0.3:
            return "he"
        elif latin_chars / total_chars > 0.7:
            return "en"
        else:
            return "mixed"

    async def perform_security_scan(self, file_data: BinaryIO, filename: str) -> Dict[str, Any]:
        """
        Perform basic security scanning on uploaded files
        In production, integrate with ClamAV or similar antivirus solutions

        Args:
            file_data: File data stream
            filename: Original filename

        Returns:
            Dict containing scan results
        """
        try:
            file_data.seek(0)
            file_content = file_data.read()

            # Basic security checks
            scan_results = {
                "scan_timestamp": datetime.utcnow().isoformat(),
                "scan_status": "clean",
                "threats_detected": [],
                "scan_engine": "basic_internal",
                "scan_version": "1.0.0",
            }

            # Check for suspicious file signatures or patterns
            threats = []

            # Check for embedded executables in PDFs
            if b"%PDF" in file_content[:10]:
                if b"/EmbeddedFile" in file_content or b"/JavaScript" in file_content:
                    threats.append("Potentially malicious PDF with embedded content")

            # Check for macro-enabled documents
            if filename.lower().endswith((".docm", ".xlsm", ".pptm")):
                threats.append("Macro-enabled document detected")

            # Check for suspicious ZIP content in DOCX
            if file_content.startswith(b"PK\x03\x04"):  # ZIP signature
                try:
                    with zipfile.ZipFile(io.BytesIO(file_content), "r") as zip_file:
                        for file_info in zip_file.filelist:
                            if file_info.filename.lower().endswith(".exe"):
                                threats.append("Executable file found in document archive")
                except:
                    pass

            # Check file size against content (possible zip bomb)
            if len(file_content) > 0:
                # Simple compression ratio check
                import zlib

                try:
                    compressed_size = len(zlib.compress(file_content))
                    compression_ratio = len(file_content) / compressed_size
                    if compression_ratio > 100:  # Very high compression ratio
                        threats.append("Suspicious compression ratio - possible zip bomb")
                except:
                    pass

            if threats:
                scan_results.update({"scan_status": "suspicious", "threats_detected": threats})
                logger.warning(f"Security scan found threats in {filename}: {threats}")
            else:
                logger.info(f"Security scan passed for {filename}")

            # Reset file pointer
            file_data.seek(0)

            return scan_results

        except Exception as e:
            logger.error(f"Security scan failed for {filename}: {str(e)}")
            return {
                "scan_timestamp": datetime.utcnow().isoformat(),
                "scan_status": "scan_failed",
                "scan_error": str(e),
                "threats_detected": [],
                "scan_engine": "basic_internal",
                "scan_version": "1.0.0",
            }

    async def extract_document_images(
        self,
        file_data: BinaryIO,
        mime_type: str,
        document_id: str,
        user_id: str
    ) -> List[Dict[str, Any]]:
        """
        Extract high-resolution page images from document and store them
        
        Args:
            file_data: Document file data stream
            mime_type: Document MIME type
            document_id: Document ID for naming
            user_id: User ID for storage path
            
        Returns:
            List of page metadata with storage paths
        """
        try:
            file_data.seek(0)
            page_images = []
            
            if mime_type == "application/pdf":
                # Extract PDF pages using Poppler for complete text rendering
                # IMPORTANT: Poppler renders ALL text correctly, unlike PyMuPDF
                pdf_bytes = file_data.read()
                
                # Use high DPI for better AI detection (300 DPI)
                dpi = 300
                
                # Convert PDF to images using Poppler
                images = convert_from_bytes(
                    pdf_bytes,
                    dpi=dpi,
                    fmt='png',  # PNG for best quality
                    use_pdftocairo=True,  # Better rendering engine
                    transparent=False,
                    grayscale=False
                )
                
                for page_num, pil_image in enumerate(images):
                    width = pil_image.width
                    height = pil_image.height
                    
                    # Convert PIL image to JPEG bytes with high quality
                    img_buffer = io.BytesIO()
                    pil_image.save(img_buffer, format='JPEG', quality=95, optimize=False)
                    img_data = img_buffer.getvalue()
                    
                    # Create filename for page image
                    page_filename = f"{document_id}_page_{page_num + 1}.jpg"
                    
                    # Upload page image to storage
                    page_file_data = io.BytesIO(img_data)
                    page_path, page_hash, page_size = storage_service.upload_file(
                        page_file_data, page_filename, "image/jpeg", user_id
                    )
                    
                    page_metadata = {
                        "page_number": page_num + 1,
                        "width": width,
                        "height": height,
                        "dpi": dpi,
                        "format": "JPEG",
                        "quality": 95,
                        "file_path": page_path,
                        "file_hash": page_hash,
                        "file_size": page_size,
                        "mime_type": "image/jpeg"
                    }
                    
                    page_images.append(page_metadata)
                    logger.info(f"Extracted page {page_num + 1}: {width}x{height} @ {dpi} DPI (Poppler)")
                
                logger.info(f"Successfully extracted {len(images)} pages using Poppler")
                
            elif mime_type.startswith("image/"):
                # Single image - convert to standardized JPEG if needed
                with Image.open(file_data) as img:
                    # Convert to RGB if needed for JPEG compatibility
                    if img.mode != 'RGB':
                        img = img.convert('RGB')
                    
                    width, height = img.size
                    dpi = img.info.get('dpi', (150, 150))[0]
                    
                    # Save as high-quality JPEG
                    img_buffer = io.BytesIO()
                    img.save(img_buffer, format='JPEG', quality=95)
                    img_data = img_buffer.getvalue()
                    
                    # Create filename for image
                    image_filename = f"{document_id}_page_1.jpg"
                    
                    # Upload image to storage
                    image_file_data = io.BytesIO(img_data)
                    image_path, image_hash, image_size = storage_service.upload_file(
                        image_file_data, image_filename, "image/jpeg", user_id
                    )
                    
                    page_metadata = {
                        "page_number": 1,
                        "width": width,
                        "height": height,
                        "dpi": dpi,
                        "format": "JPEG", 
                        "quality": 95,
                        "file_path": image_path,
                        "file_hash": image_hash,
                        "file_size": image_size,
                        "mime_type": "image/jpeg"
                    }
                    
                    page_images.append(page_metadata)
                    logger.info(f"Processed image: {width}x{height} @ {dpi} DPI")
            
            else:
                logger.warning(f"Image extraction not supported for MIME type: {mime_type}")
            
            logger.info(f"Extracted {len(page_images)} page images for document {document_id}")
            return page_images
            
        except Exception as e:
            logger.error(f"Failed to extract images from document {document_id}: {e}")
            raise Exception(f"Image extraction failed: {str(e)}")

    async def process_document_upload(
        self,
        file_data: BinaryIO,
        filename: str,
        declared_content_type: str,
        user_id: str,
        title: Optional[str] = None,
        db: Session = None,
    ) -> Document:
        """
        Complete document upload processing pipeline

        Args:
            file_data: File data stream
            filename: Original filename
            declared_content_type: Content type declared by client
            user_id: ID of user uploading the document
            title: Optional document title
            db: Database session

        Returns:
            Document model instance
        """
        try:
            # Step 1: File validation
            actual_mime_type, validation_metadata = await self.validate_file(file_data, filename, declared_content_type)

            # Step 2: Security scanning
            security_results = await self.perform_security_scan(file_data, filename)

            # Check if security scan failed or found threats
            if security_results["scan_status"] == "scan_failed":
                raise SecurityScanError(f"Security scan failed: {security_results.get('scan_error', 'Unknown error')}")

            if security_results["scan_status"] == "suspicious":
                raise SecurityScanError(f"Security threats detected: {', '.join(security_results['threats_detected'])}")

            # Step 3: Upload original document to storage
            file_path, file_hash, file_size = storage_service.upload_file(
                file_data, filename, actual_mime_type, user_id
            )

            # Step 4: Create document record (temporarily without page images)
            document = Document(
                user_id=uuid.UUID(user_id),
                title=title or filename,
                original_filename=filename,
                file_path=file_path,
                file_size=file_size,
                mime_type=actual_mime_type,
                document_hash=file_hash,
                status=DocumentStatus.UPLOADED.value,
                language_detected=validation_metadata.get("detected_language"),
                page_count=validation_metadata.get("page_count"),
                metadata={
                    "validation": validation_metadata,
                    "security_scan": security_results,
                    "upload_timestamp": datetime.utcnow().isoformat(),
                },
                virus_scan_status=security_results["scan_status"],
                virus_scan_result=security_results.get("scan_error") or "Clean",
            )

            # Save to database first to get document ID
            if db:
                db.add(document)
                db.commit()
                db.refresh(document)

            # Step 5: Extract and store page images (after we have document ID)
            try:
                page_images = await self.extract_document_images(
                    file_data, actual_mime_type, str(document.id), user_id
                )
                
                # Update document metadata with page images
                if document.metadata is None:
                    document.metadata = {}
                document.metadata["page_images"] = page_images
                
                if db:
                    db.commit()
                    
                logger.info(f"Document {document.id}: Extracted {len(page_images)} page images")
                
            except Exception as e:
                logger.error(f"Failed to extract page images for document {document.id}: {e}")
                # Continue without page images - they can be extracted later if needed

            logger.info(f"Document processing completed successfully: {document.id}")
            return document

        except (FileValidationError, SecurityScanError) as e:
            logger.error(f"Document processing failed: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error during document processing: {str(e)}")
            raise Exception(f"Document processing failed: {str(e)}")


# Global service instance
document_processing_service = DocumentProcessingService()
