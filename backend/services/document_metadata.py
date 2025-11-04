"""
Document metadata extraction and storage service
Advanced metadata processing for different file types
"""

import asyncio
import hashlib
import io
import json
import logging
from datetime import datetime
from typing import Any, BinaryIO, Dict, List, Optional, Tuple

from pdf2image import convert_from_bytes  # Poppler-based PDF processing (replaces PyMuPDF)
from docx import Document as DocxDocument
from langdetect import LangDetectException, detect
from PIL import ExifTags, Image
from sqlalchemy.orm import Session

from models.document import Document, DocumentStatus
from services.storage import storage_service

logger = logging.getLogger(__name__)


class MetadataExtractionError(Exception):
    """Custom exception for metadata extraction errors"""

    pass


class DocumentMetadataService:
    """Service for extracting and managing document metadata"""

    def __init__(self):
        self.supported_languages = {
            "ar": "Arabic",
            "he": "Hebrew",
            "en": "English",
            "es": "Spanish",
            "fr": "French",
            "de": "German",
            "it": "Italian",
            "ru": "Russian",
            "zh": "Chinese",
            "ja": "Japanese",
            "ko": "Korean",
        }

    async def extract_comprehensive_metadata(
        self, document: Document, file_data: Optional[BinaryIO] = None, db: Session = None
    ) -> Dict[str, Any]:
        """
        Extract comprehensive metadata from document

        Args:
            document: Document model instance
            file_data: Optional file data stream (if not provided, will download from storage)
            db: Database session

        Returns:
            Dict containing comprehensive metadata
        """
        try:
            # Get file data if not provided
            if file_data is None:
                file_data = storage_service.download_file(document.file_path)
                if not file_data:
                    raise MetadataExtractionError("Failed to download document from storage")

            # Update document status to processing
            if db:
                document.status = DocumentStatus.PROCESSING.value
                document.processing_started_at = datetime.utcnow()
                db.commit()

            # Extract metadata based on file type
            metadata = {}

            if document.mime_type == "application/pdf":
                metadata = await self._extract_pdf_metadata(file_data)
            elif document.mime_type in ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]:
                metadata = await self._extract_docx_metadata(file_data)
            elif document.mime_type.startswith("image/"):
                metadata = await self._extract_image_metadata(file_data)
            else:
                metadata = {"extraction_status": "unsupported_format"}

            # Add common metadata
            metadata.update(
                {
                    "extraction_timestamp": datetime.utcnow().isoformat(),
                    "extraction_version": "1.0.0",
                    "file_info": {
                        "original_filename": document.original_filename,
                        "file_size": document.file_size,
                        "mime_type": document.mime_type,
                        "document_hash": document.document_hash,
                    },
                }
            )

            # Update document with extracted metadata
            if db:
                existing_metadata = document.file_metadata or {}
                existing_metadata.update({"extracted_metadata": metadata})
                document.file_metadata = existing_metadata
                document.language_detected = metadata.get("language", {}).get("primary_language")
                document.page_count = metadata.get("structure", {}).get("page_count", document.page_count)
                document.status = DocumentStatus.READY.value
                document.processing_completed_at = datetime.utcnow()
                db.commit()

            logger.info(f"Metadata extraction completed for document: {document.id}")
            return metadata

        except Exception as e:
            logger.error(f"Metadata extraction failed for document {document.id}: {str(e)}")

            # Update document with error status
            if db:
                document.status = DocumentStatus.ERROR.value
                document.processing_error = str(e)
                document.processing_completed_at = datetime.utcnow()
                db.commit()

            raise MetadataExtractionError(f"Metadata extraction failed: {str(e)}")

    async def _extract_pdf_metadata(self, file_data: BinaryIO) -> Dict[str, Any]:
        """Extract comprehensive metadata from PDF files"""
        try:
            file_data.seek(0)
            pdf_document = fitz.open(stream=file_data.read(), filetype="pdf")

            # Basic document info
            basic_info = {
                "page_count": pdf_document.page_count,
                "is_encrypted": pdf_document.is_encrypted,
                "needs_pass": pdf_document.needs_pass,
                "is_pdf": pdf_document.is_pdf,
                "is_reflowable": pdf_document.is_reflowable,
            }

            # Document metadata
            doc_metadata = pdf_document.metadata
            metadata_info = {
                "title": doc_metadata.get("title", ""),
                "author": doc_metadata.get("author", ""),
                "subject": doc_metadata.get("subject", ""),
                "keywords": doc_metadata.get("keywords", ""),
                "creator": doc_metadata.get("creator", ""),
                "producer": doc_metadata.get("producer", ""),
                "creation_date": doc_metadata.get("creationDate", ""),
                "modification_date": doc_metadata.get("modDate", ""),
                "format": doc_metadata.get("format", ""),
                "encryption": doc_metadata.get("encryption", ""),
            }

            # Extract text content and analyze language
            full_text_content = ""
            page_texts = []

            for page_num in range(pdf_document.page_count):
                page = pdf_document[page_num]
                page_text = page.get_text()
                page_texts.append(
                    {"page_number": page_num + 1, "text_length": len(page_text), "has_text": bool(page_text.strip())}
                )
                full_text_content += page_text

            # Language detection
            language_info = await self._detect_document_language(full_text_content)

            # Content analysis
            content_analysis = {
                "total_text_length": len(full_text_content),
                "has_text_content": bool(full_text_content.strip()),
                "pages_with_text": sum(1 for p in page_texts if p["has_text"]),
                "average_text_per_page": len(full_text_content) / pdf_document.page_count
                if pdf_document.page_count > 0
                else 0,
            }

            # Extract form fields if any
            form_fields = []
            try:
                for page_num in range(pdf_document.page_count):
                    page = pdf_document[page_num]
                    widgets = page.widgets()
                    for widget in widgets:
                        form_fields.append(
                            {
                                "page": page_num + 1,
                                "field_name": widget.field_name or f"field_{len(form_fields)}",
                                "field_type": widget.field_type_string,
                                "rect": list(widget.rect),
                                "field_value": widget.field_value or "",
                            }
                        )
            except Exception as e:
                logger.warning(f"Failed to extract form fields: {str(e)}")

            # Extract potential signature areas (basic detection)
            signature_candidates = await self._detect_signature_areas(pdf_document)

            pdf_document.close()

            return {
                "extraction_status": "success",
                "document_type": "pdf",
                "structure": basic_info,
                "metadata": metadata_info,
                "language": language_info,
                "content": content_analysis,
                "pages": page_texts,
                "form_fields": form_fields,
                "signature_candidates": signature_candidates,
                "text_sample": full_text_content[:500] if full_text_content else None,
            }

        except Exception as e:
            logger.error(f"PDF metadata extraction failed: {str(e)}")
            return {"extraction_status": "failed", "extraction_error": str(e), "document_type": "pdf"}

    async def _extract_docx_metadata(self, file_data: BinaryIO) -> Dict[str, Any]:
        """Extract comprehensive metadata from DOCX files"""
        try:
            file_data.seek(0)
            doc = DocxDocument(file_data)

            # Extract core properties
            props = doc.core_properties
            metadata_info = {
                "title": props.title or "",
                "author": props.author or "",
                "subject": props.subject or "",
                "keywords": props.keywords or "",
                "category": props.category or "",
                "comments": props.comments or "",
                "created": props.created.isoformat() if props.created else None,
                "modified": props.modified.isoformat() if props.modified else None,
                "last_modified_by": props.last_modified_by or "",
                "revision": props.revision,
                "version": props.version or "",
                "language": props.language or "",
                "identifier": props.identifier or "",
            }

            # Extract text content
            full_text = ""
            paragraph_info = []
            table_count = 0

            for paragraph in doc.paragraphs:
                para_text = paragraph.text
                full_text += para_text + "\n"
                if para_text.strip():
                    paragraph_info.append(
                        {
                            "length": len(para_text),
                            "style": paragraph.style.name if paragraph.style else "Normal",
                            "alignment": str(paragraph.alignment) if paragraph.alignment else "LEFT",
                        }
                    )

            # Count tables
            table_count = len(doc.tables)

            # Language detection
            language_info = await self._detect_document_language(full_text)

            # Content analysis
            content_analysis = {
                "paragraph_count": len([p for p in doc.paragraphs if p.text.strip()]),
                "table_count": table_count,
                "total_text_length": len(full_text),
                "has_text_content": bool(full_text.strip()),
                "estimated_word_count": len(full_text.split()) if full_text else 0,
            }

            return {
                "extraction_status": "success",
                "document_type": "docx",
                "structure": {
                    "page_count": 1,  # DOCX doesn't have fixed pages
                    "estimated_pages": max(1, len(full_text) // 3000),  # Rough estimate
                },
                "metadata": metadata_info,
                "language": language_info,
                "content": content_analysis,
                "paragraphs": paragraph_info[:10],  # Sample first 10 paragraphs
                "text_sample": full_text[:500] if full_text else None,
            }

        except Exception as e:
            logger.error(f"DOCX metadata extraction failed: {str(e)}")
            return {"extraction_status": "failed", "extraction_error": str(e), "document_type": "docx"}

    async def _extract_image_metadata(self, file_data: BinaryIO) -> Dict[str, Any]:
        """Extract comprehensive metadata from image files"""
        try:
            file_data.seek(0)

            with Image.open(file_data) as img:
                # Basic image info
                basic_info = {
                    "width": img.width,
                    "height": img.height,
                    "format": img.format,
                    "mode": img.mode,
                    "has_transparency": img.mode in ("RGBA", "LA") or "transparency" in img.info,
                    "is_animated": getattr(img, "is_animated", False),
                    "color_count": len(img.getcolors(maxcolors=256)) if img.mode == "P" else None,
                }

                # Extract EXIF data
                exif_data = {}
                if hasattr(img, "_getexif") and img._getexif() is not None:
                    exif = img._getexif()
                    if exif:
                        for tag_id, value in exif.items():
                            try:
                                tag_name = ExifTags.TAGS.get(tag_id, tag_id)
                                if isinstance(value, (str, int, float, bool)):
                                    exif_data[str(tag_name)] = value
                                elif isinstance(value, bytes):
                                    try:
                                        exif_data[str(tag_name)] = value.decode("utf-8", errors="ignore")
                                    except:
                                        exif_data[str(tag_name)] = str(value)
                                else:
                                    exif_data[str(tag_name)] = str(value)
                            except Exception as e:
                                logger.debug(f"Failed to process EXIF tag {tag_id}: {str(e)}")
                                continue

                # Image analysis
                content_analysis = {
                    "aspect_ratio": round(img.width / img.height, 2) if img.height > 0 else 0,
                    "megapixels": round((img.width * img.height) / 1000000, 2),
                    "estimated_file_quality": "high"
                    if img.width > 2000 and img.height > 2000
                    else "medium"
                    if img.width > 800
                    else "low",
                    "color_mode": img.mode,
                    "bit_depth": len(img.getbands()) * 8 if img.getbands() else 8,
                }

                return {
                    "extraction_status": "success",
                    "document_type": "image",
                    "structure": {"page_count": 1, "is_multipage": basic_info.get("is_animated", False)},
                    "metadata": exif_data,
                    "language": {"primary_language": None, "confidence": 0.0},  # Images don't have text
                    "content": content_analysis,
                    "image_properties": basic_info,
                }

        except Exception as e:
            logger.error(f"Image metadata extraction failed: {str(e)}")
            return {"extraction_status": "failed", "extraction_error": str(e), "document_type": "image"}

    async def _detect_document_language(self, text_content: str) -> Dict[str, Any]:
        """Detect primary and secondary languages in document text"""
        if not text_content or len(text_content.strip()) < 50:
            return {
                "primary_language": None,
                "confidence": 0.0,
                "detected_languages": [],
                "rtl_content": False,
                "mixed_language": False,
            }

        try:
            # Use langdetect for primary language detection
            detected_lang = detect(text_content)

            # Character-based detection for RTL languages
            arabic_chars = sum(1 for c in text_content if "\u0600" <= c <= "\u06FF")
            hebrew_chars = sum(1 for c in text_content if "\u0590" <= c <= "\u05FF")
            latin_chars = sum(1 for c in text_content if c.isalpha() and ord(c) < 256)

            total_alpha_chars = sum(1 for c in text_content if c.isalpha())

            # Calculate character distribution
            char_distribution = {}
            if total_alpha_chars > 0:
                if arabic_chars > 0:
                    char_distribution["arabic"] = round(arabic_chars / total_alpha_chars, 2)
                if hebrew_chars > 0:
                    char_distribution["hebrew"] = round(hebrew_chars / total_alpha_chars, 2)
                if latin_chars > 0:
                    char_distribution["latin"] = round(latin_chars / total_alpha_chars, 2)

            # Determine if content is RTL
            rtl_content = (arabic_chars + hebrew_chars) / total_alpha_chars > 0.3 if total_alpha_chars > 0 else False

            # Check for mixed languages
            mixed_language = len([v for v in char_distribution.values() if v > 0.2]) > 1

            # Override detection for Arabic/Hebrew if character analysis suggests so
            if arabic_chars / total_alpha_chars > 0.5:
                detected_lang = "ar"
            elif hebrew_chars / total_alpha_chars > 0.5:
                detected_lang = "he"

            return {
                "primary_language": detected_lang,
                "confidence": 0.9 if detected_lang in ["ar", "he"] and rtl_content else 0.7,
                "detected_languages": [detected_lang],
                "rtl_content": rtl_content,
                "mixed_language": mixed_language,
                "character_distribution": char_distribution,
                "language_name": self.supported_languages.get(detected_lang, detected_lang),
            }

        except LangDetectException as e:
            logger.warning(f"Language detection failed: {str(e)}")
            return {
                "primary_language": None,
                "confidence": 0.0,
                "detected_languages": [],
                "rtl_content": False,
                "mixed_language": False,
                "detection_error": str(e),
            }

    async def _detect_signature_areas(self, pdf_document) -> List[Dict[str, Any]]:
        """Basic signature area detection in PDF documents"""
        signature_candidates = []

        # Common signature keywords in multiple languages
        signature_keywords = [
            # English
            "signature",
            "sign here",
            "signed by",
            "sign above",
            "sign below",
            # Arabic
            "التوقيع",
            "وقع هنا",
            "التوقيع أعلاه",
            "التوقيع أدناه",
            # Hebrew
            "חתימה",
            "חתום כאן",
            "חתם למעלה",
            "חתם למטה",
        ]

        try:
            for page_num in range(pdf_document.page_count):
                page = pdf_document[page_num]
                page_text = page.get_text().lower()

                # Search for signature keywords
                for keyword in signature_keywords:
                    if keyword.lower() in page_text:
                        # Try to find the text rectangle
                        text_instances = page.search_for(keyword)
                        for inst in text_instances:
                            signature_candidates.append(
                                {
                                    "page": page_num + 1,
                                    "keyword": keyword,
                                    "rect": list(inst),  # [x0, y0, x1, y1]
                                    "detection_method": "keyword",
                                    "confidence": 0.6,
                                }
                            )

                # Look for form fields that might be signature fields
                try:
                    widgets = page.widgets()
                    for widget in widgets:
                        if widget.field_type_string in ["Signature", "Button"]:
                            signature_candidates.append(
                                {
                                    "page": page_num + 1,
                                    "field_name": widget.field_name or "unnamed_field",
                                    "rect": list(widget.rect),
                                    "detection_method": "form_field",
                                    "field_type": widget.field_type_string,
                                    "confidence": 0.8,
                                }
                            )
                except Exception as e:
                    logger.debug(f"Failed to extract form fields from page {page_num}: {str(e)}")

        except Exception as e:
            logger.warning(f"Signature area detection failed: {str(e)}")

        return signature_candidates

    async def generate_document_thumbnail(
        self, document: Document, page_number: int = 1, max_size: Tuple[int, int] = (300, 400)
    ) -> Optional[bytes]:
        """
        Generate a thumbnail image for document preview

        Args:
            document: Document model instance
            page_number: Page number to generate thumbnail for (1-based)
            max_size: Maximum thumbnail size as (width, height)

        Returns:
            PNG thumbnail image data as bytes, or None if failed
        """
        try:
            # Download file from storage
            file_data = storage_service.download_file(document.file_path)
            if not file_data:
                logger.error(f"Failed to download document for thumbnail: {document.id}")
                return None

            file_data.seek(0)

            if document.mime_type == "application/pdf":
                return await self._generate_pdf_thumbnail(file_data, page_number, max_size)
            elif document.mime_type.startswith("image/"):
                return await self._generate_image_thumbnail(file_data, max_size)
            else:
                logger.warning(f"Thumbnail generation not supported for {document.mime_type}")
                return None

        except Exception as e:
            logger.error(f"Thumbnail generation failed for document {document.id}: {str(e)}")
            return None

    async def _generate_pdf_thumbnail(
        self, file_data: BinaryIO, page_number: int, max_size: Tuple[int, int]
    ) -> Optional[bytes]:
        """Generate thumbnail from PDF page"""
        try:
            pdf_document = fitz.open(stream=file_data.read(), filetype="pdf")

            if page_number < 1 or page_number > pdf_document.page_count:
                page_number = 1

            page = pdf_document[page_number - 1]  # Convert to 0-based

            # Get page as image
            mat = fitz.Matrix(2.0, 2.0)  # 2x zoom for better quality
            pix = page.get_pixmap(matrix=mat)
            img_data = pix.tobytes("png")

            pdf_document.close()

            # Resize using PIL
            img = Image.open(io.BytesIO(img_data))
            img.thumbnail(max_size, Image.Resampling.LANCZOS)

            # Save as PNG
            output = io.BytesIO()
            img.save(output, format="PNG", optimize=True)
            return output.getvalue()

        except Exception as e:
            logger.error(f"PDF thumbnail generation failed: {str(e)}")
            return None

    async def _generate_image_thumbnail(self, file_data: BinaryIO, max_size: Tuple[int, int]) -> Optional[bytes]:
        """Generate thumbnail from image file"""
        try:
            with Image.open(file_data) as img:
                # Convert to RGB if necessary
                if img.mode in ("RGBA", "LA"):
                    background = Image.new("RGB", img.size, (255, 255, 255))
                    background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
                    img = background
                elif img.mode not in ("RGB", "L"):
                    img = img.convert("RGB")

                # Create thumbnail
                img.thumbnail(max_size, Image.Resampling.LANCZOS)

                # Save as PNG
                output = io.BytesIO()
                img.save(output, format="PNG", optimize=True)
                return output.getvalue()

        except Exception as e:
            logger.error(f"Image thumbnail generation failed: {str(e)}")
            return None


# Global service instance
document_metadata_service = DocumentMetadataService()
