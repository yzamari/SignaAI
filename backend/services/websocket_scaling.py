"""
WebSocket Scaling Service with Redis
Enables horizontal scaling of WebSocket connections across multiple servers
"""

import json
import asyncio
import logging
from typing import Dict, List, Set, Optional, Any
from datetime import datetime
import redis.asyncio as aioredis
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)


class ScalableConnectionManager:
    """
    Redis-backed WebSocket connection manager for horizontal scaling
    Supports WebSocket connections across multiple server instances
    """
    
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        """
        Initialize scalable connection manager with Redis
        
        Args:
            redis_url: Redis connection URL
        """
        self.redis_url = redis_url
        self.redis_client: Optional[aioredis.Redis] = None
        self.pubsub: Optional[aioredis.client.PubSub] = None
        self.local_connections: Dict[str, List[Any]] = {}  # Local WebSocket connections
        self.server_id = f"server_{datetime.now().timestamp()}"  # Unique server identifier
        self.subscription_task: Optional[asyncio.Task] = None
        
    async def initialize(self):
        """Initialize Redis connection and pub/sub"""
        try:
            # Create Redis client
            self.redis_client = await aioredis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True
            )
            
            # Test connection
            await self.redis_client.ping()
            
            # Set up pub/sub for cross-server communication
            self.pubsub = self.redis_client.pubsub()
            
            # Subscribe to global broadcast channel
            await self.pubsub.subscribe("websocket:broadcast")
            
            # Start listening for messages
            self.subscription_task = asyncio.create_task(self._listen_for_messages())
            
            logger.info(f"✅ WebSocket scaling initialized with Redis at {self.redis_url}")
            logger.info(f"✅ Server ID: {self.server_id}")
            
        except (RedisError, ConnectionError) as e:
            logger.error(f"❌ Failed to initialize Redis for WebSocket scaling: {e}")
            logger.warning("⚠️ Falling back to single-server mode")
            self.redis_client = None
    
    async def register_connection(self, user_id: str, connection_id: str, metadata: Dict = None):
        """
        Register a WebSocket connection in Redis
        
        Args:
            user_id: User identifier
            connection_id: Unique connection identifier
            metadata: Additional connection metadata
        """
        if not self.redis_client:
            return
        
        try:
            # Store connection info in Redis
            connection_data = {
                "user_id": user_id,
                "connection_id": connection_id,
                "server_id": self.server_id,
                "connected_at": datetime.utcnow().isoformat(),
                "metadata": metadata or {}
            }
            
            # Add to user's connection set
            await self.redis_client.sadd(f"user:connections:{user_id}", connection_id)
            
            # Store connection details
            await self.redis_client.hset(
                f"connection:{connection_id}",
                mapping={k: json.dumps(v) if isinstance(v, dict) else v 
                        for k, v in connection_data.items()}
            )
            
            # Set expiry (24 hours)
            await self.redis_client.expire(f"connection:{connection_id}", 86400)
            
            # Track server's connections
            await self.redis_client.sadd(f"server:connections:{self.server_id}", connection_id)
            
            logger.info(f"✅ Connection registered in Redis: {connection_id} for user {user_id}")
            
        except RedisError as e:
            logger.error(f"Failed to register connection in Redis: {e}")
    
    async def unregister_connection(self, user_id: str, connection_id: str):
        """Remove connection from Redis"""
        if not self.redis_client:
            return
        
        try:
            # Remove from user's connection set
            await self.redis_client.srem(f"user:connections:{user_id}", connection_id)
            
            # Remove connection details
            await self.redis_client.delete(f"connection:{connection_id}")
            
            # Remove from server's connections
            await self.redis_client.srem(f"server:connections:{self.server_id}", connection_id)
            
            logger.info(f"✅ Connection unregistered from Redis: {connection_id}")
            
        except RedisError as e:
            logger.error(f"Failed to unregister connection from Redis: {e}")
    
    async def subscribe_to_workflow(self, user_id: str, workflow_id: str):
        """Subscribe user to workflow updates across all servers"""
        if not self.redis_client:
            return
        
        try:
            # Add to workflow subscribers set
            await self.redis_client.sadd(f"workflow:subscribers:{workflow_id}", user_id)
            
            # Track user's subscriptions
            await self.redis_client.sadd(f"user:subscriptions:{user_id}", workflow_id)
            
            logger.info(f"✅ User {user_id} subscribed to workflow {workflow_id} in Redis")
            
        except RedisError as e:
            logger.error(f"Failed to subscribe to workflow in Redis: {e}")
    
    async def unsubscribe_from_workflow(self, user_id: str, workflow_id: str):
        """Unsubscribe user from workflow updates"""
        if not self.redis_client:
            return
        
        try:
            # Remove from workflow subscribers
            await self.redis_client.srem(f"workflow:subscribers:{workflow_id}", user_id)
            
            # Remove from user's subscriptions
            await self.redis_client.srem(f"user:subscriptions:{user_id}", workflow_id)
            
            logger.info(f"✅ User {user_id} unsubscribed from workflow {workflow_id} in Redis")
            
        except RedisError as e:
            logger.error(f"Failed to unsubscribe from workflow in Redis: {e}")
    
    async def broadcast_to_workflow(self, workflow_id: str, message: Dict, exclude_user: Optional[str] = None):
        """
        Broadcast message to all workflow subscribers across all servers
        
        Args:
            workflow_id: Workflow identifier
            message: Message to broadcast
            exclude_user: User to exclude from broadcast
        """
        if not self.redis_client:
            # Fallback to local broadcast
            await self._local_broadcast(workflow_id, message, exclude_user)
            return
        
        try:
            # Get all subscribers
            subscribers = await self.redis_client.smembers(f"workflow:subscribers:{workflow_id}")
            
            # Prepare broadcast message
            broadcast_data = {
                "type": "workflow_broadcast",
                "workflow_id": workflow_id,
                "message": message,
                "subscribers": list(subscribers),
                "exclude_user": exclude_user,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            # Publish to all servers
            await self.redis_client.publish(
                "websocket:broadcast",
                json.dumps(broadcast_data)
            )
            
            logger.info(f"✅ Broadcast sent to workflow {workflow_id} subscribers across all servers")
            
        except RedisError as e:
            logger.error(f"Failed to broadcast to workflow: {e}")
            # Fallback to local broadcast
            await self._local_broadcast(workflow_id, message, exclude_user)
    
    async def broadcast_to_user(self, user_id: str, message: Dict):
        """
        Send message to specific user across all their connections
        
        Args:
            user_id: User identifier
            message: Message to send
        """
        if not self.redis_client:
            # Fallback to local send
            await self._local_send_to_user(user_id, message)
            return
        
        try:
            # Get all user's connections
            connections = await self.redis_client.smembers(f"user:connections:{user_id}")
            
            # Prepare broadcast message
            broadcast_data = {
                "type": "user_message",
                "user_id": user_id,
                "message": message,
                "connections": list(connections),
                "timestamp": datetime.utcnow().isoformat()
            }
            
            # Publish to all servers
            await self.redis_client.publish(
                "websocket:broadcast",
                json.dumps(broadcast_data)
            )
            
            logger.info(f"✅ Message sent to user {user_id} across all servers")
            
        except RedisError as e:
            logger.error(f"Failed to send message to user: {e}")
            await self._local_send_to_user(user_id, message)
    
    async def _listen_for_messages(self):
        """Listen for Redis pub/sub messages"""
        if not self.pubsub:
            return
        
        try:
            async for message in self.pubsub.listen():
                if message["type"] == "message":
                    await self._handle_broadcast_message(message["data"])
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Error in Redis listener: {e}")
    
    async def _handle_broadcast_message(self, data: str):
        """Handle incoming broadcast message from Redis"""
        try:
            broadcast_data = json.loads(data)
            message_type = broadcast_data.get("type")
            
            if message_type == "workflow_broadcast":
                # Handle workflow broadcast
                workflow_id = broadcast_data.get("workflow_id")
                message = broadcast_data.get("message")
                subscribers = broadcast_data.get("subscribers", [])
                exclude_user = broadcast_data.get("exclude_user")
                
                # Send to local connections
                for user_id in subscribers:
                    if user_id != exclude_user and user_id in self.local_connections:
                        await self._local_send_to_user(user_id, message)
            
            elif message_type == "user_message":
                # Handle user-specific message
                user_id = broadcast_data.get("user_id")
                message = broadcast_data.get("message")
                
                if user_id in self.local_connections:
                    await self._local_send_to_user(user_id, message)
        
        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode broadcast message: {e}")
        except Exception as e:
            logger.error(f"Error handling broadcast message: {e}")
    
    async def _local_broadcast(self, workflow_id: str, message: Dict, exclude_user: Optional[str] = None):
        """Fallback local broadcast when Redis is not available"""
        # This would integrate with the existing ConnectionManager
        logger.warning(f"Using local broadcast for workflow {workflow_id}")
    
    async def _local_send_to_user(self, user_id: str, message: Dict):
        """Send message to user's local connections"""
        if user_id in self.local_connections:
            for connection in self.local_connections[user_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"Failed to send message to local connection: {e}")
    
    async def get_connection_stats(self) -> Dict:
        """Get connection statistics across all servers"""
        stats = {
            "server_id": self.server_id,
            "local_connections": len(self.local_connections),
            "redis_available": self.redis_client is not None
        }
        
        if self.redis_client:
            try:
                # Get total connections across all servers
                all_servers = await self.redis_client.keys("server:connections:*")
                total_connections = 0
                
                for server_key in all_servers:
                    connections = await self.redis_client.scard(server_key)
                    total_connections += connections
                
                stats["total_connections"] = total_connections
                stats["active_servers"] = len(all_servers)
                
                # Get workflow subscription counts
                workflow_keys = await self.redis_client.keys("workflow:subscribers:*")
                stats["active_workflows"] = len(workflow_keys)
                
            except RedisError as e:
                logger.error(f"Failed to get connection stats from Redis: {e}")
        
        return stats
    
    async def cleanup(self):
        """Clean up Redis connections and tasks"""
        if self.subscription_task:
            self.subscription_task.cancel()
        
        if self.pubsub:
            await self.pubsub.unsubscribe()
            await self.pubsub.close()
        
        if self.redis_client:
            # Clean up server's connections
            try:
                server_connections = await self.redis_client.smembers(
                    f"server:connections:{self.server_id}"
                )
                for conn_id in server_connections:
                    await self.redis_client.delete(f"connection:{conn_id}")
                
                await self.redis_client.delete(f"server:connections:{self.server_id}")
            except RedisError:
                pass
            
            await self.redis_client.close()
        
        logger.info(f"✅ WebSocket scaling service cleaned up for server {self.server_id}")


# Global instance
scalable_manager = ScalableConnectionManager()


# Export for use in other modules
__all__ = ['scalable_manager', 'ScalableConnectionManager']