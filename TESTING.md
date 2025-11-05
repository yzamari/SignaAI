# SignaAI Testing Guide

## Overview

This document provides comprehensive information about testing the SignaAI platform, including end-to-end tests, API integration tests, and performance tests.

## Test Structure

### E2E Tests (Browser-based)
Located in `signa-app/e2e/`:
- `complete-sender-flow.spec.ts` - Full sender workflow
- `complete-signer-flow.spec.ts` - Full signer workflow
- `sequential-workflow.spec.ts` - Sequential signing workflow
- `parallel-workflow.spec.ts` - Parallel signing workflow
- `multilang-hebrew.spec.ts` - Hebrew (RTL) language flow
- `multilang-arabic.spec.ts` - Arabic (RTL) language flow
- `multilang-english.spec.ts` - English (LTR) language flow
- `error-handling.spec.ts` - Error scenarios
- `edge-cases.spec.ts` - Edge case handling
- `performance.spec.ts` - Performance benchmarks

### API Integration Tests
Located in `backend/tests/`:
- `api/test_auth_integration.py` - Authentication API tests
- `api/test_document_integration.py` - Document API tests
- `api/test_workflow_integration.py` - Workflow API tests
- `ocr/test_ocr_integration.py` - OCR service integration tests
- `notifications/test_sms_integration.py` - SMS notification tests
- `performance/test_api_performance.py` - API performance tests
- `gcp/test_gcp_integration.py` - GCP integration tests

## Prerequisites

### Services Required
1. **Backend API** - Running on port 5112
2. **Frontend App** - Running on port 5114
3. **OCR Service** - Running on port 5113

### Test Credentials
- Demo user: `demo@signaai.com` / `Demo123!`
- GCP credentials: `admin@al-ai.net` / `NvnnhF123NvnnhF123`

### Test Data
- Sample PDF: `heskem.pdf` (Hebrew document)
- Test fixtures: `test-fixtures/` directory

## Running Tests

### Quick Start

#### 1. Start Services
```bash
# Using Docker Compose
docker-compose -f docker-compose.test.yml up -d

# Or manually
# Terminal 1: Backend
cd backend && python main.py

# Terminal 2: OCR Service
cd backend/services/ocr_field_detection && python start_ocr.py

# Terminal 3: Frontend
cd signa-app && npm run dev
```

#### 2. Run Tests

**Full Test Suite:**
```bash
./test-suite-runner.sh --full
```

**Specific Category:**
```bash
./test-suite-runner.sh --category=sender
./test-suite-runner.sh --category=signer
./test-suite-runner.sh --category=workflow
./test-suite-runner.sh --category=api
./test-suite-runner.sh --category=ocr
./test-suite-runner.sh --category=notifications
./test-suite-runner.sh --category=multilang
./test-suite-runner.sh --category=errors
./test-suite-runner.sh --category=performance
./test-suite-runner.sh --category=gcp --gcp
```

**E2E Tests Only:**
```bash
cd signa-app
npm run test:e2e
```

**E2E Tests with UI:**
```bash
cd signa-app
npm run test:e2e:ui
```

**API Tests Only:**
```bash
cd backend
pytest tests/api/ -v
```

**Performance Tests:**
```bash
cd backend
pytest tests/performance/ -v
```

### Test Runner Options

```bash
./test-suite-runner.sh [options]

Options:
  --category=CATEGORY    Run specific test category
  --full                 Run full test suite
  --gcp                  Include GCP integration tests
  --browser=BROWSER      Specify browser (chromium, firefox, webkit)
  --verbose, -v          Verbose output
  --no-parallel          Run tests sequentially
  --help, -h             Show help message
```

## Test Categories

### Sender Flow Tests
Tests the complete document creation workflow:
- Document upload
- OCR processing
- Field detection and management
- Recipient addition
- Workflow configuration
- Document sending

### Signer Flow Tests
Tests the document signing workflow:
- Token-based access
- Document viewing
- Signature capture
- Signature submission
- Success confirmation

### Workflow Tests
Tests different workflow types:
- Sequential workflow (signing order)
- Parallel workflow (simultaneous signing)
- Multi-signer scenarios
- Workflow status tracking

### API Integration Tests
Tests API endpoints:
- Authentication (login, register, token refresh)
- Document processing (upload, OCR, retrieval)
- Workflow management (create, status, completion)
- OCR service integration

### Notification Tests
Tests notification delivery:
- SMS notifications
- Multi-language SMS (Hebrew, Arabic, English)
- Notification timing
- Delivery status

### Multi-Language Tests
Tests language support:
- Hebrew (RTL) document processing
- Arabic (RTL) document processing
- English (LTR) document processing
- Language detection
- RTL text handling

### Error Handling Tests
Tests error scenarios:
- Invalid PDF upload
- OCR service unavailable
- Network failures
- Token expiration
- Invalid signing tokens
- Permission denied

### Performance Tests
Tests performance metrics:
- API response times
- OCR processing speed
- Browser rendering performance
- Concurrent request handling

### GCP Integration Tests
Tests GCP functionality:
- Storage access
- Cloud Run deployment
- Secret management
- Environment configuration

## Test Reporting

### Playwright Reports
After running E2E tests, view HTML report:
```bash
cd signa-app
npm run test:e2e:report
```

Or open manually:
```bash
open signa-app/playwright-report/index.html
```

### JUnit XML
JUnit XML reports are generated at:
- `signa-app/test-results.xml`

### Test Results JSON
JSON results are available at:
- `signa-app/test-results.json`

## Continuous Integration

### GitHub Actions Example
```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - uses: actions/setup-python@v4
      
      - name: Install dependencies
        run: |
          cd signa-app && npm install
          cd ../backend && pip install -r requirements.txt
      
      - name: Start services
        run: docker-compose -f docker-compose.test.yml up -d
      
      - name: Run tests
        run: ./test-suite-runner.sh --full
      
      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: test-results
          path: |
            signa-app/test-results.xml
            signa-app/playwright-report/
```

## Debugging Tests

### Debug E2E Tests
```bash
cd signa-app
npm run test:e2e:debug
```

### Debug API Tests
```bash
cd backend
pytest tests/api/test_auth_integration.py -v --pdb
```

### View Test Traces
Playwright automatically captures traces on failure. View them:
```bash
cd signa-app
npx playwright show-trace trace.zip
```

## Best Practices

1. **Isolate Tests**: Each test should be independent and not rely on other tests
2. **Clean Up**: Tests should clean up after themselves (delete test documents, etc.)
3. **Use Fixtures**: Leverage test fixtures for common setup/teardown
4. **Mock External Services**: Mock Twilio, GCP, etc. in CI/CD
5. **Parallel Execution**: Run tests in parallel when possible for speed
6. **Regular Maintenance**: Update tests when features change

## Troubleshooting

### Tests Failing

1. **Check Services**: Ensure all services are running
   ```bash
   curl http://localhost:5112/health
   curl http://localhost:5114
   curl http://localhost:5113/health
   ```

2. **Check Logs**: Review service logs for errors
   ```bash
   docker-compose -f docker-compose.test.yml logs
   ```

3. **Check Credentials**: Verify test credentials are correct

4. **Check Test Data**: Ensure test PDFs exist
   ```bash
   ls -la heskem.pdf
   ```

### Performance Issues

1. **Increase Timeouts**: Adjust timeouts in test files if services are slow
2. **Run Sequentially**: Use `--no-parallel` if tests interfere with each other
3. **Check Resources**: Ensure sufficient CPU/memory for services

## Contributing

When adding new tests:
1. Follow existing test structure
2. Use test helpers from `e2e/fixtures/test-helpers.ts`
3. Add appropriate assertions
4. Document test purpose in comments
5. Update this guide if adding new test categories

## Support

For test-related issues:
- Check test logs in `test-results/`
- Review Playwright reports
- Check service health endpoints
- Consult test documentation in code comments

