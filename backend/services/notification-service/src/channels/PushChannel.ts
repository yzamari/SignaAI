import { BaseChannel } from './BaseChannel';
import { IBatchNotificationChannel } from '../interfaces/INotificationChannel';
import { Notification } from '../models/Notification';
import { DeliveryResult, NotificationChannel, PushConfig } from '../interfaces/types';

/**
 * Push notification channel implementation using Strategy Pattern
 * Extends BaseChannel and implements IBatchNotificationChannel
 * Supports both FCM (Android/Web) and APNS (iOS) push notifications
 */
export class PushChannel extends BaseChannel implements IBatchNotificationChannel {
  private pushConfig: PushConfig;
  private fcmClient: any = null; // Will hold FCM admin instance
  private apnsProvider: any = null; // Will hold APNS provider instance

  constructor(config: PushConfig, logger?: any) {
    super(config, logger);
    this.pushConfig = config;
    this.initializePushClients();
  }

  /**
   * Get channel type for this implementation
   */
  getChannelType(): NotificationChannel {
    return NotificationChannel.PUSH;
  }

  /**
   * Initialize push notification clients (FCM and APNS)
   */
  private async initializePushClients(): Promise<void> {
    try {
      // Initialize FCM if configured
      if (this.pushConfig.fcm && this.pushConfig.fcm.serviceAccountKey) {
        await this.initializeFcm();
      }

      // Initialize APNS if configured
      if (this.pushConfig.apns && this.pushConfig.apns.keyId) {
        await this.initializeApns();
      }

      if (!this.fcmClient && !this.apnsProvider) {
        throw new Error('No push notification providers configured');
      }

      this.logger.info('Push notification clients initialized', {
        fcm: !!this.fcmClient,
        apns: !!this.apnsProvider
      });

    } catch (error) {
      this.logger.error('Failed to initialize push clients:', error);
      throw new Error(`Push channel initialization failed: ${this.formatError(error)}`);
    }
  }

  /**
   * Initialize Firebase Cloud Messaging (FCM) client
   */
  private async initializeFcm(): Promise<void> {
    try {
      // TODO: In production, uncomment and configure FCM
      // const admin = require('firebase-admin');
      // const serviceAccount = JSON.parse(this.pushConfig.fcm!.serviceAccountKey);
      // 
      // this.fcmClient = admin.initializeApp({
      //   credential: admin.credential.cert(serviceAccount)
      // });

      this.logger.info('FCM client initialized (placeholder)');
    } catch (error) {
      throw new Error(`FCM initialization failed: ${this.formatError(error)}`);
    }
  }

  /**
   * Initialize Apple Push Notification Service (APNS) provider
   */
  private async initializeApns(): Promise<void> {
    try {
      // TODO: In production, uncomment and configure APNS
      // const apn = require('node-apn');
      // 
      // const apnsOptions = {
      //   token: {
      //     key: this.pushConfig.apns!.privateKey,
      //     keyId: this.pushConfig.apns!.keyId,
      //     teamId: this.pushConfig.apns!.teamId
      //   },
      //   production: process.env.NODE_ENV === 'production'
      // };
      // 
      // this.apnsProvider = new apn.Provider(apnsOptions);

      this.logger.info('APNS provider initialized (placeholder)');
    } catch (error) {
      throw new Error(`APNS initialization failed: ${this.formatError(error)}`);
    }
  }

  /**
   * Concrete implementation of push notification sending
   */
  protected async doSend(notification: Notification): Promise<DeliveryResult> {
    const deviceToken = this.getUserEndpoint(notification);
    const platform = this.detectPlatform(deviceToken, notification);
    const pushPayload = this.preparePushPayload(notification, platform);

    switch (platform) {
      case 'fcm':
        return this.sendViaFcm(deviceToken, pushPayload, notification);
      case 'apns':
        return this.sendViaApns(deviceToken, pushPayload, notification);
      default:
        throw new Error(`Unsupported push platform: ${platform}`);
    }
  }

  /**
   * Send notification via Firebase Cloud Messaging
   */
  private async sendViaFcm(
    deviceToken: string,
    payload: any,
    notification: Notification
  ): Promise<DeliveryResult> {
    if (!this.fcmClient) {
      // Mock implementation for development
      return this.mockFcmSend(deviceToken, payload, notification);
    }

    try {
      // TODO: Uncomment for actual FCM implementation
      // const message = {
      //   token: deviceToken,
      //   notification: {
      //     title: payload.title,
      //     body: payload.body,
      //     imageUrl: payload.imageUrl
      //   },
      //   data: payload.data,
      //   android: payload.android,
      //   webpush: payload.webpush
      // };
      // 
      // const response = await this.fcmClient.messaging().send(message);
      // 
      // return this.createDeliveryResult(
      //   true,
      //   response,
      //   undefined,
      //   {
      //     platform: 'fcm',
      //     deviceToken,
      //     provider: 'firebase'
      //   }
      // );

      // Mock response for now
      return this.mockFcmSend(deviceToken, payload, notification);

    } catch (error) {
      throw new Error(this.formatError(error, 'FCM send failed'));
    }
  }

  /**
   * Mock FCM send for development
   */
  private async mockFcmSend(
    deviceToken: string,
    payload: any,
    notification: Notification
  ): Promise<DeliveryResult> {
    this.logger.info(`[MOCK FCM] Sending push to ${deviceToken}:`, payload);

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Simulate occasional failures
    const shouldFail = Math.random() < 0.05; // 5% failure rate
    if (shouldFail) {
      throw new Error('Mock FCM delivery failed - simulated network error');
    }

    const messageId = `fcm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return this.createDeliveryResult(
      true,
      messageId,
      undefined,
      {
        platform: 'fcm',
        deviceToken,
        provider: 'mock',
        payload
      }
    );
  }

  /**
   * Send notification via Apple Push Notification Service
   */
  private async sendViaApns(
    deviceToken: string,
    payload: any,
    notification: Notification
  ): Promise<DeliveryResult> {
    if (!this.apnsProvider) {
      // Mock implementation for development
      return this.mockApnsSend(deviceToken, payload, notification);
    }

    try {
      // TODO: Uncomment for actual APNS implementation
      // const apnNotification = new apn.Notification();
      // apnNotification.alert = {
      //   title: payload.title,
      //   body: payload.body
      // };
      // apnNotification.badge = payload.badge;
      // apnNotification.sound = payload.sound || 'default';
      // apnNotification.payload = payload.data;
      // apnNotification.topic = this.pushConfig.apns!.bundleId;
      // 
      // const result = await this.apnsProvider.send(apnNotification, deviceToken);
      // 
      // if (result.failed && result.failed.length > 0) {
      //   throw new Error(`APNS send failed: ${result.failed[0].error}`);
      // }
      // 
      // return this.createDeliveryResult(
      //   true,
      //   result.sent[0].messageId,
      //   undefined,
      //   {
      //     platform: 'apns',
      //     deviceToken,
      //     provider: 'apple'
      //   }
      // );

      // Mock response for now
      return this.mockApnsSend(deviceToken, payload, notification);

    } catch (error) {
      throw new Error(this.formatError(error, 'APNS send failed'));
    }
  }

  /**
   * Mock APNS send for development
   */
  private async mockApnsSend(
    deviceToken: string,
    payload: any,
    notification: Notification
  ): Promise<DeliveryResult> {
    this.logger.info(`[MOCK APNS] Sending push to ${deviceToken}:`, payload);

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 400));

    // Simulate occasional failures
    const shouldFail = Math.random() < 0.03; // 3% failure rate
    if (shouldFail) {
      throw new Error('Mock APNS delivery failed - simulated network error');
    }

    const messageId = `apns_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return this.createDeliveryResult(
      true,
      messageId,
      undefined,
      {
        platform: 'apns',
        deviceToken,
        provider: 'mock',
        payload
      }
    );
  }

  /**
   * Detect platform based on device token and notification data
   */
  private detectPlatform(deviceToken: string, notification: Notification): 'fcm' | 'apns' {
    // Check if platform is explicitly specified in notification data
    const explicitPlatform = notification.data.platform;
    if (explicitPlatform === 'android' || explicitPlatform === 'web') {
      return 'fcm';
    }
    if (explicitPlatform === 'ios') {
      return 'apns';
    }

    // Detect based on token format
    // FCM tokens are typically longer and contain specific characters
    // APNS tokens are 64 hex characters for legacy or JWT format for newer
    if (deviceToken.length === 64 && /^[a-f0-9]+$/i.test(deviceToken)) {
      return 'apns'; // Legacy APNS token
    }

    // Default to FCM for longer tokens (likely FCM registration tokens)
    return 'fcm';
  }

  /**
   * Prepare push notification payload based on platform
   */
  private preparePushPayload(notification: Notification, platform: 'fcm' | 'apns'): any {
    const data = notification.data;
    const title = data.title || `New ${notification.type}`;
    const body = data.message || data.body || 'You have a new notification';

    const basePayload = {
      title,
      body,
      imageUrl: data.imageUrl,
      sound: data.sound || 'default',
      badge: data.badge || 1,
      data: {
        notificationId: notification.id,
        type: notification.type,
        userId: notification.userId,
        actionUrl: data.actionUrl,
        category: data.category,
        ...data.customData
      }
    };

    if (platform === 'fcm') {
      return {
        ...basePayload,
        android: {
          notification: {
            icon: data.icon || 'ic_notification',
            color: data.color || '#007bff',
            channelId: data.channelId || 'default',
            priority: this.mapPriorityToAndroid(notification.priority)
          },
          data: basePayload.data
        },
        webpush: {
          notification: {
            icon: data.icon || '/icon-192x192.png',
            badge: data.badge || '/badge-72x72.png',
            requireInteraction: notification.priority === 'urgent'
          }
        }
      };
    }

    // APNS payload
    return {
      ...basePayload,
      contentAvailable: data.contentAvailable || false,
      mutableContent: data.mutableContent || false,
      category: data.category,
      threadId: data.threadId
    };
  }

  /**
   * Map notification priority to Android priority levels
   */
  private mapPriorityToAndroid(priority: string): string {
    switch (priority) {
      case 'urgent':
        return 'high';
      case 'high':
        return 'high';
      case 'normal':
        return 'normal';
      case 'low':
        return 'low';
      default:
        return 'normal';
    }
  }

  /**
   * Validate push-specific notification data
   */
  validateNotification(notification: Notification): void {
    super.validateNotification(notification);

    const deviceToken = this.getUserEndpoint(notification);
    if (!this.isValidDeviceToken(deviceToken)) {
      throw new Error(`Invalid device token: ${deviceToken}`);
    }

    // Validate required push data
    const data = notification.data;
    if (!data.title && !data.message && !data.body) {
      throw new Error('Push notification must have title, message, or body');
    }

    // Validate payload size (approximate)
    const payloadSize = JSON.stringify(data).length;
    const maxSize = 4096; // 4KB limit for most push services
    if (payloadSize > maxSize) {
      this.logger.warn(`Push payload size (${payloadSize}) exceeds recommended limit (${maxSize})`, {
        notificationId: notification.id
      });
    }
  }

  /**
   * Get device token from notification data
   */
  protected getUserEndpoint(notification: Notification): string {
    const token = notification.data.deviceToken || 
                  notification.data.pushToken || 
                  notification.data.token ||
                  notification.data.to;
    
    if (!token) {
      throw new Error('Device token not found in notification data');
    }
    
    return token;
  }

  /**
   * Validate device token format
   */
  private isValidDeviceToken(token: string): boolean {
    if (!token || token.length < 10) {
      return false;
    }

    // Basic validation - tokens should be alphanumeric with some special chars
    const tokenRegex = /^[a-zA-Z0-9_:-]+$/;
    return tokenRegex.test(token);
  }

  /**
   * Send multiple push notifications in batch
   * Implementation of IBatchNotificationChannel interface
   */
  async sendBatch(notifications: Notification[]): Promise<DeliveryResult[]> {
    const maxBatchSize = this.getMaxBatchSize();
    
    if (notifications.length > maxBatchSize) {
      throw new Error(`Batch size ${notifications.length} exceeds maximum ${maxBatchSize}`);
    }

    this.logger.info(`Sending push batch of ${notifications.length} notifications`);

    // Group notifications by platform for efficient batch sending
    const fcmNotifications = notifications.filter(n => 
      this.detectPlatform(this.getUserEndpoint(n), n) === 'fcm'
    );
    const apnsNotifications = notifications.filter(n => 
      this.detectPlatform(this.getUserEndpoint(n), n) === 'apns'
    );

    const results: DeliveryResult[] = [];

    // Send FCM batch
    if (fcmNotifications.length > 0) {
      const fcmResults = await this.sendFcmBatch(fcmNotifications);
      results.push(...fcmResults);
    }

    // Send APNS batch
    if (apnsNotifications.length > 0) {
      const apnsResults = await this.sendApnsBatch(apnsNotifications);
      results.push(...apnsResults);
    }

    return results;
  }

  /**
   * Send batch of FCM notifications
   */
  private async sendFcmBatch(notifications: Notification[]): Promise<DeliveryResult[]> {
    // For now, send individually - in production, use FCM's batch API
    const results = await Promise.allSettled(
      notifications.map(notification => this.send(notification))
    );

    return results.map(result => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason)
        };
      }
    });
  }

  /**
   * Send batch of APNS notifications
   */
  private async sendApnsBatch(notifications: Notification[]): Promise<DeliveryResult[]> {
    // For now, send individually - in production, use APNS's batch capabilities
    const results = await Promise.allSettled(
      notifications.map(notification => this.send(notification))
    );

    return results.map(result => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason)
        };
      }
    });
  }

  /**
   * Get maximum batch size for push notifications
   */
  getMaxBatchSize(): number {
    return 500; // FCM supports up to 500 messages per batch
  }

  /**
   * Validate push-specific configuration
   */
  protected validateConfig(): void {
    super.validateConfig();

    if (!this.pushConfig.fcm && !this.pushConfig.apns) {
      throw new Error('Push config must include either FCM or APNS configuration');
    }

    if (this.pushConfig.fcm && !this.pushConfig.fcm.serviceAccountKey) {
      throw new Error('FCM config must include serviceAccountKey');
    }

    if (this.pushConfig.apns) {
      const required = ['keyId', 'teamId', 'bundleId', 'privateKey'];
      for (const field of required) {
        if (!(field in this.pushConfig.apns)) {
          throw new Error(`APNS config missing required field: ${field}`);
        }
      }
    }
  }

  /**
   * Enhanced health check for push channel
   */
  async isHealthy(): Promise<boolean> {
    if (!await super.isHealthy()) {
      return false;
    }

    // For mock implementation, always healthy
    // In production, check FCM and APNS service availability
    return true;
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    if (this.apnsProvider) {
      // TODO: Cleanup APNS provider
      // this.apnsProvider.shutdown();
      this.apnsProvider = null;
    }

    if (this.fcmClient) {
      // TODO: Cleanup FCM client
      // await this.fcmClient.delete();
      this.fcmClient = null;
    }

    this.logger.info('Push notification clients shut down');
  }
}