#!/usr/bin/env python3
"""
Enhanced Text Removal with Connectivity Analysis
Filters out letter strokes (T, F, E, ד, etc.) by detecting if lines are connected to other structures
"""

import cv2
import numpy as np
from PIL import Image
import pytesseract
from typing import List, Tuple, Dict
import logging

logger = logging.getLogger(__name__)


class EnhancedTextRemover:
    """
    Enhanced text removal that distinguishes between:
    - Real form lines (isolated horizontal lines)
    - Letter strokes (horizontal parts of letters like T, F, E, ד)
    
    Key insight: Letter strokes are connected to vertical/diagonal strokes,
    while real form lines are isolated.
    """
    
    def __init__(self):
        self.name = "EnhancedTextRemover"
    
    def is_line_connected_to_text(self, binary, x, y, w, h, margin=3):
        """
        Check if a horizontal line is connected to vertical or diagonal structures
        (indicating it's part of a letter rather than an isolated line)
        """
        height, width = binary.shape
        
        # Expand region to check for connections
        check_y1 = max(0, y - margin)
        check_y2 = min(height, y + h + margin)
        check_x1 = max(0, x - margin)
        check_x2 = min(width, x + w + margin)
        
        # Extract the region around the line
        region = binary[check_y1:check_y2, check_x1:check_x2]
        
        if region.size == 0:
            return False
        
        # Check for vertical connections at the ends and middle of the line
        check_positions = [
            0,                          # Left end
            region.shape[1] // 4,      # 25% position
            region.shape[1] // 2,      # Middle
            3 * region.shape[1] // 4,  # 75% position
            region.shape[1] - 1        # Right end
        ]
        
        connections = 0
        for check_x in check_positions:
            if check_x >= region.shape[1]:
                continue
                
            # Check vertical column for significant pixel density
            column = region[:, check_x]
            
            # Count pixels above and below the line
            line_y_in_region = y - check_y1
            
            if line_y_in_region > 0:
                above_pixels = np.sum(column[:line_y_in_region] > 0)
                if above_pixels > margin:  # Significant vertical structure above
                    connections += 1
            
            if line_y_in_region + h < len(column):
                below_pixels = np.sum(column[line_y_in_region + h:] > 0)
                if below_pixels > margin:  # Significant vertical structure below
                    connections += 1
        
        # If we find connections at multiple positions, it's likely part of text
        return connections >= 2
    
    def analyze_line_neighborhood(self, binary, x, y, w, h):
        """
        Analyze the neighborhood of a line to determine if it's part of a text character
        """
        height, width = binary.shape
        
        # Define neighborhood regions
        above_region = binary[max(0, y-10):y, x:min(width, x+w)]
        below_region = binary[y+h:min(height, y+h+10), x:min(width, x+w)]
        left_region = binary[y:y+h, max(0, x-10):x]
        right_region = binary[y:y+h, x+w:min(width, x+w+10)]
        
        # Calculate pixel density in each region
        above_density = np.sum(above_region > 0) / (above_region.size + 1)
        below_density = np.sum(below_region > 0) / (below_region.size + 1)
        left_density = np.sum(left_region > 0) / (left_region.size + 1)
        right_density = np.sum(right_region > 0) / (right_region.size + 1)
        
        # High density in vertical neighbors suggests text connection
        vertical_connection = above_density > 0.1 or below_density > 0.1
        
        # Check for T-shaped patterns (common in T, F, Hebrew ד, etc.)
        is_t_shape = False
        if above_density > 0.1 or below_density > 0.1:
            # Check if there's a vertical stem in the middle
            mid_x = x + w // 2
            vertical_check = binary[max(0, y-10):min(height, y+h+10), 
                                  max(0, mid_x-5):min(width, mid_x+5)]
            if vertical_check.size > 0:
                vertical_density = np.sum(vertical_check > 0) / vertical_check.size
                is_t_shape = vertical_density > 0.2
        
        return {
            'vertical_connection': vertical_connection,
            'is_t_shape': is_t_shape,
            'above_density': above_density,
            'below_density': below_density,
            'left_density': left_density,
            'right_density': right_density
        }
    
    def detect_letter_patterns(self, binary, x, y, w, h):
        """
        Detect specific letter patterns that commonly cause false positives
        """
        # Common problematic patterns:
        # T, F, E: horizontal line with vertical connection
        # Hebrew ד: horizontal line with vertical stem
        # Multiple T's in a row: TTT
        
        height, width = binary.shape
        
        # Extract line region with context
        context = 15
        region_y1 = max(0, y - context)
        region_y2 = min(height, y + h + context)
        region_x1 = max(0, x - context)
        region_x2 = min(width, x + w + context)
        
        region = binary[region_y1:region_y2, region_x1:region_x2]
        
        if region.size == 0:
            return False
        
        # Use connected components to analyze the structure
        num_labels, labels = cv2.connectedComponents(region)
        
        # Find the label of our line
        line_y_in_region = y - region_y1
        line_x_in_region = x - region_x1
        
        if line_y_in_region >= 0 and line_y_in_region < labels.shape[0]:
            line_label = labels[line_y_in_region, line_x_in_region:line_x_in_region+w]
            if len(line_label) > 0:
                main_label = np.bincount(line_label[line_label > 0]).argmax() if np.any(line_label > 0) else 0
                
                if main_label > 0:
                    # Check if this component extends significantly beyond the horizontal line
                    component_mask = (labels == main_label)
                    component_height = np.sum(np.any(component_mask, axis=1))
                    
                    # If component is much taller than the line, it's likely a letter
                    if component_height > h * 3:
                        return True
        
        return False
    
    def remove_text_and_diagrams(self, image: Image.Image) -> np.ndarray:
        """
        Remove text while preserving real form lines using connectivity analysis
        """
        # Convert to numpy array
        img = np.array(image)
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        else:
            gray = img
            
        height, width = gray.shape
        logger.info(f"Processing image: {width}x{height}")
        
        # Create binary image
        binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                     cv2.THRESH_BINARY_INV, 11, 2)
        
        # Get text regions from OCR for context
        try:
            ocr_data = pytesseract.image_to_data(gray, output_type=pytesseract.Output.DICT)
            text_regions = []
            
            for i in range(len(ocr_data['text'])):
                if ocr_data['text'][i].strip():
                    x = ocr_data['left'][i]
                    y = ocr_data['top'][i]
                    w = ocr_data['width'][i]
                    h = ocr_data['height'][i]
                    conf = int(ocr_data['conf'][i])
                    text = ocr_data['text'][i]
                    
                    if conf > 30:
                        text_regions.append({
                            'x': x, 'y': y, 'w': w, 'h': h,
                            'text': text, 'confidence': conf
                        })
            
            logger.info(f"OCR identified {len(text_regions)} text regions")
        except Exception as e:
            logger.warning(f"OCR failed: {e}")
            text_regions = []
        
        # Extract horizontal lines
        all_lines = np.zeros_like(binary)
        
        line_kernels = [
            (25, 1),   # Short lines
            (40, 1),   # Medium-short lines
            (60, 1),   # Medium lines
            (100, 1),  # Long lines
            (150, 1),  # Very long lines
        ]
        
        for kernel_w, kernel_h in line_kernels:
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_w, kernel_h))
            lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
            all_lines = cv2.bitwise_or(all_lines, lines)
        
        # Analyze each potential line
        contours, _ = cv2.findContours(all_lines, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        validated_lines = np.zeros_like(binary)
        
        rejected_count = 0
        accepted_count = 0
        
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            aspect_ratio = w / h if h > 0 else 0
            
            # Basic line criteria
            if not (w > 20 and aspect_ratio > 3 and h < 15):
                continue
            
            # Check if line is connected to text structures
            is_connected = self.is_line_connected_to_text(binary, x, y, w, h)
            
            # Analyze neighborhood
            neighborhood = self.analyze_line_neighborhood(binary, x, y, w, h)
            
            # Check for letter patterns
            is_letter_pattern = self.detect_letter_patterns(binary, x, y, w, h)
            
            # Decision logic
            is_text_artifact = False
            
            # Strong indicators of text artifacts
            if is_connected and (neighborhood['is_t_shape'] or is_letter_pattern):
                is_text_artifact = True
                rejected_count += 1
                logger.debug(f"Rejected T-shape or letter pattern at ({x}, {y})")
            
            # Check if line is within a text region
            elif not is_text_artifact:
                for text_reg in text_regions:
                    # Check if line is inside a text bounding box
                    if (x >= text_reg['x'] - 5 and 
                        x + w <= text_reg['x'] + text_reg['w'] + 5 and
                        y >= text_reg['y'] - 5 and 
                        y + h <= text_reg['y'] + text_reg['h'] + 5):
                        
                        # Check if this could be a line under text (underline)
                        if y > text_reg['y'] + text_reg['h'] * 0.7:
                            # Could be underline - keep it
                            break
                        else:
                            # Part of text character
                            is_text_artifact = True
                            rejected_count += 1
                            logger.debug(f"Rejected line inside text '{text_reg['text']}' at ({x}, {y})")
                            break
            
            # Additional check for isolated short lines
            if not is_text_artifact and w < 50:
                # Short lines need extra validation
                if neighborhood['vertical_connection']:
                    is_text_artifact = True
                    rejected_count += 1
                    logger.debug(f"Rejected short connected line at ({x}, {y})")
            
            # If not identified as text artifact, keep it
            if not is_text_artifact:
                cv2.drawContours(validated_lines, [contour], -1, 255, -1)
                accepted_count += 1
                logger.debug(f"Accepted isolated line at ({x}, {y})")
        
        # Final cleanup
        kernel_clean = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 1))
        final_result = cv2.morphologyEx(validated_lines, cv2.MORPH_OPEN, kernel_clean)
        
        logger.info(f"Enhanced removal complete: {accepted_count} lines accepted, {rejected_count} rejected")
        
        return final_result
    
    def process_with_analysis(self, image: Image.Image) -> Tuple[np.ndarray, List[Dict], List[Dict]]:
        """
        Process image and return mask, validated lines, and rejected artifacts
        """
        # Get the cleaned mask
        cleaned_mask = self.remove_text_and_diagrams(image)
        
        # Analyze detected lines
        contours, _ = cv2.findContours(cleaned_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        validated_lines = []
        for i, contour in enumerate(contours):
            x, y, w, h = cv2.boundingRect(contour)
            
            validated_lines.append({
                'id': i + 1,
                'x': x,
                'y': y,
                'width': w,
                'height': h,
                'aspect_ratio': w / h if h > 0 else 0,
                'type': 'form_line'
            })
        
        # For compatibility, return empty rejected list
        rejected_artifacts = []
        
        return cleaned_mask, validated_lines, rejected_artifacts