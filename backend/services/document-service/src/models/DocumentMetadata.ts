import { IsOptional, IsArray, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DocumentMetadata domain model encapsulating document metadata and properties.
 * Provides extensible metadata management with validation.
 * 
 * Follows SOLID principles:
 * - Single Responsibility: Manages document metadata
 * - Open/Closed: Extensible for different metadata types
 * - Interface Segregation: Focused on metadata operations
 */
export class DocumentMetadata {
    @IsOptional()
    @IsArray()
    private _tags: string[] = [];

    @IsOptional()
    @IsArray()
    private _categories: string[] = [];

    @IsOptional()
    @IsObject()
    private _customProperties: Record<string, any> = {};

    @IsOptional()
    private _language?: string;

    @IsOptional()
    private _encoding?: string;

    @IsOptional()
    @IsObject()
    private _extractionMetadata?: {
        ocrConfidence?: number;
        extractedText?: string;
        textBlocks?: Array<{
            text: string;
            confidence: number;
            bounds: { x: number; y: number; width: number; height: number };
        }>;
        processingTime?: number;
        ocrEngine?: string;
        ocrVersion?: string;
    };

    @IsOptional()
    @IsObject()
    private _securityMetadata?: {
        classification?: string;
        accessLevel?: string;
        retentionPeriod?: string;
        encryptionStatus?: boolean;
    };

    @IsOptional()
    @IsObject()
    private _workflowMetadata?: {
        assignedTo?: string;
        priority?: string;
        dueDate?: Date;
        status?: string;
        comments?: string[];
    };

    constructor() {
        this._tags = [];
        this._categories = [];
        this._customProperties = {};
    }

    // Getters following encapsulation principle
    public get tags(): ReadonlyArray<string> {
        return [...this._tags]; // Defensive copy
    }

    public get categories(): ReadonlyArray<string> {
        return [...this._categories]; // Defensive copy
    }

    public get customProperties(): Record<string, any> {
        return { ...this._customProperties }; // Defensive copy
    }

    public get language(): string | undefined {
        return this._language;
    }

    public get encoding(): string | undefined {
        return this._encoding;
    }

    public get extractionMetadata(): Record<string, any> | undefined {
        return this._extractionMetadata ? { ...this._extractionMetadata } : undefined;
    }

    public get securityMetadata(): Record<string, any> | undefined {
        return this._securityMetadata ? { ...this._securityMetadata } : undefined;
    }

    public get workflowMetadata(): Record<string, any> | undefined {
        return this._workflowMetadata ? { ...this._workflowMetadata } : undefined;
    }

    // Business logic methods

    /**
     * Adds a tag to the document
     * @param tag Tag to add
     */
    public addTag(tag: string): void {
        const normalizedTag = this.normalizeTag(tag);
        if (!this._tags.includes(normalizedTag)) {
            this._tags.push(normalizedTag);
        }
    }

    /**
     * Removes a tag from the document
     * @param tag Tag to remove
     */
    public removeTag(tag: string): void {
        const normalizedTag = this.normalizeTag(tag);
        const index = this._tags.indexOf(normalizedTag);
        if (index !== -1) {
            this._tags.splice(index, 1);
        }
    }

    /**
     * Checks if document has a specific tag
     * @param tag Tag to check
     * @returns True if tag exists
     */
    public hasTag(tag: string): boolean {
        const normalizedTag = this.normalizeTag(tag);
        return this._tags.includes(normalizedTag);
    }

    /**
     * Sets all tags, replacing existing ones
     * @param tags Array of tags
     */
    public setTags(tags: string[]): void {
        this._tags = tags.map(tag => this.normalizeTag(tag))
            .filter((tag, index, arr) => arr.indexOf(tag) === index); // Remove duplicates
    }

    /**
     * Adds a category to the document
     * @param category Category to add
     */
    public addCategory(category: string): void {
        const normalizedCategory = this.normalizeCategory(category);
        if (!this._categories.includes(normalizedCategory)) {
            this._categories.push(normalizedCategory);
        }
    }

    /**
     * Removes a category from the document
     * @param category Category to remove
     */
    public removeCategory(category: string): void {
        const normalizedCategory = this.normalizeCategory(category);
        const index = this._categories.indexOf(normalizedCategory);
        if (index !== -1) {
            this._categories.splice(index, 1);
        }
    }

    /**
     * Checks if document has a specific category
     * @param category Category to check
     * @returns True if category exists
     */
    public hasCategory(category: string): boolean {
        const normalizedCategory = this.normalizeCategory(category);
        return this._categories.includes(normalizedCategory);
    }

    /**
     * Sets all categories, replacing existing ones
     * @param categories Array of categories
     */
    public setCategories(categories: string[]): void {
        this._categories = categories.map(cat => this.normalizeCategory(cat))
            .filter((cat, index, arr) => arr.indexOf(cat) === index); // Remove duplicates
    }

    /**
     * Sets a custom property
     * @param key Property key
     * @param value Property value
     */
    public setCustomProperty(key: string, value: any): void {
        const normalizedKey = this.normalizePropertyKey(key);
        this._customProperties[normalizedKey] = value;
    }

    /**
     * Gets a custom property value
     * @param key Property key
     * @returns Property value or undefined
     */
    public getCustomProperty(key: string): any {
        const normalizedKey = this.normalizePropertyKey(key);
        return this._customProperties[normalizedKey];
    }

    /**
     * Removes a custom property
     * @param key Property key to remove
     */
    public removeCustomProperty(key: string): void {
        const normalizedKey = this.normalizePropertyKey(key);
        delete this._customProperties[normalizedKey];
    }

    /**
     * Checks if a custom property exists
     * @param key Property key
     * @returns True if property exists
     */
    public hasCustomProperty(key: string): boolean {
        const normalizedKey = this.normalizePropertyKey(key);
        return normalizedKey in this._customProperties;
    }

    /**
     * Sets the document language
     * @param language ISO 639-1 language code
     */
    public setLanguage(language: string): void {
        this._language = this.validateLanguageCode(language);
    }

    /**
     * Sets the document encoding
     * @param encoding Text encoding (e.g., 'UTF-8', 'ISO-8859-1')
     */
    public setEncoding(encoding: string): void {
        this._encoding = encoding.toUpperCase();
    }

    /**
     * Updates OCR extraction metadata
     * @param metadata OCR extraction results
     */
    public updateExtractionMetadata(metadata: {
        ocrConfidence?: number;
        extractedText?: string;
        textBlocks?: Array<{
            text: string;
            confidence: number;
            bounds: { x: number; y: number; width: number; height: number };
        }>;
        processingTime?: number;
        ocrEngine?: string;
        ocrVersion?: string;
    }): void {
        this._extractionMetadata = {
            ...this._extractionMetadata,
            ...metadata,
            lastUpdated: new Date()
        };
    }

    /**
     * Updates security metadata
     * @param metadata Security-related metadata
     */
    public updateSecurityMetadata(metadata: {
        classification?: string;
        accessLevel?: string;
        retentionPeriod?: string;
        encryptionStatus?: boolean;
    }): void {
        this._securityMetadata = {
            ...this._securityMetadata,
            ...metadata
        };
    }

    /**
     * Updates workflow metadata
     * @param metadata Workflow-related metadata
     */
    public updateWorkflowMetadata(metadata: {
        assignedTo?: string;
        priority?: string;
        dueDate?: Date;
        status?: string;
        comments?: string[];
    }): void {
        this._workflowMetadata = {
            ...this._workflowMetadata,
            ...metadata
        };
    }

    /**
     * Validates if metadata is complete and valid
     * @returns True if metadata is valid
     */
    public isValid(): boolean {
        try {
            // Check required validations
            if (this._language && !this.isValidLanguageCode(this._language)) {
                return false;
            }

            // Check extraction metadata
            if (this._extractionMetadata?.ocrConfidence !== undefined) {
                if (this._extractionMetadata.ocrConfidence < 0 || this._extractionMetadata.ocrConfidence > 1) {
                    return false;
                }
            }

            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Gets validation errors for current metadata state
     * @returns Array of validation error messages
     */
    public getValidationErrors(): string[] {
        const errors: string[] = [];

        if (this._language && !this.isValidLanguageCode(this._language)) {
            errors.push('Invalid language code format');
        }

        if (this._extractionMetadata?.ocrConfidence !== undefined) {
            if (this._extractionMetadata.ocrConfidence < 0 || this._extractionMetadata.ocrConfidence > 1) {
                errors.push('OCR confidence must be between 0 and 1');
            }
        }

        return errors;
    }

    /**
     * Merges metadata from another DocumentMetadata instance
     * @param other Other metadata to merge
     */
    public merge(other: DocumentMetadata): void {
        // Merge tags without duplicates
        const combinedTags = [...this._tags, ...other._tags];
        this._tags = [...new Set(combinedTags)];

        // Merge categories without duplicates
        const combinedCategories = [...this._categories, ...other._categories];
        this._categories = [...new Set(combinedCategories)];

        // Merge custom properties (other takes precedence)
        this._customProperties = { ...this._customProperties, ...other._customProperties };

        // Update other properties if they exist in other
        if (other._language) this._language = other._language;
        if (other._encoding) this._encoding = other._encoding;
        if (other._extractionMetadata) this._extractionMetadata = { ...this._extractionMetadata, ...other._extractionMetadata };
        if (other._securityMetadata) this._securityMetadata = { ...this._securityMetadata, ...other._securityMetadata };
        if (other._workflowMetadata) this._workflowMetadata = { ...this._workflowMetadata, ...other._workflowMetadata };
    }

    /**
     * Creates a serializable representation of the metadata
     * @returns Plain object representation
     */
    public toJSON(): Record<string, any> {
        return {
            tags: this._tags,
            categories: this._categories,
            customProperties: this._customProperties,
            language: this._language,
            encoding: this._encoding,
            extractionMetadata: this._extractionMetadata,
            securityMetadata: this._securityMetadata,
            workflowMetadata: this._workflowMetadata
        };
    }

    // Private helper methods

    private normalizeTag(tag: string): string {
        return tag.trim().toLowerCase().replace(/\s+/g, '-');
    }

    private normalizeCategory(category: string): string {
        return category.trim().toLowerCase();
    }

    private normalizePropertyKey(key: string): string {
        return key.trim().toLowerCase().replace(/\s+/g, '_');
    }

    private validateLanguageCode(language: string): string {
        const normalizedLang = language.toLowerCase().trim();
        if (!this.isValidLanguageCode(normalizedLang)) {
            throw new Error('Invalid language code format (expected ISO 639-1 or 639-3)');
        }
        return normalizedLang;
    }

    private isValidLanguageCode(language: string): boolean {
        // ISO 639-1 (2 letters) or ISO 639-3 (3 letters)
        const langRegex = /^[a-z]{2,3}$/;
        return langRegex.test(language.toLowerCase());
    }
}