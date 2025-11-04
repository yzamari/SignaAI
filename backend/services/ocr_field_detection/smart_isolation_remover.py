#!/usr/bin/env python3
"""
Smart Isolation Text Remover
Balances isolation checking with line quality metrics
Distinguishes between form lines with labels vs text artifacts
"""

import cv2
import numpy as np
from PIL import Image
from typing import List, Tuple, Dict
import logging

logger = logging.getLogger(__name__)


class SmartIsolationRemover:
    """
    Smart approach that combines:
    1. Isolation checking (but not too strict)
    2. Line quality metrics (length, continuity, thickness)
    3. Context awareness (form lines can have labels nearby)
    """
    
    def __init__(self):
        self.name = "SmartIsolationRemover"
    
    def remove_text_and_diagrams(self, image: Image.Image) -> np.ndarray:
        """
        Remove text while preserving form lines.
        Uses smart isolation that allows labels but rejects text artifacts.
        """
        # Convert to numpy array
        img = np.array(image)
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        else:
            gray = img
            
        height, width = gray.shape
        logger.info(f"Processing image: {width}x{height}")
        
        # Step 1: Create binary image with better threshold
        binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                     cv2.THRESH_BINARY_INV, 11, 2)
        
        # Step 2: Extract horizontal lines with multiple kernels
        horizontal_lines = np.zeros_like(binary)
        
        kernel_sizes = [25, 40, 60, 100, 150, 200]
        
        for kernel_width in kernel_sizes:
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_width, 1))
            lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
            horizontal_lines = cv2.bitwise_or(horizontal_lines, lines)
        
        # Step 3: Analyze each potential line
        contours, _ = cv2.findContours(horizontal_lines, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        validated_lines = np.zeros_like(binary)
        
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            
            # Basic line criteria
            aspect_ratio = w / h if h > 0 else 0
            if not (w > 20 and aspect_ratio > 3 and h < 20):
                continue
            
            # Calculate line quality score
            quality_score = self.calculate_line_quality(binary, x, y, w, h, width, height)
            
            # Check isolation with smart criteria
            isolation_score = self.check_smart_isolation(binary, x, y, w, h, width, height)
            
            # Combined score
            combined_score = quality_score * 0.6 + isolation_score * 0.4
            
            # Accept if combined score is good enough
            if combined_score > 0.5:
                cv2.drawContours(validated_lines, [contour], -1, 255, -1)
        
        logger.info(f"Smart isolation filtering complete")
        return validated_lines
    
    def calculate_line_quality(self, binary: np.ndarray, x: int, y: int, w: int, h: int, 
                              img_width: int, img_height: int) -> float:
        """
        Calculate quality score based on line characteristics.
        Returns score 0-1, higher is better.
        """
        score = 0.0
        
        # 1. Length score (longer lines are better)
        length_ratio = w / img_width
        if length_ratio > 0.5:
            score += 0.3
        elif length_ratio > 0.2:
            score += 0.2
        elif length_ratio > 0.1:
            score += 0.1
        elif length_ratio > 0.05:
            score += 0.05
        
        # 2. Aspect ratio score (thinner lines are better)
        aspect_ratio = w / h if h > 0 else 0
        if aspect_ratio > 50:
            score += 0.25
        elif aspect_ratio > 20:
            score += 0.2
        elif aspect_ratio > 10:
            score += 0.15
        elif aspect_ratio > 5:
            score += 0.1
        
        # 3. Thickness score (not too thick)
        if h <= 3:
            score += 0.15
        elif h <= 5:
            score += 0.1
        elif h <= 8:
            score += 0.05
        
        # 4. Continuity score (check if line is continuous)
        line_region = binary[y:y+h, x:x+w]
        if line_region.size > 0:
            horizontal_projection = np.sum(line_region, axis=0) / 255
            if len(horizontal_projection) > 0:
                continuity = np.count_nonzero(horizontal_projection) / len(horizontal_projection)
                score += continuity * 0.2
        
        # 5. Position score (not at edges)
        if 0.05 < (y / img_height) < 0.95:
            score += 0.1
        
        return min(1.0, score)
    
    def check_smart_isolation(self, binary: np.ndarray, x: int, y: int, w: int, h: int,
                             img_width: int, img_height: int) -> float:
        """
        Check isolation with smart criteria.
        Returns isolation score 0-1, higher means more isolated.
        """
        isolation_score = 1.0
        
        # Define check distances (less strict than pure isolation)
        close_distance = 3  # Very close (likely connected)
        near_distance = 8   # Near (might be label or related text)
        
        # Check ABOVE (very close only)
        if y > close_distance:
            above_close = binary[y - close_distance:y, x:x + w]
            if above_close.size > 0:
                density_above = np.sum(above_close) / (above_close.size * 255)
                if density_above > 0.3:  # Significant content very close above
                    isolation_score -= 0.3
                elif density_above > 0.1:
                    isolation_score -= 0.1
        
        # Check BELOW (very close only)
        if y + h + close_distance < img_height:
            below_close = binary[y + h:y + h + close_distance, x:x + w]
            if below_close.size > 0:
                density_below = np.sum(below_close) / (below_close.size * 255)
                if density_below > 0.3:  # Significant content very close below
                    isolation_score -= 0.3
                elif density_below > 0.1:
                    isolation_score -= 0.1
        
        # Check LEFT (allow for labels)
        if x > near_distance:
            # Check immediate left (connected text)
            left_close = binary[y:y + h, max(0, x - close_distance):x]
            if left_close.size > 0:
                density_left = np.sum(left_close) / (left_close.size * 255)
                if density_left > 0.5:  # Very dense = connected
                    isolation_score -= 0.2
            
            # Check near left (might be label - more lenient)
            left_near = binary[y:y + h, max(0, x - near_distance):x - close_distance]
            if left_near.size > 0:
                density_left_near = np.sum(left_near) / (left_near.size * 255)
                if density_left_near > 0.7:  # Only penalize if very dense
                    isolation_score -= 0.05
        
        # Check RIGHT (less strict for form end)
        if x + w + close_distance < img_width:
            right_close = binary[y:y + h, x + w:min(img_width, x + w + close_distance)]
            if right_close.size > 0:
                density_right = np.sum(right_close) / (right_close.size * 255)
                if density_right > 0.5:  # Connected on right
                    isolation_score -= 0.2
        
        # Check for vertical strokes through the line (text artifacts)
        # Sample at regular intervals
        sample_count = min(20, w // 5)
        vertical_penalties = 0
        
        if sample_count > 0:
            for i in range(sample_count):
                sample_x = x + (i * w // sample_count)
                
                # Check vertical continuity
                if y > 3 and y + h + 3 < img_height:
                    above_sample = binary[y - 3:y, sample_x:sample_x + 2]
                    below_sample = binary[y + h:y + h + 3, sample_x:sample_x + 2]
                    
                    if above_sample.size > 0 and below_sample.size > 0:
                        if np.sum(above_sample) > 255 * 2 and np.sum(below_sample) > 255 * 2:
                            vertical_penalties += 1
            
            # Penalize if too many vertical connections
            vertical_ratio = vertical_penalties / sample_count
            if vertical_ratio > 0.3:
                isolation_score -= 0.3
            elif vertical_ratio > 0.1:
                isolation_score -= 0.15
        
        # Bonus for very isolated lines
        if y > near_distance and y + h + near_distance < img_height:
            extended_above = binary[y - near_distance:y - close_distance, x:x + w]
            extended_below = binary[y + h + close_distance:y + h + near_distance, x:x + w]
            
            if extended_above.size > 0 and extended_below.size > 0:
                density_extended = (np.sum(extended_above) + np.sum(extended_below)) / \
                                 ((extended_above.size + extended_below.size) * 255)
                if density_extended < 0.05:  # Very clear above and below
                    isolation_score += 0.1
        
        return max(0.0, min(1.0, isolation_score))
    
    def process_with_scores(self, image: Image.Image) -> Tuple[np.ndarray, List[Dict]]:
        """
        Process image and return mask with detailed scoring for each line.
        """
        img = np.array(image)
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        else:
            gray = img
            
        height, width = gray.shape
        
        binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                     cv2.THRESH_BINARY_INV, 11, 2)
        
        # Get the cleaned mask
        cleaned_mask = self.remove_text_and_diagrams(image)
        
        # Analyze each detected line
        contours, _ = cv2.findContours(cleaned_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        line_details = []
        for i, contour in enumerate(contours):
            x, y, w, h = cv2.boundingRect(contour)
            
            quality = self.calculate_line_quality(binary, x, y, w, h, width, height)
            isolation = self.check_smart_isolation(binary, x, y, w, h, width, height)
            combined = quality * 0.6 + isolation * 0.4
            
            line_details.append({
                'id': i + 1,
                'x': x,
                'y': y,
                'width': w,
                'height': h,
                'aspect_ratio': w / h if h > 0 else 0,
                'quality_score': quality,
                'isolation_score': isolation,
                'combined_score': combined,
                'type': 'form_line' if combined > 0.6 else 'probable_line'
            })
        
        return cleaned_mask, line_details