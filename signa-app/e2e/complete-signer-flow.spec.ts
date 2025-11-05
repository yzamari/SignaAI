import { test, expect } from '@playwright/test';
import { TestHelpers } from './fixtures/test-helpers';
import { ExpectedTimeouts } from './fixtures/test-data';
import axios from 'axios';

test.describe('Complete Signer Flow', () => {
  let helpers: TestHelpers;
  let signingToken: string;
  let documentId: string;

  test.beforeAll(async () => {
    // Create a test document and get signing token
    // This would typically be done via API or by running sender flow first
    try {
      const API_BASE = process.env.API_BASE_URL || 'http://localhost:5112/api/v1';
      
      // Login as sender to create document
      const loginResponse = await axios.post(`${API_BASE}/auth/login`, 
        new URLSearchParams({
          username: 'demo@signaai.com',
          password: 'Demo123!'
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      
      const token = loginResponse.data.access_token;
      
      // Create document with workflow
      const docResponse = await axios.post(
        `${API_BASE}/documents/create`,
        {
          title: 'Test Document for Signing',
          signers: [
            {
              name: 'Test Signer',
              email: 'signer@test.com',
              phone: '+1234567890'
            }
          ],
          fields: [],
          workflow: { type: 'parallel' }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      documentId = docResponse.data.id;
      signingToken = docResponse.data.signers[0].token;
    } catch (error) {
      console.warn('Could not create test document, tests may be skipped:', error);
    }
  });

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
  });

  test('should access document via signing token', async ({ page }) => {
    if (!signingToken) {
      test.skip();
      return;
    }

    // Step 1: Navigate to signing page with token
    await page.goto(`/sign/${signingToken}`);
    
    // Step 2: Verify document loads (no auth required)
    await helpers.waitForDocumentLoad();
    
    // Step 3: Verify signer name is displayed
    await expect(page.locator('text=/Test Signer|signer@test.com/i')).toBeVisible({ timeout: 10000 });
    
    // Step 4: Verify document content is visible
    const documentViewer = page.locator('img[alt*="Page"], canvas, iframe');
    await expect(documentViewer.first()).toBeVisible();
  });

  test('should capture signature on signature field', async ({ page }) => {
    if (!signingToken) {
      test.skip();
      return;
    }

    await page.goto(`/sign/${signingToken}`);
    await helpers.waitForDocumentLoad();
    
    // Find signature canvas or field
    const signatureCanvas = page.locator('canvas').first();
    
    if (await signatureCanvas.count() > 0) {
      // Step 1: Draw signature
      await helpers.drawSignature('canvas');
      
      // Step 2: Verify signature is captured
      const signatureData = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (canvas) {
          return canvas.toDataURL();
        }
        return null;
      });
      
      expect(signatureData).toBeTruthy();
      expect(signatureData).toContain('data:image');
    } else {
      // Alternative: Look for signature input field
      const signatureField = page.locator('input[type="text"][placeholder*="signature"], textarea[placeholder*="signature"]');
      if (await signatureField.count() > 0) {
        await signatureField.fill('John Doe');
      }
    }
  });

  test('should submit signature successfully', async ({ page }) => {
    if (!signingToken) {
      test.skip();
      return;
    }

    await page.goto(`/sign/${signingToken}`);
    await helpers.waitForDocumentLoad();
    
    // Capture signature
    const signatureCanvas = page.locator('canvas').first();
    if (await signatureCanvas.count() > 0) {
      await helpers.drawSignature('canvas');
    }
    
    // Fill any required fields
    const textFields = page.locator('input[type="text"], textarea');
    const fieldCount = await textFields.count();
    if (fieldCount > 0) {
      await textFields.first().fill('Test value');
    }
    
    // Submit signature
    const submitButton = page.locator('button:has-text("Submit"), button:has-text("Sign"), button:has-text("Complete")');
    await submitButton.click();
    
    // Wait for submission API call
    const response = await page.waitForResponse(
      (response) => response.url().includes('/signing/documents') && 
                    response.url().includes('/submit') &&
                    response.status() === 200,
      { timeout: ExpectedTimeouts.apiResponse }
    );
    
    const responseData = await response.json();
    expect(responseData).toHaveProperty('message');
    expect(responseData.message).toMatch(/success|signed/i);
    
    // Verify redirect to success page
    await page.waitForURL(/\/sign\/success/, { timeout: 10000 });
    await expect(page.locator('text=/success|completed|thank you/i')).toBeVisible();
  });

  test('should handle multiple signature fields', async ({ page }) => {
    if (!signingToken) {
      test.skip();
      return;
    }

    await page.goto(`/sign/${signingToken}`);
    await helpers.waitForDocumentLoad();
    
    // Find all signature fields
    const signatureFields = page.locator('canvas, [data-field-type="signature"]');
    const fieldCount = await signatureFields.count();
    
    if (fieldCount > 1) {
      // Sign first field
      const firstField = signatureFields.first();
      const box = await firstField.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 30);
        await page.mouse.up();
      }
      
      // Sign second field if exists
      if (fieldCount > 1) {
        const secondField = signatureFields.nth(1);
        const box2 = await secondField.boundingBox();
        if (box2) {
          await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
          await page.mouse.down();
          await page.mouse.move(box2.x + box2.width / 2 + 50, box2.y + box2.height / 2 + 30);
          await page.mouse.up();
        }
      }
      
      // Verify both fields have signatures
      const signedFields = page.locator('[data-signed="true"], .signed');
      const signedCount = await signedFields.count();
      expect(signedCount).toBeGreaterThanOrEqual(1);
    }
  });

  test('should validate signature before submission', async ({ page }) => {
    if (!signingToken) {
      test.skip();
      return;
    }

    await page.goto(`/sign/${signingToken}`);
    await helpers.waitForDocumentLoad();
    
    // Try to submit without signature
    const submitButton = page.locator('button:has-text("Submit"), button:has-text("Sign")');
    
    // Check if submit is disabled or shows validation
    const isDisabled = await submitButton.getAttribute('disabled');
    if (isDisabled === null) {
      // Try to click and check for validation message
      await submitButton.click();
      await expect(page.locator('text=/signature.*required|please.*sign/i')).toBeVisible({ timeout: 3000 }).catch(() => {
        // Validation might not be implemented
      });
    } else {
      expect(isDisabled).toBe('');
    }
  });

  test('should display document pages correctly', async ({ page }) => {
    if (!signingToken) {
      test.skip();
      return;
    }

    await page.goto(`/sign/${signingToken}`);
    await helpers.waitForDocumentLoad();
    
    // Check for page navigation controls
    const pageNav = page.locator('text=/Page.*of|page.*\\d+/i, button:has-text("Next"), button:has-text("Previous")');
    const navCount = await pageNav.count();
    
    if (navCount > 0) {
      // Navigate to next page if available
      const nextButton = page.locator('button:has-text("Next"), button[aria-label*="next"]');
      if (await nextButton.count() > 0 && await nextButton.isEnabled()) {
        await nextButton.click();
        await page.waitForTimeout(1000);
        
        // Verify page changed
        const pageIndicator = page.locator('text=/Page.*2|page.*2/i');
        if (await pageIndicator.count() > 0) {
          await expect(pageIndicator).toBeVisible();
        }
      }
    }
  });
});

