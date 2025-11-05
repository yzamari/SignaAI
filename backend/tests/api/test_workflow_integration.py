"""
API Integration Tests for Workflow Management
"""
import pytest
import requests
import os
from typing import Dict, Any

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:5112/api/v1")


class TestWorkflowAPI:
    """Test workflow API endpoints"""

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

    def test_create_parallel_workflow(self, auth_token):
        """Test creating parallel workflow"""
        if not auth_token:
            pytest.skip("Missing auth token")
        
        url = f"{API_BASE_URL}/workflows/create"
        headers = {"Authorization": f"Bearer {auth_token}"}
        data = {
            "document_id": "test-doc-123",
            "title": "Parallel Workflow Test",
            "signers": [
                {
                    "name": "Signer 1",
                    "email": "signer1@test.com",
                    "phone": "+1111111111"
                },
                {
                    "name": "Signer 2",
                    "email": "signer2@test.com",
                    "phone": "+2222222222"
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
        assert "workflow_id" in result or "id" in result
        assert result.get("status") == "created" or result.get("status") == "pending"

    def test_create_sequential_workflow(self, auth_token):
        """Test creating sequential workflow"""
        if not auth_token:
            pytest.skip("Missing auth token")
        
        url = f"{API_BASE_URL}/workflows/create"
        headers = {"Authorization": f"Bearer {auth_token}"}
        data = {
            "document_id": "test-doc-456",
            "title": "Sequential Workflow Test",
            "signers": [
                {
                    "name": "Signer 1",
                    "email": "signer1@test.com",
                    "phone": "+1111111111"
                },
                {
                    "name": "Signer 2",
                    "email": "signer2@test.com",
                    "phone": "+2222222222"
                }
            ],
            "fields": [],
            "workflow": {
                "type": "sequential"
            }
        }
        
        response = requests.post(url, json=data, headers=headers)
        assert response.status_code == 200
        result = response.json()
        assert "workflow_id" in result or "id" in result

    def test_create_document_with_workflow(self, auth_token):
        """Test creating document with workflow via documents/create endpoint"""
        if not auth_token:
            pytest.skip("Missing auth token")
        
        url = f"{API_BASE_URL}/documents/create"
        headers = {"Authorization": f"Bearer {auth_token}"}
        data = {
            "title": "Document with Workflow",
            "signers": [
                {
                    "name": "Signer 1",
                    "email": "signer1@test.com",
                    "phone": "+1111111111"
                }
            ],
            "fields": [],
            "workflow": {
                "type": "parallel",
                "deadline": "2025-12-31T23:59:59Z"
            }
        }
        
        response = requests.post(url, json=data, headers=headers)
        assert response.status_code == 200
        result = response.json()
        assert "id" in result
        assert "workflow" in result
        assert result["workflow"]["type"] == "parallel"
        assert len(result["signers"]) > 0
        assert "token" in result["signers"][0]

    def test_workflow_signers_receive_tokens(self, auth_token):
        """Test that each signer receives unique token"""
        if not auth_token:
            pytest.skip("Missing auth token")
        
        url = f"{API_BASE_URL}/documents/create"
        headers = {"Authorization": f"Bearer {auth_token}"}
        data = {
            "title": "Multi-Signer Document",
            "signers": [
                {
                    "name": "Signer 1",
                    "email": "signer1@test.com",
                    "phone": "+1111111111"
                },
                {
                    "name": "Signer 2",
                    "email": "signer2@test.com",
                    "phone": "+2222222222"
                },
                {
                    "name": "Signer 3",
                    "email": "signer3@test.com",
                    "phone": "+3333333333"
                }
            ],
            "fields": [],
            "workflow": {"type": "parallel"}
        }
        
        response = requests.post(url, json=data, headers=headers)
        assert response.status_code == 200
        result = response.json()
        
        signers = result["signers"]
        assert len(signers) == 3
        
        # Verify each signer has unique token
        tokens = [signer["token"] for signer in signers]
        assert len(tokens) == len(set(tokens)), "All tokens should be unique"
        
        # Verify tokens are not empty
        for token in tokens:
            assert token and len(token) > 0

    def test_workflow_status_tracking(self, auth_token):
        """Test workflow status updates"""
        if not auth_token:
            pytest.skip("Missing auth token")
        
        # Create document
        create_url = f"{API_BASE_URL}/documents/create"
        headers = {"Authorization": f"Bearer {auth_token}"}
        data = {
            "title": "Status Tracking Test",
            "signers": [
                {
                    "name": "Signer 1",
                    "email": "signer1@test.com",
                    "phone": "+1111111111"
                }
            ],
            "fields": [],
            "workflow": {"type": "parallel"}
        }
        create_response = requests.post(create_url, json=data, headers=headers)
        document_id = create_response.json()["id"]
        
        # Get document status
        get_url = f"{API_BASE_URL}/documents/{document_id}"
        get_response = requests.get(get_url, headers=headers)
        
        assert get_response.status_code == 200
        result = get_response.json()
        assert "status" in result
        assert result["status"] in ["pending", "active", "signed", "completed"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

