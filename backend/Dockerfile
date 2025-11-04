FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy and install requirements
COPY requirements-minimal.txt ./
RUN pip install --no-cache-dir -r requirements-minimal.txt
RUN pip install --no-cache-dir sqlalchemy psycopg2-binary alembic

# Copy all application code
COPY . .

# Environment variables
ENV PORT=8080
ENV PYTHONUNBUFFERED=1
ENV DATABASE_URL="postgresql://signaai:SignaAI2024!@/signaai?host=/cloudsql/signaai-prod-1758272250:us-central1:signaai-instance"
ENV SECRET_KEY="super-secret-key-for-production-2024"
ENV JWT_SECRET_KEY="jwt-secret-key-for-production-2024"
ENV GEMINI_API_KEY="AIzaSyCtw5XG_XTbxxNRajkbGWj9feoaqwFoptA"
ENV TWILIO_ACCOUNT_SID=""
ENV TWILIO_AUTH_TOKEN=""
ENV TWILIO_PHONE_NUMBER=""
ENV FRONTEND_URL="https://signaai-frontend-691837885081.us-central1.run.app"

# Run the application - use main.py for now to avoid database issues
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT} --workers 1