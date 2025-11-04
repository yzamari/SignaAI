#!/usr/bin/env python3
"""
Capture screenshots of document preview with OCR overlays after E2E test
"""

import asyncio
from playwright.async_api import async_playwright
import os
from datetime import datetime

async def capture_document_preview():
    # Create screenshots directory
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    screenshot_dir = f"screenshots_e2e_{timestamp}"
    os.makedirs(screenshot_dir, exist_ok=True)

    print(f"📸 Capturing document preview screenshots...")
    print(f"📁 Screenshots will be saved to: {screenshot_dir}/")

    async with async_playwright() as p:
        # Launch browser
        browser = await p.chromium.launch(
            headless=False,  # Show browser
            args=['--window-size=1920,1080']
        )

        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            device_scale_factor=2,  # High quality screenshots
        )

        page = await context.new_page()

        # Enable console logging
        page.on("console", lambda msg: print(f"Browser: {msg.text}"))

        try:
            # 1. Login
            print("\n1️⃣ Logging in...")
            await page.goto('http://localhost:5114/login')
            await page.wait_for_load_state('networkidle')

            await page.fill('input[type="email"]', 'demo@signaai.com')
            await page.fill('input[type="password"]', 'Demo123!')
            await page.click('button[type="submit"]')
            await page.wait_for_timeout(2000)

            # 2. Navigate to upload
            print("\n2️⃣ Going to upload page...")
            await page.goto('http://localhost:5114/upload')
            await page.wait_for_load_state('networkidle')

            # 3. Upload document
            print("\n3️⃣ Uploading heskem.pdf...")
            file_input = await page.query_selector('input[type="file"]')
            if file_input:
                await file_input.set_input_files('heskem.pdf')
                print("   ⏳ Waiting for OCR processing...")
                await page.wait_for_timeout(10000)  # Wait for OCR

                # Take screenshots of document with overlays
                print("\n4️⃣ Capturing document preview...")

                # Full page screenshot
                await page.screenshot(
                    path=f"{screenshot_dir}/01_document_full_page.png",
                    full_page=True
                )
                print("   ✅ Full page captured")

                # Focused on document viewer
                viewer = await page.query_selector('.image-document-viewer, [class*="documentViewer"], #document-viewer, .flex-1.overflow-auto')
                if viewer:
                    await page.screenshot(
                        path=f"{screenshot_dir}/02_document_viewer.png",
                        clip=await viewer.bounding_box()
                    )
                    print("   ✅ Document viewer captured")

                # Navigate through pages
                print("\n5️⃣ Capturing multiple pages...")
                for i in range(2, 4):  # Capture pages 2 and 3
                    next_btn = await page.query_selector('button:has(svg.lucide-chevron-right)')
                    if next_btn:
                        await next_btn.click()
                        await page.wait_for_timeout(1000)
                        await page.screenshot(
                            path=f"{screenshot_dir}/03_page_{i}.png",
                            full_page=True
                        )
                        print(f"   ✅ Page {i} captured")

                # Toggle overlay visibility
                print("\n6️⃣ Testing overlay toggle...")
                eye_btn = await page.query_selector('button:has(svg.lucide-eye)')
                if eye_btn:
                    await eye_btn.click()
                    await page.wait_for_timeout(500)
                    await page.screenshot(
                        path=f"{screenshot_dir}/04_overlays_hidden.png",
                        full_page=True
                    )
                    print("   ✅ Overlays hidden view captured")

                    # Toggle back
                    eye_btn = await page.query_selector('button:has(svg.lucide-eye-off)')
                    if eye_btn:
                        await eye_btn.click()
                        await page.wait_for_timeout(500)

                # Zoom in
                print("\n7️⃣ Testing zoom...")
                zoom_in = await page.query_selector('button:has(svg.lucide-zoom-in)')
                if zoom_in:
                    await zoom_in.click()
                    await zoom_in.click()  # Click twice for 120% zoom
                    await page.wait_for_timeout(500)
                    await page.screenshot(
                        path=f"{screenshot_dir}/05_zoomed_view.png",
                        full_page=True
                    )
                    print("   ✅ Zoomed view captured")

            print(f"\n✨ Screenshots saved to {screenshot_dir}/")
            print("\n📊 Captured screenshots:")
            for file in sorted(os.listdir(screenshot_dir)):
                file_path = os.path.join(screenshot_dir, file)
                size_kb = os.path.getsize(file_path) / 1024
                print(f"   • {file} ({size_kb:.1f} KB)")

        except Exception as e:
            print(f"\n❌ Error: {e}")
            await page.screenshot(path=f"{screenshot_dir}/error_state.png", full_page=True)

        finally:
            print("\n⏸️  Keeping browser open for 5 seconds...")
            await page.wait_for_timeout(5000)
            await browser.close()

if __name__ == "__main__":
    asyncio.run(capture_document_preview())