import { test, expect } from '@playwright/test';
import { TestHelpers } from './fixtures/test-helpers';
import { TestUsers, TestSigners, ExpectedTimeouts } from './fixtures/test-data';
import axios from 'axios';

test.describe('Edge Cases', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
  });

  test('should handle many signers (10+)', async ({ page }) => {
    await helpers.login(TestUsers.demo.email, TestUsers.demo.password);
    await page.goto('/upload');
    
    // Create document with many signers via API
    const API_BASE = process.env.API_BASE_URL || 'http://localhost:5112/api/v1';
    const loginResponse = await axios.post(`${API_BASE}/auth/login`,
      new URLSearchParams({
        username: TestUsers.demo.email,
        password: TestUsers.demo.password
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    
    const token = loginResponse.data.access_token;
    
    // Create 10 signers
    const manySigners = Array.from({ length: 10 }, (_, i) => ({
      name: `Signer ${i + 1}`,
      email: `signer${i + 1}@test.com`,
      phone: `+123456789${i}`
    }));
    
    const docResponse = await axios.post(
      `${API_BASE}/documents/create`,
      {
        title: 'Many Signers Test',
        signers: manySigners,
        fields: [],
        workflow: { type: 'parallel' }
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    expect(docResponse.status).toBe(200);
    expect(docResponse.data.signers.length).toBe(10);
    
    // Verify all signers have tokens
    docResponse.data.signers.forEach((signer: any) => {
      expect(signer).toHaveProperty('token');
    });
  });

  test('should handle concurrent signing attempts', async ({ page, context }) => {
    // Create document
    const API_BASE = process.env.API_BASE_URL || 'http://localhost:5112/api/v1';
    const loginResponse = await axios.post(`${API_BASE}/auth/login`,
      new URLSearchParams({
        username: TestUsers.demo.email,
        password: TestUsers.demo.password
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    
    const token = loginResponse.data.access_token;
    
    const docResponse = await axios.post(
      `${API_BASE}/documents/create`,
      {
        title: 'Concurrent Signing Test',
        signers: TestSigners.multiple.slice(0, 2),
        fields: [],
        workflow: { type: 'parallel' }
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    const signingToken = docResponse.data.signers[0].token;
    
    // Try to sign from multiple tabs simultaneously
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    
    await Promise.all([
      page1.goto(`/sign/${signingToken}`),
      page2.goto(`/sign/${signingToken}`)
    ]);
    
    // Both should load
    await Promise.all([
      page1.waitForSelector('img[alt*="Page"], canvas', { timeout: 30000 }),
      page2.waitForSelector('img[alt*="Page"], canvas', { timeout: 30000 })
    ]);
    
    // Try to submit from both
    const helpers1 = new TestHelpers(page1);
    const helpers2 = new TestHelpers(page2);
    
    await Promise.all([
      helpers1.drawSignature('canvas'),
      helpers2.drawSignature('canvas')
    ]);
    
    // One submission should succeed, other might fail or succeed depending on implementation
    await page1.close();
    await page2.close();
  });

  test('should handle rapid page navigation', async ({ page }) => {
    await helpers.login(TestUsers.demo.email, TestUsers.demo.password);
    await page.goto('/upload');
    
    // Rapidly navigate between pages
    await page.goto('/dashboard');
    await page.goto('/upload');
    await page.goto('/dashboard');
    await page.goto('/upload');
    
    // Should not crash or show errors
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle browser back/forward buttons', async ({ page }) => {
    await helpers.login(TestUsers.demo.email, TestUsers.demo.password);
    await page.goto('/dashboard');
    await page.goto('/upload');
    
    // Go back
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard/);
    
    // Go forward
    await page.goForward();
    await expect(page).toHaveURL(/\/upload/);
  });

  test('should handle empty document title', async ({ page }) => {
    await helpers.login(TestUsers.demo.email, TestUsers.demo.password);
    await page.goto('/upload');
    
    const testPdf = require('path').join(__dirname, '..', '..', 'heskem.pdf');
    if (require('fs').existsSync(testPdf)) {
      await helpers.uploadPDF('heskem.pdf');
      await helpers.waitForOCRProcessing();
      
      // Try to proceed without title
      await page.click('button:has-text("Next")');
      
      // Should either use default title or show validation error
      const titleInput = page.locator('input[name="title"]');
      if (await titleInput.count() > 0) {
        await titleInput.fill('');
        // Should validate or use default
      }
    } else {
      test.skip();
    }
  });

  test('should handle special characters in signer names', async ({ page }) => {
    await helpers.login(TestUsers.demo.email, TestUsers.demo.password);
    await page.goto('/upload');
    
    const testPdf = require('path').join(__dirname, '..', '..', 'heskem.pdf');
    if (require('fs').existsSync(testPdf)) {
      await helpers.uploadPDF('heskem.pdf');
      await helpers.waitForOCRProcessing();
      
      await page.click('button:has-text("Next")');
      
      // Add signer with special characters
      await helpers.addSigner("O'Brien-Smith & Co.", 'special@test.com');
      
      // Should handle special characters correctly
      await expect(page.locator('text=/O\'Brien|Smith/i')).toBeVisible();
    } else {
      test.skip();
    }
  });
});

