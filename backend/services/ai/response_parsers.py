"""
SOLID-Compliant Response Parser Implementations
Single Responsibility: Each parser handles one type of response format
Open/Closed: New parsers can be added without modifying existing code
"""

import json
import logging
import re
from typing import List, Dict, Any, Optional
from .interfaces import ResponseParser, DetectionField, CoordinateValidator

logger = logging.getLogger(__name__)

class JSONResponseParser(ResponseParser):
    """
    Standard JSON response parser
    
    Single Responsibility: Parse JSON responses from AI providers
    Dependency Inversion: Uses CoordinateValidator abstraction
    """
    
    def __init__(
        self,
        coordinate_validator: CoordinateValidator,
        field_enhancer: Optional['FieldEnhancer'] = None
    ):
        """
        Initialize with dependencies
        
        Args:
            coordinate_validator: Validator for coordinates
            field_enhancer: Optional field enhancement strategy
        """
        self.coordinate_validator = coordinate_validator
        self.field_enhancer = field_enhancer or DefaultFieldEnhancer()
    
    def parse_detection_response(
        self,
        response_text: str,
        image_width: int,
        image_height: int
    ) -> List[DetectionField]:
        """
        Parse JSON response into detection fields
        
        Args:
            response_text: Raw AI response text
            image_width: Image width in pixels
            image_height: Image height in pixels
            
        Returns:
            List of parsed detection fields
        """
        try:
            # Clean response text (remove markdown if present)
            cleaned_text = self._clean_response_text(response_text)
            logger.debug(f"Cleaned response length: {len(cleaned_text)} chars")
            
            # Parse JSON
            fields_data = json.loads(cleaned_text)
            
            if not isinstance(fields_data, list):
                logger.warning("Response is not a JSON array, attempting to extract array")
                fields_data = self._extract_array_from_response(fields_data)
            
            # Convert to DetectionField objects
            detection_fields = []
            for i, field_data in enumerate(fields_data):
                try:
                    field = self._parse_single_field(
                        field_data, 
                        image_width, 
                        image_height
                    )
                    if field:
                        detection_fields.append(field)
                        logger.debug(f"Parsed field {i+1}: {field.type} at ({field.x:.0f},{field.y:.0f})")
                except Exception as e:
                    logger.warning(f"Failed to parse field {i+1}: {e}")
                    continue
            
            logger.info(f"Successfully parsed {len(detection_fields)} fields")
            return detection_fields
            
        except json.JSONDecodeError as e:
            logger.error(f"JSON parsing failed: {e}")
            logger.debug(f"Problem text: {response_text[:200]}...")
            return []
        except Exception as e:
            logger.error(f"Response parsing failed: {e}")
            return []
    
    def _clean_response_text(self, response_text: str) -> str:
        """Remove markdown formatting and extract JSON"""
        
        # Remove markdown code blocks
        if response_text.startswith('```json'):
            response_text = response_text.strip()
            response_text = response_text[7:]  # Remove ```json
            if response_text.endswith('```'):
                response_text = response_text[:-3]  # Remove ```
        elif response_text.startswith('```'):
            lines = response_text.strip().split('\n')
            if len(lines) > 2:
                response_text = '\n'.join(lines[1:-1])  # Remove first and last line
        
        # Extract JSON array if embedded in other text
        json_start = response_text.find('[')
        json_end = response_text.rfind(']') + 1
        
        if json_start >= 0 and json_end > json_start:
            response_text = response_text[json_start:json_end]
        
        return response_text.strip()
    
    def _extract_array_from_response(self, data: Any) -> List[Dict[str, Any]]:
        """Extract array from non-array response"""
        if isinstance(data, dict):
            # Look for common array keys
            for key in ['fields', 'results', 'detections', 'data']:
                if key in data and isinstance(data[key], list):
                    return data[key]
            # If no array found, wrap single object
            return [data]
        return []
    
    def _parse_single_field(
        self,
        field_data: Dict[str, Any],
        image_width: int,
        image_height: int
    ) -> Optional[DetectionField]:
        """Parse single field data into DetectionField"""
        
        # Extract required fields with validation
        required_fields = ['type', 'x', 'y', 'width', 'height']
        for field in required_fields:
            if field not in field_data:
                logger.warning(f"Missing required field: {field}")
                return None
        
        try:
            # Extract coordinates
            raw_x = float(field_data['x'])
            raw_y = float(field_data['y'])
            raw_width = float(field_data['width'])
            raw_height = float(field_data['height'])
            
            # Validate and normalize coordinates
            x, y, width, height = self.coordinate_validator.validate_and_normalize(
                raw_x, raw_y, raw_width, raw_height, image_width, image_height
            )
            
            # Extract other fields
            field_type = str(field_data['type']).upper()
            confidence = float(field_data.get('confidence', 0.85))
            label = field_data.get('label', '')
            
            # Enhance field if enhancer is available
            if self.field_enhancer:
                label = self.field_enhancer.enhance_label(label, field_type, field_data)
            
            return DetectionField(
                type=field_type,
                page=1,  # Default page
                x=x,
                y=y,
                width=width,
                height=height,
                confidence=confidence,
                label=label,
                metadata={
                    'parser': 'json',
                    'raw_x': raw_x,
                    'raw_y': raw_y,
                    'raw_width': raw_width,
                    'raw_height': raw_height
                }
            )
            
        except (ValueError, TypeError) as e:
            logger.warning(f"Invalid field data types: {e}")
            return None

class MarkdownResponseParser(ResponseParser):
    """
    Markdown-aware response parser
    
    Open/Closed Principle: Extension for handling markdown responses
    """
    
    def __init__(self, coordinate_validator: CoordinateValidator):
        self.coordinate_validator = coordinate_validator
        self.json_parser = JSONResponseParser(coordinate_validator)
    
    def parse_detection_response(
        self,
        response_text: str,
        image_width: int,
        image_height: int
    ) -> List[DetectionField]:
        """Parse markdown-formatted responses"""
        
        # Extract JSON from markdown
        json_text = self._extract_json_from_markdown(response_text)
        
        # Delegate to JSON parser
        return self.json_parser.parse_detection_response(
            json_text, image_width, image_height
        )
    
    def _extract_json_from_markdown(self, text: str) -> str:
        """Extract JSON content from markdown formatting"""
        
        # Look for JSON code blocks
        json_pattern = r'```(?:json)?\s*(\[.*?\])\s*```'
        matches = re.findall(json_pattern, text, re.DOTALL)
        
        if matches:
            return matches[0]
        
        # Fallback: look for array patterns
        array_pattern = r'\[.*?\]'
        matches = re.findall(array_pattern, text, re.DOTALL)
        
        if matches:
            return matches[-1]  # Return last/largest match
        
        return text

class FallbackResponseParser(ResponseParser):
    """
    Fallback parser for handling malformed responses
    
    Liskov Substitution: Can substitute other parsers when they fail
    """
    
    def __init__(self, coordinate_validator: CoordinateValidator):
        self.coordinate_validator = coordinate_validator
    
    def parse_detection_response(
        self,
        response_text: str,
        image_width: int,
        image_height: int
    ) -> List[DetectionField]:
        """Parse response with fallback strategies"""
        
        # Try to extract any numeric patterns that could be coordinates
        coordinates = self._extract_coordinates(response_text)
        
        if not coordinates:
            # Return default signature field
            return self._get_default_fields(image_width, image_height)
        
        # Convert coordinates to fields
        fields = []
        for i, coords in enumerate(coordinates):
            try:
                x, y, w, h = self.coordinate_validator.validate_and_normalize(
                    coords[0], coords[1], coords[2], coords[3],
                    image_width, image_height
                )
                
                fields.append(DetectionField(
                    type="SIGNATURE",
                    page=1,
                    x=x, y=y, width=w, height=h,
                    confidence=0.5,
                    label=f"Fallback Field {i+1}",
                    metadata={'parser': 'fallback'}
                ))
            except Exception:
                continue
        
        return fields if fields else self._get_default_fields(image_width, image_height)
    
    def _extract_coordinates(self, text: str) -> List[tuple]:
        """Extract coordinate-like numbers from text"""
        # Look for patterns like (x, y, w, h) or x:100 y:200 w:300 h:40
        patterns = [
            r'\((\d+),\s*(\d+),\s*(\d+),\s*(\d+)\)',  # (x,y,w,h)
            r'x[:\s]*(\d+)[,\s]*y[:\s]*(\d+)[,\s]*w[:\s]*(\d+)[,\s]*h[:\s]*(\d+)',  # x:100 y:200...
            r'(\d+)\s+(\d+)\s+(\d+)\s+(\d+)'  # Space-separated numbers
        ]
        
        coordinates = []
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                try:
                    coords = tuple(float(x) for x in match)
                    if len(coords) == 4:
                        coordinates.append(coords)
                except ValueError:
                    continue
        
        return coordinates[:5]  # Limit to 5 fields max
    
    def _get_default_fields(self, image_width: int, image_height: int) -> List[DetectionField]:
        """Return default signature fields when parsing fails completely"""
        return [
            DetectionField(
                type="SIGNATURE",
                page=1,
                x=int(0.1 * image_width),
                y=int(0.7 * image_height),
                width=300,
                height=40,
                confidence=0.3,
                label="Default Signature",
                metadata={'parser': 'fallback_default'}
            )
        ]

class FieldEnhancer:
    """
    Field enhancement strategy interface
    
    Single Responsibility: Enhance field labels and metadata
    """
    
    def enhance_label(
        self, 
        original_label: str, 
        field_type: str, 
        field_data: Dict[str, Any]
    ) -> str:
        """Enhance field label"""
        raise NotImplementedError

class DefaultFieldEnhancer(FieldEnhancer):
    """Default field enhancer implementation"""
    
    def enhance_label(
        self, 
        original_label: str, 
        field_type: str, 
        field_data: Dict[str, Any]
    ) -> str:
        """Enhance label with multilingual fallbacks"""
        
        if original_label and original_label not in ['null', None, '', 'N/A']:
            return original_label
        
        # Generate multilingual label based on type
        type_upper = field_type.upper()
        
        if type_upper == 'SIGNATURE':
            return 'Signature / חתימה / التوقيع'
        elif type_upper == 'DATE':
            return 'Date / תאריך / تاريخ'
        elif type_upper in ['INITIALS', 'INITIAL']:
            return 'Initials / ראשי תיבות / الأحرف الأولى'
        elif type_upper == 'TEXT':
            # Contextual enhancement based on position
            y_pos = field_data.get('y', 0)
            if y_pos > 600:
                return 'Details / פרטים / تفاصيل'
            else:
                return 'Text / טקסט / نص'
        else:
            return field_type

class ResponseParserFactory:
    """
    Factory for creating response parsers
    
    Single Responsibility: Creates appropriate parsers
    Dependency Inversion: Returns abstractions
    """
    
    @staticmethod
    def create_json_parser(
        coordinate_validator: CoordinateValidator,
        field_enhancer: Optional[FieldEnhancer] = None
    ) -> ResponseParser:
        """Create JSON response parser"""
        return JSONResponseParser(coordinate_validator, field_enhancer)
    
    @staticmethod
    def create_markdown_parser(
        coordinate_validator: CoordinateValidator
    ) -> ResponseParser:
        """Create markdown-aware parser"""
        return MarkdownResponseParser(coordinate_validator)
    
    @staticmethod
    def create_fallback_parser(
        coordinate_validator: CoordinateValidator
    ) -> ResponseParser:
        """Create fallback parser"""
        return FallbackResponseParser(coordinate_validator)
    
    @staticmethod
    def create_from_config(
        config: Dict[str, Any],
        coordinate_validator: CoordinateValidator
    ) -> ResponseParser:
        """Create parser from configuration"""
        parser_type = config.get('type', 'json')
        
        if parser_type == 'json':
            enhancer = DefaultFieldEnhancer() if config.get('enhance_fields', True) else None
            return JSONResponseParser(coordinate_validator, enhancer)
        elif parser_type == 'markdown':
            return MarkdownResponseParser(coordinate_validator)
        elif parser_type == 'fallback':
            return FallbackResponseParser(coordinate_validator)
        else:
            raise ValueError(f"Unknown parser type: {parser_type}")