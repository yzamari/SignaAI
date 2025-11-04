import { IsNotEmpty, IsUUID, IsOptional, IsEnum, IsDate, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { DocumentStatus, DocumentType } from '../types/DocumentTypes';
import { Field } from './Field';
import { DocumentVersion } from './DocumentVersion';
import { DocumentMetadata } from './DocumentMetadata';

/**
 * Document domain model following Domain Driven Design principles.
 * Encapsulates all document-related business logic and enforces invariants.
 * 
 * Follows SOLID principles:
 * - Single Responsibility: Manages document state and business rules
 * - Open/Closed: Extensible through composition and inheritance
 * - Liskov Substitution: Can be extended without breaking contracts
 * - Interface Segregation: Focused on document-specific operations
 * - Dependency Inversion: Depends on abstractions, not concretions
 */
export class Document {
    @IsUUID()
    private readonly _id: string;

    @IsNotEmpty()
    private _name: string;

    @IsEnum(DocumentType)
    private _type: DocumentType;

    @IsEnum(DocumentStatus)
    private _status: DocumentStatus;

    @IsOptional()
    private _description?: string;

    @ValidateNested({ each: true })
    @Type(() => Field)
    private _fields: Field[] = [];

    @ValidateNested({ each: true })
    @Type(() => DocumentVersion)
    private _versions: DocumentVersion[] = [];

    @ValidateNested()
    @Type(() => DocumentMetadata)
    private _metadata: DocumentMetadata;

    @IsDate()
    @Transform(({ value }) => new Date(value))
    private _createdAt: Date;

    @IsDate()
    @Transform(({ value }) => new Date(value))
    private _updatedAt: Date;

    @IsOptional()
    @IsUUID()
    private _templateId?: string;

    @IsOptional()
    @IsUUID()
    private _workflowId?: string;

    constructor(
        id: string,
        name: string,
        type: DocumentType,
        metadata: DocumentMetadata,
        templateId?: string,
        workflowId?: string
    ) {
        this._id = id;
        this._name = this.validateAndFormatName(name);
        this._type = type;
        this._status = DocumentStatus.DRAFT;
        this._metadata = metadata;
        this._templateId = templateId;
        this._workflowId = workflowId;
        this._createdAt = new Date();
        this._updatedAt = new Date();
    }

    // Getters following encapsulation principle
    public get id(): string {
        return this._id;
    }

    public get name(): string {
        return this._name;
    }

    public get type(): DocumentType {
        return this._type;
    }

    public get status(): DocumentStatus {
        return this._status;
    }

    public get description(): string | undefined {
        return this._description;
    }

    public get fields(): ReadonlyArray<Field> {
        return [...this._fields]; // Return defensive copy
    }

    public get versions(): ReadonlyArray<DocumentVersion> {
        return [...this._versions]; // Return defensive copy
    }

    public get metadata(): DocumentMetadata {
        return this._metadata;
    }

    public get createdAt(): Date {
        return new Date(this._createdAt); // Return defensive copy
    }

    public get updatedAt(): Date {
        return new Date(this._updatedAt); // Return defensive copy
    }

    public get templateId(): string | undefined {
        return this._templateId;
    }

    public get workflowId(): string | undefined {
        return this._workflowId;
    }

    // Business logic methods following Single Responsibility Principle

    /**
     * Updates document name with validation
     * @param name New name for the document
     * @throws Error if name is invalid
     */
    public updateName(name: string): void {
        const validatedName = this.validateAndFormatName(name);
        this._name = validatedName;
        this.touch();
    }

    /**
     * Updates document description
     * @param description New description for the document
     */
    public updateDescription(description: string): void {
        this._description = description.trim();
        this.touch();
    }

    /**
     * Transitions document to a new status with business rule validation
     * @param newStatus Target status
     * @throws Error if transition is not allowed
     */
    public transitionTo(newStatus: DocumentStatus): void {
        if (!this.isValidStatusTransition(this._status, newStatus)) {
            throw new Error(`Invalid status transition from ${this._status} to ${newStatus}`);
        }
        this._status = newStatus;
        this.touch();
    }

    /**
     * Adds a new field to the document
     * @param field Field to add
     * @throws Error if field already exists or is invalid
     */
    public addField(field: Field): void {
        if (this.hasField(field.id)) {
            throw new Error(`Field with id ${field.id} already exists`);
        }
        
        this._fields.push(field);
        this.touch();
    }

    /**
     * Updates an existing field
     * @param fieldId ID of field to update
     * @param updatedField Updated field data
     * @throws Error if field doesn't exist
     */
    public updateField(fieldId: string, updatedField: Field): void {
        const index = this._fields.findIndex(f => f.id === fieldId);
        if (index === -1) {
            throw new Error(`Field with id ${fieldId} not found`);
        }
        
        this._fields[index] = updatedField;
        this.touch();
    }

    /**
     * Removes a field from the document
     * @param fieldId ID of field to remove
     * @throws Error if field doesn't exist
     */
    public removeField(fieldId: string): void {
        const index = this._fields.findIndex(f => f.id === fieldId);
        if (index === -1) {
            throw new Error(`Field with id ${fieldId} not found`);
        }
        
        this._fields.splice(index, 1);
        this.touch();
    }

    /**
     * Adds a new version to the document
     * @param version Version to add
     */
    public addVersion(version: DocumentVersion): void {
        this._versions.push(version);
        this.touch();
    }

    /**
     * Gets the latest version of the document
     * @returns Latest document version or undefined if no versions exist
     */
    public getLatestVersion(): DocumentVersion | undefined {
        if (this._versions.length === 0) {
            return undefined;
        }
        
        return this._versions.reduce((latest, current) => 
            current.versionNumber > latest.versionNumber ? current : latest
        );
    }

    /**
     * Gets a specific version by version number
     * @param versionNumber Version number to retrieve
     * @returns Document version or undefined if not found
     */
    public getVersion(versionNumber: number): DocumentVersion | undefined {
        return this._versions.find(v => v.versionNumber === versionNumber);
    }

    /**
     * Checks if document is ready for processing
     * @returns True if document can be processed
     */
    public isReadyForProcessing(): boolean {
        return this._status === DocumentStatus.UPLOADED && 
               this._versions.length > 0 &&
               this._metadata.isValid();
    }

    /**
     * Checks if document can be signed
     * @returns True if document can be signed
     */
    public canBeSigned(): boolean {
        return this._status === DocumentStatus.PROCESSED &&
               this._fields.length > 0 &&
               this._fields.every(field => field.isValid());
    }

    /**
     * Updates document metadata
     * @param metadata New metadata
     */
    public updateMetadata(metadata: DocumentMetadata): void {
        this._metadata = metadata;
        this.touch();
    }

    /**
     * Creates a serializable representation of the document
     * @returns Plain object representation
     */
    public toJSON(): Record<string, any> {
        return {
            id: this._id,
            name: this._name,
            type: this._type,
            status: this._status,
            description: this._description,
            fields: this._fields.map(f => f.toJSON()),
            versions: this._versions.map(v => v.toJSON()),
            metadata: this._metadata.toJSON(),
            createdAt: this._createdAt.toISOString(),
            updatedAt: this._updatedAt.toISOString(),
            templateId: this._templateId,
            workflowId: this._workflowId
        };
    }

    // Private helper methods

    private validateAndFormatName(name: string): string {
        if (!name || name.trim().length === 0) {
            throw new Error('Document name cannot be empty');
        }
        
        const trimmedName = name.trim();
        if (trimmedName.length > 255) {
            throw new Error('Document name cannot exceed 255 characters');
        }
        
        return trimmedName;
    }

    private hasField(fieldId: string): boolean {
        return this._fields.some(f => f.id === fieldId);
    }

    private isValidStatusTransition(from: DocumentStatus, to: DocumentStatus): boolean {
        const validTransitions: Record<DocumentStatus, DocumentStatus[]> = {
            [DocumentStatus.DRAFT]: [DocumentStatus.UPLOADED, DocumentStatus.CANCELLED],
            [DocumentStatus.UPLOADED]: [DocumentStatus.PROCESSING, DocumentStatus.CANCELLED],
            [DocumentStatus.PROCESSING]: [DocumentStatus.PROCESSED, DocumentStatus.FAILED, DocumentStatus.CANCELLED],
            [DocumentStatus.PROCESSED]: [DocumentStatus.READY_FOR_SIGNATURE, DocumentStatus.ARCHIVED],
            [DocumentStatus.READY_FOR_SIGNATURE]: [DocumentStatus.SIGNED, DocumentStatus.CANCELLED],
            [DocumentStatus.SIGNED]: [DocumentStatus.ARCHIVED],
            [DocumentStatus.FAILED]: [DocumentStatus.PROCESSING, DocumentStatus.CANCELLED],
            [DocumentStatus.CANCELLED]: [],
            [DocumentStatus.ARCHIVED]: []
        };

        return validTransitions[from]?.includes(to) ?? false;
    }

    private touch(): void {
        this._updatedAt = new Date();
    }
}