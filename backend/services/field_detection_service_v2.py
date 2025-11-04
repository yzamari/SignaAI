"""
Pure OCR Field Detection Service Integration Layer
Uses Tesseract OCR and OpenCV for field detection without AI
"""

import logging
import os
import httpx
import asyncio
from typing import List, Dict, Optional, Any
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass  
class DetectedFieldV2:
    """
    Backward-compatible DetectedField for existing code
    Maintains the same interface as the old system
    """
    type: str
    page: int
    x: float
    y: float
    width: float
    height: float
    confidence: float
    text: Optional[str] = None
    language: Optional[str] = None
    label: Optional[str] = None
    image_width: Optional[int] = None
    image_height: Optional[int] = None
    dpi: Optional[int] = None


class FieldDetectionServiceV2:
    """
    Pure OCR field detection service using Tesseract and OpenCV.
    No AI/Gemini dependency - uses traditional computer vision.
    """
    
    def __init__(self, service_url: str = None, use_microservice: bool = True):
        """
        Initialize the field detection service
        
        Args:
            service_url: URL of the OCR field detection microservice
            use_microservice: Whether to use the microservice (always True for OCR)
        """
        self.service_url = service_url or os.getenv("OCR_SERVICE_URL", "http://localhost:5113")
        self.use_microservice = True  # Always use microservice for OCR
        self.timeout = 60
        logger.info(f"OCR Field Detection Service initialized with URL: {self.service_url}")
    
    async def detect_fields_async(self, pdf_bytes: bytes, filename: str = "document.pdf", return_full_response: bool = False):
        """
        Detect fields using pure OCR service (async)
        
        Args:
            pdf_bytes: PDF file bytes
            filename: Name of the file
            return_full_response: If True, return full OCR response with visualizations
            
        Returns:
            List of detected fields or full OCR response dict
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                files = {
                    "file": (filename, pdf_bytes, "application/pdf")
                }
                
                logger.info(f"Sending document to OCR service: {filename}")
                response = await client.post(f"{self.service_url}/detect-fields", files=files)
                
                if response.status_code != 200:
                    logger.error(f"OCR service returned status {response.status_code}: {response.text}")
                    return []
                
                data = response.json()
                if return_full_response:
                    # Return full response including visualizations
                    return data
                return self._parse_ocr_response(data)
                
        except Exception as e:
            logger.error(f"OCR field detection failed: {e}", exc_info=True)
            return []
    
    async def detect_fields(self, pdf_bytes: bytes, filename: str = "document.pdf", return_full_response: bool = False):
        """
        Detect fields using pure OCR service (async)
        
        Args:
            pdf_bytes: PDF file bytes
            filename: Name of the file
            return_full_response: If True, return full OCR response with visualizations
            
        Returns:
            List of detected fields or full OCR response dict
        """
        return await self.detect_fields_async(pdf_bytes, filename, return_full_response)
    
    def detect_fields_sync(self, pdf_bytes: bytes, filename: str = "document.pdf") -> List[DetectedFieldV2]:
        """
        Detect fields using pure OCR service (sync wrapper)
        
        Args:
            pdf_bytes: PDF file bytes
            filename: Name of the file
            
        Returns:
            List of detected fields
        """
        import nest_asyncio
        nest_asyncio.apply()
        return asyncio.run(self.detect_fields_async(pdf_bytes, filename))
    
    def _parse_ocr_response(self, data: Dict[str, Any]) -> List[DetectedFieldV2]:
        """
        Parse OCR service response into DetectedFieldV2 objects
        
        Args:
            data: OCR service response
            
        Returns:
            List of DetectedFieldV2 objects
        """
        fields = []
        
        if "analysis_results" not in data:
            logger.warning("No analysis_results in OCR response")
            return fields
        
        for page_data in data.get("analysis_results", []):
            page_num = page_data.get("page", 1)
            page_fields = page_data.get("fields", [])
            resolution = page_data.get("source_image_resolution", {})
            
            for field_data in page_fields:
                try:
                    # Extract bounding box - OCR service returns it as nested dict
                    bbox = field_data.get("bounding_box", {})
                    if isinstance(bbox, dict) and "x" in bbox:
                        x = bbox.get("x", 0)
                        y = bbox.get("y", 0) 
                        width = bbox.get("width", 0)
                        height = bbox.get("height", 0)
                    else:
                        # Fallback to direct field access
                        x = field_data.get("x", 0)
                        y = field_data.get("y", 0)
                        width = field_data.get("width", 0)
                        height = field_data.get("height", 0)
                    
                    # Log the extracted coordinates for debugging
                    logger.debug(f"Field bbox: x={x}, y={y}, w={width}, h={height}")
                    
                    field = DetectedFieldV2(
                        type=field_data.get("type", "text"),
                        page=page_num,
                        x=float(x),
                        y=float(y),
                        width=float(width),
                        height=float(height),
                        confidence=field_data.get("confidence", 0.5),
                        text=field_data.get("text"),
                        label=field_data.get("label"),
                        image_width=resolution.get("width"),
                        image_height=resolution.get("height"),
                        dpi=resolution.get("dpi", 200)
                    )
                    fields.append(field)
                    
                except Exception as e:
                    logger.warning(f"Failed to parse field: {e}, field_data: {field_data}")
                    continue
        
        logger.info(f"Parsed {len(fields)} fields from OCR response")
        return fields
    
    def detect_fields_from_bytes(self, pdf_bytes: bytes, filename: str = "document.pdf") -> Dict[str, Any]:
        """
        Legacy method for backward compatibility
        Returns raw response format
        
        Args:
            pdf_bytes: PDF file bytes
            filename: Name of the file
            
        Returns:
            Dictionary with detection results
        """
        try:
            fields = self.detect_fields(pdf_bytes, filename)
            
            # Convert to legacy format
            pages_data = {}
            for field in fields:
                if field.page not in pages_data:
                    pages_data[field.page] = []
                
                pages_data[field.page].append({
                    "type": field.type,
                    "x": field.x,
                    "y": field.y,
                    "width": field.width,
                    "height": field.height,
                    "confidence": field.confidence,
                    "text": field.text,
                    "label": field.label
                })
            
            analysis_results = []
            for page_num, page_fields in sorted(pages_data.items()):
                analysis_results.append({
                    "page": page_num,
                    "fields": page_fields,
                    "source_image_resolution": {
                        "width": fields[0].image_width if fields else 1700,
                        "height": fields[0].image_height if fields else 2200,
                        "units": "pixels"
                    }
                })
            
            return {
                "document_name": filename,
                "total_pages": len(pages_data),
                "analysis_results": analysis_results,
                "total_fields": len(fields),
                "processing_time_ms": 0
            }
            
        except Exception as e:
            logger.error(f"Legacy field detection failed: {e}", exc_info=True)
            return {"error": str(e)}


# Create a global instance for convenience
field_detection_service = FieldDetectionServiceV2()


# Legacy function for backward compatibility
def detect_fields_in_document(pdf_bytes: bytes, filename: str = "document.pdf") -> List[DetectedFieldV2]:
    """
    Legacy function for detecting fields in a document
    
    Args:
        pdf_bytes: PDF file bytes
        filename: Name of the file
        
    Returns:
        List of detected fields
    """
    return field_detection_service.detect_fields_sync(pdf_bytes, filename)