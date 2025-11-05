"""
SMS Notification Integration Tests
"""
import pytest
import requests
import os
import json
from typing import Dict, Any

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:5112/api/v1")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")


class TestSMSIntegration:
    """Test SMS notification integration"""

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

    def test_sms_sent_on_document_creation(self, auth_token):
        """Test that SMS is sent when document is created"""
        if not auth_token:
            pytest.skip("Missing auth token")
        
        if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
            pytest.skip("Twilio credentials not configured")
        
        url = f"{API_BASE_URL}/documents/create"
        headers = {"Authorization": f"Bearer {auth_token}"}
        data = {
            "title": "SMS Test Document",
            "signers": [
                {
                    "name": "Test Signer",
                    "email": "signer@test.com",
                    "phone": "+1234567890"  # Test number
                }
            ],
            "fields": [],
            "workflow": {"type": "parallel"}
        }
        
        response = requests.post(url, json=data, headers=headers)
        assert response.status_code == 200
        result = response.json()
        
        # Verify signer has token (SMS should have been sent)
        assert "signers" in result
        assert len(result["signers"]) > 0
        assert "token" in result["signers"][0]
        
        # In a real test, you would verify SMS was actually sent via Twilio API
        # For now, we verify the document was created with phone number

    def test_sms_contains_signing_link(self, auth_token):
        """Test that SMS contains signing link"""
        if not auth_token:
            pytest.skip("Missing auth token")
        
        if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
            pytest.skip("Twilio credentials not configured")
        
        url = f"{API_BASE_URL}/documents/create"
        headers = {"Authorization": f"Bearer {auth_token}"}
        data = {
            "title": "SMS Link Test",
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
        
        response = requests.post(url, json=data, headers=headers)
        assert response.status_code == 200
        result = response.json()
        
        # Verify signing token exists (would be in SMS link)
        signing_token = result["signers"][0]["token"]
        assert signing_token
        assert len(signing_token) > 0
        
        # Expected link format: {FRONTEND_URL}/sign/{token}
        # In real scenario, verify SMS message contains this link

    def test_multi_language_sms_hebrew(self, auth_token):
        """Test Hebrew SMS message"""
        if not auth_token:
            pytest.skip("Missing auth token")
        
        if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
            pytest.skip("Twilio credentials not configured")
        
        url = f"{API_BASE_URL}/documents/create"
        headers = {"Authorization": f"Bearer {auth_token}"}
        data = {
            "title": "Heskem Document",  # Hebrew document title
            "signers": [
                {
                    "name": "ישראל ישראלי",
                    "email": "israel@test.com",
                    "phone": "+972501234567"
                }
            ],
            "fields": [],
            "workflow": {"type": "parallel"}
        }
        
        response = requests.post(url, json=data, headers=headers)
        assert response.status_code == 200
        result = response.json()
        
        # Verify document language is detected as Hebrew
        assert result.get("language") == "hebrew" or "hebrew" in result.get("title", "").lower()
        
        # In real scenario, verify SMS contains Hebrew text

    def test_multi_language_sms_arabic(self, auth_token):
        """Test Arabic SMS message"""
        if not auth_token:
            pytest.skip("Missing auth token")
        
        if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
            pytest.skip("Twilio credentials not configured")
        
        url = f"{API_BASE_URL}/documents/create"
        headers = {"Authorization": f"Bearer {auth_token}"}
        data = {
            "title": "Arabic Contract",
            "signers": [
                {
                    "name": "أحمد محمد",
                    "email": "ahmed@test.com",
                    "phone": "+201234567890"
                }
            ],
            "fields": [],
            "workflow": {"type": "parallel"}
        }
        
        response = requests.post(url, json=data, headers=headers)
        assert response.status_code == 200
        
        # In real scenario, verify SMS contains Arabic text

    def test_sms_delivery_failure_handling(self, auth_token):
        """Test handling of SMS delivery failures"""
        if not auth_token:
            pytest.skip("Missing auth token")
        
        if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
            pytest.skip("Twilio credentials not configured")
        
        url = f"{API_BASE_URL}/documents/create"
        headers = {"Authorization": f"Bearer {auth_token}"}
        data = {
            "title": "SMS Failure Test",
            "signers": [
                {
                    "name": "Test Signer",
                    "email": "signer@test.com",
                    "phone": "+0000000000"  # Invalid number
                }
            ],
            "fields": [],
            "workflow": {"type": "parallel"}
        }
        
        # Document should still be created even if SMS fails
        response = requests.post(url, json=data, headers=headers)
        assert response.status_code == 200
        result = response.json()
        
        # Document should be created with signer token
        assert "signers" in result
        assert len(result["signers"]) > 0
        assert "token" in result["signers"][0]

    def test_sms_without_phone_number(self, auth_token):
        """Test document creation without phone number (no SMS)"""
        if not auth_token:
            pytest.skip("Missing auth token")
        
        url = f"{API_BASE_URL}/documents/create"
        headers = {"Authorization": f"Bearer {auth_token}"}
        data = {
            "title": "No SMS Test",
            "signers": [
                {
                    "name": "Test Signer",
                    "email": "signer@test.com"
                    # No phone number
                }
            ],
            "fields": [],
            "workflow": {"type": "parallel"}
        }
        
        response = requests.post(url, json=data, headers=headers)
        assert response.status_code == 200
        result = response.json()
        
        # Document should still be created
        assert "id" in result
        assert "signers" in result
        assert len(result["signers"]) > 0
        # Signer should still have token (for email link)
        assert "token" in result["signers"][0]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

