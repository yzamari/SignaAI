import * as nodemailer from 'nodemailer';
import { BaseChannel } from './BaseChannel';
import { IDeliveryConfirmationChannel } from '../interfaces/INotificationChannel';
import { Notification } from '../models/Notification';
import { DeliveryResult, NotificationChannel, EmailConfig } from '../interfaces/types';

/**
 * Email channel implementation using Strategy Pattern
 * Extends BaseChannel and implements IDeliveryConfirmationChannel
 * Follows Single Responsibility Principle - handles only email notifications
 */
export class EmailChannel extends BaseChannel implements IDeliveryConfirmationChannel {
  private transporter: nodemailer.Transporter | null = null;
  private emailConfig: EmailConfig;

  constructor(config: EmailConfig, logger?: any) {
    super(config, logger);
    this.emailConfig = config;
    this.initializeTransporter();
  }

  /**
   * Get channel type for this implementation
   */
  getChannelType(): NotificationChannel {
    return NotificationChannel.EMAIL;
  }

  /**
   * Initialize SMTP transporter
   * Follows Dependency Inversion Principle - depends on configuration abstraction
   */
  private async initializeTransporter(): Promise<void> {
    try {
      this.transporter = nodemailer.createTransporter({
        host: this.emailConfig.smtp.host,
        port: this.emailConfig.smtp.port,
        secure: this.emailConfig.smtp.secure,
        auth: {
          user: this.emailConfig.smtp.auth.user,
          pass: this.emailConfig.smtp.auth.pass
        },
        pool: true, // Use connection pooling
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 1000, // 1 second
        rateLimit: this.emailConfig.rateLimitPerMinute || 60
      });

      // Verify connection on initialization
      await this.transporter.verify();
      this.logger.info('Email transporter initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize email transporter:', error);
      throw new Error(`Email channel initialization failed: ${this.formatError(error)}`);
    }
  }

  /**
   * Concrete implementation of email sending
   * Implements the doSend method from BaseChannel
   */
  protected async doSend(notification: Notification): Promise<DeliveryResult> {
    if (!this.transporter) {
      throw new Error('Email transporter not initialized');
    }

    const recipientEmail = this.getUserEndpoint(notification);
    const emailContent = await this.prepareEmailContent(notification);

    const mailOptions = {
      from: {
        name: this.emailConfig.from.name,
        address: this.emailConfig.from.email
      },
      to: recipientEmail,
      subject: emailContent.subject || `Notification from ${this.emailConfig.from.name}`,
      text: emailContent.text,
      html: emailContent.html,
      headers: {
        'X-Notification-ID': notification.id,
        'X-User-ID': notification.userId,
        'X-Notification-Type': notification.type
      }
    };

    try {
      const result = await this.withTimeout(
        this.transporter.sendMail(mailOptions),
        this.emailConfig.timeout || 30000
      );

      return this.createDeliveryResult(
        true,
        result.messageId,
        undefined,
        {
          recipient: recipientEmail,
          envelope: result.envelope,
          response: result.response
        }
      );
    } catch (error) {
      throw new Error(this.formatError(error, 'Email sending failed'));
    }
  }

  /**
   * Prepare email content from notification data
   * Supports both plain text and HTML content
   */
  private async prepareEmailContent(notification: Notification): Promise<{
    subject?: string;
    text: string;
    html?: string;
  }> {
    const data = notification.data;
    
    // If notification has rendered content (from template), use it
    if (data.renderedContent) {
      return {
        subject: data.renderedContent.subject,
        text: this.stripHtml(data.renderedContent.body),
        html: data.renderedContent.body
      };
    }

    // Otherwise, create basic email content
    const subject = data.subject || `Notification: ${notification.type}`;
    const text = data.message || data.body || 'You have a new notification';
    
    // Create simple HTML version if not provided
    const html = data.html || `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>${subject}</h2>
        <p>${text.replace(/\n/g, '<br>')}</p>
        ${data.actionUrl ? `<p><a href="${data.actionUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Take Action</a></p>` : ''}
      </div>
    `;

    return { subject, text, html };
  }

  /**
   * Strip HTML tags for plain text version
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  }

  /**
   * Validate email-specific notification data
   */
  validateNotification(notification: Notification): void {
    super.validateNotification(notification);

    const recipientEmail = this.getUserEndpoint(notification);
    if (!this.isValidEmail(recipientEmail)) {
      throw new Error(`Invalid email address: ${recipientEmail}`);
    }

    // Validate required email data
    const data = notification.data;
    if (!data.renderedContent && !data.message && !data.body) {
      throw new Error('Email notification must have message, body, or renderedContent');
    }
  }

  /**
   * Get user email from notification data
   */
  protected getUserEndpoint(notification: Notification): string {
    const email = notification.data.email || notification.data.to || notification.data.recipient;
    if (!email) {
      throw new Error('Email address not found in notification data');
    }
    return email;
  }

  /**
   * Validate email address format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Enhanced health check for email channel
   */
  async isHealthy(): Promise<boolean> {
    if (!await super.isHealthy()) {
      return false;
    }

    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      this.logger.error('Email health check failed:', error);
      return false;
    }
  }

  /**
   * Validate email-specific configuration
   */
  protected validateConfig(): void {
    super.validateConfig();

    if (!this.emailConfig.smtp) {
      throw new Error('Email config must include SMTP settings');
    }

    const required = ['host', 'port', 'auth'];
    for (const field of required) {
      if (!(field in this.emailConfig.smtp)) {
        throw new Error(`Email SMTP config missing required field: ${field}`);
      }
    }

    if (!this.emailConfig.from || !this.emailConfig.from.email) {
      throw new Error('Email config must include from address');
    }

    if (!this.isValidEmail(this.emailConfig.from.email)) {
      throw new Error('Invalid from email address in configuration');
    }
  }

  /**
   * Check delivery status (implementation for IDeliveryConfirmationChannel)
   * Note: Basic SMTP doesn't provide delivery confirmations
   * This would need integration with email service providers like SendGrid, Mailgun, etc.
   */
  async checkDeliveryStatus(messageId: string): Promise<DeliveryResult> {
    // Basic implementation - SMTP doesn't provide delivery tracking
    // In production, this would integrate with email service provider APIs
    this.logger.warn('Email delivery status checking not implemented for basic SMTP');
    
    return this.createDeliveryResult(
      false,
      messageId,
      'Delivery status checking not available for SMTP',
      { feature: 'delivery-tracking', available: false }
    );
  }

  /**
   * Setup delivery callback (implementation for IDeliveryConfirmationChannel)
   */
  async setupDeliveryCallback(callbackUrl: string): Promise<void> {
    // Basic implementation - SMTP doesn't support webhooks
    // In production, this would configure webhooks with email service providers
    this.logger.warn('Email delivery callbacks not supported for basic SMTP');
    throw new Error('Delivery callbacks not available for SMTP transport');
  }

  /**
   * Enhanced rate limiting check for email
   */
  protected async isRateLimited(): Promise<boolean> {
    // In production, implement proper rate limiting
    // This could use Redis or in-memory cache to track send rates
    return false;
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
      this.logger.info('Email transporter closed');
    }
  }
}