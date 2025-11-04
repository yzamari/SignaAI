#!/usr/bin/env python3
"""
Hybrid OCR field detection - Combines mask-based and direct detection
Reduces false positives while maintaining sensitivity to small lines
"""

import cv2
import numpy as np
from PIL import Image
from typing import List, Dict, Any, Tuple
import logging

from .text_remover import TextDiagramRemover
from .improved_text_remover import ImprovedTextRemover

logger = logging.getLogger(__name__)


class HybridFieldDetector:
    """
    Hybrid approach that combines:
    1. Mask-based detection for small/faint lines
    2. Direct detection for strong/clear lines
    3. Cross-validation between methods
    4. Confidence scoring to filter false positives
    """
    
    def __init__(self, use_improved_remover=True):
        if use_improved_remover:
            self.text_remover = ImprovedTextRemover()
        else:
            self.text_remover = TextDiagramRemover()
        
    def detect_with_mask(self, image: Image.Image, strict_mode: bool = False) -> Tuple[List[Dict], np.ndarray]:
        """
        Detection using text removal mask - sensitive to small lines
        Returns: (detected_fields, clean_mask)
        """
        img = np.array(image)
        gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY) if len(img.shape) == 3 else img
        height, width = gray.shape
        
        # Remove text and diagrams
        clean_binary = self.text_remover.remove_text_and_diagrams(image)
        
        # Find contours from cleaned image
        contours, _ = cv2.findContours(clean_binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        detected_fields = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            aspect_ratio = w / h if h > 0 else 0
            length_score = w / width
            area = cv2.contourArea(contour)
            
            # Stricter filtering if in strict mode
            min_width = 40 if strict_mode else 20
            min_aspect = 5 if strict_mode else 3
            min_length = 0.03 if strict_mode else 0.015
            min_area = 50 if strict_mode else 30
            max_height = 15 if strict_mode else 20
            
            if (w > min_width and
                w < width * 0.7 and
                h < max_height and
                aspect_ratio > min_aspect and
                length_score > min_length and
                area > min_area):
                
                # Calculate confidence based on line properties
                confidence = self._calculate_line_confidence(
                    w, h, aspect_ratio, length_score, area, width, height
                )
                
                detected_fields.append({
                    "x": x,
                    "y": max(0, y - 20),  # Field above line
                    "width": w,
                    "height": 30,
                    "type": "text_input",
                    "confidence": confidence,
                    "method": "mask",
                    "line_y": y,
                    "line_height": h,
                    "aspect_ratio": aspect_ratio
                })
        
        return detected_fields, clean_binary
    
    def detect_direct(self, image: Image.Image) -> List[Dict]:
        """
        Direct detection without text removal - fewer false positives
        """
        img = np.array(image)
        gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY) if len(img.shape) == 3 else img
        height, width = gray.shape
        
        # Apply threshold
        _, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY_INV)
        
        # Use morphological operations to detect horizontal lines
        horizontal_lines = np.zeros_like(binary)
        
        # Multiple kernel sizes for different line lengths
        kernel_sizes = [20, 30, 40, 60, 80, 100, 150]
        for kernel_width in kernel_sizes:
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_width, 1))
            lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)
            horizontal_lines = cv2.bitwise_or(horizontal_lines, lines)
        
        # Find contours
        contours, _ = cv2.findContours(horizontal_lines, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        detected_fields = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            aspect_ratio = w / h if h > 0 else 0
            length_score = w / width
            area = cv2.contourArea(contour)
            
            # Same criteria as main detector
            if (w > 25 and
                w < width * 0.95 and
                h < 30 and
                aspect_ratio > 2.5 and
                length_score > 0.016):
                
                # Higher base confidence for direct detection
                confidence = self._calculate_line_confidence(
                    w, h, aspect_ratio, length_score, area, width, height, 
                    base_confidence=0.8
                )
                
                detected_fields.append({
                    "x": x,
                    "y": max(0, y - 20),
                    "width": w,
                    "height": 30,
                    "type": "text_input",
                    "confidence": confidence,
                    "method": "direct",
                    "line_y": y,
                    "line_height": h,
                    "aspect_ratio": aspect_ratio
                })
        
        return detected_fields
    
    def detect_hybrid(self, image: Image.Image, 
                     confidence_threshold: float = 0.6,
                     use_cross_validation: bool = True) -> List[Dict]:
        """
        Detection using ONLY direct line detection (text removal disabled)
        
        Args:
            image: Input PIL Image
            confidence_threshold: Minimum confidence to accept a field
            use_cross_validation: Not used (kept for compatibility)
        
        Returns:
            List of detected fields with confidence scores
        """
        logger.info("Using direct line detection only (text removal disabled)...")
        
        # ONLY use direct detection method
        direct_fields = self.detect_direct(image)
        
        logger.info(f"Direct method: {len(direct_fields)} fields detected")
        
        # Create a dummy mask for compatibility
        img = np.array(image)
        self.last_clean_mask = np.zeros((img.shape[0], img.shape[1]), dtype=np.uint8)
        
        # Filter by confidence threshold
        filtered_fields = []
        for field in direct_fields:
            if field['confidence'] >= confidence_threshold:
                field['cross_validated'] = False  # No cross-validation since we only use one method
                filtered_fields.append(field)
        
        # Remove overlapping fields
        filtered_fields = self._remove_overlapping_fields(filtered_fields)
        
        logger.info(f"Direct detection complete: {len(filtered_fields)} fields after filtering")
        
        return filtered_fields
    
    def _calculate_line_confidence(self, w, h, aspect_ratio, length_score, area, 
                                  img_width, img_height, base_confidence=0.5):
        """Calculate confidence score for a detected line"""
        confidence = base_confidence
        
        # Length contribution (longer lines are more likely to be real)
        if length_score > 0.3:
            confidence += 0.15
        elif length_score > 0.1:
            confidence += 0.1
        elif length_score > 0.05:
            confidence += 0.05
        
        # Aspect ratio contribution (very thin horizontal lines are good)
        if aspect_ratio > 50:
            confidence += 0.15
        elif aspect_ratio > 20:
            confidence += 0.1
        elif aspect_ratio > 10:
            confidence += 0.05
        
        # Height penalty (too thick lines are suspicious)
        if h > 15:
            confidence -= 0.1
        elif h < 3:
            confidence += 0.05
        
        # Area contribution
        if area > 500:
            confidence += 0.05
        
        # Position bonus (lines in typical form positions)
        relative_y = (w / 2) / img_width
        if 0.1 < relative_y < 0.9:  # Not at edges
            confidence += 0.05
        
        return min(0.95, max(0.1, confidence))
    
    def _find_matching_field(self, field1: Dict, field_list: List[Dict], 
                            iou_threshold: float = 0.3) -> Dict:
        """Find a matching field in the list based on IoU"""
        for field2 in field_list:
            # Calculate intersection over union
            x1_min, x1_max = field1['x'], field1['x'] + field1['width']
            x2_min, x2_max = field2['x'], field2['x'] + field2['width']
            y1_min, y1_max = field1['line_y'], field1['line_y'] + field1['line_height']
            y2_min, y2_max = field2['line_y'], field2['line_y'] + field2['line_height']
            
            # Intersection
            x_inter = max(0, min(x1_max, x2_max) - max(x1_min, x2_min))
            y_inter = max(0, min(y1_max, y2_max) - max(y1_min, y2_min))
            inter_area = x_inter * y_inter
            
            # Union
            area1 = field1['width'] * field1['line_height']
            area2 = field2['width'] * field2['line_height']
            union_area = area1 + area2 - inter_area
            
            # IoU
            if union_area > 0:
                iou = inter_area / union_area
                if iou > iou_threshold:
                    return field2
        
        return None
    
    def _remove_overlapping_fields(self, fields: List[Dict]) -> List[Dict]:
        """Remove overlapping fields, keeping higher confidence ones"""
        # Sort by confidence (descending)
        fields.sort(key=lambda f: f['confidence'], reverse=True)
        
        filtered = []
        for field in fields:
            overlap = False
            for existing in filtered:
                # Check for significant overlap
                x_overlap = max(0, min(field['x'] + field['width'], 
                                      existing['x'] + existing['width']) - 
                               max(field['x'], existing['x']))
                y_overlap = max(0, min(field['y'] + field['height'], 
                                      existing['y'] + existing['height']) - 
                               max(field['y'], existing['y']))
                
                if x_overlap > 0 and y_overlap > 0:
                    overlap_area = x_overlap * y_overlap
                    field_area = field['width'] * field['height']
                    
                    # If overlap is more than 40%, skip this field
                    if overlap_area > field_area * 0.4:
                        overlap = True
                        break
            
            if not overlap:
                filtered.append(field)
        
        return filtered