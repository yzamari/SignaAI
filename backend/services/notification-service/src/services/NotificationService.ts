import { EventEmitter } from 'events';
import { INotificationService, INotificationQueue } from '../interfaces/INotificationService';
import { INotificationChannel } from '../interfaces/INotificationChannel';
import { INotificationSubject, INotificationObserver } from '../interfaces/INotificationObserver';
import { Notification } from '../models/Notification';
import { NotificationTemplate } from '../models/NotificationTemplate';
import { NotificationChannel, NotificationPriority, NotificationMetrics, NotificationStatus } from '../interfaces/types';
import { NotificationChannelFactory } from './ChannelFactory';
import { NotificationQueue } from '../queues/NotificationQueue';
import { RetryStrategyFactory } from '../utils/RetryStrategies';
import { NotificationRenderer, EmailRenderer, SmsRenderer, PushRenderer, WebSocketRenderer } from '../templates/NotificationRenderer';

/**
 * Main notification service implementing multiple design patterns
 * - Facade Pattern: Provides simplified interface to complex notification subsystem
 * - Observer Pattern: Notifies observers of notification events
 * - Strategy Pattern: Uses different channels for delivery
 * - Template Method Pattern: Follows consistent processing workflow
 */
export class NotificationService extends EventEmitter implements INotificationService, INotificationSubject {
  private channels: Map<NotificationChannel, INotificationChannel> = new Map();
  private queue: INotificationQueue;
  private observers: Map<string, INotificationObserver> = new Map();
  private renderers: Map<NotificationChannel, NotificationRenderer> = new Map();
  private templates: Map<string, NotificationTemplate> = new Map();
  private metrics: NotificationMetrics;
  private isProcessing: boolean = false;
  private logger: any;
  private processingInterval: NodeJS.Timer | null = null;

  constructor(
    channelConfigs: Record<string, any>,
    queueConfig: any = {},
    logger?: any
  ) {
    super();
    this.logger = logger || console;
    this.initializeMetrics();
    this.initializeChannels(channelConfigs);
    this.initializeQueue(queueConfig);
    this.initializeRenderers();
    this.startProcessing();

    this.logger.info('Notification service initialized successfully');
  }

  /**
   * Initialize notification metrics
   */
  private initializeMetrics(): void {
    this.metrics = {
      sent: 0,
      delivered: 0,
      failed: 0,
      pending: 0,
      retrying: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
      channelMetrics: {}
    };

    // Initialize channel-specific metrics
    Object.values(NotificationChannel).forEach(channel => {
      this.metrics.channelMetrics[channel] = {
        sent: 0,
        delivered: 0,
        failed: 0,
        averageDeliveryTime: 0
      };
    });
  }

  /**
   * Initialize notification channels using factory
   */
  private initializeChannels(channelConfigs: Record<string, any>): void {
    try {
      const factory = new NotificationChannelFactory(this.logger);
      this.channels = factory.createChannelsFromConfig(channelConfigs);
      
      this.logger.info(`Initialized ${this.channels.size} notification channels:`, 
        Array.from(this.channels.keys())
      );
    } catch (error) {
      this.logger.error('Failed to initialize notification channels:', error);
      throw error;
    }
  }

  /**
   * Initialize notification queue with retry strategy
   */
  private initializeQueue(queueConfig: any): void {
    try {
      const retryStrategy = RetryStrategyFactory.createStrategy(
        queueConfig.retryStrategy || 'exponential',
        queueConfig.retryOptions || {},
        this.logger
      );

      this.queue = new NotificationQueue(
        retryStrategy,
        queueConfig.maxSize || 10000,
        queueConfig.batchSize || 10,
        this.logger
      );

      // Set up queue event listeners
      this.setupQueueEventListeners();

      this.logger.info('Notification queue initialized');
    } catch (error) {
      this.logger.error('Failed to initialize notification queue:', error);
      throw error;
    }
  }

  /**
   * Initialize notification renderers for each channel
   */
  private initializeRenderers(): void {
    this.renderers.set(NotificationChannel.EMAIL, new EmailRenderer(this.logger));
    this.renderers.set(NotificationChannel.SMS, new SmsRenderer(this.logger));
    this.renderers.set(NotificationChannel.PUSH, new PushRenderer(this.logger));
    this.renderers.set(NotificationChannel.WEBSOCKET, new WebSocketRenderer(this.logger));

    this.logger.info('Notification renderers initialized');
  }

  /**
   * Set up event listeners for queue events
   */
  private setupQueueEventListeners(): void {
    this.queue.on('batchReady', async (notifications: Notification[]) => {
      await this.processBatch(notifications);
    });

    this.queue.on('notificationCompleted', (queueItem: any) => {
      this.updateMetrics(queueItem.notification, true);
    });

    this.queue.on('notificationFailed', (queueItem: any) => {
      this.updateMetrics(queueItem.notification, false);
    });
  }

  /**
   * Send a single notification
   */
  async sendNotification(notification: Notification): Promise<string> {
    try {
      this.validateNotification(notification);
      
      // Render template if templateId is provided
      if (notification.templateId) {
        await this.renderNotificationTemplate(notification);
      }

      // Add to queue for processing
      await this.queue.enqueue(notification, notification.priority);
      
      this.logger.info(`Notification queued for sending:`, {
        notificationId: notification.id,
        userId: notification.userId,
        channel: notification.channel,
        priority: notification.priority
      });

      // Notify observers
      await this.notifyObservers(notification, NotificationStatus.PENDING, NotificationStatus.PENDING);

      return notification.id;

    } catch (error) {
      this.logger.error(`Failed to send notification:`, {
        notificationId: notification.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Send multiple notifications
   */
  async sendBatchNotifications(notifications: Notification[]): Promise<string[]> {
    const results: string[] = [];
    const errors: Error[] = [];

    for (const notification of notifications) {
      try {
        const id = await this.sendNotification(notification);
        results.push(id);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    if (errors.length > 0) {
      this.logger.warn(`Batch sending completed with ${errors.length} errors out of ${notifications.length} notifications`);
    }

    return results;
  }

  /**
   * Create and send notification from template
   */
  async sendFromTemplate(
    userId: string,
    templateId: string,
    data: Record<string, any>,
    channel: NotificationChannel,
    priority: NotificationPriority = NotificationPriority.NORMAL,
    scheduledFor?: Date
  ): Promise<string> {
    try {
      // Validate template exists
      const template = this.templates.get(templateId);
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      if (!template.isCompatibleWithChannel(channel)) {
        throw new Error(`Template ${templateId} is not compatible with channel ${channel}`);
      }

      // Create notification
      const notificationId = this.generateNotificationId();
      const notification = new Notification(
        notificationId,
        userId,
        'template',
        channel,
        priority,
        data,
        templateId,
        scheduledFor
      );

      return await this.sendNotification(notification);

    } catch (error) {
      this.logger.error(`Failed to send from template:`, {
        templateId,
        userId,
        channel,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Schedule notification for future delivery
   */
  async scheduleNotification(notification: Notification, scheduledFor: Date): Promise<string> {
    if (scheduledFor <= new Date()) {
      throw new Error('Scheduled time must be in the future');
    }

    // Create new notification with scheduled time
    const scheduledNotification = new Notification(
      notification.id,
      notification.userId,
      notification.type,
      notification.channel,
      notification.priority,
      notification.data,
      notification.templateId,
      scheduledFor
    );

    return await this.sendNotification(scheduledNotification);
  }

  /**
   * Cancel a pending notification
   */
  async cancelNotification(notificationId: string): Promise<boolean> {
    try {
      const cancelled = await this.queue.dequeue(notificationId);
      
      if (cancelled) {
        this.logger.info(`Notification cancelled: ${notificationId}`);
        this.emit('notificationCancelled', notificationId);
      }

      return cancelled;
    } catch (error) {
      this.logger.error(`Failed to cancel notification ${notificationId}:`, error);
      return false;
    }
  }

  /**
   * Get notification by ID
   */
  async getNotification(notificationId: string): Promise<Notification | null> {
    // In a real implementation, this would query a database
    // For now, return null as we don't have persistence
    this.logger.warn('getNotification not implemented - requires database integration');
    return null;
  }

  /**
   * Get notifications for a user
   */
  async getUserNotifications(userId: string, limit?: number, offset?: number): Promise<Notification[]> {
    // In a real implementation, this would query a database
    // For now, return empty array as we don't have persistence
    this.logger.warn('getUserNotifications not implemented - requires database integration');
    return [];
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<Record<string, any>> {
    const channelHealth: Record<string, boolean> = {};
    
    for (const [channelType, channel] of this.channels.entries()) {
      try {
        channelHealth[channelType] = await channel.isHealthy();
      } catch (error) {
        channelHealth[channelType] = false;
      }
    }

    const queueStats = await this.queue.getQueueStats();
    
    return {
      service: 'notification-service',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      channels: channelHealth,
      queue: queueStats,
      metrics: this.metrics,
      uptime: process.uptime()
    };
  }

  /**
   * Get service metrics
   */
  async getMetrics(): Promise<NotificationMetrics> {
    const queueStats = await this.queue.getQueueStats();
    
    return {
      ...this.metrics,
      pending: queueStats.pending,
      retrying: queueStats.processing
    };
  }

  /**
   * Process batch of notifications
   */
  private async processBatch(notifications: Notification[]): Promise<void> {
    const startTime = Date.now();
    
    this.logger.info(`Processing batch of ${notifications.length} notifications`);

    const processingPromises = notifications.map(async (notification) => {
      const notificationStartTime = Date.now();
      
      try {
        await this.queue.markAsProcessing(notification.id);
        
        const channel = this.channels.get(notification.channel);
        if (!channel) {
          throw new Error(`No channel available for ${notification.channel}`);
        }

        // Send notification
        const result = await channel.send(notification);
        
        if (result.success) {
          notification.markAsSent();
          if (result.messageId) {
            // In a real implementation, store message ID for tracking
          }
          
          await this.queue.markAsCompleted(notification.id, true);
          
          // Notify observers of success
          await this.notifyObservers(notification, NotificationStatus.PENDING, NotificationStatus.SENT);
          
        } else {
          throw new Error(result.error || 'Unknown delivery error');
        }

        const processingTime = Date.now() - notificationStartTime;
        this.updateChannelMetrics(notification.channel, true, processingTime);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        notification.markAsFailed(errorMessage);
        
        await this.queue.markAsCompleted(notification.id, false, errorMessage);
        
        // Notify observers of failure
        await this.notifyObservers(notification, NotificationStatus.PENDING, NotificationStatus.FAILED);
        
        const processingTime = Date.now() - notificationStartTime;
        this.updateChannelMetrics(notification.channel, false, processingTime);
        
        this.logger.error(`Failed to process notification ${notification.id}:`, errorMessage);
      }
    });

    await Promise.allSettled(processingPromises);
    
    const totalProcessingTime = Date.now() - startTime;
    this.metrics.totalProcessingTime += totalProcessingTime;
    
    this.logger.info(`Batch processing completed in ${totalProcessingTime}ms`);
  }

  /**
   * Start automatic notification processing
   */
  private startProcessing(): void {
    if (this.isProcessing) return;

    this.isProcessing = true;
    this.queue.startProcessing(1000); // Check every second
    
    this.logger.info('Notification processing started');
  }

  /**
   * Stop automatic notification processing
   */
  stopProcessing(): void {
    if (!this.isProcessing) return;

    this.isProcessing = false;
    this.queue.stopProcessing();

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    this.logger.info('Notification processing stopped');
  }

  /**
   * Validate notification before processing
   */
  private validateNotification(notification: Notification): void {
    if (!notification) {
      throw new Error('Notification is required');
    }

    if (!this.channels.has(notification.channel)) {
      throw new Error(`Unsupported channel: ${notification.channel}`);
    }

    const channel = this.channels.get(notification.channel);
    if (channel && !channel.canHandle(notification)) {
      throw new Error(`Channel ${notification.channel} cannot handle this notification`);
    }
  }

  /**
   * Render notification template
   */
  private async renderNotificationTemplate(notification: Notification): Promise<void> {
    if (!notification.templateId) return;

    const template = this.templates.get(notification.templateId);
    if (!template) {
      throw new Error(`Template not found: ${notification.templateId}`);
    }

    const renderer = this.renderers.get(notification.channel);
    if (!renderer) {
      throw new Error(`No renderer available for channel: ${notification.channel}`);
    }

    try {
      const rendered = await renderer.renderNotification(template, notification.data, notification);
      
      // Add rendered content to notification data
      notification.data.renderedContent = rendered;
      
      this.logger.debug(`Template rendered for notification ${notification.id}`);
    } catch (error) {
      this.logger.error(`Template rendering failed for notification ${notification.id}:`, error);
      throw error;
    }
  }

  /**
   * Update overall metrics
   */
  private updateMetrics(notification: Notification, success: boolean): void {
    if (success) {
      this.metrics.sent++;
      this.metrics.delivered++;
    } else {
      this.metrics.failed++;
    }

    // Update average processing time
    if (this.metrics.sent > 0) {
      this.metrics.averageProcessingTime = this.metrics.totalProcessingTime / this.metrics.sent;
    }
  }

  /**
   * Update channel-specific metrics
   */
  private updateChannelMetrics(channel: NotificationChannel, success: boolean, processingTime: number): void {
    const channelMetrics = this.metrics.channelMetrics[channel];
    if (!channelMetrics) return;

    if (success) {
      channelMetrics.sent++;
      channelMetrics.delivered++;
      
      // Update average delivery time
      const totalDeliveryTime = channelMetrics.averageDeliveryTime * (channelMetrics.delivered - 1) + processingTime;
      channelMetrics.averageDeliveryTime = totalDeliveryTime / channelMetrics.delivered;
    } else {
      channelMetrics.failed++;
    }
  }

  /**
   * Generate unique notification ID
   */
  private generateNotificationId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add template to service
   */
  addTemplate(template: NotificationTemplate): void {
    this.templates.set(template.id, template);
    this.logger.info(`Template added: ${template.id}`);
  }

  /**
   * Remove template from service
   */
  removeTemplate(templateId: string): boolean {
    const removed = this.templates.delete(templateId);
    if (removed) {
      this.logger.info(`Template removed: ${templateId}`);
    }
    return removed;
  }

  // Observer Pattern Implementation

  /**
   * Add observer to receive notifications
   */
  addObserver(observer: INotificationObserver): void {
    this.observers.set(observer.getObserverId(), observer);
    this.logger.info(`Observer added: ${observer.getObserverId()}`);
  }

  /**
   * Remove observer
   */
  removeObserver(observerId: string): void {
    const removed = this.observers.delete(observerId);
    if (removed) {
      this.logger.info(`Observer removed: ${observerId}`);
    }
  }

  /**
   * Notify all observers of status change
   */
  async notifyObservers(
    notification: Notification,
    oldStatus: NotificationStatus,
    newStatus: NotificationStatus
  ): Promise<void> {
    const observerPromises = Array.from(this.observers.values()).map(async (observer) => {
      try {
        await observer.onStatusChange(notification, oldStatus, newStatus);
      } catch (error) {
        this.logger.error(`Observer ${observer.getObserverId()} error:`, error);
      }
    });

    await Promise.allSettled(observerPromises);
  }

  /**
   * Get list of registered observer IDs
   */
  getObserverIds(): string[] {
    return Array.from(this.observers.keys());
  }

  /**
   * Shutdown service and cleanup resources
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down notification service...');
    
    this.stopProcessing();
    
    // Shutdown queue
    await this.queue.shutdown();
    
    // Shutdown channels
    for (const [channelType, channel] of this.channels.entries()) {
      try {
        if (typeof (channel as any).shutdown === 'function') {
          await (channel as any).shutdown();
        }
      } catch (error) {
        this.logger.error(`Error shutting down ${channelType} channel:`, error);
      }
    }
    
    // Clear observers
    this.observers.clear();
    
    // Remove all event listeners
    this.removeAllListeners();
    
    this.logger.info('Notification service shutdown complete');
  }
}