"""
SOLID-Compliant Interfaces for Field Detection Services
Implements proper abstractions to support dependency inversion and substitutability
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, Protocol
from dataclasses import dataclass
from enum import Enum
import numpy as np
from PIL import Image

@dataclass
class DetectionField:
    """Standardized field detection result"""
    type: str
    page: int
    x: float
    y: float
    width: float
    height: float
    confidence: float
    label: Optional[str] = None
    language: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class DetectionStrategy(Enum):
    """Available field detection strategies"""
    AI_ONLY = "ai_only"
    CV_ONLY = "cv_only" 
    HYBRID = "hybrid"

# Core Detection Interface
class FieldDetector(Protocol):
    """Protocol defining field detection capability"""
    
    async def detect_fields(
        self,
        input_data: Any,
        context: Optional[Dict[str, Any]] = None
    ) -> List[DetectionField]:
        """
        Detect signature/form fields in input data
        
        Args:
            input_data: Input data (image, bytes, etc.)
            context: Optional context information
            
        Returns:
            List of detected fields
        """
        ...

# AI Detection Interfaces
class AIProvider(ABC):
    """Abstract base for AI detection providers"""
    
    @abstractmethod
    async def generate_response(
        self,
        prompt: str,
        image: Image.Image,
        config: Optional[Dict[str, Any]] = None
    ) -> str:
        """Generate AI response for field detection"""
        pass
    
    @abstractmethod
    def get_provider_name(self) -> str:
        """Get provider identifier"""
        pass

class PromptGenerator(ABC):
    """Abstract prompt generation strategy"""
    
    @abstractmethod
    def generate_detection_prompt(
        self,
        image_width: int,
        image_height: int,
        language_hint: Optional[str] = None,
        document_type: Optional[str] = None
    ) -> str:
        """Generate field detection prompt"""
        pass

class ResponseParser(ABC):
    """Abstract response parsing strategy"""
    
    @abstractmethod
    def parse_detection_response(
        self,
        response_text: str,
        image_width: int,
        image_height: int
    ) -> List[DetectionField]:
        """Parse AI response into detection fields"""
        pass

# Computer Vision Interfaces  
class CVFieldDetector(ABC):
    """Abstract computer vision field detector"""
    
    @abstractmethod
    def detect_fields_from_image(
        self,
        image: np.ndarray
    ) -> List[DetectionField]:
        """Detect fields using computer vision"""
        pass

# Document Processing Interfaces
class DocumentProcessor(ABC):
    """Abstract document processing"""
    
    @abstractmethod
    async def extract_pages(
        self,
        document_bytes: bytes
    ) -> List[Dict[str, Any]]:
        """Extract pages from document with metadata"""
        pass

class CoordinateValidator(ABC):
    """Abstract coordinate validation"""
    
    @abstractmethod
    def validate_and_normalize(
        self,
        x: float,
        y: float,
        width: float,
        height: float,
        image_width: int,
        image_height: int
    ) -> tuple[float, float, float, float]:
        """Validate and normalize coordinates"""
        pass

# Language Support Interfaces
class LanguagePatternProvider(ABC):
    """Abstract language pattern provider"""
    
    @abstractmethod
    def get_patterns_for_language(
        self,
        language_code: str
    ) -> Dict[str, List[str]]:
        """Get field patterns for specific language"""
        pass
    
    @abstractmethod
    def get_supported_languages(self) -> List[str]:
        """Get list of supported language codes"""
        pass
    
    @abstractmethod
    def detect_language(
        self,
        text: str
    ) -> Optional[str]:
        """Detect language from text sample"""
        pass

# Service Integration Interfaces
class DetectionService(ABC):
    """High-level detection service interface"""
    
    @abstractmethod
    async def detect_signature_fields(
        self,
        document_bytes: bytes,
        options: Optional[Dict[str, Any]] = None
    ) -> List[DetectionField]:
        """
        Main entry point for field detection
        
        Args:
            document_bytes: Document to process
            options: Detection options (language, strategy, etc.)
            
        Returns:
            Detected fields across all pages
        """
        pass

# Configuration Interfaces
class DetectionConfig(Protocol):
    """Configuration for detection services"""
    
    strategy: DetectionStrategy
    language_hint: Optional[str]
    confidence_threshold: float
    max_fields_per_page: int
    enable_fallback: bool

# Factory Interfaces
class DetectionServiceFactory(ABC):
    """Abstract factory for creating detection services"""
    
    @abstractmethod
    def create_ai_detector(
        self,
        provider_config: Dict[str, Any]
    ) -> FieldDetector:
        """Create AI-based field detector"""
        pass
    
    @abstractmethod
    def create_cv_detector(
        self,
        cv_config: Dict[str, Any]
    ) -> FieldDetector:
        """Create computer vision field detector"""
        pass
    
    @abstractmethod
    def create_hybrid_detector(
        self,
        ai_config: Dict[str, Any],
        cv_config: Dict[str, Any]
    ) -> FieldDetector:
        """Create hybrid detection service"""
        pass