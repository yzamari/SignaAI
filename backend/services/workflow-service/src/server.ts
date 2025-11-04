/**
 * Workflow Service Server
 * Entry point for the microservice
 */

import 'reflect-metadata';
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { InversifyExpressServer } from 'inversify-express-utils';
import { container } from './container/inversify.config';
import * as dotenv from 'dotenv';
import winston from 'winston';

// Load environment variables
dotenv.config();

/**
 * Logger configuration
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'workflow-service.log' })
  ]
});

/**
 * Error handler middleware
 */
function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  logger.error('Unhandled error:', err);
  
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
}

/**
 * Health check endpoint
 */
function healthCheck(req: Request, res: Response): void {
  res.json({
    status: 'healthy',
    service: 'workflow-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  });
}

/**
 * Create and configure server
 */
function createServer(): Application {
  // Import controllers to register them
  import('./controllers/WorkflowController');
  
  // Create InversifyExpressServer
  const server = new InversifyExpressServer(container);
  
  // Configure middleware
  server.setConfig((app) => {
    // CORS configuration
    app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
    }));
    
    // Body parsing
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));
    
    // Request logging
    app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        query: req.query,
        body: req.method !== 'GET' ? req.body : undefined
      });
      next();
    });
    
    // Health check
    app.get('/health', healthCheck);
    
    // API documentation endpoint
    app.get('/api/docs', (req, res) => {
      res.json({
        service: 'Workflow Service',
        version: '1.0.0',
        endpoints: [
          {
            method: 'POST',
            path: '/api/workflows',
            description: 'Create a new workflow definition'
          },
          {
            method: 'POST',
            path: '/api/workflows/start',
            description: 'Start a workflow instance'
          },
          {
            method: 'GET',
            path: '/api/workflows/instances/:instanceId',
            description: 'Get workflow instance status'
          },
          {
            method: 'POST',
            path: '/api/workflows/instances/:instanceId/execute-next',
            description: 'Execute next step in workflow'
          },
          {
            method: 'PUT',
            path: '/api/workflows/instances/:instanceId/pause',
            description: 'Pause workflow instance'
          },
          {
            method: 'PUT',
            path: '/api/workflows/instances/:instanceId/resume',
            description: 'Resume workflow instance'
          },
          {
            method: 'PUT',
            path: '/api/workflows/instances/:instanceId/cancel',
            description: 'Cancel workflow instance'
          },
          {
            method: 'POST',
            path: '/api/workflows/instances/:instanceId/retry',
            description: 'Retry failed step'
          },
          {
            method: 'GET',
            path: '/api/workflow-templates',
            description: 'Get workflow templates'
          },
          {
            method: 'GET',
            path: '/api/workflow-stats',
            description: 'Get workflow statistics'
          }
        ]
      });
    });
  });
  
  // Configure error handling
  server.setErrorConfig((app) => {
    app.use(errorHandler);
  });
  
  return server.build();
}

/**
 * Start the server
 */
async function startServer(): Promise<void> {
  try {
    const app = createServer();
    const PORT = process.env.PORT || 3004;
    
    app.listen(PORT, () => {
      logger.info(`Workflow Service started on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
      logger.info(`API docs: http://localhost:${PORT}/api/docs`);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      process.exit(0);
    });
    
    process.on('SIGINT', () => {
      logger.info('SIGINT signal received: closing HTTP server');
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();