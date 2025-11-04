import { BaseChannel } from './BaseChannel';
import { IBatchNotificationChannel } from '../interfaces/INotificationChannel';
import { Notification } from '../models/Notification';
import { DeliveryResult, NotificationChannel, SmsConfig } from '../interfaces/types';

/**
 * SMS channel implementation using Strategy Pattern
 * Extends BaseChannel and implements IBatchNotificationChannel
 * Currently uses mock implementation - can be extended for real SMS providers
 */
export class SmsChannel extends BaseChannel implements IBatchNotificationChannel {
  private smsConfig: SmsConfig;
  private mockDeliveryDelay: number = 1000; // Simulate network delay

  constructor(config: SmsConfig, logger?: any) {
    super(config, logger);
    this.smsConfig = config;
  }

  /**
   * Get channel type for this implementation
   */
  getChannelType(): NotificationChannel {
    return NotificationChannel.SMS;
  }

  /**
   * Concrete implementation of SMS sending
   * Currently mock implementation - replace with real SMS provider
   */
  protected async doSend(notification: Notification): Promise<DeliveryResult> {
    const phoneNumber = this.getUserEndpoint(notification);
    const message = this.prepareSmsContent(notification);

    // Simulate SMS sending based on provider type
    switch (this.smsConfig.provider) {
      case 'twilio':
        return this.sendViaTwilio(phoneNumber, message, notification);
      case 'aws-sns':
        return this.sendViaAwsSns(phoneNumber, message, notification);
      case 'mock':
      default:
        return this.sendViaMock(phoneNumber, message, notification);
    }
  }

  /**
   * Mock SMS sending implementation
   * Simulates real SMS provider behavior for development/testing
   */
  private async sendViaMock(
    phoneNumber: string,
    message: string,
    notification: Notification
  ): Promise<DeliveryResult> {
    this.logger.info(`[MOCK SMS] Sending to ${phoneNumber}: ${message}`);

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, this.mockDeliveryDelay));

    // Simulate occasional failures for testing
    const shouldFail = Math.random() < 0.1; // 10% failure rate
    if (shouldFail) {
      throw new Error('Mock SMS delivery failed - simulated network error');
    }

    const messageId = `mock_sms_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return this.createDeliveryResult(
      true,
      messageId,
      undefined,
      {
        recipient: phoneNumber,
        messageLength: message.length,
        provider: 'mock',
        cost: this.calculateMockCost(message),
        segments: this.calculateSmsSegments(message)
      }
    );
  }

  /**
   * Twilio SMS implementation placeholder
   * In production, integrate with Twilio SDK
   */
  private async sendViaTwilio(
    phoneNumber: string,
    message: string,
    notification: Notification
  ): Promise<DeliveryResult> {
    // TODO: Implement actual Twilio integration
    // const twilio = require('twilio');
    // const client = twilio(this.smsConfig.credentials.accountSid, this.smsConfig.credentials.authToken);
    
    this.logger.info(`[TWILIO PLACEHOLDER] Would send SMS to ${phoneNumber}`);
    
    // Simulate Twilio response
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return this.createDeliveryResult(
      true,
      `twilio_${Date.now()}`,
      undefined,
      {
        recipient: phoneNumber,
        provider: 'twilio',
        segments: this.calculateSmsSegments(message)
      }
    );
  }

  /**
   * AWS SNS implementation placeholder
   * In production, integrate with AWS SDK
   */
  private async sendViaAwsSns(
    phoneNumber: string,
    message: string,
    notification: Notification
  ): Promise<DeliveryResult> {
    // TODO: Implement actual AWS SNS integration
    // const AWS = require('aws-sdk');
    // const sns = new AWS.SNS(this.smsConfig.credentials);
    
    this.logger.info(`[AWS SNS PLACEHOLDER] Would send SMS to ${phoneNumber}`);
    
    // Simulate AWS SNS response
    await new Promise(resolve => setTimeout(resolve, 300));
    
    return this.createDeliveryResult(
      true,
      `sns_${Date.now()}`,
      undefined,
      {
        recipient: phoneNumber,
        provider: 'aws-sns',
        segments: this.calculateSmsSegments(message)
      }
    );
  }

  /**
   * Prepare SMS content from notification data
   * Ensures message fits SMS constraints
   */
  private prepareSmsContent(notification: Notification): string {
    const data = notification.data;
    
    // If notification has rendered content (from template), use it
    if (data.renderedContent && data.renderedContent.body) {
      return this.truncateForSms(data.renderedContent.body);
    }

    // Otherwise, create SMS content from data
    let message = data.message || data.body || `You have a new ${notification.type} notification`;
    
    // Add action URL if provided and message is short enough
    if (data.actionUrl && message.length < 100) {
      message += ` ${data.actionUrl}`;
    }

    return this.truncateForSms(message);
  }

  /**
   * Truncate message to fit SMS length limits
   */
  private truncateForSms(message: string, maxLength: number = 160): string {
    // Remove HTML tags if present
    const cleanMessage = message.replace(/<[^>]*>/g, '').trim();
    
    if (cleanMessage.length <= maxLength) {
      return cleanMessage;
    }

    // Truncate and add ellipsis
    return cleanMessage.substring(0, maxLength - 3) + '...';
  }

  /**
   * Calculate number of SMS segments
   */
  private calculateSmsSegments(message: string): number {
    const singleSmsLength = 160;
    const concatenatedSmsLength = 153; // Reduced due to concatenation headers

    if (message.length <= singleSmsLength) {
      return 1;
    }

    return Math.ceil(message.length / concatenatedSmsLength);
  }

  /**
   * Calculate mock SMS cost for testing
   */
  private calculateMockCost(message: string): number {
    const segments = this.calculateSmsSegments(message);
    const costPerSegment = 0.0075; // Mock cost in USD
    return segments * costPerSegment;
  }

  /**
   * Validate SMS-specific notification data
   */
  validateNotification(notification: Notification): void {
    super.validateNotification(notification);

    const phoneNumber = this.getUserEndpoint(notification);
    if (!this.isValidPhoneNumber(phoneNumber)) {
      throw new Error(`Invalid phone number: ${phoneNumber}`);
    }

    // Validate required SMS data
    const data = notification.data;
    if (!data.renderedContent && !data.message && !data.body) {
      throw new Error('SMS notification must have message, body, or renderedContent');
    }

    // Check message length
    const message = this.prepareSmsContent(notification);
    if (message.length === 0) {
      throw new Error('SMS message cannot be empty');
    }

    // Warn about long messages
    const segments = this.calculateSmsSegments(message);
    if (segments > 3) {
      this.logger.warn(`SMS message is ${segments} segments long, consider shortening`, {
        notificationId: notification.id,
        messageLength: message.length,
        segments
      });
    }
  }

  /**
   * Get user phone number from notification data
   */
  protected getUserEndpoint(notification: Notification): string {
    const phone = notification.data.phone || 
                  notification.data.phoneNumber || 
                  notification.data.to || 
                  notification.data.recipient;
    
    if (!phone) {
      throw new Error('Phone number not found in notification data');
    }
    
    return this.normalizePhoneNumber(phone);
  }

  /**
   * Validate phone number format
   */
  private isValidPhoneNumber(phone: string): boolean {
    // Basic E.164 format validation
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phone);
  }

  /**
   * Normalize phone number to E.164 format
   */
  private normalizePhoneNumber(phone: string): string {
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    
    // Add + prefix if not present
    if (!phone.startsWith('+')) {
      // Assume US number if no country code and 10 digits
      if (digits.length === 10) {
        return `+1${digits}`;
      }
      // Add + prefix for international numbers
      return `+${digits}`;
    }
    
    return phone;
  }

  /**
   * Validate SMS-specific configuration
   */
  protected validateConfig(): void {
    super.validateConfig();

    if (!this.smsConfig.provider) {
      throw new Error('SMS config must specify provider');
    }

    const validProviders = ['twilio', 'aws-sns', 'mock'];
    if (!validProviders.includes(this.smsConfig.provider)) {
      throw new Error(`Invalid SMS provider: ${this.smsConfig.provider}`);
    }

    if (this.smsConfig.provider !== 'mock' && !this.smsConfig.credentials) {
      throw new Error(`SMS credentials required for provider: ${this.smsConfig.provider}`);
    }
  }

  /**
   * Send multiple SMS notifications in batch
   * Implementation of IBatchNotificationChannel interface
   */
  async sendBatch(notifications: Notification[]): Promise<DeliveryResult[]> {
    const maxBatchSize = this.getMaxBatchSize();
    
    if (notifications.length > maxBatchSize) {
      throw new Error(`Batch size ${notifications.length} exceeds maximum ${maxBatchSize}`);
    }

    this.logger.info(`Sending SMS batch of ${notifications.length} notifications`);

    const results: DeliveryResult[] = [];
    
    // Process notifications in parallel with concurrency control
    const concurrency = Math.min(notifications.length, this.smsConfig.maxConcurrent || 5);
    const chunks = this.chunkArray(notifications, concurrency);

    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(
        chunk.map(notification => this.send(notification))
      );

      for (const result of chunkResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            success: false,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason)
          });
        }
      }
    }

    return results;
  }

  /**
   * Get maximum batch size for SMS
   */
  getMaxBatchSize(): number {
    // Different providers have different batch limits
    switch (this.smsConfig.provider) {
      case 'twilio':
        return 100;
      case 'aws-sns':
        return 100;
      case 'mock':
      default:
        return 50;
    }
  }

  /**
   * Utility method to chunk array for batch processing
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Enhanced health check for SMS channel
   */
  async isHealthy(): Promise<boolean> {
    if (!await super.isHealthy()) {
      return false;
    }

    try {
      // For mock provider, always healthy
      if (this.smsConfig.provider === 'mock') {
        return true;
      }

      // TODO: Implement actual health checks for real providers
      // For Twilio: check account status
      // For AWS SNS: check service availability
      
      return true;
    } catch (error) {
      this.logger.error('SMS health check failed:', error);
      return false;
    }
  }
}