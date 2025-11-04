#!/usr/bin/env python3
"""
Text and Diagram Removal Class - For Testing Only
Removes all letters, numbers, and diagrams to show only horizontal lines/filling fields
"""

import cv2
import numpy as np
from PIL import Image
from typing import List, Tuple
import logging

logger = logging.getLogger(__name__)


class TextDiagramRemover:
    """
    Specialized class for removing text and diagrams to isolate horizontal lines.
    Used for testing and visualization of form field detection.
    """
    
    def __init__(self):
        self.name = "TextDiagramRemover"
    
    def remove_text_and_diagrams(self, image: Image.Image) -> np.ndarray:
        """
        Remove all text, numbers, and diagrams, keeping only horizontal lines.
        
        Args:
            image: PIL Image of the document page
            
        Returns:
            np.ndarray: Cleaned binary image with only horizontal lines
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
        
        # Step 2: Remove small noise (dots, periods, etc.)
        noise_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))
        binary_clean = cv2.morphologyEx(binary, cv2.MORPH_OPEN, noise_kernel)
        
        # Step 3: Remove vertical strokes (letters like I, l, 1, |)
        vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 10))
        no_verticals = cv2.morphologyEx(binary_clean, cv2.MORPH_OPEN, vertical_kernel)
        
        # Step 4: Remove diagonal strokes (letters like /, \, X, etc.)
        diagonal_kernel1 = np.array([[0, 0, 1], [0, 1, 0], [1, 0, 0]], dtype=np.uint8)
        diagonal_kernel2 = np.array([[1, 0, 0], [0, 1, 0], [0, 0, 1]], dtype=np.uint8)
        no_diagonals = cv2.morphologyEx(no_verticals, cv2.MORPH_OPEN, diagonal_kernel1)
        no_diagonals = cv2.morphologyEx(no_diagonals, cv2.MORPH_OPEN, diagonal_kernel2)
        
        # Step 5: Remove small horizontal text strokes (underlines in letters)
        small_horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 1))
        no_small_horizontal = cv2.morphologyEx(no_diagonals, cv2.MORPH_OPEN, small_horizontal_kernel)
        
        # Step 6: Preserve only significant horizontal lines (form fields)
        # Use different kernel sizes to preserve various line lengths
        preserved_lines = np.zeros_like(binary_clean)
        
        line_kernels = [
            (30, 1),   # Short form lines
            (50, 1),   # Medium form lines
            (80, 1),   # Long form lines
            (120, 1),  # Very long form lines
        ]
        
        for kernel_w, kernel_h in line_kernels:
            line_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_w, kernel_h))
            detected_lines = cv2.morphologyEx(binary_clean, cv2.MORPH_OPEN, line_kernel)
            
            # Add detected lines to preserved image
            preserved_lines = cv2.bitwise_or(preserved_lines, detected_lines)
        
        # Step 7: Final cleanup - remove remaining text artifacts
        final_kernel = np.ones((2, 2), np.uint8)
        final_clean = cv2.morphologyEx(preserved_lines, cv2.MORPH_CLOSE, final_kernel)
        
        # Step 8: Filter by contour properties to remove remaining non-line elements
        contours, _ = cv2.findContours(final_clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Create final mask with only horizontal lines
        final_mask = np.zeros_like(final_clean)
        
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            
            # Only keep elements that look like horizontal lines
            aspect_ratio = w / h if h > 0 else 0
            
            if (w > 25 and                      # Minimum meaningful width
                w < width * 0.8 and             # Not too wide (exclude borders)
                h < 15 and                      # Must be thin (actual lines)
                aspect_ratio > 5):              # Must be clearly horizontal
                
                # Draw the approved contour
                cv2.drawContours(final_mask, [contour], -1, 255, -1)
        
        logger.info(f"Text removal complete: isolated horizontal lines")
        return final_mask
    
    def process_document_pages(self, images: List[Image.Image]) -> List[np.ndarray]:
        """
        Process all pages of a document to remove text and keep only lines.
        
        Args:
            images: List of PIL Images (document pages)
            
        Returns:
            List of cleaned binary images with only horizontal lines
        """
        cleaned_pages = []
        
        for i, image in enumerate(images, 1):
            logger.info(f"Processing page {i} - removing text and diagrams...")
            cleaned_page = self.remove_text_and_diagrams(image)
            cleaned_pages.append(cleaned_page)
            
            # Count remaining elements
            contours, _ = cv2.findContours(cleaned_page, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            logger.info(f"Page {i}: {len(contours)} horizontal lines preserved")
        
        return cleaned_pages
    
    def save_cleaned_images(self, cleaned_pages: List[np.ndarray], output_dir: str):
        """
        Save the cleaned images showing only horizontal lines.
        
        Args:
            cleaned_pages: List of cleaned binary images
            output_dir: Directory to save results
        """
        import os
        
        os.makedirs(output_dir, exist_ok=True)
        
        for i, cleaned_page in enumerate(cleaned_pages, 1):
            # Convert binary image to PIL format for saving
            pil_image = Image.fromarray(cleaned_page)
            output_path = f"{output_dir}/page_{i:02d}_lines_only.png"
            pil_image.save(output_path)
            logger.info(f"Saved cleaned page {i}: {output_path}")
        
        # Create summary
        summary_path = f"{output_dir}/README.txt"
        with open(summary_path, 'w') as f:
            f.write("TEXT AND DIAGRAM REMOVAL RESULTS\n")
            f.write("================================\n\n")
            f.write("This directory contains pages with all text, numbers, and diagrams removed.\n")
            f.write("Only horizontal lines (potential form fields) are preserved.\n\n")
            f.write("Files:\n")
            for i in range(len(cleaned_pages)):
                f.write(f"  page_{i+1:02d}_lines_only.png - Page {i+1} with only horizontal lines\n")
            f.write(f"\nTotal pages processed: {len(cleaned_pages)}\n")
            f.write("Processing method: Advanced morphological operations + contour filtering\n")
        
        logger.info(f"Summary saved: {summary_path}")
        return output_dir