#!/usr/bin/env python3
"""
Gatekeeper OCR Test
This test MUST pass before any push to production
Ensures OCR field detection service is working correctly
"""

import sys
import subprocess
import time
import json
from pathlib import Path

def run_command(cmd):
    """Run a shell command and return success status"""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
        return result.returncode == 0, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return False, "", "Command timed out"

def main():
    """Run gatekeeper test for OCR service"""
    print("\n" + "="*60)
    print("🔒 GATEKEEPER OCR TEST - MUST PASS BEFORE PUSH")
    print("="*60)

    test_passed = True

    # 1. Check if test PDF exists
    print("\n1️⃣ Checking test PDF...")
    if not Path("heskem.pdf").exists():
        print("   ❌ heskem.pdf not found!")
        test_passed = False
    else:
        print("   ✅ heskem.pdf found")

    # 2. Check if OCR service is running
    print("\n2️⃣ Checking OCR service health...")
    success, stdout, stderr = run_command("curl -s http://localhost:5113/health")
    if success and "healthy" in stdout:
        print("   ✅ OCR service is healthy")
    else:
        print("   ❌ OCR service not running!")
        print("   Start with: cd backend/services/ocr_field_detection && python3 start_ocr.py")
        test_passed = False

    # 3. Run OCR detection test
    print("\n3️⃣ Running OCR detection test...")
    success, stdout, stderr = run_command("python3 create_ocr_results.py heskem.pdf")

    if success and "SUCCESS" in stdout:
        print("   ✅ OCR detection completed successfully")

        # Extract folder name from output
        import re
        match = re.search(r'test_output/heskem_ocr_\d+_\d+', stdout)
        if match:
            folder = match.group(0)

            # 4. Verify output structure
            print("\n4️⃣ Verifying output structure...")
            expected_dirs = [
                f"{folder}/01_original_images",
                f"{folder}/02_ocr_detection_results",
                f"{folder}/03_fields_overlay"
            ]

            all_exist = True
            for dir_path in expected_dirs:
                if Path(dir_path).exists():
                    print(f"   ✅ {Path(dir_path).name} exists")
                else:
                    print(f"   ❌ {Path(dir_path).name} missing")
                    all_exist = False
                    test_passed = False

            if all_exist:
                # 5. Check detection results
                print("\n5️⃣ Checking detection results...")
                summary_file = Path(folder) / "02_ocr_detection_results" / "summary.json"

                if summary_file.exists():
                    with open(summary_file) as f:
                        summary = json.load(f)

                    print(f"   📊 Total pages: {summary.get('total_pages', 0)}")
                    print(f"   📊 Total fields: {summary.get('total_fields', 0)}")
                    print(f"   📊 Method: {summary.get('method', 'N/A')}")

                    # Validate expected results
                    if summary.get('total_pages') == 5:
                        print("   ✅ Correct number of pages")
                    else:
                        print("   ❌ Unexpected page count")
                        test_passed = False

                    if summary.get('total_fields') > 0:
                        print("   ✅ Fields detected")
                    else:
                        print("   ❌ No fields detected")
                        test_passed = False

                    if "OCR" in summary.get('method', ''):
                        print("   ✅ Using OCR-based detection")
                    else:
                        print("   ❌ Wrong detection method")
                        test_passed = False
                else:
                    print("   ❌ Summary file not found")
                    test_passed = False
        else:
            print("   ❌ Could not find output folder")
            test_passed = False
    else:
        print("   ❌ OCR detection test failed!")
        if stderr:
            print(f"   Error: {stderr[:200]}")
        test_passed = False

    # Final result
    print("\n" + "="*60)
    if test_passed:
        print("✅ GATEKEEPER TEST PASSED - Ready to push")
        print("="*60)
        return 0
    else:
        print("❌ GATEKEEPER TEST FAILED - Fix issues before pushing")
        print("="*60)
        return 1

if __name__ == "__main__":
    sys.exit(main())