/**
 * Dependency Injection Container
 * Implements IoC (Inversion of Control) pattern
 * Manages service lifecycle and dependencies
 */

type Constructor<T = {}> = new (...args: any[]) => T;
type Factory<T> = () => T | Promise<T>;
type ServiceIdentifier<T> = Constructor<T> | string | symbol;

interface ServiceDescriptor<T> {
  identifier: ServiceIdentifier<T>;
  implementation: Constructor<T> | Factory<T> | T;
  lifecycle: 'singleton' | 'transient' | 'scoped';
  dependencies?: ServiceIdentifier<any>[];
  instance?: T;
}

/**
 * Decorator for marking injectable classes
 */
export function Injectable<T extends Constructor>(target: T): T {
  Reflect.defineMetadata('injectable', true, target);
  return target;
}

/**
 * Decorator for injecting dependencies
 */
export function Inject(identifier: ServiceIdentifier<any>) {
  return function (target: any, propertyKey: string | symbol, parameterIndex?: number) {
    const existingTokens = Reflect.getMetadata('design:paramtypes', target) || [];
    const tokens = [...existingTokens];
    
    if (parameterIndex !== undefined) {
      tokens[parameterIndex] = identifier;
    }
    
    Reflect.defineMetadata('injection-tokens', tokens, target);
  };
}

/**
 * Dependency Container Implementation
 * Singleton pattern for global container instance
 */
export class DependencyContainer {
  private static instance: DependencyContainer;
  private services: Map<ServiceIdentifier<any>, ServiceDescriptor<any>> = new Map();
  private scopedInstances: Map<ServiceIdentifier<any>, any> = new Map();

  private constructor() {}

  /**
   * Get singleton instance of container
   */
  public static getInstance(): DependencyContainer {
    if (!DependencyContainer.instance) {
      DependencyContainer.instance = new DependencyContainer();
    }
    return DependencyContainer.instance;
  }

  /**
   * Register service with singleton lifecycle
   */
  public registerSingleton<T>(
    identifier: ServiceIdentifier<T>,
    implementation: Constructor<T> | Factory<T> | T,
    dependencies?: ServiceIdentifier<any>[]
  ): void {
    this.register(identifier, implementation, 'singleton', dependencies);
  }

  /**
   * Register service with transient lifecycle
   */
  public registerTransient<T>(
    identifier: ServiceIdentifier<T>,
    implementation: Constructor<T>,
    dependencies?: ServiceIdentifier<any>[]
  ): void {
    this.register(identifier, implementation, 'transient', dependencies);
  }

  /**
   * Register service with scoped lifecycle
   */
  public registerScoped<T>(
    identifier: ServiceIdentifier<T>,
    implementation: Constructor<T>,
    dependencies?: ServiceIdentifier<any>[]
  ): void {
    this.register(identifier, implementation, 'scoped', dependencies);
  }

  /**
   * Internal registration method
   */
  private register<T>(
    identifier: ServiceIdentifier<T>,
    implementation: Constructor<T> | Factory<T> | T,
    lifecycle: 'singleton' | 'transient' | 'scoped',
    dependencies?: ServiceIdentifier<any>[]
  ): void {
    const descriptor: ServiceDescriptor<T> = {
      identifier,
      implementation,
      lifecycle,
      dependencies
    };

    this.services.set(identifier, descriptor);
  }

  /**
   * Resolve service from container
   */
  public async resolve<T>(identifier: ServiceIdentifier<T>): Promise<T> {
    const descriptor = this.services.get(identifier);
    
    if (!descriptor) {
      throw new Error(`Service ${String(identifier)} is not registered`);
    }

    return this.createInstance(descriptor);
  }

  /**
   * Create service instance based on lifecycle
   */
  private async createInstance<T>(descriptor: ServiceDescriptor<T>): Promise<T> {
    // Singleton lifecycle
    if (descriptor.lifecycle === 'singleton') {
      if (descriptor.instance) {
        return descriptor.instance;
      }
      
      const instance = await this.instantiate(descriptor);
      descriptor.instance = instance;
      return instance;
    }

    // Scoped lifecycle
    if (descriptor.lifecycle === 'scoped') {
      const existing = this.scopedInstances.get(descriptor.identifier);
      if (existing) {
        return existing;
      }
      
      const instance = await this.instantiate(descriptor);
      this.scopedInstances.set(descriptor.identifier, instance);
      return instance;
    }

    // Transient lifecycle
    return this.instantiate(descriptor);
  }

  /**
   * Instantiate service with dependencies
   */
  private async instantiate<T>(descriptor: ServiceDescriptor<T>): Promise<T> {
    const { implementation, dependencies } = descriptor;

    // If implementation is already an instance
    if (typeof implementation !== 'function') {
      return implementation as T;
    }

    // If implementation is a factory function
    if (!('prototype' in implementation)) {
      return (implementation as Factory<T>)();
    }

    // Resolve dependencies
    const resolvedDependencies: any[] = [];
    if (dependencies) {
      for (const dep of dependencies) {
        const resolved = await this.resolve(dep);
        resolvedDependencies.push(resolved);
      }
    } else {
      // Try to resolve using reflection
      const paramTypes = Reflect.getMetadata('design:paramtypes', implementation) || [];
      const injectionTokens = Reflect.getMetadata('injection-tokens', implementation) || [];
      
      for (let i = 0; i < paramTypes.length; i++) {
        const token = injectionTokens[i] || paramTypes[i];
        if (token) {
          const resolved = await this.resolve(token);
          resolvedDependencies.push(resolved);
        }
      }
    }

    // Create instance with resolved dependencies
    return new (implementation as Constructor<T>)(...resolvedDependencies);
  }

  /**
   * Clear scoped instances
   */
  public clearScope(): void {
    this.scopedInstances.clear();
  }

  /**
   * Check if service is registered
   */
  public has(identifier: ServiceIdentifier<any>): boolean {
    return this.services.has(identifier);
  }

  /**
   * Clear all registrations
   */
  public clear(): void {
    this.services.clear();
    this.scopedInstances.clear();
  }
}

/**
 * Service Locator Pattern Implementation
 * Provides static access to container
 */
export class ServiceLocator {
  private static container = DependencyContainer.getInstance();

  public static register<T>(
    identifier: ServiceIdentifier<T>,
    implementation: Constructor<T> | Factory<T> | T,
    lifecycle: 'singleton' | 'transient' | 'scoped' = 'singleton'
  ): void {
    if (lifecycle === 'singleton') {
      this.container.registerSingleton(identifier, implementation);
    } else if (lifecycle === 'transient') {
      this.container.registerTransient(identifier, implementation as Constructor<T>);
    } else {
      this.container.registerScoped(identifier, implementation as Constructor<T>);
    }
  }

  public static async get<T>(identifier: ServiceIdentifier<T>): Promise<T> {
    return this.container.resolve(identifier);
  }

  public static has(identifier: ServiceIdentifier<any>): boolean {
    return this.container.has(identifier);
  }
}