"""
Configuration management for SignaAI backend
Environment variables and application settings
"""

import os
from typing import List, Optional

from pydantic import validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings with environment variable support"""
    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=".env",
        extra="ignore"
    )

    # Application
    APP_NAME: str = "SignaAI"
    DEBUG: bool = False
    VERSION: str = "1.0.0"
    FRONTEND_URL: str = "http://localhost:5114"

    # Security
    SECRET_KEY: str
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_HOURS: int = 24

    # Database
    # Use SQLite for local development if PostgreSQL is not available
    DATABASE_URL: str = "sqlite:///./signaai.db"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # Storage (MinIO/S3)
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = ""
    MINIO_SECRET_KEY: str = ""
    MINIO_BUCKET_NAME: str = "signa-documents"
    MINIO_SECURE: bool = False

    # Message Queue
    RABBITMQ_URL: str = ""

    # CORS Settings
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",  # React frontend default
        "http://localhost:5114",  # Current frontend port
        "http://localhost:5173",  # Vite dev server
        "http://localhost:5174",  # Vite dev server alt
        "http://localhost:5175",  # Vite dev server alt 2
        "http://localhost:5176",  # Vite dev server alt 3
        "http://localhost:5182",  # Backend API
        "http://localhost:8080",  # Test HTML server
        "https://localhost:3000",  # HTTPS frontend
        "https://localhost:5114",  # HTTPS current frontend
        "https://localhost:5173",  # HTTPS Vite dev
        "https://localhost:5174",  # HTTPS Vite alt
        "https://localhost:5175",  # HTTPS Vite alt 2
        "null",  # Allow file:// protocol for local HTML test files
    ]

    # File Upload Settings
    MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50MB
    ALLOWED_FILE_TYPES: List[str] = [
        # PDF
        "application/pdf",
        # Word documents
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
        "application/msword",  # .doc
        # Images
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/bmp",
        "image/tiff",
        "image/webp",
        "image/svg+xml",
    ]
    
    # Allowed file extensions
    ALLOWED_EXTENSIONS: List[str] = [
        ".pdf",
        ".doc", ".docx",
        ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".tif", ".webp", ".svg"
    ]

    # Email Settings (SMTP configuration for notifications)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    SMTP_FROM_EMAIL: str = "noreply@signa-ai.com"
    SUPPORT_EMAIL: str = "support@signa-ai.com"

    # Twilio Settings (SMS and WhatsApp notifications)
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_PHONE_NUMBER: str = ""
    TWILIO_WHATSAPP_NUMBER: str = ""

    # AI/ML Settings
    AI_MODEL_PATH: str = "./models"
    OCR_LANGUAGE_PACKS: List[str] = ["eng", "ara", "heb"]  # English, Arabic, Hebrew
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-flash"

    # Israeli Legal Compliance
    DIGITAL_SIGNATURE_CERT_PATH: str = ""
    TIMESTAMP_SERVER_URL: str = ""

    @validator("ALLOWED_ORIGINS", pre=True)
    def parse_cors_origins(cls, v):
        """Parse CORS origins from environment variable"""
        if isinstance(v, str):
            return v.split(",")
        return v

    # Additional fields from .env file
    SMTP_SERVER: Optional[str] = None
    FROM_EMAIL: Optional[str] = None
    SMS_PROVIDER: Optional[str] = None
    SMS_API_KEY: Optional[str] = None
    SMS_API_SECRET: Optional[str] = None

    # @validator("SECRET_KEY")
    # def secret_key_must_be_set(cls, v):
    #     if not v:
    #         raise ValueError("SECRET_KEY must be set in environment variables")
    #     if v == "dev_secret_key_change_in_production":
    #         raise ValueError("SECRET_KEY must be changed from default value")
    #     if len(v) < 32:
    #         raise ValueError("SECRET_KEY must be at least 32 characters long")
    #     return v

    # @validator("JWT_SECRET_KEY")
    # def jwt_secret_key_must_be_set(cls, v):
    #     if not v:
    #         raise ValueError("JWT_SECRET_KEY must be set in environment variables")
    #     return v

    # @validator("DATABASE_URL")
    # def database_url_must_be_postgresql_in_production(cls, v):
    #     if os.getenv("ENVIRONMENT", "development") == "production":
    #         if "sqlite" in v:
    #             raise ValueError("Production must use PostgreSQL, not SQLite")
    #     return v

# Global settings instance
settings = Settings()
