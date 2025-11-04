/**
 * Storage Service Interfaces
 * Defines contracts for file storage operations using Strategy pattern.
 * 
 * Follows Interface Segregation Principle:
 * - Different interfaces for different storage concerns
 * - Clients depend only on the storage capabilities they need
 */

/**
 * File upload information
 */
export interface FileUploadInfo {
    originalName: string;
    mimeType: string;
    size: number;
    buffer: Buffer;
    hash?: string;
}

/**
 * File storage result
 */
export interface FileStorageResult {
    filePath: string;
    fileName: string;
    size: number;
    hash: string;
    url?: string;
    metadata?: Record<string, any>;
}

/**
 * File retrieval options
 */
export interface FileRetrievalOptions {
    includeMetadata?: boolean;
    generateSignedUrl?: boolean;
    urlExpirationTime?: number;
}

/**
 * File list options
 */
export interface FileListOptions {
    prefix?: string;
    maxResults?: number;
    continuationToken?: string;
    includeMetadata?: boolean;
}

/**
 * File information
 */
export interface FileInfo {
    path: string;
    name: string;
    size: number;
    lastModified: Date;
    contentType: string;
    hash?: string;
    url?: string;
    metadata?: Record<string, any>;
}

/**
 * Storage statistics
 */
export interface StorageStatistics {
    totalFiles: number;
    totalSize: number;
    availableSpace?: number;
    usedSpace?: number;
}

/**
 * Core Storage Service Interface
 * Defines basic file storage operations.
 */
export interface IStorageService {
    /**
     * Stores a file in the storage system
     * @param file File information and data
     * @param path Optional custom path for the file
     * @returns Promise resolving to storage result
     * @throws StorageError if storage fails
     */
    store(file: FileUploadInfo, path?: string): Promise<FileStorageResult>;

    /**
     * Retrieves a file from storage
     * @param filePath Path to the file
     * @param options Retrieval options
     * @returns Promise resolving to file buffer
     * @throws StorageError if retrieval fails
     */
    retrieve(filePath: string, options?: FileRetrievalOptions): Promise<Buffer>;

    /**
     * Gets information about a file without downloading it
     * @param filePath Path to the file
     * @returns Promise resolving to file information
     * @throws StorageError if file doesn't exist or access fails
     */
    getInfo(filePath: string): Promise<FileInfo>;

    /**
     * Checks if a file exists in storage
     * @param filePath Path to the file
     * @returns Promise resolving to true if exists, false otherwise
     * @throws StorageError if check fails
     */
    exists(filePath: string): Promise<boolean>;

    /**
     * Deletes a file from storage
     * @param filePath Path to the file
     * @returns Promise resolving to true if deleted, false if not found
     * @throws StorageError if deletion fails
     */
    delete(filePath: string): Promise<boolean>;

    /**
     * Copies a file to a new location
     * @param sourcePath Source file path
     * @param destinationPath Destination file path
     * @returns Promise resolving to new file information
     * @throws StorageError if copy fails
     */
    copy(sourcePath: string, destinationPath: string): Promise<FileInfo>;

    /**
     * Moves a file to a new location
     * @param sourcePath Source file path
     * @param destinationPath Destination file path
     * @returns Promise resolving to new file information
     * @throws StorageError if move fails
     */
    move(sourcePath: string, destinationPath: string): Promise<FileInfo>;

    /**
     * Lists files in a directory or with a prefix
     * @param options List options
     * @returns Promise resolving to array of file information
     * @throws StorageError if listing fails
     */
    list(options?: FileListOptions): Promise<FileInfo[]>;

    /**
     * Generates a signed URL for file access
     * @param filePath Path to the file
     * @param expirationTime URL expiration time in seconds
     * @param permissions Access permissions for the URL
     * @returns Promise resolving to signed URL
     * @throws StorageError if URL generation fails
     */
    generateSignedUrl(filePath: string, expirationTime: number, permissions?: string[]): Promise<string>;
}

/**
 * Advanced Storage Service Interface
 * Extends basic storage with advanced features.
 * 
 * Separated to follow ISP - basic storage clients don't need advanced features.
 */
export interface IAdvancedStorageService extends IStorageService {
    /**
     * Creates a directory in storage
     * @param directoryPath Path for the new directory
     * @returns Promise resolving to true if created
     * @throws StorageError if creation fails
     */
    createDirectory(directoryPath: string): Promise<boolean>;

    /**
     * Deletes a directory and all its contents
     * @param directoryPath Path to the directory
     * @returns Promise resolving to true if deleted
     * @throws StorageError if deletion fails
     */
    deleteDirectory(directoryPath: string): Promise<boolean>;

    /**
     * Gets storage usage statistics
     * @param path Optional path to get statistics for
     * @returns Promise resolving to storage statistics
     * @throws StorageError if statistics retrieval fails
     */
    getStatistics(path?: string): Promise<StorageStatistics>;

    /**
     * Sets metadata for a file
     * @param filePath Path to the file
     * @param metadata Metadata to set
     * @returns Promise resolving to updated file information
     * @throws StorageError if metadata update fails
     */
    setMetadata(filePath: string, metadata: Record<string, any>): Promise<FileInfo>;

    /**
     * Gets metadata for a file
     * @param filePath Path to the file
     * @returns Promise resolving to file metadata
     * @throws StorageError if metadata retrieval fails
     */
    getMetadata(filePath: string): Promise<Record<string, any>>;

    /**
     * Performs bulk operations on multiple files
     * @param operations Array of operations to perform
     * @returns Promise resolving to array of results
     * @throws StorageError if any operation fails
     */
    bulkOperation(operations: StorageOperation[]): Promise<StorageOperationResult[]>;
}

/**
 * Storage operation for bulk operations
 */
export interface StorageOperation {
    type: 'copy' | 'move' | 'delete' | 'setMetadata';
    sourcePath: string;
    destinationPath?: string;
    metadata?: Record<string, any>;
}

/**
 * Result of a storage operation
 */
export interface StorageOperationResult {
    operation: StorageOperation;
    success: boolean;
    error?: string;
    result?: any;
}

/**
 * Versioned Storage Service Interface
 * Provides versioning capabilities for files.
 * 
 * Separated interface for versioning functionality.
 */
export interface IVersionedStorageService {
    /**
     * Stores a new version of a file
     * @param file File information and data
     * @param basePath Base path for versioned files
     * @param versionNumber Version number
     * @returns Promise resolving to storage result
     * @throws StorageError if storage fails
     */
    storeVersion(file: FileUploadInfo, basePath: string, versionNumber: number): Promise<FileStorageResult>;

    /**
     * Retrieves a specific version of a file
     * @param basePath Base path for versioned files
     * @param versionNumber Version number
     * @returns Promise resolving to file buffer
     * @throws StorageError if version doesn't exist or retrieval fails
     */
    retrieveVersion(basePath: string, versionNumber: number): Promise<Buffer>;

    /**
     * Lists all versions of a file
     * @param basePath Base path for versioned files
     * @returns Promise resolving to array of version information
     * @throws StorageError if listing fails
     */
    listVersions(basePath: string): Promise<Array<{
        versionNumber: number;
        path: string;
        size: number;
        lastModified: Date;
        hash: string;
    }>>;

    /**
     * Deletes a specific version of a file
     * @param basePath Base path for versioned files
     * @param versionNumber Version number
     * @returns Promise resolving to true if deleted
     * @throws StorageError if deletion fails
     */
    deleteVersion(basePath: string, versionNumber: number): Promise<boolean>;

    /**
     * Deletes all versions of a file
     * @param basePath Base path for versioned files
     * @returns Promise resolving to number of versions deleted
     * @throws StorageError if deletion fails
     */
    deleteAllVersions(basePath: string): Promise<number>;

    /**
     * Gets the latest version number for a file
     * @param basePath Base path for versioned files
     * @returns Promise resolving to latest version number or 0 if no versions
     * @throws StorageError if check fails
     */
    getLatestVersionNumber(basePath: string): Promise<number>;
}

/**
 * Secure Storage Service Interface
 * Provides encryption and security features.
 * 
 * Separated interface for security functionality.
 */
export interface ISecureStorageService {
    /**
     * Stores an encrypted file
     * @param file File information and data
     * @param encryptionKey Encryption key or key ID
     * @param path Optional custom path for the file
     * @returns Promise resolving to storage result
     * @throws StorageError if storage or encryption fails
     */
    storeEncrypted(file: FileUploadInfo, encryptionKey: string, path?: string): Promise<FileStorageResult>;

    /**
     * Retrieves and decrypts a file
     * @param filePath Path to the encrypted file
     * @param encryptionKey Encryption key or key ID
     * @returns Promise resolving to decrypted file buffer
     * @throws StorageError if retrieval or decryption fails
     */
    retrieveDecrypted(filePath: string, encryptionKey: string): Promise<Buffer>;

    /**
     * Re-encrypts a file with a new key
     * @param filePath Path to the file
     * @param oldKey Current encryption key
     * @param newKey New encryption key
     * @returns Promise resolving to true if re-encryption succeeded
     * @throws StorageError if re-encryption fails
     */
    reEncrypt(filePath: string, oldKey: string, newKey: string): Promise<boolean>;

    /**
     * Verifies file integrity and authenticity
     * @param filePath Path to the file
     * @param expectedHash Expected file hash
     * @returns Promise resolving to true if file is authentic and intact
     * @throws StorageError if verification fails
     */
    verifyIntegrity(filePath: string, expectedHash: string): Promise<boolean>;
}

/**
 * Storage Service Factory Interface
 * Creates storage service instances based on configuration.
 * 
 * Implements Factory pattern for storage service creation.
 */
export interface IStorageServiceFactory {
    /**
     * Creates a storage service instance
     * @param type Storage type ('local', 'aws-s3', 'google-cloud', 'azure-blob')
     * @param config Configuration for the storage service
     * @returns Storage service instance
     * @throws FactoryError if creation fails
     */
    create(type: string, config: Record<string, any>): IStorageService;

    /**
     * Creates an advanced storage service instance
     * @param type Storage type
     * @param config Configuration for the storage service
     * @returns Advanced storage service instance
     * @throws FactoryError if creation fails
     */
    createAdvanced(type: string, config: Record<string, any>): IAdvancedStorageService;

    /**
     * Creates a versioned storage service instance
     * @param type Storage type
     * @param config Configuration for the storage service
     * @returns Versioned storage service instance
     * @throws FactoryError if creation fails
     */
    createVersioned(type: string, config: Record<string, any>): IVersionedStorageService;

    /**
     * Creates a secure storage service instance
     * @param type Storage type
     * @param config Configuration for the storage service
     * @returns Secure storage service instance
     * @throws FactoryError if creation fails
     */
    createSecure(type: string, config: Record<string, any>): ISecureStorageService;

    /**
     * Gets available storage types
     * @returns Array of supported storage types
     */
    getSupportedTypes(): string[];

    /**
     * Validates storage configuration
     * @param type Storage type
     * @param config Configuration to validate
     * @returns True if configuration is valid
     * @throws ValidationError if configuration is invalid
     */
    validateConfig(type: string, config: Record<string, any>): boolean;
}