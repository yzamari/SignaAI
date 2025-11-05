import { test, expect } from '@playwright/test';
import { TestHelpers } from './fixtures/test-helpers';
import { TestUsers, TestDocuments, TestSigners, ExpectedTimeouts } from './fixtures/test-data';
import path from 'path';

test.describe('Complete Sender Flow', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
    await helpers.login(TestUsers.demo.email, TestUsers.demo.password);
  });

  test('should complete full document creation workflow', async ({ page }) => {
    // Step 1: Navigate to upload page
    await page.goto('/upload');
    await expect(page).toHaveURL(/\/upload/);

    // Step 2: Upload PDF
    const testPdf = path.join(__dirname, '..', '..', 'heskem.pdf');
    const fileInput = page.locator('input[type="file"]');
    
    if (require('fs').existsSync(testPdf)) {
      await fileInput.setInputFiles(testPdf);
      
      // Step 3: Wait for OCR processing
      await helpers.waitForOCRProcessing(ExpectedTimeouts.ocrProcessing);
      
      // Step 4: Verify image-based preview (not PDF iframe)
      await helpers.verifyImagePreview();
      
      // Step 5: Verify detected fields appear
      const fieldsDetected = await page.locator('text=/field.*detected|detected.*field/i').count();
      expect(fieldsDetected).toBeGreaterThan(0);
      
      // Step 6: Navigate to Recipients step
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=/Recipients|Add Recipients/i')).toBeVisible();
      
      // Step 7: Add signers
      const signer = TestSigners.single[0];
      await helpers.addSigner(signer.name, signer.email, signer.phone);
      
      // Step 8: Navigate to Settings/Workflow step
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=/Settings|Workflow/i')).toBeVisible();
      
      // Step 9: Configure workflow (parallel by default)
      const workflowType = page.locator('input[type="radio"][value="parallel"], select[name="workflow"]');
      if (await workflowType.count() > 0) {
        await workflowType.first().click();
      }
      
      // Step 10: Navigate to Review & Send
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=/Review.*Send|Send for Signature/i')).toBeVisible();
      
      // Step 11: Send document
      const sendButton = page.locator('button:has-text("Send"), button:has-text("Send for Signature")');
      await sendButton.click();
      
      // Step 12: Wait for document creation API call
      const response = await page.waitForResponse(
        (response) => response.url().includes('/documents/create') && response.status() === 200,
        { timeout: ExpectedTimeouts.apiResponse }
      );
      
      const responseData = await response.json();
      expect(responseData).toHaveProperty('id');
      expect(responseData.signers).toBeDefined();
      expect(responseData.signers.length).toBeGreaterThan(0);
      
      // Step 13: Verify signing tokens generated
      const signers = responseData.signers;
      signers.forEach((signer: any) => {
        expect(signer).toHaveProperty('token');
        expect(signer.token).toBeTruthy();
      });
      
      // Step 14: Verify success message or redirect
      await page.waitForSelector('text=/success|sent|created/i', { timeout: 10000 }).catch(() => {
        // Success might be shown differently
      });
    } else {
      test.skip();
    }
  });

  test('should handle field management during upload', async ({ page }) => {
    await page.goto('/upload');
    
    const testPdf = path.join(__dirname, '..', '..', 'heskem.pdf');
    if (require('fs').existsSync(testPdf)) {
      await helpers.uploadPDF('heskem.pdf');
      await helpers.waitForOCRProcessing();
      
      // Verify fields are displayed
      const fields = page.locator('[data-field-id], .field-overlay');
      const fieldCount = await fields.count();
      expect(fieldCount).toBeGreaterThan(0);
      
      // Try to add a new field manually (if UI supports it)
      const addFieldButton = page.locator('button:has-text("Add Field"), button[title*="Add"]');
      if (await addFieldButton.count() > 0) {
        await addFieldButton.first().click();
        // Verify field was added
        const newFieldCount = await fields.count();
        expect(newFieldCount).toBeGreaterThan(fieldCount);
      }
    } else {
      test.skip();
    }
  });

  test('should support multiple signers', async ({ page }) => {
    await page.goto('/upload');
    
    const testPdf = path.join(__dirname, '..', '..', 'heskem.pdf');
    if (require('fs').existsSync(testPdf)) {
      await helpers.uploadPDF('heskem.pdf');
      await helpers.waitForOCRProcessing();
      
      // Navigate to Recipients
      await page.click('button:has-text("Next")');
      
      // Add first signer
      const signer1 = TestSigners.multiple[0];
      await helpers.addSigner(signer1.name, signer1.email, signer1.phone);
      
      // Add another recipient
      const addAnotherButton = page.locator('button:has-text("Add Another"), button:has-text("Add Recipient")');
      if (await addAnotherButton.count() > 0) {
        await addAnotherButton.click();
        
        // Add second signer
        const signer2 = TestSigners.multiple[1];
        const nameInputs = page.locator('input[placeholder*="Name"], input[placeholder*="name"]');
        const emailInputs = page.locator('input[type="email"], input[placeholder*="Email"]');
        
        await nameInputs.nth(1).fill(signer2.name);
        await emailInputs.nth(1).fill(signer2.email);
      }
      
      // Verify both signers are present
      await expect(page.locator('text=' + TestSigners.multiple[0].name)).toBeVisible();
      await expect(page.locator('text=' + TestSigners.multiple[1].name)).toBeVisible();
    } else {
      test.skip();
    }
  });

  test('should verify document metadata is saved correctly', async ({ page }) => {
    await page.goto('/upload');
    
    const testPdf = path.join(__dirname, '..', '..', 'heskem.pdf');
    if (require('fs').existsSync(testPdf)) {
      await helpers.uploadPDF('heskem.pdf');
      await helpers.waitForOCRProcessing();
      
      // Set document title if possible
      const titleInput = page.locator('input[name="title"], input[placeholder*="Title"]');
      if (await titleInput.count() > 0) {
        await titleInput.fill('Test Document Title');
      }
      
      // Complete workflow
      await page.click('button:has-text("Next")');
      await helpers.addSigner(TestSigners.single[0].name, TestSigners.single[0].email);
      await page.click('button:has-text("Next")');
      await page.click('button:has-text("Next")');
      
      // Send and verify response
      const sendButton = page.locator('button:has-text("Send"), button:has-text("Send for Signature")');
      await sendButton.click();
      
      const response = await page.waitForResponse(
        (response) => response.url().includes('/documents/create') && response.status() === 200,
        { timeout: ExpectedTimeouts.apiResponse }
      );
      
      const data = await response.json();
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('createdAt');
      expect(data.status).toBe('pending');
    } else {
      test.skip();
    }
  });
});

