#!/usr/bin/env python3
"""
End-to-End Test with SMS to Real Phone Number
Sends SMS notification to: +972523121682
"""

import os
import sys
import time
import json
import requests
from datetime import datetime
from pathlib import Path

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).parent / "backend"))

# Configuration
API_URL = os.getenv("API_URL", "http://localhost:5112")
OCR_URL = os.getenv("OCR_SERVICE_URL", "http://localhost:5113")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5114")
TEST_PDF = "heskem.pdf"

# Real phone number for SMS
RECIPIENT_PHONE = "+972523121682"
RECIPIENT_NAME = "Test User"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def log_step(message, status="INFO"):
    """Log test step with timestamp"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    if status == "PASS":
        print(f"[{timestamp}] {Colors.GREEN}✓{Colors.END} {message}")
    elif status == "FAIL":
        print(f"[{timestamp}] {Colors.RED}✗{Colors.END} {message}")
    elif status == "WARN":
        print(f"[{timestamp}] {Colors.YELLOW}⚠{Colors.END} {message}")
    else:
        print(f"[{timestamp}] {Colors.BLUE}ℹ{Colors.END} {message}")

def check_services():
    """Check if required services are running"""
    log_step("Checking services...")

    services_ok = True

    # Check backend
    try:
        response = requests.get(f"{API_URL}/health", timeout=5)
        if response.status_code == 200:
            log_step(f"Backend API is running on {API_URL}", "PASS")
        else:
            log_step(f"Backend API returned status {response.status_code}", "FAIL")
            services_ok = False
    except Exception as e:
        log_step(f"Backend API is not accessible: {e}", "FAIL")
        services_ok = False

    # Check OCR service
    try:
        response = requests.get(f"{OCR_URL}/", timeout=5)
        if response.status_code == 200:
            log_step(f"OCR service is running on {OCR_URL}", "PASS")
        else:
            log_step(f"OCR service returned status {response.status_code}", "WARN")
    except Exception as e:
        log_step(f"OCR service is not accessible: {e}", "WARN")

    # Check Twilio configuration
    twilio_sid = os.getenv("TWILIO_ACCOUNT_SID")
    twilio_token = os.getenv("TWILIO_AUTH_TOKEN")
    twilio_phone = os.getenv("TWILIO_PHONE_NUMBER")

    if twilio_sid and twilio_token and twilio_phone:
        log_step(f"Twilio configured (will send real SMS)", "PASS")
        log_step(f"  From number: {twilio_phone}", "INFO")
    else:
        log_step(f"Twilio NOT configured (will mock SMS)", "WARN")
        log_step(f"  To enable: Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER", "INFO")

    return services_ok

def get_auth_token():
    """Login and get authentication token"""
    log_step("Authenticating...")

    # Try demo user first
    login_data = {
        "username": "demo@signaai.com",
        "password": "Demo123!"
    }

    try:
        response = requests.post(f"{API_URL}/api/v1/auth/login", data=login_data)
        if response.status_code == 200:
            token = response.json().get("access_token")
            log_step("Logged in as demo@signaai.com", "PASS")
            return token
        else:
            log_step(f"Login failed: {response.status_code}", "FAIL")
            return None
    except Exception as e:
        log_step(f"Authentication error: {e}", "FAIL")
        return None

def upload_and_process_document(auth_token):
    """Upload PDF and process with OCR"""
    log_step("Uploading and processing document...")

    if not os.path.exists(TEST_PDF):
        log_step(f"Test PDF '{TEST_PDF}' not found", "FAIL")
        return None

    headers = {"Authorization": f"Bearer {auth_token}"} if auth_token else {}

    try:
        with open(TEST_PDF, 'rb') as f:
            files = {'file': (TEST_PDF, f, 'application/pdf')}

            response = requests.post(
                f"{API_URL}/api/v1/documents/upload-and-process",
                files=files,
                headers=headers,
                timeout=60
            )

            if response.status_code == 200:
                result = response.json()
                log_step(f"Document processed successfully", "PASS")
                log_step(f"  Document ID: {result.get('document_id')}", "INFO")
                log_step(f"  Workflow ID: {result.get('workflow_id')}", "INFO")
                log_step(f"  Total pages: {result.get('total_pages')}", "INFO")
                log_step(f"  Total fields: {result.get('total_fields')}", "INFO")
                log_step(f"  OCR fields: {result.get('ocr_fields_count')}", "INFO")
                log_step(f"  Processing time: {result.get('processing_time_seconds'):.2f}s", "INFO")

                return result
            else:
                log_step(f"Document processing failed: {response.status_code}", "FAIL")
                log_step(f"Response: {response.text}", "FAIL")
                return None
    except Exception as e:
        log_step(f"Error processing document: {e}", "FAIL")
        return None

def send_document_for_signature(document_data, auth_token):
    """Create workflow and send document for signature with SMS"""
    log_step(f"Sending document for signature to {RECIPIENT_PHONE}...")

    if not document_data:
        log_step("No document data available", "FAIL")
        return False

    headers = {"Authorization": f"Bearer {auth_token}"} if auth_token else {}

    # Create document with signer
    workflow_data = {
        "title": f"Test Document - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "file_path": document_data.get("document_id", ""),
        "signers": [
            {
                "name": RECIPIENT_NAME,
                "email": "test@example.com",
                "phone": RECIPIENT_PHONE,  # REAL PHONE NUMBER
                "language": "he"  # Hebrew for Israeli number
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
            f"{API_URL}/api/v1/documents/create",
            json=workflow_data,
            headers=headers,
            timeout=30
        )

        if response.status_code in [200, 201]:
            result = response.json()
            log_step("Document created and sent successfully", "PASS")
            log_step(f"  Document ID: {result.get('id')}", "INFO")
            log_step(f"  SMS sent: {result.get('sms_sent', 0)} notification(s)", "PASS")
            log_step(f"  Message: {result.get('message')}", "INFO")

            # Show what SMS was sent
            log_step("SMS Details:", "INFO")
            log_step(f"  To: {RECIPIENT_PHONE}", "INFO")
            log_step(f"  Recipient: {RECIPIENT_NAME}", "INFO")
            log_step(f"  Language: Hebrew", "INFO")

            return True
        else:
            log_step(f"Document creation failed: {response.status_code}", "FAIL")
            log_step(f"Response: {response.text}", "FAIL")
            return False
    except Exception as e:
        log_step(f"Error sending document: {e}", "FAIL")
        return False

def main():
    """Run the E2E test with SMS"""
    print("=" * 70)
    print(f"{Colors.BLUE}SignaAI - E2E Test with SMS Notification{Colors.END}")
    print("=" * 70)
    print(f"API URL: {API_URL}")
    print(f"OCR URL: {OCR_URL}")
    print(f"Frontend URL: {FRONTEND_URL}")
    print(f"Recipient: {RECIPIENT_NAME} ({RECIPIENT_PHONE})")
    print("=" * 70 + "\n")

    # Step 1: Check services
    if not check_services():
        log_step("Service check failed - some services may be unavailable", "WARN")
        log_step("Continuing anyway...", "INFO")

    print()

    # Step 2: Authenticate
    auth_token = get_auth_token()
    if not auth_token:
        log_step("Continuing without authentication (may fail)...", "WARN")

    print()

    # Step 3: Upload and process document
    document_data = upload_and_process_document(auth_token)
    if not document_data:
        log_step("Document processing failed - cannot continue", "FAIL")
        sys.exit(1)

    print()

    # Step 4: Send for signature (this will trigger SMS)
    if send_document_for_signature(document_data, auth_token):
        print()
        print("=" * 70)
        log_step("E2E Test completed successfully!", "PASS")
        print("=" * 70)
        print()
        print(f"{Colors.GREEN}✅ SMS notification should be sent to {RECIPIENT_PHONE}{Colors.END}")
        print()
        print("Check your phone for the message!")
        print()
        sys.exit(0)
    else:
        print()
        print("=" * 70)
        log_step("E2E Test failed", "FAIL")
        print("=" * 70)
        sys.exit(1)

if __name__ == "__main__":
    main()
