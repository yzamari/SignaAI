#!/usr/bin/env python3
"""
Capture document preview with proper wait for loading
"""

import asyncio
from playwright.async_api import async_playwright
import os
from datetime import datetime

async def capture_document_preview():
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    screenshot_dir = f"screenshots_final_{timestamp}"
    os.makedirs(screenshot_dir, exist_ok=True)

    print(f"📸 Capturing document preview with OCR overlays...")
    print(f"📁 Screenshots will be saved to: {screenshot_dir}/")

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=['--window-size=1920,1080']
        )

        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            device_scale_factor=2,
        )

        page = await context.new_page()
        page.on("console", lambda msg: print(f"Console: {msg.text}"))

        try:
            # Login
            print("\n1️⃣ Logging in...")
            await page.goto('http://localhost:5114/login')
            await page.fill('input[type="email"]', 'demo@signaai.com')
            await page.fill('input[type="password"]', 'Demo123!')
            await page.click('button[type="submit"]')
            await page.wait_for_timeout(2000)

            # Upload page
            print("\n2️⃣ Navigating to upload...")
            await page.goto('http://localhost:5114/upload')
            await page.wait_for_timeout(2000)

            # Upload file
            print("\n3️⃣ Uploading heskem.pdf...")
            file_input = await page.query_selector('input[type="file"]')
            if file_input:
                await file_input.set_input_files('heskem.pdf')

                # Wait for OCR processing to complete
                print("   ⏳ Waiting for OCR processing...")

                # Wait for the document image to appear
                await page.wait_for_selector('img[alt*="Page"]', timeout=20000)
                print("   ✅ Document image loaded")

                # Additional wait to ensure overlays are rendered
                await page.wait_for_timeout(3000)

                # Check if field count appears
                field_count = await page.query_selector('text=/\\d+ fields/')
                if field_count:
                    count_text = await field_count.inner_text()
                    print(f"   ✅ Fields detected: {count_text}")

                # Capture screenshots
                print("\n4️⃣ Capturing screenshots...")

                # Full page
                await page.screenshot(
                    path=f"{screenshot_dir}/01_full_document_with_overlays.png",
                    full_page=True
                )
                print("   ✅ Full page with overlays")

                # Just the document area
                doc_area = await page.query_selector('.flex-1.overflow-auto')
                if doc_area:
                    bbox = await doc_area.bounding_box()
                    if bbox:
                        await page.screenshot(
                            path=f"{screenshot_dir}/02_document_area.png",
                            clip=bbox
                        )
                        print("   ✅ Document area")

                # Navigate to page 2
                next_btn = await page.query_selector('[aria-label*="next"], button:has-text("›"), button:has(svg.lucide-chevron-right)')
                if next_btn:
                    await next_btn.click()
                    await page.wait_for_timeout(2000)
                    await page.screenshot(
                        path=f"{screenshot_dir}/03_page_2.png",
                        full_page=True
                    )
                    print("   ✅ Page 2")

                # Go to page 3
                if next_btn:
                    await next_btn.click()
                    await page.wait_for_timeout(2000)
                    await page.screenshot(
                        path=f"{screenshot_dir}/04_page_3.png",
                        full_page=True
                    )
                    print("   ✅ Page 3")

            print(f"\n✨ Screenshots saved to {screenshot_dir}/")

        except Exception as e:
            print(f"\n❌ Error: {e}")
            await page.screenshot(path=f"{screenshot_dir}/error.png", full_page=True)

        finally:
            await page.wait_for_timeout(3000)
            await browser.close()

if __name__ == "__main__":
    asyncio.run(capture_document_preview())