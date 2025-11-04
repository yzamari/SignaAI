import { Document } from '../models/Document';
import { DocumentMetadata } from '../models/DocumentMetadata';
import { DocumentVersion } from '../models/DocumentVersion';
import { Field } from '../models/Field';
import { DocumentType, CreateDocumentRequest } from '../types/DocumentTypes';
import { FieldType } from '../types/FieldTypes';
import { v4 as uuidv4 } from 'uuid';

/**
 * Document Factory - Implements Factory pattern for document creation
 * Encapsulates document creation logic and provides different creation strategies.
 * 
 * Follows SOLID principles:
 * - Single Responsibility: Document creation only
 * - Open/Closed: Extensible through strategy pattern
 * - Liskov Substitution: Factory methods can be overridden
 * - Interface Segregation: Focused factory interface
 * - Dependency Inversion: Uses abstractions for creation strategies
 */
export class DocumentFactory {
    private static instance: DocumentFactory;
    private creationStrategies: Map<DocumentType, DocumentCreationStrategy> = new Map();

    private constructor() {
        this.initializeDefaultStrategies();
    }

    /**
     * Gets singleton instance of DocumentFactory
     * @returns DocumentFactory instance
     */
    public static getInstance(): DocumentFactory {
        if (!DocumentFactory.instance) {
            DocumentFactory.instance = new DocumentFactory();
        }
        return DocumentFactory.instance;
    }

    /**
     * Creates a document using appropriate strategy based on type
     * @param request Document creation request
     * @returns Created document instance
     */
    public createDocument(request: CreateDocumentRequest): Document {
        const strategy = this.creationStrategies.get(request.type);
        if (!strategy) {
            throw new Error(`No creation strategy found for document type: ${request.type}`);
        }

        return strategy.create(request);
    }

    /**
     * Creates a document from template
     * @param templateId Template ID to use
     * @param request Document creation request
     * @returns Created document instance
     */
    public createDocumentFromTemplate(templateId: string, request: CreateDocumentRequest): Document {
        // Load template and create document with template fields
        const template = this.loadTemplate(templateId);
        const document = this.createDocument(request);

        // Add template fields to document
        template.fields.forEach(fieldTemplate => {
            const field = this.createFieldFromTemplate(fieldTemplate);
            document.addField(field);
        });

        return document;
    }

    /**
     * Creates a simple document with minimal setup
     * @param name Document name
     * @param type Document type
     * @returns Created document instance
     */
    public createSimpleDocument(name: string, type: DocumentType): Document {
        const metadata = new DocumentMetadata();
        return new Document(uuidv4(), name, type, metadata);
    }

    /**
     * Registers a custom creation strategy for a document type
     * @param documentType Document type
     * @param strategy Creation strategy
     */
    public registerStrategy(documentType: DocumentType, strategy: DocumentCreationStrategy): void {
        this.creationStrategies.set(documentType, strategy);
    }

    /**
     * Creates a document version
     * @param documentId Document ID
     * @param versionNumber Version number
     * @param fileName File name
     * @param originalFileName Original file name
     * @param mimeType MIME type
     * @param fileSize File size
     * @param fileHash File hash
     * @param filePath File path
     * @param createdBy User who created the version
     * @returns Created document version
     */
    public createDocumentVersion(
        documentId: string,
        versionNumber: number,
        fileName: string,
        originalFileName: string,
        mimeType: string,
        fileSize: number,
        fileHash: string,
        filePath: string,
        createdBy?: string
    ): DocumentVersion {
        return new DocumentVersion(
            uuidv4(),
            documentId,
            versionNumber,
            fileName,
            originalFileName,
            mimeType,
            fileSize,
            fileHash,
            filePath,
            createdBy
        );
    }

    /**
     * Creates a field with validation
     * @param name Field name
     * @param type Field type
     * @param required Whether field is required
     * @param defaultValue Default value
     * @returns Created field
     */
    public createField(
        name: string,
        type: FieldType,
        required: boolean = false,
        defaultValue?: any
    ): Field {
        const field = new Field(uuidv4(), name, type, required);
        
        if (defaultValue !== undefined) {
            field.setDefaultValue(defaultValue);
        }

        return field;
    }

    // Private helper methods

    private initializeDefaultStrategies(): void {
        this.creationStrategies.set(DocumentType.CONTRACT, new ContractCreationStrategy());
        this.creationStrategies.set(DocumentType.INVOICE, new InvoiceCreationStrategy());
        this.creationStrategies.set(DocumentType.FORM, new FormCreationStrategy());
        this.creationStrategies.set(DocumentType.CERTIFICATE, new CertificateCreationStrategy());
        this.creationStrategies.set(DocumentType.ID_DOCUMENT, new IdDocumentCreationStrategy());
        this.creationStrategies.set(DocumentType.OTHER, new GenericCreationStrategy());
    }

    private loadTemplate(templateId: string): any {
        // Mock template loading - would typically load from repository
        return {
            id: templateId,
            fields: [
                {
                    name: 'Template Field',
                    type: FieldType.TEXT,
                    required: false,
                    defaultValue: null
                }
            ]
        };
    }

    private createFieldFromTemplate(fieldTemplate: any): Field {
        const field = new Field(
            uuidv4(),
            fieldTemplate.name,
            fieldTemplate.type,
            fieldTemplate.required
        );

        if (fieldTemplate.defaultValue) {
            field.setDefaultValue(fieldTemplate.defaultValue);
        }

        return field;
    }
}

/**
 * Document Creation Strategy Interface
 * Defines contract for document creation strategies
 */
export interface DocumentCreationStrategy {
    create(request: CreateDocumentRequest): Document;
}

/**
 * Generic document creation strategy
 */
export class GenericCreationStrategy implements DocumentCreationStrategy {
    public create(request: CreateDocumentRequest): Document {
        const metadata = new DocumentMetadata();
        
        if (request.metadata?.tags) {
            metadata.setTags(request.metadata.tags);
        }
        
        if (request.metadata?.categories) {
            metadata.setCategories(request.metadata.categories);
        }

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

        return document;
    }
}

/**
 * Contract-specific creation strategy
 */
export class ContractCreationStrategy implements DocumentCreationStrategy {
    public create(request: CreateDocumentRequest): Document {
        const metadata = new DocumentMetadata();
        metadata.addCategory('legal');
        metadata.addTag('contract');
        
        if (request.metadata?.tags) {
            request.metadata.tags.forEach(tag => metadata.addTag(tag));
        }

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

        // Add contract-specific fields
        this.addContractFields(document);

        return document;
    }

    private addContractFields(document: Document): void {
        const fields = [
            new Field(uuidv4(), 'Contract Title', FieldType.TEXT, true),
            new Field(uuidv4(), 'Party A', FieldType.TEXT, true),
            new Field(uuidv4(), 'Party B', FieldType.TEXT, true),
            new Field(uuidv4(), 'Effective Date', FieldType.DATE, true),
            new Field(uuidv4(), 'Expiration Date', FieldType.DATE, false),
            new Field(uuidv4(), 'Contract Value', FieldType.CURRENCY, false)
        ];

        fields.forEach((field, index) => {
            field.setOrder(index);
            document.addField(field);
        });
    }
}

/**
 * Invoice-specific creation strategy
 */
export class InvoiceCreationStrategy implements DocumentCreationStrategy {
    public create(request: CreateDocumentRequest): Document {
        const metadata = new DocumentMetadata();
        metadata.addCategory('financial');
        metadata.addTag('invoice');
        
        if (request.metadata?.tags) {
            request.metadata.tags.forEach(tag => metadata.addTag(tag));
        }

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

        // Add invoice-specific fields
        this.addInvoiceFields(document);

        return document;
    }

    private addInvoiceFields(document: Document): void {
        const fields = [
            new Field(uuidv4(), 'Invoice Number', FieldType.TEXT, true),
            new Field(uuidv4(), 'Invoice Date', FieldType.DATE, true),
            new Field(uuidv4(), 'Due Date', FieldType.DATE, true),
            new Field(uuidv4(), 'Vendor Name', FieldType.TEXT, true),
            new Field(uuidv4(), 'Customer Name', FieldType.TEXT, true),
            new Field(uuidv4(), 'Total Amount', FieldType.CURRENCY, true),
            new Field(uuidv4(), 'Tax Amount', FieldType.CURRENCY, false),
            new Field(uuidv4(), 'Payment Terms', FieldType.TEXT, false)
        ];

        fields.forEach((field, index) => {
            field.setOrder(index);
            document.addField(field);
        });
    }
}

/**
 * Form-specific creation strategy
 */
export class FormCreationStrategy implements DocumentCreationStrategy {
    public create(request: CreateDocumentRequest): Document {
        const metadata = new DocumentMetadata();
        metadata.addCategory('forms');
        metadata.addTag('form');
        
        if (request.metadata?.tags) {
            request.metadata.tags.forEach(tag => metadata.addTag(tag));
        }

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

        return document;
    }
}

/**
 * Certificate-specific creation strategy
 */
export class CertificateCreationStrategy implements DocumentCreationStrategy {
    public create(request: CreateDocumentRequest): Document {
        const metadata = new DocumentMetadata();
        metadata.addCategory('certificates');
        metadata.addTag('certificate');
        
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

        // Add certificate-specific fields
        this.addCertificateFields(document);

        return document;
    }

    private addCertificateFields(document: Document): void {
        const fields = [
            new Field(uuidv4(), 'Certificate Number', FieldType.TEXT, true),
            new Field(uuidv4(), 'Issue Date', FieldType.DATE, true),
            new Field(uuidv4(), 'Expiration Date', FieldType.DATE, false),
            new Field(uuidv4(), 'Issued To', FieldType.TEXT, true),
            new Field(uuidv4(), 'Issued By', FieldType.TEXT, true),
            new Field(uuidv4(), 'Certificate Type', FieldType.TEXT, true)
        ];

        fields.forEach((field, index) => {
            field.setOrder(index);
            document.addField(field);
        });
    }
}

/**
 * ID Document-specific creation strategy
 */
export class IdDocumentCreationStrategy implements DocumentCreationStrategy {
    public create(request: CreateDocumentRequest): Document {
        const metadata = new DocumentMetadata();
        metadata.addCategory('identification');
        metadata.addTag('id-document');
        
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

        // Add ID document-specific fields
        this.addIdDocumentFields(document);

        return document;
    }

    private addIdDocumentFields(document: Document): void {
        const fields = [
            new Field(uuidv4(), 'Document Number', FieldType.TEXT, true),
            new Field(uuidv4(), 'Full Name', FieldType.TEXT, true),
            new Field(uuidv4(), 'Date of Birth', FieldType.DATE, true),
            new Field(uuidv4(), 'Issue Date', FieldType.DATE, true),
            new Field(uuidv4(), 'Expiration Date', FieldType.DATE, false),
            new Field(uuidv4(), 'Issuing Authority', FieldType.TEXT, true)
        ];

        fields.forEach((field, index) => {
            field.setOrder(index);
            document.addField(field);
        });
    }
}