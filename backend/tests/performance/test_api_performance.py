"""
API Performance Tests
"""
import pytest
import requests
import os
import time
from typing import Dict, Any

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:5112/api/v1")
OCR_SERVICE_URL = os.getenv("OCR_SERVICE_URL", "http://localhost:5113")


class TestAPIPerformance:
    """Test API performance metrics"""

    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        url = f"{API_BASE_URL}/auth/login"
        data = {
            "username": "demo@signaai.com",
            "password": "Demo123!"
        }
        response = requests.post(
            url,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        if response.status_code == 200:
            return response.json().get("access_token") or response.json().get("token")
        return None

    def test_login_response_time(self):
        """Test login API response time"""
        url = f"{API_BASE_URL}/auth/login"
        data = {
            "username": "demo@signaai.com",
            "password": "Demo123!"
        }
        
        start_time = time.time()
        response = requests.post(
            url,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        response_time = (time.time() - start_time) * 1000  # Convert to milliseconds
        
        assert response.status_code == 200
        # Login should complete in less than 500ms
        assert response_time < 500, f"Login took {response_time}ms, expected < 500ms"

    def test_document_list_response_time(self, auth_token):
        """Test document list API response time"""
        if not auth_token:
            pytest.skip("Missing auth token")
        
        url = f"{API_BASE_URL}/documents"
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        start_time = time.time()
        response = requests.get(url, headers=headers)
        response_time = (time.time() - start_time) * 1000
        
        assert response.status_code == 200
        # Document list should load in less than 500ms
        assert response_time < 500, f"Document list took {response_time}ms, expected < 500ms"

    def test_document_creation_response_time(self, auth_token):
        """Test document creation API response time"""
        if not auth_token:
            pytest.skip("Missing auth token")
        
        url = f"{API_BASE_URL}/documents/create"
        headers = {"Authorization": f"Bearer {auth_token}"}
        data = {
            "title": "Performance Test Document",
            "signers": [
                {
                    "name": "Test Signer",
                    "email": "signer@test.com",
                    "phone": "+1234567890"
                }
            ],
            "fields": [],
            "workflow": {"type": "parallel"}
        }
        
        start_time = time.time()
        response = requests.post(url, json=data, headers=headers)
        response_time = (time.time() - start_time) * 1000
        
        assert response.status_code == 200
        # Document creation should complete in less than 1000ms
        assert response_time < 1000, f"Document creation took {response_time}ms, expected < 1000ms"

    def test_ocr_processing_time(self, auth_token):
        """Test OCR processing time"""
        if not auth_token:
            pytest.skip("Missing auth token")
        
        # Try multiple potential locations for the test PDF
        possible_paths = [
            os.path.join(os.path.dirname(__file__), "..", "..", "..", "heskem.pdf"),
            "/app/heskem.pdf",
            os.path.join("/app", "test_extraction.pdf"),
        ]
        
        pdf_path = None
        for path in possible_paths:
            if os.path.exists(path):
                pdf_path = path
                break
        
        if not pdf_path:
            pytest.skip("Test PDF not available")
        
        url = f"{API_BASE_URL}/documents/process"
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        start_time = time.time()
        with open(pdf_path, "rb") as f:
            files = {"file": ("heskem.pdf", f, "application/pdf")}
            response = requests.post(url, files=files, headers=headers, timeout=60)
        processing_time = (time.time() - start_time) * 1000
        
        assert response.status_code == 200
        # OCR processing should complete in less than 30 seconds
        assert processing_time < 30000, f"OCR processing took {processing_time}ms, expected < 30000ms"

    def test_concurrent_document_creation(self, auth_token):
        """Test concurrent document creation performance"""
        if not auth_token:
            pytest.skip("Missing auth token")
        
        import concurrent.futures
        
        url = f"{API_BASE_URL}/documents/create"
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        def create_document(i):
            data = {
                "title": f"Concurrent Test Document {i}",
                "signers": [
                    {
                        "name": f"Signer {i}",
                        "email": f"signer{i}@test.com",
                        "phone": f"+123456789{i}"
                    }
                ],
                "fields": [],
                "workflow": {"type": "parallel"}
            }
            return requests.post(url, json=data, headers=headers)
        
        start_time = time.time()
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(create_document, i) for i in range(10)]
            results = [future.result() for future in concurrent.futures.as_completed(futures)]
        total_time = (time.time() - start_time) * 1000
        
        # All requests should succeed
        assert all(r.status_code == 200 for r in results)
        # 10 concurrent requests should complete in less than 5 seconds
        assert total_time < 5000, f"10 concurrent requests took {total_time}ms, expected < 5000ms"

    def test_api_endpoint_response_times(self, auth_token):
        """Test various API endpoint response times"""
        if not auth_token:
            pytest.skip("Missing auth token")
        
        endpoints = [
            (f"{API_BASE_URL}/users/me", "GET", None),
            (f"{API_BASE_URL}/users/preferences", "GET", None),
            (f"{API_BASE_URL}/dashboard/stats", "GET", None),
        ]
        
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        for url, method, data in endpoints:
            start_time = time.time()
            if method == "GET":
                response = requests.get(url, headers=headers)
            elif method == "POST":
                response = requests.post(url, json=data, headers=headers)
            response_time = (time.time() - start_time) * 1000
            
            assert response.status_code == 200
            # All endpoints should respond in less than 500ms
            assert response_time < 500, f"{url} took {response_time}ms, expected < 500ms"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

