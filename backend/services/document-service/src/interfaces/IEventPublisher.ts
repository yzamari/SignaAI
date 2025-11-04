/**
 * Event Publishing Interfaces
 * Defines contracts for event-driven architecture using Observer pattern.
 * 
 * Follows Interface Segregation Principle:
 * - Separate interfaces for different event concerns
 * - Publishers and subscribers depend only on what they need
 */

/**
 * Base event interface
 */
export interface BaseEvent {
    id: string;
    type: string;
    timestamp: Date;
    source: string;
    version: string;
    correlationId?: string;
    metadata?: Record<string, any>;
}

/**
 * Document-related events
 */
export interface DocumentEvent extends BaseEvent {
    documentId: string;
    userId?: string;
    organizationId?: string;
}

/**
 * Specific document event types
 */
export interface DocumentCreatedEvent extends DocumentEvent {
    type: 'document.created';
    data: {
        documentName: string;
        documentType: string;
        templateId?: string;
        workflowId?: string;
    };
}

export interface DocumentUpdatedEvent extends DocumentEvent {
    type: 'document.updated';
    data: {
        changes: Array<{
            field: string;
            oldValue: any;
            newValue: any;
        }>;
        updatedFields: string[];
    };
}

export interface DocumentDeletedEvent extends DocumentEvent {
    type: 'document.deleted';
    data: {
        documentName: string;
        documentType: string;
        deletedAt: Date;
        reason?: string;
    };
}

export interface DocumentVersionUploadedEvent extends DocumentEvent {
    type: 'document.version.uploaded';
    data: {
        versionId: string;
        versionNumber: number;
        fileName: string;
        fileSize: number;
        mimeType: string;
    };
}

export interface DocumentProcessingStartedEvent extends DocumentEvent {
    type: 'document.processing.started';
    data: {
        versionId: string;
        processingOptions: Record<string, any>;
        estimatedDuration?: number;
    };
}

export interface DocumentProcessingCompletedEvent extends DocumentEvent {
    type: 'document.processing.completed';
    data: {
        versionId: string;
        processingTime: number;
        success: boolean;
        extractedFields?: Array<{
            id: string;
            name: string;
            value: any;
            confidence?: number;
        }>;
        extractedText?: string;
        errors?: string[];
    };
}

export interface DocumentProcessingFailedEvent extends DocumentEvent {
    type: 'document.processing.failed';
    data: {
        versionId: string;
        processingTime: number;
        error: string;
        errorCode: string;
        retryable: boolean;
        retryCount?: number;
    };
}

export interface DocumentStatusChangedEvent extends DocumentEvent {
    type: 'document.status.changed';
    data: {
        oldStatus: string;
        newStatus: string;
        reason?: string;
        triggeredBy?: string;
    };
}

export interface DocumentFieldUpdatedEvent extends DocumentEvent {
    type: 'document.field.updated';
    data: {
        fieldId: string;
        fieldName: string;
        oldValue: any;
        newValue: any;
        confidence?: number;
        source: 'manual' | 'ocr' | 'api' | 'import';
    };
}

export interface DocumentSharedEvent extends DocumentEvent {
    type: 'document.shared';
    data: {
        sharedWith: Array<{
            userId?: string;
            email?: string;
            role: string;
            permissions: string[];
        }>;
        expiresAt?: Date;
        message?: string;
    };
}

/**
 * Event handler function type
 */
export type EventHandler<T extends BaseEvent = BaseEvent> = (event: T) => Promise<void> | void;

/**
 * Event filter function type
 */
export type EventFilter<T extends BaseEvent = BaseEvent> = (event: T) => boolean;

/**
 * Event subscription configuration
 */
export interface EventSubscription {
    id: string;
    eventType: string;
    handler: EventHandler;
    filter?: EventFilter;
    priority?: number;
    enabled: boolean;
    metadata?: Record<string, any>;
}

/**
 * Core Event Publisher Interface
 * Defines basic event publishing operations.
 */
export interface IEventPublisher {
    /**
     * Publishes an event to all subscribers
     * @param event Event to publish
     * @returns Promise resolving when event is published
     * @throws PublishError if publishing fails
     */
    publish<T extends BaseEvent>(event: T): Promise<void>;

    /**
     * Publishes multiple events as a batch
     * @param events Array of events to publish
     * @returns Promise resolving when all events are published
     * @throws PublishError if any event publishing fails
     */
    publishBatch<T extends BaseEvent>(events: T[]): Promise<void>;

    /**
     * Schedules an event to be published at a future time
     * @param event Event to schedule
     * @param publishAt When to publish the event
     * @returns Promise resolving to scheduled event ID
     * @throws ScheduleError if scheduling fails
     */
    scheduleEvent<T extends BaseEvent>(event: T, publishAt: Date): Promise<string>;

    /**
     * Cancels a scheduled event
     * @param scheduledEventId ID of the scheduled event
     * @returns Promise resolving to true if cancelled, false if not found
     * @throws CancelError if cancellation fails
     */
    cancelScheduledEvent(scheduledEventId: string): Promise<boolean>;

    /**
     * Gets publisher statistics
     * @returns Publisher performance statistics
     */
    getStatistics(): Promise<{
        totalPublished: number;
        publishRate: number;
        errorRate: number;
        averagePublishTime: number;
    }>;
}

/**
 * Event Subscriber Interface
 * Defines operations for subscribing to events.
 */
export interface IEventSubscriber {
    /**
     * Subscribes to events of a specific type
     * @param eventType Type of events to subscribe to
     * @param handler Function to handle events
     * @param options Subscription options
     * @returns Promise resolving to subscription ID
     * @throws SubscriptionError if subscription fails
     */
    subscribe<T extends BaseEvent>(
        eventType: string, 
        handler: EventHandler<T>, 
        options?: {
            filter?: EventFilter<T>;
            priority?: number;
            metadata?: Record<string, any>;
        }
    ): Promise<string>;

    /**
     * Subscribes to multiple event types with the same handler
     * @param eventTypes Array of event types to subscribe to
     * @param handler Function to handle events
     * @param options Subscription options
     * @returns Promise resolving to array of subscription IDs
     * @throws SubscriptionError if any subscription fails
     */
    subscribeToMultiple<T extends BaseEvent>(
        eventTypes: string[], 
        handler: EventHandler<T>, 
        options?: {
            filter?: EventFilter<T>;
            priority?: number;
            metadata?: Record<string, any>;
        }
    ): Promise<string[]>;

    /**
     * Unsubscribes from events
     * @param subscriptionId ID of the subscription to remove
     * @returns Promise resolving to true if unsubscribed, false if not found
     * @throws UnsubscriptionError if unsubscription fails
     */
    unsubscribe(subscriptionId: string): Promise<boolean>;

    /**
     * Unsubscribes from all events of a specific type
     * @param eventType Event type to unsubscribe from
     * @returns Promise resolving to number of subscriptions removed
     * @throws UnsubscriptionError if unsubscription fails
     */
    unsubscribeFromType(eventType: string): Promise<number>;

    /**
     * Unsubscribes from all events
     * @returns Promise resolving to number of subscriptions removed
     * @throws UnsubscriptionError if unsubscription fails
     */
    unsubscribeFromAll(): Promise<number>;

    /**
     * Gets active subscriptions
     * @param eventType Optional event type filter
     * @returns Promise resolving to array of active subscriptions
     */
    getSubscriptions(eventType?: string): Promise<EventSubscription[]>;

    /**
     * Temporarily pauses a subscription
     * @param subscriptionId ID of the subscription to pause
     * @returns Promise resolving to true if paused
     * @throws SubscriptionError if pause fails
     */
    pauseSubscription(subscriptionId: string): Promise<boolean>;

    /**
     * Resumes a paused subscription
     * @param subscriptionId ID of the subscription to resume
     * @returns Promise resolving to true if resumed
     * @throws SubscriptionError if resume fails
     */
    resumeSubscription(subscriptionId: string): Promise<boolean>;
}

/**
 * Advanced Event Publisher Interface
 * Extends basic publisher with advanced features.
 */
export interface IAdvancedEventPublisher extends IEventPublisher {
    /**
     * Publishes an event with delivery guarantees
     * @param event Event to publish
     * @param deliveryOptions Delivery guarantee options
     * @returns Promise resolving when delivery is confirmed
     * @throws DeliveryError if guaranteed delivery fails
     */
    publishWithGuarantees<T extends BaseEvent>(
        event: T, 
        deliveryOptions: {
            guaranteeDelivery?: boolean;
            maxRetries?: number;
            retryDelay?: number;
            timeout?: number;
        }
    ): Promise<void>;

    /**
     * Publishes an event and waits for acknowledgments
     * @param event Event to publish
     * @param waitForAcks Number of acknowledgments to wait for
     * @param timeout Maximum time to wait for acknowledgments
     * @returns Promise resolving when acknowledgments are received
     * @throws AcknowledgmentError if acknowledgments not received
     */
    publishAndWaitForAcks<T extends BaseEvent>(
        event: T, 
        waitForAcks: number, 
        timeout: number
    ): Promise<void>;

    /**
     * Creates a transaction for publishing multiple events atomically
     * @returns Transaction instance for atomic event publishing
     */
    createTransaction(): IEventTransaction;

    /**
     * Replays events from a specific time
     * @param fromTime Start time for event replay
     * @param toTime End time for event replay
     * @param eventTypes Optional event types to replay
     * @returns Promise resolving when replay is complete
     * @throws ReplayError if replay fails
     */
    replayEvents(
        fromTime: Date, 
        toTime: Date, 
        eventTypes?: string[]
    ): Promise<void>;

    /**
     * Gets event history for a document
     * @param documentId Document ID
     * @param eventTypes Optional event types to filter
     * @param fromTime Optional start time filter
     * @param toTime Optional end time filter
     * @returns Promise resolving to array of events
     */
    getEventHistory(
        documentId: string, 
        eventTypes?: string[], 
        fromTime?: Date, 
        toTime?: Date
    ): Promise<BaseEvent[]>;
}

/**
 * Event Transaction Interface
 * Provides atomic operations for multiple events.
 */
export interface IEventTransaction {
    /**
     * Adds an event to the transaction
     * @param event Event to add
     */
    addEvent<T extends BaseEvent>(event: T): void;

    /**
     * Adds multiple events to the transaction
     * @param events Array of events to add
     */
    addEvents<T extends BaseEvent>(events: T[]): void;

    /**
     * Commits the transaction, publishing all events atomically
     * @returns Promise resolving when all events are published
     * @throws TransactionError if commit fails
     */
    commit(): Promise<void>;

    /**
     * Rolls back the transaction, discarding all events
     */
    rollback(): void;

    /**
     * Gets the number of events in the transaction
     * @returns Number of events
     */
    getEventCount(): number;

    /**
     * Checks if the transaction is active
     * @returns True if transaction is active
     */
    isActive(): boolean;
}

/**
 * Event Store Interface
 * Provides persistent storage for events.
 */
export interface IEventStore {
    /**
     * Stores an event persistently
     * @param event Event to store
     * @returns Promise resolving when event is stored
     * @throws StorageError if storage fails
     */
    store<T extends BaseEvent>(event: T): Promise<void>;

    /**
     * Retrieves events by ID
     * @param eventIds Array of event IDs
     * @returns Promise resolving to array of found events
     * @throws StorageError if retrieval fails
     */
    getEvents(eventIds: string[]): Promise<BaseEvent[]>;

    /**
     * Retrieves events by type within a time range
     * @param eventType Event type to retrieve
     * @param fromTime Start time
     * @param toTime End time
     * @param limit Maximum number of events to return
     * @returns Promise resolving to array of events
     * @throws StorageError if retrieval fails
     */
    getEventsByType(
        eventType: string, 
        fromTime: Date, 
        toTime: Date, 
        limit?: number
    ): Promise<BaseEvent[]>;

    /**
     * Retrieves events for a specific document
     * @param documentId Document ID
     * @param fromTime Optional start time filter
     * @param toTime Optional end time filter
     * @param eventTypes Optional event types to filter
     * @returns Promise resolving to array of events
     * @throws StorageError if retrieval fails
     */
    getDocumentEvents(
        documentId: string, 
        fromTime?: Date, 
        toTime?: Date, 
        eventTypes?: string[]
    ): Promise<DocumentEvent[]>;

    /**
     * Archives old events to reduce storage size
     * @param olderThan Archive events older than this date
     * @param archiveLocation Location to archive events to
     * @returns Promise resolving to number of events archived
     * @throws ArchiveError if archiving fails
     */
    archiveEvents(olderThan: Date, archiveLocation: string): Promise<number>;

    /**
     * Deletes events permanently
     * @param eventIds Array of event IDs to delete
     * @returns Promise resolving to number of events deleted
     * @throws DeletionError if deletion fails
     */
    deleteEvents(eventIds: string[]): Promise<number>;

    /**
     * Gets event store statistics
     * @returns Storage statistics
     */
    getStatistics(): Promise<{
        totalEvents: number;
        eventsByType: Record<string, number>;
        storageSize: number;
        oldestEvent: Date;
        newestEvent: Date;
    }>;
}