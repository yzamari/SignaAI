import winston from 'winston';
import { ServiceConfig } from '../config/config';

/**
 * Centralized logging utility using Winston
 * Follows Single Responsibility Principle - handles logging only
 * Supports multiple transports and formats for different environments
 */
export class Logger {
  private logger: winston.Logger;
  private config: ServiceConfig['logging'];

  constructor(config: ServiceConfig['logging'], serviceName: string = 'notification-service') {
    this.config = config;
    this.logger = this.createLogger(serviceName);
  }

  /**
   * Create Winston logger with configured transports
   */
  private createLogger(serviceName: string): winston.Logger {
    const transports: winston.transport[] = [];

    // Console transport (always enabled)
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.errors({ stack: true }),
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
            return `${timestamp} [${service}] ${level}: ${message} ${metaStr}`;
          })
        )
      })
    );

    // File transport (if enabled)
    if (this.config.file?.enabled && this.config.file.filename) {
      transports.push(
        new winston.transports.File({
          filename: this.config.file.filename,
          maxsize: this.parseSize(this.config.file.maxSize),
          maxFiles: this.config.file.maxFiles,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
          )
        })
      );

      // Separate error file
      transports.push(
        new winston.transports.File({
          filename: this.config.file.filename.replace('.log', '.error.log'),
          level: 'error',
          maxsize: this.parseSize(this.config.file.maxSize),
          maxFiles: this.config.file.maxFiles,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
          )
        })
      );
    }

    return winston.createLogger({
      level: this.config.level,
      defaultMeta: { service: serviceName },
      transports,
      exitOnError: false,
      // Handle uncaught exceptions
      exceptionHandlers: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
          )
        })
      ]
    });
  }

  /**
   * Parse size string to bytes
   */
  private parseSize(sizeStr: string): number {
    const units: Record<string, number> = {
      'b': 1,
      'k': 1024,
      'm': 1024 * 1024,
      'g': 1024 * 1024 * 1024
    };

    const match = sizeStr.toLowerCase().match(/^(\d+)([bkmg]?)$/);
    if (!match) {
      return 20 * 1024 * 1024; // Default 20MB
    }

    const size = parseInt(match[1], 10);
    const unit = match[2] || 'b';
    return size * units[unit];
  }

  // Logging methods
  error(message: string, meta?: any): void {
    this.logger.error(message, meta);
  }

  warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  verbose(message: string, meta?: any): void {
    this.logger.verbose(message, meta);
  }

  /**
   * Log with custom level
   */
  log(level: string, message: string, meta?: any): void {
    this.logger.log(level, message, meta);
  }

  /**
   * Create child logger with additional metadata
   */
  child(metadata: Record<string, any>): Logger {
    const childLogger = new Logger(this.config);
    childLogger.logger = this.logger.child(metadata);
    return childLogger;
  }

  /**
   * Get the underlying Winston logger
   */
  getWinstonLogger(): winston.Logger {
    return this.logger;
  }

  /**
   * Performance timing helper
   */
  timer(label: string): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.debug(`Timer: ${label}`, { duration: `${duration}ms` });
    };
  }

  /**
   * Log API request
   */
  logRequest(req: any, res: any, duration: number): void {
    this.info('API Request', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection?.remoteAddress
    });
  }

  /**
   * Log notification event
   */
  logNotificationEvent(
    event: string,
    notificationId: string,
    userId: string,
    channel: string,
    meta?: any
  ): void {
    this.info(`Notification ${event}`, {
      notificationId,
      userId,
      channel,
      event,
      ...meta
    });
  }

  /**
   * Log channel event
   */
  logChannelEvent(
    event: string,
    channel: string,
    success: boolean,
    duration?: number,
    error?: string
  ): void {
    const level = success ? 'info' : 'error';
    this.log(level, `Channel ${event}`, {
      channel,
      success,
      duration: duration ? `${duration}ms` : undefined,
      error,
      event
    });
  }

  /**
   * Log queue event
   */
  logQueueEvent(
    event: string,
    queueSize: number,
    batchSize?: number,
    meta?: any
  ): void {
    this.info(`Queue ${event}`, {
      queueSize,
      batchSize,
      event,
      ...meta
    });
  }

  /**
   * Log security event
   */
  logSecurityEvent(
    event: string,
    userId: string,
    details: Record<string, any>
  ): void {
    this.warn(`Security Event: ${event}`, {
      userId,
      event,
      security: true,
      ...details
    });
  }

  /**
   * Log performance metrics
   */
  logMetrics(metrics: Record<string, any>): void {
    this.info('Performance Metrics', {
      metrics: true,
      ...metrics
    });
  }

  /**
   * Close logger and cleanup resources
   */
  close(): void {
    this.logger.close();
  }
}

/**
 * Request logging middleware for Express
 */
export function createRequestLogger(logger: Logger) {
  return (req: any, res: any, next: any) => {
    const start = Date.now();

    // Override res.end to log when response is sent
    const originalEnd = res.end;
    res.end = function (chunk: any, encoding: any) {
      const duration = Date.now() - start;
      logger.logRequest(req, res, duration);
      originalEnd.call(res, chunk, encoding);
    };

    next();
  };
}

/**
 * Error logging middleware for Express
 */
export function createErrorLogger(logger: Logger) {
  return (error: any, req: any, res: any, next: any) => {
    logger.error('Request Error', {
      error: error.message,
      stack: error.stack,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection?.remoteAddress
    });

    next(error);
  };
}

/**
 * Structured logging helper for async operations
 */
export function logAsyncOperation<T>(
  logger: Logger,
  operationName: string,
  operation: () => Promise<T>,
  context?: Record<string, any>
): Promise<T> {
  const start = Date.now();
  logger.debug(`Starting ${operationName}`, context);

  return operation()
    .then((result) => {
      const duration = Date.now() - start;
      logger.info(`Completed ${operationName}`, {
        ...context,
        duration: `${duration}ms`,
        success: true
      });
      return result;
    })
    .catch((error) => {
      const duration = Date.now() - start;
      logger.error(`Failed ${operationName}`, {
        ...context,
        duration: `${duration}ms`,
        success: false,
        error: error.message,
        stack: error.stack
      });
      throw error;
    });
}

/**
 * Create logger instance from configuration
 */
export function createLogger(config: ServiceConfig['logging'], serviceName?: string): Logger {
  return new Logger(config, serviceName);
}