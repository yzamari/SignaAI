#!/usr/bin/env python3
"""
OCR-based field detection service - Traditional approach
Uses Tesseract OCR and OpenCV for image processing
"""

import pytesseract
from PIL import Image
from pdf2image import convert_from_path
import re
import cv2
import numpy as np
import io
from typing import List, Dict, Any
import logging

try:
    from .enhanced_text_remover import EnhancedTextRemover
    from .line_validator import LineValidator
except ImportError:
    from enhanced_text_remover import EnhancedTextRemover
    from line_validator import LineValidator

# Setup logging
logger = logging.getLogger(__name__)


class OCRFieldDetector:
    """Advanced OCR-based field detection with text removal"""
    
    def __init__(self, poppler_path=None):
        self.poppler_path = poppler_path
        self.enhanced_remover = EnhancedTextRemover()  # Using enhanced version with connectivity analysis
        self.line_validator = LineValidator()
    
    def preprocess_image(self, image: Image.Image) -> np.ndarray:
        """
        Applies image preprocessing techniques to enhance quality for OCR.
        """
        # Convert PIL Image to a format OpenCV can use (NumPy array)
        img = np.array(image)
        img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
        
        # 1. Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # 2. Deskew the image (correct for tilt)
        # This is a more advanced process, but can be done with OpenCV and NumPy
        # For a simple solution, we'll skip this for now. For a more robust solution,
        # you can use algorithms to find the rotation angle and rotate the image.
        
        # 3. Binarization (convert to pure black and white)
        # Use Otsu's thresholding for best results on a variety of documents
        thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
        
        # 4. Denoising (remove small specks and dots)
        # Median blur is effective for salt-and-pepper noise
        denoised = cv2.medianBlur(thresh, 3)
        
        return denoised
    
    def detect_lines_and_boxes(self, image: Image.Image) -> List[Dict[str, Any]]:
        """
        Use EnhancedTextRemover to detect lines - filters out letter strokes using connectivity analysis
        """
        logger.info(f"Using EnhancedTextRemover with connectivity analysis for field detection...")
        
        # Use the enhanced process that filters connected letter strokes
        # Call process_with_analysis to get mask, validated lines, and rejected artifacts
        enhanced_mask, enhanced_lines, rejected = self.enhanced_remover.process_with_analysis(image)
        
        logger.info(f"Enhanced method detected {len(enhanced_lines)} real form lines (filtered letter strokes)")
        
        # Convert enhanced_lines to the expected field format
        detected_fields = []
        for line in enhanced_lines:
            # Create field positioned above the line (standard for fillable forms)
            field_y = max(0, line['y'] - 10)  # Position above line
            field_h = 25  # Standard height for text input
            
            # Calculate confidence based on line quality metrics
            confidence = min(0.95, 0.7 + (line.get('continuity', 0) * 0.25))
            
            detected_fields.append({
                "x": line['x'],
                "y": field_y,
                "width": line['width'],
                "height": field_h,
                "type": "text_input",
                "confidence": confidence
            })
        
        # Store mask for visualization if needed
        self.last_clean_mask = enhanced_mask
        
        logger.info(f"Converted {len(detected_fields)} lines to fillable fields")
        return detected_fields
    
    def detect_fillable_fields_from_bytes(self, pdf_bytes: bytes, document_name: str) -> Dict[str, Any]:
        """
        Detects potential fillable fields in a PDF using OCR on each page,
        with added image preprocessing for improved accuracy.
        """
        import time
        start_time = time.time()
        detected_fields_by_page = {}
        
        try:
            # Convert PDF bytes to images with same DPI as tests
            images = self._convert_pdf_bytes_to_images(pdf_bytes, dpi=200)  # Same as test scripts
            logger.info(f"Converted PDF to {len(images)} images for OCR analysis in {time.time() - start_time:.2f}s")
            
        except Exception as e:
            logger.error(f"Error converting PDF to images: {e}")
            return {"error": str(e)}
        
        total_fields = 0
        
        # Process pages in parallel using ThreadPoolExecutor
        from concurrent.futures import ThreadPoolExecutor, as_completed
        
        def process_page(page_tuple):
            page_num, img = page_tuple
            page_start = time.time()
            logger.info(f"Processing page {page_num} with computer vision...")
            
            # Detect visual fields (lines and boxes) - FAST operation
            visual_fields = self.detect_lines_and_boxes(img)
            logger.info(f"Page {page_num}: Detected {len(visual_fields)} visual fields in {time.time() - page_start:.2f}s")
            
            # Skip full OCR if we already have visual fields - this saves significant time
            # Only do minimal OCR to find field labels near visual fields
            page_fields = []
            
            # Convert visual fields to proper format
            for vf in visual_fields:
                field_type = "text_input"
                if vf['type'] == 'checkbox':
                    field_type = "checkbox"
                elif vf['type'] == 'line_field':
                    field_type = "text_input"
                    
                page_fields.append({
                    "type": field_type,
                    "confidence": 0.9,  # High confidence for visual detection
                    "bounding_box": {
                        "x": vf['x'],
                        "y": vf['y'],
                        "width": vf['width'],
                        "height": vf['height']
                    },
                    "label": f"Field {len(page_fields) + 1}",  # Simple numbering instead of OCR
                    "page_number": page_num,
                    "source": "visual"
                })
            
            # Optional: Do targeted OCR only around detected fields for labels (much faster)
            if page_fields and len(page_fields) < 20:  # Only for reasonable number of fields
                # Preprocess only regions around fields
                for field in page_fields[:5]:  # Limit to first 5 fields for speed
                    bbox = field['bounding_box']
                    # Extract region around field for label detection
                    x, y, w, h = bbox['x'], bbox['y'], bbox['width'], bbox['height']
                    # Expand region to capture nearby labels
                    label_region_y = max(0, y - 30)
                    label_region_x = max(0, x - 100)
                    label_region_h = min(img.height - label_region_y, h + 60)
                    label_region_w = min(img.width - label_region_x, w + 200)
                    
                    # Crop the region
                    region = img.crop((label_region_x, label_region_y, 
                                     label_region_x + label_region_w, 
                                     label_region_y + label_region_h))
                    
                    # Quick OCR on small region only
                    try:
                        text = pytesseract.image_to_string(region, lang='eng', config='--psm 8')
                        if text.strip():
                            field['label'] = text.strip()[:50]  # Limit label length
                    except:
                        pass
            
            logger.info(f"Page {page_num}: Completed in {time.time() - page_start:.2f}s")
            return (page_num, page_fields)
        
        # Process pages in parallel
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = {executor.submit(process_page, (i+1, img)): i+1 
                      for i, img in enumerate(images)}
            
            for future in as_completed(futures):
                page_num, page_fields = future.result()
                if page_fields:
                    detected_fields_by_page[page_num] = page_fields
                    total_fields += len(page_fields)
        
        # Calculate total processing time
        total_time = time.time() - start_time
        logger.info(f"Total OCR processing completed in {total_time:.2f}s")
        
        # Format response to match AI service format
        analysis_results = []
        for page_num, fields in detected_fields_by_page.items():
            page_data = {
                "page": page_num,
                "source_image_resolution": {
                    "width": images[page_num-1].width,
                    "height": images[page_num-1].height,
                    "units": "pixels"
                },
                "fields": fields,
                "processing_time_ms": int((total_time / len(images)) * 1000)  # Average per page
            }
            analysis_results.append(page_data)
        
        # Add empty pages
        for page_num in range(1, len(images) + 1):
            if page_num not in detected_fields_by_page:
                page_data = {
                    "page": page_num,
                    "source_image_resolution": {
                        "width": images[page_num-1].width,
                        "height": images[page_num-1].height,
                        "units": "pixels"
                    },
                    "fields": [],
                    "processing_time_ms": 0
                }
                analysis_results.append(page_data)
        
        # Sort by page number
        analysis_results.sort(key=lambda x: x['page'])
        
        return {
            "document_name": document_name,
            "total_pages": len(images),
            "total_fields": total_fields,
            "processing_time_ms": int(total_time * 1000),
            "analysis_results": analysis_results,
            "method": "OCR-based (OpenCV + Tesseract)",
            "optimization": "Parallel processing, visual-only detection, no full text OCR"
        }
    
    def _convert_pdf_bytes_to_images(self, pdf_bytes: bytes, dpi: int = 200) -> List[Image.Image]:
        """Convert PDF bytes to images using pdf2image"""
        try:
            # Write bytes to temporary file for pdf2image
            import tempfile
            import os
            
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_file:
                tmp_file.write(pdf_bytes)
                tmp_path = tmp_file.name
            
            # Convert to images
            images = convert_from_path(tmp_path, poppler_path=self.poppler_path, dpi=dpi)
            
            # Clean up
            os.unlink(tmp_path)
            
            return images
            
        except Exception as e:
            logger.error(f"PDF to image conversion failed: {e}")
            raise


def detect_fillable_fields_ocr(pdf_path: str) -> Dict[str, Any]:
    """
    Legacy function for file-based processing
    """
    detector = OCRFieldDetector()
    
    with open(pdf_path, 'rb') as f:
        pdf_bytes = f.read()
    
    return detector.detect_fillable_fields_from_bytes(pdf_bytes, pdf_path)


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) != 2:
        print("Usage: python ocr_detector.py <pdf_file>")
        sys.exit(1)
    
    pdf_file = sys.argv[1]
    fields = detect_fillable_fields_ocr(pdf_file)
    
    if "error" in fields:
        print(f"Error: {fields['error']}")
    elif fields:
        print(f"OCR Analysis Results for {pdf_file}:")
        print(f"Total fields: {fields['total_fields']}")
        for page_data in fields['analysis_results']:
            page_num = page_data['page']
            page_fields = page_data['fields']
            print(f"--- Page {page_num} ---")
            for field in page_fields:
                bbox = field['bounding_box']
                print(f"  {field['type']}: '{field.get('label', 'N/A')}' at ({bbox['x']}, {bbox['y']}) {bbox['width']}x{bbox['height']}")
    else:
        print(f"No potential fields detected in {pdf_file}.")