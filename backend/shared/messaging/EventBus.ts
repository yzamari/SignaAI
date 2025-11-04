import { EventEmitter } from 'events';

/**
 * Domain Event Base Class
 * Represents something that has happened in the domain
 */
export abstract class DomainEvent {
  public readonly occurredAt: Date;
  public readonly eventId: string;
  public readonly eventType: string;
  public readonly aggregateId: string;
  public readonly payload: any;

  constructor(aggregateId: string, payload: any) {
    this.occurredAt = new Date();
    this.eventId = this.generateEventId();
    this.eventType = this.constructor.name;
    this.aggregateId = aggregateId;
    this.payload = payload;
  }

  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  public toJSON(): Record<string, any> {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      aggregateId: this.aggregateId,
      payload: this.payload,
      occurredAt: this.occurredAt.toISOString()
    };
  }
}

/**
 * Event Handler Interface
 * Defines contract for handling domain events
 */
export interface IEventHandler<T extends DomainEvent> {
  handle(event: T): Promise<void>;
  getEventType(): string;
}

/**
 * Event Bus Implementation
 * Implements Observer Pattern for event-driven communication
 */
export class EventBus {
  private static instance: EventBus;
  private emitter: EventEmitter;
  private handlers: Map<string, Set<IEventHandler<any>>>;
  private eventStore: DomainEvent[];
  private subscribers: Map<string, Set<EventSubscriber>>;

  private constructor() {
    this.emitter = new EventEmitter();
    this.handlers = new Map();
    this.eventStore = [];
    this.subscribers = new Map();
    this.emitter.setMaxListeners(100);
  }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Register event handler
   */
  public register<T extends DomainEvent>(handler: IEventHandler<T>): void {
    const eventType = handler.getEventType();
    
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    
    this.handlers.get(eventType)!.add(handler);
    
    // Set up internal listener
    this.emitter.on(eventType, async (event: T) => {
      try {
        await handler.handle(event);
      } catch (error) {
        console.error(`Error handling event ${eventType}:`, error);
        this.emitter.emit('error', { eventType, error });
      }
    });
  }

  /**
   * Unregister event handler
   */
  public unregister<T extends DomainEvent>(handler: IEventHandler<T>): void {
    const eventType = handler.getEventType();
    const handlers = this.handlers.get(eventType);
    
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(eventType);
      }
    }
  }

  /**
   * Publish event to all registered handlers
   */
  public async publish(event: DomainEvent): Promise<void> {
    // Store event for event sourcing
    this.eventStore.push(event);
    
    // Emit event to handlers
    this.emitter.emit(event.eventType, event);
    
    // Notify subscribers
    await this.notifySubscribers(event);
  }

  /**
   * Publish multiple events
   */
  public async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  /**
   * Subscribe to events with callback
   */
  public subscribe(
    eventType: string,
    subscriber: EventSubscriber
  ): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    
    this.subscribers.get(eventType)!.add(subscriber);
    
    // Return unsubscribe function
    return () => {
      const subscribers = this.subscribers.get(eventType);
      if (subscribers) {
        subscribers.delete(subscriber);
      }
    };
  }

  /**
   * Notify all subscribers of an event
   */
  private async notifySubscribers(event: DomainEvent): Promise<void> {
    const subscribers = this.subscribers.get(event.eventType);
    
    if (!subscribers) return;
    
    const promises = Array.from(subscribers).map(subscriber =>
      subscriber.onEvent(event).catch(error => {
        console.error(`Subscriber error for ${event.eventType}:`, error);
      })
    );
    
    await Promise.all(promises);
  }

  /**
   * Get event history
   */
  public getEventHistory(
    aggregateId?: string,
    eventType?: string,
    limit?: number
  ): DomainEvent[] {
    let events = [...this.eventStore];
    
    if (aggregateId) {
      events = events.filter(e => e.aggregateId === aggregateId);
    }
    
    if (eventType) {
      events = events.filter(e => e.eventType === eventType);
    }
    
    if (limit) {
      events = events.slice(-limit);
    }
    
    return events;
  }

  /**
   * Clear event store
   */
  public clearEventStore(): void {
    this.eventStore = [];
  }

  /**
   * Get registered handler count
   */
  public getHandlerCount(eventType?: string): number {
    if (eventType) {
      return this.handlers.get(eventType)?.size || 0;
    }
    
    let count = 0;
    for (const handlers of this.handlers.values()) {
      count += handlers.size;
    }
    return count;
  }
}

/**
 * Event Subscriber Interface
 */
export interface EventSubscriber {
  onEvent(event: DomainEvent): Promise<void>;
}

/**
 * Abstract Event Handler Base Class
 * Provides common functionality for event handlers
 */
export abstract class BaseEventHandler<T extends DomainEvent> implements IEventHandler<T> {
  constructor(protected readonly eventType: string) {}

  public getEventType(): string {
    return this.eventType;
  }

  public abstract handle(event: T): Promise<void>;
}

/**
 * Event Aggregator for complex event scenarios
 */
export class EventAggregator {
  private events: DomainEvent[] = [];

  public add(event: DomainEvent): void {
    this.events.push(event);
  }

  public async publishAll(): Promise<void> {
    const eventBus = EventBus.getInstance();
    await eventBus.publishAll(this.events);
    this.clear();
  }

  public clear(): void {
    this.events = [];
  }

  public getEvents(): DomainEvent[] {
    return [...this.events];
  }
}