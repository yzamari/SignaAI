/**
 * Workflow type definitions
 */

/**
 * Workflow states following State pattern
 */
export enum WorkflowState {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  WAITING = 'waiting',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  ROLLED_BACK = 'rolled_back'
}

/**
 * Workflow priority levels
 */
export enum WorkflowPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Step execution status
 */
export enum StepStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  TIMEOUT = 'timeout'
}

/**
 * Command types for Command pattern
 */
export enum CommandType {
  START_WORKFLOW = 'start_workflow',
  EXECUTE_STEP = 'execute_step',
  PAUSE_WORKFLOW = 'pause_workflow',
  RESUME_WORKFLOW = 'resume_workflow',
  CANCEL_WORKFLOW = 'cancel_workflow',
  ROLLBACK_WORKFLOW = 'rollback_workflow',
  RETRY_STEP = 'retry_step',
  SKIP_STEP = 'skip_step',
  UPDATE_CONTEXT = 'update_context'
}

/**
 * Saga transaction status
 */
export enum SagaStatus {
  PENDING = 'pending',
  EXECUTING = 'executing',
  COMPENSATING = 'compensating',
  COMPLETED = 'completed',
  FAILED = 'failed',
  COMPENSATED = 'compensated'
}

/**
 * Event types for workflow events
 */
export enum WorkflowEventType {
  WORKFLOW_STARTED = 'workflow.started',
  WORKFLOW_COMPLETED = 'workflow.completed',
  WORKFLOW_FAILED = 'workflow.failed',
  WORKFLOW_CANCELLED = 'workflow.cancelled',
  WORKFLOW_PAUSED = 'workflow.paused',
  WORKFLOW_RESUMED = 'workflow.resumed',
  STEP_STARTED = 'step.started',
  STEP_COMPLETED = 'step.completed',
  STEP_FAILED = 'step.failed',
  STEP_TIMEOUT = 'step.timeout',
  DEADLINE_APPROACHING = 'deadline.approaching',
  DEADLINE_EXCEEDED = 'deadline.exceeded'
}

/**
 * Error types for workflow errors
 */
export enum WorkflowErrorType {
  VALIDATION_ERROR = 'validation_error',
  EXECUTION_ERROR = 'execution_error',
  TIMEOUT_ERROR = 'timeout_error',
  PERMISSION_ERROR = 'permission_error',
  STATE_TRANSITION_ERROR = 'state_transition_error',
  CONFIGURATION_ERROR = 'configuration_error',
  INTEGRATION_ERROR = 'integration_error',
  ROLLBACK_ERROR = 'rollback_error'
}

/**
 * Integration service types
 */
export enum ServiceType {
  DOCUMENT_SERVICE = 'document_service',
  SIGNATURE_SERVICE = 'signature_service',
  NOTIFICATION_SERVICE = 'notification_service',
  AUTH_SERVICE = 'auth_service',
  AUDIT_SERVICE = 'audit_service'
}

/**
 * Workflow metadata type
 */
export type WorkflowMetadata = {
  tags: string[];
  category: string;
  department?: string;
  owner: string;
  businessUnit?: string;
  complianceLevel?: 'standard' | 'high' | 'critical';
  estimatedDuration?: number;
  sla?: number;
}

/**
 * Step execution result
 */
export type StepExecutionResult = {
  status: StepStatus;
  output?: Record<string, any>;
  error?: Error;
  executionTime: number;
  retryCount: number;
}

/**
 * Workflow statistics
 */
export type WorkflowStatistics = {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  medianExecutionTime: number;
  successRate: number;
}

/**
 * Deadline configuration
 */
export type DeadlineConfig = {
  absoluteDeadline?: Date;
  relativeDeadline?: number;
  warningThreshold?: number;
  escalationPolicy?: EscalationPolicy;
}

/**
 * Escalation policy
 */
export type EscalationPolicy = {
  levels: EscalationLevel[];
  defaultAction: 'notify' | 'reassign' | 'escalate' | 'cancel';
}

/**
 * Escalation level
 */
export type EscalationLevel = {
  threshold: number;
  recipients: string[];
  action: 'notify' | 'reassign' | 'escalate';
  message?: string;
}