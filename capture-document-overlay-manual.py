#!/usr/bin/env python3
"""
Manually capture the document with OCR overlays step by step
"""

import asyncio
from playwright.async_api import async_playwright
import os
from datetime import datetime

async def capture_document_overlays():
    # Create screenshots directory
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    screenshot_dir = f"screenshots_document_{timestamp}"
    os.makedirs(screenshot_dir, exist_ok=True)

    print(f"📸 Starting manual document capture...")
    print(f"📁 Screenshots will be saved to: {screenshot_dir}/")

    async with async_playwright() as p:
        # Launch browser in non-headless mode to see what's happening
        browser = await p.chromium.launch(
            headless=False,
            args=['--window-size=1920,1080']
        )

        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            device_scale_factor=1.5,
        )

        page = await context.new_page()

        # Enable console logging
        page.on("console", lambda msg: print(f"Browser console: {msg.text}"))

        try:
            # 1. Navigate directly to upload page (assuming we can bypass login for demo)
            print("\n1️⃣ Going directly to upload page...")
            await page.goto('http://localhost:5114/upload')
            await page.wait_for_timeout(2000)

            # Check if we need to login
            if 'login' in page.url.lower():
                print("   📝 Need to login first...")
                await page.fill('input[type="email"]', 'demo@signaai.com')
                await page.fill('input[type="password"]', 'Demo123!')
                await page.click('button[type="submit"]')
                await page.wait_for_timeout(3000)

                # Navigate back to upload
                await page.goto('http://localhost:5114/upload')
                await page.wait_for_timeout(2000)

            # Take initial screenshot
            await page.screenshot(path=f"{screenshot_dir}/01_upload_initial.png")
            print("   ✅ Initial upload page captured")

            # 2. Upload the file using different selectors
            print("\n2️⃣ Uploading heskem.pdf...")

            # Try multiple ways to find the file input
            file_input = await page.query_selector('input[type="file"]')
            if not file_input:
                # Try clicking the upload area to trigger file input
                upload_area = await page.query_selector('[class*="upload"], [class*="drop"], .dropzone')
                if upload_area:
                    await upload_area.click()
                    await page.wait_for_timeout(500)
                    file_input = await page.query_selector('input[type="file"]')

            if file_input:
                await file_input.set_input_files('heskem.pdf')
                print("   ✅ File uploaded")

                # Wait for processing with visual feedback
                print("   ⏳ Waiting for OCR processing...")
                for i in range(20):  # Wait up to 20 seconds
                    await page.wait_for_timeout(1000)

                    # Check for any loading indicators
                    loading = await page.query_selector('[class*="loading"], [class*="spinner"], [class*="processing"]')
                    if not loading:
                        # Check if document viewer appeared
                        viewer = await page.query_selector('[class*="document"], [class*="viewer"], [class*="preview"], canvas, img[alt*="page"]')
                        if viewer:
                            print(f"   ✅ Document viewer found after {i+1} seconds")
                            break

                    if i % 5 == 0:
                        print(f"   ... waiting ({i+1}/20 seconds)")

                # Take screenshot after processing
                await page.screenshot(path=f"{screenshot_dir}/02_after_upload.png", full_page=True)
                print("   ✅ Post-upload screenshot captured")

                # 3. Look for the document viewer and pages
                print("\n3️⃣ Looking for document pages...")

                # Check for page images
                page_images = await page.query_selector_all('img[src*="page"], img[alt*="page"], img[src*="blob"], .page-image')
                if page_images:
                    print(f"   ✅ Found {len(page_images)} page images")
                    for idx, img in enumerate(page_images[:3]):  # Capture first 3 pages
                        await img.scroll_into_view_if_needed()
                        await page.wait_for_timeout(500)
                        await page.screenshot(path=f"{screenshot_dir}/03_page_{idx+1}.png")
                        print(f"   ✅ Page {idx+1} captured")

                # Check for canvas elements (PDF.js or similar)
                canvases = await page.query_selector_all('canvas')
                if canvases:
                    print(f"   ✅ Found {len(canvases)} canvas elements")
                    for idx, canvas in enumerate(canvases[:2]):
                        await canvas.scroll_into_view_if_needed()
                        await page.wait_for_timeout(500)
                        await page.screenshot(path=f"{screenshot_dir}/04_canvas_{idx+1}.png")

                # Check for overlays
                overlays = await page.query_selector_all('[class*="overlay"], [class*="field"], .field-box, .ocr-field')
                if overlays:
                    print(f"   ✅ Found {len(overlays)} overlay elements")
                    await page.screenshot(path=f"{screenshot_dir}/05_with_overlays.png", full_page=True)

                # Try to get the actual OCR results from the page
                print("\n4️⃣ Checking for OCR results...")

                # Look for field count or results summary
                field_info = await page.query_selector('[class*="field-count"], [class*="detected"], [class*="results"]')
                if field_info:
                    field_text = await field_info.inner_text()
                    print(f"   ℹ️ Field info: {field_text}")

                # Check React DevTools / component state
                try:
                    # Try to extract data from window object
                    ocr_data = await page.evaluate('''() => {
                        // Check various possible locations for OCR data
                        return {
                            localStorage: window.localStorage.getItem('ocr_results'),
                            sessionStorage: window.sessionStorage.getItem('ocr_results'),
                            reactProps: window.__REACT_PROPS__ || null,
                            documentData: window.documentData || null
                        }
                    }''')
                    if any(ocr_data.values()):
                        print(f"   ℹ️ Found OCR data in browser: {ocr_data}")
                except:
                    pass

            else:
                print("   ❌ Could not find file input")

            # 5. Try direct navigation to a document if it exists
            print("\n5️⃣ Final full page capture...")
            await page.screenshot(path=f"{screenshot_dir}/06_final_state.png", full_page=True)

            print(f"\n✨ Screenshots saved to {screenshot_dir}/")
            print("\n📊 Available screenshots:")
            for file in sorted(os.listdir(screenshot_dir)):
                print(f"   • {file}")

        except Exception as e:
            print(f"\n❌ Error: {e}")
            await page.screenshot(path=f"{screenshot_dir}/error_state.png", full_page=True)

        finally:
            # Keep browser open for manual inspection
            print("\n⏸️  Browser will stay open for 10 seconds for manual inspection...")
            await page.wait_for_timeout(10000)
            await browser.close()

if __name__ == "__main__":
    asyncio.run(capture_document_overlays())