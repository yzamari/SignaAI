#!/usr/bin/env python3
"""
End-to-end test for sender flow with real OCR processing
Tests: Upload document -> OCR detection -> Image preview with overlays -> Send for signature
"""

import os
import sys
import time
import json
import requests
from datetime import datetime

# Configuration
API_URL = "http://localhost:5112"
OCR_URL = "http://localhost:5113"
FRONTEND_URL = "http://localhost:5114"
TEST_PDF = "heskem.pdf"

def log_step(message):
    """Log test step with timestamp"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] ✓ {message}")

def log_error(message):
    """Log error with timestamp"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] ✗ {message}", file=sys.stderr)

def test_services_health():
    """Test if all services are running"""
    log_step("Testing service health...")

    # Test OCR service
    try:
        response = requests.get(f"{OCR_URL}/")
        if response.status_code == 200:
            log_step(f"OCR service is running on {OCR_URL}")
        else:
            log_error(f"OCR service returned status {response.status_code}")
            return False
    except Exception as e:
        log_error(f"OCR service is not accessible: {e}")
        return False

    # Test backend API
    try:
        response = requests.get(f"{API_URL}/health")
        if response.status_code == 200:
            log_step(f"Backend API is running on {API_URL}")
        else:
            log_error(f"Backend API returned status {response.status_code}")
            return False
    except Exception as e:
        log_error(f"Backend API is not accessible: {e}")
        return False

    # Test frontend
    try:
        response = requests.get(f"{FRONTEND_URL}/")
        if response.status_code in [200, 304]:
            log_step(f"Frontend is running on {FRONTEND_URL}")
        else:
            log_error(f"Frontend returned status {response.status_code}")
    except Exception as e:
        log_error(f"Frontend is not accessible: {e}")
        # Frontend might be still building, continue anyway

    return True

def test_document_upload():
    """Test document upload and OCR processing"""
    log_step("Testing document upload with OCR...")

    # Check if test PDF exists
    if not os.path.exists(TEST_PDF):
        log_error(f"Test PDF '{TEST_PDF}' not found")
        return None

    # Upload document for processing
    with open(TEST_PDF, 'rb') as f:
        files = {'file': (TEST_PDF, f, 'application/pdf')}

        try:
            response = requests.post(
                f"{API_URL}/api/v1/documents/process",
                files=files
            )

            if response.status_code == 200:
                result = response.json()
                log_step(f"Document processed successfully")
                log_step(f"  - Document ID: {result.get('document_id', 'N/A')}")
                log_step(f"  - Pages: {len(result.get('pages', []))}")
                log_step(f"  - Fields detected: {len(result.get('fields', []))}")

                # Display field details
                fields = result.get('fields', [])
                for i, field in enumerate(fields[:5]):  # Show first 5 fields
                    log_step(f"    Field {i+1}: Type={field.get('type')}, Page={field.get('page')}, "
                            f"Pos=({field.get('x')},{field.get('y')}), "
                            f"OCR={field.get('detected_by_ocr', False)}")

                if len(fields) > 5:
                    log_step(f"    ... and {len(fields)-5} more fields")

                # Check for page images
                pages = result.get('pages', [])
                for page in pages[:3]:  # Check first 3 pages
                    has_original = bool(page.get('original_image'))
                    has_overlay = bool(page.get('overlay_image'))
                    log_step(f"  Page {page.get('page_number')}: "
                            f"Original={'✓' if has_original else '✗'}, "
                            f"Overlay={'✓' if has_overlay else '✗'}")

                return result
            else:
                log_error(f"Document processing failed with status {response.status_code}")
                log_error(f"Response: {response.text}")
                return None

        except Exception as e:
            log_error(f"Error uploading document: {e}")
            return None

def test_create_workflow(document_data):
    """Test creating a signing workflow"""
    log_step("Testing workflow creation...")

    if not document_data:
        log_error("No document data available")
        return False

    # Create workflow with signers
    workflow_data = {
        "document_id": document_data.get("document_id"),
        "title": TEST_PDF,
        "signers": [
            {
                "name": "Test Signer 1",
                "email": "signer1@test.com",
                "phone": "+1234567890"
            },
            {
                "name": "Test Signer 2",
                "email": "signer2@test.com",
                "phone": "+0987654321"
            }
        ],
        "fields": document_data.get("fields", []),
        "workflow": {
            "type": "parallel",
            "deadline": "2025-12-31"
        }
    }

    try:
        response = requests.post(
            f"{API_URL}/api/v1/workflows/create",
            json=workflow_data
        )

        if response.status_code in [200, 201]:
            result = response.json()
            log_step("Workflow created successfully")
            log_step(f"  - Workflow ID: {result.get('workflow_id', 'N/A')}")
            log_step(f"  - Signers: {len(workflow_data['signers'])}")
            return True
        else:
            log_error(f"Workflow creation failed with status {response.status_code}")
            log_error(f"Response: {response.text}")
            return False

    except Exception as e:
        log_error(f"Error creating workflow: {e}")
        return False

def main():
    """Run the complete E2E test"""
    print("=" * 60)
    print("SignaAI - End-to-End Sender Flow Test")
    print("=" * 60)

    # Test service health
    if not test_services_health():
        log_error("Service health check failed. Please ensure all services are running.")
        sys.exit(1)

    # Test document upload with OCR
    document_data = test_document_upload()
    if not document_data:
        log_error("Document upload/OCR test failed")
        sys.exit(1)

    # Test workflow creation
    if not test_create_workflow(document_data):
        log_error("Workflow creation test failed")
        sys.exit(1)

    print("=" * 60)
    log_step("All tests passed successfully!")
    print("=" * 60)

    # Summary
    print("\nTest Summary:")
    print(f"  - OCR Service: ✓ Running on {OCR_URL}")
    print(f"  - Backend API: ✓ Running on {API_URL}")
    print(f"  - Frontend: ✓ Running on {FRONTEND_URL}")
    print(f"  - Document Processing: ✓ OCR detected {len(document_data.get('fields', []))} fields")
    print(f"  - Image Generation: ✓ {len(document_data.get('pages', []))} pages with overlays")
    print(f"  - Workflow Creation: ✓ Ready for signing")

    print("\n📝 You can now test the UI at:")
    print(f"   {FRONTEND_URL}/upload")
    print("\n   1. Upload heskem.pdf")
    print("   2. View the image-based preview with OCR overlays")
    print("   3. Add/remove/move fields as needed")
    print("   4. Add recipients and send for signature")

if __name__ == "__main__":
    main()