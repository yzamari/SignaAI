import { Notification } from '../models/Notification';
import { NotificationTemplate } from '../models/NotificationTemplate';
import { NotificationChannel, NotificationPriority, NotificationMetrics, UserPreferences } from './types';

/**
 * Main service interface following Dependency Inversion Principle
 * High-level modules depend on this abstraction, not concrete implementations
 */
export interface INotificationService {
  /**
   * Send a single notification
   * @param notification The notification to send
   * @returns Promise with notification ID
   */
  sendNotification(notification: Notification): Promise<string>;

  /**
   * Send multiple notifications
   * @param notifications Array of notifications to send
   * @returns Promise with array of notification IDs
   */
  sendBatchNotifications(notifications: Notification[]): Promise<string[]>;

  /**
   * Create and send a notification from template
   * @param userId Target user ID
   * @param templateId Template to use
   * @param data Data to fill template variables
   * @param channel Channel to send through
   * @param priority Notification priority
   * @param scheduledFor Optional scheduled time
   * @returns Promise with notification ID
   */
  sendFromTemplate(
    userId: string,
    templateId: string,
    data: Record<string, any>,
    channel: NotificationChannel,
    priority?: NotificationPriority,
    scheduledFor?: Date
  ): Promise<string>;

  /**
   * Schedule a notification for future delivery
   * @param notification The notification to schedule
   * @param scheduledFor When to send the notification
   * @returns Promise with notification ID
   */
  scheduleNotification(notification: Notification, scheduledFor: Date): Promise<string>;

  /**
   * Cancel a pending notification
   * @param notificationId ID of notification to cancel
   * @returns Promise indicating success
   */
  cancelNotification(notificationId: string): Promise<boolean>;

  /**
   * Get notification by ID
   * @param notificationId ID of notification to retrieve
   * @returns Promise with notification or null if not found
   */
  getNotification(notificationId: string): Promise<Notification | null>;

  /**
   * Get notifications for a user
   * @param userId User ID to get notifications for
   * @param limit Maximum number of notifications to return
   * @param offset Offset for pagination
   * @returns Promise with array of notifications
   */
  getUserNotifications(userId: string, limit?: number, offset?: number): Promise<Notification[]>;

  /**
   * Get service health status
   * @returns Promise with health check results
   */
  getHealthStatus(): Promise<Record<string, any>>;

  /**
   * Get service metrics
   * @returns Promise with notification metrics
   */
  getMetrics(): Promise<NotificationMetrics>;
}

/**
 * Template management interface
 * Follows Single Responsibility Principle
 */
export interface ITemplateService {
  /**
   * Create a new notification template
   * @param template The template to create
   * @returns Promise with created template ID
   */
  createTemplate(template: NotificationTemplate): Promise<string>;

  /**
   * Update an existing template
   * @param templateId ID of template to update
   * @param updates Partial template data to update
   * @returns Promise indicating success
   */
  updateTemplate(templateId: string, updates: Partial<NotificationTemplate>): Promise<boolean>;

  /**
   * Delete a template
   * @param templateId ID of template to delete
   * @returns Promise indicating success
   */
  deleteTemplate(templateId: string): Promise<boolean>;

  /**
   * Get template by ID
   * @param templateId ID of template to retrieve
   * @returns Promise with template or null if not found
   */
  getTemplate(templateId: string): Promise<NotificationTemplate | null>;

  /**
   * Get all templates for a channel
   * @param channel Channel to get templates for
   * @returns Promise with array of templates
   */
  getTemplatesByChannel(channel: NotificationChannel): Promise<NotificationTemplate[]>;

  /**
   * Render template with data
   * @param templateId ID of template to render
   * @param data Data to fill template variables
   * @returns Promise with rendered content
   */
  renderTemplate(templateId: string, data: Record<string, any>): Promise<{ subject?: string; body: string }>;

  /**
   * Validate template syntax and variables
   * @param template Template to validate
   * @returns Promise with validation result
   */
  validateTemplate(template: NotificationTemplate): Promise<{ valid: boolean; errors: string[] }>;
}

/**
 * User preferences management interface
 */
export interface IUserPreferencesService {
  /**
   * Get user notification preferences
   * @param userId User ID to get preferences for
   * @returns Promise with user preferences
   */
  getUserPreferences(userId: string): Promise<UserPreferences>;

  /**
   * Update user notification preferences
   * @param userId User ID to update preferences for
   * @param preferences New preferences
   * @returns Promise indicating success
   */
  updateUserPreferences(userId: string, preferences: Partial<UserPreferences>): Promise<boolean>;

  /**
   * Check if user has enabled notifications for a channel
   * @param userId User ID to check
   * @param channel Channel to check
   * @returns Promise with boolean result
   */
  isChannelEnabledForUser(userId: string, channel: NotificationChannel): Promise<boolean>;

  /**
   * Get user's endpoint for a channel (email, phone, device token, etc.)
   * @param userId User ID to get endpoint for
   * @param channel Channel to get endpoint for
   * @returns Promise with endpoint string or null
   */
  getUserChannelEndpoint(userId: string, channel: NotificationChannel): Promise<string | null>;

  /**
   * Check if user is in quiet hours
   * @param userId User ID to check
   * @returns Promise with boolean result
   */
  isInQuietHours(userId: string): Promise<boolean>;
}

/**
 * Queue management interface
 */
export interface INotificationQueue {
  /**
   * Add notification to queue
   * @param notification Notification to queue
   * @param priority Priority for queue processing
   * @param delay Optional delay before processing
   * @returns Promise with queue item ID
   */
  enqueue(notification: Notification, priority: NotificationPriority, delay?: number): Promise<string>;

  /**
   * Remove notification from queue
   * @param queueItemId Queue item ID to remove
   * @returns Promise indicating success
   */
  dequeue(queueItemId: string): Promise<boolean>;

  /**
   * Get next notifications to process
   * @param batchSize Maximum number of notifications to retrieve
   * @returns Promise with array of notifications
   */
  getNextBatch(batchSize: number): Promise<Notification[]>;

  /**
   * Mark notification as processing
   * @param notificationId Notification ID being processed
   * @returns Promise indicating success
   */
  markAsProcessing(notificationId: string): Promise<boolean>;

  /**
   * Mark notification as completed
   * @param notificationId Notification ID that completed
   * @param success Whether processing was successful
   * @param error Optional error message if failed
   * @returns Promise indicating success
   */
  markAsCompleted(notificationId: string, success: boolean, error?: string): Promise<boolean>;

  /**
   * Get queue statistics
   * @returns Promise with queue metrics
   */
  getQueueStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }>;

  /**
   * Clear failed notifications from queue
   * @param olderThan Optional date to clear notifications older than
   * @returns Promise with number of cleared notifications
   */
  clearFailed(olderThan?: Date): Promise<number>;
}