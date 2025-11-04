import 'reflect-metadata';
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { Database } from 'sqlite3';
import { EventEmitter } from 'events';
import { SignatureController } from './controllers/SignatureController';
import { SignatureService, SignatureEvent } from './services/SignatureService';
import { SQLiteSignatureRepository } from './repositories/SignatureRepository';

/**
 * Dependency Injection Container
 * Manages service lifecycle and dependencies
 */
class DIContainer {
  private static instance: DIContainer;
  private services: Map<string, any> = new Map();

  private constructor() {}

  static getInstance(): DIContainer {
    if (!DIContainer.instance) {
      DIContainer.instance = new DIContainer();
    }
    return DIContainer.instance;
  }

  register<T>(key: string, factory: () => T): void {
    this.services.set(key, factory());
  }

  get<T>(key: string): T {
    if (!this.services.has(key)) {
      throw new Error(`Service ${key} not registered`);
    }
    return this.services.get(key);
  }
}

/**
 * Application class following OOP principles
 * Encapsulates server setup and configuration
 */
class SignatureServiceApplication {
  private app: Application;
  private container: DIContainer;
  private port: number;

  constructor(port: number = 5003) {
    this.app = express();
    this.container = DIContainer.getInstance();
    this.port = port;
  }

  /**
   * Initialize all dependencies
   */
  private initializeDependencies(): void {
    // Initialize database
    this.container.register('database', () => {
      const db = new Database(':memory:', (err) => {
        if (err) {
          console.error('Database initialization failed:', err);
          process.exit(1);
        }
      });
      return db;
    });

    // Initialize event emitter
    this.container.register('eventEmitter', () => new EventEmitter());

    // Initialize repository
    this.container.register('signatureRepository', () => {
      const db = this.container.get<Database>('database');
      return new SQLiteSignatureRepository(db);
    });

    // Initialize service
    this.container.register('signatureService', () => {
      const repository = this.container.get<SQLiteSignatureRepository>('signatureRepository');
      const eventEmitter = this.container.get<EventEmitter>('eventEmitter');
      return new SignatureService(repository, eventEmitter);
    });

    // Initialize controller
    this.container.register('signatureController', () => {
      const service = this.container.get<SignatureService>('signatureService');
      return new SignatureController(service);
    });
  }

  /**
   * Configure middleware
   */
  private configureMiddleware(): void {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(morgan('combined'));
  }

  /**
   * Configure routes
   */
  private configureRoutes(): void {
    const controller = this.container.get<SignatureController>('signatureController');

    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        service: 'signature-service',
        timestamp: new Date().toISOString()
      });
    });

    // Signature routes
    this.app.post('/api/signatures', 
      (req, res, next) => controller.createSignature(req, res, next));
    
    this.app.get('/api/signatures/:id', 
      (req, res, next) => controller.getSignature(req, res, next));
    
    this.app.post('/api/signatures/:id/apply', 
      (req, res, next) => controller.applySignature(req, res, next));
    
    this.app.post('/api/signatures/:id/verify', 
      (req, res, next) => controller.verifySignature(req, res, next));
    
    this.app.post('/api/signatures/:id/reject', 
      (req, res, next) => controller.rejectSignature(req, res, next));
    
    this.app.get('/api/signatures/:id/thumbnail', 
      (req, res, next) => controller.getThumbnail(req, res, next));
    
    this.app.get('/api/signatures/:id/audit', 
      (req, res, next) => controller.getAuditTrail(req, res, next));
    
    this.app.get('/api/signatures/document/:documentId', 
      (req, res, next) => controller.getDocumentSignatures(req, res, next));
    
    this.app.get('/api/signatures/signer/:signerId', 
      (req, res, next) => controller.getSignerSignatures(req, res, next));
    
    this.app.get('/api/signatures/status/:status', 
      (req, res, next) => controller.getSignaturesByStatus(req, res, next));
    
    this.app.post('/api/signatures/batch', 
      (req, res, next) => controller.createBatchSignatures(req, res, next));
    
    this.app.get('/api/signers/:signerId/history', 
      (req, res, next) => controller.getSignerHistory(req, res, next));
    
    this.app.get('/api/signatures/statistics', 
      (req, res, next) => controller.getStatistics(req, res, next));
    
    this.app.get('/api/signatures/compliance-report', 
      (req, res, next) => controller.generateComplianceReport(req, res, next));
    
    this.app.post('/api/signatures/process-expired', 
      (req, res, next) => controller.processExpiredSignatures(req, res, next));
  }

  /**
   * Configure error handling
   */
  private configureErrorHandling(): void {
    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not found',
        path: req.path
      });
    });

    // Global error handler
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('Error:', err);
      
      res.status(500).json({
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      });
    });
  }

  /**
   * Configure event listeners
   */
  private configureEventListeners(): void {
    const eventEmitter = this.container.get<EventEmitter>('eventEmitter');

    // Log signature events
    eventEmitter.on(SignatureEvent.CREATED, (data) => {
      console.log('Signature created:', data);
    });

    eventEmitter.on(SignatureEvent.SIGNED, (data) => {
      console.log('Signature signed:', data);
    });

    eventEmitter.on(SignatureEvent.VERIFIED, (data) => {
      console.log('Signature verified:', data);
    });

    eventEmitter.on(SignatureEvent.REJECTED, (data) => {
      console.log('Signature rejected:', data);
    });

    eventEmitter.on(SignatureEvent.EXPIRED, (data) => {
      console.log('Signature expired:', data);
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    try {
      // Initialize dependencies
      this.initializeDependencies();
      
      // Configure application
      this.configureMiddleware();
      this.configureRoutes();
      this.configureErrorHandling();
      this.configureEventListeners();

      // Start expired signature processor (runs every hour)
      this.startExpiredSignatureProcessor();

      // Start server
      this.app.listen(this.port, () => {
        console.log(`🚀 Signature Service running on port ${this.port}`);
        console.log(`📍 Health check: http://localhost:${this.port}/health`);
        console.log(`🔐 Service ready to handle digital signatures`);
      });
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Start background job for processing expired signatures
   */
  private startExpiredSignatureProcessor(): void {
    const service = this.container.get<SignatureService>('signatureService');
    
    // Run every hour
    setInterval(async () => {
      try {
        const count = await service.processExpiredSignatures();
        if (count > 0) {
          console.log(`Processed ${count} expired signatures`);
        }
      } catch (error) {
        console.error('Error processing expired signatures:', error);
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down Signature Service...');
    
    const db = this.container.get<Database>('database');
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      }
      process.exit(0);
    });
  }
}

/**
 * Main entry point
 */
const app = new SignatureServiceApplication();

// Handle graceful shutdown
process.on('SIGTERM', () => app.shutdown());
process.on('SIGINT', () => app.shutdown());

// Start the application
app.start().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});