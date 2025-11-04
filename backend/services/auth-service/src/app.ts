import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { AuthController } from './controllers/AuthController';
import { AuthenticationService } from './services/AuthenticationService';
import { UserRepository } from './repositories/UserRepository';
import { JwtTokenService } from './services/JwtTokenService';
import { BcryptPasswordService } from './services/BcryptPasswordService';
import { AuthMiddleware } from './middleware/AuthMiddleware';
import { DependencyContainer, ServiceLocator } from '../../../shared/core/DependencyContainer';
import { ServiceDiscovery } from '../../../shared/core/ServiceRegistry';
import { EventBus } from '../../../shared/messaging/EventBus';
import { BaseException } from '../../../shared/exceptions/BaseException';
import { dbRun, dbGet, dbAll } from '../../../src/db/database';

/**
 * Authentication Service Application
 * Microservice for handling authentication and authorization
 */
export class AuthServiceApp {
  private app: Application;
  private container: DependencyContainer;
  private port: number;
  private serviceName = 'auth-service';

  constructor(port: number = 5001) {
    this.app = express();
    this.port = port;
    this.container = DependencyContainer.getInstance();
    this.initializeMiddleware();
    this.initializeDependencies();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  /**
   * Initialize middleware
   */
  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    
    // CORS
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Logging
    if (process.env.NODE_ENV !== 'test') {
      this.app.use(morgan('combined'));
    }

    // Request ID middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      req.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('X-Request-Id', req.id);
      next();
    });
  }

  /**
   * Initialize dependency injection
   */
  private async initializeDependencies(): Promise<void> {
    // Register database
    this.container.registerSingleton('Database', { run: dbRun, get: dbGet, all: dbAll });

    // Register services
    this.container.registerSingleton('ITokenService', JwtTokenService);
    this.container.registerSingleton('IPasswordService', BcryptPasswordService);

    // Register repository
    this.container.registerSingleton('UserRepository', async () => {
      const db = await this.container.resolve('Database');
      return new UserRepository(db);
    });

    // Register authentication service
    this.container.registerSingleton('AuthenticationService', async () => {
      const userRepo = await this.container.resolve('UserRepository');
      const tokenService = await this.container.resolve('ITokenService');
      const passwordService = await this.container.resolve('IPasswordService');
      return new AuthenticationService(userRepo, tokenService, passwordService);
    });

    // Register controller
    this.container.registerSingleton('AuthController', async () => {
      const authService = await this.container.resolve('AuthenticationService');
      return new AuthController(authService);
    });

    // Register middleware
    this.container.registerSingleton('AuthMiddleware', async () => {
      const tokenService = await this.container.resolve('ITokenService');
      return new AuthMiddleware(tokenService);
    });
  }

  /**
   * Initialize routes
   */
  private async initializeRoutes(): Promise<void> {
    const authController = await this.container.resolve<AuthController>('AuthController');
    const authMiddleware = await this.container.resolve<AuthMiddleware>('AuthMiddleware');

    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        service: this.serviceName,
        timestamp: new Date().toISOString()
      });
    });

    // Authentication routes (public)
    this.app.post('/auth/register', authController.register);
    this.app.post('/auth/login', authController.login);
    this.app.post('/auth/refresh', authController.refreshToken);
    this.app.post('/auth/verify', authController.verifyToken);

    // Protected routes
    this.app.get('/auth/profile', authMiddleware.authenticate, authController.getProfile);
    this.app.post('/auth/logout', authMiddleware.authenticate, authController.logout);
    this.app.put('/auth/password', authMiddleware.authenticate, authController.updatePassword);

    // Service health
    this.app.get('/auth/health', authController.healthCheck);

    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.originalUrl
      });
    });
  }

  /**
   * Initialize error handling
   */
  private initializeErrorHandling(): void {
    // Global error handler
    this.app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      if (err instanceof BaseException) {
        err.log();
        res.status(err.statusCode).json({
          success: false,
          error: err.message,
          details: err.toJSON(),
          requestId: req.id
        });
      } else {
        console.error('Unhandled error:', err);
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          requestId: req.id
        });
      }
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      process.exit(1);
    });
  }

  /**
   * Start the service
   */
  public async start(): Promise<void> {
    try {
      // Initialize dependencies
      await this.initializeDependencies();
      await this.initializeRoutes();

      // Register with service discovery
      await ServiceDiscovery.register(
        this.serviceName,
        'localhost',
        this.port,
        {
          version: '1.0.0',
          protocol: 'http',
          healthEndpoint: '/health'
        }
      );

      // Start server
      this.app.listen(this.port, () => {
        console.log(`🚀 ${this.serviceName} running on http://localhost:${this.port}`);
        console.log(`📍 Health check: http://localhost:${this.port}/health`);
      });
    } catch (error) {
      console.error('Failed to start authentication service:', error);
      process.exit(1);
    }
  }

  /**
   * Stop the service
   */
  public async stop(): Promise<void> {
    console.log(`Shutting down ${this.serviceName}...`);
    // Cleanup logic here
    process.exit(0);
  }

  /**
   * Get Express app instance
   */
  public getApp(): Application {
    return this.app;
  }
}

// Export for testing
export default AuthServiceApp;

// Start service if run directly
if (require.main === module) {
  const port = parseInt(process.env.PORT || '5001');
  const service = new AuthServiceApp(port);
  service.start();

  // Graceful shutdown
  process.on('SIGTERM', () => service.stop());
  process.on('SIGINT', () => service.stop());
}