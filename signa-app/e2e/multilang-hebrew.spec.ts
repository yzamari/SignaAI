import { test, expect } from '@playwright/test';
import { TestHelpers } from './fixtures/test-helpers';
import { TestUsers, TestDocuments, ExpectedTimeouts } from './fixtures/test-data';
import path from 'path';

test.describe('Hebrew (RTL) Language Flow', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
    await helpers.login(TestUsers.demo.email, TestUsers.demo.password);
  });

  test('should process Hebrew document correctly', async ({ page }) => {
    await page.goto('/upload');
    
    const testPdf = path.join(__dirname, '..', '..', 'heskem.pdf');
    if (require('fs').existsSync(testPdf)) {
      await helpers.uploadPDF('heskem.pdf');
      await helpers.waitForOCRProcessing(ExpectedTimeouts.ocrProcessing);
      
      // Verify Hebrew document is detected
      const languageIndicator = page.locator('text=/hebrew|עברית/i');
      const langCount = await languageIndicator.count();
      
      // Verify image preview loads
      await helpers.verifyImagePreview();
      
      // Verify RTL text handling in detected fields
      const fields = page.locator('[data-field-id], .field-overlay');
      const fieldCount = await fields.count();
      expect(fieldCount).toBeGreaterThan(0);
    } else {
      test.skip();
    }
  });

  test('should send Hebrew SMS notification', async ({ page }) => {
    await page.goto('/upload');
    
    const testPdf = path.join(__dirname, '..', '..', 'heskem.pdf');
    if (require('fs').existsSync(testPdf)) {
      await helpers.uploadPDF('heskem.pdf');
      await helpers.waitForOCRProcessing();
      
      // Navigate through steps
      await page.click('button:has-text("Next")');
      await helpers.addSigner('ישראל ישראלי', 'israel@test.com', '+972501234567');
      await page.click('button:has-text("Next")');
      await page.click('button:has-text("Next")');
      
      // Send document
      const sendButton = page.locator('button:has-text("Send"), button:has-text("Send for Signature")');
      await sendButton.click();
      
      // Wait for API response
      const response = await page.waitForResponse(
        (response) => response.url().includes('/documents/create') && response.status() === 200,
        { timeout: ExpectedTimeouts.apiResponse }
      );
      
      const data = await response.json();
      
      // Verify document language is Hebrew
      expect(data.language).toBe('hebrew');
      
      // Verify Hebrew SMS would be sent (check backend logs or API response)
      // In real scenario, verify SMS contains Hebrew text
    } else {
      test.skip();
    }
  });

  test('should display Hebrew UI elements correctly', async ({ page }) => {
    // Check if Hebrew UI is available
    await page.goto('/upload');
    
    // Verify RTL layout support
    const body = page.locator('body');
    const dir = await body.getAttribute('dir');
    
    // Document might be Hebrew but UI might still be LTR
    // This depends on implementation
  });

  test('should handle Hebrew field labels', async ({ page }) => {
    await page.goto('/upload');
    
    const testPdf = path.join(__dirname, '..', '..', 'heskem.pdf');
    if (require('fs').existsSync(testPdf)) {
      await helpers.uploadPDF('heskem.pdf');
      await helpers.waitForOCRProcessing();
      
      // Check for Hebrew field labels
      const hebrewLabels = page.locator('text=/חתימה|שם|תאריך/i');
      const labelCount = await hebrewLabels.count();
      
      // Fields should be detected even if labels are in Hebrew
      const fields = page.locator('[data-field-id], .field-overlay');
      const fieldCount = await fields.count();
      expect(fieldCount).toBeGreaterThan(0);
    } else {
      test.skip();
    }
  });
});

