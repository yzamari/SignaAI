import { EventEmitter } from 'events';
import { Notification } from '../models/Notification';
import { INotificationQueue } from '../interfaces/INotificationService';
import { NotificationPriority, QueueItem, RetryStrategy } from '../interfaces/types';

/**
 * Priority-based notification queue with retry logic
 * Implements Producer-Consumer pattern with multiple priority levels
 * Follows Single Responsibility Principle - manages queue operations only
 */
export class NotificationQueue extends EventEmitter implements INotificationQueue {
  private queues: Map<NotificationPriority, QueueItem[]> = new Map();
  private processing: Map<string, QueueItem> = new Map();
  private completed: QueueItem[] = [];
  private failed: QueueItem[] = [];
  private retryStrategy: RetryStrategy;
  private logger: any;
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timer | null = null;
  private maxQueueSize: number;
  private batchSize: number;

  constructor(
    retryStrategy: RetryStrategy,
    maxQueueSize: number = 10000,
    batchSize: number = 10,
    logger?: any
  ) {
    super();
    this.retryStrategy = retryStrategy;
    this.maxQueueSize = maxQueueSize;
    this.batchSize = batchSize;
    this.logger = logger || console;
    this.initializeQueues();
  }

  /**
   * Initialize priority queues
   */
  private initializeQueues(): void {
    // Initialize queues for each priority level
    Object.values(NotificationPriority).forEach(priority => {
      this.queues.set(priority, []);
    });

    this.logger.info('Notification queue initialized with priority levels:', Object.values(NotificationPriority));
  }

  /**
   * Add notification to queue with priority
   */
  async enqueue(
    notification: Notification,
    priority: NotificationPriority,
    delay: number = 0
  ): Promise<string> {
    const totalQueueSize = this.getTotalQueueSize();
    
    if (totalQueueSize >= this.maxQueueSize) {
      throw new Error(`Queue is full. Maximum size: ${this.maxQueueSize}`);
    }

    const queueItem: QueueItem = {
      notification,
      priority,
      scheduledFor: delay > 0 ? new Date(Date.now() + delay) : notification.scheduledFor,
      attempts: 0,
      lastError: undefined
    };

    const priorityQueue = this.queues.get(priority);
    if (!priorityQueue) {
      throw new Error(`Invalid priority: ${priority}`);
    }

    // Insert in sorted order by scheduled time (earliest first)
    this.insertSorted(priorityQueue, queueItem);

    this.logger.info(`Notification queued:`, {
      notificationId: notification.id,
      priority,
      queueSize: priorityQueue.length,
      totalQueueSize: totalQueueSize + 1,
      scheduledFor: queueItem.scheduledFor?.toISOString()
    });

    // Emit event for queue statistics
    this.emit('itemQueued', queueItem);

    // Start processing if not already running
    if (!this.isProcessing) {
      this.startProcessing();
    }

    return notification.id;
  }

  /**
   * Remove notification from queue
   */
  async dequeue(queueItemId: string): Promise<boolean> {
    // Check if item is currently processing
    if (this.processing.has(queueItemId)) {
      this.processing.delete(queueItemId);
      this.logger.info(`Removed processing notification: ${queueItemId}`);
      return true;
    }

    // Check in priority queues
    for (const [priority, queue] of this.queues.entries()) {
      const index = queue.findIndex(item => item.notification.id === queueItemId);
      if (index !== -1) {
        queue.splice(index, 1);
        this.logger.info(`Removed queued notification: ${queueItemId} from ${priority} queue`);
        this.emit('itemDequeued', queueItemId);
        return true;
      }
    }

    return false;
  }

  /**
   * Get next batch of notifications to process
   * Respects priority ordering and scheduled times
   */
  async getNextBatch(batchSize: number = this.batchSize): Promise<Notification[]> {
    const batch: Notification[] = [];
    const now = new Date();

    // Process queues in priority order
    const priorityOrder = [
      NotificationPriority.URGENT,
      NotificationPriority.HIGH,
      NotificationPriority.NORMAL,
      NotificationPriority.LOW
    ];

    for (const priority of priorityOrder) {
      if (batch.length >= batchSize) break;

      const queue = this.queues.get(priority);
      if (!queue || queue.length === 0) continue;

      // Get ready items from this priority queue
      while (queue.length > 0 && batch.length < batchSize) {
        const item = queue[0];
        
        // Check if scheduled time has arrived
        if (item.scheduledFor && item.scheduledFor > now) {
          break; // Items are sorted by time, so stop here
        }

        // Remove from queue and add to processing
        queue.shift();
        this.processing.set(item.notification.id, item);
        batch.push(item.notification);

        this.logger.debug(`Added to batch:`, {
          notificationId: item.notification.id,
          priority: item.priority,
          attempt: item.attempts + 1
        });
      }
    }

    if (batch.length > 0) {
      this.logger.info(`Retrieved batch of ${batch.length} notifications for processing`);
      this.emit('batchRetrieved', batch.length);
    }

    return batch;
  }

  /**
   * Mark notification as currently being processed
   */
  async markAsProcessing(notificationId: string): Promise<boolean> {
    const item = this.processing.get(notificationId);
    if (!item) {
      return false;
    }

    item.attempts++;
    this.logger.debug(`Marked as processing: ${notificationId}, attempt: ${item.attempts}`);
    return true;
  }

  /**
   * Mark notification as completed (success or failure)
   */
  async markAsCompleted(
    notificationId: string,
    success: boolean,
    error?: string
  ): Promise<boolean> {
    const item = this.processing.get(notificationId);
    if (!item) {
      this.logger.warn(`Attempted to mark non-processing notification as completed: ${notificationId}`);
      return false;
    }

    // Remove from processing
    this.processing.delete(notificationId);

    if (success) {
      // Mark notification as delivered
      item.notification.markAsDelivered();
      this.completed.push(item);
      
      this.logger.info(`Notification completed successfully:`, {
        notificationId,
        attempts: item.attempts,
        priority: item.priority
      });

      this.emit('notificationCompleted', item);
    } else {
      // Handle failure
      item.lastError = error || 'Unknown error';
      item.notification.markAsFailed(item.lastError);

      // Check if retry is possible
      if (this.retryStrategy.shouldRetry(new Error(item.lastError), item.attempts)) {
        await this.scheduleRetry(item);
      } else {
        // Max retries exceeded
        this.failed.push(item);
        this.logger.error(`Notification failed permanently:`, {
          notificationId,
          attempts: item.attempts,
          error: item.lastError,
          priority: item.priority
        });

        this.emit('notificationFailed', item);
      }
    }

    return true;
  }

  /**
   * Schedule notification for retry with exponential backoff
   */
  private async scheduleRetry(item: QueueItem): Promise<void> {
    const delay = this.retryStrategy.getNextDelay(item.attempts);
    const retryTime = new Date(Date.now() + delay);
    
    // Create retry notification
    const retryNotification = item.notification.createRetryNotification();
    
    const retryItem: QueueItem = {
      notification: retryNotification,
      priority: item.priority,
      scheduledFor: retryTime,
      attempts: item.attempts,
      lastError: item.lastError
    };

    // Add back to appropriate priority queue
    const priorityQueue = this.queues.get(item.priority);
    if (priorityQueue) {
      this.insertSorted(priorityQueue, retryItem);
      
      this.logger.info(`Notification scheduled for retry:`, {
        notificationId: item.notification.id,
        attempts: item.attempts,
        retryAt: retryTime.toISOString(),
        delay: `${delay}ms`
      });

      this.emit('notificationRetryScheduled', retryItem);
    }
  }

  /**
   * Insert item in queue maintaining sorted order by scheduled time
   */
  private insertSorted(queue: QueueItem[], item: QueueItem): void {
    if (!item.scheduledFor) {
      // If no scheduled time, add to beginning (immediate processing)
      queue.unshift(item);
      return;
    }

    // Find insertion point to maintain sorted order
    let insertIndex = queue.length;
    for (let i = 0; i < queue.length; i++) {
      if (!queue[i].scheduledFor || queue[i].scheduledFor! > item.scheduledFor) {
        insertIndex = i;
        break;
      }
    }

    queue.splice(insertIndex, 0, item);
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    const pending = this.getTotalQueueSize();
    
    return {
      pending,
      processing: this.processing.size,
      completed: this.completed.length,
      failed: this.failed.length
    };
  }

  /**
   * Get detailed queue statistics by priority
   */
  getDetailedStats(): {
    byPriority: Record<NotificationPriority, number>;
    processing: number;
    completed: number;
    failed: number;
    totalPending: number;
  } {
    const byPriority: Record<NotificationPriority, number> = {} as any;
    
    for (const [priority, queue] of this.queues.entries()) {
      byPriority[priority] = queue.length;
    }

    return {
      byPriority,
      processing: this.processing.size,
      completed: this.completed.length,
      failed: this.failed.length,
      totalPending: this.getTotalQueueSize()
    };
  }

  /**
   * Clear failed notifications from queue
   */
  async clearFailed(olderThan?: Date): Promise<number> {
    const initialCount = this.failed.length;
    
    if (olderThan) {
      this.failed = this.failed.filter(item => 
        item.notification.createdAt > olderThan
      );
    } else {
      this.failed = [];
    }

    const clearedCount = initialCount - this.failed.length;
    
    if (clearedCount > 0) {
      this.logger.info(`Cleared ${clearedCount} failed notifications from queue`);
      this.emit('failedNotificationsCleared', clearedCount);
    }

    return clearedCount;
  }

  /**
   * Start automatic queue processing
   */
  startProcessing(intervalMs: number = 1000): void {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.processingInterval = setInterval(async () => {
      try {
        const batch = await this.getNextBatch();
        if (batch.length > 0) {
          this.emit('batchReady', batch);
        }
      } catch (error) {
        this.logger.error('Error during queue processing:', error);
      }
    }, intervalMs);

    this.logger.info(`Queue processing started with ${intervalMs}ms interval`);
  }

  /**
   * Stop automatic queue processing
   */
  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    this.isProcessing = false;
    this.logger.info('Queue processing stopped');
  }

  /**
   * Get total number of items in all queues
   */
  private getTotalQueueSize(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  /**
   * Get notifications that are due for processing
   */
  getDueNotifications(): QueueItem[] {
    const now = new Date();
    const dueItems: QueueItem[] = [];

    for (const queue of this.queues.values()) {
      for (const item of queue) {
        if (!item.scheduledFor || item.scheduledFor <= now) {
          dueItems.push(item);
        } else {
          break; // Queue is sorted, so no more due items in this queue
        }
      }
    }

    return dueItems;
  }

  /**
   * Cleanup old completed and failed notifications
   */
  cleanup(maxAge: number = 24 * 60 * 60 * 1000): void {
    const cutoff = new Date(Date.now() - maxAge);
    
    const initialCompletedCount = this.completed.length;
    this.completed = this.completed.filter(item => 
      item.notification.createdAt > cutoff
    );

    const initialFailedCount = this.failed.length;
    this.failed = this.failed.filter(item => 
      item.notification.createdAt > cutoff
    );

    const cleanedCompleted = initialCompletedCount - this.completed.length;
    const cleanedFailed = initialFailedCount - this.failed.length;

    if (cleanedCompleted > 0 || cleanedFailed > 0) {
      this.logger.info(`Queue cleanup completed:`, {
        completedCleaned: cleanedCompleted,
        failedCleaned: cleanedFailed,
        maxAge: `${maxAge}ms`
      });
    }
  }

  /**
   * Shutdown queue and cleanup resources
   */
  async shutdown(): Promise<void> {
    this.stopProcessing();
    
    // Wait for any ongoing processing to complete
    if (this.processing.size > 0) {
      this.logger.info(`Waiting for ${this.processing.size} notifications to complete processing...`);
      // In production, you might want to implement a graceful shutdown timeout
    }

    this.removeAllListeners();
    this.logger.info('Notification queue shut down');
  }
}