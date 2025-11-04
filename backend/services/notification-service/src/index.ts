import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import config from './config/config';
import { createLogger, createRequestLogger, createErrorLogger } from './utils/Logger';
import { createErrorHandler, notFoundHandler, validationErrorHandler } from './utils/ErrorHandler';
import { createMonitoringService } from './utils/Monitoring';
import { NotificationService } from './services/NotificationService';
import { setupNotificationRoutes } from './controllers/NotificationController';

/**
 * Main application entry point
 * Follows Dependency Injection and Inversion of Control principles
 * Implements proper layered architecture with clear separation of concerns
 */
class NotificationServiceApp {
  private app: express.Application;
  private logger: any;
  private errorHandler: any;
  private monitoringService: any;
  private notificationService: NotificationService | null = null;

  constructor() {
    this.app = express();
    this.initializeLogger();
    this.initializeErrorHandler();
    this.initializeMiddleware();
    this.initializeMonitoring();
    this.initializeServices();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  /**
   * Initialize logger with configuration
   */
  private initializeLogger(): void {
    this.logger = createLogger(config.logging, 'notification-service');
    this.logger.info('Logger initialized', {
      level: config.logging.level,
      fileEnabled: config.logging.file?.enabled
    });
  }

  /**
   * Initialize error handler
   */
  private initializeErrorHandler(): void {
    this.errorHandler = createErrorHandler(this.logger);
    this.logger.info('Error handler initialized');
  }

  /**
   * Initialize Express middleware
   */
  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    // CORS configuration
    this.app.use(cors({
      origin: config.server.cors.origin,
      credentials: config.server.cors.credentials,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.server.rateLimit.windowMs,
      max: config.server.rateLimit.max,
      message: {
        error: 'Too many requests from this IP, please try again later.',
        statusCode: 429
      },
      standardHeaders: true,
      legacyHeaders: false
    });
    this.app.use('/api/', limiter);

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use(createRequestLogger(this.logger));

    this.logger.info('Middleware initialized');
  }

  /**
   * Initialize monitoring service
   */
  private initializeMonitoring(): void {
    this.monitoringService = createMonitoringService(config.monitoring, this.logger);
    this.logger.info('Monitoring service initialized');
  }

  /**
   * Initialize notification service and dependencies
   */
  private initializeServices(): void {
    try {
      this.notificationService = new NotificationService(
        config.channels,
        config.queue,
        this.logger
      );

      // Add monitoring observer to notification service
      this.notificationService.addObserver(this.monitoringService);

      this.logger.info('Notification service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize notification service:', error);
      throw error;
    }
  }

  /**
   * Initialize API routes
   */
  private initializeRoutes(): void {
    // Health check endpoint (no rate limiting)
    this.app.get('/health', async (req, res) => {
      try {
        if (!this.notificationService) {
          res.status(503).json({
            status: 'unhealthy',
            error: 'Notification service not initialized'
          });
          return;
        }

        const healthStatus = await this.notificationService.getHealthStatus();
        const healthChecks = await this.monitoringService.runHealthChecks();
        
        const overallHealthy = Object.values(healthStatus.channels).every(healthy => healthy) &&
                               Object.values(healthChecks).every(check => check.healthy);

        res.status(overallHealthy ? 200 : 503).json({
          ...healthStatus,
          healthChecks,
          monitoring: {
            alerts: this.monitoringService.getActiveAlerts().length,
            metrics: this.monitoringService.getDetailedMetrics()
          }
        });
      } catch (error) {
        this.logger.error('Health check failed:', error);
        res.status(503).json({
          status: 'unhealthy',
          error: 'Health check failed'
        });
      }
    });

    // Metrics endpoint for Prometheus
    this.app.get('/metrics', (req, res) => {
      try {
        const prometheusMetrics = this.monitoringService.exportPrometheusMetrics();
        res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        res.send(prometheusMetrics);
      } catch (error) {
        this.logger.error('Failed to export metrics:', error);
        res.status(500).send('Error exporting metrics');
      }
    });

    // API routes
    if (this.notificationService) {
      setupNotificationRoutes(this.app, this.notificationService, this.logger);
    }

    // API documentation
    this.app.get('/api', (req, res) => {
      res.json({
        service: 'SignaAI Notification Service',
        version: '1.0.0',
        description: 'Production-ready notification service with OOP design patterns',
        endpoints: {
          health: 'GET /health',
          metrics: 'GET /metrics',
          notifications: {
            send: 'POST /api/notifications',
            batch: 'POST /api/notifications/batch',
            template: 'POST /api/notifications/template',
            schedule: 'POST /api/notifications/schedule',
            cancel: 'DELETE /api/notifications/:id',
            get: 'GET /api/notifications/:id'
          },
          users: {
            notifications: 'GET /api/users/:userId/notifications'
          },
          templates: {
            create: 'POST /api/templates',
            list: 'GET /api/templates',
            preview: 'POST /api/templates/:id/preview'
          }
        },
        channels: Object.keys(config.channels).filter(key => config.channels[key].enabled),
        features: [
          'Multi-channel notifications (Email, SMS, Push, WebSocket)',
          'Template-based notifications',
          'Priority queuing with retry logic',
          'Real-time delivery tracking',
          'Comprehensive monitoring and metrics',
          'Rate limiting and security',
          'Graceful error handling'
        ]
      });
    });

    this.logger.info('Routes initialized');
  }

  /**
   * Initialize error handling middleware
   */
  private initializeErrorHandling(): void {
    // Validation error handler
    this.app.use(validationErrorHandler());

    // Error logger
    this.app.use(createErrorLogger(this.logger));

    // 404 handler
    this.app.use(notFoundHandler());

    // Global error handler (must be last)
    this.app.use(this.errorHandler.handleError());

    this.logger.info('Error handling initialized');
  }

  /**
   * Start the server
   */
  public async start(): Promise<void> {
    const port = config.server.port;
    const host = config.server.host;

    const server = this.app.listen(port, host, () => {
      this.logger.info('Notification service started successfully', {
        port,
        host,
        environment: process.env.NODE_ENV || 'development',
        pid: process.pid,
        channels: Object.keys(config.channels).filter(key => config.channels[key].enabled),
        features: {
          monitoring: config.monitoring.metricsEnabled,
          alerting: config.monitoring.alerting.enabled,
          fileLogging: config.logging.file?.enabled
        }
      });
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
      this.logger.info(`Received ${signal}, starting graceful shutdown...`);
      
      server.close(async () => {
        try {
          // Shutdown notification service
          if (this.notificationService) {
            await this.notificationService.shutdown();
          }

          // Shutdown monitoring
          if (this.monitoringService) {
            this.monitoringService.shutdown();
          }

          // Close logger
          this.logger.close();

          this.logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          this.logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after timeout
      setTimeout(() => {
        this.logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught Exception:', error);
      gracefulShutdown('Uncaught Exception');
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled Rejection:', { reason, promise });
      gracefulShutdown('Unhandled Rejection');
    });
  }

  /**
   * Get Express app instance (for testing)
   */
  public getApp(): express.Application {
    return this.app;
  }

  /**
   * Get notification service instance (for testing)
   */
  public getNotificationService(): NotificationService | null {
    return this.notificationService;
  }
}

/**
 * Create and start the application
 */
async function main(): Promise<void> {
  try {
    const app = new NotificationServiceApp();
    await app.start();
  } catch (error) {
    console.error('Failed to start notification service:', error);
    process.exit(1);
  }
}

// Start the application if this file is run directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Application startup failed:', error);
    process.exit(1);
  });
}

export { NotificationServiceApp };
export default main;