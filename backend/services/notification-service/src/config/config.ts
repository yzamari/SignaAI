import dotenv from 'dotenv';
import { NotificationChannel } from '../interfaces/types';

// Load environment variables
dotenv.config();

/**
 * Configuration management for the notification service
 * Follows Single Responsibility Principle - manages configuration only
 * Uses environment variables with sensible defaults
 */
export interface ServiceConfig {
  server: {
    port: number;
    host: string;
    cors: {
      origin: string | string[];
      credentials: boolean;
    };
    rateLimit: {
      windowMs: number;
      max: number;
    };
  };
  logging: {
    level: string;
    format: string;
    file?: {
      enabled: boolean;
      filename: string;
      maxSize: string;
      maxFiles: number;
    };
  };
  channels: {
    email: {
      enabled: boolean;
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
      rateLimitPerMinute?: number;
      timeout?: number;
    };
    sms: {
      enabled: boolean;
      provider: 'twilio' | 'aws-sns' | 'mock';
      credentials: Record<string, string>;
      fromNumber?: string;
      rateLimitPerMinute?: number;
      timeout?: number;
    };
    push: {
      enabled: boolean;
      fcm?: {
        serviceAccountKey: string;
      };
      apns?: {
        keyId: string;
        teamId: string;
        bundleId: string;
        privateKey: string;
      };
      rateLimitPerMinute?: number;
      timeout?: number;
    };
    websocket: {
      enabled: boolean;
      port: number;
      namespace?: string;
      cors?: {
        origin: string | string[];
        methods: string[];
      };
    };
  };
  queue: {
    retryStrategy: 'exponential' | 'linear' | 'fixed' | 'fibonacci' | 'adaptive';
    retryOptions: {
      maxRetries: number;
      baseDelay: number;
      maxDelay: number;
      multiplier?: number;
      increment?: number;
      interval?: number;
    };
    maxSize: number;
    batchSize: number;
    processingInterval: number;
  };
  redis?: {
    enabled: boolean;
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  monitoring: {
    metricsEnabled: boolean;
    healthCheckInterval: number;
    alerting: {
      enabled: boolean;
      thresholds: {
        errorRate: number;
        responseTime: number;
        queueSize: number;
      };
    };
  };
}

/**
 * Get configuration from environment variables
 */
function getConfig(): ServiceConfig {
  return {
    server: {
      port: parseInt(process.env.PORT || '3000', 10),
      host: process.env.HOST || '0.0.0.0',
      cors: {
        origin: process.env.CORS_ORIGIN ? 
          process.env.CORS_ORIGIN.split(',') : 
          ['http://localhost:3000', 'http://localhost:3001'],
        credentials: process.env.CORS_CREDENTIALS === 'true'
      },
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
        max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10) // 100 requests per window
      }
    },
    
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      format: process.env.LOG_FORMAT || 'combined',
      file: {
        enabled: process.env.LOG_FILE_ENABLED === 'true',
        filename: process.env.LOG_FILE_NAME || 'logs/notification-service.log',
        maxSize: process.env.LOG_FILE_MAX_SIZE || '20m',
        maxFiles: parseInt(process.env.LOG_FILE_MAX_FILES || '5', 10)
      }
    },

    channels: {
      email: {
        enabled: process.env.EMAIL_ENABLED !== 'false', // Default enabled
        smtp: {
          host: process.env.SMTP_HOST || 'localhost',
          port: parseInt(process.env.SMTP_PORT || '587', 10),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER || '',
            pass: process.env.SMTP_PASS || ''
          }
        },
        from: {
          name: process.env.EMAIL_FROM_NAME || 'SignaAI',
          email: process.env.EMAIL_FROM_ADDRESS || 'noreply@signaai.com'
        },
        rateLimitPerMinute: parseInt(process.env.EMAIL_RATE_LIMIT || '60', 10),
        timeout: parseInt(process.env.EMAIL_TIMEOUT || '30000', 10)
      },

      sms: {
        enabled: process.env.SMS_ENABLED === 'true',
        provider: (process.env.SMS_PROVIDER || 'mock') as 'twilio' | 'aws-sns' | 'mock',
        credentials: {
          // Twilio
          accountSid: process.env.TWILIO_ACCOUNT_SID || '',
          authToken: process.env.TWILIO_AUTH_TOKEN || '',
          // AWS SNS
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
          region: process.env.AWS_REGION || 'us-east-1'
        },
        fromNumber: process.env.SMS_FROM_NUMBER,
        rateLimitPerMinute: parseInt(process.env.SMS_RATE_LIMIT || '30', 10),
        timeout: parseInt(process.env.SMS_TIMEOUT || '10000', 10)
      },

      push: {
        enabled: process.env.PUSH_ENABLED === 'true',
        fcm: process.env.FCM_SERVICE_ACCOUNT_KEY ? {
          serviceAccountKey: process.env.FCM_SERVICE_ACCOUNT_KEY
        } : undefined,
        apns: (process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && 
               process.env.APNS_BUNDLE_ID && process.env.APNS_PRIVATE_KEY) ? {
          keyId: process.env.APNS_KEY_ID,
          teamId: process.env.APNS_TEAM_ID,
          bundleId: process.env.APNS_BUNDLE_ID,
          privateKey: process.env.APNS_PRIVATE_KEY
        } : undefined,
        rateLimitPerMinute: parseInt(process.env.PUSH_RATE_LIMIT || '120', 10),
        timeout: parseInt(process.env.PUSH_TIMEOUT || '15000', 10)
      },

      websocket: {
        enabled: process.env.WEBSOCKET_ENABLED !== 'false', // Default enabled
        port: parseInt(process.env.WEBSOCKET_PORT || '3001', 10),
        namespace: process.env.WEBSOCKET_NAMESPACE || '/notifications',
        cors: {
          origin: process.env.WEBSOCKET_CORS_ORIGIN ? 
            process.env.WEBSOCKET_CORS_ORIGIN.split(',') : 
            ['*'],
          methods: ['GET', 'POST']
        }
      }
    },

    queue: {
      retryStrategy: (process.env.QUEUE_RETRY_STRATEGY || 'exponential') as any,
      retryOptions: {
        maxRetries: parseInt(process.env.QUEUE_MAX_RETRIES || '3', 10),
        baseDelay: parseInt(process.env.QUEUE_BASE_DELAY || '1000', 10),
        maxDelay: parseInt(process.env.QUEUE_MAX_DELAY || '60000', 10),
        multiplier: parseFloat(process.env.QUEUE_MULTIPLIER || '2'),
        increment: parseInt(process.env.QUEUE_INCREMENT || '1000', 10),
        interval: parseInt(process.env.QUEUE_INTERVAL || '5000', 10)
      },
      maxSize: parseInt(process.env.QUEUE_MAX_SIZE || '10000', 10),
      batchSize: parseInt(process.env.QUEUE_BATCH_SIZE || '10', 10),
      processingInterval: parseInt(process.env.QUEUE_PROCESSING_INTERVAL || '1000', 10)
    },

    redis: process.env.REDIS_ENABLED === 'true' ? {
      enabled: true,
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10)
    } : undefined,

    monitoring: {
      metricsEnabled: process.env.METRICS_ENABLED !== 'false',
      healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10),
      alerting: {
        enabled: process.env.ALERTING_ENABLED === 'true',
        thresholds: {
          errorRate: parseFloat(process.env.ALERT_ERROR_RATE_THRESHOLD || '0.05'), // 5%
          responseTime: parseInt(process.env.ALERT_RESPONSE_TIME_THRESHOLD || '5000', 10), // 5s
          queueSize: parseInt(process.env.ALERT_QUEUE_SIZE_THRESHOLD || '1000', 10)
        }
      }
    }
  };
}

/**
 * Validate configuration
 */
function validateConfig(config: ServiceConfig): void {
  const errors: string[] = [];

  // Validate server config
  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push('Server port must be between 1 and 65535');
  }

  // Validate enabled channels have required configuration
  if (config.channels.email.enabled) {
    if (!config.channels.email.smtp.host) {
      errors.push('SMTP host is required when email is enabled');
    }
    if (!config.channels.email.from.email) {
      errors.push('From email address is required when email is enabled');
    }
  }

  if (config.channels.sms.enabled) {
    if (config.channels.sms.provider === 'twilio') {
      if (!config.channels.sms.credentials.accountSid || !config.channels.sms.credentials.authToken) {
        errors.push('Twilio credentials are required when SMS with Twilio is enabled');
      }
    } else if (config.channels.sms.provider === 'aws-sns') {
      if (!config.channels.sms.credentials.accessKeyId || !config.channels.sms.credentials.secretAccessKey) {
        errors.push('AWS credentials are required when SMS with AWS SNS is enabled');
      }
    }
  }

  if (config.channels.push.enabled) {
    if (!config.channels.push.fcm && !config.channels.push.apns) {
      errors.push('Either FCM or APNS configuration is required when push notifications are enabled');
    }
  }

  if (config.channels.websocket.enabled) {
    if (config.channels.websocket.port < 1 || config.channels.websocket.port > 65535) {
      errors.push('WebSocket port must be between 1 and 65535');
    }
  }

  // Validate queue config
  if (config.queue.maxSize < 1) {
    errors.push('Queue max size must be greater than 0');
  }

  if (config.queue.batchSize < 1 || config.queue.batchSize > config.queue.maxSize) {
    errors.push('Queue batch size must be between 1 and max size');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Create and validate configuration
const config = getConfig();
validateConfig(config);

export default config;

/**
 * Environment-specific configuration presets
 */
export const environments = {
  development: {
    logging: { level: 'debug' },
    channels: {
      email: { enabled: true },
      sms: { enabled: false, provider: 'mock' as const },
      push: { enabled: false },
      websocket: { enabled: true }
    }
  },
  
  testing: {
    logging: { level: 'error' },
    channels: {
      email: { enabled: false },
      sms: { enabled: false, provider: 'mock' as const },
      push: { enabled: false },
      websocket: { enabled: false }
    },
    queue: { batchSize: 1, processingInterval: 100 }
  },
  
  production: {
    logging: { level: 'info' },
    channels: {
      email: { enabled: true },
      sms: { enabled: true },
      push: { enabled: true },
      websocket: { enabled: true }
    },
    monitoring: { metricsEnabled: true, alerting: { enabled: true } }
  }
};

/**
 * Get environment-specific configuration
 */
export function getEnvironmentConfig(env: keyof typeof environments): Partial<ServiceConfig> {
  return environments[env] || {};
}

/**
 * Merge configuration with environment-specific overrides
 */
export function mergeConfig(baseConfig: ServiceConfig, overrides: Partial<ServiceConfig>): ServiceConfig {
  return {
    ...baseConfig,
    ...overrides,
    server: { ...baseConfig.server, ...overrides.server },
    logging: { ...baseConfig.logging, ...overrides.logging },
    channels: {
      ...baseConfig.channels,
      ...overrides.channels,
      email: { ...baseConfig.channels.email, ...overrides.channels?.email },
      sms: { ...baseConfig.channels.sms, ...overrides.channels?.sms },
      push: { ...baseConfig.channels.push, ...overrides.channels?.push },
      websocket: { ...baseConfig.channels.websocket, ...overrides.channels?.websocket }
    },
    queue: { ...baseConfig.queue, ...overrides.queue },
    monitoring: { ...baseConfig.monitoring, ...overrides.monitoring }
  };
}