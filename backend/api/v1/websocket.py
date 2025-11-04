"""
WebSocket endpoints for real-time updates
Sprint 3 Enhanced: Comprehensive real-time workflow updates with biometric signature support
"""

import json
import logging
from typing import Dict, List, Set, Optional, Any
from datetime import datetime
from uuid import uuid4
from enum import Enum
import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from core.database import get_db
from services.auth import auth_service

router = APIRouter()
logger = logging.getLogger(__name__)
security = HTTPBearer()


class WorkflowEventType(Enum):
    """Define workflow event types for WebSocket notifications"""
    # Document events
    DOCUMENT_UPLOADED = "document_uploaded"
    DOCUMENT_PROCESSED = "document_processed"
    FIELDS_DETECTED = "fields_detected"
    FIELDS_UPDATED = "fields_updated"
    
    # Signer events
    SIGNER_ADDED = "signer_added"
    SIGNER_REMOVED = "signer_removed"
    SIGNER_NOTIFIED = "signer_notified"
    SIGNER_VIEWED = "signer_viewed"
    SIGNER_STARTED = "signer_started"
    SIGNER_COMPLETED = "signer_completed"
    SIGNER_DECLINED = "signer_declined"
    
    # Biometric signature events
    SIGNATURE_STARTED = "signature_started"
    SIGNATURE_QUALITY_CHECK = "signature_quality_check"
    SIGNATURE_BIOMETRICS_CAPTURED = "signature_biometrics_captured"
    SIGNATURE_VERIFIED = "signature_verified"
    
    # Workflow events
    WORKFLOW_CREATED = "workflow_created"
    WORKFLOW_STARTED = "workflow_started"
    WORKFLOW_PAUSED = "workflow_paused"
    WORKFLOW_RESUMED = "workflow_resumed"
    WORKFLOW_COMPLETED = "workflow_completed"
    WORKFLOW_CANCELLED = "workflow_cancelled"
    WORKFLOW_EXPIRED = "workflow_expired"
    
    # Reminder events
    REMINDER_SENT = "reminder_sent"
    DEADLINE_APPROACHING = "deadline_approaching"
    DEADLINE_PASSED = "deadline_passed"
    
    # System events
    SYSTEM_MESSAGE = "system_message"
    ERROR_OCCURRED = "error_occurred"
    MAINTENANCE_MODE = "maintenance_mode"


class ConnectionManager:
    """
    Enhanced WebSocket connection manager for real-time updates
    """
    
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.workflow_subscriptions: Dict[str, Set[str]] = {}
        self.connection_metadata: Dict[str, Dict] = {}
        self.heartbeat_tasks: Dict[str, asyncio.Task] = {}
        
    async def connect(self, websocket: WebSocket, user_id: str, metadata: Optional[Dict] = None) -> str:
        """Accept and register a new WebSocket connection"""
        await websocket.accept()
        
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        
        self.active_connections[user_id].append(websocket)
        
        # Store connection metadata
        connection_id = str(uuid4())
        self.connection_metadata[connection_id] = {
            "user_id": user_id,
            "websocket": websocket,
            "connected_at": datetime.utcnow().isoformat(),
            "metadata": metadata or {},
            "last_ping": datetime.utcnow()
        }
        
        # Start heartbeat task
        self.heartbeat_tasks[connection_id] = asyncio.create_task(
            self._heartbeat(connection_id, websocket)
        )
        
        logger.info(f"WebSocket connected: user_id={user_id}, connection_id={connection_id}")
        
        # Send connection confirmation
        await self.send_personal_message({
            "type": "connection",
            "status": "connected",
            "connection_id": connection_id,
            "timestamp": datetime.utcnow().isoformat()
        }, user_id)
        
        return connection_id
        
    def disconnect(self, websocket: WebSocket, user_id: str):
        """Remove a WebSocket connection"""
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
                
                # Clean up empty lists
                if not self.active_connections[user_id]:
                    del self.active_connections[user_id]
                
                # Clean up metadata and heartbeat tasks
                for conn_id, data in list(self.connection_metadata.items()):
                    if data["websocket"] == websocket:
                        # Cancel heartbeat task
                        if conn_id in self.heartbeat_tasks:
                            self.heartbeat_tasks[conn_id].cancel()
                            del self.heartbeat_tasks[conn_id]
                        del self.connection_metadata[conn_id]
                        break
                
                logger.info(f"WebSocket disconnected: user_id={user_id}")
        
    async def send_personal_message(self, message: Dict, user_id: str):
        """Send a message to all connections of a specific user"""
        if user_id in self.active_connections:
            disconnected = []
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"Error sending message to user {user_id}: {e}")
                    disconnected.append(connection)
            
            # Clean up disconnected websockets
            for conn in disconnected:
                self.disconnect(conn, user_id)
                    
    async def broadcast_workflow_update(self, workflow_id: str, event_type: WorkflowEventType, data: Dict, exclude_user: Optional[str] = None):
        """Broadcast workflow updates to all subscribed users"""
        if workflow_id in self.workflow_subscriptions:
            message = {
                "type": "workflow_update",
                "workflow_id": workflow_id,
                "event_type": event_type.value if isinstance(event_type, WorkflowEventType) else event_type,
                "data": data,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            for user_id in self.workflow_subscriptions[workflow_id]:
                if user_id != exclude_user:
                    await self.send_personal_message(message, user_id)
                
    def subscribe_to_workflow(self, user_id: str, workflow_id: str):
        """Subscribe a user to workflow updates"""
        if workflow_id not in self.workflow_subscriptions:
            self.workflow_subscriptions[workflow_id] = set()
        
        self.workflow_subscriptions[workflow_id].add(user_id)
        logger.info(f"User {user_id} subscribed to workflow {workflow_id}")
            
    def unsubscribe_from_workflow(self, user_id: str, workflow_id: str):
        """Unsubscribe a user from workflow updates"""
        if workflow_id in self.workflow_subscriptions:
            self.workflow_subscriptions[workflow_id].discard(user_id)
            
            # Clean up empty subscriptions
            if not self.workflow_subscriptions[workflow_id]:
                del self.workflow_subscriptions[workflow_id]
        
        logger.info(f"User {user_id} unsubscribed from workflow {workflow_id}")
    
    async def _heartbeat(self, connection_id: str, websocket: WebSocket):
        """Send periodic heartbeat to keep connection alive"""
        try:
            while connection_id in self.connection_metadata:
                await asyncio.sleep(30)  # Send heartbeat every 30 seconds
                try:
                    await websocket.send_json({
                        "type": "heartbeat",
                        "timestamp": datetime.utcnow().isoformat()
                    })
                    self.connection_metadata[connection_id]["last_ping"] = datetime.utcnow()
                except:
                    break
        except asyncio.CancelledError:
            pass
    
    def get_connection_stats(self) -> Dict:
        """Get statistics about active connections"""
        total_connections = sum(len(conns) for conns in self.active_connections.values())
        
        return {
            "total_connections": total_connections,
            "unique_users": len(self.active_connections),
            "workflow_subscriptions": len(self.workflow_subscriptions),
            "connections_by_user": {
                user_id: len(conns) 
                for user_id, conns in self.active_connections.items()
            }
        }


# Global connection manager instance
manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Enhanced WebSocket endpoint for real-time updates
    
    Message Types:
    - subscribe: Subscribe to workflow updates
    - unsubscribe: Unsubscribe from workflow updates
    - ping: Keep-alive ping
    - workflow_action: Perform workflow action
    - signature_update: Biometric signature updates
    - get_stats: Get connection statistics
    """
    
    # Verify token
    if not token:
        await websocket.close(code=4001, reason="Missing authentication token")
        return
    
    try:
        # Verify JWT token
        user_data = auth_service.verify_token(token)
        if not user_data:
            await websocket.close(code=4001, reason="Invalid authentication token")
            return
        
        user_id = user_data.get("user_id")
        if not user_id:
            await websocket.close(code=4001, reason="Invalid user ID")
            return
        
        # Accept connection
        connection_id = await manager.connect(websocket, user_id)
        
        try:
            while True:
                # Receive message from client
                data = await websocket.receive_json()
                message_type = data.get("type")
                
                if message_type == "ping":
                    # Heartbeat
                    await websocket.send_json({
                        "type": "pong",
                        "timestamp": datetime.utcnow().isoformat()
                    })
                
                elif message_type == "subscribe":
                    # Subscribe to workflow updates
                    workflow_id = data.get("workflow_id")
                    if workflow_id:
                        manager.subscribe_to_workflow(user_id, workflow_id)
                        await websocket.send_json({
                            "type": "subscription_confirmed",
                            "workflow_id": workflow_id
                        })
                
                elif message_type == "unsubscribe":
                    # Unsubscribe from workflow updates
                    workflow_id = data.get("workflow_id")
                    if workflow_id:
                        manager.unsubscribe_from_workflow(user_id, workflow_id)
                        await websocket.send_json({
                            "type": "unsubscription_confirmed",
                            "workflow_id": workflow_id
                        })
                
                elif message_type == "workflow_action":
                    # Handle workflow action
                    workflow_id = data.get("workflow_id")
                    action = data.get("action")
                    action_data = data.get("data", {})
                    
                    if workflow_id and action:
                        # Broadcast update to subscribers
                        await manager.broadcast_workflow_update(
                            workflow_id=workflow_id,
                            event_type=action,
                            data=action_data,
                            exclude_user=user_id
                        )
                        
                        # Confirm action to sender
                        await websocket.send_json({
                            "type": "action_confirmed",
                            "workflow_id": workflow_id,
                            "action": action
                        })
                
                elif message_type == "signature_update":
                    # Handle biometric signature updates
                    workflow_id = data.get("workflow_id")
                    signature_data = data.get("signature_data")
                    
                    if workflow_id and signature_data:
                        # Broadcast signature update
                        await notify_signature_update(
                            workflow_id=workflow_id,
                            signer_id=user_id,
                            signature_data=signature_data
                        )
                
                elif message_type == "get_stats":
                    # Send connection statistics
                    stats = manager.get_connection_stats()
                    await websocket.send_json({
                        "type": "stats",
                        "data": stats
                    })
                
                else:
                    # Unknown message type
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Unknown message type: {message_type}"
                    })
        
        except WebSocketDisconnect:
            manager.disconnect(websocket, user_id)
            logger.info(f"WebSocket disconnected normally: user_id={user_id}")
        
        except Exception as e:
            logger.error(f"WebSocket error for user {user_id}: {e}")
            manager.disconnect(websocket, user_id)
            await websocket.close(code=4002, reason="Internal server error")
    
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")
        await websocket.close(code=4002, reason="Connection error")


# Enhanced notification functions for Sprint 3

async def notify_workflow_created(workflow_id: str, creator_id: str, document_name: str):
    """
    Notify when a new workflow is created
    """
    await manager.broadcast_workflow_update(
        workflow_id=workflow_id,
        event_type=WorkflowEventType.WORKFLOW_CREATED,
        data={
            "creator_id": creator_id,
            "document_name": document_name,
            "created_at": datetime.utcnow().isoformat()
        }
    )


async def notify_signer_added(workflow_id: str, signer_id: str, signer_name: str, signer_email: str):
    """
    Notify when a signer is added to workflow
    """
    await manager.broadcast_workflow_update(
        workflow_id=workflow_id,
        event_type=WorkflowEventType.SIGNER_ADDED,
        data={
            "signer_id": signer_id,
            "signer_name": signer_name,
            "signer_email": signer_email,
            "added_at": datetime.utcnow().isoformat()
        }
    )


async def notify_signature_started(workflow_id: str, signer_id: str, signer_name: str):
    """
    Notify when signer starts signing process
    """
    await manager.broadcast_workflow_update(
        workflow_id=workflow_id,
        event_type=WorkflowEventType.SIGNATURE_STARTED,
        data={
            "signer_id": signer_id,
            "signer_name": signer_name,
            "started_at": datetime.utcnow().isoformat()
        }
    )


async def notify_signature_update(workflow_id: str, signer_id: str, signature_data: Dict):
    """
    Notify biometric signature updates in real-time
    """
    await manager.broadcast_workflow_update(
        workflow_id=workflow_id,
        event_type=WorkflowEventType.SIGNATURE_BIOMETRICS_CAPTURED,
        data={
            "signer_id": signer_id,
            "quality_score": signature_data.get("quality_score"),
            "stroke_count": signature_data.get("stroke_count"),
            "duration": signature_data.get("duration"),
            "timestamp": datetime.utcnow().isoformat()
        }
    )


async def notify_signature_quality_check(workflow_id: str, signer_id: str, quality_score: int, passed: bool):
    """
    Notify signature quality check results
    """
    await manager.broadcast_workflow_update(
        workflow_id=workflow_id,
        event_type=WorkflowEventType.SIGNATURE_QUALITY_CHECK,
        data={
            "signer_id": signer_id,
            "quality_score": quality_score,
            "passed": passed,
            "checked_at": datetime.utcnow().isoformat()
        }
    )


async def notify_signature_completed(workflow_id: str, signer_id: str, signer_name: str, biometric_hash: str):
    """
    Notify about signature completion with biometric verification
    """
    await manager.broadcast_workflow_update(
        workflow_id=workflow_id,
        event_type=WorkflowEventType.SIGNER_COMPLETED,
        data={
            "signer_id": signer_id,
            "signer_name": signer_name,
            "biometric_hash": biometric_hash,
            "completed_at": datetime.utcnow().isoformat()
        }
    )


async def notify_fields_detected(workflow_id: str, fields: List[Dict], ai_confidence: float):
    """
    Notify when AI detects signature fields
    """
    await manager.broadcast_workflow_update(
        workflow_id=workflow_id,
        event_type=WorkflowEventType.FIELDS_DETECTED,
        data={
            "fields": fields,
            "ai_confidence": ai_confidence,
            "detected_at": datetime.utcnow().isoformat()
        }
    )


async def notify_workflow_completed(workflow_id: str, total_signers: int, completion_time: float):
    """
    Notify when all signatures are completed
    """
    await manager.broadcast_workflow_update(
        workflow_id=workflow_id,
        event_type=WorkflowEventType.WORKFLOW_COMPLETED,
        data={
            "total_signers": total_signers,
            "completion_time": completion_time,
            "completed_at": datetime.utcnow().isoformat()
        }
    )


async def notify_reminder_sent(workflow_id: str, reminded_signers: List[str], deadline: str):
    """
    Notify when reminders are sent to signers
    """
    await manager.broadcast_workflow_update(
        workflow_id=workflow_id,
        event_type=WorkflowEventType.REMINDER_SENT,
        data={
            "reminded_signers": reminded_signers,
            "deadline": deadline,
            "sent_at": datetime.utcnow().isoformat()
        }
    )


async def notify_deadline_approaching(workflow_id: str, hours_remaining: int, pending_signers: List[str]):
    """
    Notify when deadline is approaching
    """
    await manager.broadcast_workflow_update(
        workflow_id=workflow_id,
        event_type=WorkflowEventType.DEADLINE_APPROACHING,
        data={
            "hours_remaining": hours_remaining,
            "pending_signers": pending_signers,
            "notified_at": datetime.utcnow().isoformat()
        }
    )


async def notify_error(workflow_id: str, error_type: str, error_message: str, affected_user: Optional[str] = None):
    """
    Notify about errors in workflow
    """
    await manager.broadcast_workflow_update(
        workflow_id=workflow_id,
        event_type=WorkflowEventType.ERROR_OCCURRED,
        data={
            "error_type": error_type,
            "error_message": error_message,
            "affected_user": affected_user,
            "occurred_at": datetime.utcnow().isoformat()
        }
    )


# HTTP endpoints for triggering notifications from other services

@router.post("/notify/workflow/{workflow_id}")
async def http_notify_workflow(
    workflow_id: str,
    notification: Dict,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """
    HTTP endpoint to send notifications to workflow subscribers
    Used by other backend services to trigger real-time updates
    """
    
    # Verify token
    user_data = auth_service.verify_token(credentials.credentials)
    if not user_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token"
        )
    
    event_type = notification.get("event_type")
    data = notification.get("data", {})
    
    # Convert string to enum if needed
    if event_type and isinstance(event_type, str):
        try:
            event_type = WorkflowEventType[event_type.upper()]
        except KeyError:
            event_type = event_type
    
    await manager.broadcast_workflow_update(
        workflow_id=workflow_id,
        event_type=event_type,
        data=data,
        exclude_user=user_data.get("user_id")
    )
    
    return {
        "status": "success",
        "workflow_id": workflow_id,
        "subscribers_count": len(manager.workflow_subscriptions.get(workflow_id, set()))
    }


@router.get("/connections/stats")
async def get_connection_statistics(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """
    Get WebSocket connection statistics
    """
    
    # Verify token (in production, check for admin role)
    user_data = auth_service.verify_token(credentials.credentials)
    if not user_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token"
        )
    
    stats = manager.get_connection_stats()
    return {
        "status": "success",
        "data": stats,
        "timestamp": datetime.utcnow().isoformat()
    }


# Export for use in other modules
__all__ = ['router', 'manager', 'WorkflowEventType', 'notify_workflow_created', 
           'notify_signature_completed', 'notify_workflow_completed']