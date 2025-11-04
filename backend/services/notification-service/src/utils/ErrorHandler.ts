import { Request, Response, NextFunction } from 'express';
import { Logger } from './Logger';

/**
 * Custom error classes for better error handling
 * Follows Open/Closed Principle - can be extended without modification
 */
export class NotificationError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errorCode: string;

  constructor(
    message: string,
    statusCode: number = 500,
    errorCode: string = 'NOTIFICATION_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errorCode = errorCode;

    // Maintains proper stack trace for V8 engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class ValidationError extends NotificationError {
  constructor(message: string, field?: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class ChannelError extends NotificationError {
  public readonly channel: string;

  constructor(message: string, channel: string, statusCode: number = 500) {
    super(message, statusCode, 'CHANNEL_ERROR');
    this.name = 'ChannelError';
    this.channel = channel;
  }
}

export class TemplateError extends NotificationError {
  public readonly templateId: string;

  constructor(message: string, templateId: string) {
    super(message, 400, 'TEMPLATE_ERROR');
    this.name = 'TemplateError';
    this.templateId = templateId;
  }
}

export class QueueError extends NotificationError {
  constructor(message: string, statusCode: number = 500) {
    super(message, statusCode, 'QUEUE_ERROR');
    this.name = 'QueueError';
  }
}

export class RateLimitError extends NotificationError {
  public readonly retryAfter: number;

  constructor(message: string, retryAfter: number = 60) {
    super(message, 429, 'RATE_LIMIT_ERROR');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class ConfigurationError extends NotificationError {
  constructor(message: string) {
    super(message, 500, 'CONFIGURATION_ERROR', false);
    this.name = 'ConfigurationError';
  }
}

/**
 * Error handler class that provides centralized error handling
 * Implements Error Handler pattern and follows Single Responsibility Principle
 */
export class ErrorHandler {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.setupUnhandledErrorHandlers();
  }

  /**
   * Setup handlers for unhandled errors and promise rejections
   */
  private setupUnhandledErrorHandlers(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      this.logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack,
        fatal: true
      });

      // Graceful shutdown
      this.gracefulShutdown('Uncaught Exception', 1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      this.logger.error('Unhandled Promise Rejection', {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        promise: promise.toString(),
        fatal: true
      });

      // Graceful shutdown
      this.gracefulShutdown('Unhandled Promise Rejection', 1);
    });

    // Handle process termination signals
    process.on('SIGTERM', () => {
      this.logger.info('SIGTERM received, starting graceful shutdown');
      this.gracefulShutdown('SIGTERM', 0);
    });

    process.on('SIGINT', () => {
      this.logger.info('SIGINT received, starting graceful shutdown');
      this.gracefulShutdown('SIGINT', 0);
    });
  }

  /**
   * Express error handling middleware
   */
  handleError() {
    return (error: any, req: Request, res: Response, next: NextFunction): void => {
      this.logError(error, req);

      if (res.headersSent) {
        return next(error);
      }

      const errorResponse = this.formatErrorResponse(error);
      res.status(errorResponse.statusCode).json(errorResponse);
    };
  }

  /**
   * Handle async route errors
   */
  asyncHandler(fn: Function) {
    return (req: Request, res: Response, next: NextFunction): void => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  /**
   * Log error with context information
   */
  private logError(error: any, req?: Request): void {
    const errorInfo: any = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      operational: error.isOperational || false
    };

    if (error instanceof NotificationError) {
      errorInfo.errorCode = error.errorCode;
      errorInfo.statusCode = error.statusCode;
    }

    if (error instanceof ChannelError) {
      errorInfo.channel = error.channel;
    }

    if (error instanceof TemplateError) {
      errorInfo.templateId = error.templateId;
    }

    if (error instanceof RateLimitError) {
      errorInfo.retryAfter = error.retryAfter;
    }

    if (req) {
      errorInfo.request = {
        method: req.method,
        url: req.url,
        headers: this.sanitizeHeaders(req.headers),
        body: this.sanitizeBody(req.body),
        query: req.query,
        params: req.params,
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.get('User-Agent')
      };
    }

    if (error.isOperational === false || error.statusCode >= 500) {
      this.logger.error('Application Error', errorInfo);
    } else {
      this.logger.warn('Operational Error', errorInfo);
    }
  }

  /**
   * Format error response for API
   */
  private formatErrorResponse(error: any): {
    success: boolean;
    error: string;
    errorCode?: string;
    statusCode: number;
    timestamp: string;
    retryAfter?: number;
  } {
    let statusCode = 500;
    let errorCode = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';

    if (error instanceof NotificationError) {
      statusCode = error.statusCode;
      errorCode = error.errorCode;
      message = error.message;
    } else if (error.name === 'ValidationError') {
      statusCode = 400;
      errorCode = 'VALIDATION_ERROR';
      message = error.message;
    } else if (error.name === 'CastError') {
      statusCode = 400;
      errorCode = 'INVALID_ID';
      message = 'Invalid ID format';
    } else if (error.code === 11000) {
      statusCode = 400;
      errorCode = 'DUPLICATE_ENTRY';
      message = 'Duplicate entry found';
    }

    const response: any = {
      success: false,
      error: message,
      errorCode,
      statusCode,
      timestamp: new Date().toISOString()
    };

    if (error instanceof RateLimitError) {
      response.retryAfter = error.retryAfter;
    }

    return response;
  }

  /**
   * Sanitize headers to remove sensitive information
   */
  private sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
    
    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Sanitize request body to remove sensitive information
   */
  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sanitized = { ...body };
    const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'auth'];

    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Handle notification-specific errors
   */
  handleNotificationError(error: any, context?: Record<string, any>): NotificationError {
    if (error instanceof NotificationError) {
      return error;
    }

    // Convert common errors to notification errors
    if (error.message.includes('invalid email') || error.message.includes('invalid phone')) {
      return new ValidationError(error.message);
    }

    if (error.message.includes('rate limit') || error.message.includes('quota exceeded')) {
      return new RateLimitError(error.message);
    }

    if (error.message.includes('template')) {
      return new TemplateError(error.message, context?.templateId || 'unknown');
    }

    if (error.message.includes('queue') || error.message.includes('capacity')) {
      return new QueueError(error.message);
    }

    // Default to generic notification error
    return new NotificationError(
      error.message || 'An unexpected error occurred',
      500,
      'UNKNOWN_ERROR'
    );
  }

  /**
   * Validate and throw validation error if invalid
   */
  validateAndThrow(condition: boolean, message: string, field?: string): void {
    if (!condition) {
      throw new ValidationError(message, field);
    }
  }

  /**
   * Assert condition and throw error if false
   */
  assert(condition: boolean, message: string, statusCode: number = 500): void {
    if (!condition) {
      throw new NotificationError(message, statusCode);
    }
  }

  /**
   * Graceful shutdown handler
   */
  private gracefulShutdown(signal: string, exitCode: number): void {
    this.logger.info(`Starting graceful shutdown due to ${signal}`);

    // Give ongoing operations time to complete
    setTimeout(() => {
      this.logger.info('Forcefully shutting down');
      process.exit(exitCode);
    }, 10000); // 10 seconds timeout

    // Attempt graceful shutdown
    process.exit(exitCode);
  }

  /**
   * Create circuit breaker for external service calls
   */
  createCircuitBreaker<T>(
    operation: () => Promise<T>,
    options: {
      failureThreshold?: number;
      timeout?: number;
      resetTimeout?: number;
    } = {}
  ): () => Promise<T> {
    const {
      failureThreshold = 5,
      timeout = 60000,
      resetTimeout = 30000
    } = options;

    let failureCount = 0;
    let lastFailureTime = 0;
    let state: 'closed' | 'open' | 'half-open' = 'closed';

    return async (): Promise<T> => {
      const now = Date.now();

      // Check if circuit should be reset
      if (state === 'open' && now - lastFailureTime > resetTimeout) {
        state = 'half-open';
        failureCount = 0;
      }

      // Reject if circuit is open
      if (state === 'open') {
        throw new NotificationError(
          'Circuit breaker is open - service unavailable',
          503,
          'SERVICE_UNAVAILABLE'
        );
      }

      try {
        const result = await Promise.race([
          operation(),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Operation timeout')), timeout);
          })
        ]);

        // Reset on success
        if (state === 'half-open') {
          state = 'closed';
          failureCount = 0;
        }

        return result;

      } catch (error) {
        failureCount++;
        lastFailureTime = now;

        if (failureCount >= failureThreshold) {
          state = 'open';
          this.logger.warn('Circuit breaker opened due to repeated failures', {
            failureCount,
            failureThreshold,
            error: error instanceof Error ? error.message : String(error)
          });
        }

        throw error;
      }
    };
  }
}

/**
 * Factory function to create error handler
 */
export function createErrorHandler(logger: Logger): ErrorHandler {
  return new ErrorHandler(logger);
}

/**
 * Express middleware for handling 404 errors
 */
export function notFoundHandler() {
  return (req: Request, res: Response): void => {
    res.status(404).json({
      success: false,
      error: `Route ${req.method} ${req.path} not found`,
      errorCode: 'ROUTE_NOT_FOUND',
      statusCode: 404,
      timestamp: new Date().toISOString()
    });
  };
}

/**
 * Express middleware for handling validation errors
 */
export function validationErrorHandler() {
  return (error: any, req: Request, res: Response, next: NextFunction): void => {
    if (error.name === 'ValidationError' || error.isJoi) {
      const validationError = new ValidationError(
        error.details ? error.details[0].message : error.message
      );
      next(validationError);
    } else {
      next(error);
    }
  };
}