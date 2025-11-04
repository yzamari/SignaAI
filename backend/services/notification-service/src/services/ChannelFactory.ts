import { INotificationChannel } from '../interfaces/INotificationChannel';
import { NotificationChannel, EmailConfig, SmsConfig, PushConfig, WebSocketConfig } from '../interfaces/types';
import { EmailChannel } from '../channels/EmailChannel';
import { SmsChannel } from '../channels/SmsChannel';
import { PushChannel } from '../channels/PushChannel';
import { WebSocketChannel } from '../channels/WebSocketChannel';

/**
 * Factory interface following Factory Method Pattern
 * Defines the contract for creating notification channels
 */
interface IChannelFactory {
  createChannel(channelType: NotificationChannel, config: any, logger?: any): INotificationChannel;
  getSupportedChannels(): NotificationChannel[];
  isChannelSupported(channelType: NotificationChannel): boolean;
}

/**
 * Abstract factory class implementing Factory Method Pattern
 * Provides common functionality for channel creation
 * Follows Open/Closed Principle - new channel types can be added without modification
 */
export abstract class BaseChannelFactory implements IChannelFactory {
  protected logger: any;
  protected channelRegistry: Map<NotificationChannel, any> = new Map();

  constructor(logger?: any) {
    this.logger = logger || console;
    this.registerChannels();
  }

  /**
   * Abstract method to register supported channels
   * Must be implemented by concrete factories
   */
  protected abstract registerChannels(): void;

  /**
   * Factory method to create notification channels
   * Implements Factory Method Pattern
   */
  createChannel(channelType: NotificationChannel, config: any, logger?: any): INotificationChannel {
    const channelLogger = logger || this.logger;
    
    if (!this.isChannelSupported(channelType)) {
      throw new Error(`Unsupported channel type: ${channelType}`);
    }

    try {
      const ChannelClass = this.channelRegistry.get(channelType);
      
      if (!ChannelClass) {
        throw new Error(`No channel class registered for type: ${channelType}`);
      }

      // Validate configuration before creating channel
      this.validateChannelConfig(channelType, config);

      const channel = new ChannelClass(config, channelLogger);
      
      channelLogger.info(`Created ${channelType} channel successfully`);
      return channel;

    } catch (error) {
      channelLogger.error(`Failed to create ${channelType} channel:`, error);
      throw new Error(`Channel creation failed for ${channelType}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get list of supported channel types
   */
  getSupportedChannels(): NotificationChannel[] {
    return Array.from(this.channelRegistry.keys());
  }

  /**
   * Check if channel type is supported
   */
  isChannelSupported(channelType: NotificationChannel): boolean {
    return this.channelRegistry.has(channelType);
  }

  /**
   * Validate channel-specific configuration
   * Can be overridden by subclasses for custom validation
   */
  protected validateChannelConfig(channelType: NotificationChannel, config: any): void {
    if (!config) {
      throw new Error(`Configuration is required for ${channelType} channel`);
    }

    if (typeof config.enabled !== 'boolean') {
      throw new Error(`Channel configuration must specify 'enabled' as boolean`);
    }

    // Channel-specific validation
    switch (channelType) {
      case NotificationChannel.EMAIL:
        this.validateEmailConfig(config as EmailConfig);
        break;
      case NotificationChannel.SMS:
        this.validateSmsConfig(config as SmsConfig);
        break;
      case NotificationChannel.PUSH:
        this.validatePushConfig(config as PushConfig);
        break;
      case NotificationChannel.WEBSOCKET:
        this.validateWebSocketConfig(config as WebSocketConfig);
        break;
      default:
        // Basic validation passed, channel-specific validation handled by channel itself
        break;
    }
  }

  private validateEmailConfig(config: EmailConfig): void {
    if (!config.smtp) {
      throw new Error('Email configuration must include SMTP settings');
    }
    
    const requiredSmtpFields = ['host', 'port', 'auth'];
    for (const field of requiredSmtpFields) {
      if (!(field in config.smtp)) {
        throw new Error(`Email SMTP configuration missing required field: ${field}`);
      }
    }

    if (!config.from || !config.from.email) {
      throw new Error('Email configuration must include from address');
    }
  }

  private validateSmsConfig(config: SmsConfig): void {
    if (!config.provider) {
      throw new Error('SMS configuration must specify provider');
    }

    const validProviders = ['twilio', 'aws-sns', 'mock'];
    if (!validProviders.includes(config.provider)) {
      throw new Error(`Invalid SMS provider: ${config.provider}. Supported: ${validProviders.join(', ')}`);
    }
  }

  private validatePushConfig(config: PushConfig): void {
    if (!config.fcm && !config.apns) {
      throw new Error('Push configuration must include either FCM or APNS settings');
    }
  }

  private validateWebSocketConfig(config: WebSocketConfig): void {
    if (!config.port) {
      throw new Error('WebSocket configuration must specify port');
    }

    if (config.port < 1 || config.port > 65535) {
      throw new Error('WebSocket port must be between 1 and 65535');
    }
  }

  /**
   * Register a new channel type (for extensibility)
   */
  protected registerChannel(channelType: NotificationChannel, channelClass: any): void {
    this.channelRegistry.set(channelType, channelClass);
    this.logger.info(`Registered channel type: ${channelType}`);
  }
}

/**
 * Default channel factory implementation
 * Registers all standard notification channels
 */
export class NotificationChannelFactory extends BaseChannelFactory {
  
  /**
   * Register all supported channel types
   */
  protected registerChannels(): void {
    this.registerChannel(NotificationChannel.EMAIL, EmailChannel);
    this.registerChannel(NotificationChannel.SMS, SmsChannel);
    this.registerChannel(NotificationChannel.PUSH, PushChannel);
    this.registerChannel(NotificationChannel.WEBSOCKET, WebSocketChannel);
  }

  /**
   * Create multiple channels from configuration
   * Useful for initializing all channels at startup
   */
  createChannelsFromConfig(channelConfigs: Record<string, any>): Map<NotificationChannel, INotificationChannel> {
    const channels = new Map<NotificationChannel, INotificationChannel>();
    
    for (const [channelName, config] of Object.entries(channelConfigs)) {
      try {
        const channelType = channelName as NotificationChannel;
        
        if (this.isChannelSupported(channelType) && config.enabled) {
          const channel = this.createChannel(channelType, config, this.logger);
          channels.set(channelType, channel);
          this.logger.info(`Successfully created and registered ${channelType} channel`);
        } else if (!config.enabled) {
          this.logger.info(`Skipping ${channelType} channel - disabled in configuration`);
        }
      } catch (error) {
        this.logger.error(`Failed to create channel for ${channelName}:`, error);
        // Continue with other channels even if one fails
      }
    }

    this.logger.info(`Successfully created ${channels.size} notification channels`);
    return channels;
  }

  /**
   * Health check for all channels
   */
  async checkChannelsHealth(channels: Map<NotificationChannel, INotificationChannel>): Promise<Record<string, boolean>> {
    const healthStatus: Record<string, boolean> = {};
    
    const healthChecks = Array.from(channels.entries()).map(async ([channelType, channel]) => {
      try {
        const isHealthy = await channel.isHealthy();
        healthStatus[channelType] = isHealthy;
        return { channelType, isHealthy };
      } catch (error) {
        this.logger.error(`Health check failed for ${channelType}:`, error);
        healthStatus[channelType] = false;
        return { channelType, isHealthy: false };
      }
    });

    await Promise.allSettled(healthChecks);
    return healthStatus;
  }
}

/**
 * Specialized factory for test environments
 * Uses mock implementations for all channels
 */
export class MockChannelFactory extends BaseChannelFactory {
  
  protected registerChannels(): void {
    // Register mock channels for testing
    this.registerChannel(NotificationChannel.EMAIL, MockEmailChannel);
    this.registerChannel(NotificationChannel.SMS, MockSmsChannel);
    this.registerChannel(NotificationChannel.PUSH, MockPushChannel);
    this.registerChannel(NotificationChannel.WEBSOCKET, MockWebSocketChannel);
  }
}

// Mock channel implementations for testing
class MockEmailChannel extends EmailChannel {
  constructor(config: any, logger?: any) {
    // Use minimal config for mock
    const mockConfig = {
      ...config,
      smtp: {
        host: 'mock.smtp.com',
        port: 587,
        secure: false,
        auth: { user: 'mock', pass: 'mock' }
      },
      from: { name: 'Mock Service', email: 'mock@example.com' }
    };
    super(mockConfig, logger);
  }
}

class MockSmsChannel extends SmsChannel {
  constructor(config: any, logger?: any) {
    const mockConfig = {
      ...config,
      provider: 'mock' as const,
      credentials: {}
    };
    super(mockConfig, logger);
  }
}

class MockPushChannel extends PushChannel {
  constructor(config: any, logger?: any) {
    const mockConfig = {
      ...config,
      fcm: { serviceAccountKey: 'mock-key' }
    };
    super(mockConfig, logger);
  }
}

class MockWebSocketChannel extends WebSocketChannel {
  constructor(config: any, logger?: any) {
    const mockConfig = {
      ...config,
      port: config.port || 8080
    };
    super(mockConfig, logger);
  }
}

/**
 * Factory registry for managing multiple factory instances
 * Implements Abstract Factory Pattern
 */
export class ChannelFactoryRegistry {
  private factories: Map<string, IChannelFactory> = new Map();
  private logger: any;

  constructor(logger?: any) {
    this.logger = logger || console;
    this.registerDefaultFactories();
  }

  /**
   * Register default factory implementations
   */
  private registerDefaultFactories(): void {
    this.registerFactory('default', new NotificationChannelFactory(this.logger));
    this.registerFactory('mock', new MockChannelFactory(this.logger));
  }

  /**
   * Register a factory instance
   */
  registerFactory(name: string, factory: IChannelFactory): void {
    this.factories.set(name, factory);
    this.logger.info(`Registered channel factory: ${name}`);
  }

  /**
   * Get a factory by name
   */
  getFactory(name: string = 'default'): IChannelFactory {
    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`Channel factory not found: ${name}`);
    }
    return factory;
  }

  /**
   * Get all registered factory names
   */
  getFactoryNames(): string[] {
    return Array.from(this.factories.keys());
  }

  /**
   * Create channel using specific factory
   */
  createChannel(
    factoryName: string,
    channelType: NotificationChannel,
    config: any,
    logger?: any
  ): INotificationChannel {
    const factory = this.getFactory(factoryName);
    return factory.createChannel(channelType, config, logger);
  }
}

// Export singleton instance for convenience
export const channelFactoryRegistry = new ChannelFactoryRegistry();