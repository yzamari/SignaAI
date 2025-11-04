/**
 * Workflow interfaces following Interface Segregation Principle
 * Each interface has a single, focused responsibility
 */

import { WorkflowState, WorkflowPriority } from '../types/workflow.types';

/**
 * Core workflow definition interface
 * Single Responsibility: Define workflow structure
 */
export interface IWorkflowDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly isTemplate: boolean;
  readonly metadata: Record<string, any>;
}

/**
 * Workflow step definition interface
 * Single Responsibility: Define individual workflow steps
 */
export interface IWorkflowStep {
  readonly id: string;
  readonly name: string;
  readonly type: 'sign' | 'approve' | 'review' | 'notify' | 'condition' | 'parallel';
  readonly config: IStepConfiguration;
  readonly nextSteps: string[];
  readonly timeout?: number;
  readonly retryPolicy?: IRetryPolicy;
}

/**
 * Step configuration interface
 */
export interface IStepConfiguration {
  readonly assignees?: string[];
  readonly conditions?: ICondition[];
  readonly parallelSteps?: string[];
  readonly notificationConfig?: INotificationConfig;
  readonly validationRules?: IValidationRule[];
}

/**
 * Condition evaluation interface
 */
export interface ICondition {
  readonly field: string;
  readonly operator: 'equals' | 'notEquals' | 'contains' | 'greaterThan' | 'lessThan';
  readonly value: any;
  readonly nextStepId: string;
}

/**
 * Retry policy interface
 */
export interface IRetryPolicy {
  readonly maxAttempts: number;
  readonly backoffMultiplier: number;
  readonly initialDelay: number;
  readonly maxDelay: number;
}

/**
 * Notification configuration interface
 */
export interface INotificationConfig {
  readonly type: 'email' | 'sms' | 'push' | 'webhook';
  readonly template: string;
  readonly recipients: string[];
  readonly schedule?: IScheduleConfig;
}

/**
 * Schedule configuration interface
 */
export interface IScheduleConfig {
  readonly cronExpression?: string;
  readonly delay?: number;
  readonly reminderIntervals?: number[];
}

/**
 * Validation rule interface
 */
export interface IValidationRule {
  readonly type: 'required' | 'pattern' | 'custom';
  readonly config: Record<string, any>;
  readonly errorMessage: string;
}

/**
 * Workflow instance interface - represents a running workflow
 * Single Responsibility: Track workflow execution state
 */
export interface IWorkflowInstance {
  readonly id: string;
  readonly workflowId: string;
  readonly documentId: string;
  readonly state: WorkflowState;
  readonly currentStepId: string | null;
  readonly priority: WorkflowPriority;
  readonly startedAt: Date;
  readonly completedAt?: Date;
  readonly deadline?: Date;
  readonly context: IWorkflowContext;
}

/**
 * Workflow execution context
 */
export interface IWorkflowContext {
  readonly variables: Map<string, any>;
  readonly history: IWorkflowHistoryEntry[];
  readonly participants: Map<string, IParticipant>;
  readonly metadata: Record<string, any>;
}

/**
 * Workflow history entry
 */
export interface IWorkflowHistoryEntry {
  readonly timestamp: Date;
  readonly stepId: string;
  readonly action: string;
  readonly performedBy: string;
  readonly result: 'success' | 'failure' | 'skipped';
  readonly data?: Record<string, any>;
}

/**
 * Participant in workflow
 */
export interface IParticipant {
  readonly id: string;
  readonly role: 'signer' | 'approver' | 'reviewer' | 'observer';
  readonly email: string;
  readonly name: string;
  readonly status: 'pending' | 'completed' | 'declined';
  readonly completedAt?: Date;
}

/**
 * Workflow transition interface
 * Single Responsibility: Define state transitions
 */
export interface IWorkflowTransition {
  readonly from: WorkflowState;
  readonly to: WorkflowState;
  readonly trigger: string;
  readonly guards?: ITransitionGuard[];
  readonly effects?: ITransitionEffect[];
}

/**
 * Transition guard interface
 */
export interface ITransitionGuard {
  validate(context: IWorkflowContext): boolean;
  getErrorMessage(): string;
}

/**
 * Transition effect interface
 */
export interface ITransitionEffect {
  execute(context: IWorkflowContext): Promise<void>;
  rollback(context: IWorkflowContext): Promise<void>;
}

/**
 * Workflow repository interface
 * Dependency Inversion: High-level modules depend on abstraction
 */
export interface IWorkflowRepository {
  findById(id: string): Promise<IWorkflowDefinition | null>;
  findByName(name: string): Promise<IWorkflowDefinition[]>;
  save(workflow: IWorkflowDefinition): Promise<void>;
  update(id: string, workflow: Partial<IWorkflowDefinition>): Promise<void>;
  delete(id: string): Promise<void>;
  findTemplates(): Promise<IWorkflowDefinition[]>;
}

/**
 * Workflow instance repository interface
 */
export interface IWorkflowInstanceRepository {
  findById(id: string): Promise<IWorkflowInstance | null>;
  findByWorkflowId(workflowId: string): Promise<IWorkflowInstance[]>;
  findByDocumentId(documentId: string): Promise<IWorkflowInstance | null>;
  save(instance: IWorkflowInstance): Promise<void>;
  update(id: string, instance: Partial<IWorkflowInstance>): Promise<void>;
  findActive(): Promise<IWorkflowInstance[]>;
  findByState(state: WorkflowState): Promise<IWorkflowInstance[]>;
}