#!/usr/bin/env python3
"""
Isolation-based Text Remover
Keeps only lines that are ISOLATED from text/artifacts
A real form line should have clear space above and below it
"""

import cv2
import numpy as np
from PIL import Image
from typing import List, Tuple, Dict
import logging

logger = logging.getLogger(__name__)


class IsolationTextRemover:
    """
    Removes text by checking isolation of horizontal lines.
    Key principle: Real form lines are isolated, not connected to text.
    """
    
    def __init__(self):
        self.name = "IsolationTextRemover"
    
    def remove_text_and_diagrams(self, image: Image.Image) -> np.ndarray:
        """
        Keep only isolated horizontal lines.
        Lines connected to text/artifacts from ANY direction are rejected.
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
        _, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY_INV)
        
        # Step 2: Extract all potential horizontal lines
        horizontal_lines = np.zeros_like(binary)
        
        # Use different kernel sizes
        kernel_sizes = [30, 50, 80, 120, 200]
        
        for kernel_width in kernel_sizes:
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_width, 1))
            lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
            horizontal_lines = cv2.bitwise_or(horizontal_lines, lines)
        
        # Step 3: Check each line for isolation
        contours, _ = cv2.findContours(horizontal_lines, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        isolated_lines = np.zeros_like(binary)
        
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            
            # Basic line criteria
            aspect_ratio = w / h if h > 0 else 0
            if not (w > 20 and aspect_ratio > 4 and h < 20):
                continue
            
            # Check isolation from all directions
            is_isolated = self.check_line_isolation(binary, x, y, w, h, width, height)
            
            if is_isolated:
                # This line is isolated from text
                cv2.drawContours(isolated_lines, [contour], -1, 255, -1)
        
        logger.info(f"Isolation filtering complete")
        return isolated_lines
    
    def check_line_isolation(self, binary: np.ndarray, x: int, y: int, w: int, h: int, 
                            img_width: int, img_height: int) -> bool:
        """
        Check if a line is isolated from text/artifacts on all sides.
        
        Returns True if the line is isolated, False if connected to text.
        """
        # Define isolation zones
        isolation_distance = 5  # Minimum pixels of clear space required
        
        # Check ABOVE the line
        if y > isolation_distance:
            above_region = binary[y - isolation_distance:y, x:x + w]
            if np.sum(above_region) > 255 * 5:  # More than 5 pixels above
                return False
        
        # Check BELOW the line
        if y + h + isolation_distance < img_height:
            below_region = binary[y + h:y + h + isolation_distance, x:x + w]
            if np.sum(below_region) > 255 * 5:  # More than 5 pixels below
                return False
        
        # Check LEFT of the line (for connected text on the left)
        if x > isolation_distance:
            left_region = binary[y:y + h, x - isolation_distance:x]
            if np.sum(left_region) > 255 * h * 0.5:  # Significant content on left
                return False
        
        # Check RIGHT of the line (for connected text on the right)
        if x + w + isolation_distance < img_width:
            right_region = binary[y:y + h, x + w:x + w + isolation_distance]
            if np.sum(right_region) > 255 * h * 0.5:  # Significant content on right
                return False
        
        # Additional check: Extended vertical check for text blocks
        # Check a wider area above and below for text density
        extended_check_distance = 15
        
        # Extended above check
        if y > extended_check_distance:
            extended_above = binary[y - extended_check_distance:y - isolation_distance, x:x + w]
            if extended_above.size > 0:
                density_above = np.sum(extended_above) / (extended_above.size * 255)
                if density_above > 0.15:  # Too much content above
                    return False
        
        # Extended below check
        if y + h + extended_check_distance < img_height:
            extended_below = binary[y + h + isolation_distance:y + h + extended_check_distance, x:x + w]
            if extended_below.size > 0:
                density_below = np.sum(extended_below) / (extended_below.size * 255)
                if density_below > 0.15:  # Too much content below
                    return False
        
        # Check for vertical connections (text that extends vertically through the line)
        # Sample points along the line to check for vertical strokes
        sample_points = min(10, w // 10)
        if sample_points > 0:
            for i in range(sample_points):
                sample_x = x + (i * w // sample_points)
                
                # Check vertical column at this point
                if y > 5 and y + h + 5 < img_height:
                    vertical_column = binary[y - 5:y + h + 5, sample_x:sample_x + 2]
                    if vertical_column.size > 0:
                        vertical_density = np.sum(vertical_column) / (vertical_column.size * 255)
                        if vertical_density > 0.7:  # Strong vertical stroke through the line
                            return False
        
        return True
    
    def process_with_visualization(self, image: Image.Image) -> Tuple[np.ndarray, Dict]:
        """
        Process image and return both mask and analysis data.
        """
        # Convert to numpy array
        img = np.array(image)
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        else:
            gray = img
            
        height, width = gray.shape
        
        # Get binary image
        _, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY_INV)
        
        # Get all horizontal lines before filtering
        all_horizontal = np.zeros_like(binary)
        for kernel_width in [30, 50, 80, 120, 200]:
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_width, 1))
            lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
            all_horizontal = cv2.bitwise_or(all_horizontal, lines)
        
        # Get isolated lines
        isolated_mask = self.remove_text_and_diagrams(image)
        
        # Count statistics
        all_contours, _ = cv2.findContours(all_horizontal, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        isolated_contours, _ = cv2.findContours(isolated_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Filter to count only line-like contours
        all_lines = []
        for c in all_contours:
            x, y, w, h = cv2.boundingRect(c)
            if w > 20 and w/h > 4:
                all_lines.append({'x': x, 'y': y, 'width': w, 'height': h})
        
        isolated_lines = []
        for c in isolated_contours:
            x, y, w, h = cv2.boundingRect(c)
            isolated_lines.append({'x': x, 'y': y, 'width': w, 'height': h})
        
        # Find rejected lines (connected to text)
        rejected_lines = []
        for line in all_lines:
            is_isolated = False
            for iso_line in isolated_lines:
                if (abs(line['x'] - iso_line['x']) < 5 and 
                    abs(line['y'] - iso_line['y']) < 5):
                    is_isolated = True
                    break
            
            if not is_isolated:
                # Check why it was rejected
                x, y, w, h = line['x'], line['y'], line['width'], line['height']
                
                rejection_reasons = []
                
                # Check connections
                if y > 5:
                    above = binary[y - 5:y, x:x + w]
                    if np.sum(above) > 255 * 5:
                        rejection_reasons.append("text_above")
                
                if y + h + 5 < height:
                    below = binary[y + h:y + h + 5, x:x + w]
                    if np.sum(below) > 255 * 5:
                        rejection_reasons.append("text_below")
                
                if x > 5:
                    left = binary[y:y + h, x - 5:x]
                    if np.sum(left) > 255 * h * 0.5:
                        rejection_reasons.append("text_left")
                
                if x + w + 5 < width:
                    right = binary[y:y + h, x + w:x + w + 5]
                    if np.sum(right) > 255 * h * 0.5:
                        rejection_reasons.append("text_right")
                
                line['rejection_reasons'] = rejection_reasons
                rejected_lines.append(line)
        
        analysis = {
            'total_horizontal_lines': len(all_lines),
            'isolated_lines': len(isolated_lines),
            'rejected_lines': len(rejected_lines),
            'isolated_line_details': isolated_lines,
            'rejected_line_details': rejected_lines[:10]  # Sample of rejected
        }
        
        return isolated_mask, analysis