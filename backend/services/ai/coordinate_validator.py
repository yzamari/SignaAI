"""
SOLID-Compliant Coordinate Validation Service
Single Responsibility: Validate and normalize field coordinates
"""

import logging
from typing import Tuple
from .interfaces import CoordinateValidator

logger = logging.getLogger(__name__)

class StandardCoordinateValidator(CoordinateValidator):
    """
    Standard implementation of coordinate validation
    
    Single Responsibility: Ensures field coordinates are valid and within bounds
    Open/Closed: Can be extended with custom validation rules
    """
    
    def __init__(
        self,
        min_field_width: int = 80,
        min_field_height: int = 25,
        max_field_height: int = 60,
        max_width_ratio: float = 0.8
    ):
        self.min_field_width = min_field_width
        self.min_field_height = min_field_height
        self.max_field_height = max_field_height
        self.max_width_ratio = max_width_ratio
    
    def validate_and_normalize(
        self,
        x: float,
        y: float,
        width: float,
        height: float,
        image_width: int,
        image_height: int
    ) -> Tuple[float, float, float, float]:
        """
        Validate and normalize field coordinates
        
        Args:
            x, y, width, height: Original coordinates
            image_width, image_height: Image dimensions
            
        Returns:
            Tuple of normalized (x, y, width, height)
        """
        logger.debug(
            f"Validating coords: x={x}, y={y}, w={width}, h={height} "
            f"(image: {image_width}x{image_height})"
        )
        
        # Ensure coordinates are within image bounds
        x = max(0, min(x, image_width - 50))
        y = max(0, min(y, image_height - 20))
        
        # Validate and fix width
        if width <= 0 or width > image_width:
            width = min(300, image_width * 0.4)  # Default reasonable width
        
        # Validate and fix height  
        if height <= 0 or height > image_height:
            height = 35  # Standard field height
        
        # Ensure dimensions don't exceed bounds
        width = min(width, image_width - x)
        height = min(height, image_height - y)
        
        # Apply minimum constraints
        width = max(width, self.min_field_width)
        height = max(height, self.min_field_height)
        
        # Apply maximum constraints
        width = min(width, image_width * self.max_width_ratio)
        height = min(height, self.max_field_height)
        
        logger.debug(f"Normalized coords: x={x}, y={y}, w={width}, h={height}")
        return x, y, width, height

class StrictCoordinateValidator(CoordinateValidator):
    """
    Strict coordinate validator with tighter constraints
    
    Demonstrates Open/Closed Principle: Extension without modification
    """
    
    def __init__(self):
        self.min_field_width = 100
        self.min_field_height = 30
        self.max_field_height = 45
        self.max_width_ratio = 0.6
    
    def validate_and_normalize(
        self,
        x: float,
        y: float, 
        width: float,
        height: float,
        image_width: int,
        image_height: int
    ) -> Tuple[float, float, float, float]:
        """Strict validation with tighter bounds"""
        
        # Apply stricter bounds checking
        if x < 0 or x >= image_width * 0.95:
            raise ValueError(f"X coordinate {x} outside strict bounds")
        
        if y < 0 or y >= image_height * 0.95:
            raise ValueError(f"Y coordinate {y} outside strict bounds")
        
        # More conservative width/height validation
        if width < self.min_field_width or width > image_width * self.max_width_ratio:
            width = max(self.min_field_width, min(width, image_width * self.max_width_ratio))
        
        if height < self.min_field_height or height > self.max_field_height:
            height = max(self.min_field_height, min(height, self.max_field_height))
        
        return x, y, width, height