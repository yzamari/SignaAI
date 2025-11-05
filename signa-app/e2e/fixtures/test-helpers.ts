import { Page, expect } from '@playwright/test';
import path from 'path';

export class TestHelpers {
  constructor(private page: Page) {}

  /**
   * Login as a test user
   */
  async login(email: string = 'demo@signaai.com', password: string = 'Demo123!') {
    await this.page.goto('/login');
    await this.page.fill('input[type="email"]', email);
    await this.page.fill('input[type="password"]', password);
    await this.page.click('button[type="submit"]');
    await this.page.waitForURL(/\/(dashboard|upload)/, { timeout: 10000 });
  }

  /**
   * Upload a PDF file
   */
  async uploadPDF(fileName: string = 'heskem.pdf') {
    const filePath = path.join(__dirname, '..', '..', '..', fileName);
    const fileInput = this.page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);
  }

  /**
   * Wait for OCR processing to complete
   */
  async waitForOCRProcessing(timeout: number = 120000) {
    // Wait for processing indicators to disappear
    await this.page.waitForSelector('text=/processing|detecting/i', { state: 'hidden', timeout });
    // Wait for image preview to appear
    await this.page.waitForSelector('img[alt*="Page"], img[src*="data:image"]', { timeout });
  }

  /**
   * Navigate through upload steps
   */
  async navigateToStep(stepNumber: number) {
    for (let i = 1; i < stepNumber; i++) {
      await this.page.click('button:has-text("Next")');
      await this.page.waitForTimeout(500);
    }
  }

  /**
   * Add a signer to the document
   */
  async addSigner(name: string, email: string, phone?: string) {
    const nameInput = this.page.locator('input[placeholder*="Name"], input[placeholder*="name"]').first();
    const emailInput = this.page.locator('input[type="email"], input[placeholder*="Email"], input[placeholder*="email"]').first();
    
    await nameInput.fill(name);
    await emailInput.fill(email);
    
    if (phone) {
      const phoneInput = this.page.locator('input[placeholder*="Phone"], input[type="tel"]').first();
      await phoneInput.fill(phone);
    }
  }

  /**
   * Draw a signature on the canvas
   */
  async drawSignature(canvasSelector: string = 'canvas') {
    const canvas = this.page.locator(canvasSelector).first();
    const box = await canvas.boundingBox();
    if (box) {
      // Draw a simple signature path
      await this.page.mouse.move(box.x + 50, box.y + 50);
      await this.page.mouse.down();
      await this.page.mouse.move(box.x + 150, box.y + 80);
      await this.page.mouse.move(box.x + 200, box.y + 60);
      await this.page.mouse.move(box.x + 250, box.y + 90);
      await this.page.mouse.up();
    }
  }

  /**
   * Wait for API response
   */
  async waitForAPIResponse(urlPattern: string | RegExp, timeout: number = 30000) {
    await this.page.waitForResponse(
      (response) => {
        const url = response.url();
        if (typeof urlPattern === 'string') {
          return url.includes(urlPattern);
        }
        return urlPattern.test(url);
      },
      { timeout }
    );
  }

  /**
   * Get auth token from localStorage
   */
  async getAuthToken(): Promise<string | null> {
    return await this.page.evaluate(() => localStorage.getItem('auth_token'));
  }

  /**
   * Set auth token in localStorage
   */
  async setAuthToken(token: string) {
    await this.page.evaluate((t) => localStorage.setItem('auth_token', t), token);
  }

  /**
   * Clear auth token
   */
  async clearAuth() {
    await this.page.evaluate(() => localStorage.removeItem('auth_token'));
  }

  /**
   * Wait for document to load
   */
  async waitForDocumentLoad() {
    await this.page.waitForSelector('img[alt*="Page"], canvas, iframe[src*=".pdf"]', { timeout: 120000 });
  }

  /**
   * Verify image-based preview (not PDF iframe)
   */
  async verifyImagePreview() {
    // Should NOT have PDF iframe
    const pdfIframe = this.page.locator('iframe[src*=".pdf"]');
    await expect(pdfIframe).toHaveCount(0);
    
    // Should have image viewer
    const imageViewer = this.page.locator('img[alt*="Page"], img[src*="data:image"]');
    await expect(imageViewer.first()).toBeVisible();
  }

  /**
   * Get document ID from API response
   */
  async getDocumentIdFromResponse(): Promise<string | null> {
    const response = await this.page.waitForResponse(
      (response) => response.url().includes('/documents/create') && response.status() === 200,
      { timeout: 30000 }
    );
    const data = await response.json();
    return data.id || data.document_id || null;
  }

  /**
   * Wait for SMS to be sent (check API call)
   */
  async waitForSMSSent(timeout: number = 10000) {
    // Check for SMS API call or success message
    await this.page.waitForSelector('text=/SMS.*sent|invitation.*sent/i', { timeout, state: 'visible' }).catch(() => {
      // If no UI message, check for API call
      return this.page.waitForResponse(
        (response) => response.url().includes('/documents/create') && response.status() === 200,
        { timeout }
      );
    });
  }
}

