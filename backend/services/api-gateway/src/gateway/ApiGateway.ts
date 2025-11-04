import express, { Application, Request, Response, NextFunction } from 'express';
import httpProxy from 'http-proxy-middleware';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { ServiceDiscovery, IServiceInstance } from '../../../../shared/core/ServiceRegistry';
import { BaseException } from '../../../../shared/exceptions/BaseException';

/**
 * Route Configuration Interface
 */
interface RouteConfig {
  path: string;
  service: string;
  methods?: string[];
  rateLimit?: {
    windowMs: number;
    max: number;
  };
  authentication?: boolean;
  authorization?: string[];
  transform?: {
    request?: (req: Request) => void;
    response?: (data: any) => any;
  };
}

/**
 * API Gateway Class
 * Implements Gateway Pattern for microservices
 * Handles routing, load balancing, authentication, and rate limiting
 */
export class ApiGateway {
  private app: Application;
  private port: number;
  private routes: RouteConfig[];
  private proxyCache: Map<string, any> = new Map();

  constructor(port: number = 5100) {
    this.app = express();
    this.port = port;
    this.routes = this.loadRouteConfiguration();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  /**
   * Load route configuration
   * In production, this would be loaded from a config file or database
   */
  private loadRouteConfiguration(): RouteConfig[] {
    return [
      {
        path: '/api/auth',
        service: 'auth-service',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        rateLimit: {
          windowMs: 15 * 60 * 1000, // 15 minutes
          max: 10 // limit each IP to 10 requests per windowMs
        },
        authentication: false
      },
      {
        path: '/api/documents',
        service: 'document-service',
        authentication: true,
        authorization: ['sender', 'admin']
      },
      {
        path: '/api/signatures',
        service: 'signature-service',
        authentication: true,
        authorization: ['sender', 'signer', 'admin']
      },
      {
        path: '/api/workflows',
        service: 'workflow-service',
        authentication: true,
        authorization: ['sender', 'admin']
      },
      {
        path: '/api/notifications',
        service: 'notification-service',
        authentication: true
      }
    ];
  }

  /**
   * Initialize middleware
   */
  private initializeMiddleware(): void {
    // Security headers
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: this.configureCorsOrigins(),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'X-Response-Time']
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging
    if (process.env.NODE_ENV !== 'test') {
      this.app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));
    }

    // Request ID and timing middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      req.id = this.generateRequestId();
      res.setHeader('X-Request-Id', req.id);
      
      const startTime = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        res.setHeader('X-Response-Time', `${duration}ms`);
        this.logRequest(req, res, duration);
      });
      
      next();
    });

    // Global rate limiting
    const globalLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/', globalLimiter);
  }

  /**
   * Initialize routes
   */
  private initializeRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      this.handleHealthCheck(req, res);
    });

    // Service status endpoint
    this.app.get('/status', async (req: Request, res: Response) => {
      await this.handleServiceStatus(req, res);
    });

    // Setup proxy routes for each service
    this.routes.forEach(route => {
      this.setupProxyRoute(route);
    });

    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: 'Route not found',
        path: req.originalUrl,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Setup proxy route for a service
   */
  private setupProxyRoute(config: RouteConfig): void {
    // Apply rate limiting if configured
    if (config.rateLimit) {
      const limiter = rateLimit({
        windowMs: config.rateLimit.windowMs,
        max: config.rateLimit.max,
        message: `Too many requests to ${config.path}`,
        skipFailedRequests: true,
        skipSuccessfulRequests: false,
      });
      this.app.use(config.path, limiter);
    }

    // Apply authentication if required
    if (config.authentication) {
      this.app.use(config.path, this.authenticationMiddleware);
    }

    // Apply authorization if required
    if (config.authorization && config.authorization.length > 0) {
      this.app.use(config.path, this.authorizationMiddleware(config.authorization));
    }

    // Setup proxy
    this.app.use(config.path, async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Apply request transformation if configured
        if (config.transform?.request) {
          config.transform.request(req);
        }

        // Get service instance
        const serviceUrl = await ServiceDiscovery.getServiceUrl(config.service);
        
        if (!serviceUrl) {
          throw new Error(`Service ${config.service} is not available`);
        }

        // Create or get proxy
        const proxy = this.getOrCreateProxy(config.service, serviceUrl);

        // Proxy the request
        proxy(req, res, next);
      } catch (error) {
        this.handleProxyError(error, config.service, req, res);
      }
    });
  }

  /**
   * Get or create proxy for service
   */
  private getOrCreateProxy(serviceName: string, serviceUrl: string): any {
    const cacheKey = `${serviceName}-${serviceUrl}`;
    
    if (this.proxyCache.has(cacheKey)) {
      return this.proxyCache.get(cacheKey);
    }

    const proxy = httpProxy.createProxyMiddleware({
      target: serviceUrl,
      changeOrigin: true,
      pathRewrite: {
        [`^/api/${serviceName.replace('-service', '')}`]: ''
      },
      onProxyReq: (proxyReq, req: any) => {
        // Add request ID header
        if (req.id) {
          proxyReq.setHeader('X-Request-Id', req.id);
        }
        // Forward user info if authenticated
        if (req.user) {
          proxyReq.setHeader('X-User-Id', req.user.userId);
          proxyReq.setHeader('X-User-Role', req.user.role);
        }
      },
      onProxyRes: (proxyRes, req, res) => {
        // Add CORS headers
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
      },
      onError: (err, req, res: any) => {
        console.error(`Proxy error for ${serviceName}:`, err);
        res.status(503).json({
          success: false,
          error: `Service ${serviceName} is currently unavailable`,
          requestId: (req as any).id
        });
      }
    });

    this.proxyCache.set(cacheKey, proxy);
    return proxy;
  }

  /**
   * Authentication middleware
   */
  private authenticationMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = this.extractToken(req);
      
      if (!token) {
        res.status(401).json({
          success: false,
          error: 'No authentication token provided'
        });
        return;
      }

      // Verify token with auth service
      const authServiceUrl = await ServiceDiscovery.getServiceUrl('auth-service');
      
      if (!authServiceUrl) {
        throw new Error('Authentication service is not available');
      }

      const response = await fetch(`${authServiceUrl}/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token })
      });

      if (!response.ok) {
        res.status(401).json({
          success: false,
          error: 'Invalid authentication token'
        });
        return;
      }

      const result = await response.json();
      
      if (!result.data.valid) {
        res.status(401).json({
          success: false,
          error: 'Invalid authentication token'
        });
        return;
      }

      // Attach user info to request
      (req as any).user = result.data.payload;
      next();
    } catch (error) {
      console.error('Authentication error:', error);
      res.status(503).json({
        success: false,
        error: 'Authentication service unavailable'
      });
    }
  };

  /**
   * Authorization middleware factory
   */
  private authorizationMiddleware = (allowedRoles: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      const user = (req as any).user;
      
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
        return;
      }

      if (!allowedRoles.includes(user.role)) {
        res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          required: allowedRoles,
          current: user.role
        });
        return;
      }

      next();
    };
  };

  /**
   * Extract token from request
   */
  private extractToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    
    return null;
  }

  /**
   * Handle health check
   */
  private handleHealthCheck(req: Request, res: Response): void {
    res.json({
      status: 'healthy',
      service: 'api-gateway',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  }

  /**
   * Handle service status
   */
  private async handleServiceStatus(req: Request, res: Response): Promise<void> {
    const services = await ServiceDiscovery['registry'].getAllServices();
    const status: Record<string, any> = {};

    for (const [name, instances] of services) {
      status[name] = {
        instances: instances.length,
        healthy: instances.filter(i => i.status === 'up').length,
        unhealthy: instances.filter(i => i.status === 'down').length
      };
    }

    res.json({
      success: true,
      services: status,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle proxy error
   */
  private handleProxyError(error: any, service: string, req: Request, res: Response): void {
    console.error(`Error proxying to ${service}:`, error);
    
    res.status(503).json({
      success: false,
      error: `Service ${service} is currently unavailable`,
      message: error.message,
      requestId: req.id
    });
  }

  /**
   * Configure CORS origins
   */
  private configureCorsOrigins(): string[] | boolean {
    const origins = process.env.CORS_ORIGINS;
    
    if (!origins || origins === '*') {
      return true;
    }
    
    return origins.split(',').map(origin => origin.trim());
  }

  /**
   * Generate request ID
   */
  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log request
   */
  private logRequest(req: Request, res: Response, duration: number): void {
    const log = {
      requestId: req.id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.connection.remoteAddress,
      timestamp: new Date().toISOString()
    };

    if (res.statusCode >= 400) {
      console.error('Request error:', log);
    } else if (process.env.NODE_ENV !== 'production') {
      console.log('Request:', log);
    }
  }

  /**
   * Initialize error handling
   */
  private initializeErrorHandling(): void {
    // Global error handler
    this.app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      console.error('Gateway error:', err);
      
      if (err instanceof BaseException) {
        res.status(err.statusCode).json({
          success: false,
          error: err.message,
          details: err.toJSON(),
          requestId: req.id
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          message: process.env.NODE_ENV !== 'production' ? err.message : undefined,
          requestId: req.id
        });
      }
    });
  }

  /**
   * Start the gateway
   */
  public async start(): Promise<void> {
    this.app.listen(this.port, () => {
      console.log(`🌐 API Gateway running on http://localhost:${this.port}`);
      console.log(`📍 Health check: http://localhost:${this.port}/health`);
      console.log(`📊 Service status: http://localhost:${this.port}/status`);
    });
  }

  /**
   * Get Express app
   */
  public getApp(): Application {
    return this.app;
  }
}