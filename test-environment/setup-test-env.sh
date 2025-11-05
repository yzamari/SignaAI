#!/bin/bash

# SignaAI Test Environment Setup Script
# This script sets up the complete local test environment for SignaAI

set -e

echo "==================================="
echo "SignaAI Test Environment Setup"
echo "==================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check required tools
echo -e "${YELLOW}Checking required tools...${NC}"

check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}✗ $1 is not installed${NC}"
        return 1
    else
        echo -e "${GREEN}✓ $1 is installed${NC}"
        return 0
    fi
}

# Check prerequisites
MISSING_DEPS=0
check_command "python3" || MISSING_DEPS=1
check_command "node" || MISSING_DEPS=1
check_command "npm" || MISSING_DEPS=1
check_command "docker" || MISSING_DEPS=1
check_command "docker-compose" || MISSING_DEPS=1

if [ $MISSING_DEPS -eq 1 ]; then
    echo -e "${RED}Please install missing dependencies before continuing.${NC}"
    exit 1
fi

# Create necessary directories
echo -e "\n${YELLOW}Creating test directories...${NC}"
mkdir -p test-environment
mkdir -p test-results
mkdir -p test-data
mkdir -p backend/test-uploads

# Create and activate Python virtual environment
echo -e "\n${YELLOW}Setting up Python virtual environment...${NC}"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate

# Install Python dependencies
echo -e "\n${YELLOW}Installing Python dependencies...${NC}"
cd backend
pip install --upgrade pip
pip install -r requirements.txt
pip install pytest pytest-asyncio pytest-cov httpx locust bandit || true
cd ..

# Install Node dependencies for frontend
echo -e "\n${YELLOW}Installing Node dependencies...${NC}"
cd signa-app
npm install
npm install -D @playwright/test @testing-library/react @testing-library/jest-dom jest @types/jest
cd ..

# Create test environment file
echo -e "\n${YELLOW}Creating test environment configuration...${NC}"
cat > test-environment/.env.test <<EOF
# Test Environment Configuration
NODE_ENV=test
API_URL=http://localhost:5112
OCR_SERVICE_URL=http://localhost:5113
FRONTEND_URL=http://localhost:5114
DATABASE_URL=./test-signaai.db

# Test credentials
TEST_USER_EMAIL=test@signaai.com
TEST_USER_PASSWORD=Test123!

# Services
GEMINI_API_KEY=AIzaSyCtw5XG_XTbxxNRajkbGWj9feoaqwFoptA
TWILIO_ACCOUNT_SID=test_sid
TWILIO_AUTH_TOKEN=test_token
TWILIO_PHONE_NUMBER=+1234567890

# JWT Secrets
JWT_ACCESS_SECRET=test-access-secret
JWT_REFRESH_SECRET=test-refresh-secret
SECRET_KEY=test-secret-key

# SMTP (for testing)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=test
SMTP_PASS=test
EOF

# Create docker-compose for test services
echo -e "\n${YELLOW}Creating test docker-compose configuration...${NC}"
cat > test-environment/docker-compose.test.yml <<'EOF'
version: '3.8'

services:
  # Test Database
  test-postgres:
    image: postgres:15-alpine
    container_name: signaai-test-postgres
    ports:
      - "5433:5432"
    environment:
      - POSTGRES_USER=test
      - POSTGRES_PASSWORD=test
      - POSTGRES_DB=signaai_test
    volumes:
      - test-postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U test"]
      interval: 5s
      timeout: 5s
      retries: 5

  # Test Redis
  test-redis:
    image: redis:7-alpine
    container_name: signaai-test-redis
    ports:
      - "6380:6379"
    command: redis-server --appendonly yes
    volumes:
      - test-redis-data:/data

  # Test Mail Server (MailHog)
  mailhog:
    image: mailhog/mailhog
    container_name: signaai-test-mailhog
    ports:
      - "1025:1025" # SMTP
      - "8025:8025" # Web UI
    logging:
      driver: 'none'

volumes:
  test-postgres-data:
  test-redis-data:
EOF

# Create service startup script
echo -e "\n${YELLOW}Creating service startup script...${NC}"
cat > test-environment/start-services.sh <<'EOF'
#!/bin/bash

# Start Test Services Script

set -e

echo "Starting test environment services..."

# Function to wait for service
wait_for_service() {
    local url=$1
    local service=$2
    local max_attempts=30
    local attempt=0
    
    echo -n "Waiting for $service..."
    while [ $attempt -lt $max_attempts ]; do
        if curl -s "$url" > /dev/null 2>&1; then
            echo " Ready!"
            return 0
        fi
        echo -n "."
        sleep 1
        ((attempt++))
    done
    echo " Failed!"
    return 1
}

# Start test containers
echo "Starting Docker test containers..."
cd test-environment
docker-compose -f docker-compose.test.yml up -d
cd ..

# Start backend services
echo -e "\nStarting backend services..."

# Start main backend API
cd backend
echo "Starting main API service (port 5112)..."
source ../venv/bin/activate
python main.py > ../test-environment/backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID" > ../test-environment/backend.pid
cd ..

# Start OCR service
echo "Starting OCR service (port 5113)..."
cd backend/services/ocr_field_detection
source ../../../venv/bin/activate
python start_ocr.py > ../../../test-environment/ocr.log 2>&1 &
OCR_PID=$!
echo "OCR PID: $OCR_PID" > ../../../test-environment/ocr.pid
cd ../../..

# Start frontend
echo -e "\nStarting frontend service..."
cd signa-app
npm run dev -- --port 5114 > ../test-environment/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID" > ../test-environment/frontend.pid
cd ..

# Wait for services
echo -e "\nWaiting for services to be ready..."
wait_for_service "http://localhost:5112/health" "Backend API"
wait_for_service "http://localhost:5113/" "OCR Service"
wait_for_service "http://localhost:5114" "Frontend"
wait_for_service "http://localhost:8025" "MailHog"

echo -e "\n✓ All services are running!"
echo -e "\nService URLs:"
echo "  - Backend API: http://localhost:5112"
echo "  - OCR Service: http://localhost:5113"
echo "  - Frontend: http://localhost:5114"
echo "  - MailHog UI: http://localhost:8025"
echo -e "\nLogs are available in test-environment/*.log"
EOF

# Create service shutdown script
echo -e "\n${YELLOW}Creating service shutdown script...${NC}"
cat > test-environment/stop-services.sh <<'EOF'
#!/bin/bash

# Stop Test Services Script

echo "Stopping test environment services..."

# Stop processes
if [ -f test-environment/backend.pid ]; then
    BACKEND_PID=$(cat test-environment/backend.pid)
    echo "Stopping backend (PID: $BACKEND_PID)..."
    kill $BACKEND_PID 2>/dev/null || true
    rm test-environment/backend.pid
fi

if [ -f test-environment/ocr.pid ]; then
    OCR_PID=$(cat test-environment/ocr.pid)
    echo "Stopping OCR service (PID: $OCR_PID)..."
    kill $OCR_PID 2>/dev/null || true
    rm test-environment/ocr.pid
fi

if [ -f test-environment/frontend.pid ]; then
    FRONTEND_PID=$(cat test-environment/frontend.pid)
    echo "Stopping frontend (PID: $FRONTEND_PID)..."
    kill $FRONTEND_PID 2>/dev/null || true
    rm test-environment/frontend.pid
fi

# Stop Docker containers
echo "Stopping Docker containers..."
cd test-environment
docker-compose -f docker-compose.test.yml down
cd ..

echo "✓ All services stopped"
EOF

# Make scripts executable
chmod +x test-environment/start-services.sh
chmod +x test-environment/stop-services.sh

# Create Playwright configuration
echo -e "\n${YELLOW}Creating Playwright configuration...${NC}"
cat > signa-app/playwright.config.test.ts <<'EOF'
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: '../test-results/playwright-report' }],
    ['json', { outputFile: '../test-results/playwright-results.json' }],
    ['junit', { outputFile: '../test-results/junit.xml' }],
  ],
  use: {
    baseURL: 'http://localhost:5114',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  webServer: {
    command: 'npm run dev -- --port 5114',
    port: 5114,
    reuseExistingServer: !process.env.CI,
  },
});
EOF

# Create test runner script
echo -e "\n${YELLOW}Creating test runner script...${NC}"
cat > test-environment/run-tests.sh <<'EOF'
#!/bin/bash

# SignaAI Test Runner

set -e

# Activate virtual environment
source venv/bin/activate

# Parse arguments
TEST_TYPE=${1:-all}

echo "==================================="
echo "SignaAI Test Runner"
echo "==================================="

# Ensure services are running
if ! curl -s http://localhost:5112/health > /dev/null 2>&1; then
    echo "Services not running. Starting services first..."
    ./test-environment/start-services.sh
    sleep 5
fi

# Run tests based on type
case $TEST_TYPE in
    unit)
        echo "Running unit tests..."
        cd backend
        pytest tests/unit/ -v --cov=. --cov-report=html:../test-results/coverage
        cd ../signa-app
        npm test -- --coverage
        ;;
    integration)
        echo "Running integration tests..."
        cd backend
        pytest tests/integration/ -v
        ;;
    e2e)
        echo "Running E2E tests..."
        cd signa-app
        npx playwright test --config=playwright.config.test.ts
        ;;
    security)
        echo "Running security tests..."
        cd backend
        bandit -r . -f json -o ../test-results/bandit-report.json
        cd ../signa-app
        npm audit --json > ../test-results/npm-audit.json || true
        ;;
    performance)
        echo "Running performance tests..."
        cd backend/tests
        locust -f performance/locustfile.py --headless -u 10 -r 2 -t 60s --html ../test-results/locust-report.html
        ;;
    all)
        echo "Running all tests..."
        ./test-environment/run-tests.sh unit
        ./test-environment/run-tests.sh integration
        ./test-environment/run-tests.sh e2e
        ./test-environment/run-tests.sh security
        ;;
    *)
        echo "Usage: $0 [unit|integration|e2e|security|performance|all]"
        exit 1
        ;;
esac

echo -e "\n✓ Tests completed!"
echo "Results available in test-results/"
EOF

chmod +x test-environment/run-tests.sh

# Create test data setup script
echo -e "\n${YELLOW}Creating test data setup script...${NC}"
cat > test-environment/setup-test-data.py <<'EOF'
#!/usr/bin/env python3
"""
Setup test data for SignaAI testing
"""

import os
import sys
import requests
import json
from datetime import datetime

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

API_URL = "http://localhost:5112"

def create_test_users():
    """Create test user accounts"""
    users = [
        {
            "email": "sender@test.com",
            "password": "Test123!",
            "name": "Test Sender"
        },
        {
            "email": "signer1@test.com",
            "password": "Test123!",
            "name": "Test Signer 1"
        },
        {
            "email": "signer2@test.com",
            "password": "Test123!",
            "name": "Test Signer 2"
        }
    ]
    
    created_users = []
    for user in users:
        try:
            response = requests.post(f"{API_URL}/api/v1/auth/register", json=user)
            if response.status_code in [200, 201]:
                result = response.json()
                created_users.append({
                    "email": user["email"],
                    "token": result["access_token"]
                })
                print(f"✓ Created user: {user['email']}")
            else:
                print(f"✗ Failed to create user {user['email']}: {response.text}")
        except Exception as e:
            print(f"✗ Error creating user {user['email']}: {e}")
    
    return created_users

def create_test_documents(token):
    """Create test documents"""
    headers = {"Authorization": f"Bearer {token}"}
    
    documents = [
        {
            "title": "Test Contract",
            "content": "This is a test contract document.",
            "document_type": "contract"
        },
        {
            "title": "Test Agreement",
            "content": "This is a test agreement document.",
            "document_type": "agreement"
        }
    ]
    
    created_docs = []
    for doc in documents:
        try:
            response = requests.post(
                f"{API_URL}/api/v1/documents",
                json=doc,
                headers=headers
            )
            if response.status_code in [200, 201]:
                result = response.json()
                created_docs.append(result["id"])
                print(f"✓ Created document: {doc['title']}")
            else:
                print(f"✗ Failed to create document {doc['title']}: {response.text}")
        except Exception as e:
            print(f"✗ Error creating document {doc['title']}: {e}")
    
    return created_docs

def main():
    """Main setup function"""
    print("Setting up test data...")
    
    # Create test users
    users = create_test_users()
    
    if users:
        # Create documents for the first user
        sender_token = users[0]["token"]
        docs = create_test_documents(sender_token)
        
        # Save test data for use in tests
        test_data = {
            "users": users,
            "documents": docs,
            "created_at": datetime.now().isoformat()
        }
        
        with open("test-environment/test-data.json", "w") as f:
            json.dump(test_data, f, indent=2)
        
        print("\n✓ Test data setup complete!")
        print(f"Created {len(users)} users and {len(docs)} documents")
    else:
        print("\n✗ Failed to create test users")

if __name__ == "__main__":
    main()
EOF

chmod +x test-environment/setup-test-data.py

# Create comprehensive test Makefile
echo -e "\n${YELLOW}Creating test Makefile...${NC}"
cat > Makefile.test <<'EOF'
# SignaAI Test Makefile

.PHONY: help setup start stop test test-unit test-integration test-e2e test-security test-performance clean

help:
	@echo "SignaAI Test Commands:"
	@echo "  make setup         - Set up test environment"
	@echo "  make start         - Start all services"
	@echo "  make stop          - Stop all services"
	@echo "  make test          - Run all tests"
	@echo "  make test-unit     - Run unit tests only"
	@echo "  make test-integration - Run integration tests"
	@echo "  make test-e2e      - Run E2E tests"
	@echo "  make test-security - Run security tests"
	@echo "  make test-performance - Run performance tests"
	@echo "  make clean         - Clean test artifacts"

setup:
	@echo "Setting up test environment..."
	@./test-environment/setup-test-env.sh

start:
	@./test-environment/start-services.sh

stop:
	@./test-environment/stop-services.sh

test:
	@./test-environment/run-tests.sh all

test-unit:
	@./test-environment/run-tests.sh unit

test-integration:
	@./test-environment/run-tests.sh integration

test-e2e:
	@./test-environment/run-tests.sh e2e

test-security:
	@./test-environment/run-tests.sh security

test-performance:
	@./test-environment/run-tests.sh performance

clean:
	@echo "Cleaning test artifacts..."
	@rm -rf test-results/
	@rm -rf test-environment/*.log
	@rm -rf test-environment/*.pid
	@rm -rf backend/.coverage
	@rm -rf backend/htmlcov/
	@rm -rf signa-app/coverage/
	@./test-environment/stop-services.sh || true
EOF

# Add activation reminder to scripts
echo -e "\n${YELLOW}Adding virtual environment activation to scripts...${NC}"
sed -i '' '2i\
source venv/bin/activate' test-environment/setup-test-data.py || true

echo -e "\n${GREEN}✓ Test environment setup complete!${NC}"
echo -e "\nNext steps:"
echo "  1. Run 'make -f Makefile.test start' to start services"
echo "  2. Run 'make -f Makefile.test test' to run all tests"
echo -e "\nFor more options, run 'make -f Makefile.test help'"
