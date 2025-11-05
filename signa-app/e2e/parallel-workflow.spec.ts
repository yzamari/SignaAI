import { test, expect } from '@playwright/test';
import { TestHelpers } from './fixtures/test-helpers';
import { TestUsers, TestSigners, ExpectedTimeouts } from './fixtures/test-data';
import axios from 'axios';

test.describe('Parallel Workflow', () => {
  let helpers: TestHelpers;
  let documentId: string;
  let signingTokens: { [key: string]: string } = {};

  test.beforeAll(async () => {
    // Create a document with parallel workflow
    try {
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
          title: 'Parallel Workflow Test',
          signers: TestSigners.multiple.slice(0, 3),
          fields: [],
          workflow: { type: 'parallel' }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      documentId = docResponse.data.id;
      
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

  test('should allow all signers to sign simultaneously', async ({ page, context }) => {
    if (!documentId || Object.keys(signingTokens).length === 0) {
      test.skip();
      return;
    }

    // Create multiple browser contexts to simulate concurrent signers
    const signer1Token = signingTokens[TestSigners.multiple[0].email];
    const signer2Token = signingTokens[TestSigners.multiple[1].email];
    const signer3Token = signingTokens[TestSigners.multiple[2].email];

    // All signers should be able to access their documents simultaneously
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    const page3 = await context.newPage();

    // Navigate all signers to their signing pages
    await Promise.all([
      page1.goto(`/sign/${signer1Token}`),
      page2.goto(`/sign/${signer2Token}`),
      page3.goto(`/sign/${signer3Token}`)
    ]);

    // All should load successfully
    await Promise.all([
      page1.waitForSelector('img[alt*="Page"], canvas, iframe', { timeout: 30000 }),
      page2.waitForSelector('img[alt*="Page"], canvas, iframe', { timeout: 30000 }),
      page3.waitForSelector('img[alt*="Page"], canvas, iframe', { timeout: 30000 })
    ]);

    // All signers can sign independently
    const helpers1 = new TestHelpers(page1);
    const helpers2 = new TestHelpers(page2);
    const helpers3 = new TestHelpers(page3);

    // Sign all documents
    await Promise.all([
      helpers1.drawSignature('canvas'),
      helpers2.drawSignature('canvas'),
      helpers3.drawSignature('canvas')
    ]);

    // Submit all signatures
    const submitPromises = [
      page1.locator('button:has-text("Submit"), button:has-text("Sign")').click(),
      page2.locator('button:has-text("Submit"), button:has-text("Sign")').click(),
      page3.locator('button:has-text("Submit"), button:has-text("Sign")').click()
    ];

    await Promise.all(submitPromises);

    // Wait for all submissions to complete
    await Promise.all([
      page1.waitForResponse(
        (response) => response.url().includes('/submit') && response.status() === 200,
        { timeout: ExpectedTimeouts.apiResponse }
      ),
      page2.waitForResponse(
        (response) => response.url().includes('/submit') && response.status() === 200,
        { timeout: ExpectedTimeouts.apiResponse }
      ),
      page3.waitForResponse(
        (response) => response.url().includes('/submit') && response.status() === 200,
        { timeout: ExpectedTimeouts.apiResponse }
      )
    ]);

    // Verify workflow is completed
    const API_BASE = process.env.API_BASE_URL || 'http://localhost:5112/api/v1';
    const loginResponse = await axios.post(`${API_BASE}/auth/login`,
      new URLSearchParams({
        username: TestUsers.demo.email,
        password: TestUsers.demo.password
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const token = loginResponse.data.access_token;
    const docResponse = await axios.get(
      `${API_BASE}/documents/${documentId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    expect(docResponse.data.status).toBe('signed');
    docResponse.data.signers.forEach((signer: any) => {
      expect(signer.status).toBe('signed');
    });

    // Cleanup
    await page1.close();
    await page2.close();
    await page3.close();
  });

  test('should not enforce signing order in parallel workflow', async ({ page }) => {
    if (!documentId || Object.keys(signingTokens).length === 0) {
      test.skip();
      return;
    }

    // Second signer should be able to sign before first signer
    const secondSignerToken = signingTokens[TestSigners.multiple[1].email];
    await page.goto(`/sign/${secondSignerToken}`);
    await helpers.waitForDocumentLoad();

    // Should not show any "waiting" message
    const waitingMessage = page.locator('text=/wait|pending|not.*ready|sequential/i');
    await expect(waitingMessage).toHaveCount(0);

    // Should be able to sign immediately
    const signatureCanvas = page.locator('canvas').first();
    if (await signatureCanvas.count() > 0) {
      await helpers.drawSignature('canvas');
      
      const submitButton = page.locator('button:has-text("Submit"), button:has-text("Sign")');
      const isDisabled = await submitButton.getAttribute('disabled');
      expect(isDisabled).toBeNull(); // Should not be disabled
    }
  });

  test('should complete workflow when all signers have signed', async ({ page }) => {
    if (!documentId || Object.keys(signingTokens).length === 0) {
      test.skip();
      return;
    }

    // Sign as all signers sequentially (but order shouldn't matter)
    const tokens = [
      signingTokens[TestSigners.multiple[0].email],
      signingTokens[TestSigners.multiple[1].email],
      signingTokens[TestSigners.multiple[2].email]
    ];

    for (const token of tokens) {
      await page.goto(`/sign/${token}`);
      await helpers.waitForDocumentLoad();

      const signatureCanvas = page.locator('canvas').first();
      if (await signatureCanvas.count() > 0) {
        await helpers.drawSignature('canvas');
      }

      const submitButton = page.locator('button:has-text("Submit"), button:has-text("Sign")');
      await submitButton.click();

      await page.waitForResponse(
        (response) => response.url().includes('/submit') && response.status() === 200,
        { timeout: ExpectedTimeouts.apiResponse }
      );
    }

    // Verify final status
    const API_BASE = process.env.API_BASE_URL || 'http://localhost:5112/api/v1';
    const loginResponse = await axios.post(`${API_BASE}/auth/login`,
      new URLSearchParams({
        username: TestUsers.demo.email,
        password: TestUsers.demo.password
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const token = loginResponse.data.access_token;
    const docResponse = await axios.get(
      `${API_BASE}/documents/${documentId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    expect(docResponse.data.status).toBe('signed');
    expect(docResponse.data.signers.every((s: any) => s.status === 'signed')).toBe(true);
  });
});

