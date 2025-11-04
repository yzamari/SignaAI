"""
SOLID-Compliant Prompt Generation Strategies
Single Responsibility: Each class handles one type of prompt generation
Open/Closed: New prompt strategies can be added without modification
"""

import logging
from typing import Optional
from .interfaces import PromptGenerator
from .language_patterns import LanguagePatternProvider

logger = logging.getLogger(__name__)

class FormSignaturePromptGenerator(PromptGenerator):
    """
    Generates prompts for form and signature field detection
    
    Single Responsibility: Only generates form/signature detection prompts
    Dependency Inversion: Depends on LanguagePatternProvider abstraction
    """
    
    def __init__(self, language_provider: LanguagePatternProvider):
        """
        Initialize with language pattern provider
        
        Args:
            language_provider: Provider for language-specific patterns
        """
        self.language_provider = language_provider
        self.base_template = """
You are analyzing a document image to find ALL fillable form fields where users need to enter information.

IMAGE SPECIFICATIONS:
- Image dimensions: {image_width}px width × {image_height}px height
- Coordinate system: Top-left corner is (0,0), bottom-right is ({image_width},{image_height})
- x increases from left to right, y increases from top to bottom

YOUR TASK:
Locate EVERY field where a user should write, sign, or fill information. Look for:
1. Horizontal lines (____) where text or signatures go
2. Empty boxes or rectangles for text entry
3. Spaces after labels like "Name:", "Date:", "Signature:" etc.
4. Any blank area clearly meant for user input

FIELD DETECTION RULES:
- Find the EXACT pixel position of each fillable line or box
- The x,y coordinates should be the TOP-LEFT corner of the fillable area
- Width should match the actual line/box width you see
- Height should be 30-40 pixels for most fields

{language_patterns}

FIELD TYPES:
- SIGNATURE: For signature lines (typically 200-400px wide)
- DATE: For date fields (typically 80-150px wide)
- TEXT: For name, address, and other text fields

CRITICAL COORDINATE ACCURACY:
- Measure the ACTUAL position of lines/boxes in the image
- x coordinate = horizontal position from left edge
- y coordinate = vertical position from top edge  
- Ensure coordinates are within: 0 <= x < {image_width}, 0 <= y < {image_height}

OUTPUT FORMAT - Return ONLY a JSON array:
[{{"type": "SIGNATURE", "x": 450, "y": 1200, "width": 300, "height": 35, "label": "חתימת המשכיר"}}]

Do NOT include markdown formatting. Return raw JSON only.
"""
    
    def generate_detection_prompt(
        self,
        image_width: int,
        image_height: int,
        language_hint: Optional[str] = None,
        document_type: Optional[str] = None
    ) -> str:
        """
        Generate form/signature detection prompt
        
        Args:
            image_width: Image width in pixels
            image_height: Image height in pixels
            language_hint: Optional language hint
            document_type: Optional document type (unused in this strategy)
            
        Returns:
            Generated prompt string
        """
        # Get language-specific patterns
        language_patterns = self._generate_language_section(language_hint)
        
        return self.base_template.format(
            image_width=image_width,
            image_height=image_height,
            language_patterns=language_patterns
        ).strip()
    
    def _generate_language_section(self, language_hint: Optional[str]) -> str:
        """Generate language-specific pattern section"""
        if not language_hint:
            language_hint = 'en'
        
        patterns = self.language_provider.get_patterns_for_language(language_hint)
        
        sections = []
        
        if language_hint.lower() == 'he' or 'he' in self.language_provider.get_supported_languages():
            he_patterns = self.language_provider.get_patterns_for_language('he')
            sections.append("HEBREW:")
            sections.append(f"- חתימה, חתימת = Signature")
            sections.append(f"- תאריך = Date")
            sections.append(f"- שם = Name")
            sections.append(f"- ת.ז, תעודת זהות = ID Number")
        
        if language_hint.lower() == 'ar' or 'ar' in self.language_provider.get_supported_languages():
            ar_patterns = self.language_provider.get_patterns_for_language('ar')
            sections.append("\nARABIC:")
            sections.append(f"- التوقيع = Signature")
            sections.append(f"- تاريخ = Date")
            sections.append(f"- الاسم = Name")
            sections.append(f"- رقم الهوية = ID Number")
        
        # Always include English
        en_patterns = self.language_provider.get_patterns_for_language('en')
        sections.append("\nENGLISH:")
        sections.append(f"- Signature, Sign here")
        sections.append(f"- Date")
        sections.append(f"- Name, Full Name")
        sections.append(f"- Address, Phone, Tel")
        
        return "MULTI-LANGUAGE LABELS TO LOOK FOR:\n\n" + "\n".join(sections)

class ContextAwarePromptGenerator(PromptGenerator):
    """
    Context-aware prompt generator with document type awareness
    
    Open/Closed Principle: Extension of basic prompt generation
    """
    
    def __init__(
        self, 
        language_provider: LanguagePatternProvider,
        document_contexts: Optional[dict] = None
    ):
        self.language_provider = language_provider
        self.document_contexts = document_contexts or self._get_default_contexts()
        
        self.base_template = """
Analyze this {document_type} document image ({image_width}x{image_height} pixels) for fillable fields.

{document_specific_instructions}

Look for these field types with their typical characteristics:
{field_type_guidance}

{language_patterns}

Return ONLY a JSON array with detected fields:
[{{"type": "signature", "x": 100, "y": 200, "width": 300, "height": 40, "confidence": 0.9, "label": "Signature"}}]

Focus on accuracy of coordinates in pixels from top-left (0,0).
"""
    
    def generate_detection_prompt(
        self,
        image_width: int,
        image_height: int,
        language_hint: Optional[str] = None,
        document_type: Optional[str] = None
    ) -> str:
        """Generate context-aware detection prompt"""
        
        # Get document-specific context
        doc_instructions = self._get_document_instructions(document_type)
        field_guidance = self._get_field_type_guidance(document_type)
        
        # Get language patterns
        language_patterns = self._generate_language_patterns(language_hint)
        
        return self.base_template.format(
            document_type=document_type or "form",
            image_width=image_width,
            image_height=image_height,
            document_specific_instructions=doc_instructions,
            field_type_guidance=field_guidance,
            language_patterns=language_patterns
        ).strip()
    
    def _get_default_contexts(self) -> dict:
        """Get default document type contexts"""
        return {
            'contract': {
                'instructions': 'Pay special attention to signature blocks, date fields, and party information areas.',
                'field_guidance': 'Contracts typically have 2+ signature areas, date fields near signatures, and name/title fields.'
            },
            'form': {
                'instructions': 'Look for structured form fields with labels and input areas.',
                'field_guidance': 'Forms have consistent field spacing and clear label-input relationships.'
            },
            'agreement': {
                'instructions': 'Focus on party signatures, witness signatures, and date attestation fields.',
                'field_guidance': 'Agreements often have multiple signature blocks and notarization areas.'
            }
        }
    
    def _get_document_instructions(self, document_type: Optional[str]) -> str:
        """Get document-type specific instructions"""
        if not document_type or document_type not in self.document_contexts:
            return "Focus on all potential fillable areas in this document."
        
        return self.document_contexts[document_type]['instructions']
    
    def _get_field_type_guidance(self, document_type: Optional[str]) -> str:
        """Get field type guidance for document type"""
        if not document_type or document_type not in self.document_contexts:
            return "Look for signature lines, date fields, text input areas, and initial boxes."
        
        return self.document_contexts[document_type]['field_guidance']
    
    def _generate_language_patterns(self, language_hint: Optional[str]) -> str:
        """Generate language pattern section"""
        # Delegate to form generator for consistency
        form_generator = FormSignaturePromptGenerator(self.language_provider)
        return form_generator._generate_language_section(language_hint)

class MinimalPromptGenerator(PromptGenerator):
    """
    Minimal prompt generator for fast processing
    
    Liskov Substitution: Can replace other generators with simpler approach
    """
    
    def __init__(self):
        self.template = """
Find all fillable form fields in this {image_width}x{image_height} pixel image.
Return JSON array: [{{"type": "signature|date|text", "x": 0, "y": 0, "width": 100, "height": 30}}]
"""
    
    def generate_detection_prompt(
        self,
        image_width: int,
        image_height: int,
        language_hint: Optional[str] = None,
        document_type: Optional[str] = None
    ) -> str:
        """Generate minimal detection prompt"""
        return self.template.format(
            image_width=image_width,
            image_height=image_height
        ).strip()

class PromptGeneratorFactory:
    """
    Factory for creating prompt generators
    
    Single Responsibility: Creates appropriate prompt generators
    Dependency Inversion: Returns abstractions, not concretions
    """
    
    @staticmethod
    def create_form_signature_generator(
        language_provider: LanguagePatternProvider
    ) -> PromptGenerator:
        """Create form/signature prompt generator"""
        return FormSignaturePromptGenerator(language_provider)
    
    @staticmethod
    def create_context_aware_generator(
        language_provider: LanguagePatternProvider,
        document_contexts: Optional[dict] = None
    ) -> PromptGenerator:
        """Create context-aware prompt generator"""
        return ContextAwarePromptGenerator(language_provider, document_contexts)
    
    @staticmethod
    def create_minimal_generator() -> PromptGenerator:
        """Create minimal prompt generator"""
        return MinimalPromptGenerator()
    
    @staticmethod
    def create_from_config(
        config: dict,
        language_provider: LanguagePatternProvider
    ) -> PromptGenerator:
        """Create prompt generator from configuration"""
        generator_type = config.get('type', 'form_signature')
        
        if generator_type == 'form_signature':
            return FormSignaturePromptGenerator(language_provider)
        elif generator_type == 'context_aware':
            return ContextAwarePromptGenerator(
                language_provider,
                config.get('document_contexts')
            )
        elif generator_type == 'minimal':
            return MinimalPromptGenerator()
        else:
            raise ValueError(f"Unknown prompt generator type: {generator_type}")