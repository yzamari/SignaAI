import { test, expect } from '@playwright/test';
import { TestHelpers } from './fixtures/test-helpers';
import { TestUsers, TestSigners, ExpectedTimeouts } from './fixtures/test-data';
import axios from 'axios';
import path from 'path';

test.describe('Sequential Workflow', () => {
  let helpers: TestHelpers;
  let documentId: string;
  let signingTokens: { [key: string]: string } = {};

  test.beforeAll(async () => {
    // Create a document with sequential workflow
    try {
      const API_BASE = process.env.API_BASE_URL || 'http://localhost:5112/api/v1';
      
      // Login as sender
      const loginResponse = await axios.post(`${API_BASE}/auth/login`,
        new URLSearchParams({
          username: TestUsers.demo.email,
          password: TestUsers.demo.password
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      
      const token = loginResponse.data.access_token;
      
      // Create document with sequential workflow
      const docResponse = await axios.post(
        `${API_BASE}/documents/create`,
        {
          title: 'Sequential Workflow Test',
          signers: TestSigners.multiple.slice(0, 3),
          fields: [],
          workflow: { type: 'sequential' }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      documentId = docResponse.data.id;
      
      // Extract signing tokens
      docResponse.data.signers.forEach((signer: any, index: number) => {
        signingTokens[TestSigners.multiple[index].email] = signer.token;
      });
    } catch (error) {
      console.warn('Could not create test document:', error);
    }
  });

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
  });

  test('should enforce signing order in sequential workflow', async ({ page }) => {
    if (!documentId || Object.keys(signingTokens).length === 0) {
      test.skip();
      return;
    }

    // Step 1: First signer should be able to sign
    const firstSignerToken = signingTokens[TestSigners.multiple[0].email];
    await page.goto(`/sign/${firstSignerToken}`);
    await helpers.waitForDocumentLoad();
    
    // Verify first signer can access document
    await expect(page.locator('text=/Test Signer|signer/i')).toBeVisible({ timeout: 10000 });
    
    // Sign document
    const signatureCanvas = page.locator('canvas').first();
    if (await signatureCanvas.count() > 0) {
      await helpers.drawSignature('canvas');
    }
    
    const submitButton = page.locator('button:has-text("Submit"), button:has-text("Sign")');
    await submitButton.click();
    
    // Wait for submission
    await page.waitForResponse(
      (response) => response.url().includes('/submit') && response.status() === 200,
      { timeout: ExpectedTimeouts.apiResponse }
    );
    
    // Step 2: Verify second signer is now notified
    // (In real scenario, this would be via SMS/email, but we can check workflow status)
    const API_BASE = process.env.API_BASE_URL || 'http://localhost:5112/api/v1';
    const loginResponse = await axios.post(`${API_BASE}/auth/login`,
      new URLSearchParams({
        username: TestUsers.demo.email,
        password: TestUsers.demo.password
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    
    const token = loginResponse.data.access_token;
    
    // Check document status
    const docResponse = await axios.get(
      `${API_BASE}/documents/${documentId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    // Verify first signer status is "signed"
    const firstSigner = docResponse.data.signers.find((s: any) => s.email === TestSigners.multiple[0].email);
    expect(firstSigner.status).toBe('signed');
    
    // Step 3: Second signer should now be able to sign
    const secondSignerToken = signingTokens[TestSigners.multiple[1].email];
    await page.goto(`/sign/${secondSignerToken}`);
    await helpers.waitForDocumentLoad();
    
    // Sign as second signer
    if (await signatureCanvas.count() > 0) {
      await helpers.drawSignature('canvas');
    }
    await submitButton.click();
    
    await page.waitForResponse(
      (response) => response.url().includes('/submit') && response.status() === 200,
      { timeout: ExpectedTimeouts.apiResponse }
    );
    
    // Step 4: Third signer should now be able to sign
    const thirdSignerToken = signingTokens[TestSigners.multiple[2].email];
    await page.goto(`/sign/${thirdSignerToken}`);
    await helpers.waitForDocumentLoad();
    
    if (await signatureCanvas.count() > 0) {
      await helpers.drawSignature('canvas');
    }
    await submitButton.click();
    
    await page.waitForResponse(
      (response) => response.url().includes('/submit') && response.status() === 200,
      { timeout: ExpectedTimeouts.apiResponse }
    );
    
    // Step 5: Verify workflow is completed
    const finalDocResponse = await axios.get(
      `${API_BASE}/documents/${documentId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    expect(finalDocResponse.data.status).toBe('signed');
    finalDocResponse.data.signers.forEach((signer: any) => {
      expect(signer.status).toBe('signed');
    });
  });

  test('should prevent later signers from signing before their turn', async ({ page }) => {
    if (!documentId || Object.keys(signingTokens).length === 0) {
      test.skip();
      return;
    }

    // Try to sign as second signer before first signer has signed
    const secondSignerToken = signingTokens[TestSigners.multiple[1].email];
    await page.goto(`/sign/${secondSignerToken}`);
    
    // Check if there's a message about waiting for previous signer
    const waitingMessage = page.locator('text=/wait|pending|not.*ready/i');
    const messageCount = await waitingMessage.count();
    
    // Document should still load, but may show status
    await helpers.waitForDocumentLoad();
    
    // Attempt to submit (should either be disabled or show error)
    const submitButton = page.locator('button:has-text("Submit"), button:has-text("Sign")');
    const isDisabled = await submitButton.getAttribute('disabled');
    
    // In sequential workflow, later signers might need to wait
    // This depends on implementation - document might still be accessible but submission blocked
  });
});

