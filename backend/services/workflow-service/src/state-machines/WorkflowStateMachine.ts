/**
 * State Machine implementation for workflow state management
 * Implements State pattern with proper encapsulation
 */

import { injectable, inject } from 'inversify';
import { WorkflowState, WorkflowEventType } from '../types/workflow.types';
import { IWorkflowContext, ITransitionGuard, ITransitionEffect } from '../interfaces/IWorkflow.interface';

/**
 * Abstract base class for workflow states
 * Single Responsibility: Handle state-specific behavior
 */
export abstract class WorkflowStateHandler {
  constructor(protected stateMachine: WorkflowStateMachine) {}

  /**
   * Handle state entry
   */
  public abstract onEnter(context: IWorkflowContext): Promise<void>;

  /**
   * Handle state exit
   */
  public abstract onExit(context: IWorkflowContext): Promise<void>;

  /**
   * Validate if transition is allowed from this state
   */
  public abstract canTransitionTo(targetState: WorkflowState): boolean;

  /**
   * Get allowed transitions from this state
   */
  public abstract getAllowedTransitions(): WorkflowState[];

  /**
   * Handle events in this state
   */
  public abstract handleEvent(event: WorkflowEventType, context: IWorkflowContext): Promise<void>;
}

/**
 * Draft state handler
 */
@injectable()
export class DraftStateHandler extends WorkflowStateHandler {
  public async onEnter(context: IWorkflowContext): Promise<void> {
    console.log('Entering DRAFT state');
    context.variables.set('enteredDraftAt', new Date());
  }

  public async onExit(context: IWorkflowContext): Promise<void> {
    console.log('Exiting DRAFT state');
  }

  public canTransitionTo(targetState: WorkflowState): boolean {
    return targetState === WorkflowState.ACTIVE || targetState === WorkflowState.CANCELLED;
  }

  public getAllowedTransitions(): WorkflowState[] {
    return [WorkflowState.ACTIVE, WorkflowState.CANCELLED];
  }

  public async handleEvent(event: WorkflowEventType, context: IWorkflowContext): Promise<void> {
    switch (event) {
      case WorkflowEventType.WORKFLOW_STARTED:
        await this.stateMachine.transitionTo(WorkflowState.ACTIVE, context);
        break;
      case WorkflowEventType.WORKFLOW_CANCELLED:
        await this.stateMachine.transitionTo(WorkflowState.CANCELLED, context);
        break;
      default:
        console.log(`Event ${event} not handled in DRAFT state`);
    }
  }
}

/**
 * Active state handler
 */
@injectable()
export class ActiveStateHandler extends WorkflowStateHandler {
  public async onEnter(context: IWorkflowContext): Promise<void> {
    console.log('Entering ACTIVE state');
    context.variables.set('activatedAt', new Date());
  }

  public async onExit(context: IWorkflowContext): Promise<void> {
    console.log('Exiting ACTIVE state');
  }

  public canTransitionTo(targetState: WorkflowState): boolean {
    const allowed = [
      WorkflowState.EXECUTING,
      WorkflowState.WAITING,
      WorkflowState.PAUSED,
      WorkflowState.COMPLETED,
      WorkflowState.FAILED,
      WorkflowState.CANCELLED
    ];
    return allowed.includes(targetState);
  }

  public getAllowedTransitions(): WorkflowState[] {
    return [
      WorkflowState.EXECUTING,
      WorkflowState.WAITING,
      WorkflowState.PAUSED,
      WorkflowState.COMPLETED,
      WorkflowState.FAILED,
      WorkflowState.CANCELLED
    ];
  }

  public async handleEvent(event: WorkflowEventType, context: IWorkflowContext): Promise<void> {
    switch (event) {
      case WorkflowEventType.STEP_STARTED:
        await this.stateMachine.transitionTo(WorkflowState.EXECUTING, context);
        break;
      case WorkflowEventType.WORKFLOW_PAUSED:
        await this.stateMachine.transitionTo(WorkflowState.PAUSED, context);
        break;
      case WorkflowEventType.WORKFLOW_COMPLETED:
        await this.stateMachine.transitionTo(WorkflowState.COMPLETED, context);
        break;
      case WorkflowEventType.WORKFLOW_FAILED:
        await this.stateMachine.transitionTo(WorkflowState.FAILED, context);
        break;
      case WorkflowEventType.WORKFLOW_CANCELLED:
        await this.stateMachine.transitionTo(WorkflowState.CANCELLED, context);
        break;
      default:
        console.log(`Event ${event} not handled in ACTIVE state`);
    }
  }
}

/**
 * Executing state handler
 */
@injectable()
export class ExecutingStateHandler extends WorkflowStateHandler {
  public async onEnter(context: IWorkflowContext): Promise<void> {
    console.log('Entering EXECUTING state');
    context.variables.set('executionStartedAt', new Date());
  }

  public async onExit(context: IWorkflowContext): Promise<void> {
    console.log('Exiting EXECUTING state');
    const startTime = context.variables.get('executionStartedAt') as Date;
    if (startTime) {
      const duration = Date.now() - startTime.getTime();
      context.variables.set('lastExecutionDuration', duration);
    }
  }

  public canTransitionTo(targetState: WorkflowState): boolean {
    const allowed = [
      WorkflowState.ACTIVE,
      WorkflowState.WAITING,
      WorkflowState.FAILED,
      WorkflowState.CANCELLED
    ];
    return allowed.includes(targetState);
  }

  public getAllowedTransitions(): WorkflowState[] {
    return [
      WorkflowState.ACTIVE,
      WorkflowState.WAITING,
      WorkflowState.FAILED,
      WorkflowState.CANCELLED
    ];
  }

  public async handleEvent(event: WorkflowEventType, context: IWorkflowContext): Promise<void> {
    switch (event) {
      case WorkflowEventType.STEP_COMPLETED:
        await this.stateMachine.transitionTo(WorkflowState.ACTIVE, context);
        break;
      case WorkflowEventType.STEP_FAILED:
        await this.stateMachine.transitionTo(WorkflowState.FAILED, context);
        break;
      case WorkflowEventType.WORKFLOW_CANCELLED:
        await this.stateMachine.transitionTo(WorkflowState.CANCELLED, context);
        break;
      default:
        console.log(`Event ${event} not handled in EXECUTING state`);
    }
  }
}

/**
 * Paused state handler
 */
@injectable()
export class PausedStateHandler extends WorkflowStateHandler {
  public async onEnter(context: IWorkflowContext): Promise<void> {
    console.log('Entering PAUSED state');
    context.variables.set('pausedAt', new Date());
  }

  public async onExit(context: IWorkflowContext): Promise<void> {
    console.log('Exiting PAUSED state');
    const pausedAt = context.variables.get('pausedAt') as Date;
    if (pausedAt) {
      const pauseDuration = Date.now() - pausedAt.getTime();
      const totalPause = (context.variables.get('totalPauseDuration') || 0) + pauseDuration;
      context.variables.set('totalPauseDuration', totalPause);
    }
  }

  public canTransitionTo(targetState: WorkflowState): boolean {
    return targetState === WorkflowState.ACTIVE || targetState === WorkflowState.CANCELLED;
  }

  public getAllowedTransitions(): WorkflowState[] {
    return [WorkflowState.ACTIVE, WorkflowState.CANCELLED];
  }

  public async handleEvent(event: WorkflowEventType, context: IWorkflowContext): Promise<void> {
    switch (event) {
      case WorkflowEventType.WORKFLOW_RESUMED:
        await this.stateMachine.transitionTo(WorkflowState.ACTIVE, context);
        break;
      case WorkflowEventType.WORKFLOW_CANCELLED:
        await this.stateMachine.transitionTo(WorkflowState.CANCELLED, context);
        break;
      default:
        console.log(`Event ${event} not handled in PAUSED state`);
    }
  }
}

/**
 * Failed state handler
 */
@injectable()
export class FailedStateHandler extends WorkflowStateHandler {
  public async onEnter(context: IWorkflowContext): Promise<void> {
    console.log('Entering FAILED state');
    context.variables.set('failedAt', new Date());
  }

  public async onExit(context: IWorkflowContext): Promise<void> {
    console.log('Exiting FAILED state');
  }

  public canTransitionTo(targetState: WorkflowState): boolean {
    return targetState === WorkflowState.ACTIVE || 
           targetState === WorkflowState.CANCELLED ||
           targetState === WorkflowState.ROLLED_BACK;
  }

  public getAllowedTransitions(): WorkflowState[] {
    return [WorkflowState.ACTIVE, WorkflowState.CANCELLED, WorkflowState.ROLLED_BACK];
  }

  public async handleEvent(event: WorkflowEventType, context: IWorkflowContext): Promise<void> {
    switch (event) {
      case WorkflowEventType.WORKFLOW_RESUMED:
        await this.stateMachine.transitionTo(WorkflowState.ACTIVE, context);
        break;
      case WorkflowEventType.WORKFLOW_CANCELLED:
        await this.stateMachine.transitionTo(WorkflowState.CANCELLED, context);
        break;
      default:
        console.log(`Event ${event} not handled in FAILED state`);
    }
  }
}

/**
 * Completed state handler
 */
@injectable()
export class CompletedStateHandler extends WorkflowStateHandler {
  public async onEnter(context: IWorkflowContext): Promise<void> {
    console.log('Entering COMPLETED state');
    context.variables.set('completedAt', new Date());
    
    // Calculate total execution time
    const startedAt = context.variables.get('activatedAt') as Date;
    if (startedAt) {
      const totalTime = Date.now() - startedAt.getTime();
      const pauseDuration = context.variables.get('totalPauseDuration') || 0;
      context.variables.set('netExecutionTime', totalTime - pauseDuration);
    }
  }

  public async onExit(context: IWorkflowContext): Promise<void> {
    // Completed is a terminal state
    throw new Error('Cannot transition from COMPLETED state');
  }

  public canTransitionTo(targetState: WorkflowState): boolean {
    return false; // Terminal state
  }

  public getAllowedTransitions(): WorkflowState[] {
    return [];
  }

  public async handleEvent(event: WorkflowEventType, context: IWorkflowContext): Promise<void> {
    console.log(`Event ${event} ignored in COMPLETED state (terminal state)`);
  }
}

/**
 * Cancelled state handler
 */
@injectable()
export class CancelledStateHandler extends WorkflowStateHandler {
  public async onEnter(context: IWorkflowContext): Promise<void> {
    console.log('Entering CANCELLED state');
    context.variables.set('cancelledAt', new Date());
  }

  public async onExit(context: IWorkflowContext): Promise<void> {
    // Cancelled is a terminal state
    throw new Error('Cannot transition from CANCELLED state');
  }

  public canTransitionTo(targetState: WorkflowState): boolean {
    return false; // Terminal state
  }

  public getAllowedTransitions(): WorkflowState[] {
    return [];
  }

  public async handleEvent(event: WorkflowEventType, context: IWorkflowContext): Promise<void> {
    console.log(`Event ${event} ignored in CANCELLED state (terminal state)`);
  }
}

/**
 * State transition
 */
export interface StateTransition {
  from: WorkflowState;
  to: WorkflowState;
  guards: ITransitionGuard[];
  effects: ITransitionEffect[];
}

/**
 * Workflow State Machine
 * Manages state transitions with guards and effects
 */
@injectable()
export class WorkflowStateMachine {
  private currentState: WorkflowState;
  private stateHandlers: Map<WorkflowState, WorkflowStateHandler>;
  private transitions: Map<string, StateTransition>;
  private transitionHistory: Array<{ from: WorkflowState; to: WorkflowState; timestamp: Date }>;

  constructor() {
    this.currentState = WorkflowState.DRAFT;
    this.stateHandlers = new Map();
    this.transitions = new Map();
    this.transitionHistory = [];
    
    this.initializeStateHandlers();
    this.initializeTransitions();
  }

  /**
   * Initialize state handlers
   */
  private initializeStateHandlers(): void {
    this.stateHandlers.set(WorkflowState.DRAFT, new DraftStateHandler(this));
    this.stateHandlers.set(WorkflowState.ACTIVE, new ActiveStateHandler(this));
    this.stateHandlers.set(WorkflowState.EXECUTING, new ExecutingStateHandler(this));
    this.stateHandlers.set(WorkflowState.PAUSED, new PausedStateHandler(this));
    this.stateHandlers.set(WorkflowState.FAILED, new FailedStateHandler(this));
    this.stateHandlers.set(WorkflowState.COMPLETED, new CompletedStateHandler(this));
    this.stateHandlers.set(WorkflowState.CANCELLED, new CancelledStateHandler(this));
  }

  /**
   * Initialize valid transitions
   */
  private initializeTransitions(): void {
    // Define all valid state transitions
    this.addTransition(WorkflowState.DRAFT, WorkflowState.ACTIVE);
    this.addTransition(WorkflowState.DRAFT, WorkflowState.CANCELLED);
    
    this.addTransition(WorkflowState.ACTIVE, WorkflowState.EXECUTING);
    this.addTransition(WorkflowState.ACTIVE, WorkflowState.PAUSED);
    this.addTransition(WorkflowState.ACTIVE, WorkflowState.COMPLETED);
    this.addTransition(WorkflowState.ACTIVE, WorkflowState.FAILED);
    this.addTransition(WorkflowState.ACTIVE, WorkflowState.CANCELLED);
    
    this.addTransition(WorkflowState.EXECUTING, WorkflowState.ACTIVE);
    this.addTransition(WorkflowState.EXECUTING, WorkflowState.FAILED);
    this.addTransition(WorkflowState.EXECUTING, WorkflowState.CANCELLED);
    
    this.addTransition(WorkflowState.PAUSED, WorkflowState.ACTIVE);
    this.addTransition(WorkflowState.PAUSED, WorkflowState.CANCELLED);
    
    this.addTransition(WorkflowState.FAILED, WorkflowState.ACTIVE);
    this.addTransition(WorkflowState.FAILED, WorkflowState.CANCELLED);
    this.addTransition(WorkflowState.FAILED, WorkflowState.ROLLED_BACK);
  }

  /**
   * Add a transition
   */
  private addTransition(
    from: WorkflowState,
    to: WorkflowState,
    guards: ITransitionGuard[] = [],
    effects: ITransitionEffect[] = []
  ): void {
    const key = `${from}->${to}`;
    this.transitions.set(key, { from, to, guards, effects });
  }

  /**
   * Get current state
   */
  public getCurrentState(): WorkflowState {
    return this.currentState;
  }

  /**
   * Transition to new state
   */
  public async transitionTo(targetState: WorkflowState, context: IWorkflowContext): Promise<void> {
    const transitionKey = `${this.currentState}->${targetState}`;
    const transition = this.transitions.get(transitionKey);
    
    if (!transition) {
      throw new Error(`Invalid transition from ${this.currentState} to ${targetState}`);
    }
    
    // Validate guards
    for (const guard of transition.guards) {
      if (!guard.validate(context)) {
        throw new Error(guard.getErrorMessage());
      }
    }
    
    const currentHandler = this.stateHandlers.get(this.currentState);
    const targetHandler = this.stateHandlers.get(targetState);
    
    if (!currentHandler || !targetHandler) {
      throw new Error('State handler not found');
    }
    
    try {
      // Exit current state
      await currentHandler.onExit(context);
      
      // Execute transition effects
      for (const effect of transition.effects) {
        await effect.execute(context);
      }
      
      // Update state
      const previousState = this.currentState;
      this.currentState = targetState;
      
      // Record transition
      this.transitionHistory.push({
        from: previousState,
        to: targetState,
        timestamp: new Date()
      });
      
      // Enter new state
      await targetHandler.onEnter(context);
      
    } catch (error) {
      // Rollback effects on error
      for (const effect of transition.effects.reverse()) {
        try {
          await effect.rollback(context);
        } catch (rollbackError) {
          console.error('Effect rollback failed:', rollbackError);
        }
      }
      throw error;
    }
  }

  /**
   * Handle event
   */
  public async handleEvent(event: WorkflowEventType, context: IWorkflowContext): Promise<void> {
    const handler = this.stateHandlers.get(this.currentState);
    if (!handler) {
      throw new Error(`No handler for state ${this.currentState}`);
    }
    
    await handler.handleEvent(event, context);
  }

  /**
   * Get transition history
   */
  public getTransitionHistory(): Array<{ from: WorkflowState; to: WorkflowState; timestamp: Date }> {
    return [...this.transitionHistory];
  }

  /**
   * Reset state machine
   */
  public reset(): void {
    this.currentState = WorkflowState.DRAFT;
    this.transitionHistory = [];
  }
}