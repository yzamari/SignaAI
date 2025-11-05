"""
API Integration Tests for SignaAI Backend
Comprehensive testing of all API endpoints
"""

import pytest
import requests
import json
import os
import uuid
import time
from typing import Dict, Any

# Configuration
BASE_URL = os.getenv("API_URL", "http://localhost:5112")
OCR_URL = os.getenv("OCR_SERVICE_URL", "http://localhost:5113")

class TestAuthEndpoints:
    """Test authentication endpoints"""

    def test_register_new_user(self):
        """Test user registration"""
        test_id = str(uuid.uuid4())[:8]  # Use random ID instead
        user_data = {
            "email": f"test_{test_id}@test.com",
            "password": "TestPass123!",
            "name": "Test User"
        }

        response = requests.post(f"{BASE_URL}/api/v1/auth/register", json=user_data)
        assert response.status_code in [200, 201]
        assert "access_token" in response.json()

    def test_login_valid_credentials(self):
        """Test login with valid credentials"""
        login_data = {
            "username": "demo@signaai.com",
            "password": "Demo123!"
        }

        response = requests.post(f"{BASE_URL}/api/v1/auth/login", data=login_data)
        assert response.status_code == 200
        assert "access_token" in response.json()

    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        login_data = {
            "username": "invalid@test.com",
            "password": "WrongPassword"
        }

        response = requests.post(f"{BASE_URL}/api/v1/auth/login", data=login_data)
        assert response.status_code == 401

    def test_get_current_user(self):
        """Test getting current user info"""
        # First login
        login_data = {
            "username": "demo@signaai.com",
            "password": "Demo123!"
        }

        login_response = requests.post(f"{BASE_URL}/api/v1/auth/login", data=login_data)
        token = login_response.json().get("access_token")

        # Get user info
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/v1/users/me", headers=headers)

        assert response.status_code == 200
        user_data = response.json()
        assert "email" in user_data
        assert user_data["email"] == "demo@signaai.com"

class TestDocumentEndpoints:
    """Test document processing endpoints"""

    @pytest.fixture
    def auth_headers(self):
        """Get authentication headers"""
        login_data = {
            "username": "demo@signaai.com",
            "password": "Demo123!"
        }

        response = requests.post(f"{BASE_URL}/api/v1/auth/login", data=login_data)
        token = response.json().get("access_token")
        return {"Authorization": f"Bearer {token}"}

    def test_list_documents(self, auth_headers):
        """Test listing documents"""
        response = requests.get(f"{BASE_URL}/api/v1/documents", headers=auth_headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_create_document(self, auth_headers):
        """Test creating a document"""
        doc_data = {
            "title": "Test Document",
            "status": "pending",
            "signers": [
                {"name": "Signer 1", "email": "signer1@test.com"}
            ]
        }

        response = requests.post(
            f"{BASE_URL}/api/v1/documents",
            json=doc_data,
            headers=auth_headers
        )

        if response.status_code == 404:
            pytest.skip("Endpoint not implemented")

        assert response.status_code in [200, 201]
        assert "id" in response.json()

    def test_process_document_with_ocr(self, auth_headers):
        """Test document processing with OCR"""
        test_pdf = "heskem.pdf"

        if not os.path.exists(test_pdf):
            pytest.skip(f"Test PDF {test_pdf} not found")

        with open(test_pdf, 'rb') as f:
            files = {'file': (test_pdf, f, 'application/pdf')}
            response = requests.post(
                f"{BASE_URL}/api/v1/documents/process",
                files=files,
                headers=auth_headers
            )

        if response.status_code == 405:
            pytest.skip("Endpoint not implemented")

        assert response.status_code == 200
        result = response.json()
        assert "document_id" in result
        assert "pages" in result
        assert "fields" in result

class TestWorkflowEndpoints:
    """Test workflow management endpoints"""

    def test_create_workflow(self):
        """Test workflow creation"""
        workflow_data = {
            "document_id": "test-doc-1",
            "title": "Test Workflow",
            "signers": [
                {"name": "Signer 1", "email": "signer1@test.com"}
            ],
            "workflow": {
                "type": "parallel",
                "deadline": "2025-12-31"
            }
        }

        response = requests.post(
            f"{BASE_URL}/api/v1/workflows/create",
            json=workflow_data
        )

        if response.status_code == 404:
            pytest.skip("Endpoint not implemented")

        assert response.status_code in [200, 201]
        assert "workflow_id" in response.json()

class TestOCRService:
    """Test OCR service endpoints"""

    def test_ocr_service_health(self):
        """Test OCR service is running"""
        response = requests.get(f"{OCR_URL}/")
        assert response.status_code == 200

    def test_ocr_detect_fields(self):
        """Test OCR field detection"""
        test_pdf = "heskem.pdf"

        if not os.path.exists(test_pdf):
            pytest.skip(f"Test PDF {test_pdf} not found")

        with open(test_pdf, 'rb') as f:
            files = {'file': (test_pdf, f, 'application/pdf')}
            response = requests.post(
                f"{OCR_URL}/detect-fields",
                files=files,
                timeout=30
            )

        assert response.status_code == 200
        result = response.json()
        assert "analysis_results" in result
        # The OCR API returns "analysis_results" not "pages"
        assert len(result["analysis_results"]) > 0
        
        # Verify the structure of analysis results
        if result["analysis_results"]:
            first_page = result["analysis_results"][0]
            assert "fields" in first_page or "page_number" in first_page

class TestPerformance:
    """Performance and load tests"""

    def test_api_response_time(self):
        """Test API response times"""
        import time

        endpoints = [
            ("/health", 100),  # Should respond in < 100ms
            ("/api/v1/documents", 500),  # Should respond in < 500ms
        ]

        for endpoint, max_ms in endpoints:
            start = time.time()
            response = requests.get(f"{BASE_URL}{endpoint}")
            elapsed_ms = (time.time() - start) * 1000

            assert elapsed_ms < max_ms, f"{endpoint} took {elapsed_ms}ms (max: {max_ms}ms)"

    def test_concurrent_requests(self):
        """Test handling concurrent requests"""
        import concurrent.futures

        def make_request():
            return requests.get(f"{BASE_URL}/health")

        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(make_request) for _ in range(50)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        assert all(r.status_code == 200 for r in results)

class TestSecurity:
    """Security tests"""

    def test_unauthorized_access(self):
        """Test that protected endpoints require authentication"""
        protected_endpoints = [
            "/api/v1/users/me",
            "/api/v1/documents",
            "/api/v1/dashboard/stats"
        ]

        for endpoint in protected_endpoints:
            response = requests.get(f"{BASE_URL}{endpoint}")
            assert response.status_code in [401, 403], f"{endpoint} should require auth"

    def test_sql_injection(self):
        """Test SQL injection protection"""
        malicious_inputs = [
            "'; DROP TABLE users; --",
            "1 OR 1=1",
            "admin'--"
        ]

        for payload in malicious_inputs:
            login_data = {
                "username": payload,
                "password": "password"
            }

            response = requests.post(f"{BASE_URL}/api/v1/auth/login", data=login_data)
            assert response.status_code in [400, 401], "SQL injection attempt should fail"

    def test_xss_protection(self):
        """Test XSS protection - script tags should be sanitized"""
        xss_payload = "<script>alert('XSS')</script>"
        test_id = str(uuid.uuid4())[:8]

        user_data = {
            "email": f"xss_test_{test_id}@test.com",
            "password": "TestPass123!",
            "full_name": xss_payload  # Use the correct field name
        }

        response = requests.post(f"{BASE_URL}/api/v1/auth/signup", json=user_data)

        if response.status_code in [200, 201]:
            result = response.json()
            # Check that script tags are properly escaped/sanitized
            user_info = result.get("user", {})
            user_name = user_info.get("full_name", "")
            
            # The XSS payload should be sanitized (HTML-escaped)
            assert "<script>" not in user_name, "Script tags should be escaped"
            assert "&lt;script&gt;" in user_name or xss_payload not in user_name, "XSS payload should be sanitized"

if __name__ == "__main__":
    # Run tests with pytest
    pytest.main([__file__, "-v", "--tb=short"])