"""
S3/MinIO Storage Service for SignaAI
Handles file uploads, downloads, and management in cloud storage
"""

import os
import io
import logging
from typing import Optional, BinaryIO, Dict, Any
from datetime import datetime, timedelta
import hashlib
import boto3
from botocore.exceptions import ClientError, NoCredentialsError
from minio import Minio
from minio.error import S3Error

logger = logging.getLogger(__name__)

class StorageService:
    """Manages file storage using S3 or MinIO"""
    
    def __init__(self):
        self.storage_type = os.getenv('STORAGE_TYPE', 'minio')  # 's3' or 'minio'
        self.bucket_name = os.getenv('S3_BUCKET_NAME', 'signai-documents')
        
        if self.storage_type == 's3':
            self._init_s3()
        else:
            self._init_minio()
    
    def _init_s3(self):
        """Initialize AWS S3 client"""
        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
            region_name=os.getenv('AWS_REGION', 'us-east-1')
        )
        self._ensure_bucket_exists_s3()
    
    def _init_minio(self):
        """Initialize MinIO client"""
        self.minio_client = Minio(
            os.getenv('MINIO_ENDPOINT', 'localhost:9000'),
            access_key=os.getenv('MINIO_ACCESS_KEY', 'minioadmin'),
            secret_key=os.getenv('MINIO_SECRET_KEY', 'minioadmin'),
            secure=os.getenv('MINIO_USE_SSL', 'false').lower() == 'true'
        )
        self._ensure_bucket_exists_minio()
    
    def _ensure_bucket_exists_s3(self):
        """Ensure S3 bucket exists"""
        try:
            self.s3_client.head_bucket(Bucket=self.bucket_name)
            logger.info(f"S3 bucket '{self.bucket_name}' exists")
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code')
            if error_code == '404':
                try:
                    self.s3_client.create_bucket(Bucket=self.bucket_name)
                    logger.info(f"Created S3 bucket '{self.bucket_name}'")
                except ClientError as create_error:
                    logger.error(f"Failed to create S3 bucket: {create_error}")
            else:
                logger.error(f"Error checking S3 bucket: {e}")
    
    def _ensure_bucket_exists_minio(self):
        """Ensure MinIO bucket exists"""
        try:
            if not self.minio_client.bucket_exists(self.bucket_name):
                self.minio_client.make_bucket(self.bucket_name)
                logger.info(f"Created MinIO bucket '{self.bucket_name}'")
            else:
                logger.info(f"MinIO bucket '{self.bucket_name}' exists")
        except S3Error as e:
            logger.error(f"Error with MinIO bucket: {e}")
    
    def generate_file_key(self, user_id: str, file_name: str, folder: str = 'documents') -> str:
        """Generate a unique file key for storage"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        file_hash = hashlib.md5(f"{user_id}_{timestamp}_{file_name}".encode()).hexdigest()[:8]
        file_extension = os.path.splitext(file_name)[1]
        
        # Structure: folder/user_id/timestamp_hash_filename
        key = f"{folder}/{user_id}/{timestamp}_{file_hash}_{file_name}"
        return key
    
    async def upload_file(self, file_data: BinaryIO, file_name: str, 
                         user_id: str, content_type: str = None,
                         metadata: Dict[str, str] = None) -> Dict[str, Any]:
        """Upload a file to storage"""
        try:
            file_key = self.generate_file_key(user_id, file_name)
            
            # Add metadata
            if metadata is None:
                metadata = {}
            metadata.update({
                'user_id': user_id,
                'original_filename': file_name,
                'upload_timestamp': datetime.now().isoformat()
            })
            
            if self.storage_type == 's3':
                return await self._upload_to_s3(file_data, file_key, content_type, metadata)
            else:
                return await self._upload_to_minio(file_data, file_key, content_type, metadata)
                
        except Exception as e:
            logger.error(f"Failed to upload file: {e}")
            raise
    
    async def _upload_to_s3(self, file_data: BinaryIO, file_key: str, 
                           content_type: str, metadata: Dict) -> Dict[str, Any]:
        """Upload file to S3"""
        try:
            # Read file data
            file_content = file_data.read()
            file_size = len(file_content)
            
            # Upload to S3
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=file_key,
                Body=file_content,
                ContentType=content_type or 'application/octet-stream',
                Metadata=metadata
            )
            
            logger.info(f"Uploaded file to S3: {file_key}")
            
            return {
                'file_key': file_key,
                'bucket': self.bucket_name,
                'size': file_size,
                'url': self.get_file_url(file_key),
                'storage_type': 's3'
            }
            
        except ClientError as e:
            logger.error(f"S3 upload failed: {e}")
            raise
    
    async def _upload_to_minio(self, file_data: BinaryIO, file_key: str,
                              content_type: str, metadata: Dict) -> Dict[str, Any]:
        """Upload file to MinIO"""
        try:
            # Get file size
            file_data.seek(0, 2)  # Seek to end
            file_size = file_data.tell()
            file_data.seek(0)  # Reset to beginning
            
            # Upload to MinIO
            self.minio_client.put_object(
                self.bucket_name,
                file_key,
                file_data,
                file_size,
                content_type=content_type or 'application/octet-stream',
                metadata=metadata
            )
            
            logger.info(f"Uploaded file to MinIO: {file_key}")
            
            return {
                'file_key': file_key,
                'bucket': self.bucket_name,
                'size': file_size,
                'url': self.get_file_url(file_key),
                'storage_type': 'minio'
            }
            
        except S3Error as e:
            logger.error(f"MinIO upload failed: {e}")
            raise
    
    async def download_file(self, file_key: str) -> Optional[bytes]:
        """Download a file from storage"""
        try:
            if self.storage_type == 's3':
                return await self._download_from_s3(file_key)
            else:
                return await self._download_from_minio(file_key)
                
        except Exception as e:
            logger.error(f"Failed to download file {file_key}: {e}")
            return None
    
    async def _download_from_s3(self, file_key: str) -> bytes:
        """Download file from S3"""
        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket_name,
                Key=file_key
            )
            return response['Body'].read()
            
        except ClientError as e:
            if e.response.get('Error', {}).get('Code') == 'NoSuchKey':
                logger.warning(f"File not found in S3: {file_key}")
                return None
            raise
    
    async def _download_from_minio(self, file_key: str) -> bytes:
        """Download file from MinIO"""
        try:
            response = self.minio_client.get_object(
                self.bucket_name,
                file_key
            )
            data = response.read()
            response.close()
            response.release_conn()
            return data
            
        except S3Error as e:
            if e.code == 'NoSuchKey':
                logger.warning(f"File not found in MinIO: {file_key}")
                return None
            raise
    
    def get_file_url(self, file_key: str, expiration: int = 3600) -> str:
        """Get a pre-signed URL for file access"""
        try:
            if self.storage_type == 's3':
                return self._get_s3_url(file_key, expiration)
            else:
                return self._get_minio_url(file_key, expiration)
                
        except Exception as e:
            logger.error(f"Failed to generate URL for {file_key}: {e}")
            return None
    
    def _get_s3_url(self, file_key: str, expiration: int) -> str:
        """Generate pre-signed S3 URL"""
        try:
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket_name, 'Key': file_key},
                ExpiresIn=expiration
            )
            return url
        except ClientError as e:
            logger.error(f"Failed to generate S3 URL: {e}")
            return None
    
    def _get_minio_url(self, file_key: str, expiration: int) -> str:
        """Generate pre-signed MinIO URL"""
        try:
            url = self.minio_client.presigned_get_object(
                self.bucket_name,
                file_key,
                expires=timedelta(seconds=expiration)
            )
            return url
        except S3Error as e:
            logger.error(f"Failed to generate MinIO URL: {e}")
            return None
    
    async def delete_file(self, file_key: str) -> bool:
        """Delete a file from storage"""
        try:
            if self.storage_type == 's3':
                return await self._delete_from_s3(file_key)
            else:
                return await self._delete_from_minio(file_key)
                
        except Exception as e:
            logger.error(f"Failed to delete file {file_key}: {e}")
            return False
    
    async def _delete_from_s3(self, file_key: str) -> bool:
        """Delete file from S3"""
        try:
            self.s3_client.delete_object(
                Bucket=self.bucket_name,
                Key=file_key
            )
            logger.info(f"Deleted file from S3: {file_key}")
            return True
            
        except ClientError as e:
            logger.error(f"Failed to delete from S3: {e}")
            return False
    
    async def _delete_from_minio(self, file_key: str) -> bool:
        """Delete file from MinIO"""
        try:
            self.minio_client.remove_object(
                self.bucket_name,
                file_key
            )
            logger.info(f"Deleted file from MinIO: {file_key}")
            return True
            
        except S3Error as e:
            logger.error(f"Failed to delete from MinIO: {e}")
            return False
    
    async def list_user_files(self, user_id: str, folder: str = 'documents') -> list:
        """List all files for a user"""
        prefix = f"{folder}/{user_id}/"
        
        try:
            if self.storage_type == 's3':
                return await self._list_s3_files(prefix)
            else:
                return await self._list_minio_files(prefix)
                
        except Exception as e:
            logger.error(f"Failed to list files for user {user_id}: {e}")
            return []
    
    async def _list_s3_files(self, prefix: str) -> list:
        """List files in S3"""
        try:
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix=prefix
            )
            
            files = []
            for obj in response.get('Contents', []):
                files.append({
                    'key': obj['Key'],
                    'size': obj['Size'],
                    'last_modified': obj['LastModified'].isoformat(),
                    'url': self.get_file_url(obj['Key'])
                })
            
            return files
            
        except ClientError as e:
            logger.error(f"Failed to list S3 files: {e}")
            return []
    
    async def _list_minio_files(self, prefix: str) -> list:
        """List files in MinIO"""
        try:
            objects = self.minio_client.list_objects(
                self.bucket_name,
                prefix=prefix,
                recursive=True
            )
            
            files = []
            for obj in objects:
                files.append({
                    'key': obj.object_name,
                    'size': obj.size,
                    'last_modified': obj.last_modified.isoformat(),
                    'url': self.get_file_url(obj.object_name)
                })
            
            return files
            
        except S3Error as e:
            logger.error(f"Failed to list MinIO files: {e}")
            return []
    
    def get_file_metadata(self, file_key: str) -> Optional[Dict]:
        """Get metadata for a file"""
        try:
            if self.storage_type == 's3':
                response = self.s3_client.head_object(
                    Bucket=self.bucket_name,
                    Key=file_key
                )
                return {
                    'size': response['ContentLength'],
                    'content_type': response.get('ContentType'),
                    'last_modified': response['LastModified'].isoformat(),
                    'metadata': response.get('Metadata', {})
                }
            else:
                stat = self.minio_client.stat_object(
                    self.bucket_name,
                    file_key
                )
                return {
                    'size': stat.size,
                    'content_type': stat.content_type,
                    'last_modified': stat.last_modified.isoformat(),
                    'metadata': stat.metadata
                }
                
        except Exception as e:
            logger.error(f"Failed to get metadata for {file_key}: {e}")
            return None

# Global storage service instance
storage_service = StorageService()

def get_storage_service():
    """Dependency to get storage service"""
    return storage_service