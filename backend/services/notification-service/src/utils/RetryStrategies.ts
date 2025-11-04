import { RetryStrategy } from '../interfaces/types';

/**
 * Abstract base class for retry strategies
 * Implements Strategy Pattern for different retry approaches
 * Follows Open/Closed Principle - new strategies can be added without modification
 */
export abstract class BaseRetryStrategy implements RetryStrategy {
  protected maxRetries: number;
  protected logger: any;

  constructor(maxRetries: number = 3, logger?: any) {
    this.maxRetries = maxRetries;
    this.logger = logger || console;
  }

  /**
   * Check if retry should be attempted
   */
  shouldRetry(error: Error, attempts: number): boolean {
    if (attempts >= this.maxRetries) {
      return false;
    }

    // Check for non-retryable errors
    if (this.isNonRetryableError(error)) {
      this.logger.warn(`Non-retryable error encountered:`, {
        error: error.message,
        attempts
      });
      return false;
    }

    return true;
  }

  /**
   * Get maximum number of retries
   */
  getMaxRetries(): number {
    return this.maxRetries;
  }

  /**
   * Abstract method to calculate next delay
   */
  abstract getNextDelay(attempts: number): number;

  /**
   * Check if error is non-retryable
   * Can be overridden by subclasses for specific error handling
   */
  protected isNonRetryableError(error: Error): boolean {
    const nonRetryablePatterns = [
      /invalid.*email/i,
      /invalid.*phone/i,
      /authentication.*failed/i,
      /unauthorized/i,
      /forbidden/i,
      /not.*found/i,
      /bad.*request/i,
      /malformed/i,
      /invalid.*token/i
    ];

    return nonRetryablePatterns.some(pattern => pattern.test(error.message));
  }
}

/**
 * Exponential backoff retry strategy
 * Delays increase exponentially with each retry attempt
 */
export class ExponentialBackoffStrategy extends BaseRetryStrategy {
  private baseDelay: number;
  private maxDelay: number;
  private multiplier: number;
  private jitter: boolean;

  constructor(
    maxRetries: number = 3,
    baseDelay: number = 1000, // 1 second
    maxDelay: number = 60000, // 1 minute
    multiplier: number = 2,
    jitter: boolean = true,
    logger?: any
  ) {
    super(maxRetries, logger);
    this.baseDelay = baseDelay;
    this.maxDelay = maxDelay;
    this.multiplier = multiplier;
    this.jitter = jitter;
  }

  /**
   * Calculate exponential backoff delay
   */
  getNextDelay(attempts: number): number {
    // Calculate exponential delay: baseDelay * (multiplier ^ attempts)
    let delay = this.baseDelay * Math.pow(this.multiplier, attempts - 1);
    
    // Cap at maximum delay
    delay = Math.min(delay, this.maxDelay);
    
    // Add jitter to prevent thundering herd problem
    if (this.jitter) {
      delay = this.addJitter(delay);
    }

    this.logger.debug(`Calculated retry delay:`, {
      attempts,
      delay: `${delay}ms`,
      strategy: 'exponential-backoff'
    });

    return delay;
  }

  /**
   * Add random jitter to delay (±25%)
   */
  private addJitter(delay: number): number {
    const jitterRange = delay * 0.25; // 25% jitter
    const jitter = (Math.random() - 0.5) * 2 * jitterRange;
    return Math.max(0, delay + jitter);
  }
}

/**
 * Linear backoff retry strategy
 * Delays increase linearly with each retry attempt
 */
export class LinearBackoffStrategy extends BaseRetryStrategy {
  private baseDelay: number;
  private increment: number;
  private maxDelay: number;

  constructor(
    maxRetries: number = 3,
    baseDelay: number = 1000,
    increment: number = 1000,
    maxDelay: number = 30000,
    logger?: any
  ) {
    super(maxRetries, logger);
    this.baseDelay = baseDelay;
    this.increment = increment;
    this.maxDelay = maxDelay;
  }

  /**
   * Calculate linear backoff delay
   */
  getNextDelay(attempts: number): number {
    // Calculate linear delay: baseDelay + (increment * attempts)
    const delay = Math.min(
      this.baseDelay + (this.increment * (attempts - 1)),
      this.maxDelay
    );

    this.logger.debug(`Calculated retry delay:`, {
      attempts,
      delay: `${delay}ms`,
      strategy: 'linear-backoff'
    });

    return delay;
  }
}

/**
 * Fixed interval retry strategy
 * Uses the same delay for all retry attempts
 */
export class FixedIntervalStrategy extends BaseRetryStrategy {
  private interval: number;

  constructor(
    maxRetries: number = 3,
    interval: number = 5000, // 5 seconds
    logger?: any
  ) {
    super(maxRetries, logger);
    this.interval = interval;
  }

  /**
   * Return fixed delay interval
   */
  getNextDelay(attempts: number): number {
    this.logger.debug(`Calculated retry delay:`, {
      attempts,
      delay: `${this.interval}ms`,
      strategy: 'fixed-interval'
    });

    return this.interval;
  }
}

/**
 * Fibonacci backoff retry strategy
 * Delays follow Fibonacci sequence
 */
export class FibonacciBackoffStrategy extends BaseRetryStrategy {
  private baseDelay: number;
  private maxDelay: number;
  private fibonacciCache: number[] = [1, 1];

  constructor(
    maxRetries: number = 5,
    baseDelay: number = 1000,
    maxDelay: number = 60000,
    logger?: any
  ) {
    super(maxRetries, logger);
    this.baseDelay = baseDelay;
    this.maxDelay = maxDelay;
  }

  /**
   * Calculate Fibonacci backoff delay
   */
  getNextDelay(attempts: number): number {
    const fibNumber = this.getFibonacci(attempts);
    const delay = Math.min(this.baseDelay * fibNumber, this.maxDelay);

    this.logger.debug(`Calculated retry delay:`, {
      attempts,
      fibonacciNumber: fibNumber,
      delay: `${delay}ms`,
      strategy: 'fibonacci-backoff'
    });

    return delay;
  }

  /**
   * Get Fibonacci number for given position
   */
  private getFibonacci(n: number): number {
    if (n <= 0) return 1;
    if (n <= 2) return 1;
    
    // Use cache to avoid recalculation
    while (this.fibonacciCache.length <= n) {
      const len = this.fibonacciCache.length;
      this.fibonacciCache.push(
        this.fibonacciCache[len - 1] + this.fibonacciCache[len - 2]
      );
    }
    
    return this.fibonacciCache[n - 1];
  }
}

/**
 * Adaptive retry strategy
 * Adjusts delays based on error types and success rates
 */
export class AdaptiveRetryStrategy extends BaseRetryStrategy {
  private baseDelay: number;
  private maxDelay: number;
  private successRate: number = 1.0;
  private recentAttempts: boolean[] = []; // Track recent success/failure
  private windowSize: number = 100; // Size of sliding window for success rate

  constructor(
    maxRetries: number = 3,
    baseDelay: number = 1000,
    maxDelay: number = 60000,
    logger?: any
  ) {
    super(maxRetries, logger);
    this.baseDelay = baseDelay;
    this.maxDelay = maxDelay;
  }

  /**
   * Calculate adaptive delay based on success rate and error type
   */
  getNextDelay(attempts: number): number {
    // Base exponential backoff
    let delay = this.baseDelay * Math.pow(2, attempts - 1);
    
    // Adjust based on success rate
    const successRateMultiplier = this.getSuccessRateMultiplier();
    delay *= successRateMultiplier;
    
    // Cap at maximum delay
    delay = Math.min(delay, this.maxDelay);

    this.logger.debug(`Calculated adaptive retry delay:`, {
      attempts,
      successRate: this.successRate.toFixed(3),
      successRateMultiplier: successRateMultiplier.toFixed(2),
      delay: `${delay}ms`,
      strategy: 'adaptive'
    });

    return delay;
  }

  /**
   * Update success rate based on recent attempts
   */
  updateSuccessRate(success: boolean): void {
    this.recentAttempts.push(success);
    
    // Maintain sliding window
    if (this.recentAttempts.length > this.windowSize) {
      this.recentAttempts.shift();
    }
    
    // Calculate success rate
    const successCount = this.recentAttempts.filter(Boolean).length;
    this.successRate = successCount / this.recentAttempts.length;
  }

  /**
   * Get multiplier based on success rate
   */
  private getSuccessRateMultiplier(): number {
    if (this.successRate >= 0.9) {
      return 0.5; // High success rate, reduce delay
    } else if (this.successRate >= 0.7) {
      return 1.0; // Normal success rate, standard delay
    } else if (this.successRate >= 0.5) {
      return 1.5; // Low success rate, increase delay
    } else {
      return 2.0; // Very low success rate, significantly increase delay
    }
  }

  /**
   * Override shouldRetry to consider success rate
   */
  shouldRetry(error: Error, attempts: number): boolean {
    if (!super.shouldRetry(error, attempts)) {
      return false;
    }

    // If success rate is very low, be more conservative with retries
    if (this.successRate < 0.3 && attempts >= 2) {
      this.logger.warn(`Low success rate (${this.successRate.toFixed(3)}), limiting retries`);
      return false;
    }

    return true;
  }
}

/**
 * Channel-specific retry strategy
 * Different retry behavior based on notification channel
 */
export class ChannelSpecificRetryStrategy extends BaseRetryStrategy {
  private strategies: Map<string, RetryStrategy> = new Map();
  private defaultStrategy: RetryStrategy;

  constructor(logger?: any) {
    super(3, logger);
    
    // Initialize default strategy
    this.defaultStrategy = new ExponentialBackoffStrategy(3, 1000, 60000, 2, true, logger);
    
    // Set up channel-specific strategies
    this.initializeChannelStrategies();
  }

  /**
   * Initialize retry strategies for different channels
   */
  private initializeChannelStrategies(): void {
    // Email: Longer delays, more retries (SMTP can be slow)
    this.strategies.set('email', new ExponentialBackoffStrategy(5, 2000, 120000, 2, true, this.logger));
    
    // SMS: Shorter delays, fewer retries (fast failure detection)
    this.strategies.set('sms', new LinearBackoffStrategy(3, 1000, 2000, 15000, this.logger));
    
    // Push: Medium delays, standard retries
    this.strategies.set('push', new ExponentialBackoffStrategy(4, 1000, 60000, 1.5, true, this.logger));
    
    // WebSocket: Fast retries for connection issues
    this.strategies.set('websocket', new LinearBackoffStrategy(5, 500, 1000, 10000, this.logger));
  }

  /**
   * Get delay using channel-specific strategy
   */
  getNextDelay(attempts: number, channel?: string): number {
    const strategy = this.getStrategyForChannel(channel);
    return strategy.getNextDelay(attempts);
  }

  /**
   * Check retry using channel-specific strategy
   */
  shouldRetry(error: Error, attempts: number, channel?: string): boolean {
    const strategy = this.getStrategyForChannel(channel);
    return strategy.shouldRetry(error, attempts);
  }

  /**
   * Get strategy for specific channel
   */
  private getStrategyForChannel(channel?: string): RetryStrategy {
    if (channel && this.strategies.has(channel)) {
      return this.strategies.get(channel)!;
    }
    return this.defaultStrategy;
  }

  /**
   * Register custom strategy for channel
   */
  registerChannelStrategy(channel: string, strategy: RetryStrategy): void {
    this.strategies.set(channel, strategy);
    this.logger.info(`Registered custom retry strategy for channel: ${channel}`);
  }
}

/**
 * Factory for creating retry strategies
 * Implements Factory Pattern for strategy creation
 */
export class RetryStrategyFactory {
  static createStrategy(
    type: 'exponential' | 'linear' | 'fixed' | 'fibonacci' | 'adaptive' | 'channel-specific',
    options: any = {},
    logger?: any
  ): RetryStrategy {
    switch (type) {
      case 'exponential':
        return new ExponentialBackoffStrategy(
          options.maxRetries || 3,
          options.baseDelay || 1000,
          options.maxDelay || 60000,
          options.multiplier || 2,
          options.jitter !== false,
          logger
        );
      
      case 'linear':
        return new LinearBackoffStrategy(
          options.maxRetries || 3,
          options.baseDelay || 1000,
          options.increment || 1000,
          options.maxDelay || 30000,
          logger
        );
      
      case 'fixed':
        return new FixedIntervalStrategy(
          options.maxRetries || 3,
          options.interval || 5000,
          logger
        );
      
      case 'fibonacci':
        return new FibonacciBackoffStrategy(
          options.maxRetries || 5,
          options.baseDelay || 1000,
          options.maxDelay || 60000,
          logger
        );
      
      case 'adaptive':
        return new AdaptiveRetryStrategy(
          options.maxRetries || 3,
          options.baseDelay || 1000,
          options.maxDelay || 60000,
          logger
        );
      
      case 'channel-specific':
        return new ChannelSpecificRetryStrategy(logger);
      
      default:
        throw new Error(`Unknown retry strategy type: ${type}`);
    }
  }
}