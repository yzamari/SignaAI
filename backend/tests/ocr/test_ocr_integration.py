"""
OCR Service Integration Tests
"""
import pytest
import requests
import os
from typing import Dict, Any

OCR_SERVICE_URL = os.getenv("OCR_SERVICE_URL", "http://localhost:5113")


class TestOCRIntegration:
    """Test OCR service integration"""

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

    def test_ocr_service_health(self):
        """Test OCR service health endpoint"""
        url = f"{OCR_SERVICE_URL}/health"
        try:
            response = requests.get(url, timeout=5)
            assert response.status_code == 200
            result = response.json()
            assert "status" in result or "health" in result
        except requests.exceptions.RequestException:
            pytest.skip("OCR service not available")

    def test_detect_fields_endpoint(self, test_pdf_path):
        """Test field detection endpoint"""
        if not test_pdf_path:
            pytest.skip("Test PDF not available")
        
        url = f"{OCR_SERVICE_URL}/detect-fields"
        
        try:
            with open(test_pdf_path, "rb") as f:
                files = {"file": ("heskem.pdf", f, "application/pdf")}
                response = requests.post(url, files=files, timeout=60)
            
            assert response.status_code == 200
            result = response.json()
            
            # Verify response structure
            assert "analysis_results" in result or "pages" in result
            assert "total_pages" in result
            assert "total_fields" in result
            assert "processing_time_ms" in result
            
            # Verify fields are detected
            if "analysis_results" in result:
                for page_result in result["analysis_results"]:
                    assert "page" in page_result
                    assert "fields" in page_result
                    if len(page_result["fields"]) > 0:
                        field = page_result["fields"][0]
                        assert "type" in field
                        assert "bounding_box" in field
                        assert "confidence" in field
        except requests.exceptions.RequestException as e:
            pytest.skip(f"OCR service not available: {e}")

    def test_ocr_processing_time(self, test_pdf_path):
        """Test OCR processing time is reasonable"""
        if not test_pdf_path:
            pytest.skip("Test PDF not available")
        
        url = f"{OCR_SERVICE_URL}/detect-fields"
        
        try:
            with open(test_pdf_path, "rb") as f:
                files = {"file": ("heskem.pdf", f, "application/pdf")}
                response = requests.post(url, files=files, timeout=60)
            
            assert response.status_code == 200
            result = response.json()
            
            # Processing time should be less than 60 seconds
            processing_time = result.get("processing_time_ms", 0) / 1000
            assert processing_time < 60, f"OCR processing took {processing_time}s, expected < 60s"
        except requests.exceptions.RequestException:
            pytest.skip("OCR service not available")

    def test_ocr_field_types(self, test_pdf_path):
        """Test that OCR detects different field types"""
        if not test_pdf_path:
            pytest.skip("Test PDF not available")
        
        url = f"{OCR_SERVICE_URL}/detect-fields"
        
        try:
            with open(test_pdf_path, "rb") as f:
                files = {"file": ("heskem.pdf", f, "application/pdf")}
                response = requests.post(url, files=files, timeout=60)
            
            assert response.status_code == 200
            result = response.json()
            
            # Collect field types
            field_types = set()
            if "analysis_results" in result:
                for page_result in result["analysis_results"]:
                    for field in page_result.get("fields", []):
                        field_types.add(field.get("type", ""))
            
            # Should detect at least one field type
            assert len(field_types) > 0, "No field types detected"
        except requests.exceptions.RequestException:
            pytest.skip("OCR service not available")

    def test_ocr_bounding_boxes(self, test_pdf_path):
        """Test that bounding boxes are correctly formatted"""
        if not test_pdf_path:
            pytest.skip("Test PDF not available")
        
        url = f"{OCR_SERVICE_URL}/detect-fields"
        
        try:
            with open(test_pdf_path, "rb") as f:
                files = {"file": ("heskem.pdf", f, "application/pdf")}
                response = requests.post(url, files=files, timeout=60)
            
            assert response.status_code == 200
            result = response.json()
            
            # Verify bounding box structure
            if "analysis_results" in result:
                for page_result in result["analysis_results"]:
                    for field in page_result.get("fields", []):
                        bbox = field.get("bounding_box", {})
                        assert "x" in bbox
                        assert "y" in bbox
                        assert "width" in bbox
                        assert "height" in bbox
                        
                        # Values should be positive
                        assert bbox["x"] >= 0
                        assert bbox["y"] >= 0
                        assert bbox["width"] > 0
                        assert bbox["height"] > 0
        except requests.exceptions.RequestException:
            pytest.skip("OCR service not available")

    def test_ocr_invalid_file_type(self):
        """Test OCR with invalid file type"""
        url = f"{OCR_SERVICE_URL}/detect-fields"
        
        # Create a fake text file
        fake_file = ("test.txt", "This is not a PDF", "text/plain")
        files = {"file": fake_file}
        
        try:
            response = requests.post(url, files=files, timeout=10)
            # Should return 400 Bad Request
            assert response.status_code == 400
        except requests.exceptions.RequestException:
            pytest.skip("OCR service not available")

    def test_ocr_empty_file(self):
        """Test OCR with empty file"""
        url = f"{OCR_SERVICE_URL}/detect-fields"
        
        empty_file = ("empty.pdf", b"", "application/pdf")
        files = {"file": empty_file}
        
        try:
            response = requests.post(url, files=files, timeout=10)
            # Should return 400 Bad Request
            assert response.status_code == 400
        except requests.exceptions.RequestException:
            pytest.skip("OCR service not available")

    def test_ocr_multi_page_document(self, test_pdf_path):
        """Test OCR with multi-page document"""
        if not test_pdf_path:
            pytest.skip("Test PDF not available")
        
        url = f"{OCR_SERVICE_URL}/detect-fields"
        
        try:
            with open(test_pdf_path, "rb") as f:
                files = {"file": ("heskem.pdf", f, "application/pdf")}
                response = requests.post(url, files=files, timeout=60)
            
            assert response.status_code == 200
            result = response.json()
            
            # Verify page count
            total_pages = result.get("total_pages", 0)
            assert total_pages > 0
            
            # Verify analysis_results has correct number of pages
            if "analysis_results" in result:
                assert len(result["analysis_results"]) == total_pages
        except requests.exceptions.RequestException:
            pytest.skip("OCR service not available")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

