#!/usr/bin/env python3
"""
Comprehensive OCR Test with Image Export
Generates folders with original and overlayed images for all pages
"""

import requests
import json
import base64
import os
from datetime import datetime
from pathlib import Path

class OCRComprehensiveTest:
    def __init__(self):
        self.service_url = "http://localhost:8002"
        self.pdf_file = "heskem.pdf"
        self.timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.test_folder = f"ocr_test_results_{self.timestamp}"
        self.original_folder = os.path.join(self.test_folder, "original_pages")
        self.overlay_folder = os.path.join(self.test_folder, "overlayed_pages")

    def setup_folders(self):
        """Create output folders"""
        os.makedirs(self.original_folder, exist_ok=True)
        os.makedirs(self.overlay_folder, exist_ok=True)
        print(f"✅ Created test folder: {self.test_folder}")
        print(f"   - Original images: {self.original_folder}")
        print(f"   - Overlayed images: {self.overlay_folder}")

    def check_service(self):
        """Verify OCR service is running"""
        try:
            response = requests.get(f"{self.service_url}/health")
            if response.status_code == 200:
                data = response.json()
                print(f"✅ OCR Service Status:")
                print(f"   - Service: {data['service']}")
                print(f"   - Status: {data['status']}")
                print(f"   - Method: {data['method']}")
                return True
        except Exception as e:
            print(f"❌ Service check failed: {e}")
            return False
        return False

    def run_ocr_detection(self):
        """Run OCR field detection on heskem.pdf"""
        print(f"\n📄 Processing {self.pdf_file}...")

        # Load PDF
        try:
            with open(self.pdf_file, 'rb') as f:
                pdf_content = f.read()
            print(f"   ✅ Loaded PDF: {len(pdf_content):,} bytes")
        except FileNotFoundError:
            print(f"   ❌ File not found: {self.pdf_file}")
            return None

        # Send to OCR service
        print("   🔍 Running OCR field detection...")
        files = {'file': (self.pdf_file, pdf_content, 'application/pdf')}

        try:
            response = requests.post(
                f"{self.service_url}/detect-fields",
                files=files,
                timeout=60
            )

            if response.status_code == 200:
                result = response.json()
                print(f"   ✅ Detection complete!")
                print(f"      - Total pages: {result.get('total_pages', 0)}")
                print(f"      - Total fields: {result.get('total_fields', 0)}")
                print(f"      - Processing time: {result.get('processing_time_ms', 0):.0f}ms")
                return result
            else:
                print(f"   ❌ OCR failed: {response.status_code}")
                return None

        except Exception as e:
            print(f"   ❌ Request failed: {e}")
            return None

    def save_images(self, result):
        """Extract and save both original and overlayed images"""
        print("\n🖼️  Extracting images from OCR results...")

        if not result or "analysis_results" not in result:
            print("   ❌ No analysis results found")
            return

        total_originals = 0
        total_overlays = 0

        for page_data in result["analysis_results"]:
            page_num = page_data.get("page", 0)

            # Save original image
            if "original_image" in page_data:
                img_data = page_data["original_image"]

                # Remove data URL prefix
                if img_data.startswith("data:image/png;base64,"):
                    img_data = img_data[22:]
                elif img_data.startswith("data:image/jpeg;base64,"):
                    img_data = img_data[23:]

                # Decode and save
                try:
                    img_bytes = base64.b64decode(img_data)
                    output_path = os.path.join(self.original_folder, f"page_{page_num:02d}_original.png")

                    with open(output_path, 'wb') as f:
                        f.write(img_bytes)

                    print(f"   ✅ Saved original page {page_num}: {os.path.basename(output_path)}")
                    total_originals += 1
                except Exception as e:
                    print(f"   ❌ Failed to save original page {page_num}: {e}")

            # Save overlayed image
            if "overlayed_image" in page_data:
                img_data = page_data["overlayed_image"]

                # Remove data URL prefix
                if img_data.startswith("data:image/png;base64,"):
                    img_data = img_data[22:]
                elif img_data.startswith("data:image/jpeg;base64,"):
                    img_data = img_data[23:]

                # Decode and save
                try:
                    img_bytes = base64.b64decode(img_data)
                    output_path = os.path.join(self.overlay_folder, f"page_{page_num:02d}_overlay.png")

                    with open(output_path, 'wb') as f:
                        f.write(img_bytes)

                    fields_count = len(page_data.get("fields", []))
                    print(f"   ✅ Saved overlay page {page_num}: {os.path.basename(output_path)} ({fields_count} fields)")
                    total_overlays += 1
                except Exception as e:
                    print(f"   ❌ Failed to save overlay page {page_num}: {e}")

        print(f"\n📊 Image Export Summary:")
        print(f"   - Original pages saved: {total_originals}")
        print(f"   - Overlayed pages saved: {total_overlays}")

    def save_json_results(self, result):
        """Save complete JSON results"""
        json_path = os.path.join(self.test_folder, "ocr_full_results.json")

        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)

        print(f"\n📋 Saved full JSON results: {json_path}")

        # Also save a summary
        summary = {
            "timestamp": self.timestamp,
            "document": self.pdf_file,
            "total_pages": result.get("total_pages", 0),
            "total_fields": result.get("total_fields", 0),
            "processing_time_ms": result.get("processing_time_ms", 0),
            "method": result.get("method", ""),
            "fields_by_page": {}
        }

        # Count fields per page
        for page_data in result.get("analysis_results", []):
            page_num = page_data.get("page", 0)
            summary["fields_by_page"][f"page_{page_num}"] = len(page_data.get("fields", []))

        summary_path = os.path.join(self.test_folder, "summary.json")
        with open(summary_path, 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)

        print(f"   Saved summary: {summary_path}")

    def generate_html_viewer(self, result):
        """Generate HTML viewer for easy visualization"""
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <title>OCR Test Results - {self.timestamp}</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }}
        h1 {{ color: #333; }}
        .container {{ max-width: 1200px; margin: 0 auto; }}
        .summary {{ background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }}
        .page-section {{ background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }}
        .images {{ display: flex; gap: 20px; }}
        .image-container {{ flex: 1; }}
        .image-container img {{ width: 100%; border: 1px solid #ddd; }}
        .image-label {{ font-weight: bold; margin-bottom: 10px; }}
        .stats {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }}
        .stat {{ background: #f8f9fa; padding: 10px; border-radius: 4px; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>OCR Field Detection Test Results</h1>

        <div class="summary">
            <h2>Summary</h2>
            <div class="stats">
                <div class="stat">📄 Document: {self.pdf_file}</div>
                <div class="stat">📑 Total Pages: {result.get('total_pages', 0)}</div>
                <div class="stat">🔍 Total Fields: {result.get('total_fields', 0)}</div>
                <div class="stat">⏱️ Processing: {result.get('processing_time_ms', 0):.0f}ms</div>
                <div class="stat">🔧 Method: {result.get('method', 'N/A')}</div>
                <div class="stat">📅 Timestamp: {self.timestamp}</div>
            </div>
        </div>
"""

        # Add each page
        for page_data in result.get("analysis_results", []):
            page_num = page_data.get("page", 0)
            fields_count = len(page_data.get("fields", []))

            html_content += f"""
        <div class="page-section">
            <h2>Page {page_num} - {fields_count} fields detected</h2>
            <div class="images">
                <div class="image-container">
                    <div class="image-label">Original Page</div>
                    <img src="original_pages/page_{page_num:02d}_original.png" alt="Original page {page_num}">
                </div>
                <div class="image-container">
                    <div class="image-label">Fields Overlay (Blue rectangles)</div>
                    <img src="overlayed_pages/page_{page_num:02d}_overlay.png" alt="Overlay page {page_num}">
                </div>
            </div>
        </div>
"""

        html_content += """
    </div>
</body>
</html>
"""

        html_path = os.path.join(self.test_folder, "viewer.html")
        with open(html_path, 'w') as f:
            f.write(html_content)

        print(f"\n🌐 Generated HTML viewer: {html_path}")
        print(f"   Open this file in a browser to view all pages side by side")

    def run(self):
        """Execute the comprehensive OCR test"""
        print("\n" + "="*60)
        print("COMPREHENSIVE OCR TEST WITH IMAGE EXPORT")
        print("="*60)

        # Setup
        self.setup_folders()

        # Check service
        if not self.check_service():
            print("❌ OCR service is not running. Please start it first.")
            return False

        # Run OCR
        result = self.run_ocr_detection()
        if not result:
            print("❌ OCR detection failed")
            return False

        # Save everything
        self.save_images(result)
        self.save_json_results(result)
        self.generate_html_viewer(result)

        # Final summary
        print("\n" + "="*60)
        print("✅ TEST COMPLETED SUCCESSFULLY")
        print("="*60)
        print(f"📁 All results saved in: {self.test_folder}/")
        print(f"   - Original images: {self.original_folder}/")
        print(f"   - Overlayed images: {self.overlay_folder}/")
        print(f"   - Full JSON results: {self.test_folder}/ocr_full_results.json")
        print(f"   - Summary: {self.test_folder}/summary.json")
        print(f"   - HTML Viewer: {self.test_folder}/viewer.html")
        print("\n📌 Open viewer.html in a browser to see all pages side by side")

        return True

if __name__ == "__main__":
    test = OCRComprehensiveTest()
    success = test.run()
    exit(0 if success else 1)