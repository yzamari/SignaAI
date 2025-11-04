"""
SOLID-Compliant Language Pattern Services
Open/Closed: Can add new languages without modifying existing code
Single Responsibility: Language pattern management separated from detection logic
"""

import logging
from typing import Dict, List, Optional
from .interfaces import LanguagePatternProvider

logger = logging.getLogger(__name__)

class ConfigurableLanguagePatterns(LanguagePatternProvider):
    """
    Configurable language pattern provider
    
    Open/Closed Principle: New languages can be added via configuration
    Single Responsibility: Only manages language patterns
    """
    
    def __init__(self, pattern_config: Optional[Dict[str, Dict[str, List[str]]]] = None):
        """
        Initialize with pattern configuration
        
        Args:
            pattern_config: Optional external pattern configuration
        """
        self._patterns = pattern_config or self._get_default_patterns()
        self._language_detection_cache = {}
    
    def get_patterns_for_language(self, language_code: str) -> Dict[str, List[str]]:
        """
        Get field patterns for specific language
        
        Args:
            language_code: Language code (e.g., 'en', 'he', 'ar')
            
        Returns:
            Dictionary of field type -> pattern list
        """
        language_code = language_code.lower()
        
        if language_code not in self._patterns:
            logger.warning(f"Language '{language_code}' not supported, using English")
            language_code = 'en'
        
        return self._patterns[language_code].copy()
    
    def get_supported_languages(self) -> List[str]:
        """Get list of supported language codes"""
        return list(self._patterns.keys())
    
    def detect_language(self, text: str) -> Optional[str]:
        """
        Basic language detection from text sample
        
        Args:
            text: Text sample to analyze
            
        Returns:
            Detected language code or None
        """
        if not text:
            return None
        
        # Cache check
        text_key = text[:100].lower()  # Use first 100 chars as key
        if text_key in self._language_detection_cache:
            return self._language_detection_cache[text_key]
        
        # Simple heuristic-based detection
        detected_lang = self._detect_by_patterns(text)
        self._language_detection_cache[text_key] = detected_lang
        
        return detected_lang
    
    def add_language_patterns(
        self, 
        language_code: str, 
        patterns: Dict[str, List[str]]
    ) -> None:
        """
        Add new language patterns (Open/Closed compliance)
        
        Args:
            language_code: New language code
            patterns: Pattern dictionary for the language
        """
        self._patterns[language_code.lower()] = patterns
        logger.info(f"Added patterns for language: {language_code}")
    
    def _get_default_patterns(self) -> Dict[str, Dict[str, List[str]]]:
        """Get default language patterns"""
        return {
            'en': {
                'signature': ['signature', 'sign here', 'signed by', 'signature of', 'authorized signature', 'witness'],
                'date': ['date', 'dated', 'day', 'month', 'year', 'mm/dd/yyyy', 'dd/mm/yyyy'],
                'initial': ['initial', 'initials', 'init', 'initial here'],
                'name': ['name', 'full name', 'first name', 'last name', 'print name']
            },
            'he': {
                'signature': ['חתימה', 'חתום כאן', 'חתימת', 'בחתימה', 'חותמת', 'אישור', 'מאשר', 'הח״מ'],
                'date': ['תאריך', 'ביום', 'בחדש', 'שנת', 'יום', 'חודש', 'שנה'],
                'initial': ['ראשי תיבות', 'ר״ת', 'חתימה ראשית', 'אישור'],
                'name': ['שם', 'שם מלא', 'שם פרטי', 'שם משפחה']
            },
            'ar': {
                'signature': ['التوقيع', 'وقع هنا', 'توقيع', 'المُوقع', 'التصديق', 'المصادقة', 'الختم', 'إمضاء'],
                'date': ['التاريخ', 'يوم', 'شهر', 'سنة', 'التاريخ'],
                'initial': ['الأحرف الأولى', 'الاختصار', 'التوقيع المبدئي'],
                'name': ['الاسم', 'الاسم الكامل', 'الاسم الأول', 'اسم العائلة']
            },
            'es': {
                'signature': ['firma', 'firme aquí', 'firmado por', 'firma de', 'firma autorizada', 'testigo'],
                'date': ['fecha', 'día', 'mes', 'año', 'fechado'],
                'initial': ['inicial', 'iniciales', 'inicial aquí'],
                'name': ['nombre', 'nombre completo', 'nombre', 'apellido']
            },
            'fr': {
                'signature': ['signature', 'signer ici', 'signé par', 'signature de', 'signature autorisée', 'témoin'],
                'date': ['date', 'jour', 'mois', 'année', 'daté'],
                'initial': ['initiale', 'initiales', 'paraphe'],
                'name': ['nom', 'nom complet', 'prénom', 'nom de famille']
            }
        }
    
    def _detect_by_patterns(self, text: str) -> Optional[str]:
        """Detect language using pattern matching"""
        text_lower = text.lower()
        language_scores = {}
        
        # Score each language based on pattern matches
        for lang_code, patterns in self._patterns.items():
            score = 0
            for pattern_type, pattern_list in patterns.items():
                for pattern in pattern_list:
                    if pattern.lower() in text_lower:
                        score += 1
            
            if score > 0:
                language_scores[lang_code] = score
        
        if not language_scores:
            return None
        
        # Return language with highest score
        return max(language_scores.items(), key=lambda x: x[1])[0]

class StaticLanguagePatterns(LanguagePatternProvider):
    """
    Static language patterns for backward compatibility
    
    Demonstrates Liskov Substitution: Can replace ConfigurableLanguagePatterns
    """
    
    def __init__(self):
        self._configurable = ConfigurableLanguagePatterns()
    
    def get_patterns_for_language(self, language_code: str) -> Dict[str, List[str]]:
        """Delegate to configurable implementation"""
        return self._configurable.get_patterns_for_language(language_code)
    
    def get_supported_languages(self) -> List[str]:
        """Delegate to configurable implementation"""
        return self._configurable.get_supported_languages()
    
    def detect_language(self, text: str) -> Optional[str]:
        """Delegate to configurable implementation"""  
        return self._configurable.detect_language(text)

class LanguagePatternFactory:
    """
    Factory for creating language pattern providers
    
    Dependency Inversion: Clients depend on abstractions, not concretions
    """
    
    @staticmethod
    def create_configurable_provider(
        custom_patterns: Optional[Dict[str, Dict[str, List[str]]]] = None
    ) -> LanguagePatternProvider:
        """Create configurable language pattern provider"""
        return ConfigurableLanguagePatterns(custom_patterns)
    
    @staticmethod
    def create_static_provider() -> LanguagePatternProvider:
        """Create static language pattern provider"""
        return StaticLanguagePatterns()
    
    @staticmethod
    def create_from_config(config: Dict[str, any]) -> LanguagePatternProvider:
        """
        Create provider from configuration
        
        Args:
            config: Configuration dictionary
            
        Returns:
            Appropriate language pattern provider
        """
        provider_type = config.get('type', 'static')
        
        if provider_type == 'configurable':
            custom_patterns = config.get('patterns')
            return ConfigurableLanguagePatterns(custom_patterns)
        else:
            return StaticLanguagePatterns()