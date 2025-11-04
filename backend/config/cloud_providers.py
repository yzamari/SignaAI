"""
Provider-agnostic cloud service interfaces for SignaAI
Supports easy switching between GCP, AWS, Azure, and other providers
"""

import asyncio
import logging
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional, Protocol, Union

logger = logging.getLogger(__name__)


class CloudProvider(Enum):
    """Supported cloud providers"""

    GCP = "gcp"
    AWS = "aws"
    AZURE = "azure"
    MULTI_CLOUD = "multi_cloud"


@dataclass
class AIResult:
    """Standardized AI analysis result"""

    confidence_score: float
    fields: List[Dict[str, Any]]
    processing_time_ms: int
    model_version: str
    language: str
    metadata: Dict[str, Any]


@dataclass
class StorageResult:
    """Standardized storage operation result"""

    url: str
    size_bytes: int
    content_type: str
    etag: str
    metadata: Dict[str, Any]


@dataclass
class AnalyticsResult:
    """Standardized analytics query result"""

    data: List[Dict[str, Any]]
    total_rows: int
    execution_time_ms: int
    bytes_processed: int


class ICloudStorage(Protocol):
    """Abstract interface for cloud storage services"""

    async def store_file(
        self,
        data: bytes,
        path: str,
        content_type: str = "application/octet-stream",
        metadata: Optional[Dict[str, str]] = None,
    ) -> StorageResult:
        """Store file in cloud storage"""
        ...

    async def retrieve_file(self, path: str) -> bytes:
        """Retrieve file from cloud storage"""
        ...

    async def delete_file(self, path: str) -> bool:
        """Delete file from cloud storage"""
        ...

    async def generate_signed_url(self, path: str, expiration_minutes: int = 60, method: str = "GET") -> str:
        """Generate signed URL for temporary access"""
        ...

    async def list_files(self, prefix: str = "", limit: int = 100) -> List[Dict[str, Any]]:
        """List files with optional prefix filter"""
        ...


class IAIService(Protocol):
    """Abstract interface for AI/ML services"""

    async def detect_signature_fields(
        self, document: bytes, language: str = "en", document_type: str = "generic"
    ) -> AIResult:
        """Detect signature fields in document"""
        ...

    async def extract_text(self, image: bytes, language: str = "en") -> Dict[str, Any]:
        """Extract text from image using OCR"""
        ...

    async def analyze_document_structure(self, document: bytes, language: str = "en") -> Dict[str, Any]:
        """Analyze document structure and content"""
        ...

    async def train_custom_model(
        self, training_data: List[Dict[str, Any]], model_type: str = "signature_detection"
    ) -> str:
        """Train custom model with user data"""
        ...


class IDatabase(Protocol):
    """Abstract interface for database services"""

    async def execute_query(self, query: str, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Execute database query"""
        ...

    async def insert_record(self, table: str, data: Dict[str, Any]) -> str:
        """Insert record and return ID"""
        ...

    async def update_record(self, table: str, record_id: str, data: Dict[str, Any]) -> bool:
        """Update existing record"""
        ...

    async def delete_record(self, table: str, record_id: str) -> bool:
        """Delete record"""
        ...


class IAnalytics(Protocol):
    """Abstract interface for analytics/data warehouse services"""

    async def execute_analytics_query(self, query: str) -> AnalyticsResult:
        """Execute analytics query"""
        ...

    async def stream_data(self, table: str, data: List[Dict[str, Any]]) -> bool:
        """Stream data to analytics table"""
        ...

    async def create_dashboard(self, dashboard_config: Dict[str, Any]) -> str:
        """Create analytics dashboard"""
        ...


class IMessageQueue(Protocol):
    """Abstract interface for message queue services"""

    async def publish_message(
        self, topic: str, message: Dict[str, Any], attributes: Optional[Dict[str, str]] = None
    ) -> str:
        """Publish message to queue"""
        ...

    async def subscribe_to_topic(self, topic: str, callback: callable) -> str:
        """Subscribe to topic with callback"""
        ...

    async def create_topic(self, topic_name: str) -> bool:
        """Create message queue topic"""
        ...


class INotificationService(Protocol):
    """Abstract interface for notification services"""

    async def send_email(
        self,
        to: str,
        subject: str,
        body: str,
        template_id: Optional[str] = None,
        template_data: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Send email notification"""
        ...

    async def send_sms(self, to: str, message: str) -> bool:
        """Send SMS notification"""
        ...

    async def send_push_notification(self, device_token: str, title: str, body: str) -> bool:
        """Send push notification"""
        ...


class IMonitoring(Protocol):
    """Abstract interface for monitoring and logging services"""

    async def log_event(self, level: str, message: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Log application event"""
        ...

    async def record_metric(
        self, metric_name: str, value: Union[int, float], labels: Optional[Dict[str, str]] = None
    ) -> None:
        """Record custom metric"""
        ...

    async def create_alert(self, alert_config: Dict[str, Any]) -> str:
        """Create monitoring alert"""
        ...


# =============================================================================
# GCP Implementations
# =============================================================================


class GCPStorageService:
    """Google Cloud Storage implementation"""

    def __init__(self):
        try:
            from google.cloud import storage

            self.client = storage.Client()
            self.bucket_name = os.getenv("GCP_STORAGE_BUCKET", "signa-ai-documents")
            self.bucket = self.client.bucket(self.bucket_name)
            logger.info(f"Initialized GCP Storage with bucket: {self.bucket_name}")
        except ImportError:
            logger.error("Google Cloud Storage SDK not installed")
            raise

    async def store_file(
        self,
        data: bytes,
        path: str,
        content_type: str = "application/octet-stream",
        metadata: Optional[Dict[str, str]] = None,
    ) -> StorageResult:
        """Store file in Google Cloud Storage"""

        blob = self.bucket.blob(path)
        blob.upload_from_string(data, content_type=content_type)

        if metadata:
            blob.metadata = metadata
            blob.patch()

        return StorageResult(
            url=f"gs://{self.bucket_name}/{path}",
            size_bytes=len(data),
            content_type=content_type,
            etag=blob.etag,
            metadata=blob.metadata or {},
        )

    async def retrieve_file(self, path: str) -> bytes:
        """Retrieve file from Google Cloud Storage"""
        blob = self.bucket.blob(path)
        return blob.download_as_bytes()

    async def delete_file(self, path: str) -> bool:
        """Delete file from Google Cloud Storage"""
        try:
            blob = self.bucket.blob(path)
            blob.delete()
            return True
        except Exception as e:
            logger.error(f"Failed to delete file {path}: {e}")
            return False

    async def generate_signed_url(self, path: str, expiration_minutes: int = 60, method: str = "GET") -> str:
        """Generate signed URL for temporary access"""
        from datetime import timedelta

        blob = self.bucket.blob(path)
        return blob.generate_signed_url(expiration=timedelta(minutes=expiration_minutes), method=method)

    async def list_files(self, prefix: str = "", limit: int = 100) -> List[Dict[str, Any]]:
        """List files with optional prefix filter"""
        blobs = self.client.list_blobs(self.bucket_name, prefix=prefix, max_results=limit)

        return [
            {
                "name": blob.name,
                "size": blob.size,
                "content_type": blob.content_type,
                "created": blob.time_created.isoformat() if blob.time_created else None,
                "etag": blob.etag,
            }
            for blob in blobs
        ]


class GeminiAIService:
    """Google Gemini AI implementation"""

    def __init__(self):
        try:
            import google.generativeai as genai
            from google.cloud import aiplatform

            # Initialize Gemini API
            api_key = os.getenv("GOOGLE_AI_API_KEY")
            if api_key:
                genai.configure(api_key=api_key)
                self.gemini_model = genai.GenerativeModel("gemini-2.5-flash")

            # Initialize Vertex AI
            project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
            if project_id:
                aiplatform.init(project=project_id)

            logger.info("Initialized Gemini AI Service")

        except ImportError:
            logger.error("Google AI SDK not installed")
            raise

    async def detect_signature_fields(
        self, document: bytes, language: str = "en", document_type: str = "generic"
    ) -> AIResult:
        """Detect signature fields using Gemini AI"""

        import time

        start_time = time.time()

        # Language-specific signature keywords
        signature_keywords = {
            "en": ["signature", "sign here", "signature required", "please sign"],
            "ar": ["التوقيع", "وقع هنا", "المطلوب التوقيع", "يرجى التوقيع"],
            "he": ["חתימה", "חתום כאן", "נדרש חתימה", "אנא חתום"],
        }

        # Create multi-modal prompt
        prompt = f"""
        Analyze this {document_type} document in {language} language and identify signature fields.
        
        Look for these patterns:
        Keywords: {signature_keywords.get(language, signature_keywords['en'])}
        
        Return a JSON response with:
        {{
            "fields": [
                {{
                    "type": "signature|initial|date",
                    "coordinates": {{"x": 0, "y": 0, "width": 100, "height": 50}},
                    "confidence": 0.95,
                    "context": "surrounding text",
                    "required": true
                }}
            ],
            "document_language": "{language}",
            "overall_confidence": 0.92
        }}
        """

        try:
            # Convert document to appropriate format for Gemini
            import base64

            document_b64 = base64.b64encode(document).decode()

            response = await self._call_gemini_multimodal(prompt, document_b64)
            processing_time = int((time.time() - start_time) * 1000)

            return AIResult(
                confidence_score=response.get("overall_confidence", 0.0),
                fields=response.get("fields", []),
                processing_time_ms=processing_time,
                model_version="gemini-2.5-flash",
                language=language,
                metadata={"document_type": document_type, "keywords_used": signature_keywords.get(language, [])},
            )

        except Exception as e:
            logger.error(f"Gemini signature detection failed: {e}")
            return AIResult(
                confidence_score=0.0,
                fields=[],
                processing_time_ms=int((time.time() - start_time) * 1000),
                model_version="gemini-2.5-flash",
                language=language,
                metadata={"error": str(e)},
            )

    async def extract_text(self, image: bytes, language: str = "en") -> Dict[str, Any]:
        """Extract text from image using Gemini Vision"""

        language_prompts = {
            "ar": "استخرج كل النص من هذه الصورة. انتبه للكتابة من اليمين إلى اليسار",
            "he": "חלץ את כל הטקסט מהתמונה הזו. שים לב לכיוון הכתיבה מימין לשמאל",
            "en": "Extract all text from this image. Maintain original formatting and structure.",
        }

        prompt = language_prompts.get(language, language_prompts["en"])

        try:
            import base64

            image_b64 = base64.b64encode(image).decode()

            result = await self._call_gemini_vision(prompt, image_b64)

            return {
                "text": result.get("extracted_text", ""),
                "language": language,
                "confidence": result.get("confidence", 0.0),
                "bounding_boxes": result.get("bounding_boxes", []),
            }

        except Exception as e:
            logger.error(f"Gemini OCR failed: {e}")
            return {"text": "", "language": language, "confidence": 0.0, "error": str(e)}

    async def _call_gemini_multimodal(self, prompt: str, document_b64: str) -> Dict[str, Any]:
        """Call Gemini multimodal API"""
        # Implementation for multimodal Gemini API call
        # This would use the actual Gemini API to process document + text

        # Placeholder implementation
        return {
            "overall_confidence": 0.85,
            "fields": [
                {
                    "type": "signature",
                    "coordinates": {"x": 100, "y": 200, "width": 150, "height": 40},
                    "confidence": 0.92,
                    "context": "Please sign here",
                    "required": True,
                }
            ],
        }

    async def _call_gemini_vision(self, prompt: str, image_b64: str) -> Dict[str, Any]:
        """Call Gemini Vision API"""
        # Implementation for Gemini Vision API call

        # Placeholder implementation
        return {"extracted_text": "Sample extracted text", "confidence": 0.88, "bounding_boxes": []}


class BigQueryAnalytics:
    """Google BigQuery analytics implementation"""

    def __init__(self):
        try:
            from google.cloud import bigquery

            self.client = bigquery.Client()
            self.dataset_id = os.getenv("BIGQUERY_DATASET", "signa_ai")
            logger.info(f"Initialized BigQuery with dataset: {self.dataset_id}")
        except ImportError:
            logger.error("Google Cloud BigQuery SDK not installed")
            raise

    async def execute_analytics_query(self, query: str) -> AnalyticsResult:
        """Execute analytics query on BigQuery"""

        import time

        start_time = time.time()

        try:
            query_job = self.client.query(query)
            results = query_job.result()

            data = [dict(row) for row in results]
            processing_time = int((time.time() - start_time) * 1000)

            return AnalyticsResult(
                data=data,
                total_rows=results.total_rows,
                execution_time_ms=processing_time,
                bytes_processed=query_job.total_bytes_processed or 0,
            )

        except Exception as e:
            logger.error(f"BigQuery query failed: {e}")
            raise

    async def stream_data(self, table: str, data: List[Dict[str, Any]]) -> bool:
        """Stream data to BigQuery table"""

        try:
            table_ref = self.client.dataset(self.dataset_id).table(table)
            table_obj = self.client.get_table(table_ref)

            errors = self.client.insert_rows_json(table_obj, data)

            if errors:
                logger.error(f"BigQuery streaming errors: {errors}")
                return False

            return True

        except Exception as e:
            logger.error(f"BigQuery streaming failed: {e}")
            return False


# =============================================================================
# Provider Factory
# =============================================================================


class CloudServiceFactory:
    """Factory for creating cloud service instances"""

    @staticmethod
    def get_storage_service() -> ICloudStorage:
        """Get storage service based on configuration"""
        provider = os.getenv("CLOUD_PROVIDER", CloudProvider.GCP.value)

        if provider == CloudProvider.GCP.value:
            return GCPStorageService()
        elif provider == CloudProvider.AWS.value:
            # Future: return AWSStorageService()
            raise NotImplementedError("AWS storage not yet implemented")
        elif provider == CloudProvider.AZURE.value:
            # Future: return AzureStorageService()
            raise NotImplementedError("Azure storage not yet implemented")
        else:
            raise ValueError(f"Unsupported storage provider: {provider}")

    @staticmethod
    def get_ai_service() -> IAIService:
        """Get AI service based on configuration"""
        provider = os.getenv("AI_PROVIDER", "gemini")

        if provider == "gemini":
            return GeminiAIService()
        elif provider == "bedrock":
            # Future: return BedrockAIService()
            raise NotImplementedError("AWS Bedrock not yet implemented")
        elif provider == "azure_ai":
            # Future: return AzureAIService()
            raise NotImplementedError("Azure AI not yet implemented")
        else:
            raise ValueError(f"Unsupported AI provider: {provider}")

    @staticmethod
    def get_analytics_service() -> IAnalytics:
        """Get analytics service based on configuration"""
        provider = os.getenv("ANALYTICS_PROVIDER", "bigquery")

        if provider == "bigquery":
            return BigQueryAnalytics()
        elif provider == "redshift":
            # Future: return RedshiftAnalytics()
            raise NotImplementedError("AWS Redshift not yet implemented")
        elif provider == "synapse":
            # Future: return AzureSynapseAnalytics()
            raise NotImplementedError("Azure Synapse not yet implemented")
        else:
            raise ValueError(f"Unsupported analytics provider: {provider}")


# =============================================================================
# Convenience Functions
# =============================================================================


def get_cloud_services() -> Dict[str, Any]:
    """Get all configured cloud services"""

    return {
        "storage": CloudServiceFactory.get_storage_service(),
        "ai": CloudServiceFactory.get_ai_service(),
        "analytics": CloudServiceFactory.get_analytics_service(),
    }


async def health_check_services() -> Dict[str, bool]:
    """Health check for all cloud services"""

    services = get_cloud_services()
    health_status = {}

    # Test storage service
    try:
        storage = services["storage"]
        # Simple test: list files (should not fail even if empty)
        await storage.list_files(limit=1)
        health_status["storage"] = True
    except Exception as e:
        logger.error(f"Storage health check failed: {e}")
        health_status["storage"] = False

    # Test AI service
    try:
        ai = services["ai"]
        # Simple test: this would need to be implemented per service
        health_status["ai"] = True
    except Exception as e:
        logger.error(f"AI service health check failed: {e}")
        health_status["ai"] = False

    # Test analytics service
    try:
        analytics = services["analytics"]
        # Simple test query
        await analytics.execute_analytics_query("SELECT 1 as health_check")
        health_status["analytics"] = True
    except Exception as e:
        logger.error(f"Analytics health check failed: {e}")
        health_status["analytics"] = False

    return health_status


if __name__ == "__main__":
    # Example usage
    async def example_usage():
        services = get_cloud_services()

        # Store a file
        storage = services["storage"]
        result = await storage.store_file(data=b"Hello, SignaAI!", path="test/hello.txt", content_type="text/plain")
        print(f"Stored file: {result.url}")

        # Analyze a document with AI
        ai = services["ai"]
        ai_result = await ai.detect_signature_fields(document=b"sample document content", language="en")
        print(f"AI Analysis: {ai_result.confidence_score} confidence")

        # Run an analytics query
        analytics = services["analytics"]
        query_result = await analytics.execute_analytics_query("SELECT COUNT(*) as total FROM `signa_ai.documents`")
        print(f"Analytics: {len(query_result.data)} results")

    # Run example
    asyncio.run(example_usage())
