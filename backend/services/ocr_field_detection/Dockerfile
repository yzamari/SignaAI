# Production Dockerfile for SignaAI OCR Field Detection Service
# This service requires OpenCV, Tesseract, and other image processing libraries

FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies for OCR and image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Tesseract OCR
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-ara \
    tesseract-ocr-heb \
    # Image processing libraries
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    # PDF processing
    poppler-utils \
    # Build dependencies
    gcc \
    g++ \
    pkg-config \
    libglib2.0-dev \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN groupadd -r ocruser && useradd -r -g ocruser ocruser

# Install Python dependencies directly
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir \
    fastapi==0.104.1 \
    uvicorn[standard]==0.24.0 \
    opencv-python-headless==4.8.1.78 \
    numpy==1.25.2 \
    Pillow==10.1.0 \
    pdf2image==1.16.3 \
    pytesseract==0.3.10 \
    scikit-learn==1.3.2 \
    pydantic==2.5.0 \
    python-multipart==0.0.6 \
    httpx==0.25.2

# Copy OCR service code
COPY --chown=ocruser:ocruser . .

# Create necessary directories and set permissions
RUN mkdir -p /app/temp /app/logs && \
    chown -R ocruser:ocruser /app

# Switch to non-root user
USER ocruser

# Health check (disabled for Cloud Run - it has its own health checks)
# HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
#     CMD python -c "import requests; requests.get('http://localhost:8080/health')" || exit 1

# Expose port
EXPOSE 8000

# Start the OCR service (Cloud Run sets PORT env var)
CMD uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2