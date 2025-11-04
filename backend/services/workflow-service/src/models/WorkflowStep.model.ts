/**
 * WorkflowStep domain model
 * Single Responsibility: Manages individual workflow step behavior
 */

import { v4 as uuidv4 } from 'uuid';
import {
  IWorkflowStep,
  IStepConfiguration,
  IRetryPolicy,
  ICondition,
  IValidationRule
} from '../interfaces/IWorkflow.interface';
import { StepStatus } from '../types/workflow.types';
import { injectable } from 'inversify';

/**
 * Abstract base class for workflow steps
 * Open/Closed Principle: Extended by specific step types
 */
@injectable()
export abstract class WorkflowStep implements IWorkflowStep {
  public readonly id: string;
  public readonly nextSteps: string[];
  protected conditionalNextSteps: Map<string, string>;
  protected _status: StepStatus;
  protected validators: IValidationRule[];

  constructor(
    public readonly name: string,
    public readonly type: 'sign' | 'approve' | 'review' | 'notify' | 'condition' | 'parallel',
    public readonly config: IStepConfiguration,
    public readonly timeout?: number,
    public readonly retryPolicy?: IRetryPolicy
  ) {
    this.id = uuidv4();
    this.nextSteps = [];
    this.conditionalNextSteps = new Map();
    this._status = StepStatus.PENDING;
    this.validators = config.validationRules || [];
  }

  /**
   * Template Method pattern - execute step with hooks
   */
  public async execute(context: Record<string, any>): Promise<void> {
    try {
      // Pre-execution hook
      await this.beforeExecute(context);
      
      // Validate input
      this.validate(context);
      
      // Execute core logic
      this._status = StepStatus.IN_PROGRESS;
      await this.doExecute(context);
      
      // Post-execution hook
      await this.afterExecute(context);
      
      this._status = StepStatus.COMPLETED;
    } catch (error) {
      this._status = StepStatus.FAILED;
      await this.onError(error as Error, context);
      throw error;
    }
  }

  /**
   * Abstract method for step-specific execution logic
   */
  protected abstract doExecute(context: Record<string, any>): Promise<void>;

  /**
   * Hook methods for subclasses to override
   */
  protected async beforeExecute(context: Record<string, any>): Promise<void> {
    // Default: no-op
  }

  protected async afterExecute(context: Record<string, any>): Promise<void> {
    // Default: no-op
  }

  protected async onError(error: Error, context: Record<string, any>): Promise<void> {
    // Default: log error
    console.error(`Step ${this.id} failed:`, error);
  }

  /**
   * Add a next step
   */
  public addNextStep(stepId: string): void {
    if (!this.nextSteps.includes(stepId)) {
      this.nextSteps.push(stepId);
    }
  }

  /**
   * Remove a next step
   */
  public removeNextStep(stepId: string): void {
    const index = this.nextSteps.indexOf(stepId);
    if (index > -1) {
      this.nextSteps.splice(index, 1);
    }
  }

  /**
   * Add conditional next step
   */
  public addConditionalNext(condition: string, stepId: string): void {
    this.conditionalNextSteps.set(condition, stepId);
  }

  /**
   * Evaluate conditions to determine next step
   */
  public evaluateNextStep(context: Record<string, any>): string | null {
    // Check conditional routes first
    if (this.config.conditions) {
      for (const condition of this.config.conditions) {
        if (this.evaluateCondition(condition, context)) {
          return condition.nextStepId;
        }
      }
    }
    
    // Return first default next step
    return this.nextSteps.length > 0 ? this.nextSteps[0] : null;
  }

  /**
   * Evaluate a single condition
   */
  protected evaluateCondition(condition: ICondition, context: Record<string, any>): boolean {
    const value = this.getValueFromContext(condition.field, context);
    
    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'notEquals':
        return value !== condition.value;
      case 'contains':
        return String(value).includes(String(condition.value));
      case 'greaterThan':
        return Number(value) > Number(condition.value);
      case 'lessThan':
        return Number(value) < Number(condition.value);
      default:
        return false;
    }
  }

  /**
   * Get nested value from context using dot notation
   */
  protected getValueFromContext(field: string, context: Record<string, any>): any {
    const keys = field.split('.');
    let value: any = context;
    
    for (const key of keys) {
      value = value?.[key];
      if (value === undefined) break;
    }
    
    return value;
  }

  /**
   * Validate step input
   */
  protected validate(context: Record<string, any>): void {
    for (const rule of this.validators) {
      if (!this.validateRule(rule, context)) {
        throw new Error(rule.errorMessage);
      }
    }
  }

  /**
   * Validate a single rule
   */
  protected validateRule(rule: IValidationRule, context: Record<string, any>): boolean {
    switch (rule.type) {
      case 'required':
        const value = this.getValueFromContext(rule.config.field, context);
        return value !== undefined && value !== null && value !== '';
      
      case 'pattern':
        const patternValue = this.getValueFromContext(rule.config.field, context);
        const regex = new RegExp(rule.config.pattern);
        return regex.test(String(patternValue));
      
      case 'custom':
        // Custom validation would be implemented by subclasses
        return true;
      
      default:
        return true;
    }
  }

  /**
   * Get step status
   */
  public get status(): StepStatus {
    return this._status;
  }

  /**
   * Reset step status
   */
  public reset(): void {
    this._status = StepStatus.PENDING;
  }

  /**
   * Clone the step
   */
  public clone(): WorkflowStep {
    const StepClass = this.constructor as new (
      name: string,
      type: any,
      config: IStepConfiguration,
      timeout?: number,
      retryPolicy?: IRetryPolicy
    ) => WorkflowStep;
    
    const cloned = new StepClass(
      this.name,
      this.type,
      { ...this.config },
      this.timeout,
      this.retryPolicy
    );
    
    // Copy next steps
    this.nextSteps.forEach(stepId => cloned.addNextStep(stepId));
    this.conditionalNextSteps.forEach((stepId, condition) => 
      cloned.addConditionalNext(condition, stepId)
    );
    
    return cloned;
  }

  /**
   * Export step as JSON
   */
  public toJSON(): Record<string, any> {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      config: this.config,
      nextSteps: this.nextSteps,
      conditionalNextSteps: Object.fromEntries(this.conditionalNextSteps),
      timeout: this.timeout,
      retryPolicy: this.retryPolicy,
      status: this.status
    };
  }
}

/**
 * Signature step implementation
 */
@injectable()
export class SignatureStep extends WorkflowStep {
  constructor(
    name: string,
    config: IStepConfiguration,
    timeout?: number,
    retryPolicy?: IRetryPolicy
  ) {
    super(name, 'sign', config, timeout, retryPolicy);
  }

  protected async doExecute(context: Record<string, any>): Promise<void> {
    // Signature-specific logic
    const { documentId, signerId } = context;
    
    if (!documentId || !signerId) {
      throw new Error('Document ID and Signer ID are required for signature step');
    }
    
    // Integration with Signature Service would go here
    console.log(`Executing signature for document ${documentId} by signer ${signerId}`);
    
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  protected async beforeExecute(context: Record<string, any>): Promise<void> {
    console.log(`Preparing signature step: ${this.name}`);
  }

  protected async afterExecute(context: Record<string, any>): Promise<void> {
    console.log(`Signature step completed: ${this.name}`);
  }
}

/**
 * Approval step implementation
 */
@injectable()
export class ApprovalStep extends WorkflowStep {
  constructor(
    name: string,
    config: IStepConfiguration,
    timeout?: number,
    retryPolicy?: IRetryPolicy
  ) {
    super(name, 'approve', config, timeout, retryPolicy);
  }

  protected async doExecute(context: Record<string, any>): Promise<void> {
    const { documentId, approverId } = context;
    
    if (!documentId || !approverId) {
      throw new Error('Document ID and Approver ID are required for approval step');
    }
    
    // Approval logic
    console.log(`Executing approval for document ${documentId} by approver ${approverId}`);
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/**
 * Notification step implementation
 */
@injectable()
export class NotificationStep extends WorkflowStep {
  constructor(
    name: string,
    config: IStepConfiguration,
    timeout?: number,
    retryPolicy?: IRetryPolicy
  ) {
    super(name, 'notify', config, timeout, retryPolicy);
  }

  protected async doExecute(context: Record<string, any>): Promise<void> {
    const notificationConfig = this.config.notificationConfig;
    
    if (!notificationConfig) {
      throw new Error('Notification configuration is required');
    }
    
    // Integration with Notification Service
    console.log(`Sending ${notificationConfig.type} notification to ${notificationConfig.recipients.join(', ')}`);
    
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

/**
 * Condition step implementation
 */
@injectable()
export class ConditionStep extends WorkflowStep {
  constructor(
    name: string,
    config: IStepConfiguration,
    timeout?: number,
    retryPolicy?: IRetryPolicy
  ) {
    super(name, 'condition', config, timeout, retryPolicy);
  }

  protected async doExecute(context: Record<string, any>): Promise<void> {
    // Condition evaluation is handled in evaluateNextStep
    console.log(`Evaluating conditions for step: ${this.name}`);
  }
}

/**
 * Parallel step implementation
 */
@injectable()
export class ParallelStep extends WorkflowStep {
  constructor(
    name: string,
    config: IStepConfiguration,
    timeout?: number,
    retryPolicy?: IRetryPolicy
  ) {
    super(name, 'parallel', config, timeout, retryPolicy);
  }

  protected async doExecute(context: Record<string, any>): Promise<void> {
    const parallelSteps = this.config.parallelSteps || [];
    
    if (parallelSteps.length === 0) {
      throw new Error('Parallel steps configuration is required');
    }
    
    console.log(`Executing ${parallelSteps.length} steps in parallel`);
    
    // Parallel execution would be handled by the workflow engine
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}