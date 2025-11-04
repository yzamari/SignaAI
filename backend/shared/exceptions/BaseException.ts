/**
 * Base Exception Class
 * Root of exception hierarchy following OOP inheritance
 */
export abstract class BaseException extends Error {
  public readonly statusCode: number;
  public readonly timestamp: Date;
  public readonly context?: Record<string, any>;

  constructor(
    message: string,
    statusCode: number = 500,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.timestamp = new Date();
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert exception to JSON for API responses
   */
  public toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp.toISOString(),
      context: this.context
    };
  }

  /**
   * Log exception details
   */
  public log(): void {
    console.error({
      exception: this.name,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      stack: this.stack
    });
  }
}

/**
 * Business Logic Exception
 * Thrown when business rules are violated
 */
export class BusinessRuleException extends BaseException {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 400, context);
  }
}

/**
 * Validation Exception
 * Thrown when input validation fails
 */
export class ValidationException extends BaseException {
  public readonly validationErrors: Record<string, string[]>;

  constructor(
    message: string,
    validationErrors: Record<string, string[]>,
    context?: Record<string, any>
  ) {
    super(message, 422, context);
    this.validationErrors = validationErrors;
  }

  public toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      validationErrors: this.validationErrors
    };
  }
}

/**
 * Not Found Exception
 * Thrown when requested resource doesn't exist
 */
export class NotFoundException extends BaseException {
  constructor(resource: string, identifier: string, context?: Record<string, any>) {
    super(`${resource} with identifier ${identifier} not found`, 404, context);
  }
}

/**
 * Unauthorized Exception
 * Thrown when authentication fails
 */
export class UnauthorizedException extends BaseException {
  constructor(message: string = 'Unauthorized access', context?: Record<string, any>) {
    super(message, 401, context);
  }
}

/**
 * Forbidden Exception
 * Thrown when user lacks permissions
 */
export class ForbiddenException extends BaseException {
  constructor(message: string = 'Access forbidden', context?: Record<string, any>) {
    super(message, 403, context);
  }
}

/**
 * Conflict Exception
 * Thrown when operation conflicts with existing state
 */
export class ConflictException extends BaseException {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 409, context);
  }
}

/**
 * Service Unavailable Exception
 * Thrown when external service is unavailable
 */
export class ServiceUnavailableException extends BaseException {
  constructor(service: string, context?: Record<string, any>) {
    super(`Service ${service} is currently unavailable`, 503, context);
  }
}

/**
 * Database Exception
 * Thrown when database operations fail
 */
export class DatabaseException extends BaseException {
  constructor(operation: string, details?: string, context?: Record<string, any>) {
    super(
      `Database operation failed: ${operation}${details ? ` - ${details}` : ''}`,
      500,
      context
    );
  }
}