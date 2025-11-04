import { Document } from '../models/Document';
import { DocumentVersion } from '../models/DocumentVersion';
import { Field } from '../models/Field';
import { DocumentProcessingOptions, DocumentProcessingResult } from '../types/DocumentTypes';
import { FieldExtractionResult } from '../types/FieldTypes';

/**
 * Document Processing Interfaces
 * Defines contracts for document processing operations using Strategy and Template Method patterns.
 * 
 * Follows Interface Segregation Principle:
 * - Separate interfaces for different processing capabilities
 * - Clients depend only on the processing features they need
 */

/**
 * OCR Processing Result
 */
export interface OCRProcessingResult {
    success: boolean;
    extractedText: string;
    confidence: number;
    language?: string;
    processingTime: number;
    textBlocks?: Array<{
        text: string;
        confidence: number;
        bounds: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
        page: number;
    }>;
    metadata?: Record<string, any>;
    errors?: string[];
}

/**
 * PDF Processing Result
 */
export interface PDFProcessingResult {
    success: boolean;
    pageCount: number;
    metadata: {
        title?: string;
        author?: string;
        subject?: string;
        keywords?: string[];
        creator?: string;
        producer?: string;
        creationDate?: Date;
        modificationDate?: Date;
    };
    thumbnails?: Array<{
        page: number;
        buffer: Buffer;
        width: number;
        height: number;
    }>;
    processingTime: number;
    errors?: string[];
}

/**
 * Image Processing Result
 */
export interface ImageProcessingResult {
    success: boolean;
    originalSize: { width: number; height: number };
    processedImages: Array<{
        type: 'thumbnail' | 'preview' | 'compressed';
        buffer: Buffer;
        width: number;
        height: number;
        quality?: number;
    }>;
    processingTime: number;
    errors?: string[];
}

/**
 * Core Document Processor Interface
 * Defines basic document processing operations.
 */
export interface IDocumentProcessor {
    /**
     * Processes a document version with specified options
     * @param documentVersion Document version to process
     * @param options Processing options
     * @returns Promise resolving to processing result
     * @throws ProcessingError if processing fails
     */
    process(documentVersion: DocumentVersion, options: DocumentProcessingOptions): Promise<DocumentProcessingResult>;

    /**
     * Validates if a document can be processed
     * @param documentVersion Document version to validate
     * @returns Promise resolving to validation result
     * @throws ValidationError if validation fails
     */
    canProcess(documentVersion: DocumentVersion): Promise<boolean>;

    /**
     * Gets supported MIME types for processing
     * @returns Array of supported MIME types
     */
    getSupportedMimeTypes(): string[];

    /**
     * Gets default processing options for a document type
     * @param mimeType Document MIME type
     * @returns Default processing options
     */
    getDefaultOptions(mimeType: string): DocumentProcessingOptions;

    /**
     * Estimates processing time for a document
     * @param documentVersion Document version
     * @param options Processing options
     * @returns Estimated processing time in milliseconds
     */
    estimateProcessingTime(documentVersion: DocumentVersion, options: DocumentProcessingOptions): Promise<number>;
}

/**
 * OCR Service Interface
 * Specialized interface for Optical Character Recognition.
 */
export interface IOCRService {
    /**
     * Performs OCR on a document version
     * @param documentVersion Document version containing image or PDF
     * @param options OCR-specific options
     * @returns Promise resolving to OCR result
     * @throws OCRError if OCR processing fails
     */
    performOCR(documentVersion: DocumentVersion, options?: {
        language?: string;
        confidence?: number;
        preserveLayout?: boolean;
        detectTables?: boolean;
        extractCoordinates?: boolean;
    }): Promise<OCRProcessingResult>;

    /**
     * Detects the language of text in a document
     * @param documentVersion Document version
     * @returns Promise resolving to detected language code
     * @throws OCRError if language detection fails
     */
    detectLanguage(documentVersion: DocumentVersion): Promise<string>;

    /**
     * Extracts text from specific regions of a document
     * @param documentVersion Document version
     * @param regions Array of regions to extract text from
     * @returns Promise resolving to extracted text per region
     * @throws OCRError if extraction fails
     */
    extractTextFromRegions(documentVersion: DocumentVersion, regions: Array<{
        x: number;
        y: number;
        width: number;
        height: number;
        page?: number;
    }>): Promise<Array<{
        region: any;
        text: string;
        confidence: number;
    }>>;

    /**
     * Gets OCR confidence threshold
     * @returns Minimum confidence threshold for OCR results
     */
    getConfidenceThreshold(): number;

    /**
     * Sets OCR confidence threshold
     * @param threshold New confidence threshold (0-1)
     */
    setConfidenceThreshold(threshold: number): void;

    /**
     * Gets supported languages for OCR
     * @returns Array of supported language codes
     */
    getSupportedLanguages(): string[];
}

/**
 * PDF Processor Interface
 * Specialized interface for PDF document processing.
 */
export interface IPDFProcessor {
    /**
     * Processes a PDF document
     * @param documentVersion PDF document version
     * @param options PDF processing options
     * @returns Promise resolving to PDF processing result
     * @throws PDFError if processing fails
     */
    processPDF(documentVersion: DocumentVersion, options?: {
        extractMetadata?: boolean;
        generateThumbnails?: boolean;
        thumbnailSize?: { width: number; height: number };
        extractText?: boolean;
        extractImages?: boolean;
        validateStructure?: boolean;
    }): Promise<PDFProcessingResult>;

    /**
     * Extracts metadata from a PDF
     * @param documentVersion PDF document version
     * @returns Promise resolving to PDF metadata
     * @throws PDFError if metadata extraction fails
     */
    extractMetadata(documentVersion: DocumentVersion): Promise<Record<string, any>>;

    /**
     * Generates thumbnails for PDF pages
     * @param documentVersion PDF document version
     * @param options Thumbnail generation options
     * @returns Promise resolving to thumbnail buffers
     * @throws PDFError if thumbnail generation fails
     */
    generateThumbnails(documentVersion: DocumentVersion, options?: {
        size?: { width: number; height: number };
        format?: 'png' | 'jpeg' | 'webp';
        quality?: number;
        pages?: number[];
    }): Promise<Array<{
        page: number;
        buffer: Buffer;
        width: number;
        height: number;
    }>>;

    /**
     * Validates PDF structure and integrity
     * @param documentVersion PDF document version
     * @returns Promise resolving to validation result
     * @throws PDFError if validation fails
     */
    validatePDF(documentVersion: DocumentVersion): Promise<{
        isValid: boolean;
        version: string;
        pageCount: number;
        encrypted: boolean;
        errors: string[];
        warnings: string[];
    }>;

    /**
     * Converts PDF pages to images
     * @param documentVersion PDF document version
     * @param options Conversion options
     * @returns Promise resolving to image buffers
     * @throws PDFError if conversion fails
     */
    convertToImages(documentVersion: DocumentVersion, options?: {
        format?: 'png' | 'jpeg' | 'webp';
        quality?: number;
        resolution?: number;
        pages?: number[];
    }): Promise<Array<{
        page: number;
        buffer: Buffer;
        width: number;
        height: number;
    }>>;
}

/**
 * Image Processor Interface
 * Specialized interface for image processing operations.
 */
export interface IImageProcessor {
    /**
     * Processes an image document
     * @param documentVersion Image document version
     * @param options Image processing options
     * @returns Promise resolving to image processing result
     * @throws ImageProcessingError if processing fails
     */
    processImage(documentVersion: DocumentVersion, options?: {
        generateThumbnails?: boolean;
        thumbnailSizes?: Array<{ width: number; height: number; label?: string }>;
        compress?: boolean;
        compressionQuality?: number;
        convertFormat?: string;
        autoRotate?: boolean;
        normalize?: boolean;
    }): Promise<ImageProcessingResult>;

    /**
     * Generates thumbnails for an image
     * @param documentVersion Image document version
     * @param sizes Array of thumbnail sizes to generate
     * @returns Promise resolving to thumbnail buffers
     * @throws ImageProcessingError if thumbnail generation fails
     */
    generateThumbnails(documentVersion: DocumentVersion, sizes: Array<{
        width: number;
        height: number;
        label?: string;
    }>): Promise<Array<{
        label?: string;
        buffer: Buffer;
        width: number;
        height: number;
        size: number;
    }>>;

    /**
     * Compresses an image while maintaining quality
     * @param documentVersion Image document version
     * @param quality Compression quality (0-100)
     * @param format Target format
     * @returns Promise resolving to compressed image buffer
     * @throws ImageProcessingError if compression fails
     */
    compressImage(documentVersion: DocumentVersion, quality: number, format?: string): Promise<Buffer>;

    /**
     * Gets image metadata and EXIF data
     * @param documentVersion Image document version
     * @returns Promise resolving to image metadata
     * @throws ImageProcessingError if metadata extraction fails
     */
    getImageMetadata(documentVersion: DocumentVersion): Promise<{
        width: number;
        height: number;
        format: string;
        colorSpace: string;
        hasAlpha: boolean;
        exif?: Record<string, any>;
        icc?: Record<string, any>;
    }>;

    /**
     * Normalizes image orientation and quality
     * @param documentVersion Image document version
     * @returns Promise resolving to normalized image buffer
     * @throws ImageProcessingError if normalization fails
     */
    normalizeImage(documentVersion: DocumentVersion): Promise<Buffer>;
}

/**
 * Field Extraction Service Interface
 * Specialized interface for extracting form fields from documents.
 */
export interface IFieldExtractionService {
    /**
     * Extracts fields from a processed document
     * @param document Document containing processed data
     * @param documentVersion Document version with content
     * @param templateFields Optional template fields to guide extraction
     * @returns Promise resolving to extracted field results
     * @throws FieldExtractionError if extraction fails
     */
    extractFields(
        document: Document, 
        documentVersion: DocumentVersion, 
        templateFields?: Field[]
    ): Promise<FieldExtractionResult[]>;

    /**
     * Validates extracted field values against field definitions
     * @param extractedFields Array of extracted field results
     * @param fieldDefinitions Field definitions for validation
     * @returns Promise resolving to validation results
     * @throws ValidationError if validation fails
     */
    validateExtractedFields(
        extractedFields: FieldExtractionResult[], 
        fieldDefinitions: Field[]
    ): Promise<Array<{
        fieldId: string;
        isValid: boolean;
        errors: string[];
        normalizedValue?: any;
    }>>;

    /**
     * Auto-detects form fields in a document without templates
     * @param documentVersion Document version to analyze
     * @returns Promise resolving to detected field candidates
     * @throws FieldDetectionError if detection fails
     */
    detectFields(documentVersion: DocumentVersion): Promise<Array<{
        suggestedName: string;
        detectedType: string;
        confidence: number;
        bounds: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
        page: number;
        extractedValue?: any;
    }>>;

    /**
     * Learns field patterns from examples for improved extraction
     * @param examples Array of example documents with known field values
     * @returns Promise resolving to learned patterns
     * @throws LearningError if pattern learning fails
     */
    learnFieldPatterns(examples: Array<{
        documentVersion: DocumentVersion;
        knownFields: Array<{
            name: string;
            value: any;
            bounds: {
                x: number;
                y: number;
                width: number;
                height: number;
            };
            page: number;
        }>;
    }>): Promise<Record<string, any>>;

    /**
     * Gets field extraction confidence threshold
     * @returns Minimum confidence for field extraction
     */
    getConfidenceThreshold(): number;

    /**
     * Sets field extraction confidence threshold
     * @param threshold New confidence threshold (0-1)
     */
    setConfidenceThreshold(threshold: number): void;
}

/**
 * Document Processing Pipeline Interface
 * Orchestrates multiple processing steps using Template Method pattern.
 */
export interface IDocumentProcessingPipeline {
    /**
     * Executes the complete document processing pipeline
     * @param document Document to process
     * @param documentVersion Document version with content
     * @param options Processing options
     * @returns Promise resolving to comprehensive processing result
     * @throws PipelineError if any step fails
     */
    execute(
        document: Document, 
        documentVersion: DocumentVersion, 
        options: DocumentProcessingOptions
    ): Promise<DocumentProcessingResult>;

    /**
     * Gets the processing steps for a document type
     * @param documentType Type of document
     * @param options Processing options
     * @returns Array of processing step names in order
     */
    getProcessingSteps(documentType: string, options: DocumentProcessingOptions): string[];

    /**
     * Registers a custom processing step
     * @param stepName Name of the processing step
     * @param processor Function to execute the step
     * @param dependencies Array of step names this step depends on
     */
    registerStep(
        stepName: string, 
        processor: (document: Document, version: DocumentVersion, context: Record<string, any>) => Promise<any>,
        dependencies?: string[]
    ): void;

    /**
     * Removes a processing step
     * @param stepName Name of the step to remove
     */
    removeStep(stepName: string): void;

    /**
     * Validates the processing pipeline configuration
     * @returns True if pipeline is valid, false otherwise
     */
    validatePipeline(): boolean;

    /**
     * Gets pipeline execution statistics
     * @returns Pipeline performance statistics
     */
    getStatistics(): {
        totalExecutions: number;
        averageExecutionTime: number;
        successRate: number;
        stepStatistics: Record<string, {
            executions: number;
            averageTime: number;
            successRate: number;
        }>;
    };
}