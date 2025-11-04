/**
 * Abstract Base Service
 * Implements common service layer functionality
 * Follows Facade pattern to orchestrate business operations
 */
export abstract class BaseService {
  protected abstract serviceName: string;

  constructor() {
    this.initializeService();
  }

  /**
   * Hook for service initialization
   * Subclasses can override to add custom initialization
   */
  protected initializeService(): void {
    console.log(`Initializing ${this.serviceName} service`);
  }

  /**
   * Execute operation with logging and error handling
   * Template method pattern for consistent operation execution
   */
  protected async executeOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    context?: Record<string, any>
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      this.logOperation('start', operationName, context);
      
      const result = await operation();
      
      const duration = Date.now() - startTime;
      this.logOperation('success', operationName, { ...context, duration });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logOperation('error', operationName, { ...context, duration, error });
      throw this.transformError(error);
    }
  }

  /**
   * Log service operations
   */
  protected logOperation(
    level: 'start' | 'success' | 'error',
    operation: string,
    context?: Record<string, any>
  ): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      service: this.serviceName,
      operation,
      level,
      ...context
    };

    if (level === 'error') {
      console.error(JSON.stringify(logEntry));
    } else {
      console.log(JSON.stringify(logEntry));
    }
  }

  /**
   * Transform errors into domain-specific exceptions
   * Subclasses should override to provide custom error handling
   */
  protected transformError(error: any): Error {
    return error;
  }

  /**
   * Validate operation input
   * Subclasses can override to add custom validation
   */
  protected async validateInput<T>(
    input: T,
    validationRules?: Array<(input: T) => boolean | Promise<boolean>>
  ): Promise<void> {
    if (!validationRules) return;

    for (const rule of validationRules) {
      const isValid = await rule(input);
      if (!isValid) {
        throw new Error(`Validation failed for ${this.serviceName}`);
      }
    }
  }

  /**
   * Health check for service
   */
  public async healthCheck(): Promise<{
    service: string;
    status: 'healthy' | 'unhealthy';
    timestamp: string;
    details?: Record<string, any>;
  }> {
    try {
      const details = await this.performHealthCheck();
      return {
        service: this.serviceName,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        details
      };
    } catch (error) {
      return {
        service: this.serviceName,
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  /**
   * Abstract method for service-specific health checks
   */
  protected abstract performHealthCheck(): Promise<Record<string, any>>;
}