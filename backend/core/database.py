"""
Database configuration and connection management
SQLAlchemy setup with PostgreSQL/SQLite
"""

import logging
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker

from core.config import settings

logger = logging.getLogger(__name__)

# Database engine - handle SQLite differently
if "sqlite" in settings.DATABASE_URL:
    # SQLite specific settings
    engine = create_engine(
        settings.DATABASE_URL, 
        connect_args={"check_same_thread": False},  # Needed for SQLite
        echo=settings.DEBUG
    )
else:
    # PostgreSQL settings
    engine = create_engine(
        settings.DATABASE_URL, 
        pool_pre_ping=True, 
        pool_recycle=300, 
        echo=settings.DEBUG
    )

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """
    Database dependency for FastAPI
    Provides database session with automatic cleanup
    """
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        logger.error(f"Database session error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def init_db() -> None:
    """Initialize database tables"""
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise
