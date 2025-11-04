/**
 * Document-related type definitions.
 * Defines enums and types used throughout the document service.
 */

/**
 * Enumeration of document types supported by the system
 */
export enum DocumentType {
    CONTRACT = 'contract',
    INVOICE = 'invoice',
    FORM = 'form',
    CERTIFICATE = 'certificate',
    ID_DOCUMENT = 'id_document',
    FINANCIAL_STATEMENT = 'financial_statement',
    LEGAL_DOCUMENT = 'legal_document',
    MEDICAL_RECORD = 'medical_record',
    EDUCATIONAL_CERTIFICATE = 'educational_certificate',
    OTHER = 'other'
}

/**
 * Enumeration of document processing statuses
 */
export enum DocumentStatus {
    DRAFT = 'draft',
    UPLOADED = 'uploaded',
    PROCESSING = 'processing',
    PROCESSED = 'processed',
    READY_FOR_SIGNATURE = 'ready_for_signature',
    SIGNED = 'signed',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
    ARCHIVED = 'archived'
}

/**
 * Enumeration of document processing priorities
 */
export enum DocumentPriority {
    LOW = 'low',
    NORMAL = 'normal',
    HIGH = 'high',
    URGENT = 'urgent'
}

/**
 * Document creation request interface
 */
export interface CreateDocumentRequest {
    name: string;
    type: DocumentType;
    description?: string;
    templateId?: string;
    workflowId?: string;
    metadata?: {
        tags?: string[];
        categories?: string[];
        customProperties?: Record<string, any>;
        priority?: DocumentPriority;
    };
}

/**
 * Document update request interface
 */
export interface UpdateDocumentRequest {
    name?: string;
    description?: string;
    metadata?: {
        tags?: string[];
        categories?: string[];
        customProperties?: Record<string, any>;
        priority?: DocumentPriority;
    };
}

/**
 * Document search criteria interface
 */
export interface DocumentSearchCriteria {
    name?: string;
    type?: DocumentType;
    status?: DocumentStatus;
    tags?: string[];
    categories?: string[];
    priority?: DocumentPriority;
    createdAfter?: Date;
    createdBefore?: Date;
    updatedAfter?: Date;
    updatedBefore?: Date;
    templateId?: string;
    workflowId?: string;
    limit?: number;
    offset?: number;
    sortBy?: 'name' | 'type' | 'status' | 'createdAt' | 'updatedAt';
    sortOrder?: 'asc' | 'desc';
}

/**
 * Document processing options interface
 */
export interface DocumentProcessingOptions {
    performOCR?: boolean;
    extractFields?: boolean;
    generateThumbnails?: boolean;
    validateContent?: boolean;
    detectLanguage?: boolean;
    extractMetadata?: boolean;
    processImages?: boolean;
    maxProcessingTime?: number;
}

/**
 * Document validation result interface
 */
export interface DocumentValidationResult {
    isValid: boolean;
    errors: Array<{
        field?: string;
        message: string;
        code: string;
    }>;
    warnings: Array<{
        field?: string;
        message: string;
        code: string;
    }>;
}

/**
 * Document processing result interface
 */
export interface DocumentProcessingResult {
    success: boolean;
    processingTime: number;
    extractedText?: string;
    detectedFields?: Array<{
        id: string;
        type: string;
        value: any;
        confidence: number;
        bounds?: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
    }>;
    metadata?: Record<string, any>;
    errors?: string[];
    warnings?: string[];
}

/**
 * Document template interface
 */
export interface DocumentTemplate {
    id: string;
    name: string;
    description?: string;
    documentType: DocumentType;
    fields: Array<{
        name: string;
        type: string;
        required: boolean;
        defaultValue?: any;
        bounds?: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
        page?: number;
    }>;
    metadata?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Document workflow interface
 */
export interface DocumentWorkflow {
    id: string;
    name: string;
    description?: string;
    steps: Array<{
        id: string;
        name: string;
        type: 'upload' | 'process' | 'review' | 'sign' | 'archive';
        order: number;
        required: boolean;
        assignedTo?: string;
        dueDate?: Date;
        completed: boolean;
        completedAt?: Date;
        completedBy?: string;
    }>;
    currentStep?: string;
    status: 'active' | 'completed' | 'cancelled';
    metadata?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Document audit log entry interface
 */
export interface DocumentAuditEntry {
    id: string;
    documentId: string;
    action: string;
    details: Record<string, any>;
    performedBy: string;
    performedAt: Date;
    ipAddress?: string;
    userAgent?: string;
}

/**
 * Document sharing configuration interface
 */
export interface DocumentSharingConfig {
    isPublic: boolean;
    allowDownload: boolean;
    allowPrint: boolean;
    passwordProtected: boolean;
    expiresAt?: Date;
    allowedUsers?: string[];
    allowedRoles?: string[];
}

/**
 * Document statistics interface
 */
export interface DocumentStatistics {
    totalDocuments: number;
    documentsByType: Record<DocumentType, number>;
    documentsByStatus: Record<DocumentStatus, number>;
    processingStats: {
        averageProcessingTime: number;
        successRate: number;
        failureRate: number;
    };
    storageStats: {
        totalSize: number;
        averageFileSize: number;
    };
    activityStats: {
        documentsCreatedToday: number;
        documentsProcessedToday: number;
        documentsSignedToday: number;
    };
}

/**
 * Type guard functions
 */
export const isDocumentType = (value: any): value is DocumentType => {
    return Object.values(DocumentType).includes(value);
};

export const isDocumentStatus = (value: any): value is DocumentStatus => {
    return Object.values(DocumentStatus).includes(value);
};

export const isDocumentPriority = (value: any): value is DocumentPriority => {
    return Object.values(DocumentPriority).includes(value);
};

/**
 * Default values and constants
 */
export const DEFAULT_DOCUMENT_TYPE = DocumentType.OTHER;
export const DEFAULT_DOCUMENT_STATUS = DocumentStatus.DRAFT;
export const DEFAULT_DOCUMENT_PRIORITY = DocumentPriority.NORMAL;

export const MAX_DOCUMENT_NAME_LENGTH = 255;
export const MAX_DOCUMENT_DESCRIPTION_LENGTH = 1000;
export const MAX_TAG_LENGTH = 50;
export const MAX_CATEGORY_LENGTH = 100;

export const SUPPORTED_DOCUMENT_TYPES = Object.values(DocumentType);
export const SUPPORTED_DOCUMENT_STATUSES = Object.values(DocumentStatus);
export const SUPPORTED_DOCUMENT_PRIORITIES = Object.values(DocumentPriority);

/**
 * Document type configuration mapping
 */
export const DOCUMENT_TYPE_CONFIG: Record<DocumentType, {
    displayName: string;
    description: string;
    allowedMimeTypes: string[];
    defaultProcessingOptions: DocumentProcessingOptions;
}> = {
    [DocumentType.CONTRACT]: {
        displayName: 'Contract',
        description: 'Legal contracts and agreements',
        allowedMimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        defaultProcessingOptions: {
            performOCR: true,
            extractFields: true,
            generateThumbnails: true,
            validateContent: true,
            detectLanguage: true,
            extractMetadata: true
        }
    },
    [DocumentType.INVOICE]: {
        displayName: 'Invoice',
        description: 'Invoices and billing documents',
        allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
        defaultProcessingOptions: {
            performOCR: true,
            extractFields: true,
            generateThumbnails: true,
            validateContent: true,
            detectLanguage: false,
            extractMetadata: true
        }
    },
    [DocumentType.FORM]: {
        displayName: 'Form',
        description: 'Forms and applications',
        allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
        defaultProcessingOptions: {
            performOCR: true,
            extractFields: true,
            generateThumbnails: true,
            validateContent: false,
            detectLanguage: false,
            extractMetadata: true
        }
    },
    [DocumentType.CERTIFICATE]: {
        displayName: 'Certificate',
        description: 'Certificates and credentials',
        allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
        defaultProcessingOptions: {
            performOCR: true,
            extractFields: false,
            generateThumbnails: true,
            validateContent: true,
            detectLanguage: true,
            extractMetadata: true
        }
    },
    [DocumentType.ID_DOCUMENT]: {
        displayName: 'ID Document',
        description: 'Identity documents and licenses',
        allowedMimeTypes: ['image/png', 'image/jpeg', 'application/pdf'],
        defaultProcessingOptions: {
            performOCR: true,
            extractFields: true,
            generateThumbnails: true,
            validateContent: true,
            detectLanguage: false,
            extractMetadata: true
        }
    },
    [DocumentType.FINANCIAL_STATEMENT]: {
        displayName: 'Financial Statement',
        description: 'Financial statements and reports',
        allowedMimeTypes: ['application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        defaultProcessingOptions: {
            performOCR: true,
            extractFields: true,
            generateThumbnails: true,
            validateContent: true,
            detectLanguage: false,
            extractMetadata: true
        }
    },
    [DocumentType.LEGAL_DOCUMENT]: {
        displayName: 'Legal Document',
        description: 'Legal documents and court filings',
        allowedMimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        defaultProcessingOptions: {
            performOCR: true,
            extractFields: false,
            generateThumbnails: true,
            validateContent: true,
            detectLanguage: true,
            extractMetadata: true
        }
    },
    [DocumentType.MEDICAL_RECORD]: {
        displayName: 'Medical Record',
        description: 'Medical records and health documents',
        allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
        defaultProcessingOptions: {
            performOCR: true,
            extractFields: true,
            generateThumbnails: true,
            validateContent: true,
            detectLanguage: false,
            extractMetadata: true
        }
    },
    [DocumentType.EDUCATIONAL_CERTIFICATE]: {
        displayName: 'Educational Certificate',
        description: 'Educational certificates and transcripts',
        allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
        defaultProcessingOptions: {
            performOCR: true,
            extractFields: true,
            generateThumbnails: true,
            validateContent: true,
            detectLanguage: true,
            extractMetadata: true
        }
    },
    [DocumentType.OTHER]: {
        displayName: 'Other',
        description: 'Other document types',
        allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        defaultProcessingOptions: {
            performOCR: false,
            extractFields: false,
            generateThumbnails: true,
            validateContent: false,
            detectLanguage: false,
            extractMetadata: false
        }
    }
};