#!/usr/bin/env python3
"""
Debug what the frontend is receiving from OCR
"""

import asyncio
from playwright.async_api import async_playwright

async def debug_ocr_response():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()

        # Capture console logs
        logs = []
        page.on("console", lambda msg: logs.append(msg.text()))

        # Login
        await page.goto('http://localhost:5114/login')
        await page.fill('input[type="email"]', 'demo@signaai.com')
        await page.fill('input[type="password"]', 'Demo123!')
        await page.click('button[type="submit"]')
        await page.wait_for_timeout(2000)

        # Upload
        await page.goto('http://localhost:5114/upload')
        await page.wait_for_timeout(1000)

        # Upload file
        file_input = await page.query_selector('input[type="file"]')
        if file_input:
            await file_input.set_input_files('heskem.pdf')

            # Wait for processing
            await page.wait_for_timeout(15000)

            # Extract data from browser
            result = await page.evaluate('''() => {
                const getDocumentData = () => {
                    // Try to find React component data
                    const root = document.querySelector('#__next') || document.querySelector('#root');
                    if (root && root._reactRootContainer) {
                        // Look for document pages in React state
                        return 'React root found';
                    }

                    // Check localStorage/sessionStorage
                    return {
                        localStorage: Object.keys(window.localStorage),
                        sessionStorage: Object.keys(window.sessionStorage),
                        // Try to access component state directly
                        reactFiber: document.querySelector('[class*="document"]')?._owner
                    };
                };

                return getDocumentData();
            }''')

            print("Browser data:", result)

            # Print relevant console logs
            print("\n=== Console logs containing 'Document' or 'pages' ===")
            for log in logs:
                if 'Document' in log or 'pages' in log or 'fields' in log:
                    print(log)

        await page.wait_for_timeout(3000)
        await browser.close()

if __name__ == "__main__":
    asyncio.run(debug_ocr_response())