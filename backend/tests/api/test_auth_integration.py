"""
API Integration Tests for Authentication
"""
import pytest
import requests
import os
from typing import Dict, Any

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:5112/api/v1")


class TestAuthAPI:
    """Test authentication API endpoints"""

    @pytest.fixture
    def base_url(self):
        return API_BASE_URL

    def test_register_user_success(self, base_url):
        """Test successful user registration"""
        url = f"{base_url}/auth/register"
        data = {
            "email": f"test_{os.urandom(4).hex()}@test.com",
            "password": "Test123!",
            "name": "Test User",
            "phone": "+1234567890"
        }
        
        response = requests.post(url, json=data)
        assert response.status_code == 200
        result = response.json()
        assert "access_token" in result or "token" in result
        assert "user" in result
        assert result["user"]["email"] == data["email"]

    def test_register_duplicate_email(self, base_url):
        """Test registration with duplicate email"""
        url = f"{base_url}/auth/register"
        email = f"duplicate_{os.urandom(4).hex()}@test.com"
        data = {
            "email": email,
            "password": "Test123!",
            "name": "Test User"
        }
        
        # First registration
        response1 = requests.post(url, json=data)
        assert response1.status_code == 200
        
        # Duplicate registration
        response2 = requests.post(url, json=data)
        assert response2.status_code == 400
        assert "already registered" in response2.json()["detail"].lower()

    def test_login_success(self, base_url):
        """Test successful login"""
        url = f"{base_url}/auth/login"
        data = {
            "username": "demo@signaai.com",
            "password": "Demo123!"
        }
        
        response = requests.post(
            url,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        assert response.status_code == 200
        result = response.json()
        assert "access_token" in result or "token" in result
        assert "user" in result

    def test_login_invalid_credentials(self, base_url):
        """Test login with invalid credentials"""
        url = f"{base_url}/auth/login"
        data = {
            "username": "nonexistent@test.com",
            "password": "WrongPassword123!"
        }
        
        response = requests.post(
            url,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        assert response.status_code == 401
        assert "invalid" in response.json()["detail"].lower() or "credentials" in response.json()["detail"].lower()

    def test_get_current_user(self, base_url):
        """Test getting current user info"""
        # First login
        login_url = f"{base_url}/auth/login"
        login_data = {
            "username": "demo@signaai.com",
            "password": "Demo123!"
        }
        login_response = requests.post(
            login_url,
            data=login_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        token = login_response.json().get("access_token") or login_response.json().get("token")
        
        # Get current user
        me_url = f"{base_url}/auth/me"
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(me_url, headers=headers)
        
        assert response.status_code == 200
        result = response.json()
        assert "email" in result
        assert result["email"] == "demo@signaai.com"

    def test_get_current_user_no_token(self, base_url):
        """Test getting current user without token"""
        url = f"{base_url}/auth/me"
        response = requests.get(url)
        assert response.status_code == 401

    def test_get_user_settings(self, base_url):
        """Test getting user settings"""
        # Login first
        login_url = f"{base_url}/auth/login"
        login_data = {
            "username": "demo@signaai.com",
            "password": "Demo123!"
        }
        login_response = requests.post(
            login_url,
            data=login_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        token = login_response.json().get("access_token") or login_response.json().get("token")
        
        # Get settings
        settings_url = f"{base_url}/users/settings"
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(settings_url, headers=headers)
        
        assert response.status_code == 200
        result = response.json()
        assert "user" in result
        assert "notifications" in result
        assert "preferences" in result

    def test_update_user_settings(self, base_url):
        """Test updating user settings"""
        # Login first
        login_url = f"{base_url}/auth/login"
        login_data = {
            "username": "demo@signaai.com",
            "password": "Demo123!"
        }
        login_response = requests.post(
            login_url,
            data=login_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        token = login_response.json().get("access_token") or login_response.json().get("token")
        
        # Update settings
        settings_url = f"{base_url}/users/settings"
        headers = {"Authorization": f"Bearer {token}"}
        update_data = {
            "notifications": {
                "email": False,
                "sms": True
            },
            "preferences": {
                "language": "he"
            }
        }
        response = requests.put(settings_url, json=update_data, headers=headers)
        
        assert response.status_code == 200
        result = response.json()
        assert "message" in result or "settings" in result


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

