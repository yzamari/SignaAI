#!/usr/bin/env python3
"""
Balanced Text Removal - Filters text artifacts while preserving real form lines
Finds the sweet spot between too strict and too lenient
"""

import cv2
import numpy as np
from PIL import Image
import pytesseract
from typing import List, Tuple, Dict
import logging

logger = logging.getLogger(__name__)


class BalancedTextRemover:
    """
    Balanced approach that:
    1. Removes obvious text artifacts (letter strokes)
    2. Preserves real form lines (even short ones)
    3. Uses OCR to identify text regions for better filtering
    """
    
    def __init__(self):
        self.name = "BalancedTextRemover"
    
    def remove_text_and_diagrams(self, image: Image.Image) -> np.ndarray:
        """
        Remove text while being careful to preserve real form lines.
        Uses OCR to identify actual text regions.
        """
        # Convert to numpy array
        img = np.array(image)
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        else:
            gray = img
            
        height, width = gray.shape
        logger.info(f"Processing image: {width}x{height}")
        
        # Step 1: Create binary image
        binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                     cv2.THRESH_BINARY_INV, 11, 2)
        
        # Step 2: Use OCR to identify text regions
        try:
            # Get text bounding boxes from OCR
            ocr_data = pytesseract.image_to_data(gray, output_type=pytesseract.Output.DICT)
            text_regions = []
            
            for i in range(len(ocr_data['text'])):
                if ocr_data['text'][i].strip():  # If there's actual text
                    x = ocr_data['left'][i]
                    y = ocr_data['top'][i]
                    w = ocr_data['width'][i]
                    h = ocr_data['height'][i]
                    conf = int(ocr_data['conf'][i])
                    
                    # Only consider high-confidence text
                    if conf > 30:
                        text_regions.append((x, y, w, h))
            
            logger.info(f"OCR identified {len(text_regions)} text regions")
        except Exception as e:
            logger.warning(f"OCR failed, using fallback method: {e}")
            text_regions = []
        
        # Step 3: Create text mask from OCR regions
        text_mask = np.zeros_like(binary)
        for x, y, w, h in text_regions:
            # Slightly expand text regions to catch nearby artifacts
            x1 = max(0, x - 2)
            y1 = max(0, y - 2)
            x2 = min(width, x + w + 2)
            y2 = min(height, y + h + 2)
            text_mask[y1:y2, x1:x2] = 255
        
        # Step 4: Extract horizontal lines using morphology
        # Use multiple kernel sizes to catch different line lengths
        all_lines = np.zeros_like(binary)
        
        # Different kernels for different line types
        line_kernels = [
            (25, 1),   # Short lines (but not too short to avoid text)
            (40, 1),   # Medium-short lines
            (60, 1),   # Medium lines
            (100, 1),  # Long lines
            (150, 1),  # Very long lines
        ]
        
        for kernel_w, kernel_h in line_kernels:
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_w, kernel_h))
            lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
            all_lines = cv2.bitwise_or(all_lines, lines)
        
        # Step 5: Analyze each potential line
        contours, _ = cv2.findContours(all_lines, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        validated_lines = np.zeros_like(binary)
        
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            aspect_ratio = w / h if h > 0 else 0
            
            # Basic line criteria (less strict than improved version)
            if not (w > 20 and aspect_ratio > 3 and h < 15):
                continue
            
            # Check overlap with text regions
            line_center_y = y + h // 2
            is_text_artifact = False
            
            for tx, ty, tw, th in text_regions:
                # Check if line is within a text region
                if (x >= tx - 5 and x + w <= tx + tw + 5 and
                    line_center_y >= ty and line_center_y <= ty + th):
                    
                    # This line is inside a text region
                    # Check if it's likely a text artifact
                    if w < tw * 1.2:  # Line not much wider than text
                        is_text_artifact = True
                        break
            
            # Additional checks for text artifacts
            if not is_text_artifact:
                # Extract the line region
                line_region = binary[y:y+h, x:x+w]
                
                if line_region.size > 0:
                    # Check line characteristics
                    horizontal_projection = np.sum(line_region, axis=0) / 255
                    
                    if len(horizontal_projection) > 0:
                        # Calculate metrics
                        continuity = np.count_nonzero(horizontal_projection) / len(horizontal_projection)
                        
                        # Check for patterns that suggest text (many gaps)
                        if continuity < 0.4:  # Too many gaps, likely text
                            is_text_artifact = True
                        
                        # Check thickness variation
                        non_zero = horizontal_projection[horizontal_projection > 0]
                        if len(non_zero) > 0:
                            thickness_variation = np.std(non_zero) / np.mean(non_zero)
                            if thickness_variation > 0.8:  # Too much variation
                                is_text_artifact = True
            
            # Check context - is this line isolated or part of text?
            if not is_text_artifact and w < 100:  # Extra check for short lines
                # Check surrounding area for text density
                context_region = binary[max(0, y-10):min(height, y+h+10), 
                                      max(0, x-10):min(width, x+w+10)]
                if context_region.size > 0:
                    text_density = np.sum(context_region) / (context_region.size * 255)
                    if text_density > 0.3:  # Too much surrounding content
                        is_text_artifact = True
            
            # If not identified as text artifact, keep it
            if not is_text_artifact:
                cv2.drawContours(validated_lines, [contour], -1, 255, -1)
        
        # Step 6: Final cleanup
        # Remove very small isolated pixels
        kernel_clean = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 1))
        final_result = cv2.morphologyEx(validated_lines, cv2.MORPH_OPEN, kernel_clean)
        
        # Count results
        final_contours, _ = cv2.findContours(final_result, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        logger.info(f"Balanced removal complete: {len(final_contours)} lines preserved")
        
        return final_result
    
    def process_with_analysis(self, image: Image.Image) -> Tuple[np.ndarray, List[Dict], List[Dict]]:
        """
        Process image and return mask, validated lines, and rejected artifacts.
        """
        # Convert to numpy array
        img = np.array(image)
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        else:
            gray = img
            
        height, width = gray.shape
        
        # Create binary image
        binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                     cv2.THRESH_BINARY_INV, 11, 2)
        
        # Get OCR text regions
        try:
            ocr_data = pytesseract.image_to_data(gray, output_type=pytesseract.Output.DICT)
            text_regions = []
            
            for i in range(len(ocr_data['text'])):
                if ocr_data['text'][i].strip() and int(ocr_data['conf'][i]) > 30:
                    text_regions.append({
                        'x': ocr_data['left'][i],
                        'y': ocr_data['top'][i],
                        'width': ocr_data['width'][i],
                        'height': ocr_data['height'][i],
                        'text': ocr_data['text'][i],
                        'confidence': int(ocr_data['conf'][i])
                    })
        except:
            text_regions = []
        
        # Get the cleaned mask
        cleaned_mask = self.remove_text_and_diagrams(image)
        
        # Analyze detected lines
        contours, _ = cv2.findContours(cleaned_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        validated_lines = []
        for i, contour in enumerate(contours):
            x, y, w, h = cv2.boundingRect(contour)
            
            # Calculate quality metrics
            line_region = binary[y:y+h, x:x+w]
            if line_region.size > 0:
                h_proj = np.sum(line_region, axis=0) / 255
                continuity = np.count_nonzero(h_proj) / len(h_proj) if len(h_proj) > 0 else 0
            else:
                continuity = 0
            
            validated_lines.append({
                'id': i + 1,
                'x': x,
                'y': y,
                'width': w,
                'height': h,
                'aspect_ratio': w / h if h > 0 else 0,
                'continuity': continuity,
                'type': 'form_line'
            })
        
        # Identify rejected artifacts (in original but not in cleaned)
        all_lines = np.zeros_like(binary)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (30, 1))
        all_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
        
        all_contours, _ = cv2.findContours(all_lines, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        rejected_artifacts = []
        for contour in all_contours:
            x, y, w, h = cv2.boundingRect(contour)
            
            # Check if this contour is in the cleaned mask
            is_validated = False
            for val_line in validated_lines:
                if (abs(val_line['x'] - x) < 5 and 
                    abs(val_line['y'] - y) < 5):
                    is_validated = True
                    break
            
            if not is_validated and w > 10 and w/h > 2:
                # Check which text region it belongs to
                belonging_text = None
                for text_reg in text_regions:
                    if (x >= text_reg['x'] - 5 and 
                        x + w <= text_reg['x'] + text_reg['width'] + 5 and
                        y >= text_reg['y'] - 5 and 
                        y <= text_reg['y'] + text_reg['height'] + 5):
                        belonging_text = text_reg['text']
                        break
                
                rejected_artifacts.append({
                    'x': x,
                    'y': y,
                    'width': w,
                    'height': h,
                    'reason': 'text_artifact',
                    'belonging_to': belonging_text
                })
        
        return cleaned_mask, validated_lines, rejected_artifacts