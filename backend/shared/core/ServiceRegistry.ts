/**
 * Service Instance Interface
 * Represents a registered service instance
 */
export interface IServiceInstance {
  id: string;
  name: string;
  version: string;
  host: string;
  port: number;
  protocol: 'http' | 'https';
  healthEndpoint: string;
  metadata?: Record<string, any>;
  registeredAt: Date;
  lastHealthCheck?: Date;
  status: 'up' | 'down' | 'unknown';
}

/**
 * Service Registry Interface
 * Defines contract for service discovery
 */
export interface IServiceRegistry {
  register(service: IServiceInstance): Promise<void>;
  deregister(serviceId: string): Promise<void>;
  discover(serviceName: string): Promise<IServiceInstance[]>;
  getService(serviceName: string): Promise<IServiceInstance | null>;
  healthCheck(serviceId: string): Promise<boolean>;
  getAllServices(): Promise<Map<string, IServiceInstance[]>>;
}

/**
 * Service Registry Implementation
 * Implements Service Discovery Pattern
 */
export class ServiceRegistry implements IServiceRegistry {
  private static instance: ServiceRegistry;
  private services: Map<string, IServiceInstance[]> = new Map();
  private healthCheckInterval: number = 30000; // 30 seconds
  private healthCheckTimers: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {
    this.startHealthCheckMonitor();
  }

  public static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  /**
   * Register a service instance
   */
  public async register(service: IServiceInstance): Promise<void> {
    const { name } = service;
    
    if (!this.services.has(name)) {
      this.services.set(name, []);
    }
    
    const instances = this.services.get(name)!;
    
    // Remove existing instance if already registered
    const existingIndex = instances.findIndex(s => s.id === service.id);
    if (existingIndex !== -1) {
      instances.splice(existingIndex, 1);
    }
    
    // Add new instance
    service.registeredAt = new Date();
    service.status = 'unknown';
    instances.push(service);
    
    // Start health monitoring for this service
    this.startHealthMonitoring(service);
    
    console.log(`Service registered: ${name} at ${service.host}:${service.port}`);
  }

  /**
   * Deregister a service instance
   */
  public async deregister(serviceId: string): Promise<void> {
    for (const [name, instances] of this.services.entries()) {
      const index = instances.findIndex(s => s.id === serviceId);
      
      if (index !== -1) {
        instances.splice(index, 1);
        
        // Stop health monitoring
        const timer = this.healthCheckTimers.get(serviceId);
        if (timer) {
          clearInterval(timer);
          this.healthCheckTimers.delete(serviceId);
        }
        
        // Remove service name entry if no instances left
        if (instances.length === 0) {
          this.services.delete(name);
        }
        
        console.log(`Service deregistered: ${serviceId}`);
        return;
      }
    }
  }

  /**
   * Discover all healthy instances of a service
   */
  public async discover(serviceName: string): Promise<IServiceInstance[]> {
    const instances = this.services.get(serviceName) || [];
    return instances.filter(instance => instance.status === 'up');
  }

  /**
   * Get a single healthy service instance (with load balancing)
   */
  public async getService(serviceName: string): Promise<IServiceInstance | null> {
    const healthyInstances = await this.discover(serviceName);
    
    if (healthyInstances.length === 0) {
      return null;
    }
    
    // Simple round-robin load balancing
    const index = Math.floor(Math.random() * healthyInstances.length);
    return healthyInstances[index];
  }

  /**
   * Perform health check for a service
   */
  public async healthCheck(serviceId: string): Promise<boolean> {
    const service = this.findServiceById(serviceId);
    
    if (!service) {
      return false;
    }
    
    try {
      const url = `${service.protocol}://${service.host}:${service.port}${service.healthEndpoint}`;
      const response = await this.performHttpHealthCheck(url);
      
      service.status = response ? 'up' : 'down';
      service.lastHealthCheck = new Date();
      
      return response;
    } catch (error) {
      service.status = 'down';
      service.lastHealthCheck = new Date();
      console.error(`Health check failed for ${serviceId}:`, error);
      return false;
    }
  }

  /**
   * Get all registered services
   */
  public async getAllServices(): Promise<Map<string, IServiceInstance[]>> {
    return new Map(this.services);
  }

  /**
   * Find service instance by ID
   */
  private findServiceById(serviceId: string): IServiceInstance | null {
    for (const instances of this.services.values()) {
      const service = instances.find(s => s.id === serviceId);
      if (service) {
        return service;
      }
    }
    return null;
  }

  /**
   * Start health monitoring for a service
   */
  private startHealthMonitoring(service: IServiceInstance): void {
    // Clear existing timer if any
    const existingTimer = this.healthCheckTimers.get(service.id);
    if (existingTimer) {
      clearInterval(existingTimer);
    }
    
    // Perform initial health check
    this.healthCheck(service.id);
    
    // Set up periodic health checks
    const timer = setInterval(() => {
      this.healthCheck(service.id);
    }, this.healthCheckInterval);
    
    this.healthCheckTimers.set(service.id, timer);
  }

  /**
   * Start global health check monitor
   */
  private startHealthCheckMonitor(): void {
    setInterval(() => {
      for (const instances of this.services.values()) {
        for (const service of instances) {
          if (!service.lastHealthCheck || 
              Date.now() - service.lastHealthCheck.getTime() > this.healthCheckInterval * 2) {
            this.healthCheck(service.id);
          }
        }
      }
    }, this.healthCheckInterval);
  }

  /**
   * Perform HTTP health check
   */
  private async performHttpHealthCheck(url: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get service statistics
   */
  public getStatistics(): {
    totalServices: number;
    totalInstances: number;
    healthyInstances: number;
    unhealthyInstances: number;
    serviceBreakdown: Record<string, { total: number; healthy: number }>;
  } {
    let totalInstances = 0;
    let healthyInstances = 0;
    let unhealthyInstances = 0;
    const serviceBreakdown: Record<string, { total: number; healthy: number }> = {};
    
    for (const [name, instances] of this.services.entries()) {
      const healthy = instances.filter(s => s.status === 'up').length;
      const total = instances.length;
      
      totalInstances += total;
      healthyInstances += healthy;
      unhealthyInstances += (total - healthy);
      
      serviceBreakdown[name] = { total, healthy };
    }
    
    return {
      totalServices: this.services.size,
      totalInstances,
      healthyInstances,
      unhealthyInstances,
      serviceBreakdown
    };
  }
}

/**
 * Service Locator for Service Discovery
 */
export class ServiceDiscovery {
  private static registry = ServiceRegistry.getInstance();

  public static async register(
    name: string,
    host: string,
    port: number,
    options?: {
      protocol?: 'http' | 'https';
      healthEndpoint?: string;
      metadata?: Record<string, any>;
      version?: string;
    }
  ): Promise<void> {
    const service: IServiceInstance = {
      id: `${name}-${host}-${port}-${Date.now()}`,
      name,
      host,
      port,
      protocol: options?.protocol || 'http',
      healthEndpoint: options?.healthEndpoint || '/health',
      metadata: options?.metadata,
      version: options?.version || '1.0.0',
      registeredAt: new Date(),
      status: 'unknown'
    };
    
    await this.registry.register(service);
  }

  public static async discover(serviceName: string): Promise<IServiceInstance[]> {
    return this.registry.discover(serviceName);
  }

  public static async getServiceUrl(serviceName: string): Promise<string | null> {
    const service = await this.registry.getService(serviceName);
    
    if (!service) {
      return null;
    }
    
    return `${service.protocol}://${service.host}:${service.port}`;
  }
}