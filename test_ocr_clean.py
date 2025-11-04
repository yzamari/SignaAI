#!/usr/bin/env python3
"""
Clean OCR Test - Systematic testing of OCR field detection
"""

import requests
import json
import sys

def test_ocr():
    """Test OCR field detection with heskem.pdf"""

    print("\n" + "="*60)
    print("OCR FIELD DETECTION TEST")
    print("="*60)

    # 1. Check service health
    print("\n1. Checking service health...")
    try:
        response = requests.get("http://localhost:8002/health")
        if response.status_code == 200:
            data = response.json()
            print(f"   ✓ Service: {data['service']}")
            print(f"   ✓ Status: {data['status']}")
            print(f"   ✓ Method: {data['method']}")
        else:
            print(f"   ✗ Health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"   ✗ Service not running: {e}")
        return False

    # 2. Load PDF
    print("\n2. Loading heskem.pdf...")
    try:
        with open('heskem.pdf', 'rb') as f:
            pdf_content = f.read()
        print(f"   ✓ File loaded: {len(pdf_content):,} bytes")
    except FileNotFoundError:
        print("   ✗ heskem.pdf not found")
        return False

    # 3. Send to OCR service
    print("\n3. Sending to OCR service...")
    files = {'file': ('heskem.pdf', pdf_content, 'application/pdf')}

    try:
        response = requests.post(
            "http://localhost:8002/detect-fields",
            files=files,
            timeout=30
        )

        if response.status_code != 200:
            print(f"   ✗ OCR failed: {response.status_code}")
            return False

        result = response.json()
        print("   ✓ OCR analysis complete")

    except Exception as e:
        print(f"   ✗ Request failed: {e}")
        return False

    # 4. Analyze results
    print("\n4. Analysis Results:")
    print(f"   • Total pages: {result.get('total_pages', 0)}")
    print(f"   • Total fields detected: {result.get('total_fields', 0)}")
    print(f"   • Processing time: {result.get('processing_time_ms', 0):.0f}ms")
    print(f"   • Detection method: {result.get('method', 'N/A')}")

    # 5. Show fields by page
    print("\n5. Fields by Page:")
    if "analysis_results" in result:
        for page_data in result["analysis_results"]:
            page_num = page_data["page"]
            fields = page_data.get("fields", [])
            if fields:
                print(f"   Page {page_num}: {len(fields)} fields")
                # Show first 3 fields as examples
                for i, field in enumerate(fields[:3], 1):
                    bbox = field.get('bounding_box', {})
                    print(f"      {i}. {field.get('type')} at ({bbox.get('x')},{bbox.get('y')}) size: {bbox.get('width')}x{bbox.get('height')}")
                if len(fields) > 3:
                    print(f"      ... and {len(fields) - 3} more fields")

    # 6. Save results
    print("\n6. Saving results...")
    with open('ocr_test_results.json', 'w') as f:
        json.dump(result, f, indent=2)
    print("   ✓ Results saved to ocr_test_results.json")

    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    print(f"✓ OCR service is working")
    print(f"✓ Detected {result.get('total_fields', 0)} fields")
    print(f"✓ Method: {result.get('method', 'N/A')}")

    # Issue analysis
    print("\n⚠ KNOWN ISSUE:")
    print("The OCR service is detecting horizontal lines as fields.")
    print("It should be detecting actual form fields (text boxes, checkboxes).")
    print("Current implementation converts any horizontal line to a field.")

    return True

if __name__ == "__main__":
    success = test_ocr()
    sys.exit(0 if success else 1)