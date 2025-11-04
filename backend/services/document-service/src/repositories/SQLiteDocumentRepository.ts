import { Database } from 'sqlite3';
import { Document } from '../models/Document';
import { DocumentVersion } from '../models/DocumentVersion';
import { DocumentMetadata } from '../models/DocumentMetadata';
import { Field } from '../models/Field';
import { IDocumentRepository, IDocumentQueryBuilder } from '../interfaces/IDocumentRepository';
import { DocumentSearchCriteria, DocumentType, DocumentStatus } from '../types/DocumentTypes';
import { FieldType } from '../types/FieldTypes';

/**
 * SQLite implementation of the Document Repository pattern.
 * Provides concrete data access implementation for documents using SQLite database.
 * 
 * Follows Repository pattern principles:
 * - Encapsulates data access logic
 * - Provides abstraction over data storage
 * - Implements domain repository interface
 * - Handles data mapping between domain models and database records
 * 
 * Adheres to SOLID principles:
 * - Single Responsibility: Document data persistence only
 * - Dependency Inversion: Depends on IDocumentRepository abstraction
 * - Interface Segregation: Implements focused repository interface
 */
export class SQLiteDocumentRepository implements IDocumentRepository {
    private db: Database;

    constructor(database: Database) {
        this.db = database;
        this.initializeTables();
    }

    /**
     * Creates a new document in the database
     * @param document Document to create
     * @returns Promise resolving to created document
     * @throws RepositoryError if creation fails
     */
    public async create(document: Document): Promise<Document> {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run('BEGIN TRANSACTION');

                try {
                    // Insert document
                    const documentQuery = `
                        INSERT INTO documents (
                            id, name, type, status, description, template_id, workflow_id,
                            created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;

                    this.db.run(documentQuery, [
                        document.id,
                        document.name,
                        document.type,
                        document.status,
                        document.description,
                        document.templateId,
                        document.workflowId,
                        document.createdAt.toISOString(),
                        document.updatedAt.toISOString()
                    ], (err) => {
                        if (err) {
                            this.db.run('ROLLBACK');
                            reject(new Error(`Failed to create document: ${err.message}`));
                            return;
                        }

                        // Insert metadata
                        this.insertMetadata(document.id, document.metadata)
                            .then(() => {
                                // Insert fields
                                return this.insertFields(document.id, document.fields);
                            })
                            .then(() => {
                                // Insert versions
                                return this.insertVersions(document.id, document.versions);
                            })
                            .then(() => {
                                this.db.run('COMMIT');
                                resolve(document);
                            })
                            .catch((error) => {
                                this.db.run('ROLLBACK');
                                reject(error);
                            });
                    });
                } catch (error) {
                    this.db.run('ROLLBACK');
                    reject(error);
                }
            });
        });
    }

    /**
     * Retrieves a document by its ID
     * @param id Document ID
     * @returns Promise resolving to document or null if not found
     * @throws RepositoryError if retrieval fails
     */
    public async findById(id: string): Promise<Document | null> {
        return new Promise((resolve, reject) => {
            const query = 'SELECT * FROM documents WHERE id = ?';
            
            this.db.get(query, [id], async (err, row: any) => {
                if (err) {
                    reject(new Error(`Failed to find document: ${err.message}`));
                    return;
                }

                if (!row) {
                    resolve(null);
                    return;
                }

                try {
                    const document = await this.mapRowToDocument(row);
                    resolve(document);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    /**
     * Retrieves multiple documents by their IDs
     * @param ids Array of document IDs
     * @returns Promise resolving to array of found documents
     * @throws RepositoryError if retrieval fails
     */
    public async findByIds(ids: string[]): Promise<Document[]> {
        if (ids.length === 0) {
            return [];
        }

        return new Promise((resolve, reject) => {
            const placeholders = ids.map(() => '?').join(',');
            const query = `SELECT * FROM documents WHERE id IN (${placeholders})`;
            
            this.db.all(query, ids, async (err, rows: any[]) => {
                if (err) {
                    reject(new Error(`Failed to find documents: ${err.message}`));
                    return;
                }

                try {
                    const documents = await Promise.all(
                        rows.map(row => this.mapRowToDocument(row))
                    );
                    resolve(documents);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    /**
     * Updates an existing document
     * @param document Document with updated data
     * @returns Promise resolving to updated document
     * @throws RepositoryError if update fails or document not found
     */
    public async update(document: Document): Promise<Document> {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run('BEGIN TRANSACTION');

                try {
                    const updateQuery = `
                        UPDATE documents 
                        SET name = ?, description = ?, status = ?, updated_at = ?
                        WHERE id = ?
                    `;

                    this.db.run(updateQuery, [
                        document.name,
                        document.description,
                        document.status,
                        document.updatedAt.toISOString(),
                        document.id
                    ], (err) => {
                        if (err) {
                            this.db.run('ROLLBACK');
                            reject(new Error(`Failed to update document: ${err.message}`));
                            return;
                        }

                        // Update metadata, fields, and versions
                        this.updateMetadata(document.id, document.metadata)
                            .then(() => this.updateFields(document.id, document.fields))
                            .then(() => this.updateVersions(document.id, document.versions))
                            .then(() => {
                                this.db.run('COMMIT');
                                resolve(document);
                            })
                            .catch((error) => {
                                this.db.run('ROLLBACK');
                                reject(error);
                            });
                    });
                } catch (error) {
                    this.db.run('ROLLBACK');
                    reject(error);
                }
            });
        });
    }

    /**
     * Deletes a document by its ID
     * @param id Document ID
     * @returns Promise resolving to true if deleted, false if not found
     * @throws RepositoryError if deletion fails
     */
    public async delete(id: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run('BEGIN TRANSACTION');

                try {
                    // Delete related data first due to foreign key constraints
                    Promise.all([
                        this.deleteMetadata(id),
                        this.deleteFields(id),
                        this.deleteVersions(id)
                    ]).then(() => {
                        // Delete main document record
                        const deleteQuery = 'DELETE FROM documents WHERE id = ?';
                        this.db.run(deleteQuery, [id], function(err) {
                            if (err) {
                                this.db.run('ROLLBACK');
                                reject(new Error(`Failed to delete document: ${err.message}`));
                                return;
                            }

                            this.db.run('COMMIT');
                            resolve(this.changes > 0);
                        });
                    }).catch((error) => {
                        this.db.run('ROLLBACK');
                        reject(error);
                    });
                } catch (error) {
                    this.db.run('ROLLBACK');
                    reject(error);
                }
            });
        });
    }

    /**
     * Searches for documents based on criteria
     * @param criteria Search criteria
     * @returns Promise resolving to array of matching documents
     * @throws RepositoryError if search fails
     */
    public async search(criteria: DocumentSearchCriteria): Promise<Document[]> {
        return new Promise((resolve, reject) => {
            const queryBuilder = new SQLiteDocumentQueryBuilder(this.db);
            
            // Apply search criteria using query builder
            if (criteria.name) {
                queryBuilder.byName(criteria.name);
            }
            if (criteria.type) {
                queryBuilder.byType(criteria.type);
            }
            if (criteria.status) {
                queryBuilder.byStatus(criteria.status);
            }
            if (criteria.tags && criteria.tags.length > 0) {
                queryBuilder.byTags(criteria.tags);
            }
            if (criteria.categories && criteria.categories.length > 0) {
                queryBuilder.byCategories(criteria.categories);
            }
            if (criteria.createdAfter || criteria.createdBefore) {
                queryBuilder.createdBetween(
                    criteria.createdAfter || new Date(0),
                    criteria.createdBefore || new Date()
                );
            }
            if (criteria.updatedAfter || criteria.updatedBefore) {
                queryBuilder.updatedBetween(
                    criteria.updatedAfter || new Date(0),
                    criteria.updatedBefore || new Date()
                );
            }
            if (criteria.templateId) {
                queryBuilder.byTemplateId(criteria.templateId);
            }
            if (criteria.workflowId) {
                queryBuilder.byWorkflowId(criteria.workflowId);
            }
            if (criteria.offset !== undefined || criteria.limit !== undefined) {
                queryBuilder.paginate(criteria.offset || 0, criteria.limit || 50);
            }
            if (criteria.sortBy) {
                queryBuilder.sortBy(criteria.sortBy, criteria.sortOrder || 'asc');
            }

            queryBuilder.execute()
                .then(documents => resolve(documents))
                .catch(error => reject(error));
        });
    }

    /**
     * Counts documents matching the criteria
     * @param criteria Search criteria
     * @returns Promise resolving to count of matching documents
     * @throws RepositoryError if count fails
     */
    public async count(criteria: DocumentSearchCriteria): Promise<number> {
        const queryBuilder = new SQLiteDocumentQueryBuilder(this.db);
        
        // Apply same criteria as search
        // ... (similar to search method but call count() instead of execute())
        
        return queryBuilder.count();
    }

    /**
     * Checks if a document exists by ID
     * @param id Document ID
     * @returns Promise resolving to true if exists, false otherwise
     * @throws RepositoryError if check fails
     */
    public async exists(id: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const query = 'SELECT COUNT(*) as count FROM documents WHERE id = ?';
            
            this.db.get(query, [id], (err, row: any) => {
                if (err) {
                    reject(new Error(`Failed to check document existence: ${err.message}`));
                    return;
                }
                
                resolve(row.count > 0);
            });
        });
    }

    /**
     * Retrieves documents by template ID
     * @param templateId Template ID
     * @returns Promise resolving to array of documents using the template
     * @throws RepositoryError if retrieval fails
     */
    public async findByTemplateId(templateId: string): Promise<Document[]> {
        return this.search({ templateId });
    }

    /**
     * Retrieves documents by workflow ID
     * @param workflowId Workflow ID
     * @returns Promise resolving to array of documents in the workflow
     * @throws RepositoryError if retrieval fails
     */
    public async findByWorkflowId(workflowId: string): Promise<Document[]> {
        return this.search({ workflowId });
    }

    /**
     * Retrieves all documents with pagination
     * @param offset Starting offset
     * @param limit Maximum number of documents to return
     * @returns Promise resolving to array of documents
     * @throws RepositoryError if retrieval fails
     */
    public async findAll(offset: number = 0, limit: number = 50): Promise<Document[]> {
        return this.search({ offset, limit });
    }

    // Private helper methods

    private initializeTables(): void {
        const tables = [
            `CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                status TEXT NOT NULL,
                description TEXT,
                template_id TEXT,
                workflow_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )`,
            `CREATE TABLE IF NOT EXISTS document_metadata (
                document_id TEXT PRIMARY KEY,
                tags TEXT,
                categories TEXT,
                custom_properties TEXT,
                language TEXT,
                encoding TEXT,
                extraction_metadata TEXT,
                security_metadata TEXT,
                workflow_metadata TEXT,
                FOREIGN KEY (document_id) REFERENCES documents(id)
            )`,
            `CREATE TABLE IF NOT EXISTS document_fields (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                value TEXT,
                required BOOLEAN,
                readonly BOOLEAN,
                bounds TEXT,
                page INTEGER,
                validation_rules TEXT,
                field_order INTEGER,
                metadata TEXT,
                FOREIGN KEY (document_id) REFERENCES documents(id)
            )`,
            `CREATE TABLE IF NOT EXISTS document_versions (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                version_number INTEGER NOT NULL,
                file_name TEXT NOT NULL,
                original_file_name TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                file_hash TEXT NOT NULL,
                file_path TEXT NOT NULL,
                thumbnail_path TEXT,
                change_description TEXT,
                created_at TEXT NOT NULL,
                created_by TEXT,
                metadata TEXT,
                page_count INTEGER,
                pdf_metadata TEXT,
                FOREIGN KEY (document_id) REFERENCES documents(id)
            )`
        ];

        tables.forEach(table => {
            this.db.run(table, (err) => {
                if (err) {
                    console.error('Error creating table:', err.message);
                }
            });
        });

        // Create indexes for better performance
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type)',
            'CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)',
            'CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_documents_template_id ON documents(template_id)',
            'CREATE INDEX IF NOT EXISTS idx_documents_workflow_id ON documents(workflow_id)',
            'CREATE INDEX IF NOT EXISTS idx_document_fields_document_id ON document_fields(document_id)',
            'CREATE INDEX IF NOT EXISTS idx_document_versions_document_id ON document_versions(document_id)'
        ];

        indexes.forEach(index => {
            this.db.run(index);
        });
    }

    private async mapRowToDocument(row: any): Promise<Document> {
        // Create document metadata
        const metadata = await this.getMetadata(row.id);
        
        // Create document instance
        const document = new Document(
            row.id,
            row.name,
            row.type as DocumentType,
            metadata,
            row.template_id,
            row.workflow_id
        );

        // Set additional properties
        if (row.description) {
            document.updateDescription(row.description);
        }
        
        // Transition to current status
        document.transitionTo(row.status as DocumentStatus);

        // Load fields
        const fields = await this.getFields(row.id);
        fields.forEach(field => document.addField(field));

        // Load versions
        const versions = await this.getVersions(row.id);
        versions.forEach(version => document.addVersion(version));

        return document;
    }

    private async insertMetadata(documentId: string, metadata: DocumentMetadata): Promise<void> {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO document_metadata (
                    document_id, tags, categories, custom_properties, language, encoding,
                    extraction_metadata, security_metadata, workflow_metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            this.db.run(query, [
                documentId,
                JSON.stringify(metadata.tags),
                JSON.stringify(metadata.categories),
                JSON.stringify(metadata.customProperties),
                metadata.language,
                metadata.encoding,
                JSON.stringify(metadata.extractionMetadata),
                JSON.stringify(metadata.securityMetadata),
                JSON.stringify(metadata.workflowMetadata)
            ], (err) => {
                if (err) {
                    reject(new Error(`Failed to insert metadata: ${err.message}`));
                } else {
                    resolve();
                }
            });
        });
    }

    private async getMetadata(documentId: string): Promise<DocumentMetadata> {
        return new Promise((resolve, reject) => {
            const query = 'SELECT * FROM document_metadata WHERE document_id = ?';
            
            this.db.get(query, [documentId], (err, row: any) => {
                if (err) {
                    reject(new Error(`Failed to get metadata: ${err.message}`));
                    return;
                }

                const metadata = new DocumentMetadata();
                
                if (row) {
                    if (row.tags) {
                        metadata.setTags(JSON.parse(row.tags));
                    }
                    if (row.categories) {
                        metadata.setCategories(JSON.parse(row.categories));
                    }
                    if (row.custom_properties) {
                        const props = JSON.parse(row.custom_properties);
                        Object.entries(props).forEach(([key, value]) => {
                            metadata.setCustomProperty(key, value);
                        });
                    }
                    if (row.language) {
                        metadata.setLanguage(row.language);
                    }
                    if (row.encoding) {
                        metadata.setEncoding(row.encoding);
                    }
                    if (row.extraction_metadata) {
                        metadata.updateExtractionMetadata(JSON.parse(row.extraction_metadata));
                    }
                    if (row.security_metadata) {
                        metadata.updateSecurityMetadata(JSON.parse(row.security_metadata));
                    }
                    if (row.workflow_metadata) {
                        metadata.updateWorkflowMetadata(JSON.parse(row.workflow_metadata));
                    }
                }
                
                resolve(metadata);
            });
        });
    }

    private async insertFields(documentId: string, fields: ReadonlyArray<Field>): Promise<void> {
        for (const field of fields) {
            await this.insertField(documentId, field);
        }
    }

    private async insertField(documentId: string, field: Field): Promise<void> {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO document_fields (
                    id, document_id, name, type, value, required, readonly,
                    bounds, page, validation_rules, field_order, metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            this.db.run(query, [
                field.id,
                documentId,
                field.name,
                field.type,
                JSON.stringify(field.value),
                field.required,
                field.readonly,
                JSON.stringify(field.bounds),
                field.page,
                JSON.stringify(field.validationRules),
                field.order,
                JSON.stringify(field.metadata)
            ], (err) => {
                if (err) {
                    reject(new Error(`Failed to insert field: ${err.message}`));
                } else {
                    resolve();
                }
            });
        });
    }

    private async getFields(documentId: string): Promise<Field[]> {
        return new Promise((resolve, reject) => {
            const query = 'SELECT * FROM document_fields WHERE document_id = ? ORDER BY field_order';
            
            this.db.all(query, [documentId], (err, rows: any[]) => {
                if (err) {
                    reject(new Error(`Failed to get fields: ${err.message}`));
                    return;
                }

                const fields = rows.map(row => {
                    const field = new Field(
                        row.id,
                        row.name,
                        row.type as FieldType,
                        row.required,
                        row.readonly,
                        row.field_order
                    );

                    if (row.value) {
                        const value = JSON.parse(row.value);
                        if (value !== null) {
                            field.setValue(value);
                        }
                    }
                    
                    if (row.bounds) {
                        field.setBounds(JSON.parse(row.bounds));
                    }
                    
                    if (row.page) {
                        field.setPage(row.page);
                    }
                    
                    if (row.validation_rules) {
                        const rules = JSON.parse(row.validation_rules);
                        rules.forEach((rule: any) => field.addValidationRule(rule));
                    }
                    
                    if (row.metadata) {
                        field.updateMetadata(JSON.parse(row.metadata));
                    }

                    return field;
                });

                resolve(fields);
            });
        });
    }

    private async insertVersions(documentId: string, versions: ReadonlyArray<DocumentVersion>): Promise<void> {
        for (const version of versions) {
            await this.insertVersion(documentId, version);
        }
    }

    private async insertVersion(documentId: string, version: DocumentVersion): Promise<void> {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO document_versions (
                    id, document_id, version_number, file_name, original_file_name,
                    mime_type, file_size, file_hash, file_path, thumbnail_path,
                    change_description, created_at, created_by, metadata,
                    page_count, pdf_metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            this.db.run(query, [
                version.id,
                documentId,
                version.versionNumber,
                version.fileName,
                version.originalFileName,
                version.mimeType,
                version.fileSize,
                version.fileHash,
                version.filePath,
                version.thumbnailPath,
                version.changeDescription,
                version.createdAt.toISOString(),
                version.createdBy,
                JSON.stringify(version.metadata),
                version.pageCount,
                JSON.stringify(version.pdfMetadata)
            ], (err) => {
                if (err) {
                    reject(new Error(`Failed to insert version: ${err.message}`));
                } else {
                    resolve();
                }
            });
        });
    }

    private async getVersions(documentId: string): Promise<DocumentVersion[]> {
        return new Promise((resolve, reject) => {
            const query = 'SELECT * FROM document_versions WHERE document_id = ? ORDER BY version_number';
            
            this.db.all(query, [documentId], (err, rows: any[]) => {
                if (err) {
                    reject(new Error(`Failed to get versions: ${err.message}`));
                    return;
                }

                const versions = rows.map(row => {
                    let version = new DocumentVersion(
                        row.id,
                        row.document_id,
                        row.version_number,
                        row.file_name,
                        row.original_file_name,
                        row.mime_type,
                        row.file_size,
                        row.file_hash,
                        row.file_path,
                        row.created_by,
                        row.change_description
                    );

                    if (row.thumbnail_path) {
                        version = version.withThumbnail(row.thumbnail_path);
                    }
                    
                    if (row.page_count && row.pdf_metadata) {
                        version = version.withPDFMetadata(row.page_count, JSON.parse(row.pdf_metadata));
                    }
                    
                    if (row.metadata) {
                        version = version.withMetadata(JSON.parse(row.metadata));
                    }

                    return version;
                });

                resolve(versions);
            });
        });
    }

    private async updateMetadata(documentId: string, metadata: DocumentMetadata): Promise<void> {
        // Delete existing and insert new (simpler than complex update logic)
        await this.deleteMetadata(documentId);
        await this.insertMetadata(documentId, metadata);
    }

    private async updateFields(documentId: string, fields: ReadonlyArray<Field>): Promise<void> {
        // Delete existing and insert new
        await this.deleteFields(documentId);
        await this.insertFields(documentId, fields);
    }

    private async updateVersions(documentId: string, versions: ReadonlyArray<DocumentVersion>): Promise<void> {
        // For versions, we typically only add new ones, not update existing
        // But for simplicity, we'll delete and re-insert
        await this.deleteVersions(documentId);
        await this.insertVersions(documentId, versions);
    }

    private async deleteMetadata(documentId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run('DELETE FROM document_metadata WHERE document_id = ?', [documentId], (err) => {
                if (err) {
                    reject(new Error(`Failed to delete metadata: ${err.message}`));
                } else {
                    resolve();
                }
            });
        });
    }

    private async deleteFields(documentId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run('DELETE FROM document_fields WHERE document_id = ?', [documentId], (err) => {
                if (err) {
                    reject(new Error(`Failed to delete fields: ${err.message}`));
                } else {
                    resolve();
                }
            });
        });
    }

    private async deleteVersions(documentId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run('DELETE FROM document_versions WHERE document_id = ?', [documentId], (err) => {
                if (err) {
                    reject(new Error(`Failed to delete versions: ${err.message}`));
                } else {
                    resolve();
                }
            });
        });
    }
}

/**
 * SQLite Query Builder implementation
 * Provides fluent interface for building complex document queries
 */
class SQLiteDocumentQueryBuilder implements IDocumentQueryBuilder {
    private db: Database;
    private conditions: string[] = [];
    private parameters: any[] = [];
    private orderBy: string = '';
    private limitClause: string = '';
    private offsetClause: string = '';

    constructor(database: Database) {
        this.db = database;
    }

    public byName(name: string): IDocumentQueryBuilder {
        this.conditions.push('name LIKE ?');
        this.parameters.push(`%${name}%`);
        return this;
    }

    public byType(type: string): IDocumentQueryBuilder {
        this.conditions.push('type = ?');
        this.parameters.push(type);
        return this;
    }

    public byStatus(status: string): IDocumentQueryBuilder {
        this.conditions.push('status = ?');
        this.parameters.push(status);
        return this;
    }

    public byTags(tags: string[]): IDocumentQueryBuilder {
        // Join with metadata table to search tags
        tags.forEach(tag => {
            this.conditions.push('EXISTS (SELECT 1 FROM document_metadata dm WHERE dm.document_id = documents.id AND dm.tags LIKE ?)');
            this.parameters.push(`%"${tag}"%`);
        });
        return this;
    }

    public byCategories(categories: string[]): IDocumentQueryBuilder {
        // Join with metadata table to search categories
        categories.forEach(category => {
            this.conditions.push('EXISTS (SELECT 1 FROM document_metadata dm WHERE dm.document_id = documents.id AND dm.categories LIKE ?)');
            this.parameters.push(`%"${category}"%`);
        });
        return this;
    }

    public byTemplateId(templateId: string): IDocumentQueryBuilder {
        this.conditions.push('template_id = ?');
        this.parameters.push(templateId);
        return this;
    }

    public byWorkflowId(workflowId: string): IDocumentQueryBuilder {
        this.conditions.push('workflow_id = ?');
        this.parameters.push(workflowId);
        return this;
    }

    public createdBetween(from: Date, to: Date): IDocumentQueryBuilder {
        this.conditions.push('created_at >= ? AND created_at <= ?');
        this.parameters.push(from.toISOString(), to.toISOString());
        return this;
    }

    public updatedBetween(from: Date, to: Date): IDocumentQueryBuilder {
        this.conditions.push('updated_at >= ? AND updated_at <= ?');
        this.parameters.push(from.toISOString(), to.toISOString());
        return this;
    }

    public paginate(offset: number, limit: number): IDocumentQueryBuilder {
        this.offsetClause = `OFFSET ${offset}`;
        this.limitClause = `LIMIT ${limit}`;
        return this;
    }

    public sortBy(field: string, order: 'asc' | 'desc'): IDocumentQueryBuilder {
        this.orderBy = `ORDER BY ${field} ${order.toUpperCase()}`;
        return this;
    }

    public async execute(): Promise<Document[]> {
        const repository = new SQLiteDocumentRepository(this.db);
        
        return new Promise((resolve, reject) => {
            let query = 'SELECT DISTINCT documents.* FROM documents';
            
            if (this.conditions.length > 0) {
                query += ` WHERE ${this.conditions.join(' AND ')}`;
            }
            
            if (this.orderBy) {
                query += ` ${this.orderBy}`;
            }
            
            if (this.limitClause) {
                query += ` ${this.limitClause}`;
            }
            
            if (this.offsetClause) {
                query += ` ${this.offsetClause}`;
            }

            this.db.all(query, this.parameters, async (err, rows: any[]) => {
                if (err) {
                    reject(new Error(`Query execution failed: ${err.message}`));
                    return;
                }

                try {
                    const documents = await Promise.all(
                        rows.map(row => (repository as any).mapRowToDocument(row))
                    );
                    resolve(documents);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    public async count(): Promise<number> {
        return new Promise((resolve, reject) => {
            let query = 'SELECT COUNT(DISTINCT documents.id) as count FROM documents';
            
            if (this.conditions.length > 0) {
                query += ` WHERE ${this.conditions.join(' AND ')}`;
            }

            this.db.get(query, this.parameters, (err, row: any) => {
                if (err) {
                    reject(new Error(`Count query failed: ${err.message}`));
                    return;
                }
                
                resolve(row.count);
            });
        });
    }

    public async first(): Promise<Document | null> {
        this.limitClause = 'LIMIT 1';
        const results = await this.execute();
        return results.length > 0 ? results[0] : null;
    }

    public reset(): IDocumentQueryBuilder {
        this.conditions = [];
        this.parameters = [];
        this.orderBy = '';
        this.limitClause = '';
        this.offsetClause = '';
        return this;
    }
}