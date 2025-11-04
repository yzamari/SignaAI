/**
 * Field-related type definitions.
 * Defines enums and types used for document fields and form elements.
 */

/**
 * Enumeration of field types supported by the system
 */
export enum FieldType {
    TEXT = 'text',
    NUMBER = 'number',
    EMAIL = 'email',
    DATE = 'date',
    DATETIME = 'datetime',
    TIME = 'time',
    PHONE = 'phone',
    URL = 'url',
    PASSWORD = 'password',
    TEXTAREA = 'textarea',
    CHECKBOX = 'checkbox',
    RADIO = 'radio',
    SELECT = 'select',
    MULTISELECT = 'multiselect',
    FILE = 'file',
    IMAGE = 'image',
    SIGNATURE = 'signature',
    CURRENCY = 'currency',
    PERCENTAGE = 'percentage',
    BOOLEAN = 'boolean',
    JSON = 'json',
    CUSTOM = 'custom'
}

/**
 * Field validation rule interface
 */
export interface FieldValidationRule {
    type: string;
    value: any;
    message?: string;
    enabled: boolean;
}

/**
 * Common validation rule types
 */
export enum ValidationRuleType {
    REQUIRED = 'required',
    MIN_LENGTH = 'minLength',
    MAX_LENGTH = 'maxLength',
    MIN = 'min',
    MAX = 'max',
    PATTERN = 'pattern',
    EMAIL = 'email',
    PHONE = 'phone',
    URL = 'url',
    DATE_RANGE = 'dateRange',
    CUSTOM = 'custom'
}

/**
 * Field input mask configuration
 */
export interface FieldInputMask {
    pattern: string;
    placeholder: string;
    showMask?: boolean;
    guide?: boolean;
    keepCharPositions?: boolean;
}

/**
 * Field conditional display rules
 */
export interface FieldConditionalRule {
    fieldId: string;
    condition: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty';
    value: any;
    action: 'show' | 'hide' | 'require' | 'disable';
}

/**
 * Field creation request interface
 */
export interface CreateFieldRequest {
    name: string;
    type: FieldType;
    required?: boolean;
    readonly?: boolean;
    placeholder?: string;
    description?: string;
    defaultValue?: any;
    options?: string[];
    bounds?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    page?: number;
    order?: number;
    validationRules?: FieldValidationRule[];
    inputMask?: FieldInputMask;
    conditionalRules?: FieldConditionalRule[];
    metadata?: Record<string, any>;
}

/**
 * Field update request interface
 */
export interface UpdateFieldRequest {
    name?: string;
    required?: boolean;
    readonly?: boolean;
    placeholder?: string;
    description?: string;
    defaultValue?: any;
    options?: string[];
    bounds?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    page?: number;
    order?: number;
    validationRules?: FieldValidationRule[];
    inputMask?: FieldInputMask;
    conditionalRules?: FieldConditionalRule[];
    metadata?: Record<string, any>;
}

/**
 * Field value validation result
 */
export interface FieldValidationResult {
    isValid: boolean;
    value: any;
    errors: string[];
    warnings: string[];
    normalizedValue?: any;
}

/**
 * Field extraction result from OCR
 */
export interface FieldExtractionResult {
    fieldName?: string;
    detectedType: FieldType;
    extractedValue: any;
    confidence: number;
    bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    page: number;
    rawText: string;
    normalizedValue?: any;
    validationResult?: FieldValidationResult;
}

/**
 * Field template definition
 */
export interface FieldTemplate {
    id: string;
    name: string;
    type: FieldType;
    label: string;
    description?: string;
    required: boolean;
    defaultValue?: any;
    options?: string[];
    validationRules: FieldValidationRule[];
    inputMask?: FieldInputMask;
    conditionalRules?: FieldConditionalRule[];
    renderingHints?: {
        width?: number;
        height?: number;
        multiline?: boolean;
        placeholder?: string;
        helpText?: string;
    };
    metadata?: Record<string, any>;
}

/**
 * Field group for organizing related fields
 */
export interface FieldGroup {
    id: string;
    name: string;
    label: string;
    description?: string;
    fields: string[]; // Field IDs
    collapsible?: boolean;
    collapsed?: boolean;
    order: number;
    conditionalRules?: FieldConditionalRule[];
    metadata?: Record<string, any>;
}

/**
 * Field calculation rule for computed fields
 */
export interface FieldCalculationRule {
    formula: string;
    dependsOn: string[]; // Field IDs this calculation depends on
    recalculateOn: 'change' | 'submit' | 'manual';
    format?: {
        type: 'number' | 'currency' | 'percentage' | 'date';
        precision?: number;
        currencyCode?: string;
    };
}

/**
 * Field appearance customization
 */
export interface FieldAppearance {
    backgroundColor?: string;
    borderColor?: string;
    textColor?: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: 'normal' | 'bold';
    textAlign?: 'left' | 'center' | 'right';
    borderWidth?: number;
    borderRadius?: number;
    padding?: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
    margin?: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
}

/**
 * Field statistics for analytics
 */
export interface FieldStatistics {
    fieldId: string;
    fieldName: string;
    fieldType: FieldType;
    totalUsage: number;
    completionRate: number;
    averageValueLength?: number;
    commonValues?: Array<{
        value: any;
        count: number;
        percentage: number;
    }>;
    validationErrors?: Array<{
        rule: string;
        count: number;
        percentage: number;
    }>;
    extractionAccuracy?: {
        totalExtractions: number;
        successfulExtractions: number;
        averageConfidence: number;
    };
}

/**
 * Type guard functions
 */
export const isFieldType = (value: any): value is FieldType => {
    return Object.values(FieldType).includes(value);
};

export const isValidationRuleType = (value: any): value is ValidationRuleType => {
    return Object.values(ValidationRuleType).includes(value);
};

/**
 * Default values and constants
 */
export const DEFAULT_FIELD_TYPE = FieldType.TEXT;
export const MAX_FIELD_NAME_LENGTH = 100;
export const MAX_FIELD_DESCRIPTION_LENGTH = 500;
export const MAX_FIELD_OPTIONS = 100;
export const MAX_VALIDATION_RULES = 10;

export const SUPPORTED_FIELD_TYPES = Object.values(FieldType);
export const SUPPORTED_VALIDATION_RULE_TYPES = Object.values(ValidationRuleType);

/**
 * Field type configuration mapping
 */
export const FIELD_TYPE_CONFIG: Record<FieldType, {
    displayName: string;
    description: string;
    defaultValidationRules: ValidationRuleType[];
    supportedValidationRules: ValidationRuleType[];
    inputType: string;
    supportsOptions: boolean;
    supportsPlaceholder: boolean;
    supportsMultiline: boolean;
    defaultWidth: number;
    defaultHeight: number;
}> = {
    [FieldType.TEXT]: {
        displayName: 'Text',
        description: 'Single-line text input',
        defaultValidationRules: [],
        supportedValidationRules: [ValidationRuleType.REQUIRED, ValidationRuleType.MIN_LENGTH, ValidationRuleType.MAX_LENGTH, ValidationRuleType.PATTERN],
        inputType: 'text',
        supportsOptions: false,
        supportsPlaceholder: true,
        supportsMultiline: false,
        defaultWidth: 200,
        defaultHeight: 30
    },
    [FieldType.NUMBER]: {
        displayName: 'Number',
        description: 'Numeric input',
        defaultValidationRules: [],
        supportedValidationRules: [ValidationRuleType.REQUIRED, ValidationRuleType.MIN, ValidationRuleType.MAX],
        inputType: 'number',
        supportsOptions: false,
        supportsPlaceholder: true,
        supportsMultiline: false,
        defaultWidth: 150,
        defaultHeight: 30
    },
    [FieldType.EMAIL]: {
        displayName: 'Email',
        description: 'Email address input',
        defaultValidationRules: [ValidationRuleType.EMAIL],
        supportedValidationRules: [ValidationRuleType.REQUIRED, ValidationRuleType.EMAIL],
        inputType: 'email',
        supportsOptions: false,
        supportsPlaceholder: true,
        supportsMultiline: false,
        defaultWidth: 250,
        defaultHeight: 30
    },
    [FieldType.DATE]: {
        displayName: 'Date',
        description: 'Date picker',
        defaultValidationRules: [],
        supportedValidationRules: [ValidationRuleType.REQUIRED, ValidationRuleType.DATE_RANGE],
        inputType: 'date',
        supportsOptions: false,
        supportsPlaceholder: false,
        supportsMultiline: false,
        defaultWidth: 150,
        defaultHeight: 30
    },
    [FieldType.DATETIME]: {
        displayName: 'Date & Time',
        description: 'Date and time picker',
        defaultValidationRules: [],
        supportedValidationRules: [ValidationRuleType.REQUIRED, ValidationRuleType.DATE_RANGE],
        inputType: 'datetime-local',
        supportsOptions: false,
        supportsPlaceholder: false,
        supportsMultiline: false,
        defaultWidth: 200,
        defaultHeight: 30
    },
    [FieldType.TIME]: {
        displayName: 'Time',
        description: 'Time picker',
        defaultValidationRules: [],
        supportedValidationRules: [ValidationRuleType.REQUIRED],
        inputType: 'time',
        supportsOptions: false,
        supportsPlaceholder: false,
        supportsMultiline: false,
        defaultWidth: 120,
        defaultHeight: 30
    },
    [FieldType.PHONE]: {
        displayName: 'Phone',
        description: 'Phone number input',
        defaultValidationRules: [ValidationRuleType.PHONE],
        supportedValidationRules: [ValidationRuleType.REQUIRED, ValidationRuleType.PHONE, ValidationRuleType.PATTERN],
        inputType: 'tel',
        supportsOptions: false,
        supportsPlaceholder: true,
        supportsMultiline: false,
        defaultWidth: 200,
        defaultHeight: 30
    },
    [FieldType.URL]: {
        displayName: 'URL',
        description: 'URL input',
        defaultValidationRules: [ValidationRuleType.URL],
        supportedValidationRules: [ValidationRuleType.REQUIRED, ValidationRuleType.URL],
        inputType: 'url',
        supportsOptions: false,
        supportsPlaceholder: true,
        supportsMultiline: false,
        defaultWidth: 300,
        defaultHeight: 30
    },
    [FieldType.PASSWORD]: {
        displayName: 'Password',
        description: 'Password input',
        defaultValidationRules: [],
        supportedValidationRules: [ValidationRuleType.REQUIRED, ValidationRuleType.MIN_LENGTH, ValidationRuleType.MAX_LENGTH, ValidationRuleType.PATTERN],
        inputType: 'password',
        supportsOptions: false,
        supportsPlaceholder: true,
        supportsMultiline: false,
        defaultWidth: 200,
        defaultHeight: 30
    },
    [FieldType.TEXTAREA]: {
        displayName: 'Text Area',
        description: 'Multi-line text input',
        defaultValidationRules: [],
        supportedValidationRules: [ValidationRuleType.REQUIRED, ValidationRuleType.MIN_LENGTH, ValidationRuleType.MAX_LENGTH],
        inputType: 'textarea',
        supportsOptions: false,
        supportsPlaceholder: true,
        supportsMultiline: true,
        defaultWidth: 300,
        defaultHeight: 100
    },
    [FieldType.CHECKBOX]: {
        displayName: 'Checkbox',
        description: 'Boolean checkbox',
        defaultValidationRules: [],
        supportedValidationRules: [ValidationRuleType.REQUIRED],
        inputType: 'checkbox',
        supportsOptions: false,
        supportsPlaceholder: false,
        supportsMultiline: false,
        defaultWidth: 20,
        defaultHeight: 20
    },
    [FieldType.RADIO]: {
        displayName: 'Radio Button',
        description: 'Single selection from options',
        defaultValidationRules: [],
        supportedValidationRules: [ValidationRuleType.REQUIRED],
        inputType: 'radio',
        supportsOptions: true,
        supportsPlaceholder: false,
        supportsMultiline: false,
        defaultWidth: 200,
        defaultHeight: 100
    },
    [FieldType.SELECT]: {
        displayName: 'Select Dropdown',
        description: 'Dropdown selection',
        defaultValidationRules: [],
        supportedValidationRules: [ValidationRuleType.REQUIRED],
        inputType: 'select',
        supportsOptions: true,
        supportsPlaceholder: true,
        supportsMultiline: false,
        defaultWidth: 200,
        defaultHeight: 30
    },
    [FieldType.MULTISELECT]: {
        displayName: 'Multi-Select',
        description: 'Multiple selection dropdown',
        defaultValidationRules: [],
        supportedValidationRules: [ValidationRuleType.REQUIRED],
        inputType: 'select-multiple',
        supportsOptions: true,
        supportsPlaceholder: true,
        supportsMultiline: false,
        defaultWidth: 200,
        defaultHeight: 100
    },
    [FieldType.FILE]: {
        displayName: 'File Upload',
        description: 'File upload input',
        defaultValidationRules: [],
        supportedValidationRules: [ValidationRuleType.REQUIRED],
        inputType: 'file',
        supportsOptions: false,
        supportsPlaceholder: false,
        supportsMultiline: false,
        defaultWidth: 250,
        defaultHeight: 30
    },
    [FieldType.IMAGE]: {
        displayName: 'Image Upload',
        description: 'Image upload input',
        defaultValidationRules: [],
        supportedValidationRules: [ValidationRuleType.REQUIRED],
        inputType: 'file',
        supportsOptions: false,
        supportsPlaceholder: false,
        supportsMultiline: false,
        defaultWidth: 200,
        defaultHeight: 150
    },
    [FieldType.SIGNATURE]: {
        displayName: 'Signature',
        description: 'Digital signature pad',
        defaultValidationRules: [ValidationRuleType.REQUIRED],
        supportedValidationRules: [ValidationRuleType.REQUIRED],
        inputType: 'signature',
        supportsOptions: false,
        supportsPlaceholder: false,
        supportsMultiline: false,
        defaultWidth: 300,
        defaultHeight: 150
    },
    [FieldType.CURRENCY]: {
        displayName: 'Currency',
        description: 'Currency amount input',
        defaultValidationRules: [],
        supportedValidationRules: [ValidationRuleType.REQUIRED, ValidationRuleType.MIN, ValidationRuleType.MAX],
        inputType: 'number',
        supportsOptions: false,
        supportsPlaceholder: true,
        supportsMultiline: false,
        defaultWidth: 150,
        defaultHeight: 30
    },
    [FieldType.PERCENTAGE]: {
        displayName: 'Percentage',
        description: 'Percentage input',
        defaultValidationRules: [],
        supportedValidationRules: [ValidationRuleType.REQUIRED, ValidationRuleType.MIN, ValidationRuleType.MAX],
        inputType: 'number',
        supportsOptions: false,
        supportsPlaceholder: true,
        supportsMultiline: false,
        defaultWidth: 120,
        defaultHeight: 30
    },
    [FieldType.BOOLEAN]: {
        displayName: 'Boolean',
        description: 'True/false toggle',
        defaultValidationRules: [],
        supportedValidationRules: [ValidationRuleType.REQUIRED],
        inputType: 'checkbox',
        supportsOptions: false,
        supportsPlaceholder: false,
        supportsMultiline: false,
        defaultWidth: 50,
        defaultHeight: 30
    },
    [FieldType.JSON]: {
        displayName: 'JSON',
        description: 'JSON data input',
        defaultValidationRules: [],
        supportedValidationRules: [ValidationRuleType.REQUIRED, ValidationRuleType.CUSTOM],
        inputType: 'textarea',
        supportsOptions: false,
        supportsPlaceholder: true,
        supportsMultiline: true,
        defaultWidth: 400,
        defaultHeight: 200
    },
    [FieldType.CUSTOM]: {
        displayName: 'Custom',
        description: 'Custom field type',
        defaultValidationRules: [],
        supportedValidationRules: [ValidationRuleType.REQUIRED, ValidationRuleType.CUSTOM],
        inputType: 'text',
        supportsOptions: true,
        supportsPlaceholder: true,
        supportsMultiline: false,
        defaultWidth: 200,
        defaultHeight: 30
    }
};

/**
 * Common input masks for different field types
 */
export const COMMON_INPUT_MASKS: Record<string, FieldInputMask> = {
    phone_us: {
        pattern: '(999) 999-9999',
        placeholder: '(123) 456-7890'
    },
    ssn: {
        pattern: '999-99-9999',
        placeholder: '123-45-6789'
    },
    credit_card: {
        pattern: '9999 9999 9999 9999',
        placeholder: '1234 5678 9012 3456'
    },
    date_us: {
        pattern: '99/99/9999',
        placeholder: 'MM/DD/YYYY'
    },
    time_24: {
        pattern: '99:99',
        placeholder: 'HH:MM'
    },
    postal_code_us: {
        pattern: '99999-9999',
        placeholder: '12345-6789'
    }
};