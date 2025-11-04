import dotenv from 'dotenv';
import { ApiGateway } from './gateway/ApiGateway';
import { ServiceDiscovery } from '../../../shared/core/ServiceRegistry';

// Load environment variables
dotenv.config();

/**
 * API Gateway Application
 * Entry point for the gateway service
 */
class GatewayApp {
  private gateway: ApiGateway;
  private port: number;

  constructor() {
    this.port = parseInt(process.env.GATEWAY_PORT || '5100');
    this.gateway = new ApiGateway(this.port);
  }

  /**
   * Start the gateway application
   */
  public async start(): Promise<void> {
    try {
      console.log('🚀 Starting API Gateway...');
      
      // Register gateway with service discovery
      await ServiceDiscovery.register(
        'api-gateway',
        'localhost',
        this.port,
        {
          version: '1.0.0',
          protocol: 'http',
          healthEndpoint: '/health',
          metadata: {
            type: 'gateway',
            services: ['auth', 'documents', 'signatures', 'workflows', 'notifications']
          }
        }
      );

      // Start the gateway
      await this.gateway.start();

      // Setup graceful shutdown
      this.setupGracefulShutdown();
    } catch (error) {
      console.error('Failed to start API Gateway:', error);
      process.exit(1);
    }
  }

  /**
   * Setup graceful shutdown
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(`\n⚠️  ${signal} received, shutting down gracefully...`);
      
      try {
        // Add cleanup logic here
        console.log('✅ Gateway shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    // Handle termination signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      shutdown('uncaughtException');
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  }
}

// Start the application
if (require.main === module) {
  const app = new GatewayApp();
  app.start();
}

export default GatewayApp;