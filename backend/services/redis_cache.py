"""
Redis caching service for performance optimization
Sprint 1: Caching layer for translations, AI predictions, and session data
"""

import json
import logging
import os
from typing import Any, Optional, Union
from datetime import timedelta

import redis
from redis.exceptions import RedisError

from core.config import settings

logger = logging.getLogger(__name__)


class RedisCache:
    """
    Redis cache service for high-performance data caching
    """
    
    def __init__(self):
        """Initialize Redis connection"""
        try:
            # Use environment variable or default to localhost with new 51xx port
            redis_host = os.getenv("REDIS_HOST", "localhost")
            redis_port = int(os.getenv("REDIS_PORT", 5118))
            redis_db = int(os.getenv("REDIS_DB", 0))
            redis_password = os.getenv("REDIS_PASSWORD", None)
            
            self.client = redis.Redis(
                host=redis_host,
                port=redis_port,
                db=redis_db,
                password=redis_password,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5
            )
            
            # Test connection
            self.client.ping()
            self.enabled = True
            logger.info(f"✅ Redis cache connected to {redis_host}:{redis_port}")
            
        except (RedisError, ConnectionError) as e:
            logger.warning(f"⚠️ Redis cache not available: {e}. Using fallback in-memory cache.")
            self.enabled = False
            self.fallback_cache = {}
    
    def get(self, key: str) -> Optional[Any]:
        """
        Get value from cache
        
        Args:
            key: Cache key
            
        Returns:
            Cached value or None if not found
        """
        if not self.enabled:
            return self.fallback_cache.get(key)
            
        try:
            value = self.client.get(key)
            if value:
                # Try to deserialize JSON
                try:
                    return json.loads(value)
                except json.JSONDecodeError:
                    return value
            return None
            
        except RedisError as e:
            logger.error(f"Redis GET error for key {key}: {e}")
            return None
    
    def set(
        self, 
        key: str, 
        value: Any, 
        expire: Optional[Union[int, timedelta]] = None
    ) -> bool:
        """
        Set value in cache
        
        Args:
            key: Cache key
            value: Value to cache
            expire: Expiration time in seconds or timedelta
            
        Returns:
            True if successful, False otherwise
        """
        if not self.enabled:
            self.fallback_cache[key] = value
            return True
            
        try:
            # Serialize to JSON if not a string
            if not isinstance(value, str):
                value = json.dumps(value)
                
            if expire:
                if isinstance(expire, timedelta):
                    expire = int(expire.total_seconds())
                return bool(self.client.setex(key, expire, value))
            else:
                return bool(self.client.set(key, value))
                
        except RedisError as e:
            logger.error(f"Redis SET error for key {key}: {e}")
            return False
    
    def delete(self, key: str) -> bool:
        """
        Delete key from cache
        
        Args:
            key: Cache key to delete
            
        Returns:
            True if deleted, False otherwise
        """
        if not self.enabled:
            if key in self.fallback_cache:
                del self.fallback_cache[key]
                return True
            return False
            
        try:
            return bool(self.client.delete(key))
        except RedisError as e:
            logger.error(f"Redis DELETE error for key {key}: {e}")
            return False
    
    def exists(self, key: str) -> bool:
        """
        Check if key exists in cache
        
        Args:
            key: Cache key to check
            
        Returns:
            True if exists, False otherwise
        """
        if not self.enabled:
            return key in self.fallback_cache
            
        try:
            return bool(self.client.exists(key))
        except RedisError as e:
            logger.error(f"Redis EXISTS error for key {key}: {e}")
            return False
    
    def expire(self, key: str, seconds: int) -> bool:
        """
        Set expiration time for a key
        
        Args:
            key: Cache key
            seconds: Expiration time in seconds
            
        Returns:
            True if successful, False otherwise
        """
        if not self.enabled:
            # Fallback cache doesn't support expiration
            return True
            
        try:
            return bool(self.client.expire(key, seconds))
        except RedisError as e:
            logger.error(f"Redis EXPIRE error for key {key}: {e}")
            return False
    
    def get_ttl(self, key: str) -> Optional[int]:
        """
        Get time-to-live for a key
        
        Args:
            key: Cache key
            
        Returns:
            TTL in seconds, None if key doesn't exist, -1 if no expiration
        """
        if not self.enabled:
            return -1 if key in self.fallback_cache else None
            
        try:
            ttl = self.client.ttl(key)
            return ttl if ttl >= 0 else None
        except RedisError as e:
            logger.error(f"Redis TTL error for key {key}: {e}")
            return None
    
    def flush_all(self) -> bool:
        """
        Clear all keys from cache (use with caution!)
        
        Returns:
            True if successful, False otherwise
        """
        if not self.enabled:
            self.fallback_cache.clear()
            return True
            
        try:
            self.client.flushdb()
            return True
        except RedisError as e:
            logger.error(f"Redis FLUSH error: {e}")
            return False
    
    # Specific cache methods for different data types
    
    def cache_translation(self, language: str, key: str, value: str, expire: int = 86400) -> bool:
        """
        Cache translation strings
        
        Args:
            language: Language code (en, ar, he)
            key: Translation key
            value: Translated text
            expire: Cache duration in seconds (default: 24 hours)
        """
        cache_key = f"translation:{language}:{key}"
        return self.set(cache_key, value, expire)
    
    def get_translation(self, language: str, key: str) -> Optional[str]:
        """
        Get cached translation
        
        Args:
            language: Language code
            key: Translation key
            
        Returns:
            Cached translation or None
        """
        cache_key = f"translation:{language}:{key}"
        return self.get(cache_key)
    
    def cache_ai_prediction(
        self, 
        document_id: str, 
        prediction_type: str, 
        prediction: dict, 
        expire: int = 3600
    ) -> bool:
        """
        Cache AI prediction results
        
        Args:
            document_id: Document identifier
            prediction_type: Type of prediction (signature_fields, document_type, etc.)
            prediction: Prediction results
            expire: Cache duration in seconds (default: 1 hour)
        """
        cache_key = f"ai_prediction:{document_id}:{prediction_type}"
        return self.set(cache_key, prediction, expire)
    
    def get_ai_prediction(self, document_id: str, prediction_type: str) -> Optional[dict]:
        """
        Get cached AI prediction
        
        Args:
            document_id: Document identifier
            prediction_type: Type of prediction
            
        Returns:
            Cached prediction or None
        """
        cache_key = f"ai_prediction:{document_id}:{prediction_type}"
        return self.get(cache_key)
    
    def cache_user_session(self, user_id: str, session_data: dict, expire: int = 1800) -> bool:
        """
        Cache user session data
        
        Args:
            user_id: User identifier
            session_data: Session information
            expire: Cache duration in seconds (default: 30 minutes)
        """
        cache_key = f"session:{user_id}"
        return self.set(cache_key, session_data, expire)
    
    def get_user_session(self, user_id: str) -> Optional[dict]:
        """
        Get cached user session
        
        Args:
            user_id: User identifier
            
        Returns:
            Cached session data or None
        """
        cache_key = f"session:{user_id}"
        return self.get(cache_key)
    
    def cache_workflow_status(self, workflow_id: str, status: dict, expire: int = 300) -> bool:
        """
        Cache workflow status for real-time updates
        
        Args:
            workflow_id: Workflow identifier
            status: Status information
            expire: Cache duration in seconds (default: 5 minutes)
        """
        cache_key = f"workflow:{workflow_id}:status"
        return self.set(cache_key, status, expire)
    
    def get_workflow_status(self, workflow_id: str) -> Optional[dict]:
        """
        Get cached workflow status
        
        Args:
            workflow_id: Workflow identifier
            
        Returns:
            Cached status or None
        """
        cache_key = f"workflow:{workflow_id}:status"
        return self.get(cache_key)
    
    def invalidate_document_cache(self, document_id: str) -> int:
        """
        Invalidate all cache entries for a document
        
        Args:
            document_id: Document identifier
            
        Returns:
            Number of keys deleted
        """
        if not self.enabled:
            # Remove all keys containing document_id
            keys_to_delete = [k for k in self.fallback_cache.keys() if document_id in k]
            for key in keys_to_delete:
                del self.fallback_cache[key]
            return len(keys_to_delete)
            
        try:
            pattern = f"*{document_id}*"
            keys = self.client.keys(pattern)
            if keys:
                return self.client.delete(*keys)
            return 0
        except RedisError as e:
            logger.error(f"Redis invalidate cache error for document {document_id}: {e}")
            return 0


# Global cache instance
redis_cache = RedisCache()