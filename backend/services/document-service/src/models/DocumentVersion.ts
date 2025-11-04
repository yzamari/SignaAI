import { IsNotEmpty, IsUUID, IsOptional, IsNumber, IsDate, IsUrl } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * DocumentVersion domain model representing a specific version of a document file.
 * Implements versioning strategy with immutable version records.
 * 
 * Follows SOLID principles:
 * - Single Responsibility: Manages document version information
 * - Open/Closed: Extensible for different file types and storage strategies
 * - Interface Segregation: Focused on version-specific operations
 * - Dependency Inversion: Uses abstractions for file storage
 */
export class DocumentVersion {
    @IsUUID()
    private readonly _id: string;

    @IsUUID()
    private readonly _documentId: string;

    @IsNumber()
    private readonly _versionNumber: number;

    @IsNotEmpty()
    private readonly _fileName: string;

    @IsNotEmpty()
    private readonly _originalFileName: string;

    @IsNotEmpty()
    private readonly _mimeType: string;

    @IsNumber()
    private readonly _fileSize: number;

    @IsNotEmpty()
    private readonly _fileHash: string;

    @IsUrl()
    private readonly _filePath: string;

    @IsOptional()
    @IsUrl()
    private readonly _thumbnailPath?: string;

    @IsOptional()
    private readonly _changeDescription?: string;

    @IsDate()
    @Transform(({ value }) => new Date(value))
    private readonly _createdAt: Date;

    @IsOptional()
    @IsUUID()
    private readonly _createdBy?: string;

    @IsOptional()
    private readonly _metadata?: Record<string, any>;

    // PDF-specific properties
    @IsOptional()
    @IsNumber()
    private readonly _pageCount?: number;

    @IsOptional()
    private readonly _pdfMetadata?: {
        title?: string;
        author?: string;
        subject?: string;
        keywords?: string[];
        creator?: string;
        producer?: string;
        creationDate?: Date;
        modificationDate?: Date;
    };

    constructor(
        id: string,
        documentId: string,
        versionNumber: number,
        fileName: string,
        originalFileName: string,
        mimeType: string,
        fileSize: number,
        fileHash: string,
        filePath: string,
        createdBy?: string,
        changeDescription?: string
    ) {
        this._id = id;
        this._documentId = documentId;
        this._versionNumber = this.validateVersionNumber(versionNumber);
        this._fileName = this.validateFileName(fileName);
        this._originalFileName = this.validateFileName(originalFileName);
        this._mimeType = this.validateMimeType(mimeType);
        this._fileSize = this.validateFileSize(fileSize);
        this._fileHash = this.validateFileHash(fileHash);
        this._filePath = filePath;
        this._createdBy = createdBy;
        this._changeDescription = changeDescription?.trim();
        this._createdAt = new Date();
        this._metadata = {};
    }

    // Getters following encapsulation principle
    public get id(): string {
        return this._id;
    }

    public get documentId(): string {
        return this._documentId;
    }

    public get versionNumber(): number {
        return this._versionNumber;
    }

    public get fileName(): string {
        return this._fileName;
    }

    public get originalFileName(): string {
        return this._originalFileName;
    }

    public get mimeType(): string {
        return this._mimeType;
    }

    public get fileSize(): number {
        return this._fileSize;
    }

    public get fileHash(): string {
        return this._fileHash;
    }

    public get filePath(): string {
        return this._filePath;
    }

    public get thumbnailPath(): string | undefined {
        return this._thumbnailPath;
    }

    public get changeDescription(): string | undefined {
        return this._changeDescription;
    }

    public get createdAt(): Date {
        return new Date(this._createdAt); // Defensive copy
    }

    public get createdBy(): string | undefined {
        return this._createdBy;
    }

    public get metadata(): Record<string, any> | undefined {
        return this._metadata ? { ...this._metadata } : undefined; // Defensive copy
    }

    public get pageCount(): number | undefined {
        return this._pageCount;
    }

    public get pdfMetadata(): Record<string, any> | undefined {
        return this._pdfMetadata ? { ...this._pdfMetadata } : undefined; // Defensive copy
    }

    // Business logic methods

    /**
     * Checks if this version is a PDF document
     * @returns True if the document is a PDF
     */
    public isPDF(): boolean {
        return this._mimeType === 'application/pdf';
    }

    /**
     * Checks if this version is an image
     * @returns True if the document is an image
     */
    public isImage(): boolean {
        return this._mimeType.startsWith('image/');
    }

    /**
     * Gets the file extension from the filename
     * @returns File extension including the dot
     */
    public getFileExtension(): string {
        const lastDotIndex = this._fileName.lastIndexOf('.');
        return lastDotIndex !== -1 ? this._fileName.substring(lastDotIndex) : '';
    }

    /**
     * Formats the file size in human-readable format
     * @returns Formatted file size string
     */
    public getFormattedFileSize(): string {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = this._fileSize;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(2)} ${units[unitIndex]}`;
    }

    /**
     * Checks if this version matches another version by hash
     * @param other Other document version to compare
     * @returns True if versions have the same content
     */
    public hasSameContentAs(other: DocumentVersion): boolean {
        return this._fileHash === other._fileHash;
    }

    /**
     * Checks if this version is newer than another version
     * @param other Other document version to compare
     * @returns True if this version is newer
     */
    public isNewerThan(other: DocumentVersion): boolean {
        return this._versionNumber > other._versionNumber;
    }

    /**
     * Creates a thumbnail path based on the file path
     * @param thumbnailPath Path to the thumbnail file
     * @returns New DocumentVersion instance with thumbnail
     */
    public withThumbnail(thumbnailPath: string): DocumentVersion {
        const newVersion = this.clone();
        (newVersion as any)._thumbnailPath = thumbnailPath;
        return newVersion;
    }

    /**
     * Creates a version with PDF metadata
     * @param pageCount Number of pages in PDF
     * @param pdfMetadata PDF metadata object
     * @returns New DocumentVersion instance with PDF metadata
     */
    public withPDFMetadata(pageCount: number, pdfMetadata: Record<string, any>): DocumentVersion {
        const newVersion = this.clone();
        (newVersion as any)._pageCount = pageCount;
        (newVersion as any)._pdfMetadata = { ...pdfMetadata };
        return newVersion;
    }

    /**
     * Creates a version with additional metadata
     * @param metadata Metadata to add
     * @returns New DocumentVersion instance with metadata
     */
    public withMetadata(metadata: Record<string, any>): DocumentVersion {
        const newVersion = this.clone();
        (newVersion as any)._metadata = { ...this._metadata, ...metadata };
        return newVersion;
    }

    /**
     * Validates file integrity by comparing hash
     * @param actualHash Hash calculated from current file
     * @returns True if file integrity is maintained
     */
    public validateIntegrity(actualHash: string): boolean {
        return this._fileHash === actualHash;
    }

    /**
     * Creates a serializable representation of the document version
     * @returns Plain object representation
     */
    public toJSON(): Record<string, any> {
        return {
            id: this._id,
            documentId: this._documentId,
            versionNumber: this._versionNumber,
            fileName: this._fileName,
            originalFileName: this._originalFileName,
            mimeType: this._mimeType,
            fileSize: this._fileSize,
            fileHash: this._fileHash,
            filePath: this._filePath,
            thumbnailPath: this._thumbnailPath,
            changeDescription: this._changeDescription,
            createdAt: this._createdAt.toISOString(),
            createdBy: this._createdBy,
            metadata: this._metadata,
            pageCount: this._pageCount,
            pdfMetadata: this._pdfMetadata
        };
    }

    /**
     * Creates a summary object for API responses
     * @returns Simplified version information
     */
    public toSummary(): Record<string, any> {
        return {
            id: this._id,
            versionNumber: this._versionNumber,
            fileName: this._fileName,
            mimeType: this._mimeType,
            fileSize: this._fileSize,
            formattedFileSize: this.getFormattedFileSize(),
            createdAt: this._createdAt.toISOString(),
            pageCount: this._pageCount,
            changeDescription: this._changeDescription
        };
    }

    // Private helper methods

    private clone(): DocumentVersion {
        const cloned = Object.create(Object.getPrototypeOf(this));
        Object.keys(this).forEach(key => {
            if (typeof (this as any)[key] === 'object' && (this as any)[key] !== null) {
                (cloned as any)[key] = Array.isArray((this as any)[key]) 
                    ? [...(this as any)[key]] 
                    : { ...(this as any)[key] };
            } else {
                (cloned as any)[key] = (this as any)[key];
            }
        });
        return cloned;
    }

    private validateVersionNumber(versionNumber: number): number {
        if (!Number.isInteger(versionNumber) || versionNumber < 1) {
            throw new Error('Version number must be a positive integer');
        }
        return versionNumber;
    }

    private validateFileName(fileName: string): string {
        if (!fileName || fileName.trim().length === 0) {
            throw new Error('File name cannot be empty');
        }
        
        const trimmedName = fileName.trim();
        if (trimmedName.length > 255) {
            throw new Error('File name cannot exceed 255 characters');
        }
        
        // Check for invalid characters
        const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
        if (invalidChars.test(trimmedName)) {
            throw new Error('File name contains invalid characters');
        }
        
        return trimmedName;
    }

    private validateMimeType(mimeType: string): string {
        if (!mimeType || mimeType.trim().length === 0) {
            throw new Error('MIME type cannot be empty');
        }
        
        // Basic MIME type validation
        const mimeRegex = /^[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_]*$/;
        if (!mimeRegex.test(mimeType.trim())) {
            throw new Error('Invalid MIME type format');
        }
        
        return mimeType.trim().toLowerCase();
    }

    private validateFileSize(fileSize: number): number {
        if (!Number.isInteger(fileSize) || fileSize < 0) {
            throw new Error('File size must be a non-negative integer');
        }
        
        // 100MB limit
        const maxFileSize = 100 * 1024 * 1024;
        if (fileSize > maxFileSize) {
            throw new Error('File size exceeds maximum limit of 100MB');
        }
        
        return fileSize;
    }

    private validateFileHash(fileHash: string): string {
        if (!fileHash || fileHash.trim().length === 0) {
            throw new Error('File hash cannot be empty');
        }
        
        // Assuming SHA-256 hash (64 hex characters)
        const hashRegex = /^[a-fA-F0-9]{64}$/;
        if (!hashRegex.test(fileHash.trim())) {
            throw new Error('Invalid file hash format (expected SHA-256)');
        }
        
        return fileHash.trim().toLowerCase();
    }
}