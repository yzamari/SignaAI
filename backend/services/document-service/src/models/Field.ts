import { IsNotEmpty, IsUUID, IsOptional, IsEnum, IsBoolean, IsNumber, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { FieldType, FieldValidationRule } from '../types/FieldTypes';
import { Rectangle } from '../types/GeometryTypes';

/**
 * Field domain model representing a form field within a document.
 * Encapsulates field-specific business logic and validation rules.
 * 
 * Follows SOLID principles:
 * - Single Responsibility: Manages field state and validation
 * - Open/Closed: Extensible through field type strategies
 * - Interface Segregation: Focused field operations
 * - Dependency Inversion: Uses abstractions for validation
 */
export class Field {
    @IsUUID()
    private readonly _id: string;

    @IsNotEmpty()
    private _name: string;

    @IsEnum(FieldType)
    private _type: FieldType;

    @IsOptional()
    private _value?: any;

    @IsOptional()
    private _placeholder?: string;

    @IsOptional()
    private _description?: string;

    @IsBoolean()
    private _required: boolean;

    @IsBoolean()
    private _readonly: boolean;

    @IsOptional()
    @ValidateNested()
    @Type(() => Rectangle)
    private _bounds?: Rectangle;

    @IsOptional()
    @IsNumber()
    private _page?: number;

    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => FieldValidationRule)
    private _validationRules: FieldValidationRule[] = [];

    @IsOptional()
    private _defaultValue?: any;

    @IsOptional()
    private _options?: string[];

    @IsNumber()
    private _order: number;

    @IsOptional()
    private _metadata?: Record<string, any>;

    constructor(
        id: string,
        name: string,
        type: FieldType,
        required: boolean = false,
        readonly: boolean = false,
        order: number = 0
    ) {
        this._id = id;
        this._name = this.validateAndFormatName(name);
        this._type = type;
        this._required = required;
        this._readonly = readonly;
        this._order = order;
        this._validationRules = [];
        this._metadata = {};
    }

    // Getters following encapsulation principle
    public get id(): string {
        return this._id;
    }

    public get name(): string {
        return this._name;
    }

    public get type(): FieldType {
        return this._type;
    }

    public get value(): any {
        return this._value;
    }

    public get placeholder(): string | undefined {
        return this._placeholder;
    }

    public get description(): string | undefined {
        return this._description;
    }

    public get required(): boolean {
        return this._required;
    }

    public get readonly(): boolean {
        return this._readonly;
    }

    public get bounds(): Rectangle | undefined {
        return this._bounds ? { ...this._bounds } : undefined; // Defensive copy
    }

    public get page(): number | undefined {
        return this._page;
    }

    public get validationRules(): ReadonlyArray<FieldValidationRule> {
        return [...this._validationRules]; // Defensive copy
    }

    public get defaultValue(): any {
        return this._defaultValue;
    }

    public get options(): ReadonlyArray<string> | undefined {
        return this._options ? [...this._options] : undefined; // Defensive copy
    }

    public get order(): number {
        return this._order;
    }

    public get metadata(): Record<string, any> | undefined {
        return this._metadata ? { ...this._metadata } : undefined; // Defensive copy
    }

    // Business logic methods

    /**
     * Updates the field name with validation
     * @param name New field name
     * @throws Error if name is invalid
     */
    public updateName(name: string): void {
        this._name = this.validateAndFormatName(name);
    }

    /**
     * Sets the field value with validation
     * @param value New field value
     * @throws Error if value is invalid according to field rules
     */
    public setValue(value: any): void {
        if (this._readonly) {
            throw new Error(`Cannot set value on readonly field: ${this._name}`);
        }

        const validationResult = this.validateValue(value);
        if (!validationResult.isValid) {
            throw new Error(`Invalid value for field ${this._name}: ${validationResult.errors.join(', ')}`);
        }

        this._value = this.coerceValue(value);
    }

    /**
     * Sets the field placeholder
     * @param placeholder Placeholder text
     */
    public setPlaceholder(placeholder: string): void {
        this._placeholder = placeholder.trim();
    }

    /**
     * Sets the field description
     * @param description Field description
     */
    public setDescription(description: string): void {
        this._description = description.trim();
    }

    /**
     * Sets the field bounds for PDF positioning
     * @param bounds Rectangle defining field position
     */
    public setBounds(bounds: Rectangle): void {
        this.validateBounds(bounds);
        this._bounds = { ...bounds };
    }

    /**
     * Sets the page number where this field appears
     * @param page Page number (1-based)
     */
    public setPage(page: number): void {
        if (page < 1) {
            throw new Error('Page number must be greater than 0');
        }
        this._page = page;
    }

    /**
     * Adds a validation rule to the field
     * @param rule Validation rule to add
     */
    public addValidationRule(rule: FieldValidationRule): void {
        if (this._validationRules.some(r => r.type === rule.type)) {
            throw new Error(`Validation rule of type ${rule.type} already exists`);
        }
        this._validationRules.push(rule);
    }

    /**
     * Removes a validation rule by type
     * @param ruleType Type of rule to remove
     */
    public removeValidationRule(ruleType: string): void {
        const index = this._validationRules.findIndex(r => r.type === ruleType);
        if (index !== -1) {
            this._validationRules.splice(index, 1);
        }
    }

    /**
     * Sets the default value for the field
     * @param defaultValue Default value
     */
    public setDefaultValue(defaultValue: any): void {
        const validationResult = this.validateValue(defaultValue);
        if (!validationResult.isValid) {
            throw new Error(`Invalid default value for field ${this._name}: ${validationResult.errors.join(', ')}`);
        }
        this._defaultValue = this.coerceValue(defaultValue);
    }

    /**
     * Sets options for select/radio fields
     * @param options Array of option values
     */
    public setOptions(options: string[]): void {
        if (this._type !== FieldType.SELECT && this._type !== FieldType.RADIO) {
            throw new Error(`Field type ${this._type} does not support options`);
        }
        this._options = [...options];
    }

    /**
     * Updates the field order
     * @param order New order value
     */
    public setOrder(order: number): void {
        this._order = order;
    }

    /**
     * Updates field metadata
     * @param metadata Metadata object
     */
    public updateMetadata(metadata: Record<string, any>): void {
        this._metadata = { ...this._metadata, ...metadata };
    }

    /**
     * Validates if the field has a valid value
     * @returns True if field is valid
     */
    public isValid(): boolean {
        // If field is required but has no value
        if (this._required && (this._value === undefined || this._value === null || this._value === '')) {
            return false;
        }

        // If field has a value, validate it
        if (this._value !== undefined && this._value !== null) {
            return this.validateValue(this._value).isValid;
        }

        return true;
    }

    /**
     * Gets validation errors for current field state
     * @returns Array of validation error messages
     */
    public getValidationErrors(): string[] {
        const errors: string[] = [];

        if (this._required && (this._value === undefined || this._value === null || this._value === '')) {
            errors.push(`${this._name} is required`);
        }

        if (this._value !== undefined && this._value !== null) {
            const validationResult = this.validateValue(this._value);
            errors.push(...validationResult.errors);
        }

        return errors;
    }

    /**
     * Resets the field to its default value
     */
    public reset(): void {
        if (!this._readonly) {
            this._value = this._defaultValue;
        }
    }

    /**
     * Creates a copy of the field with a new ID
     * @param newId New field ID
     * @returns Cloned field
     */
    public clone(newId: string): Field {
        const cloned = new Field(newId, this._name, this._type, this._required, this._readonly, this._order);
        cloned._placeholder = this._placeholder;
        cloned._description = this._description;
        cloned._bounds = this._bounds ? { ...this._bounds } : undefined;
        cloned._page = this._page;
        cloned._validationRules = [...this._validationRules];
        cloned._defaultValue = this._defaultValue;
        cloned._options = this._options ? [...this._options] : undefined;
        cloned._metadata = this._metadata ? { ...this._metadata } : undefined;
        return cloned;
    }

    /**
     * Creates a serializable representation of the field
     * @returns Plain object representation
     */
    public toJSON(): Record<string, any> {
        return {
            id: this._id,
            name: this._name,
            type: this._type,
            value: this._value,
            placeholder: this._placeholder,
            description: this._description,
            required: this._required,
            readonly: this._readonly,
            bounds: this._bounds,
            page: this._page,
            validationRules: this._validationRules,
            defaultValue: this._defaultValue,
            options: this._options,
            order: this._order,
            metadata: this._metadata
        };
    }

    // Private helper methods

    private validateAndFormatName(name: string): string {
        if (!name || name.trim().length === 0) {
            throw new Error('Field name cannot be empty');
        }
        
        const trimmedName = name.trim();
        if (trimmedName.length > 100) {
            throw new Error('Field name cannot exceed 100 characters');
        }
        
        return trimmedName;
    }

    private validateValue(value: any): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        // Type-specific validation
        switch (this._type) {
            case FieldType.TEXT:
                if (typeof value !== 'string') {
                    errors.push('Value must be a string');
                }
                break;
            case FieldType.NUMBER:
                if (typeof value !== 'number' && !Number.isFinite(Number(value))) {
                    errors.push('Value must be a number');
                }
                break;
            case FieldType.EMAIL:
                if (typeof value === 'string' && !this.isValidEmail(value)) {
                    errors.push('Value must be a valid email address');
                }
                break;
            case FieldType.DATE:
                if (!(value instanceof Date) && !this.isValidDateString(value)) {
                    errors.push('Value must be a valid date');
                }
                break;
            case FieldType.CHECKBOX:
                if (typeof value !== 'boolean') {
                    errors.push('Value must be a boolean');
                }
                break;
            case FieldType.SELECT:
            case FieldType.RADIO:
                if (this._options && !this._options.includes(String(value))) {
                    errors.push(`Value must be one of: ${this._options.join(', ')}`);
                }
                break;
        }

        // Custom validation rules
        for (const rule of this._validationRules) {
            const ruleResult = this.applyValidationRule(rule, value);
            if (!ruleResult.isValid) {
                errors.push(...ruleResult.errors);
            }
        }

        return { isValid: errors.length === 0, errors };
    }

    private coerceValue(value: any): any {
        switch (this._type) {
            case FieldType.NUMBER:
                return typeof value === 'number' ? value : Number(value);
            case FieldType.DATE:
                return value instanceof Date ? value : new Date(value);
            case FieldType.CHECKBOX:
                return Boolean(value);
            default:
                return value;
        }
    }

    private validateBounds(bounds: Rectangle): void {
        if (bounds.width <= 0 || bounds.height <= 0) {
            throw new Error('Bounds width and height must be positive');
        }
        if (bounds.x < 0 || bounds.y < 0) {
            throw new Error('Bounds coordinates must be non-negative');
        }
    }

    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    private isValidDateString(dateString: any): boolean {
        if (typeof dateString !== 'string') return false;
        const date = new Date(dateString);
        return !isNaN(date.getTime());
    }

    private applyValidationRule(rule: FieldValidationRule, value: any): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        switch (rule.type) {
            case 'minLength':
                if (typeof value === 'string' && value.length < rule.value) {
                    errors.push(`Minimum length is ${rule.value}`);
                }
                break;
            case 'maxLength':
                if (typeof value === 'string' && value.length > rule.value) {
                    errors.push(`Maximum length is ${rule.value}`);
                }
                break;
            case 'min':
                if (typeof value === 'number' && value < rule.value) {
                    errors.push(`Minimum value is ${rule.value}`);
                }
                break;
            case 'max':
                if (typeof value === 'number' && value > rule.value) {
                    errors.push(`Maximum value is ${rule.value}`);
                }
                break;
            case 'pattern':
                if (typeof value === 'string' && !new RegExp(rule.value).test(value)) {
                    errors.push(rule.message || `Value must match pattern: ${rule.value}`);
                }
                break;
        }

        return { isValid: errors.length === 0, errors };
    }
}