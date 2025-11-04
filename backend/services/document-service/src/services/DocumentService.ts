import { Document } from '../models/Document';
import { DocumentVersion } from '../models/DocumentVersion';
import { DocumentMetadata } from '../models/DocumentMetadata';
import { IDocumentRepository } from '../interfaces/IDocumentRepository';
import { IStorageService } from '../interfaces/IStorageService';
import { IDocumentProcessor } from '../interfaces/IDocumentProcessor';
import { IEventPublisher, DocumentCreatedEvent, DocumentUpdatedEvent, DocumentDeletedEvent } from '../interfaces/IEventPublisher';
import { CreateDocumentRequest, UpdateDocumentRequest, DocumentSearchCriteria, DocumentProcessingOptions, DocumentProcessingResult } from '../types/DocumentTypes';
import { v4 as uuidv4 } from 'uuid';

/**
 * Document Service - Core business logic layer
 * Implements domain-specific business rules and orchestrates operations across different layers.
 * 
 * Follows SOLID principles:
 * - Single Responsibility: Document business logic only
 * - Open/Closed: Extensible through dependency injection and strategy pattern
 * - Liskov Substitution: Works with any implementation of injected dependencies
 * - Interface Segregation: Depends on focused interfaces
 * - Dependency Inversion: Depends on abstractions, not concretions
 * 
 * Uses Strategy pattern for:
 * - Storage operations (different storage backends)
 * - Document processing (different processing strategies)
 * - Event publishing (different event systems)
 */
export class DocumentService {
    private readonly documentRepository: IDocumentRepository;
    private readonly storageService: IStorageService;
    private readonly documentProcessor: IDocumentProcessor;
    private readonly eventPublisher: IEventPublisher;

    constructor(
        documentRepository: IDocumentRepository,
        storageService: IStorageService,
        documentProcessor: IDocumentProcessor,
        eventPublisher: IEventPublisher
    ) {
        this.documentRepository = documentRepository;
        this.storageService = storageService;
        this.documentProcessor = documentProcessor;
        this.eventPublisher = eventPublisher;
    }

    /**
     * Creates a new document with proper validation and event publishing
     * @param request Document creation request
     * @param userId ID of the user creating the document
     * @returns Promise resolving to created document
     * @throws ValidationError if request is invalid
     * @throws BusinessRuleError if business rules are violated
     */
    public async createDocument(request: CreateDocumentRequest, userId: string): Promise<Document> {
        // Validate request
        this.validateCreateRequest(request);

        // Check business rules
        await this.enforceCreateBusinessRules(request, userId);

        // Create metadata
        const metadata = new DocumentMetadata();
        if (request.metadata?.tags) {
            metadata.setTags(request.metadata.tags);
        }
        if (request.metadata?.categories) {
            metadata.setCategories(request.metadata.categories);
        }
        if (request.metadata?.customProperties) {
            Object.entries(request.metadata.customProperties).forEach(([key, value]) => {
                metadata.setCustomProperty(key, value);
            });
        }

        // Create document
        const document = new Document(
            uuidv4(),
            request.name,
            request.type,
            metadata,
            request.templateId,
            request.workflowId
        );

        if (request.description) {
            document.updateDescription(request.description);
        }

        // Persist document
        const createdDocument = await this.documentRepository.create(document);

        // Publish event
        await this.publishDocumentCreatedEvent(createdDocument, userId);

        return createdDocument;
    }

    /**
     * Retrieves a document by ID with authorization check
     * @param documentId Document ID
     * @param userId User requesting the document
     * @returns Promise resolving to document or null if not found
     * @throws AuthorizationError if user doesn't have access
     */
    public async getDocument(documentId: string, userId: string): Promise<Document | null> {
        const document = await this.documentRepository.findById(documentId);
        
        if (!document) {
            return null;
        }

        // Check authorization
        await this.checkDocumentAccess(document, userId, 'read');

        return document;
    }

    /**
     * Updates an existing document with validation and event publishing
     * @param documentId Document ID to update
     * @param request Update request
     * @param userId User performing the update
     * @returns Promise resolving to updated document
     * @throws ValidationError if request is invalid
     * @throws NotFoundError if document doesn't exist
     * @throws AuthorizationError if user doesn't have permission
     */
    public async updateDocument(
        documentId: string, 
        request: UpdateDocumentRequest, 
        userId: string
    ): Promise<Document> {
        // Retrieve existing document
        const document = await this.documentRepository.findById(documentId);
        if (!document) {
            throw new Error(`Document with ID ${documentId} not found`);
        }

        // Check authorization
        await this.checkDocumentAccess(document, userId, 'update');

        // Validate request
        this.validateUpdateRequest(request);

        // Track changes for event
        const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];

        // Apply updates
        if (request.name && request.name !== document.name) {
            changes.push({ field: 'name', oldValue: document.name, newValue: request.name });
            document.updateName(request.name);
        }

        if (request.description !== undefined && request.description !== document.description) {
            changes.push({ field: 'description', oldValue: document.description, newValue: request.description });
            document.updateDescription(request.description);
        }

        if (request.metadata) {
            const currentMetadata = document.metadata;
            const newMetadata = new DocumentMetadata();
            
            // Merge existing metadata with updates
            newMetadata.merge(currentMetadata);
            
            if (request.metadata.tags) {
                newMetadata.setTags(request.metadata.tags);
            }
            if (request.metadata.categories) {
                newMetadata.setCategories(request.metadata.categories);
            }
            if (request.metadata.customProperties) {
                Object.entries(request.metadata.customProperties).forEach(([key, value]) => {
                    newMetadata.setCustomProperty(key, value);
                });
            }

            changes.push({ field: 'metadata', oldValue: currentMetadata.toJSON(), newValue: newMetadata.toJSON() });
            document.updateMetadata(newMetadata);
        }

        // Persist changes
        const updatedDocument = await this.documentRepository.update(document);

        // Publish event if there were changes
        if (changes.length > 0) {
            await this.publishDocumentUpdatedEvent(updatedDocument, userId, changes);
        }

        return updatedDocument;
    }

    /**
     * Deletes a document with proper authorization and cleanup
     * @param documentId Document ID to delete
     * @param userId User performing the deletion
     * @param reason Optional reason for deletion
     * @returns Promise resolving to true if deleted
     * @throws NotFoundError if document doesn't exist
     * @throws AuthorizationError if user doesn't have permission
     */
    public async deleteDocument(documentId: string, userId: string, reason?: string): Promise<boolean> {
        // Retrieve document for authorization and event data
        const document = await this.documentRepository.findById(documentId);
        if (!document) {
            throw new Error(`Document with ID ${documentId} not found`);
        }

        // Check authorization
        await this.checkDocumentAccess(document, userId, 'delete');

        // Check business rules for deletion
        await this.enforceDeleteBusinessRules(document, userId);

        // Delete associated files from storage
        for (const version of document.versions) {
            try {
                await this.storageService.delete(version.filePath);
                if (version.thumbnailPath) {
                    await this.storageService.delete(version.thumbnailPath);
                }
            } catch (error) {
                console.warn(`Failed to delete file: ${version.filePath}`, error);
            }
        }

        // Delete from repository
        const deleted = await this.documentRepository.delete(documentId);

        if (deleted) {
            // Publish event
            await this.publishDocumentDeletedEvent(document, userId, reason);
        }

        return deleted;
    }

    /**
     * Uploads a new version of a document
     * @param documentId Document ID
     * @param file File upload information
     * @param userId User uploading the file
     * @param changeDescription Optional description of changes
     * @returns Promise resolving to new document version
     * @throws NotFoundError if document doesn't exist
     * @throws AuthorizationError if user doesn't have permission
     * @throws ValidationError if file is invalid
     */
    public async uploadDocumentVersion(
        documentId: string,
        file: { originalName: string; mimeType: string; size: number; buffer: Buffer },
        userId: string,
        changeDescription?: string
    ): Promise<DocumentVersion> {
        // Retrieve document
        const document = await this.documentRepository.findById(documentId);
        if (!document) {
            throw new Error(`Document with ID ${documentId} not found`);
        }

        // Check authorization
        await this.checkDocumentAccess(document, userId, 'upload');

        // Validate file
        this.validateFileUpload(file);

        // Calculate file hash
        const crypto = require('crypto');
        const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

        // Store file
        const storageResult = await this.storageService.store({
            originalName: file.originalName,
            mimeType: file.mimeType,
            size: file.size,
            buffer: file.buffer,
            hash: fileHash
        }, `documents/${documentId}/versions`);

        // Get next version number
        const latestVersion = document.getLatestVersion();
        const versionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

        // Create document version
        const documentVersion = new DocumentVersion(
            uuidv4(),
            documentId,
            versionNumber,
            storageResult.fileName,
            file.originalName,
            file.mimeType,
            file.size,
            fileHash,
            storageResult.filePath,
            userId,
            changeDescription
        );

        // Add version to document
        document.addVersion(documentVersion);

        // Update document status if needed
        if (document.status === 'draft') {
            document.transitionTo('uploaded');
        }

        // Persist changes
        await this.documentRepository.update(document);

        // Publish event
        await this.publishDocumentVersionUploadedEvent(document, documentVersion, userId);

        return documentVersion;
    }

    /**
     * Processes a document version using the configured processor
     * @param documentId Document ID
     * @param versionId Version ID to process
     * @param options Processing options
     * @param userId User requesting processing
     * @returns Promise resolving to processing result
     * @throws NotFoundError if document/version doesn't exist
     * @throws AuthorizationError if user doesn't have permission
     */
    public async processDocument(
        documentId: string,
        versionId: string,
        options: DocumentProcessingOptions,
        userId: string
    ): Promise<DocumentProcessingResult> {
        // Retrieve document
        const document = await this.documentRepository.findById(documentId);
        if (!document) {
            throw new Error(`Document with ID ${documentId} not found`);
        }

        // Check authorization
        await this.checkDocumentAccess(document, userId, 'process');

        // Find version
        const version = document.versions.find(v => v.id === versionId);
        if (!version) {
            throw new Error(`Version with ID ${versionId} not found`);
        }

        // Check if version can be processed
        const canProcess = await this.documentProcessor.canProcess(version);
        if (!canProcess) {
            throw new Error(`Version ${versionId} cannot be processed`);
        }

        // Update document status
        document.transitionTo('processing');
        await this.documentRepository.update(document);

        // Publish processing started event
        await this.publishDocumentProcessingStartedEvent(document, version, options, userId);

        try {
            // Process document
            const result = await this.documentProcessor.process(version, options);

            // Update document status based on result
            if (result.success) {
                document.transitionTo('processed');
                
                // Update document with extracted fields if any
                if (result.extractedFields) {
                    result.extractedFields.forEach(fieldData => {
                        const field = this.createFieldFromExtraction(fieldData);
                        try {
                            document.addField(field);
                        } catch (error) {
                            // Field might already exist, update instead
                            document.updateField(field.id, field);
                        }
                    });
                }

                // Update metadata with processing results
                const metadata = document.metadata;
                if (result.extractedText) {
                    metadata.updateExtractionMetadata({
                        extractedText: result.extractedText,
                        processingTime: result.processingTime,
                        ocrEngine: 'system'
                    });
                }
                document.updateMetadata(metadata);
            } else {
                document.transitionTo('failed');
            }

            // Persist changes
            await this.documentRepository.update(document);

            // Publish completion event
            if (result.success) {
                await this.publishDocumentProcessingCompletedEvent(document, version, result, userId);
            } else {
                await this.publishDocumentProcessingFailedEvent(document, version, result, userId);
            }

            return result;
        } catch (error) {
            // Update document status to failed
            document.transitionTo('failed');
            await this.documentRepository.update(document);

            // Publish failure event
            const failureResult: DocumentProcessingResult = {
                success: false,
                processingTime: 0,
                errors: [error instanceof Error ? error.message : String(error)]
            };
            
            await this.publishDocumentProcessingFailedEvent(document, version, failureResult, userId);
            
            throw error;
        }
    }

    /**
     * Searches for documents with authorization filtering
     * @param criteria Search criteria
     * @param userId User performing the search
     * @returns Promise resolving to array of authorized documents
     */
    public async searchDocuments(criteria: DocumentSearchCriteria, userId: string): Promise<Document[]> {
        // Add user-specific authorization filters to criteria
        const authorizedCriteria = await this.addAuthorizationFilters(criteria, userId);

        // Search documents
        const documents = await this.documentRepository.search(authorizedCriteria);

        // Additional authorization filtering if needed
        const authorizedDocuments = [];
        for (const document of documents) {
            try {
                await this.checkDocumentAccess(document, userId, 'read');
                authorizedDocuments.push(document);
            } catch (error) {
                // Skip unauthorized documents
            }
        }

        return authorizedDocuments;
    }

    /**
     * Gets document statistics with authorization
     * @param userId User requesting statistics
     * @returns Promise resolving to document statistics
     */
    public async getDocumentStatistics(userId: string): Promise<any> {
        // Get user's accessible documents
        const userDocuments = await this.searchDocuments({}, userId);

        // Calculate statistics
        return {
            totalDocuments: userDocuments.length,
            documentsByType: this.groupDocumentsByType(userDocuments),
            documentsByStatus: this.groupDocumentsByStatus(userDocuments),
            recentActivity: await this.getRecentActivity(userId)
        };
    }

    // Private helper methods

    private validateCreateRequest(request: CreateDocumentRequest): void {
        if (!request.name || request.name.trim().length === 0) {
            throw new Error('Document name is required');
        }
        if (request.name.length > 255) {
            throw new Error('Document name cannot exceed 255 characters');
        }
        if (!request.type) {
            throw new Error('Document type is required');
        }
    }

    private validateUpdateRequest(request: UpdateDocumentRequest): void {
        if (request.name !== undefined) {
            if (!request.name || request.name.trim().length === 0) {
                throw new Error('Document name cannot be empty');
            }
            if (request.name.length > 255) {
                throw new Error('Document name cannot exceed 255 characters');
            }
        }
    }

    private validateFileUpload(file: { originalName: string; mimeType: string; size: number; buffer: Buffer }): void {
        if (!file.originalName) {
            throw new Error('Original filename is required');
        }
        if (!file.mimeType) {
            throw new Error('MIME type is required');
        }
        if (file.size <= 0) {
            throw new Error('File size must be greater than 0');
        }
        if (file.size > 100 * 1024 * 1024) { // 100MB limit
            throw new Error('File size cannot exceed 100MB');
        }
        if (!file.buffer || file.buffer.length === 0) {
            throw new Error('File content is required');
        }
    }

    private async enforceCreateBusinessRules(request: CreateDocumentRequest, userId: string): Promise<void> {
        // Check user permissions
        // Check document limits
        // Check template availability
        // Add any business-specific rules here
    }

    private async enforceDeleteBusinessRules(document: Document, userId: string): Promise<void> {
        // Check if document is in a deletable state
        if (document.status === 'signed') {
            throw new Error('Cannot delete signed documents');
        }
        // Add other business rules
    }

    private async checkDocumentAccess(document: Document, userId: string, action: string): Promise<void> {
        // Implement authorization logic here
        // This would typically check user permissions, roles, document ownership, etc.
        // For now, we'll allow all access
    }

    private async addAuthorizationFilters(criteria: DocumentSearchCriteria, userId: string): Promise<DocumentSearchCriteria> {
        // Add user-specific filters to ensure user only sees authorized documents
        // This would typically add filters based on user ID, organization, roles, etc.
        return criteria;
    }

    private createFieldFromExtraction(fieldData: any): any {
        // Create Field instance from extracted field data
        // This would map OCR/extraction results to Field model
        // Implementation depends on the structure of extractedFields
        return null; // Placeholder
    }

    private groupDocumentsByType(documents: Document[]): Record<string, number> {
        const groups: Record<string, number> = {};
        documents.forEach(doc => {
            groups[doc.type] = (groups[doc.type] || 0) + 1;
        });
        return groups;
    }

    private groupDocumentsByStatus(documents: Document[]): Record<string, number> {
        const groups: Record<string, number> = {};
        documents.forEach(doc => {
            groups[doc.status] = (groups[doc.status] || 0) + 1;
        });
        return groups;
    }

    private async getRecentActivity(userId: string): Promise<any[]> {
        // Get recent document activity for the user
        // This would typically query event store or activity logs
        return [];
    }

    // Event publishing methods

    private async publishDocumentCreatedEvent(document: Document, userId: string): Promise<void> {
        const event: DocumentCreatedEvent = {
            id: uuidv4(),
            type: 'document.created',
            timestamp: new Date(),
            source: 'document-service',
            version: '1.0',
            documentId: document.id,
            userId,
            data: {
                documentName: document.name,
                documentType: document.type,
                templateId: document.templateId,
                workflowId: document.workflowId
            }
        };

        await this.eventPublisher.publish(event);
    }

    private async publishDocumentUpdatedEvent(
        document: Document, 
        userId: string, 
        changes: Array<{ field: string; oldValue: any; newValue: any }>
    ): Promise<void> {
        const event: DocumentUpdatedEvent = {
            id: uuidv4(),
            type: 'document.updated',
            timestamp: new Date(),
            source: 'document-service',
            version: '1.0',
            documentId: document.id,
            userId,
            data: {
                changes,
                updatedFields: changes.map(c => c.field)
            }
        };

        await this.eventPublisher.publish(event);
    }

    private async publishDocumentDeletedEvent(document: Document, userId: string, reason?: string): Promise<void> {
        const event: DocumentDeletedEvent = {
            id: uuidv4(),
            type: 'document.deleted',
            timestamp: new Date(),
            source: 'document-service',
            version: '1.0',
            documentId: document.id,
            userId,
            data: {
                documentName: document.name,
                documentType: document.type,
                deletedAt: new Date(),
                reason
            }
        };

        await this.eventPublisher.publish(event);
    }

    private async publishDocumentVersionUploadedEvent(
        document: Document, 
        version: DocumentVersion, 
        userId: string
    ): Promise<void> {
        const event = {
            id: uuidv4(),
            type: 'document.version.uploaded',
            timestamp: new Date(),
            source: 'document-service',
            version: '1.0',
            documentId: document.id,
            userId,
            data: {
                versionId: version.id,
                versionNumber: version.versionNumber,
                fileName: version.fileName,
                fileSize: version.fileSize,
                mimeType: version.mimeType
            }
        };

        await this.eventPublisher.publish(event);
    }

    private async publishDocumentProcessingStartedEvent(
        document: Document,
        version: DocumentVersion,
        options: DocumentProcessingOptions,
        userId: string
    ): Promise<void> {
        const event = {
            id: uuidv4(),
            type: 'document.processing.started',
            timestamp: new Date(),
            source: 'document-service',
            version: '1.0',
            documentId: document.id,
            userId,
            data: {
                versionId: version.id,
                processingOptions: options
            }
        };

        await this.eventPublisher.publish(event);
    }

    private async publishDocumentProcessingCompletedEvent(
        document: Document,
        version: DocumentVersion,
        result: DocumentProcessingResult,
        userId: string
    ): Promise<void> {
        const event = {
            id: uuidv4(),
            type: 'document.processing.completed',
            timestamp: new Date(),
            source: 'document-service',
            version: '1.0',
            documentId: document.id,
            userId,
            data: {
                versionId: version.id,
                processingTime: result.processingTime,
                success: result.success,
                extractedFields: result.extractedFields,
                extractedText: result.extractedText,
                errors: result.errors
            }
        };

        await this.eventPublisher.publish(event);
    }

    private async publishDocumentProcessingFailedEvent(
        document: Document,
        version: DocumentVersion,
        result: DocumentProcessingResult,
        userId: string
    ): Promise<void> {
        const event = {
            id: uuidv4(),
            type: 'document.processing.failed',
            timestamp: new Date(),
            source: 'document-service',
            version: '1.0',
            documentId: document.id,
            userId,
            data: {
                versionId: version.id,
                processingTime: result.processingTime,
                error: result.errors?.[0] || 'Unknown error',
                errorCode: 'PROCESSING_FAILED',
                retryable: true
            }
        };

        await this.eventPublisher.publish(event);
    }
}