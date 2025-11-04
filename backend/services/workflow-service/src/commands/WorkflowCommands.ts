/**
 * Command pattern implementation for workflow actions
 * Encapsulates requests as objects for undo/redo and queueing
 */

import { injectable, inject } from 'inversify';
import { WorkflowInstance } from '../models/WorkflowInstance.model';
import { WorkflowStep } from '../models/WorkflowStep.model';
import { IWorkflowContext, IParticipant } from '../interfaces/IWorkflow.interface';
import { WorkflowState, CommandType } from '../types/workflow.types';
import { WorkflowStateMachine } from '../state-machines/WorkflowStateMachine';
import { StepExecutionChainBuilder } from '../handlers/StepExecutionChain';

/**
 * Abstract Command interface
 * Single Responsibility: Define command contract
 */
export interface ICommand {
  readonly id: string;
  readonly type: CommandType;
  readonly timestamp: Date;
  execute(): Promise<void>;
  undo(): Promise<void>;
  canExecute(): boolean;
  getDescription(): string;
}

/**
 * Abstract base command
 * Open/Closed Principle: Extended by specific commands
 */
export abstract class BaseCommand implements ICommand {
  public readonly id: string;
  public readonly timestamp: Date;
  protected executed: boolean = false;
  protected previousState: any;

  constructor(
    public readonly type: CommandType,
    protected workflowInstance: WorkflowInstance
  ) {
    this.id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.timestamp = new Date();
  }

  /**
   * Execute the command
   */
  public async execute(): Promise<void> {
    if (!this.canExecute()) {
      throw new Error(`Cannot execute command ${this.type} in current state`);
    }

    // Store state for undo
    this.previousState = this.captureState();
    
    try {
      await this.doExecute();
      this.executed = true;
      this.logExecution('executed');
    } catch (error) {
      this.logExecution('failed', (error as Error).message);
      throw error;
    }
  }

  /**
   * Undo the command
   */
  public async undo(): Promise<void> {
    if (!this.executed) {
      throw new Error(`Cannot undo command ${this.type} that was not executed`);
    }

    try {
      await this.doUndo();
      this.executed = false;
      this.logExecution('undone');
    } catch (error) {
      this.logExecution('undo failed', (error as Error).message);
      throw error;
    }
  }

  /**
   * Abstract methods for subclasses
   */
  protected abstract doExecute(): Promise<void>;
  protected abstract doUndo(): Promise<void>;
  protected abstract captureState(): any;

  /**
   * Check if command can be executed
   */
  public abstract canExecute(): boolean;

  /**
   * Get command description
   */
  public abstract getDescription(): string;

  /**
   * Log command execution
   */
  protected logExecution(action: string, details?: string): void {
    const message = `[Command ${this.id}] ${action}: ${this.getDescription()}`;
    if (details) {
      console.log(`${message} - ${details}`);
    } else {
      console.log(message);
    }
  }
}

/**
 * Start Workflow Command
 */
@injectable()
export class StartWorkflowCommand extends BaseCommand {
  constructor(
    workflowInstance: WorkflowInstance,
    private initialContext?: Record<string, any>
  ) {
    super(CommandType.START_WORKFLOW, workflowInstance);
  }

  public canExecute(): boolean {
    return this.workflowInstance.state === WorkflowState.DRAFT;
  }

  protected async doExecute(): Promise<void> {
    // Initialize context if provided
    if (this.initialContext) {
      Object.entries(this.initialContext).forEach(([key, value]) => {
        this.workflowInstance.context.variables.set(key, value);
      });
    }

    // Start the workflow
    await this.workflowInstance.start();
  }

  protected async doUndo(): Promise<void> {
    // Reset to draft state
    // Note: In real implementation, would need direct state manipulation
    throw new Error('Cannot undo workflow start - terminal action');
  }

  protected captureState(): any {
    return {
      state: this.workflowInstance.state,
      context: this.workflowInstance.context.toJSON()
    };
  }

  public getDescription(): string {
    return `Start workflow ${this.workflowInstance.id}`;
  }
}

/**
 * Execute Step Command
 */
@injectable()
export class ExecuteStepCommand extends BaseCommand {
  private stepExecutionHandler = StepExecutionChainBuilder.createDefaultChain();
  private executedStep?: WorkflowStep;

  constructor(
    workflowInstance: WorkflowInstance,
    private step: WorkflowStep
  ) {
    super(CommandType.EXECUTE_STEP, workflowInstance);
  }

  public canExecute(): boolean {
    return this.workflowInstance.state === WorkflowState.ACTIVE ||
           this.workflowInstance.state === WorkflowState.EXECUTING;
  }

  protected async doExecute(): Promise<void> {
    this.executedStep = this.step;
    
    // Execute step through chain of responsibility
    await this.stepExecutionHandler.handle(this.step, this.workflowInstance.context);
    
    // Update workflow instance
    await this.workflowInstance.executeCurrentStep();
  }

  protected async doUndo(): Promise<void> {
    if (!this.executedStep) {
      throw new Error('No executed step to undo');
    }

    // Reset step status
    this.executedStep.reset();
    
    // Restore previous context
    if (this.previousState) {
      // In real implementation, would restore context state
      console.log('Restoring previous context state');
    }
  }

  protected captureState(): any {
    return {
      stepId: this.step.id,
      stepStatus: this.step.status,
      context: this.workflowInstance.context.toJSON(),
      currentStepId: this.workflowInstance.currentStepId
    };
  }

  public getDescription(): string {
    return `Execute step ${this.step.name} (${this.step.id})`;
  }
}

/**
 * Pause Workflow Command
 */
@injectable()
export class PauseWorkflowCommand extends BaseCommand {
  constructor(workflowInstance: WorkflowInstance) {
    super(CommandType.PAUSE_WORKFLOW, workflowInstance);
  }

  public canExecute(): boolean {
    return this.workflowInstance.state === WorkflowState.ACTIVE ||
           this.workflowInstance.state === WorkflowState.EXECUTING;
  }

  protected async doExecute(): Promise<void> {
    await this.workflowInstance.pause();
  }

  protected async doUndo(): Promise<void> {
    await this.workflowInstance.resume();
  }

  protected captureState(): any {
    return {
      state: this.workflowInstance.state,
      timestamp: new Date()
    };
  }

  public getDescription(): string {
    return `Pause workflow ${this.workflowInstance.id}`;
  }
}

/**
 * Resume Workflow Command
 */
@injectable()
export class ResumeWorkflowCommand extends BaseCommand {
  constructor(workflowInstance: WorkflowInstance) {
    super(CommandType.RESUME_WORKFLOW, workflowInstance);
  }

  public canExecute(): boolean {
    return this.workflowInstance.state === WorkflowState.PAUSED;
  }

  protected async doExecute(): Promise<void> {
    await this.workflowInstance.resume();
  }

  protected async doUndo(): Promise<void> {
    await this.workflowInstance.pause();
  }

  protected captureState(): any {
    return {
      state: this.workflowInstance.state,
      pauseDuration: this.workflowInstance.context.variables.get('totalPauseDuration')
    };
  }

  public getDescription(): string {
    return `Resume workflow ${this.workflowInstance.id}`;
  }
}

/**
 * Cancel Workflow Command
 */
@injectable()
export class CancelWorkflowCommand extends BaseCommand {
  constructor(
    workflowInstance: WorkflowInstance,
    private reason: string
  ) {
    super(CommandType.CANCEL_WORKFLOW, workflowInstance);
  }

  public canExecute(): boolean {
    return this.workflowInstance.state !== WorkflowState.COMPLETED &&
           this.workflowInstance.state !== WorkflowState.CANCELLED;
  }

  protected async doExecute(): Promise<void> {
    await this.workflowInstance.cancel(this.reason);
  }

  protected async doUndo(): Promise<void> {
    // Cancellation is typically not undoable
    throw new Error('Cannot undo workflow cancellation - terminal action');
  }

  protected captureState(): any {
    return {
      state: this.workflowInstance.state,
      context: this.workflowInstance.context.toJSON()
    };
  }

  public getDescription(): string {
    return `Cancel workflow ${this.workflowInstance.id}: ${this.reason}`;
  }
}

/**
 * Retry Step Command
 */
@injectable()
export class RetryStepCommand extends BaseCommand {
  private retryCount: number = 0;

  constructor(
    workflowInstance: WorkflowInstance,
    private maxRetries: number = 3
  ) {
    super(CommandType.RETRY_STEP, workflowInstance);
  }

  public canExecute(): boolean {
    return this.workflowInstance.state === WorkflowState.FAILED &&
           this.retryCount < this.maxRetries;
  }

  protected async doExecute(): Promise<void> {
    this.retryCount++;
    await this.workflowInstance.retryCurrentStep();
  }

  protected async doUndo(): Promise<void> {
    this.retryCount--;
    // Restore failed state
    if (this.previousState) {
      // In real implementation, would restore state
      console.log('Restoring failed state');
    }
  }

  protected captureState(): any {
    return {
      state: this.workflowInstance.state,
      currentStepId: this.workflowInstance.currentStepId,
      retryCount: this.retryCount
    };
  }

  public getDescription(): string {
    return `Retry current step (attempt ${this.retryCount}/${this.maxRetries})`;
  }
}

/**
 * Update Context Command
 */
@injectable()
export class UpdateContextCommand extends BaseCommand {
  private previousValues: Map<string, any> = new Map();

  constructor(
    workflowInstance: WorkflowInstance,
    private updates: Map<string, any>
  ) {
    super(CommandType.UPDATE_CONTEXT, workflowInstance);
  }

  public canExecute(): boolean {
    // Context can be updated in most states except terminal ones
    return this.workflowInstance.state !== WorkflowState.COMPLETED &&
           this.workflowInstance.state !== WorkflowState.CANCELLED;
  }

  protected async doExecute(): Promise<void> {
    // Store previous values for undo
    this.updates.forEach((value, key) => {
      this.previousValues.set(key, this.workflowInstance.context.variables.get(key));
      this.workflowInstance.context.variables.set(key, value);
    });
  }

  protected async doUndo(): Promise<void> {
    // Restore previous values
    this.previousValues.forEach((value, key) => {
      if (value === undefined) {
        this.workflowInstance.context.variables.delete(key);
      } else {
        this.workflowInstance.context.variables.set(key, value);
      }
    });
  }

  protected captureState(): any {
    return {
      previousValues: Array.from(this.previousValues.entries())
    };
  }

  public getDescription(): string {
    const keys = Array.from(this.updates.keys()).join(', ');
    return `Update context variables: ${keys}`;
  }
}

/**
 * Macro Command - composite command
 * Composite pattern: Execute multiple commands as one
 */
@injectable()
export class MacroCommand implements ICommand {
  public readonly id: string;
  public readonly type: CommandType;
  public readonly timestamp: Date;
  private commands: ICommand[] = [];
  private executedCommands: ICommand[] = [];

  constructor(
    public readonly name: string,
    commands?: ICommand[]
  ) {
    this.id = `macro_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.type = CommandType.EXECUTE_STEP; // Default type
    this.timestamp = new Date();
    
    if (commands) {
      this.commands = commands;
    }
  }

  /**
   * Add a command to the macro
   */
  public addCommand(command: ICommand): void {
    this.commands.push(command);
  }

  /**
   * Execute all commands in order
   */
  public async execute(): Promise<void> {
    if (!this.canExecute()) {
      throw new Error('Cannot execute macro command');
    }

    this.executedCommands = [];
    
    for (const command of this.commands) {
      try {
        await command.execute();
        this.executedCommands.push(command);
      } catch (error) {
        // Rollback executed commands on failure
        await this.rollbackExecutedCommands();
        throw error;
      }
    }
  }

  /**
   * Undo all commands in reverse order
   */
  public async undo(): Promise<void> {
    const commandsToUndo = [...this.executedCommands].reverse();
    
    for (const command of commandsToUndo) {
      try {
        await command.undo();
      } catch (error) {
        console.error(`Failed to undo command: ${command.getDescription()}`, error);
        // Continue with other undos
      }
    }
    
    this.executedCommands = [];
  }

  /**
   * Check if all commands can execute
   */
  public canExecute(): boolean {
    return this.commands.every(cmd => cmd.canExecute());
  }

  /**
   * Get macro description
   */
  public getDescription(): string {
    return `Macro: ${this.name} (${this.commands.length} commands)`;
  }

  /**
   * Rollback executed commands on failure
   */
  private async rollbackExecutedCommands(): Promise<void> {
    const commandsToRollback = [...this.executedCommands].reverse();
    
    for (const command of commandsToRollback) {
      try {
        await command.undo();
      } catch (rollbackError) {
        console.error(`Rollback failed for command: ${command.getDescription()}`, rollbackError);
      }
    }
    
    this.executedCommands = [];
  }
}

/**
 * Command Invoker - manages command execution
 * Maintains command history for undo/redo
 */
@injectable()
export class CommandInvoker {
  private commandHistory: ICommand[] = [];
  private currentIndex: number = -1;
  private maxHistorySize: number = 100;

  /**
   * Execute a command
   */
  public async execute(command: ICommand): Promise<void> {
    await command.execute();
    
    // Remove any commands after current index (for redo consistency)
    this.commandHistory = this.commandHistory.slice(0, this.currentIndex + 1);
    
    // Add command to history
    this.commandHistory.push(command);
    this.currentIndex++;
    
    // Limit history size
    if (this.commandHistory.length > this.maxHistorySize) {
      this.commandHistory.shift();
      this.currentIndex--;
    }
    
    console.log(`Command executed: ${command.getDescription()}`);
  }

  /**
   * Undo last command
   */
  public async undo(): Promise<void> {
    if (!this.canUndo()) {
      throw new Error('No commands to undo');
    }

    const command = this.commandHistory[this.currentIndex];
    await command.undo();
    this.currentIndex--;
    
    console.log(`Command undone: ${command.getDescription()}`);
  }

  /**
   * Redo next command
   */
  public async redo(): Promise<void> {
    if (!this.canRedo()) {
      throw new Error('No commands to redo');
    }

    this.currentIndex++;
    const command = this.commandHistory[this.currentIndex];
    await command.execute();
    
    console.log(`Command redone: ${command.getDescription()}`);
  }

  /**
   * Check if can undo
   */
  public canUndo(): boolean {
    return this.currentIndex >= 0;
  }

  /**
   * Check if can redo
   */
  public canRedo(): boolean {
    return this.currentIndex < this.commandHistory.length - 1;
  }

  /**
   * Get command history
   */
  public getHistory(): ICommand[] {
    return [...this.commandHistory];
  }

  /**
   * Clear command history
   */
  public clearHistory(): void {
    this.commandHistory = [];
    this.currentIndex = -1;
  }
}