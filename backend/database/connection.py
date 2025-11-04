"""
PostgreSQL Database Connection Module
Handles database connections and operations for SignaAI
"""

import os
import logging
from typing import Optional, Dict, Any, List
from contextlib import asynccontextmanager
import asyncpg
from asyncpg import Pool, Connection
import json
from datetime import datetime

logger = logging.getLogger(__name__)

class DatabaseManager:
    """Manages PostgreSQL database connections and operations"""
    
    def __init__(self):
        self.pool: Optional[Pool] = None
        self.database_url = os.getenv(
            'DATABASE_URL',
            'postgresql://postgres:postgres@localhost:5432/signai_db'
        )
        
    async def initialize(self):
        """Initialize the database connection pool"""
        try:
            self.pool = await asyncpg.create_pool(
                self.database_url,
                min_size=10,
                max_size=20,
                max_queries=50000,
                max_inactive_connection_lifetime=300,
                command_timeout=60
            )
            logger.info("Database connection pool initialized successfully")
            
            # Run migrations if needed
            await self.run_migrations()
            
        except Exception as e:
            logger.error(f"Failed to initialize database pool: {e}")
            raise
    
    async def close(self):
        """Close the database connection pool"""
        if self.pool:
            await self.pool.close()
            logger.info("Database connection pool closed")
    
    @asynccontextmanager
    async def acquire(self):
        """Acquire a database connection from the pool"""
        if not self.pool:
            await self.initialize()
        
        async with self.pool.acquire() as connection:
            yield connection
    
    async def run_migrations(self):
        """Run database migrations/schema setup"""
        schema_file = os.path.join(os.path.dirname(__file__), 'schema.sql')
        
        if os.path.exists(schema_file):
            async with self.acquire() as conn:
                with open(schema_file, 'r') as f:
                    schema_sql = f.read()
                    
                # Split by semicolons and execute each statement
                statements = [s.strip() for s in schema_sql.split(';') if s.strip()]
                for statement in statements:
                    try:
                        await conn.execute(statement)
                    except Exception as e:
                        # Skip if table/index already exists
                        if 'already exists' not in str(e):
                            logger.error(f"Migration error: {e}")
                
                logger.info("Database migrations completed")
    
    # User operations
    async def create_user(self, email: str, password_hash: str, full_name: str = None, 
                         phone: str = None, organization: str = None) -> Dict[str, Any]:
        """Create a new user"""
        async with self.acquire() as conn:
            row = await conn.fetchrow("""
                INSERT INTO users (email, password_hash, full_name, phone, organization)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id, email, full_name, phone, organization, role, created_at
            """, email, password_hash, full_name, phone, organization)
            
            return dict(row)
    
    async def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Get user by email"""
        async with self.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT id, email, password_hash, full_name, phone, organization, role, is_active, created_at
                FROM users
                WHERE email = $1
            """, email)
            
            return dict(row) if row else None
    
    async def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user by ID"""
        async with self.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT id, email, full_name, phone, organization, role, is_active, created_at
                FROM users
                WHERE id = $1::uuid
            """, user_id)
            
            return dict(row) if row else None
    
    # Document operations
    async def create_document(self, user_id: str, title: str, file_name: str, 
                            file_path: str = None, file_size: int = None, 
                            mime_type: str = None, page_count: int = None,
                            metadata: Dict = None) -> Dict[str, Any]:
        """Create a new document"""
        async with self.acquire() as conn:
            metadata_json = json.dumps(metadata) if metadata else None
            
            row = await conn.fetchrow("""
                INSERT INTO documents (user_id, title, file_name, file_path, file_size, mime_type, page_count, metadata)
                VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb)
                RETURNING id, user_id, title, file_name, file_path, status, created_at
            """, user_id, title, file_name, file_path, file_size, mime_type, page_count, metadata_json)
            
            return dict(row)
    
    async def get_document(self, document_id: str) -> Optional[Dict[str, Any]]:
        """Get document by ID"""
        async with self.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT * FROM documents
                WHERE id = $1::uuid
            """, document_id)
            
            return dict(row) if row else None
    
    async def get_user_documents(self, user_id: str, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """Get all documents for a user"""
        async with self.acquire() as conn:
            rows = await conn.fetch("""
                SELECT * FROM documents
                WHERE user_id = $1::uuid
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
            """, user_id, limit, offset)
            
            return [dict(row) for row in rows]
    
    # Workflow operations
    async def create_workflow(self, document_id: str, created_by: str, 
                            workflow_type: str = 'sequential',
                            deadline: datetime = None,
                            reminder_days: int = 3,
                            metadata: Dict = None) -> Dict[str, Any]:
        """Create a new workflow"""
        async with self.acquire() as conn:
            metadata_json = json.dumps(metadata) if metadata else None
            
            row = await conn.fetchrow("""
                INSERT INTO workflows (document_id, type, created_by, deadline, reminder_days, metadata)
                VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6::jsonb)
                RETURNING id, document_id, type, status, created_by, created_at
            """, document_id, workflow_type, created_by, deadline, reminder_days, metadata_json)
            
            return dict(row)
    
    async def get_workflow(self, workflow_id: str) -> Optional[Dict[str, Any]]:
        """Get workflow by ID"""
        async with self.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT * FROM workflows
                WHERE id = $1::uuid
            """, workflow_id)
            
            return dict(row) if row else None
    
    async def update_workflow_status(self, workflow_id: str, status: str) -> bool:
        """Update workflow status"""
        async with self.acquire() as conn:
            result = await conn.execute("""
                UPDATE workflows
                SET status = $2, completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE NULL END
                WHERE id = $1::uuid
            """, workflow_id, status)
            
            return result.split()[-1] != '0'
    
    # Signer operations
    async def create_signer(self, workflow_id: str, name: str, email: str = None,
                          phone: str = None, role: str = None, order_num: int = None,
                          send_via: List[str] = None) -> Dict[str, Any]:
        """Create a new signer"""
        async with self.acquire() as conn:
            send_via_json = json.dumps(send_via or ['email'])
            
            # Generate access token
            import secrets
            access_token = secrets.token_urlsafe(32)
            
            row = await conn.fetchrow("""
                INSERT INTO signers (workflow_id, name, email, phone, role, order_num, send_via, access_token, token_expires_at)
                VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb, $8, NOW() + INTERVAL '30 days')
                RETURNING id, workflow_id, name, email, phone, role, status, access_token, created_at
            """, workflow_id, name, email, phone, role, order_num, send_via_json, access_token)
            
            return dict(row)
    
    async def get_signer_by_token(self, access_token: str) -> Optional[Dict[str, Any]]:
        """Get signer by access token"""
        async with self.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT s.*, w.document_id, w.type as workflow_type, w.status as workflow_status
                FROM signers s
                JOIN workflows w ON s.workflow_id = w.id
                WHERE s.access_token = $1 AND s.token_expires_at > NOW()
            """, access_token)
            
            return dict(row) if row else None
    
    async def update_signer_status(self, signer_id: str, status: str, 
                                  ip_address: str = None, user_agent: str = None) -> bool:
        """Update signer status"""
        async with self.acquire() as conn:
            result = await conn.execute("""
                UPDATE signers
                SET status = $2, 
                    signed_at = CASE WHEN $2 = 'signed' THEN NOW() ELSE signed_at END,
                    ip_address = COALESCE($3, ip_address),
                    user_agent = COALESCE($4, user_agent)
                WHERE id = $1::uuid
            """, signer_id, status, ip_address, user_agent)
            
            return result.split()[-1] != '0'
    
    # Signature field operations
    async def create_signature_field(self, workflow_id: str, field_type: str,
                                    page: int, x_position: float, y_position: float,
                                    width: float, height: float, label: str = None,
                                    signer_id: str = None, is_required: bool = True,
                                    ai_detected: bool = False, confidence: float = None) -> Dict[str, Any]:
        """Create a new signature field"""
        async with self.acquire() as conn:
            row = await conn.fetchrow("""
                INSERT INTO signature_fields 
                (workflow_id, signer_id, type, label, page, x_position, y_position, width, height, 
                 is_required, ai_detected, confidence)
                VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING id, workflow_id, type, page, x_position, y_position, width, height
            """, workflow_id, signer_id, field_type, label, page, x_position, y_position, 
                width, height, is_required, ai_detected, confidence)
            
            return dict(row)
    
    async def get_workflow_fields(self, workflow_id: str) -> List[Dict[str, Any]]:
        """Get all signature fields for a workflow"""
        async with self.acquire() as conn:
            rows = await conn.fetch("""
                SELECT * FROM signature_fields
                WHERE workflow_id = $1::uuid
                ORDER BY page, y_position
            """, workflow_id)
            
            return [dict(row) for row in rows]
    
    async def update_field_value(self, field_id: str, value: str, signer_id: str = None) -> bool:
        """Update signature field value"""
        async with self.acquire() as conn:
            result = await conn.execute("""
                UPDATE signature_fields
                SET value = $2, signed_at = NOW(), signer_id = COALESCE($3::uuid, signer_id)
                WHERE id = $1::uuid
            """, field_id, value, signer_id)
            
            return result.split()[-1] != '0'
    
    # Audit log operations
    async def create_audit_log(self, workflow_id: str, action: str, description: str = None,
                              signer_id: str = None, ip_address: str = None, 
                              user_agent: str = None, metadata: Dict = None) -> Dict[str, Any]:
        """Create an audit log entry"""
        async with self.acquire() as conn:
            metadata_json = json.dumps(metadata) if metadata else None
            
            row = await conn.fetchrow("""
                INSERT INTO audit_logs (workflow_id, signer_id, action, description, ip_address, user_agent, metadata)
                VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb)
                RETURNING id, workflow_id, action, created_at
            """, workflow_id, signer_id, action, description, ip_address, user_agent, metadata_json)
            
            return dict(row)
    
    async def get_workflow_audit_logs(self, workflow_id: str) -> List[Dict[str, Any]]:
        """Get all audit logs for a workflow"""
        async with self.acquire() as conn:
            rows = await conn.fetch("""
                SELECT al.*, s.name as signer_name
                FROM audit_logs al
                LEFT JOIN signers s ON al.signer_id = s.id
                WHERE al.workflow_id = $1::uuid
                ORDER BY al.created_at ASC
            """, workflow_id)
            
            return [dict(row) for row in rows]
    
    # Notification operations
    async def create_notification(self, workflow_id: str, signer_id: str, 
                                 notification_type: str, recipient: str,
                                 subject: str = None, message: str = None,
                                 metadata: Dict = None) -> Dict[str, Any]:
        """Create a notification record"""
        async with self.acquire() as conn:
            metadata_json = json.dumps(metadata) if metadata else None
            
            row = await conn.fetchrow("""
                INSERT INTO notifications (workflow_id, signer_id, type, recipient, subject, message, metadata)
                VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb)
                RETURNING id, workflow_id, type, recipient, status, created_at
            """, workflow_id, signer_id, notification_type, recipient, subject, message, metadata_json)
            
            return dict(row)
    
    async def update_notification_status(self, notification_id: str, status: str, 
                                        error_message: str = None) -> bool:
        """Update notification status"""
        async with self.acquire() as conn:
            result = await conn.execute("""
                UPDATE notifications
                SET status = $2, 
                    sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END,
                    delivered_at = CASE WHEN $2 = 'delivered' THEN NOW() ELSE delivered_at END,
                    error_message = $3
                WHERE id = $1::uuid
            """, notification_id, status, error_message)
            
            return result.split()[-1] != '0'

# Global database manager instance
db_manager = DatabaseManager()

async def get_db():
    """Dependency to get database connection"""
    return db_manager