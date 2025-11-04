"""
S3-compatible storage service using MinIO
File upload, download, and management for documents
"""

import hashlib
import logging
import uuid
import os
import json
import base64
from pathlib import Path
from datetime import timedelta
from typing import BinaryIO, Optional
from io import BytesIO

try:
    from minio import Minio
    from minio.error import S3Error
    MINIO_AVAILABLE = True
except ImportError:
    MINIO_AVAILABLE = False
    S3Error = Exception

from core.config import settings

logger = logging.getLogger(__name__)


class LocalStorageService:
    """Local file system storage fallback when MinIO is not available"""
    
    def __init__(self):
        self.storage_dir = Path.home() / ".signaai" / "storage"
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.metadata_file = self.storage_dir / "metadata.json"
        self.metadata = self._load_metadata()
        logger.info("="*50)
        logger.info("💾 LOCAL STORAGE SERVICE INITIALIZED")
        logger.info("="*50)
        logger.info(f"📁 Storage directory: {self.storage_dir}")
        logger.info(f"📄 Metadata file: {self.metadata_file}")
        logger.info(f"📊 Existing files: {len(self.metadata)}")
        logger.info(f"💿 Available disk space: {self._get_disk_space()}")
        logger.info("="*50)
    
    def _get_disk_space(self) -> str:
        """Get available disk space in a readable format"""
        try:
            import shutil
            total, used, free = shutil.disk_usage(self.storage_dir)
            free_gb = free // (1024**3)
            return f"{free_gb:.1f} GB"
        except:
            return "Unknown"
    
    def _load_metadata(self) -> dict:
        """Load metadata from local storage"""
        if self.metadata_file.exists():
            with open(self.metadata_file, 'r') as f:
                return json.load(f)
        return {}
    
    def _save_metadata(self):
        """Save metadata to local storage"""
        with open(self.metadata_file, 'w') as f:
            json.dump(self.metadata, f, indent=2)
    
    def upload_file(self, file_data: BinaryIO, filename: str, content_type: str, user_id: str) -> tuple[str, str, int]:
        """Upload file to local storage"""
        logger.info("="*50)
        logger.info("💾 LOCAL STORAGE UPLOAD STARTED")
        logger.info("="*50)
        logger.info(f"📄 Filename: {filename}")
        logger.info(f"🗂️  Content type: {content_type}")
        logger.info(f"👤 User ID: {user_id}")
        
        try:
            # Generate unique file path
            file_id = str(uuid.uuid4())
            file_path = f"documents/{user_id}/{file_id}/{filename}"
            
            logger.info(f"🆔 Generated file ID: {file_id}")
            logger.info(f"📍 File path: {file_path}")
            
            # Create directories
            full_path = self.storage_dir / file_path
            logger.info(f"📂 Full system path: {full_path}")
            
            logger.info("📁 Creating directory structure...")
            full_path.parent.mkdir(parents=True, exist_ok=True)
            logger.info(f"✅ Directory created: {full_path.parent}")
            
            # Calculate file hash
            logger.info("📖 Reading and hashing file data...")
            file_data.seek(0)
            file_content = file_data.read()
            file_hash = hashlib.sha256(file_content).hexdigest()
            file_size = len(file_content)
            
            logger.info(f"📏 File size: {file_size:,} bytes ({file_size / (1024*1024):.2f} MB)")
            logger.info(f"🔐 SHA256 hash: {file_hash[:16]}...{file_hash[-16:]}")
            
            # Save file
            logger.info("💽 Writing file to disk...")
            with open(full_path, 'wb') as f:
                f.write(file_content)
            logger.info("✅ File written successfully")
            
            # Save metadata
            logger.info("📊 Storing metadata...")
            self.metadata[file_path] = {
                'user_id': user_id,
                'filename': filename,
                'content_type': content_type,
                'file_hash': file_hash,
                'file_size': file_size,
                'uploaded_at': str(uuid.uuid4())
            }
            self._save_metadata()
            logger.info("✅ Metadata saved")
            
            logger.info("="*50)
            logger.info("🟢 LOCAL STORAGE UPLOAD COMPLETED")
            logger.info(f"📋 Final path: {file_path}")
            logger.info("="*50)
            return file_path, file_hash, file_size
        except Exception as e:
            logger.error(f"Local file upload failed: {e}")
            raise
    
    def download_file(self, file_path: str) -> Optional[BinaryIO]:
        """Download file from local storage"""
        try:
            full_path = self.storage_dir / file_path
            if full_path.exists():
                with open(full_path, 'rb') as f:
                    return BytesIO(f.read())
            return None
        except Exception as e:
            logger.error(f"Local file download failed: {e}")
            return None

    def get_file_content(self, file_path: str) -> Optional[bytes]:
        """Get file content as bytes from local storage"""
        try:
            full_path = self.storage_dir / file_path
            if full_path.exists():
                with open(full_path, 'rb') as f:
                    content = f.read()
                    logger.info(f"📄 Retrieved file from local storage: {len(content):,} bytes")
                    return content
            logger.warning(f"❌ File not found in local storage: {file_path}")
            return None
        except Exception as e:
            logger.error(f"Failed to get file content from local storage: {e}")
            return None
    
    def delete_file(self, file_path: str) -> bool:
        """Delete file from local storage"""
        try:
            full_path = self.storage_dir / file_path
            if full_path.exists():
                full_path.unlink()
                if file_path in self.metadata:
                    del self.metadata[file_path]
                    self._save_metadata()
                logger.info(f"File deleted from local storage: {file_path}")
                return True
            return False
        except Exception as e:
            logger.error(f"Local file deletion failed: {e}")
            return False
    
    def file_exists(self, file_path: str) -> bool:
        """Check if file exists in local storage"""
        full_path = self.storage_dir / file_path
        return full_path.exists()
    
    def get_file_info(self, file_path: str) -> Optional[dict]:
        """Get file metadata from local storage"""
        if file_path in self.metadata:
            return self.metadata[file_path]
        return None


class StorageService:
    """S3-compatible storage service for document management with local fallback"""

    def __init__(self):
        self.client = None
        self.bucket_name = settings.MINIO_BUCKET_NAME
        self.is_minio_available = False
        self.local_storage = None
        
        # Try to initialize MinIO client
        if MINIO_AVAILABLE and self._try_connect_minio():
            self.is_minio_available = True
            logger.info("MinIO storage initialized successfully")
        else:
            # Fallback to local storage
            self.local_storage = LocalStorageService()
            logger.warning("MinIO not available, using local storage fallback")
    
    def _try_connect_minio(self) -> bool:
        """Try to connect to MinIO server"""
        try:
            self.client = Minio(
                settings.MINIO_ENDPOINT,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=settings.MINIO_SECURE,
            )
            # Try to check if bucket exists (will fail if MinIO is not running)
            self.client.bucket_exists(self.bucket_name)
            self._ensure_bucket_exists()
            return True
        except Exception as e:
            logger.warning(f"Cannot connect to MinIO: {e}")
            return False

    def _ensure_bucket_exists(self) -> None:
        """Create bucket if it doesn't exist"""
        try:
            if self.client and not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
                logger.info(f"Created bucket: {self.bucket_name}")
        except Exception as e:
            logger.warning(f"Failed to ensure bucket exists: {e}")

    def upload_file(self, file_data: BinaryIO, filename: str, content_type: str, user_id: str) -> tuple[str, str, int]:
        """
        Upload file to storage

        Returns:
            tuple: (file_path, file_hash, file_size)
        """
        # Use local storage if MinIO is not available
        if not self.is_minio_available:
            return self.local_storage.upload_file(file_data, filename, content_type, user_id)
            
        try:
            # Generate unique file path
            file_id = str(uuid.uuid4())
            file_path = f"documents/{user_id}/{file_id}/{filename}"

            # Calculate file hash for integrity
            file_data.seek(0)
            file_content = file_data.read()
            file_hash = hashlib.sha256(file_content).hexdigest()
            file_size = len(file_content)

            # Reset file pointer
            file_data.seek(0)

            # Upload to MinIO
            self.client.put_object(
                bucket_name=self.bucket_name,
                object_name=file_path,
                data=file_data,
                length=file_size,
                content_type=content_type,
                metadata={"user_id": user_id, "original_filename": filename, "file_hash": file_hash},
            )

            logger.info(f"File uploaded successfully: {file_path}")
            return file_path, file_hash, file_size

        except S3Error as e:
            logger.error(f"File upload failed: {e}")
            raise

    def download_file(self, file_path: str) -> Optional[BinaryIO]:
        """Download file from storage"""
        # Use local storage if MinIO is not available
        if not self.is_minio_available:
            return self.local_storage.download_file(file_path)
            
        try:
            response = self.client.get_object(bucket_name=self.bucket_name, object_name=file_path)
            return response
        except S3Error as e:
            logger.error(f"File download failed: {e}")
            return None

    def get_file_content(self, file_path: str) -> Optional[bytes]:
        """Get file content as bytes from storage"""
        # Use local storage if MinIO is not available
        if not self.is_minio_available:
            return self.local_storage.get_file_content(file_path)
            
        try:
            response = self.client.get_object(bucket_name=self.bucket_name, object_name=file_path)
            content = response.read()
            logger.info(f"📄 Retrieved file from MinIO storage: {len(content):,} bytes")
            return content
        except S3Error as e:
            logger.error(f"Failed to get file content from MinIO storage: {e}")
            return None
        finally:
            if 'response' in locals():
                response.close()

    def delete_file(self, file_path: str) -> bool:
        """Delete file from storage"""
        # Use local storage if MinIO is not available
        if not self.is_minio_available:
            return self.local_storage.delete_file(file_path)
            
        try:
            self.client.remove_object(bucket_name=self.bucket_name, object_name=file_path)
            logger.info(f"File deleted: {file_path}")
            return True
        except S3Error as e:
            logger.error(f"File deletion failed: {e}")
            return False

    def get_presigned_url(self, file_path: str, expires: timedelta = timedelta(hours=1)) -> Optional[str]:
        """Generate presigned URL for secure file access"""
        # For local storage, return a local file URL
        if not self.is_minio_available:
            # Return a placeholder URL for local storage
            return f"file:///{self.local_storage.storage_dir}/{file_path}"
            
        try:
            url = self.client.presigned_get_object(bucket_name=self.bucket_name, object_name=file_path, expires=expires)
            return url
        except S3Error as e:
            logger.error(f"Presigned URL generation failed: {e}")
            return None

    def file_exists(self, file_path: str) -> bool:
        """Check if file exists in storage"""
        # Use local storage if MinIO is not available
        if not self.is_minio_available:
            return self.local_storage.file_exists(file_path)
            
        try:
            self.client.stat_object(bucket_name=self.bucket_name, object_name=file_path)
            return True
        except S3Error:
            return False

    def get_file_info(self, file_path: str) -> Optional[dict]:
        """Get file metadata and information"""
        # Use local storage if MinIO is not available
        if not self.is_minio_available:
            return self.local_storage.get_file_info(file_path)
            
        try:
            stat = self.client.stat_object(bucket_name=self.bucket_name, object_name=file_path)
            return {
                "size": stat.size,
                "etag": stat.etag,
                "last_modified": stat.last_modified,
                "content_type": stat.content_type,
                "metadata": stat.metadata,
            }
        except S3Error as e:
            logger.error(f"Get file info failed: {e}")
            return None


# Global storage service instance
storage_service = StorageService()
