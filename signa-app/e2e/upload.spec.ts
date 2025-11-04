import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Upload Flow E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('http://localhost:5114/login');
    await page.fill('input[type="email"]', 'demo@signaai.com');
    await page.fill('input[type="password"]', 'Demo123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|upload)/);
  });

  test('should load upload page', async ({ page }) => {
    await page.goto('http://localhost:5114/upload');
    await expect(page).toHaveTitle(/Upload/i);
    await expect(page.locator('text=/upload|drop/i')).toBeVisible();
  });

  test('should upload PDF and process with OCR', async ({ page }) => {
    await page.goto('http://localhost:5114/upload');

    // Upload file
    const fileInput = await page.locator('input[type="file"]');
    const testPdf = path.join(__dirname, '..', '..', 'heskem.pdf');

    if (require('fs').existsSync(testPdf)) {
      await fileInput.setInputFiles(testPdf);

      // Wait for OCR processing
      await page.waitForSelector('text=/processing|detecting/i', { timeout: 30000 });

      // Check for image preview (not PDF)
      await expect(page.locator('img[alt*="Page"]')).toBeVisible({ timeout: 30000 });

      // Check for detected fields
      const fieldsText = await page.locator('text=/field.*detected/i').textContent();
      expect(fieldsText).toBeTruthy();
    }
  });

  test('should navigate through upload steps', async ({ page }) => {
    await page.goto('http://localhost:5114/upload');

    // Step 1: Upload
    await expect(page.locator('text=/Upload/i')).toBeVisible();

    // Upload a file first
    const fileInput = await page.locator('input[type="file"]');
    const testPdf = path.join(__dirname, '..', '..', 'heskem.pdf');

    if (require('fs').existsSync(testPdf)) {
      await fileInput.setInputFiles(testPdf);
      await page.waitForTimeout(2000);

      // Click Next to go to Recipients
      await page.click('button:has-text("Next")');

      // Step 2: Recipients
      await expect(page.locator('text=/Recipients/i')).toBeVisible();
      await page.fill('input[placeholder="Full Name"]', 'Test Signer');
      await page.fill('input[placeholder="Email Address"]', 'test@example.com');

      // Click Next to go to Settings
      await page.click('button:has-text("Next")');

      // Step 3: Settings
      await expect(page.locator('text=/Settings|Workflow/i')).toBeVisible();

      // Click Next to go to Review
      await page.click('button:has-text("Next")');

      // Step 4: Review & Send
      await expect(page.locator('text=/Review.*Send/i')).toBeVisible();
      await expect(page.locator('text=/Send for Signature/i')).toBeVisible();
    }
  });

  test('should display image-based preview, not PDF', async ({ page }) => {
    await page.goto('http://localhost:5114/upload');

    const fileInput = await page.locator('input[type="file"]');
    const testPdf = path.join(__dirname, '..', '..', 'heskem.pdf');

    if (require('fs').existsSync(testPdf)) {
      await fileInput.setInputFiles(testPdf);
      await page.waitForTimeout(3000);

      // Should NOT have PDF iframe
      await expect(page.locator('iframe[src*=".pdf"]')).not.toBeVisible();

      // Should have image viewer
      await expect(page.locator('img[alt*="Page"]')).toBeVisible();

      // Should have page navigation
      await expect(page.locator('text=/Page.*of/i')).toBeVisible();

      // Should have zoom controls
      await expect(page.locator('button[title*="Zoom"]')).toBeVisible();
    }
  });

  test('should add and remove recipients', async ({ page }) => {
    await page.goto('http://localhost:5114/upload');

    // Upload file first
    const fileInput = await page.locator('input[type="file"]');
    const testPdf = path.join(__dirname, '..', '..', 'heskem.pdf');

    if (require('fs').existsSync(testPdf)) {
      await fileInput.setInputFiles(testPdf);
      await page.waitForTimeout(2000);

      // Go to Recipients step
      await page.click('button:has-text("Next")');

      // Add first recipient
      await page.fill('input[placeholder="Full Name"]', 'First Signer');
      await page.fill('input[placeholder="Email Address"]', 'first@example.com');

      // Add another recipient
      await page.click('button:has-text("Add Another Recipient")');
      await page.locator('input[placeholder="Full Name"]').nth(1).fill('Second Signer');
      await page.locator('input[placeholder="Email Address"]').nth(1).fill('second@example.com');

      // Check both are present
      await expect(page.locator('text="Recipient 1"')).toBeVisible();
      await expect(page.locator('text="Recipient 2"')).toBeVisible();

      // Remove second recipient
      await page.locator('button:has-text("Remove")').click();

      // Check only one remains
      await expect(page.locator('text="Recipient 1"')).toBeVisible();
      await expect(page.locator('text="Recipient 2"')).not.toBeVisible();
    }
  });
});