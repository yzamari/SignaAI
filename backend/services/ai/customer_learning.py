"""
Sprint 4: Customer Learning System
Personalized AI field detection based on customer patterns

Features:
- Learn from customer field adjustments
- Store customer-specific templates
- Improve detection accuracy over time
- Industry-specific patterns

Root Cause: Need for personalized detection that improves with usage
Fix: Machine learning system that adapts to each customer's document patterns
"""

import json
import logging
from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
import numpy as np
from collections import defaultdict
import pickle
import hashlib

from sqlalchemy.orm import Session
from sqlalchemy import and_, func

logger = logging.getLogger(__name__)


@dataclass
class FieldPattern:
    """Represents a learned field pattern"""
    field_type: str
    page: int
    x: float
    y: float
    width: float
    height: float
    confidence: float
    language: str
    document_type: str
    occurrences: int = 1
    last_seen: str = ""
    
    def __post_init__(self):
        if not self.last_seen:
            self.last_seen = datetime.now().isoformat()


@dataclass
class CustomerProfile:
    """Customer-specific learning profile"""
    customer_id: str
    industry: Optional[str]
    document_count: int
    field_patterns: List[FieldPattern]
    template_hashes: List[str]  # Hashes of commonly used templates
    preferred_languages: List[str]
    average_fields_per_doc: float
    last_updated: str
    learning_enabled: bool = True


class CustomerLearningService:
    """
    Service for customer-specific field detection learning
    """
    
    # Industry-specific field patterns
    INDUSTRY_PATTERNS = {
        'legal': {
            'signature_locations': [(0.1, 0.85), (0.6, 0.85)],  # Common for contracts
            'typical_fields': ['signature', 'date', 'witness', 'notary'],
            'multi_page': True
        },
        'real_estate': {
            'signature_locations': [(0.1, 0.9), (0.5, 0.9)],  # Buyer/Seller signatures
            'typical_fields': ['signature', 'date', 'initial', 'address'],
            'multi_page': True
        },
        'medical': {
            'signature_locations': [(0.7, 0.9)],  # Single signature, bottom right
            'typical_fields': ['signature', 'date', 'consent'],
            'multi_page': False
        },
        'finance': {
            'signature_locations': [(0.1, 0.8), (0.5, 0.8)],
            'typical_fields': ['signature', 'date', 'account', 'amount'],
            'multi_page': True
        },
        'general': {
            'signature_locations': [(0.1, 0.85)],
            'typical_fields': ['signature', 'date'],
            'multi_page': False
        }
    }
    
    def __init__(self, db: Optional[Session] = None, cache_dir: str = "/tmp/customer_learning"):
        """
        Initialize customer learning service
        
        Args:
            db: Database session
            cache_dir: Directory for caching customer profiles
        """
        self.db = db
        self.cache_dir = cache_dir
        self.profiles: Dict[str, CustomerProfile] = {}
        self._ensure_cache_dir()
    
    def _ensure_cache_dir(self):
        """Ensure cache directory exists"""
        import os
        os.makedirs(self.cache_dir, exist_ok=True)
    
    async def get_customer_profile(
        self,
        customer_id: str,
        create_if_missing: bool = True
    ) -> Optional[CustomerProfile]:
        """
        Get customer profile with learned patterns
        
        Args:
            customer_id: Customer ID
            create_if_missing: Create new profile if not found
            
        Returns:
            Customer profile or None
        """
        # Check in-memory cache
        if customer_id in self.profiles:
            return self.profiles[customer_id]
        
        # Try to load from disk cache
        profile = self._load_profile_from_cache(customer_id)
        if profile:
            self.profiles[customer_id] = profile
            return profile
        
        # Load from database
        if self.db:
            profile = await self._load_profile_from_db(customer_id)
            if profile:
                self.profiles[customer_id] = profile
                self._save_profile_to_cache(profile)
                return profile
        
        # Create new profile if requested
        if create_if_missing:
            profile = self._create_new_profile(customer_id)
            self.profiles[customer_id] = profile
            return profile
        
        return None
    
    def _create_new_profile(self, customer_id: str) -> CustomerProfile:
        """Create a new customer profile"""
        return CustomerProfile(
            customer_id=customer_id,
            industry='general',
            document_count=0,
            field_patterns=[],
            template_hashes=[],
            preferred_languages=['english'],
            average_fields_per_doc=0.0,
            last_updated=datetime.now().isoformat()
        )
    
    async def learn_from_adjustment(
        self,
        customer_id: str,
        document_hash: str,
        original_fields: List[Dict],
        adjusted_fields: List[Dict],
        document_type: Optional[str] = None
    ) -> bool:
        """
        Learn from customer's field adjustments
        
        Args:
            customer_id: Customer ID
            document_hash: Hash of the document
            original_fields: Originally detected fields
            adjusted_fields: Customer-adjusted fields
            document_type: Type of document
            
        Returns:
            True if learning successful
        """
        try:
            profile = await self.get_customer_profile(customer_id)
            if not profile or not profile.learning_enabled:
                return False
            
            # Analyze the adjustments
            patterns = self._analyze_adjustments(
                original_fields,
                adjusted_fields,
                document_type or 'unknown'
            )
            
            # Update profile with new patterns
            self._update_profile_patterns(profile, patterns)
            
            # Update document statistics
            profile.document_count += 1
            profile.average_fields_per_doc = (
                (profile.average_fields_per_doc * (profile.document_count - 1) + 
                 len(adjusted_fields)) / profile.document_count
            )
            
            # Add template hash if it's a recurring document
            if document_hash not in profile.template_hashes:
                if self._is_recurring_template(document_hash, profile):
                    profile.template_hashes.append(document_hash)
            
            # Update languages used
            languages = {field.get('language', 'english') for field in adjusted_fields}
            for lang in languages:
                if lang not in profile.preferred_languages:
                    profile.preferred_languages.append(lang)
            
            profile.last_updated = datetime.now().isoformat()
            
            # Save updated profile
            await self._save_profile(profile)
            
            logger.info(f"Learning successful for customer {customer_id}")
            return True
            
        except Exception as e:
            logger.error(f"Learning failed for customer {customer_id}: {e}")
            return False
    
    def _analyze_adjustments(
        self,
        original: List[Dict],
        adjusted: List[Dict],
        document_type: str
    ) -> List[FieldPattern]:
        """
        Analyze field adjustments to extract patterns
        
        Args:
            original: Original fields
            adjusted: Adjusted fields
            document_type: Document type
            
        Returns:
            List of learned patterns
        """
        patterns = []
        
        # Create lookup for original fields
        original_lookup = {
            (f['page'], f['type']): f 
            for f in original
        }
        
        for adj_field in adjusted:
            page = adj_field['page']
            field_type = adj_field['type']
            
            # Check if this is a new field or adjusted position
            orig_field = original_lookup.get((page, field_type))
            
            if orig_field:
                # Field was adjusted - learn the preferred position
                if self._significant_adjustment(orig_field, adj_field):
                    patterns.append(
                        FieldPattern(
                            field_type=field_type,
                            page=page,
                            x=adj_field['x'],
                            y=adj_field['y'],
                            width=adj_field['width'],
                            height=adj_field['height'],
                            confidence=0.9,  # High confidence for user adjustments
                            language=adj_field.get('language', 'english'),
                            document_type=document_type
                        )
                    )
            else:
                # New field added by user
                patterns.append(
                    FieldPattern(
                        field_type=field_type,
                        page=page,
                        x=adj_field['x'],
                        y=adj_field['y'],
                        width=adj_field['width'],
                        height=adj_field['height'],
                        confidence=0.95,  # Very high confidence for user-added
                        language=adj_field.get('language', 'english'),
                        document_type=document_type
                    )
                )
        
        return patterns
    
    def _significant_adjustment(self, orig: Dict, adj: Dict) -> bool:
        """Check if adjustment is significant enough to learn from"""
        threshold = 0.05  # 5% difference threshold
        
        return (
            abs(orig['x'] - adj['x']) > threshold or
            abs(orig['y'] - adj['y']) > threshold or
            abs(orig['width'] - adj['width']) > threshold or
            abs(orig['height'] - adj['height']) > threshold
        )
    
    def _update_profile_patterns(
        self,
        profile: CustomerProfile,
        new_patterns: List[FieldPattern]
    ):
        """Update profile with new patterns"""
        for new_pattern in new_patterns:
            # Check if similar pattern exists
            similar = self._find_similar_pattern(
                new_pattern,
                profile.field_patterns
            )
            
            if similar:
                # Update existing pattern
                similar.occurrences += 1
                similar.last_seen = datetime.now().isoformat()
                # Weighted average for position
                weight = similar.occurrences / (similar.occurrences + 1)
                similar.x = similar.x * weight + new_pattern.x * (1 - weight)
                similar.y = similar.y * weight + new_pattern.y * (1 - weight)
                similar.width = similar.width * weight + new_pattern.width * (1 - weight)
                similar.height = similar.height * weight + new_pattern.height * (1 - weight)
                similar.confidence = min(1.0, similar.confidence * 1.05)  # Boost confidence
            else:
                # Add new pattern
                profile.field_patterns.append(new_pattern)
    
    def _find_similar_pattern(
        self,
        pattern: FieldPattern,
        patterns: List[FieldPattern]
    ) -> Optional[FieldPattern]:
        """Find similar pattern in list"""
        threshold = 0.1  # 10% similarity threshold
        
        for p in patterns:
            if (p.field_type == pattern.field_type and
                p.page == pattern.page and
                p.document_type == pattern.document_type and
                abs(p.x - pattern.x) < threshold and
                abs(p.y - pattern.y) < threshold):
                return p
        
        return None
    
    def _is_recurring_template(
        self,
        document_hash: str,
        profile: CustomerProfile
    ) -> bool:
        """Check if document is a recurring template"""
        # Simple heuristic: if we've seen similar patterns before
        return len(profile.field_patterns) > 5 and profile.document_count > 3
    
    async def apply_customer_learning(
        self,
        customer_id: str,
        detected_fields: List[Dict],
        document_type: Optional[str] = None,
        document_hash: Optional[str] = None
    ) -> List[Dict]:
        """
        Apply customer learning to improve field detection
        
        Args:
            customer_id: Customer ID
            detected_fields: Initially detected fields
            document_type: Document type
            document_hash: Document hash for template matching
            
        Returns:
            Enhanced field list
        """
        profile = await self.get_customer_profile(customer_id, create_if_missing=False)
        if not profile:
            return detected_fields
        
        enhanced_fields = detected_fields.copy()
        
        # Check if this is a known template
        if document_hash and document_hash in profile.template_hashes:
            # Apply template patterns with high confidence
            enhanced_fields = self._apply_template_patterns(
                enhanced_fields,
                profile,
                document_type
            )
        
        # Apply learned patterns
        for pattern in profile.field_patterns:
            if document_type and pattern.document_type != document_type:
                continue
            
            # Check if field already detected
            existing = self._find_field(
                enhanced_fields,
                pattern.field_type,
                pattern.page
            )
            
            if not existing and pattern.occurrences >= 2:
                # Add field based on learned pattern
                enhanced_fields.append({
                    'type': pattern.field_type,
                    'page': pattern.page,
                    'x': pattern.x,
                    'y': pattern.y,
                    'width': pattern.width,
                    'height': pattern.height,
                    'confidence': pattern.confidence * 0.9,  # Slightly lower for learned
                    'source': 'customer_learning',
                    'language': pattern.language
                })
            elif existing and pattern.confidence > existing.get('confidence', 0):
                # Update position based on learned pattern
                existing['x'] = pattern.x
                existing['y'] = pattern.y
                existing['width'] = pattern.width
                existing['height'] = pattern.height
                existing['confidence'] = pattern.confidence
                existing['source'] = 'customer_adjusted'
        
        # Apply industry patterns if no customer patterns
        if len(profile.field_patterns) < 3 and profile.industry:
            enhanced_fields = self._apply_industry_patterns(
                enhanced_fields,
                profile.industry
            )
        
        return enhanced_fields
    
    def _apply_template_patterns(
        self,
        fields: List[Dict],
        profile: CustomerProfile,
        document_type: Optional[str]
    ) -> List[Dict]:
        """Apply patterns from known templates"""
        # Filter patterns for this document type
        template_patterns = [
            p for p in profile.field_patterns
            if not document_type or p.document_type == document_type
        ]
        
        # Apply with high confidence
        for pattern in template_patterns:
            if not self._find_field(fields, pattern.field_type, pattern.page):
                fields.append({
                    'type': pattern.field_type,
                    'page': pattern.page,
                    'x': pattern.x,
                    'y': pattern.y,
                    'width': pattern.width,
                    'height': pattern.height,
                    'confidence': min(1.0, pattern.confidence * 1.1),
                    'source': 'template',
                    'language': pattern.language
                })
        
        return fields
    
    def _apply_industry_patterns(
        self,
        fields: List[Dict],
        industry: str
    ) -> List[Dict]:
        """Apply industry-specific patterns"""
        if industry not in self.INDUSTRY_PATTERNS:
            industry = 'general'
        
        patterns = self.INDUSTRY_PATTERNS[industry]
        
        # Add signature fields at typical locations
        for i, (x, y) in enumerate(patterns['signature_locations']):
            if not self._find_field_near(fields, 'signature', 1, x, y):
                fields.append({
                    'type': 'signature',
                    'page': 1,
                    'x': x,
                    'y': y,
                    'width': 0.25,
                    'height': 0.05,
                    'confidence': 0.7,
                    'source': 'industry_pattern',
                    'label': f'Signature {i+1}'
                })
        
        return fields
    
    def _find_field(
        self,
        fields: List[Dict],
        field_type: str,
        page: int
    ) -> Optional[Dict]:
        """Find field by type and page"""
        for field in fields:
            if field['type'] == field_type and field['page'] == page:
                return field
        return None
    
    def _find_field_near(
        self,
        fields: List[Dict],
        field_type: str,
        page: int,
        x: float,
        y: float,
        threshold: float = 0.1
    ) -> Optional[Dict]:
        """Find field near specific location"""
        for field in fields:
            if (field['type'] == field_type and 
                field['page'] == page and
                abs(field['x'] - x) < threshold and
                abs(field['y'] - y) < threshold):
                return field
        return None
    
    async def _save_profile(self, profile: CustomerProfile):
        """Save profile to storage"""
        # Save to cache
        self._save_profile_to_cache(profile)
        
        # Save to database if available
        if self.db:
            await self._save_profile_to_db(profile)
    
    def _save_profile_to_cache(self, profile: CustomerProfile):
        """Save profile to disk cache"""
        try:
            cache_file = f"{self.cache_dir}/{profile.customer_id}.pkl"
            with open(cache_file, 'wb') as f:
                pickle.dump(profile, f)
        except Exception as e:
            logger.error(f"Failed to cache profile: {e}")
    
    def _load_profile_from_cache(self, customer_id: str) -> Optional[CustomerProfile]:
        """Load profile from disk cache"""
        try:
            cache_file = f"{self.cache_dir}/{customer_id}.pkl"
            with open(cache_file, 'rb') as f:
                return pickle.load(f)
        except:
            return None
    
    async def _load_profile_from_db(self, customer_id: str) -> Optional[CustomerProfile]:
        """Load profile from database"""
        # Implementation would depend on database schema
        return None
    
    async def _save_profile_to_db(self, profile: CustomerProfile):
        """Save profile to database"""
        # Implementation would depend on database schema
        pass
    
    def get_statistics(self, customer_id: str) -> Dict[str, Any]:
        """Get learning statistics for customer"""
        profile = self.profiles.get(customer_id)
        if not profile:
            return {}
        
        return {
            'customer_id': customer_id,
            'industry': profile.industry,
            'documents_processed': profile.document_count,
            'patterns_learned': len(profile.field_patterns),
            'templates_stored': len(profile.template_hashes),
            'languages': profile.preferred_languages,
            'avg_fields_per_doc': profile.average_fields_per_doc,
            'last_updated': profile.last_updated,
            'learning_enabled': profile.learning_enabled
        }