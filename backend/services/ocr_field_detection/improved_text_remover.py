#!/usr/bin/env python3
"""
Improved Text and Diagram Removal with better text artifact filtering
Distinguishes between actual form lines and text stroke artifacts
"""

import cv2
import numpy as np
from PIL import Image
from typing import List, Tuple, Dict
import logging

logger = logging.getLogger(__name__)


class ImprovedTextRemover:
    """
    Enhanced text removal that better distinguishes between:
    - Actual form lines (long, isolated, consistent)
    - Text artifacts (letter strokes like top of T, F, etc.)
    """
    
    def __init__(self):
        self.name = "ImprovedTextRemover"
    
    def remove_text_and_diagrams(self, image: Image.Image) -> np.ndarray:
        """
        Remove text while preserving actual form lines.
        Uses multiple validation steps to filter out text artifacts.
        """
        # Convert to numpy array
        img = np.array(image)
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        else:
            gray = img
            
        height, width = gray.shape
        logger.info(f"Processing image: {width}x{height}")
        
        # Step 1: Create binary image with adaptive threshold
        binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                     cv2.THRESH_BINARY_INV, 11, 2)
        
        # Step 2: Create a copy for text detection
        text_detection = binary.copy()
        
        # Step 3: Detect text regions using connected components
        # Text typically forms dense clusters of connected pixels
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(text_detection, 8)
        
        # Create mask for text regions
        text_mask = np.zeros_like(binary)
        
        for i in range(1, num_labels):
            x, y, w, h, area = stats[i]
            
            # Characteristics of text blocks (not lines)
            if (h > 5 and h < 50 and  # Text height range
                w > 5 and w < width * 0.3 and  # Not too wide
                area > 20 and area < 5000):  # Reasonable text area
                
                # Check density - text regions are usually dense
                component_mask = (labels == i).astype(np.uint8) * 255
                density = np.sum(component_mask[y:y+h, x:x+w]) / (w * h * 255)
                
                if density > 0.2:  # Text regions are relatively dense
                    text_mask[y:y+h, x:x+w] = 255
        
        # Step 4: Dilate text mask to cover nearby text artifacts
        text_dilation_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (10, 5))
        text_mask_dilated = cv2.dilate(text_mask, text_dilation_kernel, iterations=2)
        
        # Step 5: Extract potential lines using morphological operations
        # Use multiple passes with different kernels
        line_candidates = np.zeros_like(binary)
        
        # Different kernel sizes for different line lengths
        line_kernels = [
            (40, 1),   # Short lines
            (60, 1),   # Medium lines
            (100, 1),  # Long lines
            (150, 1),  # Very long lines
        ]
        
        for kernel_w, kernel_h in line_kernels:
            line_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_w, kernel_h))
            detected = cv2.morphologyEx(binary, cv2.MORPH_OPEN, line_kernel)
            line_candidates = cv2.bitwise_or(line_candidates, detected)
        
        # Step 6: Remove text regions from line candidates
        lines_no_text = cv2.bitwise_and(line_candidates, cv2.bitwise_not(text_mask_dilated))
        
        # Step 7: Analyze each potential line for validation
        contours, _ = cv2.findContours(lines_no_text, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        validated_lines = np.zeros_like(binary)
        
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            
            # Basic line criteria
            aspect_ratio = w / h if h > 0 else 0
            
            if not (w > 30 and aspect_ratio > 5 and h < 10):
                continue
            
            # Extract the line region for detailed analysis
            line_region = binary[y:y+h, x:x+w]
            
            # Check for line continuity (actual lines are more continuous)
            if line_region.size > 0:
                # Calculate horizontal projection
                horizontal_projection = np.sum(line_region, axis=0) / 255
                
                # Actual lines have consistent projection
                # Text artifacts have gaps and variations
                if len(horizontal_projection) > 0:
                    mean_projection = np.mean(horizontal_projection)
                    std_projection = np.std(horizontal_projection)
                    
                    # Calculate continuity score
                    non_zero_ratio = np.count_nonzero(horizontal_projection) / len(horizontal_projection)
                    
                    # Actual lines criteria:
                    # 1. High continuity (few gaps)
                    # 2. Consistent thickness (low std deviation)
                    # 3. Sufficient length
                    if (non_zero_ratio > 0.7 and  # At least 70% continuous
                        std_projection < mean_projection * 0.5 and  # Consistent thickness
                        w > 50):  # Minimum length for real lines
                        
                        # Additional check: Isolated from text
                        # Expand region and check surroundings
                        y_start = max(0, y - 10)
                        y_end = min(height, y + h + 10)
                        x_start = max(0, x - 5)
                        x_end = min(width, x + w + 5)
                        
                        surrounding_region = text_mask[y_start:y_end, x_start:x_end]
                        text_density = np.sum(surrounding_region) / (surrounding_region.size * 255)
                        
                        # If not surrounded by text, it's likely a real line
                        if text_density < 0.1:
                            cv2.drawContours(validated_lines, [contour], -1, 255, -1)
        
        # Step 8: Final morphological cleanup
        final_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 1))
        final_clean = cv2.morphologyEx(validated_lines, cv2.MORPH_CLOSE, final_kernel)
        
        # Step 9: Additional validation pass
        final_contours, _ = cv2.findContours(final_clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        final_mask = np.zeros_like(binary)
        
        for contour in final_contours:
            x, y, w, h = cv2.boundingRect(contour)
            aspect_ratio = w / h if h > 0 else 0
            
            # Final strict criteria
            if (w > 40 and  # Minimum width
                w < width * 0.8 and  # Not full width
                h < 12 and  # Maximum height
                h > 0 and  # Minimum height
                aspect_ratio > 8):  # Strong horizontal aspect
                
                # Check if this line is isolated (not part of a text block)
                isolation_region = binary[max(0, y-20):min(height, y+h+20), x:x+w]
                if isolation_region.size > 0:
                    # Count pixels above and below the line
                    above_pixels = np.sum(binary[max(0, y-20):y, x:x+w]) if y > 20 else 0
                    below_pixels = np.sum(binary[y+h:min(height, y+h+20), x:x+w]) if y+h+20 < height else 0
                    
                    # Isolated lines have few pixels above/below
                    total_surrounding = above_pixels + below_pixels
                    if total_surrounding < w * 255 * 0.5:  # Less than half a line's worth of pixels
                        cv2.drawContours(final_mask, [contour], -1, 255, -1)
        
        logger.info(f"Text removal complete: {len(final_contours)} lines validated")
        return final_mask
    
    def analyze_line_quality(self, binary_region: np.ndarray) -> Dict[str, float]:
        """
        Analyze a potential line region to determine if it's a real form line
        or a text artifact.
        """
        if binary_region.size == 0:
            return {"quality": 0, "continuity": 0, "uniformity": 0}
        
        # Calculate metrics
        h, w = binary_region.shape
        
        # Horizontal projection
        h_projection = np.sum(binary_region, axis=0) / 255
        
        # Continuity: how continuous is the line
        continuity = np.count_nonzero(h_projection) / len(h_projection) if len(h_projection) > 0 else 0
        
        # Uniformity: how consistent is the thickness
        non_zero_proj = h_projection[h_projection > 0]
        uniformity = 1 - (np.std(non_zero_proj) / np.mean(non_zero_proj)) if len(non_zero_proj) > 0 else 0
        uniformity = max(0, uniformity)
        
        # Overall quality score
        quality = continuity * uniformity
        
        return {
            "quality": quality,
            "continuity": continuity,
            "uniformity": uniformity
        }
    
    def process_with_validation(self, image: Image.Image, min_quality: float = 0.5) -> Tuple[np.ndarray, List[Dict]]:
        """
        Process image and return both the mask and detailed line information.
        
        Args:
            image: Input PIL Image
            min_quality: Minimum quality score for accepting a line (0-1)
            
        Returns:
            Tuple of (cleaned_mask, line_details)
        """
        cleaned_mask = self.remove_text_and_diagrams(image)
        
        # Analyze each detected line
        contours, _ = cv2.findContours(cleaned_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        line_details = []
        for i, contour in enumerate(contours):
            x, y, w, h = cv2.boundingRect(contour)
            
            # Extract line region from original binary
            img = np.array(image)
            gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY) if len(img.shape) == 3 else img
            binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                         cv2.THRESH_BINARY_INV, 11, 2)
            
            line_region = binary[y:y+h, x:x+w]
            quality_metrics = self.analyze_line_quality(line_region)
            
            if quality_metrics["quality"] >= min_quality:
                line_details.append({
                    "id": i + 1,
                    "x": x,
                    "y": y,
                    "width": w,
                    "height": h,
                    "aspect_ratio": w / h if h > 0 else 0,
                    "quality": quality_metrics["quality"],
                    "continuity": quality_metrics["continuity"],
                    "uniformity": quality_metrics["uniformity"],
                    "type": "validated_line"
                })
        
        return cleaned_mask, line_details