#!/usr/bin/env python3
"""
Line Validator - Checks if a detected line is a real form line or part of text
"""

import cv2
import numpy as np
from typing import Tuple, Dict
import logging

logger = logging.getLogger(__name__)


class LineValidator:
    """
    Validates detected lines to filter out text artifacts
    Multi-language support: Works with Hebrew, Arabic, English, etc.
    Key principle: Real form lines are isolated, text strokes have connected pixels
    """
    
    @staticmethod
    def is_valid_line(binary_img: np.ndarray, x: int, y: int, w: int, h: int) -> Tuple[bool, str]:
        """
        Check if a detected line is a real form line or part of text.
        Uses size-dependent validation: stricter for short lines, lenient for long lines.
        Language-agnostic approach that works for multiple scripts.
        
        Args:
            binary_img: Binary image (white pixels on black background)
            x, y, w, h: Bounding box of the detected line
            
        Returns:
            (is_valid, reason): True if it's a real line, False if text artifact
        """
        height, width = binary_img.shape
        
        # 1. Check for connected pixels below (works for all languages)
        connected_below = LineValidator._check_connected_below(binary_img, x, y, w, h)
        if connected_below > 0.3:  # Best performing threshold
            return False, "text_stroke_below"
        
        # 2. Check for vertical strokes through the line
        vertical_strokes = LineValidator._count_vertical_strokes(binary_img, x, y, w, h)
        if vertical_strokes > w * 0.15:  # Best performing threshold
            return False, "too_many_verticals"
        
        # 3. Check line continuity (real lines are continuous)
        continuity = LineValidator._check_line_continuity(binary_img, x, y, w, h)
        if continuity < 0.6:  # Best performing threshold
            return False, "discontinuous"
        
        # 4. Check surrounding text density
        text_density_above = LineValidator._check_text_density_above(binary_img, x, y, w, h)
        text_density_below = LineValidator._check_text_density_below(binary_img, x, y, w, h)
        
        # If there's dense text immediately above AND below, likely part of text
        if text_density_above > 0.4 and text_density_below > 0.4:
            return False, "surrounded_by_text"
        
        # 5. Check for letter patterns (works for multiple languages)
        if LineValidator._has_letter_pattern(binary_img, x, y, w, h):
            return False, "letter_pattern"
        
        return True, "valid_line"
    
    @staticmethod
    def _check_connected_below(binary_img: np.ndarray, x: int, y: int, w: int, h: int) -> float:
        """
        Check how many points along the line have pixels connected below.
        Returns ratio of connected points (0-1).
        """
        if y + h + 5 >= binary_img.shape[0]:
            return 0.0
        
        # Sample points along the line
        sample_points = min(50, w // 2)
        connected_count = 0
        
        for i in range(sample_points):
            sample_x = x + (i * w // sample_points)
            
            # Check for pixels immediately below this point
            below_region = binary_img[y + h:min(y + h + 5, binary_img.shape[0]), 
                                     sample_x:sample_x + 2]
            
            if below_region.size > 0 and np.sum(below_region) > 0:
                connected_count += 1
        
        return connected_count / sample_points if sample_points > 0 else 0
    
    @staticmethod
    def _count_vertical_strokes(binary_img: np.ndarray, x: int, y: int, w: int, h: int) -> int:
        """
        Count vertical strokes that pass through the line.
        These indicate the line might be part of text.
        """
        vertical_count = 0
        
        # Sample every few pixels
        step = max(1, w // 100)
        
        for sample_x in range(x, min(x + w, binary_img.shape[1]), step):
            # Check vertical column
            if y > 3 and y + h + 3 < binary_img.shape[0]:
                above = binary_img[y - 3:y, sample_x:sample_x + 1]
                below = binary_img[y + h:y + h + 3, sample_x:sample_x + 1]
                
                # If there are pixels both above and below, it's a vertical stroke
                if np.sum(above) > 0 and np.sum(below) > 0:
                    vertical_count += 1
        
        return vertical_count
    
    @staticmethod
    def _check_line_continuity(binary_img: np.ndarray, x: int, y: int, w: int, h: int) -> float:
        """
        Check how continuous the line is.
        Real form lines are mostly continuous, text strokes have gaps.
        """
        # Extract the line region
        line_region = binary_img[y:y + h, x:x + w]
        
        if line_region.size == 0:
            return 0.0
        
        # Check horizontal projection
        horizontal_projection = np.sum(line_region, axis=0)
        
        # Count non-zero columns
        non_zero_count = np.count_nonzero(horizontal_projection)
        
        return non_zero_count / w if w > 0 else 0
    
    @staticmethod
    def _check_text_density_above(binary_img: np.ndarray, x: int, y: int, w: int, h: int) -> float:
        """
        Check density of pixels above the line.
        High density suggests text.
        """
        if y < 10:
            return 0.0
        
        above_region = binary_img[max(0, y - 10):y, x:x + w]
        
        if above_region.size == 0:
            return 0.0
        
        return np.sum(above_region) / (above_region.size * 255)
    
    @staticmethod
    def _check_text_density_below(binary_img: np.ndarray, x: int, y: int, w: int, h: int) -> float:
        """
        Check density of pixels below the line.
        """
        if y + h + 10 > binary_img.shape[0]:
            return 0.0
        
        below_region = binary_img[y + h:min(y + h + 10, binary_img.shape[0]), x:x + w]
        
        if below_region.size == 0:
            return 0.0
        
        return np.sum(below_region) / (below_region.size * 255)
    
    @staticmethod
    def _has_letter_pattern(binary_img: np.ndarray, x: int, y: int, w: int, h: int) -> bool:
        """
        Check if the line has patterns typical of letter tops (T, F, E, etc.)
        """
        # Short lines with many vertical strokes below are likely letter tops
        if w < 100:  # Short line
            # Count pixels immediately below
            if y + h + 8 < binary_img.shape[0]:
                below_region = binary_img[y + h:y + h + 8, x:x + w]
                if below_region.size > 0:
                    below_density = np.sum(below_region) / (below_region.size * 255)
                    
                    # Check for regular vertical patterns (like in TTT)
                    vertical_pattern = LineValidator._detect_vertical_pattern(below_region)
                    
                    if below_density > 0.2 and vertical_pattern:
                        return True
        
        return False
    
    @staticmethod
    def _detect_vertical_pattern(region: np.ndarray) -> bool:
        """
        Detect if there's a regular vertical pattern below the line.
        This is typical of letter sequences like TTT, FFF, etc.
        """
        if region.size == 0:
            return False
        
        # Sum vertically to get projection
        vertical_projection = np.sum(region, axis=0)
        
        # Look for regular peaks (vertical strokes)
        peaks = []
        for i in range(len(vertical_projection)):
            if vertical_projection[i] > region.shape[0] * 255 * 0.3:  # Significant vertical line
                peaks.append(i)
        
        # If we have multiple peaks with similar spacing, it's likely letters
        if len(peaks) >= 2:
            # Check if peaks are somewhat regularly spaced
            if len(peaks) >= 3:
                spacings = [peaks[i+1] - peaks[i] for i in range(len(peaks)-1)]
                avg_spacing = np.mean(spacings)
                std_spacing = np.std(spacings)
                
                # Regular spacing suggests letter pattern
                if std_spacing < avg_spacing * 0.5:  # Low variation in spacing
                    return True
        
        return False
    
    @staticmethod
    def _calculate_isolation_score(binary_img: np.ndarray, x: int, y: int, w: int, h: int) -> float:
        """
        Calculate how isolated the line is from surrounding content.
        Language-agnostic approach.
        Returns score 0-1, higher means more isolated.
        """
        score = 1.0
        
        # Check immediate surroundings
        margin = 3
        
        # Above
        if y > margin:
            above = binary_img[y - margin:y, x:x + w]
            if above.size > 0:
                density = np.sum(above) / (above.size * 255)
                score -= density * 0.3
        
        # Below
        if y + h + margin < binary_img.shape[0]:
            below = binary_img[y + h:y + h + margin, x:x + w]
            if below.size > 0:
                density = np.sum(below) / (below.size * 255)
                score -= density * 0.3
        
        # Left
        if x > margin:
            left = binary_img[y:y + h, x - margin:x]
            if left.size > 0:
                density = np.sum(left) / (left.size * 255)
                score -= density * 0.2
        
        # Right
        if x + w + margin < binary_img.shape[1]:
            right = binary_img[y:y + h, x + w:x + w + margin]
            if right.size > 0:
                density = np.sum(right) / (right.size * 255)
                score -= density * 0.2
        
        return max(0.0, score)
    
    @staticmethod
    def _check_surrounding_density(binary_img: np.ndarray, x: int, y: int, w: int, h: int) -> float:
        """
        Check overall density of pixels around the line.
        High density suggests the line is part of text block.
        Language-agnostic.
        """
        margin = 10
        
        # Define surrounding region
        y1 = max(0, y - margin)
        y2 = min(binary_img.shape[0], y + h + margin)
        x1 = max(0, x - margin)
        x2 = min(binary_img.shape[1], x + w + margin)
        
        # Extract region
        region = binary_img[y1:y2, x1:x2]
        
        if region.size == 0:
            return 0.0
        
        # Calculate density
        density = np.sum(region) / (region.size * 255)
        
        return density