import { Notification } from '../models/Notification';
import { DeliveryResult, NotificationChannel } from './types';

/**
 * Strategy Pattern Interface for Notification Channels
 * Follows Interface Segregation Principle - defines only channel-specific behavior
 * Open/Closed Principle - new channels can be added without modifying existing code
 */
export interface INotificationChannel {
  /**
   * Get the channel type this implementation handles
   */
  getChannelType(): NotificationChannel;

  /**
   * Send notification through this channel
   * @param notification The notification to send
   * @returns Promise with delivery result
   */
  send(notification: Notification): Promise<DeliveryResult>;

  /**
   * Validate if the channel can handle this notification
   * @param notification The notification to validate
   * @returns true if channel can handle the notification
   */
  canHandle(notification: Notification): boolean;

  /**
   * Check if the channel is currently available/healthy
   * @returns true if channel is operational
   */
  isHealthy(): Promise<boolean>;

  /**
   * Get channel-specific configuration
   */
  getConfig(): Record<string, any>;

  /**
   * Validate notification data for this channel
   * @param notification The notification to validate
   * @throws Error if validation fails
   */
  validateNotification(notification: Notification): void;
}

/**
 * Extended interface for channels that support delivery confirmations
 * Follows Interface Segregation Principle - only channels that need it implement this
 */
export interface IDeliveryConfirmationChannel extends INotificationChannel {
  /**
   * Check delivery status of a sent notification
   * @param messageId The message ID returned from send operation
   * @returns Promise with current delivery status
   */
  checkDeliveryStatus(messageId: string): Promise<DeliveryResult>;

  /**
   * Set up webhook or callback for delivery confirmations
   * @param callbackUrl URL to receive delivery notifications
   */
  setupDeliveryCallback(callbackUrl: string): Promise<void>;
}

/**
 * Interface for channels that support batch operations
 * Follows Interface Segregation Principle
 */
export interface IBatchNotificationChannel extends INotificationChannel {
  /**
   * Send multiple notifications in a single batch
   * @param notifications Array of notifications to send
   * @returns Promise with array of delivery results
   */
  sendBatch(notifications: Notification[]): Promise<DeliveryResult[]>;

  /**
   * Get maximum batch size supported by this channel
   */
  getMaxBatchSize(): number;
}

/**
 * Interface for channels that support real-time communication
 */
export interface IRealTimeChannel extends INotificationChannel {
  /**
   * Establish connection with the client
   * @param userId User ID to connect
   * @param connectionId Unique connection identifier
   */
  connect(userId: string, connectionId: string): Promise<void>;

  /**
   * Disconnect from the client
   * @param connectionId Connection identifier to disconnect
   */
  disconnect(connectionId: string): Promise<void>;

  /**
   * Check if user is currently connected
   * @param userId User ID to check
   */
  isConnected(userId: string): boolean;

  /**
   * Get all active connections for a user
   * @param userId User ID to get connections for
   */
  getActiveConnections(userId: string): string[];
}