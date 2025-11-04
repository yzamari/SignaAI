import { INotificationChannel } from '../interfaces/INotificationChannel';
import { Notification } from '../models/Notification';
import { DeliveryResult, NotificationChannel, ChannelConfig } from '../interfaces/types';

/**
 * Abstract base class for notification channels
 * Implements Template Method Pattern and provides common functionality
 * Follows Single Responsibility Principle - manages common channel behavior
 */
export abstract class BaseChannel implements INotificationChannel {
  protected config: ChannelConfig;
  protected logger: any; // Will be injected logger

  constructor(config: ChannelConfig, logger?: any) {
    this.config = config;
    this.logger = logger || console;
    this.validateConfig();
  }

  /**
   * Template method for sending notifications
   * Implements Template Method Pattern - defines algorithm skeleton
   */
  async send(notification: Notification): Promise<DeliveryResult> {
    const startTime = Date.now();
    
    try {
      // Pre-send validation and preparation
      this.validateNotification(notification);
      await this.preProcessNotification(notification);

      // Check if channel is healthy before sending
      if (!await this.isHealthy()) {
        throw new Error(`${this.getChannelType()} channel is not healthy`);
      }

      // Check rate limiting
      if (await this.isRateLimited()) {
        throw new Error(`Rate limit exceeded for ${this.getChannelType()} channel`);
      }

      // Actual sending implementation (abstract method)
      const result = await this.doSend(notification);

      // Post-send processing
      await this.postProcessNotification(notification, result);

      // Log success metrics
      const processingTime = Date.now() - startTime;
      this.logMetrics(true, processingTime);

      return result;

    } catch (error) {
      // Log failure metrics
      const processingTime = Date.now() - startTime;
      this.logMetrics(false, processingTime);

      this.logger.error(`Failed to send notification via ${this.getChannelType()}:`, {
        notificationId: notification.id,
        error: error instanceof Error ? error.message : String(error),
        processingTime
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Abstract method for channel-specific sending logic
   * Must be implemented by concrete channel classes
   */
  protected abstract doSend(notification: Notification): Promise<DeliveryResult>;

  /**
   * Get the channel type - must be implemented by concrete classes
   */
  abstract getChannelType(): NotificationChannel;

  /**
   * Validate notification for this channel
   * Can be overridden by concrete classes for channel-specific validation
   */
  validateNotification(notification: Notification): void {
    if (!notification) {
      throw new Error('Notification cannot be null or undefined');
    }

    if (notification.channel !== this.getChannelType()) {
      throw new Error(`Notification channel mismatch. Expected: ${this.getChannelType()}, Got: ${notification.channel}`);
    }

    if (!notification.isReadyToSend()) {
      throw new Error(`Notification ${notification.id} is not ready to send. Status: ${notification.status}`);
    }
  }

  /**
   * Check if this channel can handle the notification
   */
  canHandle(notification: Notification): boolean {
    return notification.channel === this.getChannelType() && this.config.enabled;
  }

  /**
   * Basic health check implementation
   * Can be overridden by concrete classes
   */
  async isHealthy(): Promise<boolean> {
    return this.config.enabled;
  }

  /**
   * Get channel configuration
   */
  getConfig(): Record<string, any> {
    return { ...this.config };
  }

  /**
   * Pre-processing hook for notifications
   * Can be overridden by concrete classes
   */
  protected async preProcessNotification(notification: Notification): Promise<void> {
    // Default implementation - no pre-processing
  }

  /**
   * Post-processing hook for notifications
   * Can be overridden by concrete classes
   */
  protected async postProcessNotification(notification: Notification, result: DeliveryResult): Promise<void> {
    // Default implementation - no post-processing
  }

  /**
   * Validate channel configuration
   * Can be overridden by concrete classes
   */
  protected validateConfig(): void {
    if (typeof this.config.enabled !== 'boolean') {
      throw new Error('Channel config must specify enabled as boolean');
    }
  }

  /**
   * Check if channel is rate limited
   * Basic implementation - can be overridden for more sophisticated rate limiting
   */
  protected async isRateLimited(): Promise<boolean> {
    // Basic implementation - always false
    // Concrete classes can implement actual rate limiting logic
    return false;
  }

  /**
   * Log metrics for monitoring
   */
  protected logMetrics(success: boolean, processingTime: number): void {
    this.logger.info(`${this.getChannelType()} channel metrics:`, {
      channel: this.getChannelType(),
      success,
      processingTime,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get user endpoint for this channel from notification data
   * Must be implemented by concrete classes
   */
  protected abstract getUserEndpoint(notification: Notification): string;

  /**
   * Format error messages consistently across channels
   */
  protected formatError(error: any, context?: string): string {
    const message = error instanceof Error ? error.message : String(error);
    return context ? `${context}: ${message}` : message;
  }

  /**
   * Create standardized delivery result
   */
  protected createDeliveryResult(
    success: boolean,
    messageId?: string,
    error?: string,
    metadata?: Record<string, any>
  ): DeliveryResult {
    return {
      success,
      messageId,
      error,
      metadata: {
        channel: this.getChannelType(),
        timestamp: new Date().toISOString(),
        ...metadata
      }
    };
  }

  /**
   * Timeout wrapper for operations
   */
  protected async withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number = this.config.timeout || 30000
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return Promise.race([operation, timeoutPromise]);
  }
}