import { NotificationStatus, NotificationPriority, NotificationChannel } from '../interfaces/types';

/**
 * Core domain model representing a notification entity
 * Follows Single Responsibility Principle - manages notification data and state
 */
export class Notification {
  private readonly _id: string;
  private readonly _userId: string;
  private readonly _type: string;
  private readonly _channel: NotificationChannel;
  private readonly _priority: NotificationPriority;
  private readonly _templateId?: string;
  private readonly _data: Record<string, any>;
  private readonly _createdAt: Date;
  private _status: NotificationStatus;
  private _deliveredAt?: Date;
  private _failureReason?: string;
  private _retryCount: number;
  private _scheduledFor?: Date;

  constructor(
    id: string,
    userId: string,
    type: string,
    channel: NotificationChannel,
    priority: NotificationPriority,
    data: Record<string, any>,
    templateId?: string,
    scheduledFor?: Date
  ) {
    this._id = id;
    this._userId = userId;
    this._type = type;
    this._channel = channel;
    this._priority = priority;
    this._templateId = templateId;
    this._data = { ...data }; // Defensive copy for encapsulation
    this._createdAt = new Date();
    this._status = NotificationStatus.PENDING;
    this._retryCount = 0;
    this._scheduledFor = scheduledFor;
  }

  // Getters following encapsulation principle
  get id(): string { return this._id; }
  get userId(): string { return this._userId; }
  get type(): string { return this._type; }
  get channel(): NotificationChannel { return this._channel; }
  get priority(): NotificationPriority { return this._priority; }
  get templateId(): string | undefined { return this._templateId; }
  get data(): Record<string, any> { return { ...this._data }; } // Return copy for immutability
  get status(): NotificationStatus { return this._status; }
  get createdAt(): Date { return this._createdAt; }
  get deliveredAt(): Date | undefined { return this._deliveredAt; }
  get failureReason(): string | undefined { return this._failureReason; }
  get retryCount(): number { return this._retryCount; }
  get scheduledFor(): Date | undefined { return this._scheduledFor; }

  /**
   * Mark notification as sent
   * Follows Open/Closed Principle - behavior can be extended without modification
   */
  markAsSent(): void {
    if (this._status !== NotificationStatus.PENDING && this._status !== NotificationStatus.RETRYING) {
      throw new Error(`Cannot mark notification as sent. Current status: ${this._status}`);
    }
    this._status = NotificationStatus.SENT;
    this._deliveredAt = new Date();
  }

  /**
   * Mark notification as delivered
   */
  markAsDelivered(): void {
    if (this._status !== NotificationStatus.SENT) {
      throw new Error(`Cannot mark notification as delivered. Current status: ${this._status}`);
    }
    this._status = NotificationStatus.DELIVERED;
  }

  /**
   * Mark notification as failed with reason
   */
  markAsFailed(reason: string): void {
    this._status = NotificationStatus.FAILED;
    this._failureReason = reason;
  }

  /**
   * Increment retry count and mark as retrying
   */
  incrementRetryCount(): void {
    this._retryCount++;
    this._status = NotificationStatus.RETRYING;
  }

  /**
   * Check if notification can be retried based on retry count
   */
  canRetry(maxRetries: number = 3): boolean {
    return this._retryCount < maxRetries && this._status === NotificationStatus.FAILED;
  }

  /**
   * Check if notification is ready to be sent
   */
  isReadyToSend(): boolean {
    if (this._scheduledFor && this._scheduledFor > new Date()) {
      return false;
    }
    return this._status === NotificationStatus.PENDING || this._status === NotificationStatus.RETRYING;
  }

  /**
   * Get notification metadata for logging and monitoring
   */
  getMetadata(): Record<string, any> {
    return {
      id: this._id,
      userId: this._userId,
      type: this._type,
      channel: this._channel,
      priority: this._priority,
      status: this._status,
      retryCount: this._retryCount,
      createdAt: this._createdAt,
      scheduledFor: this._scheduledFor
    };
  }

  /**
   * Create a copy of notification for retry with incremented count
   */
  createRetryNotification(): Notification {
    const retry = new Notification(
      this._id,
      this._userId,
      this._type,
      this._channel,
      this._priority,
      this._data,
      this._templateId,
      this._scheduledFor
    );
    retry._retryCount = this._retryCount + 1;
    retry._status = NotificationStatus.RETRYING;
    return retry;
  }
}