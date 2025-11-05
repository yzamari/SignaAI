#!/bin/bash

# Comprehensive Test Suite Runner for SignaAI
# Usage: ./test-suite-runner.sh [options]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
CATEGORY=""
FULL=false
GCP=false
BROWSER="chromium"
VERBOSE=false
PARALLEL=true

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --category=*)
            CATEGORY="${1#*=}"
            shift
            ;;
        --full)
            FULL=true
            shift
            ;;
        --gcp)
            GCP=true
            shift
            ;;
        --browser=*)
            BROWSER="${1#*=}"
            shift
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --no-parallel)
            PARALLEL=false
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --category=CATEGORY    Run specific test category (sender, signer, workflow, api, etc.)"
            echo "  --full                 Run full test suite"
            echo "  --gcp                  Include GCP integration tests"
            echo "  --browser=BROWSER      Specify browser (chromium, firefox, webkit)"
            echo "  --verbose, -v          Verbose output"
            echo "  --no-parallel          Run tests sequentially"
            echo "  --help, -h             Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Print header
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}SignaAI Test Suite Runner${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

# Check if services are running
check_service() {
    local url=$1
    local name=$2
    
    if curl -s -f "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $name is running"
        return 0
    else
        echo -e "${RED}✗${NC} $name is not running at $url"
        return 1
    fi
}

BACKEND_OK=false
FRONTEND_OK=false
OCR_OK=false

if check_service "http://localhost:5112/health" "Backend API"; then
    BACKEND_OK=true
fi

if check_service "http://localhost:5114" "Frontend"; then
    FRONTEND_OK=true
fi

if check_service "http://localhost:5113/health" "OCR Service"; then
    OCR_OK=true
fi

if [ "$BACKEND_OK" = false ] || [ "$FRONTEND_OK" = false ]; then
    echo -e "${YELLOW}Warning: Some services are not running. Tests may fail.${NC}"
    echo "Start services with: docker-compose -f docker-compose.test.yml up -d"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Set environment variables
export API_BASE_URL=${API_BASE_URL:-"http://localhost:5112/api/v1"}
export OCR_SERVICE_URL=${OCR_SERVICE_URL:-"http://localhost:5113"}
export API_URL=${API_URL:-"http://localhost:5112/api/v1"}

if [ "$GCP" = true ]; then
    export GCP_CREDENTIALS_EMAIL=${GCP_CREDENTIALS_EMAIL:-"admin@al-ai.net"}
    export GCP_CREDENTIALS_PASSWORD=${GCP_CREDENTIALS_PASSWORD:-"NvnnhF123NvnnhF123"}
    echo -e "${GREEN}GCP credentials configured${NC}"
fi

# Create test results directory
mkdir -p test-results
mkdir -p playwright-report

# Run tests based on category
run_e2e_tests() {
    local test_file=$1
    local project_flag=""
    
    if [ "$BROWSER" != "all" ]; then
        project_flag="--project=$BROWSER"
    fi
    
    local parallel_flag=""
    if [ "$PARALLEL" = false ]; then
        parallel_flag="--workers=1"
    fi
    
    cd signa-app
    
    if [ "$VERBOSE" = true ]; then
        npx playwright test "$test_file" $project_flag $parallel_flag
    else
        npx playwright test "$test_file" $project_flag $parallel_flag --reporter=line
    fi
    
    cd ..
}

run_api_tests() {
    local test_path=$1
    
    cd backend
    
    if [ "$VERBOSE" = true ]; then
        python -m pytest "$test_path" -v
    else
        python -m pytest "$test_path" -v --tb=short
    fi
    
    cd ..
}

# Determine which tests to run
if [ "$FULL" = true ]; then
    echo -e "${GREEN}Running full test suite...${NC}"
    echo ""
    
    # E2E Tests
    echo -e "${YELLOW}Running E2E Tests...${NC}"
    run_e2e_tests "e2e/"
    
    # API Tests
    echo -e "${YELLOW}Running API Integration Tests...${NC}"
    run_api_tests "tests/api/"
    
    # OCR Tests
    echo -e "${YELLOW}Running OCR Integration Tests...${NC}"
    run_api_tests "tests/ocr/"
    
    # Notification Tests
    echo -e "${YELLOW}Running Notification Tests...${NC}"
    run_api_tests "tests/notifications/"
    
    # Performance Tests
    echo -e "${YELLOW}Running Performance Tests...${NC}"
    run_api_tests "tests/performance/"
    
    # GCP Tests (if enabled)
    if [ "$GCP" = true ]; then
        echo -e "${YELLOW}Running GCP Integration Tests...${NC}"
        run_api_tests "tests/gcp/"
    fi
    
elif [ -n "$CATEGORY" ]; then
    echo -e "${GREEN}Running tests for category: $CATEGORY${NC}"
    echo ""
    
    case $CATEGORY in
        sender)
            run_e2e_tests "e2e/complete-sender-flow.spec.ts"
            ;;
        signer)
            run_e2e_tests "e2e/complete-signer-flow.spec.ts"
            ;;
        workflow)
            run_e2e_tests "e2e/sequential-workflow.spec.ts"
            run_e2e_tests "e2e/parallel-workflow.spec.ts"
            ;;
        api)
            run_api_tests "tests/api/"
            ;;
        ocr)
            run_api_tests "tests/ocr/"
            ;;
        notifications)
            run_api_tests "tests/notifications/"
            ;;
        multilang)
            run_e2e_tests "e2e/multilang-*.spec.ts"
            ;;
        errors)
            run_e2e_tests "e2e/error-handling.spec.ts"
            run_e2e_tests "e2e/edge-cases.spec.ts"
            ;;
        performance)
            run_e2e_tests "e2e/performance.spec.ts"
            run_api_tests "tests/performance/"
            ;;
        gcp)
            if [ "$GCP" = true ]; then
                run_api_tests "tests/gcp/"
            else
                echo -e "${YELLOW}GCP tests require --gcp flag${NC}"
            fi
            ;;
        *)
            echo -e "${RED}Unknown category: $CATEGORY${NC}"
            echo "Available categories: sender, signer, workflow, api, ocr, notifications, multilang, errors, performance, gcp"
            exit 1
            ;;
    esac
else
    echo -e "${YELLOW}Running default test suite (E2E only)...${NC}"
    echo "Use --full for complete suite or --category=CATEGORY for specific tests"
    echo ""
    run_e2e_tests "e2e/"
fi

# Generate reports
echo ""
echo -e "${GREEN}Generating test reports...${NC}"

if [ -d "signa-app/playwright-report" ]; then
    echo -e "${GREEN}✓${NC} Playwright HTML report: signa-app/playwright-report/index.html"
fi

if [ -f "signa-app/test-results.json" ]; then
    echo -e "${GREEN}✓${NC} Test results JSON: signa-app/test-results.json"
fi

if [ -f "signa-app/test-results.xml" ]; then
    echo -e "${GREEN}✓${NC} JUnit XML: signa-app/test-results.xml"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Test Suite Complete${NC}"
echo -e "${GREEN}========================================${NC}"

