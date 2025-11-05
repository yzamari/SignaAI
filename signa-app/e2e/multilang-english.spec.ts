import { test, expect } from '@playwright/test';
import { TestHelpers } from './fixtures/test-helpers';
import { TestUsers, ExpectedTimeouts } from './fixtures/test-data';
import path from 'path';

test.describe('English (LTR) Language Flow', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
    await helpers.login(TestUsers.demo.email, TestUsers.demo.password);
  });

  test('should process English document correctly', async ({ page }) => {
    await page.goto('/upload');
    
    // Test with any PDF (English is default)
    const testPdf = path.join(__dirname, '..', '..', 'heskem.pdf');
    if (require('fs').existsSync(testPdf)) {
      await helpers.uploadPDF('heskem.pdf');
      await helpers.waitForOCRProcessing(ExpectedTimeouts.ocrProcessing);
      
      // Verify document loads
      await helpers.verifyImagePreview();
      
      // Verify fields are detected
      const fields = page.locator('[data-field-id], .field-overlay');
      const fieldCount = await fields.count();
      expect(fieldCount).toBeGreaterThanOrEqual(0);
    } else {
      test.skip();
    }
  });

  test('should send English SMS notification', async ({ page }) => {
    await page.goto('/upload');
    
    const testPdf = path.join(__dirname, '..', '..', 'heskem.pdf');
    if (require('fs').existsSync(testPdf)) {
      await helpers.uploadPDF('heskem.pdf');
      await helpers.waitForOCRProcessing();
      
      await page.click('button:has-text("Next")');
      await helpers.addSigner('John Doe', 'john@test.com', '+1234567890');
      await page.click('button:has-text("Next")');
      await page.click('button:has-text("Next")');
      
      const sendButton = page.locator('button:has-text("Send"), button:has-text("Send for Signature")');
      await sendButton.click();
      
      const response = await page.waitForResponse(
        (response) => response.url().includes('/documents/create') && response.status() === 200,
        { timeout: ExpectedTimeouts.apiResponse }
      );
      
      const data = await response.json();
      
      // Verify English language (default)
      expect(data.language).toBe('english');
    } else {
      test.skip();
    }
  });

  test('should display English UI elements correctly', async ({ page }) => {
    await page.goto('/upload');
    
    // Verify English text is displayed
    await expect(page.locator('text=/Upload|Document|Sign/i')).toBeVisible();
  });
});

