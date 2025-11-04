import { Document } from '../models/Document';
import { DocumentSearchCriteria, DocumentStatistics } from '../types/DocumentTypes';

/**
 * Document Repository Interface
 * Defines the contract for document data access operations.
 * 
 * Follows Interface Segregation Principle:
 * - Focused on document persistence operations only
 * - Clients depend only on methods they use
 * - Separate interfaces for different concerns
 */
export interface IDocumentRepository {
    /**
     * Creates a new document in the repository
     * @param document Document to create
     * @returns Promise resolving to created document
     * @throws RepositoryError if creation fails
     */
    create(document: Document): Promise<Document>;

    /**
     * Retrieves a document by its ID
     * @param id Document ID
     * @returns Promise resolving to document or null if not found
     * @throws RepositoryError if retrieval fails
     */
    findById(id: string): Promise<Document | null>;

    /**
     * Retrieves multiple documents by their IDs
     * @param ids Array of document IDs
     * @returns Promise resolving to array of found documents
     * @throws RepositoryError if retrieval fails
     */
    findByIds(ids: string[]): Promise<Document[]>;

    /**
     * Updates an existing document
     * @param document Document with updated data
     * @returns Promise resolving to updated document
     * @throws RepositoryError if update fails or document not found
     */
    update(document: Document): Promise<Document>;

    /**
     * Deletes a document by its ID
     * @param id Document ID
     * @returns Promise resolving to true if deleted, false if not found
     * @throws RepositoryError if deletion fails
     */
    delete(id: string): Promise<boolean>;

    /**
     * Searches for documents based on criteria
     * @param criteria Search criteria
     * @returns Promise resolving to array of matching documents
     * @throws RepositoryError if search fails
     */
    search(criteria: DocumentSearchCriteria): Promise<Document[]>;

    /**
     * Counts documents matching the criteria
     * @param criteria Search criteria
     * @returns Promise resolving to count of matching documents
     * @throws RepositoryError if count fails
     */
    count(criteria: DocumentSearchCriteria): Promise<number>;

    /**
     * Checks if a document exists by ID
     * @param id Document ID
     * @returns Promise resolving to true if exists, false otherwise
     * @throws RepositoryError if check fails
     */
    exists(id: string): Promise<boolean>;

    /**
     * Retrieves documents by template ID
     * @param templateId Template ID
     * @returns Promise resolving to array of documents using the template
     * @throws RepositoryError if retrieval fails
     */
    findByTemplateId(templateId: string): Promise<Document[]>;

    /**
     * Retrieves documents by workflow ID
     * @param workflowId Workflow ID
     * @returns Promise resolving to array of documents in the workflow
     * @throws RepositoryError if retrieval fails
     */
    findByWorkflowId(workflowId: string): Promise<Document[]>;

    /**
     * Retrieves all documents with pagination
     * @param offset Starting offset
     * @param limit Maximum number of documents to return
     * @returns Promise resolving to array of documents
     * @throws RepositoryError if retrieval fails
     */
    findAll(offset?: number, limit?: number): Promise<Document[]>;
}

/**
 * Document Statistics Repository Interface
 * Specialized interface for document analytics and statistics.
 * 
 * Separated from main repository to follow ISP - clients that only need
 * basic CRUD operations don't depend on statistics functionality.
 */
export interface IDocumentStatisticsRepository {
    /**
     * Gets comprehensive document statistics
     * @returns Promise resolving to document statistics
     * @throws RepositoryError if statistics retrieval fails
     */
    getStatistics(): Promise<DocumentStatistics>;

    /**
     * Gets document count by status
     * @returns Promise resolving to status count mapping
     * @throws RepositoryError if count retrieval fails
     */
    getCountByStatus(): Promise<Record<string, number>>;

    /**
     * Gets document count by type
     * @returns Promise resolving to type count mapping
     * @throws RepositoryError if count retrieval fails
     */
    getCountByType(): Promise<Record<string, number>>;

    /**
     * Gets processing statistics for a date range
     * @param startDate Start date
     * @param endDate End date
     * @returns Promise resolving to processing statistics
     * @throws RepositoryError if statistics retrieval fails
     */
    getProcessingStatistics(startDate: Date, endDate: Date): Promise<{
        totalProcessed: number;
        averageProcessingTime: number;
        successRate: number;
        failureRate: number;
    }>;

    /**
     * Gets storage usage statistics
     * @returns Promise resolving to storage statistics
     * @throws RepositoryError if statistics retrieval fails
     */
    getStorageStatistics(): Promise<{
        totalSize: number;
        averageFileSize: number;
        totalFiles: number;
    }>;
}

/**
 * Document Query Builder Interface
 * Provides fluent interface for building complex document queries.
 * 
 * Follows Builder pattern and Interface Segregation Principle.
 */
export interface IDocumentQueryBuilder {
    /**
     * Adds a condition to filter by document name
     * @param name Document name pattern
     * @returns Query builder for chaining
     */
    byName(name: string): IDocumentQueryBuilder;

    /**
     * Adds a condition to filter by document type
     * @param type Document type
     * @returns Query builder for chaining
     */
    byType(type: string): IDocumentQueryBuilder;

    /**
     * Adds a condition to filter by document status
     * @param status Document status
     * @returns Query builder for chaining
     */
    byStatus(status: string): IDocumentQueryBuilder;

    /**
     * Adds a condition to filter by tags
     * @param tags Array of tags to match
     * @returns Query builder for chaining
     */
    byTags(tags: string[]): IDocumentQueryBuilder;

    /**
     * Adds a condition to filter by categories
     * @param categories Array of categories to match
     * @returns Query builder for chaining
     */
    byCategories(categories: string[]): IDocumentQueryBuilder;

    /**
     * Adds a date range condition for creation date
     * @param from Start date
     * @param to End date
     * @returns Query builder for chaining
     */
    createdBetween(from: Date, to: Date): IDocumentQueryBuilder;

    /**
     * Adds a date range condition for update date
     * @param from Start date
     * @param to End date
     * @returns Query builder for chaining
     */
    updatedBetween(from: Date, to: Date): IDocumentQueryBuilder;

    /**
     * Adds pagination to the query
     * @param offset Starting offset
     * @param limit Maximum number of results
     * @returns Query builder for chaining
     */
    paginate(offset: number, limit: number): IDocumentQueryBuilder;

    /**
     * Adds sorting to the query
     * @param field Field to sort by
     * @param order Sort order
     * @returns Query builder for chaining
     */
    sortBy(field: string, order: 'asc' | 'desc'): IDocumentQueryBuilder;

    /**
     * Executes the query and returns results
     * @returns Promise resolving to array of matching documents
     */
    execute(): Promise<Document[]>;

    /**
     * Executes the query and returns count only
     * @returns Promise resolving to count of matching documents
     */
    count(): Promise<number>;

    /**
     * Executes the query and returns first result only
     * @returns Promise resolving to first matching document or null
     */
    first(): Promise<Document | null>;

    /**
     * Resets the query builder to initial state
     * @returns Query builder for chaining
     */
    reset(): IDocumentQueryBuilder;
}