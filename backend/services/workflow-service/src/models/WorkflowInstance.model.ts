/**
 * WorkflowInstance domain model
 * Represents a running instance of a workflow
 * Single Responsibility: Manages workflow execution state
 */

import { v4 as uuidv4 } from 'uuid';
import {
  IWorkflowInstance,
  IWorkflowContext,
  IWorkflowHistoryEntry,
  IParticipant
} from '../interfaces/IWorkflow.interface';
import { WorkflowState, WorkflowPriority, StepStatus } from '../types/workflow.types';
import { BaseWorkflow } from './Workflow.model';
import { WorkflowStep } from './WorkflowStep.model';
import { injectable } from 'inversify';

/**
 * Workflow execution context implementation
 */
@injectable()
export class WorkflowContext implements IWorkflowContext {
  public readonly variables: Map<string, any>;
  public readonly history: IWorkflowHistoryEntry[];
  public readonly participants: Map<string, IParticipant>;
  public readonly metadata: Record<string, any>;

  constructor(initialContext?: Partial<IWorkflowContext>) {
    this.variables = new Map(initialContext?.variables || []);
    this.history = initialContext?.history || [];
    this.participants = new Map(initialContext?.participants || []);
    this.metadata = initialContext?.metadata || {};
  }

  /**
   * Set a variable in the context
   */
  public setVariable(key: string, value: any): void {
    this.variables.set(key, value);
  }

  /**
   * Get a variable from the context
   */
  public getVariable(key: string): any {
    return this.variables.get(key);
  }

  /**
   * Add history entry
   */
  public addHistoryEntry(entry: IWorkflowHistoryEntry): void {
    this.history.push(entry);
  }

  /**
   * Add or update participant
   */
  public setParticipant(participant: IParticipant): void {
    this.participants.set(participant.id, participant);
  }

  /**
   * Get participant by ID
   */
  public getParticipant(id: string): IParticipant | undefined {
    return this.participants.get(id);
  }

  /**
   * Get participants by role
   */
  public getParticipantsByRole(role: string): IParticipant[] {
    return Array.from(this.participants.values()).filter(p => p.role === role);
  }

  /**
   * Clone the context
   */
  public clone(): WorkflowContext {
    return new WorkflowContext({
      variables: new Map(this.variables),
      history: [...this.history],
      participants: new Map(this.participants),
      metadata: { ...this.metadata }
    });
  }

  /**
   * Export as plain object
   */
  public toJSON(): Record<string, any> {
    return {
      variables: Object.fromEntries(this.variables),
      history: this.history,
      participants: Array.from(this.participants.values()),
      metadata: this.metadata
    };
  }
}

/**
 * WorkflowInstance implementation
 * Encapsulates workflow execution state and behavior
 */
@injectable()
export class WorkflowInstance implements IWorkflowInstance {
  public readonly id: string;
  public readonly startedAt: Date;
  public completedAt?: Date;
  public deadline?: Date;
  
  private _state: WorkflowState;
  private _currentStepId: string | null;
  private _context: WorkflowContext;
  private workflow: BaseWorkflow;
  private currentStep?: WorkflowStep;
  
  // Step execution tracking
  private stepExecutionCount: Map<string, number>;
  private stepExecutionTime: Map<string, number[]>;

  constructor(
    public readonly workflowId: string,
    public readonly documentId: string,
    workflow: BaseWorkflow,
    public readonly priority: WorkflowPriority = WorkflowPriority.NORMAL,
    deadline?: Date
  ) {
    this.id = uuidv4();
    this.workflow = workflow;
    this.startedAt = new Date();
    this.deadline = deadline;
    this._state = WorkflowState.DRAFT;
    this._currentStepId = null;
    this._context = new WorkflowContext();
    this.stepExecutionCount = new Map();
    this.stepExecutionTime = new Map();
    
    this.initializeContext();
  }

  /**
   * Initialize workflow context with default values
   */
  private initializeContext(): void {
    this._context.setVariable('workflowId', this.workflowId);
    this._context.setVariable('documentId', this.documentId);
    this._context.setVariable('instanceId', this.id);
    this._context.setVariable('priority', this.priority);
    this._context.metadata.workflowName = this.workflow.name;
    this._context.metadata.workflowVersion = this.workflow.version;
  }

  /**
   * Get current state
   */
  public get state(): WorkflowState {
    return this._state;
  }

  /**
   * Get current step ID
   */
  public get currentStepId(): string | null {
    return this._currentStepId;
  }

  /**
   * Get workflow context
   */
  public get context(): IWorkflowContext {
    return this._context;
  }

  /**
   * Start the workflow
   */
  public async start(): Promise<void> {
    if (this._state !== WorkflowState.DRAFT) {
      throw new Error(`Cannot start workflow in state ${this._state}`);
    }
    
    this._state = WorkflowState.ACTIVE;
    const startingSteps = this.workflow.getStartingSteps();
    
    if (startingSteps.length === 0) {
      throw new Error('No starting steps found in workflow');
    }
    
    // Set the first starting step as current
    this._currentStepId = startingSteps[0].id;
    this.currentStep = startingSteps[0];
    
    this.addHistoryEntry('start', 'Workflow started', 'system');
  }

  /**
   * Execute current step
   */
  public async executeCurrentStep(): Promise<void> {
    if (!this.currentStep) {
      throw new Error('No current step to execute');
    }
    
    if (this._state !== WorkflowState.ACTIVE) {
      throw new Error(`Cannot execute step in workflow state ${this._state}`);
    }
    
    this._state = WorkflowState.EXECUTING;
    const startTime = Date.now();
    
    try {
      // Track execution
      const execCount = (this.stepExecutionCount.get(this.currentStep.id) || 0) + 1;
      this.stepExecutionCount.set(this.currentStep.id, execCount);
      
      // Execute the step
      await this.currentStep.execute(this._context.toJSON());
      
      // Track execution time
      const execTime = Date.now() - startTime;
      const times = this.stepExecutionTime.get(this.currentStep.id) || [];
      times.push(execTime);
      this.stepExecutionTime.set(this.currentStep.id, times);
      
      // Record in history
      this.addHistoryEntry(
        'execute',
        `Step ${this.currentStep.name} completed`,
        'system',
        'success',
        { executionTime: execTime }
      );
      
      // Move to next step
      await this.moveToNextStep();
      
    } catch (error) {
      this._state = WorkflowState.FAILED;
      this.addHistoryEntry(
        'execute',
        `Step ${this.currentStep.name} failed: ${(error as Error).message}`,
        'system',
        'failure'
      );
      throw error;
    }
  }

  /**
   * Move to next step based on conditions
   */
  private async moveToNextStep(): Promise<void> {
    if (!this.currentStep) {
      throw new Error('No current step');
    }
    
    const nextStepId = this.currentStep.evaluateNextStep(this._context.toJSON());
    
    if (nextStepId) {
      const nextStep = this.workflow.getStep(nextStepId);
      if (!nextStep) {
        throw new Error(`Next step ${nextStepId} not found`);
      }
      
      this._currentStepId = nextStepId;
      this.currentStep = nextStep;
      this._state = WorkflowState.ACTIVE;
      
      this.addHistoryEntry(
        'transition',
        `Transitioned to step ${nextStep.name}`,
        'system'
      );
    } else {
      // No next step - workflow completed
      await this.complete();
    }
  }

  /**
   * Pause the workflow
   */
  public async pause(): Promise<void> {
    if (this._state !== WorkflowState.ACTIVE && this._state !== WorkflowState.EXECUTING) {
      throw new Error(`Cannot pause workflow in state ${this._state}`);
    }
    
    this._state = WorkflowState.PAUSED;
    this.addHistoryEntry('pause', 'Workflow paused', 'system');
  }

  /**
   * Resume the workflow
   */
  public async resume(): Promise<void> {
    if (this._state !== WorkflowState.PAUSED) {
      throw new Error(`Cannot resume workflow in state ${this._state}`);
    }
    
    this._state = WorkflowState.ACTIVE;
    this.addHistoryEntry('resume', 'Workflow resumed', 'system');
  }

  /**
   * Cancel the workflow
   */
  public async cancel(reason: string): Promise<void> {
    if (this._state === WorkflowState.COMPLETED || this._state === WorkflowState.CANCELLED) {
      throw new Error(`Cannot cancel workflow in state ${this._state}`);
    }
    
    this._state = WorkflowState.CANCELLED;
    this.completedAt = new Date();
    this.addHistoryEntry('cancel', `Workflow cancelled: ${reason}`, 'system');
  }

  /**
   * Complete the workflow
   */
  private async complete(): Promise<void> {
    this._state = WorkflowState.COMPLETED;
    this.completedAt = new Date();
    this._currentStepId = null;
    this.currentStep = undefined;
    
    this.addHistoryEntry('complete', 'Workflow completed successfully', 'system');
  }

  /**
   * Retry current step
   */
  public async retryCurrentStep(): Promise<void> {
    if (!this.currentStep) {
      throw new Error('No current step to retry');
    }
    
    if (this._state !== WorkflowState.FAILED) {
      throw new Error(`Cannot retry step in workflow state ${this._state}`);
    }
    
    const retryPolicy = this.currentStep.retryPolicy;
    if (!retryPolicy) {
      throw new Error('No retry policy defined for current step');
    }
    
    const execCount = this.stepExecutionCount.get(this.currentStep.id) || 0;
    if (execCount >= retryPolicy.maxAttempts) {
      throw new Error(`Maximum retry attempts (${retryPolicy.maxAttempts}) exceeded`);
    }
    
    // Calculate delay
    const delay = Math.min(
      retryPolicy.initialDelay * Math.pow(retryPolicy.backoffMultiplier, execCount),
      retryPolicy.maxDelay
    );
    
    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Reset state and retry
    this._state = WorkflowState.ACTIVE;
    this.currentStep.reset();
    
    this.addHistoryEntry(
      'retry',
      `Retrying step ${this.currentStep.name} (attempt ${execCount + 1})`,
      'system'
    );
    
    await this.executeCurrentStep();
  }

  /**
   * Check if deadline is approaching
   */
  public isDeadlineApproaching(thresholdMs: number = 86400000): boolean {
    if (!this.deadline) return false;
    
    const now = new Date();
    const timeUntilDeadline = this.deadline.getTime() - now.getTime();
    
    return timeUntilDeadline > 0 && timeUntilDeadline <= thresholdMs;
  }

  /**
   * Check if deadline is exceeded
   */
  public isDeadlineExceeded(): boolean {
    if (!this.deadline) return false;
    return new Date() > this.deadline;
  }

  /**
   * Add participant to workflow
   */
  public addParticipant(participant: IParticipant): void {
    this._context.setParticipant(participant);
    this.addHistoryEntry(
      'participant_added',
      `Participant ${participant.name} added as ${participant.role}`,
      'system'
    );
  }

  /**
   * Update participant status
   */
  public updateParticipantStatus(
    participantId: string,
    status: 'pending' | 'completed' | 'declined'
  ): void {
    const participant = this._context.getParticipant(participantId);
    if (!participant) {
      throw new Error(`Participant ${participantId} not found`);
    }
    
    const updatedParticipant: IParticipant = {
      ...participant,
      status,
      completedAt: status === 'completed' ? new Date() : undefined
    };
    
    this._context.setParticipant(updatedParticipant);
    this.addHistoryEntry(
      'participant_updated',
      `Participant ${participant.name} status changed to ${status}`,
      participantId
    );
  }

  /**
   * Add history entry helper
   */
  private addHistoryEntry(
    action: string,
    description: string,
    performedBy: string,
    result: 'success' | 'failure' | 'skipped' = 'success',
    data?: Record<string, any>
  ): void {
    const entry: IWorkflowHistoryEntry = {
      timestamp: new Date(),
      stepId: this._currentStepId || 'workflow',
      action,
      performedBy,
      result,
      data: { description, ...data }
    };
    
    this._context.addHistoryEntry(entry);
  }

  /**
   * Get workflow statistics
   */
  public getStatistics(): Record<string, any> {
    const totalSteps = this.workflow.getSteps().length;
    const executedSteps = this.stepExecutionCount.size;
    const averageExecutionTimes: Record<string, number> = {};
    
    this.stepExecutionTime.forEach((times, stepId) => {
      if (times.length > 0) {
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        averageExecutionTimes[stepId] = avg;
      }
    });
    
    return {
      totalSteps,
      executedSteps,
      completionRate: (executedSteps / totalSteps) * 100,
      averageExecutionTimes,
      totalExecutionTime: this.completedAt
        ? this.completedAt.getTime() - this.startedAt.getTime()
        : Date.now() - this.startedAt.getTime(),
      historyLength: this._context.history.length
    };
  }

  /**
   * Export instance as JSON
   */
  public toJSON(): Record<string, any> {
    return {
      id: this.id,
      workflowId: this.workflowId,
      documentId: this.documentId,
      state: this._state,
      currentStepId: this._currentStepId,
      priority: this.priority,
      startedAt: this.startedAt.toISOString(),
      completedAt: this.completedAt?.toISOString(),
      deadline: this.deadline?.toISOString(),
      context: this._context.toJSON(),
      statistics: this.getStatistics()
    };
  }
}