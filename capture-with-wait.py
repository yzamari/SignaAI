#!/usr/bin/env python3
"""
Capture document preview with proper wait
"""

import asyncio
from playwright.async_api import async_playwright
import os
from datetime import datetime

async def capture_document_preview():
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    screenshot_dir = f"screenshots_wait_{timestamp}"
    os.makedirs(screenshot_dir, exist_ok=True)

    print(f"📸 Capturing document preview...")
    print(f"📁 Screenshots will be saved to: {screenshot_dir}/")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            device_scale_factor=2,
        )
        page = await context.new_page()

        try:
            # Login
            print("1️⃣ Logging in...")
            await page.goto('http://localhost:5114/login')
            await page.fill('input[type="email"]', 'demo@signaai.com')
            await page.fill('input[type="password"]', 'Demo123!')
            await page.click('button[type="submit"]')
            await page.wait_for_timeout(2000)

            # Upload page
            print("2️⃣ Navigating to upload...")
            await page.goto('http://localhost:5114/upload')
            await page.wait_for_timeout(2000)

            # Upload file
            print("3️⃣ Uploading heskem.pdf...")
            file_input = await page.query_selector('input[type="file"]')
            if file_input:
                await file_input.set_input_files('heskem.pdf')

                # Wait longer for OCR and rendering
                print("⏳ Waiting for document to render...")
                await page.wait_for_timeout(20000)  # Wait 20 seconds

                # Take screenshots
                print("4️⃣ Capturing screenshots...")

                # Full page
                await page.screenshot(
                    path=f"{screenshot_dir}/01_document_preview.png",
                    full_page=True
                )
                print("   ✅ Document preview captured")

                # Check for page navigation
                next_btn = await page.query_selector('button:has(svg.lucide-chevron-right)')
                if next_btn:
                    print("   ✅ Navigation controls found")

            print(f"\n✨ Screenshot saved to {screenshot_dir}/")

        except Exception as e:
            print(f"❌ Error: {e}")

        finally:
            await page.wait_for_timeout(3000)
            await browser.close()

if __name__ == "__main__":
    asyncio.run(capture_document_preview())