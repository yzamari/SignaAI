import { test, expect } from '@playwright/test';
import { TestHelpers } from './fixtures/test-helpers';
import { TestUsers, ExpectedTimeouts } from './fixtures/test-data';
import path from 'path';

test.describe('Performance Tests', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
    await helpers.login(TestUsers.demo.email, TestUsers.demo.password);
  });

  test('should load upload page quickly', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/upload');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;
    
    // Page should load in less than 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('should process OCR within reasonable time', async ({ page }) => {
    await page.goto('/upload');
    
    const testPdf = path.join(__dirname, '..', '..', 'heskem.pdf');
    if (require('fs').existsSync(testPdf)) {
      const startTime = Date.now();
      await helpers.uploadPDF('heskem.pdf');
      await helpers.waitForOCRProcessing(ExpectedTimeouts.ocrProcessing);
      const processingTime = Date.now() - startTime;
      
      // OCR should complete in less than 60 seconds
      expect(processingTime).toBeLessThan(60000);
    } else {
      test.skip();
    }
  });

  test('should render image preview quickly', async ({ page }) => {
    await page.goto('/upload');
    
    const testPdf = path.join(__dirname, '..', '..', 'heskem.pdf');
    if (require('fs').existsSync(testPdf)) {
      await helpers.uploadPDF('heskem.pdf');
      
      const startTime = Date.now();
      await helpers.waitForOCRProcessing();
      await helpers.verifyImagePreview();
      const renderTime = Date.now() - startTime;
      
      // Image should render in less than 10 seconds
      expect(renderTime).toBeLessThan(10000);
    } else {
      test.skip();
    }
  });

  test('should handle signature canvas performance', async ({ page }) => {
    // Test signature canvas responsiveness
    await page.goto('/sign/test-token');
    
    const canvas = page.locator('canvas').first();
    if (await canvas.count() > 0) {
      const startTime = Date.now();
      
      // Draw signature
      await helpers.drawSignature('canvas');
      
      const drawTime = Date.now() - startTime;
      
      // Drawing should be responsive (less than 1 second for simple signature)
      expect(drawTime).toBeLessThan(1000);
    } else {
      test.skip('Signature canvas not available');
    }
  });

  test('should load document list quickly', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;
    
    // Dashboard should load in less than 2 seconds
    expect(loadTime).toBeLessThan(2000);
  });

  test('should handle large document upload', async ({ page }) => {
    // This test would require a large PDF file
    // For now, test structure is shown
    test.skip('Requires large test PDF');
    
    // Would verify:
    // 1. Upload progress indication
    // 2. Processing time for large files
    // 3. Memory usage
  });
});

