"""
API Integration Tests for Document Processing
"""
import pytest
import requests
import os
from typing import Dict, Any
import tempfile

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:5112/api/v1")
OCR_SERVICE_URL = os.getenv("OCR_SERVICE_URL", "http://localhost:5113")


class TestDocumentAPI:
    """Test document API endpoints"""

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

    @pytest.fixture
    def test_pdf_path(self):
        """Get path to test PDF"""
        # Try multiple potential locations for the test PDF
        possible_paths = [
            os.path.join(os.path.dirname(__file__), "..", "..", "..", "heskem.pdf"),  # Original relative path
            "/app/heskem.pdf",  # Docker container path
            "heskem.pdf",  # Current directory
            os.path.join("/app", "test_extraction.pdf"),  # Alternative test PDF
        ]
        
        for pdf_path in possible_paths:
            if os.path.exists(pdf_path):
                return pdf_path
        return None

    def test_process_document_with_ocr(self, auth_token, test_pdf_path):
        """Test document upload and OCR processing"""
        if not auth_token or not test_pdf_path:
            pytest.skip("Missing auth token or test PDF")
        
        url = f"{API_BASE_URL}/documents/process"
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        with open(test_pdf_path, "rb") as f:
            files = {"file": ("heskem.pdf", f, "application/pdf")}
            response = requests.post(url, files=files, headers=headers)
        
        assert response.status_code == 200
        result = response.json()
        assert "document_id" in result or "id" in result
        assert "pages" in result or "analysis_results" in result
        assert "fields" in result or "total_fields" in result

    def test_get_documents_list(self, auth_token):
        """Test getting list of documents"""
        if not auth_token:
            pytest.skip("Missing auth token")
        
        url = f"{API_BASE_URL}/documents"
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(url, headers=headers)
        
        assert response.status_code == 200
        result = response.json()
        assert isinstance(result, list)

    def test_create_document_workflow(self, auth_token):
        """Test creating document with workflow"""
        if not auth_token:
            pytest.skip("Missing auth token")
        
        url = f"{API_BASE_URL}/documents/create"
        headers = {"Authorization": f"Bearer {auth_token}"}
        data = {
            "title": "Test Document",
            "signers": [
                {
                    "name": "Test Signer",
                    "email": "signer@test.com",
                    "phone": "+1234567890"
                }
            ],
            "fields": [],
            "workflow": {
                "type": "parallel"
            }
        }
        
        response = requests.post(url, json=data, headers=headers)
        assert response.status_code == 200
        result = response.json()
        assert "id" in result
        assert "signers" in result
        assert len(result["signers"]) > 0
        assert "token" in result["signers"][0]

    def test_get_document_by_id(self, auth_token):
        """Test getting document by ID"""
        if not auth_token:
            pytest.skip("Missing auth token")
        
        # First create a document
        create_url = f"{API_BASE_URL}/documents/create"
        headers = {"Authorization": f"Bearer {auth_token}"}
        data = {
            "title": "Test Document for Get",
            "signers": [],
            "fields": [],
            "workflow": {"type": "parallel"}
        }
        create_response = requests.post(create_url, json=data, headers=headers)
        document_id = create_response.json()["id"]
        
        # Get document
        get_url = f"{API_BASE_URL}/documents/{document_id}"
        response = requests.get(get_url, headers=headers)
        
        assert response.status_code == 200
        result = response.json()
        assert result["id"] == document_id
        assert result["title"] == "Test Document for Get"

    def test_get_document_for_signing_by_token(self, auth_token):
        """Test getting document for signing via token"""
        if not auth_token:
            pytest.skip("Missing auth token")
        
        # Create document with signer
        create_url = f"{API_BASE_URL}/documents/create"
        headers = {"Authorization": f"Bearer {auth_token}"}
        data = {
            "title": "Test Document for Signing",
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
        create_response = requests.post(create_url, json=data, headers=headers)
        signing_token = create_response.json()["signers"][0]["token"]
        
        # Get document via signing token (public endpoint, no auth)
        signing_url = f"{API_BASE_URL}/signing/documents/{signing_token}"
        response = requests.get(signing_url)
        
        assert response.status_code == 200
        result = response.json()
        assert "id" in result
        assert "title" in result
        assert "token" in result

    def test_submit_signature(self, auth_token):
        """Test submitting signature"""
        if not auth_token:
            pytest.skip("Missing auth token")
        
        # Create document with signer
        create_url = f"{API_BASE_URL}/documents/create"
        headers = {"Authorization": f"Bearer {auth_token}"}
        data = {
            "title": "Test Document for Signature",
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
        create_response = requests.post(create_url, json=data, headers=headers)
        document_id = create_response.json()["id"]
        
        # Submit signature (public endpoint)
        submit_url = f"{API_BASE_URL}/signing/documents/{document_id}/submit"
        signature_data = {
            "signature_data": {
                "signature": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                "timestamp": "2024-01-01T00:00:00Z"
            }
        }
        response = requests.post(submit_url, json=signature_data)
        
        assert response.status_code == 200
        result = response.json()
        assert "message" in result
        assert "success" in result["message"].lower() or "signed" in result["message"].lower()

    def test_ocr_service_health(self):
        """Test OCR service health check"""
        url = f"{OCR_SERVICE_URL}/health"
        try:
            response = requests.get(url, timeout=5)
            assert response.status_code == 200
        except requests.exceptions.RequestException:
            pytest.skip("OCR service not available")

    def test_ocr_field_detection(self, test_pdf_path):
        """Test OCR field detection endpoint"""
        if not test_pdf_path:
            pytest.skip("Test PDF not available")
        
        url = f"{OCR_SERVICE_URL}/detect-fields"
        
        try:
            with open(test_pdf_path, "rb") as f:
                files = {"file": ("heskem.pdf", f, "application/pdf")}
                response = requests.post(url, files=files, timeout=60)
            
            assert response.status_code == 200
            result = response.json()
            assert "analysis_results" in result or "pages" in result
            assert "total_fields" in result or "total_pages" in result
        except requests.exceptions.RequestException:
            pytest.skip("OCR service not available")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

