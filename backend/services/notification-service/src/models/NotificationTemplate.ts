import { NotificationChannel } from '../interfaces/types';

/**
 * Domain model for notification templates
 * Follows Single Responsibility Principle - manages template data and validation
 */
export class NotificationTemplate {
  private readonly _id: string;
  private readonly _name: string;
  private readonly _channel: NotificationChannel;
  private readonly _subject?: string; // For email notifications
  private readonly _body: string;
  private readonly _variables: string[]; // Variables that can be replaced in template
  private readonly _isActive: boolean;
  private readonly _createdAt: Date;
  private readonly _updatedAt: Date;

  constructor(
    id: string,
    name: string,
    channel: NotificationChannel,
    body: string,
    variables: string[],
    isActive: boolean = true,
    subject?: string
  ) {
    this.validateTemplate(body, variables);
    
    this._id = id;
    this._name = name;
    this._channel = channel;
    this._subject = subject;
    this._body = body;
    this._variables = [...variables]; // Defensive copy
    this._isActive = isActive;
    this._createdAt = new Date();
    this._updatedAt = new Date();
  }

  // Getters following encapsulation principle
  get id(): string { return this._id; }
  get name(): string { return this._name; }
  get channel(): NotificationChannel { return this._channel; }
  get subject(): string | undefined { return this._subject; }
  get body(): string { return this._body; }
  get variables(): string[] { return [...this._variables]; } // Return copy for immutability
  get isActive(): boolean { return this._isActive; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }

  /**
   * Validate template structure and variables
   * Ensures template integrity following defensive programming
   */
  private validateTemplate(body: string, variables: string[]): void {
    if (!body || body.trim().length === 0) {
      throw new Error('Template body cannot be empty');
    }

    // Check if all declared variables are actually used in the template
    const unusedVariables = variables.filter(variable => 
      !body.includes(`{{${variable}}}`)
    );

    if (unusedVariables.length > 0) {
      console.warn(`Template contains unused variables: ${unusedVariables.join(', ')}`);
    }

    // Check for variables used in template but not declared
    const usedVariables = this.extractVariablesFromTemplate(body);
    const undeclaredVariables = usedVariables.filter(variable => 
      !variables.includes(variable)
    );

    if (undeclaredVariables.length > 0) {
      throw new Error(`Template uses undeclared variables: ${undeclaredVariables.join(', ')}`);
    }
  }

  /**
   * Extract variables from template body using regex
   */
  private extractVariablesFromTemplate(template: string): string[] {
    const variableRegex = /\{\{([^}]+)\}\}/g;
    const variables: string[] = [];
    let match;

    while ((match = variableRegex.exec(template)) !== null) {
      const variable = match[1].trim();
      if (!variables.includes(variable)) {
        variables.push(variable);
      }
    }

    return variables;
  }

  /**
   * Render template with provided data
   * Implements Template Method Pattern for consistent rendering
   */
  render(data: Record<string, any>): { subject?: string; body: string } {
    this.validateRenderData(data);

    const renderedBody = this.replaceVariables(this._body, data);
    const renderedSubject = this._subject ? this.replaceVariables(this._subject, data) : undefined;

    return {
      subject: renderedSubject,
      body: renderedBody
    };
  }

  /**
   * Validate that all required variables are provided for rendering
   */
  private validateRenderData(data: Record<string, any>): void {
    const missingVariables = this._variables.filter(variable => 
      !(variable in data) || data[variable] === undefined || data[variable] === null
    );

    if (missingVariables.length > 0) {
      throw new Error(`Missing required template variables: ${missingVariables.join(', ')}`);
    }
  }

  /**
   * Replace variables in template string with actual values
   */
  private replaceVariables(template: string, data: Record<string, any>): string {
    let result = template;

    this._variables.forEach(variable => {
      const regex = new RegExp(`\\{\\{\\s*${variable}\\s*\\}\\}`, 'g');
      const value = this.formatValue(data[variable]);
      result = result.replace(regex, value);
    });

    return result;
  }

  /**
   * Format values for template replacement
   * Handles different data types appropriately
   */
  private formatValue(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'object') {
      if (value instanceof Date) {
        return value.toLocaleString();
      }
      return JSON.stringify(value);
    }

    return String(value);
  }

  /**
   * Check if template is compatible with given channel
   */
  isCompatibleWithChannel(channel: NotificationChannel): boolean {
    return this._channel === channel;
  }

  /**
   * Get template metadata for logging and auditing
   */
  getMetadata(): Record<string, any> {
    return {
      id: this._id,
      name: this._name,
      channel: this._channel,
      variableCount: this._variables.length,
      isActive: this._isActive,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt
    };
  }

  /**
   * Create a preview of the template with sample data
   */
  createPreview(sampleData?: Record<string, any>): { subject?: string; body: string } {
    const defaultSampleData: Record<string, any> = {};
    
    // Generate sample data for all variables
    this._variables.forEach(variable => {
      defaultSampleData[variable] = `[${variable.toUpperCase()}]`;
    });

    const previewData = { ...defaultSampleData, ...(sampleData || {}) };
    return this.render(previewData);
  }
}