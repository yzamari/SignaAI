/**
 * Workflow Orchestration Service
 * Central service for managing workflow lifecycle and coordination
 * Follows Single Responsibility and Dependency Inversion principles
 */

import { injectable, inject } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import * as cron from 'node-cron';
import {
  BaseWorkflow,
  SequentialWorkflow,
  ParallelWorkflow,
  ConditionalWorkflow
} from '../models/Workflow.model';
import { WorkflowInstance } from '../models/WorkflowInstance.model';
import { WorkflowStep } from '../models/WorkflowStep.model';
import {
  IWorkflowRepository,
  IWorkflowInstanceRepository,
  IWorkflowDefinition,
  IWorkflowInstance,
  IParticipant
} from '../interfaces/IWorkflow.interface';
import {
  WorkflowState,
  WorkflowPriority,
  WorkflowEventType,
  DeadlineConfig
} from '../types/workflow.types';
import { WorkflowStateMachine } from '../state-machines/WorkflowStateMachine';
import { StepExecutionChainBuilder } from '../handlers/StepExecutionChain';
import {
  CommandInvoker,
  StartWorkflowCommand,
  ExecuteStepCommand,
  PauseWorkflowCommand,
  ResumeWorkflowCommand,
  CancelWorkflowCommand,
  RetryStepCommand,
  UpdateContextCommand
} from '../commands/WorkflowCommands';
import { SagaOrchestrator, SagaTemplates } from '../sagas/WorkflowSaga';

/**
 * Workflow orchestration service interface
 * Dependency Inversion: Depend on abstraction
 */
export interface IWorkflowOrchestrationService {
  createWorkflow(definition: Partial<IWorkflowDefinition>): Promise<BaseWorkflow>;
  startWorkflow(workflowId: string, documentId: string, context?: Record<string, any>): Promise<WorkflowInstance>;
  executeNextStep(instanceId: string): Promise<void>;
  pauseWorkflow(instanceId: string): Promise<void>;
  resumeWorkflow(instanceId: string): Promise<void>;
  cancelWorkflow(instanceId: string, reason: string): Promise<void>;
  retryFailedStep(instanceId: string): Promise<void>;
  getWorkflowStatus(instanceId: string): Promise<IWorkflowInstance>;
  scheduleDeadlineCheck(instanceId: string, deadline: Date): void;
  handleWorkflowEvent(instanceId: string, event: WorkflowEventType, data?: any): Promise<void>;
}

/**
 * Workflow orchestration service implementation
 */
@injectable()
export class WorkflowOrchestrationService implements IWorkflowOrchestrationService {
  private readonly activeInstances: Map<string, WorkflowInstance> = new Map();
  private readonly stateMachines: Map<string, WorkflowStateMachine> = new Map();
  private readonly commandInvokers: Map<string, CommandInvoker> = new Map();
  private readonly sagaOrchestrator: SagaOrchestrator = new SagaOrchestrator();
  private readonly scheduledTasks: Map<string, cron.ScheduledTask> = new Map();
  private readonly stepExecutionChain = StepExecutionChainBuilder.createDefaultChain();

  constructor(
    @inject('IWorkflowRepository') private workflowRepository: IWorkflowRepository,
    @inject('IWorkflowInstanceRepository') private instanceRepository: IWorkflowInstanceRepository
  ) {
    this.initializeService();
  }

  /**
   * Initialize the service
   */
  private initializeService(): void {
    console.log('Initializing Workflow Orchestration Service');
    this.startDeadlineMonitor();
    this.loadActiveInstances();
  }

  /**
   * Create a new workflow definition
   */
  public async createWorkflow(definition: Partial<IWorkflowDefinition>): Promise<BaseWorkflow> {
    // Create appropriate workflow type based on configuration
    let workflow: BaseWorkflow;
    
    if (definition.metadata?.type === 'parallel') {
      workflow = new ParallelWorkflow(
        definition.name || 'New Parallel Workflow',
        definition.description || '',
        definition.version
      );
    } else if (definition.metadata?.type === 'conditional') {
      workflow = new ConditionalWorkflow(
        definition.name || 'New Conditional Workflow',
        definition.description || '',
        definition.version
      );
    } else {
      workflow = new SequentialWorkflow(
        definition.name || 'New Sequential Workflow',
        definition.description || '',
        definition.version
      );
    }

    // Save to repository
    await this.workflowRepository.save(workflow);
    
    console.log(`Created workflow: ${workflow.id} (${workflow.name})`);
    return workflow;
  }

  /**
   * Start a workflow instance
   */
  public async startWorkflow(
    workflowId: string,
    documentId: string,
    context?: Record<string, any>
  ): Promise<WorkflowInstance> {
    console.log(`Starting workflow ${workflowId} for document ${documentId}`);
    
    // Load workflow definition
    const workflow = await this.workflowRepository.findById(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Create workflow instance
    const instance = new WorkflowInstance(
      workflowId,
      documentId,
      workflow as BaseWorkflow,
      context?.priority || WorkflowPriority.NORMAL,
      context?.deadline
    );

    // Initialize state machine
    const stateMachine = new WorkflowStateMachine();
    this.stateMachines.set(instance.id, stateMachine);

    // Initialize command invoker
    const commandInvoker = new CommandInvoker();
    this.commandInvokers.set(instance.id, commandInvoker);

    // Add participants if provided
    if (context?.participants) {
      for (const participant of context.participants) {
        instance.addParticipant(participant);
      }
    }

    // Execute start command
    const startCommand = new StartWorkflowCommand(instance, context);
    await commandInvoker.execute(startCommand);

    // Store active instance
    this.activeInstances.set(instance.id, instance);
    await this.instanceRepository.save(instance);

    // Schedule deadline check if deadline exists
    if (instance.deadline) {
      this.scheduleDeadlineCheck(instance.id, instance.deadline);
    }

    // Create saga for distributed operations
    if (context?.useSaga) {
      await this.executeSagaForWorkflow(instance, context);
    }

    console.log(`Started workflow instance: ${instance.id}`);
    return instance;
  }

  /**
   * Execute the next step in a workflow
   */
  public async executeNextStep(instanceId: string): Promise<void> {
    const instance = this.getActiveInstance(instanceId);
    const commandInvoker = this.getCommandInvoker(instanceId);
    
    if (!instance.currentStepId) {
      throw new Error('No current step to execute');
    }

    const workflow = await this.workflowRepository.findById(instance.workflowId);
    if (!workflow) {
      throw new Error('Workflow definition not found');
    }

    const currentStep = (workflow as BaseWorkflow).getStep(instance.currentStepId);
    if (!currentStep) {
      throw new Error('Current step not found in workflow');
    }

    // Execute step command
    const executeCommand = new ExecuteStepCommand(instance, currentStep);
    await commandInvoker.execute(executeCommand);

    // Update instance in repository
    await this.instanceRepository.update(instance.id, instance);

    // Check for workflow completion
    if (instance.state === WorkflowState.COMPLETED) {
      await this.handleWorkflowCompletion(instance);
    }
  }

  /**
   * Pause a workflow
   */
  public async pauseWorkflow(instanceId: string): Promise<void> {
    const instance = this.getActiveInstance(instanceId);
    const commandInvoker = this.getCommandInvoker(instanceId);
    
    const pauseCommand = new PauseWorkflowCommand(instance);
    await commandInvoker.execute(pauseCommand);
    
    await this.instanceRepository.update(instance.id, instance);
    console.log(`Paused workflow instance: ${instanceId}`);
  }

  /**
   * Resume a paused workflow
   */
  public async resumeWorkflow(instanceId: string): Promise<void> {
    const instance = this.getActiveInstance(instanceId);
    const commandInvoker = this.getCommandInvoker(instanceId);
    
    const resumeCommand = new ResumeWorkflowCommand(instance);
    await commandInvoker.execute(resumeCommand);
    
    await this.instanceRepository.update(instance.id, instance);
    console.log(`Resumed workflow instance: ${instanceId}`);
  }

  /**
   * Cancel a workflow
   */
  public async cancelWorkflow(instanceId: string, reason: string): Promise<void> {
    const instance = this.getActiveInstance(instanceId);
    const commandInvoker = this.getCommandInvoker(instanceId);
    
    const cancelCommand = new CancelWorkflowCommand(instance, reason);
    await commandInvoker.execute(cancelCommand);
    
    await this.instanceRepository.update(instance.id, instance);
    
    // Clean up
    this.cleanupInstance(instanceId);
    
    console.log(`Cancelled workflow instance: ${instanceId} - ${reason}`);
  }

  /**
   * Retry a failed step
   */
  public async retryFailedStep(instanceId: string): Promise<void> {
    const instance = this.getActiveInstance(instanceId);
    const commandInvoker = this.getCommandInvoker(instanceId);
    
    const retryCommand = new RetryStepCommand(instance);
    await commandInvoker.execute(retryCommand);
    
    await this.instanceRepository.update(instance.id, instance);
    console.log(`Retrying failed step for workflow instance: ${instanceId}`);
  }

  /**
   * Get workflow instance status
   */
  public async getWorkflowStatus(instanceId: string): Promise<IWorkflowInstance> {
    const instance = this.activeInstances.get(instanceId);
    if (instance) {
      return instance;
    }

    // Try loading from repository
    const storedInstance = await this.instanceRepository.findById(instanceId);
    if (!storedInstance) {
      throw new Error(`Workflow instance ${instanceId} not found`);
    }

    return storedInstance;
  }

  /**
   * Handle workflow events
   */
  public async handleWorkflowEvent(
    instanceId: string,
    event: WorkflowEventType,
    data?: any
  ): Promise<void> {
    const instance = this.getActiveInstance(instanceId);
    const stateMachine = this.stateMachines.get(instanceId);
    
    if (!stateMachine) {
      throw new Error(`State machine not found for instance ${instanceId}`);
    }

    console.log(`Handling event ${event} for instance ${instanceId}`);
    
    // Handle event in state machine
    await stateMachine.handleEvent(event, instance.context);
    
    // Update instance based on event
    switch (event) {
      case WorkflowEventType.STEP_COMPLETED:
        await this.executeNextStep(instanceId);
        break;
      
      case WorkflowEventType.STEP_FAILED:
        await this.handleStepFailure(instance, data);
        break;
      
      case WorkflowEventType.DEADLINE_APPROACHING:
        await this.handleDeadlineApproaching(instance);
        break;
      
      case WorkflowEventType.DEADLINE_EXCEEDED:
        await this.handleDeadlineExceeded(instance);
        break;
      
      default:
        console.log(`Event ${event} processed`);
    }
    
    await this.instanceRepository.update(instance.id, instance);
  }

  /**
   * Schedule deadline check for workflow
   */
  public scheduleDeadlineCheck(instanceId: string, deadline: Date): void {
    const now = new Date();
    const deadlineMs = deadline.getTime() - now.getTime();
    
    if (deadlineMs <= 0) {
      // Deadline already passed
      this.handleWorkflowEvent(instanceId, WorkflowEventType.DEADLINE_EXCEEDED);
      return;
    }

    // Schedule warning (e.g., 24 hours before deadline)
    const warningMs = deadlineMs - 86400000; // 24 hours
    if (warningMs > 0) {
      setTimeout(() => {
        this.handleWorkflowEvent(instanceId, WorkflowEventType.DEADLINE_APPROACHING);
      }, warningMs);
    }

    // Schedule deadline exceeded check
    setTimeout(() => {
      this.handleWorkflowEvent(instanceId, WorkflowEventType.DEADLINE_EXCEEDED);
    }, deadlineMs);
    
    console.log(`Scheduled deadline check for instance ${instanceId} at ${deadline}`);
  }

  /**
   * Private helper methods
   */

  private getActiveInstance(instanceId: string): WorkflowInstance {
    const instance = this.activeInstances.get(instanceId);
    if (!instance) {
      throw new Error(`Workflow instance ${instanceId} not found or not active`);
    }
    return instance;
  }

  private getCommandInvoker(instanceId: string): CommandInvoker {
    const invoker = this.commandInvokers.get(instanceId);
    if (!invoker) {
      throw new Error(`Command invoker not found for instance ${instanceId}`);
    }
    return invoker;
  }

  private async handleWorkflowCompletion(instance: WorkflowInstance): Promise<void> {
    console.log(`Workflow instance ${instance.id} completed`);
    
    // Send completion notifications
    await this.sendCompletionNotifications(instance);
    
    // Clean up resources
    this.cleanupInstance(instance.id);
    
    // Archive instance
    await this.archiveInstance(instance);
  }

  private async handleStepFailure(instance: WorkflowInstance, error?: any): Promise<void> {
    console.error(`Step failed for instance ${instance.id}`, error);
    
    // Check retry policy
    if (instance.currentStepId) {
      const workflow = await this.workflowRepository.findById(instance.workflowId);
      if (workflow) {
        const step = (workflow as BaseWorkflow).getStep(instance.currentStepId);
        if (step?.retryPolicy) {
          // Attempt retry
          try {
            await this.retryFailedStep(instance.id);
            return;
          } catch (retryError) {
            console.error('Retry failed', retryError);
          }
        }
      }
    }
    
    // Send failure notifications
    await this.sendFailureNotifications(instance, error);
  }

  private async handleDeadlineApproaching(instance: WorkflowInstance): Promise<void> {
    console.warn(`Deadline approaching for instance ${instance.id}`);
    
    // Send reminder notifications
    const participants = Array.from(instance.context.participants.values());
    const pendingParticipants = participants.filter(p => p.status === 'pending');
    
    if (pendingParticipants.length > 0) {
      // Send reminders to pending participants
      console.log(`Sending reminders to ${pendingParticipants.length} participants`);
    }
  }

  private async handleDeadlineExceeded(instance: WorkflowInstance): Promise<void> {
    console.error(`Deadline exceeded for instance ${instance.id}`);
    
    // Escalate or cancel based on configuration
    const escalationPolicy = instance.context.metadata.escalationPolicy;
    
    if (escalationPolicy?.defaultAction === 'cancel') {
      await this.cancelWorkflow(instance.id, 'Deadline exceeded');
    } else {
      // Escalate to managers/admins
      console.log('Escalating to management due to deadline breach');
    }
  }

  private async sendCompletionNotifications(instance: WorkflowInstance): Promise<void> {
    // Implementation would integrate with notification service
    console.log(`Sending completion notifications for instance ${instance.id}`);
  }

  private async sendFailureNotifications(instance: WorkflowInstance, error?: any): Promise<void> {
    // Implementation would integrate with notification service
    console.log(`Sending failure notifications for instance ${instance.id}`, error);
  }

  private cleanupInstance(instanceId: string): void {
    this.activeInstances.delete(instanceId);
    this.stateMachines.delete(instanceId);
    this.commandInvokers.delete(instanceId);
    
    // Cancel scheduled tasks
    const task = this.scheduledTasks.get(instanceId);
    if (task) {
      task.stop();
      this.scheduledTasks.delete(instanceId);
    }
  }

  private async archiveInstance(instance: WorkflowInstance): Promise<void> {
    // Archive completed instance
    console.log(`Archiving completed instance ${instance.id}`);
    // Implementation would move instance to archive storage
  }

  private async executeSagaForWorkflow(
    instance: WorkflowInstance,
    context: Record<string, any>
  ): Promise<void> {
    const saga = SagaTemplates.createDocumentSigningSaga();
    
    const sagaContext = {
      workflowInstanceId: instance.id,
      documentId: instance.documentId,
      ...context
    };
    
    const result = await this.sagaOrchestrator.executeSaga(saga.id, sagaContext);
    
    if (result.status === 'completed') {
      console.log(`Saga completed successfully for instance ${instance.id}`);
    } else {
      console.error(`Saga failed for instance ${instance.id}`, result.error);
    }
  }

  private startDeadlineMonitor(): void {
    // Monitor deadlines every minute
    const task = cron.schedule('* * * * *', async () => {
      for (const [instanceId, instance] of this.activeInstances) {
        if (instance.isDeadlineExceeded()) {
          await this.handleWorkflowEvent(instanceId, WorkflowEventType.DEADLINE_EXCEEDED);
        } else if (instance.isDeadlineApproaching()) {
          await this.handleWorkflowEvent(instanceId, WorkflowEventType.DEADLINE_APPROACHING);
        }
      }
    });
    
    task.start();
    console.log('Deadline monitor started');
  }

  private async loadActiveInstances(): Promise<void> {
    try {
      const activeInstances = await this.instanceRepository.findActive();
      
      for (const instanceData of activeInstances) {
        // Reconstruct instances and state machines
        // This would require proper deserialization logic
        console.log(`Loaded active instance: ${instanceData.id}`);
      }
      
      console.log(`Loaded ${activeInstances.length} active instances`);
    } catch (error) {
      console.error('Failed to load active instances', error);
    }
  }
}