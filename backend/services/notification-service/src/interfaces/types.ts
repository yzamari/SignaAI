/**
 * Core types and enums for the notification service
 * Provides type safety and clear contracts following Interface Segregation Principle
 */

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  RETRYING = 'retrying',
  CANCELLED = 'cancelled'
}

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum NotificationChannel {
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
  WEBSOCKET = 'websocket',
  IN_APP = 'in_app'
}

export interface NotificationConfig {
  maxRetries: number;
  retryDelay: number;
  retryMultiplier: number;
  maxRetryDelay: number;
  queueBatchSize: number;
  processingInterval: number;
}

export interface DeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface ChannelConfig {
  enabled: boolean;
  rateLimitPerMinute?: number;
  maxConcurrent?: number;
  timeout?: number;
  retryConfig?: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
  };
}

export interface EmailConfig extends ChannelConfig {
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  from: {
    name: string;
    email: string;
  };
}

export interface SmsConfig extends ChannelConfig {
  provider: 'twilio' | 'aws-sns' | 'mock';
  credentials: Record<string, string>;
  fromNumber?: string;
}

export interface PushConfig extends ChannelConfig {
  fcm?: {
    serviceAccountKey: string;
  };
  apns?: {
    keyId: string;
    teamId: string;
    bundleId: string;
    privateKey: string;
  };
}

export interface WebSocketConfig extends ChannelConfig {
  port: number;
  namespace?: string;
}

export interface UserPreferences {
  userId: string;
  channels: {
    [key in NotificationChannel]?: {
      enabled: boolean;
      endpoint?: string; // Email address, phone number, device token, etc.
      quietHours?: {
        start: string; // HH:MM format
        end: string;   // HH:MM format
        timezone: string;
      };
    };
  };
  globallyEnabled: boolean;
  updatedAt: Date;
}

export interface NotificationMetrics {
  sent: number;
  delivered: number;
  failed: number;
  pending: number;
  retrying: number;
  totalProcessingTime: number;
  averageProcessingTime: number;
  channelMetrics: {
    [key in NotificationChannel]?: {
      sent: number;
      delivered: number;
      failed: number;
      averageDeliveryTime: number;
    };
  };
}

export interface QueueItem {
  notification: any; // Will be Notification class instance
  priority: NotificationPriority;
  scheduledFor?: Date;
  attempts: number;
  lastError?: string;
}

export interface RetryStrategy {
  shouldRetry(error: Error, attempts: number): boolean;
  getNextDelay(attempts: number): number;
  getMaxRetries(): number;
}