import { Notification } from '../models/Notification';
import { NotificationStatus } from './types';

/**
 * Observer Pattern Interface for Notification Events
 * Follows Interface Segregation Principle - different observers can implement only needed methods
 * Supports Dependency Inversion Principle - high-level modules depend on abstractions
 */
export interface INotificationObserver {
  /**
   * Called when a notification status changes
   * @param notification The notification that changed
   * @param oldStatus Previous status
   * @param newStatus New status
   */
  onStatusChange(notification: Notification, oldStatus: NotificationStatus, newStatus: NotificationStatus): Promise<void>;

  /**
   * Get unique identifier for this observer
   */
  getObserverId(): string;
}

/**
 * Extended observer interface for delivery tracking
 */
export interface IDeliveryObserver extends INotificationObserver {
  /**
   * Called when a notification is successfully delivered
   * @param notification The delivered notification
   * @param deliveryTime Time taken for delivery in milliseconds
   */
  onDeliverySuccess(notification: Notification, deliveryTime: number): Promise<void>;

  /**
   * Called when a notification delivery fails
   * @param notification The failed notification
   * @param error The error that caused the failure
   * @param willRetry Whether the notification will be retried
   */
  onDeliveryFailure(notification: Notification, error: Error, willRetry: boolean): Promise<void>;
}

/**
 * Observer interface for metrics collection
 */
export interface IMetricsObserver extends INotificationObserver {
  /**
   * Called to update delivery metrics
   * @param channelType The channel type
   * @param success Whether delivery was successful
   * @param processingTime Time taken to process in milliseconds
   */
  onMetricsUpdate(channelType: string, success: boolean, processingTime: number): Promise<void>;

  /**
   * Called to track retry attempts
   * @param notification The notification being retried
   * @param attemptNumber Current attempt number
   */
  onRetryAttempt(notification: Notification, attemptNumber: number): Promise<void>;
}

/**
 * Observer interface for logging and auditing
 */
export interface IAuditObserver extends INotificationObserver {
  /**
   * Log notification event for audit trail
   * @param event Event type
   * @param notification The notification involved
   * @param metadata Additional context data
   */
  onAuditEvent(event: string, notification: Notification, metadata?: Record<string, any>): Promise<void>;

  /**
   * Log security-related events
   * @param event Security event type
   * @param userId User involved in the event
   * @param details Event details
   */
  onSecurityEvent(event: string, userId: string, details: Record<string, any>): Promise<void>;
}

/**
 * Subject interface for the Observer pattern
 * Manages observer registration and notification
 */
export interface INotificationSubject {
  /**
   * Register an observer to receive notifications
   * @param observer The observer to register
   */
  addObserver(observer: INotificationObserver): void;

  /**
   * Remove an observer from notifications
   * @param observerId The ID of the observer to remove
   */
  removeObserver(observerId: string): void;

  /**
   * Notify all registered observers of a status change
   * @param notification The notification that changed
   * @param oldStatus Previous status
   * @param newStatus New status
   */
  notifyObservers(notification: Notification, oldStatus: NotificationStatus, newStatus: NotificationStatus): Promise<void>;

  /**
   * Get list of registered observer IDs
   */
  getObserverIds(): string[];
}

/**
 * Real-time notification observer for WebSocket connections
 */
export interface IRealTimeObserver extends INotificationObserver {
  /**
   * Handle real-time notification for connected users
   * @param notification The notification to broadcast
   * @param connectedUsers List of currently connected user IDs
   */
  onRealTimeNotification(notification: Notification, connectedUsers: string[]): Promise<void>;

  /**
   * Handle user connection events
   * @param userId User that connected/disconnected
   * @param connected Whether user connected (true) or disconnected (false)
   * @param connectionId Unique connection identifier
   */
  onUserConnectionChange(userId: string, connected: boolean, connectionId: string): Promise<void>;
}