#!/usr/bin/env python3
"""
Capture screenshots of the document preview with OCR overlays
"""

import asyncio
from playwright.async_api import async_playwright
import os
from datetime import datetime

async def capture_screenshots():
    # Create screenshots directory
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    screenshot_dir = f"screenshots_overlay_{timestamp}"
    os.makedirs(screenshot_dir, exist_ok=True)

    print(f"📸 Starting screenshot capture...")
    print(f"📁 Screenshots will be saved to: {screenshot_dir}/")

    async with async_playwright() as p:
        # Launch browser
        browser = await p.chromium.launch(
            headless=False,  # Show browser for better debugging
            args=['--window-size=1920,1080']
        )

        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            device_scale_factor=2,  # High quality screenshots
        )

        page = await context.new_page()

        try:
            # 1. Go to login page
            print("\n1️⃣ Navigating to login page...")
            await page.goto('http://localhost:5114/login')
            await page.wait_for_load_state('networkidle')

            # Take screenshot of login page
            await page.screenshot(path=f"{screenshot_dir}/01_login_page.png", full_page=True)
            print("   ✅ Login page captured")

            # 2. Login with demo credentials
            print("\n2️⃣ Logging in with demo credentials...")
            await page.fill('input[type="email"]', 'demo@signaai.com')
            await page.fill('input[type="password"]', 'Demo123!')
            await page.click('button[type="submit"]')

            # Wait for redirect
            await page.wait_for_timeout(3000)

            # 3. Navigate to upload page
            print("\n3️⃣ Navigating to upload page...")
            await page.goto('http://localhost:5114/upload')
            await page.wait_for_load_state('networkidle')

            # Take screenshot of upload page
            await page.screenshot(path=f"{screenshot_dir}/02_upload_page.png", full_page=True)
            print("   ✅ Upload page captured")

            # 4. Upload the test PDF
            print("\n4️⃣ Uploading heskem.pdf...")

            # Find the file input
            file_input = await page.query_selector('input[type="file"]')
            if file_input:
                await file_input.set_input_files('heskem.pdf')
                print("   ✅ File selected")

                # Wait for processing
                print("   ⏳ Waiting for OCR processing...")
                await page.wait_for_timeout(15000)  # Wait 15 seconds for OCR

                # 5. Take screenshots of document with overlays
                print("\n5️⃣ Capturing document preview with overlays...")

                # Check if ImageDocumentViewer is loaded
                viewer = await page.query_selector('.image-document-viewer, [class*="documentViewer"], #document-viewer')
                if viewer:
                    # Full page screenshot
                    await page.screenshot(path=f"{screenshot_dir}/03_document_with_overlays_full.png", full_page=True)
                    print("   ✅ Full page with overlays captured")

                    # Zoom in on the document area
                    if viewer:
                        await viewer.scroll_into_view_if_needed()
                        await page.screenshot(path=f"{screenshot_dir}/04_document_focused.png", clip=await viewer.bounding_box())
                        print("   ✅ Focused document view captured")

                    # Try different pages if multi-page navigation exists
                    next_button = await page.query_selector('button:has-text("Next"), button[aria-label*="next"]')
                    if next_button:
                        for page_num in range(2, 4):  # Capture pages 2 and 3
                            await next_button.click()
                            await page.wait_for_timeout(1000)
                            await page.screenshot(path=f"{screenshot_dir}/05_document_page_{page_num}.png", full_page=True)
                            print(f"   ✅ Page {page_num} captured")

                    # Capture with different zoom levels if zoom controls exist
                    zoom_in = await page.query_selector('button:has-text("Zoom In"), button[aria-label*="zoom in"]')
                    if zoom_in:
                        await zoom_in.click()
                        await page.wait_for_timeout(500)
                        await page.screenshot(path=f"{screenshot_dir}/06_document_zoomed.png", full_page=True)
                        print("   ✅ Zoomed view captured")

                else:
                    print("   ⚠️ Document viewer not found, taking page screenshot anyway")
                    await page.screenshot(path=f"{screenshot_dir}/03_upload_result.png", full_page=True)

            else:
                print("   ❌ File input not found")

            # 6. Check field management panel if visible
            field_panel = await page.query_selector('[class*="field"], [class*="Field"]')
            if field_panel:
                await page.screenshot(path=f"{screenshot_dir}/07_field_management.png", full_page=True)
                print("   ✅ Field management panel captured")

            print(f"\n✨ Screenshots saved to {screenshot_dir}/")
            print("\n📊 Summary:")
            print(f"   • Login page: 01_login_page.png")
            print(f"   • Upload page: 02_upload_page.png")
            print(f"   • Document with overlays: 03_document_with_overlays_full.png")
            print(f"   • And more views if available...")

        except Exception as e:
            print(f"\n❌ Error: {e}")
            # Take error screenshot
            await page.screenshot(path=f"{screenshot_dir}/error_state.png", full_page=True)
            print(f"   Error screenshot saved: error_state.png")

        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(capture_screenshots())