/**
 * Chain of Responsibility pattern for step execution
 * Each handler processes specific types of workflow steps
 */

import { injectable, inject } from 'inversify';
import { WorkflowStep } from '../models/WorkflowStep.model';
import { IWorkflowContext } from '../interfaces/IWorkflow.interface';
import { StepStatus } from '../types/workflow.types';
import axios, { AxiosInstance } from 'axios';

/**
 * Abstract handler in the chain
 * Single Responsibility: Process one type of step
 */
export abstract class StepExecutionHandler {
  protected nextHandler: StepExecutionHandler | null = null;

  /**
   * Set the next handler in the chain
   */
  public setNext(handler: StepExecutionHandler): StepExecutionHandler {
    this.nextHandler = handler;
    return handler;
  }

  /**
   * Handle the request or pass to next handler
   */
  public async handle(step: WorkflowStep, context: IWorkflowContext): Promise<void> {
    if (this.canHandle(step)) {
      await this.execute(step, context);
    } else if (this.nextHandler) {
      await this.nextHandler.handle(step, context);
    } else {
      throw new Error(`No handler found for step type: ${step.type}`);
    }
  }

  /**
   * Check if this handler can process the step
   */
  protected abstract canHandle(step: WorkflowStep): boolean;

  /**
   * Execute the step
   */
  protected abstract execute(step: WorkflowStep, context: IWorkflowContext): Promise<void>;

  /**
   * Common validation logic
   */
  protected validateContext(context: IWorkflowContext, requiredFields: string[]): void {
    for (const field of requiredFields) {
      const value = context.variables.get(field);
      if (value === undefined || value === null) {
        throw new Error(`Required field '${field}' not found in context`);
      }
    }
  }

  /**
   * Log execution
   */
  protected logExecution(stepName: string, message: string): void {
    console.log(`[${new Date().toISOString()}] ${stepName}: ${message}`);
  }
}

/**
 * Handler for signature steps
 */
@injectable()
export class SignatureStepHandler extends StepExecutionHandler {
  private signatureServiceClient: AxiosInstance;

  constructor() {
    super();
    this.signatureServiceClient = axios.create({
      baseURL: process.env.SIGNATURE_SERVICE_URL || 'http://localhost:3002',
      timeout: 30000
    });
  }

  protected canHandle(step: WorkflowStep): boolean {
    return step.type === 'sign';
  }

  protected async execute(step: WorkflowStep, context: IWorkflowContext): Promise<void> {
    this.logExecution(step.name, 'Starting signature step execution');
    
    // Validate required context
    this.validateContext(context, ['documentId']);
    
    const documentId = context.variables.get('documentId');
    const assignees = step.config.assignees || [];
    
    if (assignees.length === 0) {
      throw new Error('No assignees configured for signature step');
    }

    try {
      // Process each assignee
      for (const assigneeId of assignees) {
        const participant = context.participants.get(assigneeId);
        if (!participant) {
          throw new Error(`Participant ${assigneeId} not found`);
        }

        // Create signature request
        const signatureRequest = {
          documentId,
          signerId: participant.id,
          signerEmail: participant.email,
          signerName: participant.name,
          stepId: step.id,
          workflowInstanceId: context.variables.get('instanceId')
        };

        // Call signature service
        const response = await this.signatureServiceClient.post(
          '/api/signatures/request',
          signatureRequest
        );

        // Store signature request ID
        context.variables.set(`signatureRequest_${participant.id}`, response.data.requestId);
        
        this.logExecution(step.name, `Signature request created for ${participant.name}`);
      }

      // Update step status
      context.variables.set(`step_${step.id}_status`, StepStatus.IN_PROGRESS);
      
      this.logExecution(step.name, 'Signature step execution completed');
    } catch (error) {
      this.logExecution(step.name, `Signature step failed: ${(error as Error).message}`);
      throw error;
    }
  }
}

/**
 * Handler for approval steps
 */
@injectable()
export class ApprovalStepHandler extends StepExecutionHandler {
  protected canHandle(step: WorkflowStep): boolean {
    return step.type === 'approve';
  }

  protected async execute(step: WorkflowStep, context: IWorkflowContext): Promise<void> {
    this.logExecution(step.name, 'Starting approval step execution');
    
    // Validate required context
    this.validateContext(context, ['documentId']);
    
    const documentId = context.variables.get('documentId');
    const approvers = step.config.assignees || [];
    
    if (approvers.length === 0) {
      throw new Error('No approvers configured for approval step');
    }

    try {
      // Create approval tasks
      const approvalTasks: any[] = [];
      
      for (const approverId of approvers) {
        const participant = context.participants.get(approverId);
        if (!participant) {
          throw new Error(`Approver ${approverId} not found`);
        }

        const approvalTask = {
          id: `approval_${step.id}_${participant.id}`,
          documentId,
          approverId: participant.id,
          approverEmail: participant.email,
          approverName: participant.name,
          stepId: step.id,
          status: 'pending',
          createdAt: new Date()
        };

        approvalTasks.push(approvalTask);
        context.variables.set(`approvalTask_${participant.id}`, approvalTask);
        
        this.logExecution(step.name, `Approval task created for ${participant.name}`);
      }

      // Store approval tasks
      context.variables.set(`step_${step.id}_approvals`, approvalTasks);
      context.variables.set(`step_${step.id}_status`, StepStatus.IN_PROGRESS);
      
      this.logExecution(step.name, 'Approval step execution completed');
    } catch (error) {
      this.logExecution(step.name, `Approval step failed: ${(error as Error).message}`);
      throw error;
    }
  }
}

/**
 * Handler for notification steps
 */
@injectable()
export class NotificationStepHandler extends StepExecutionHandler {
  private notificationServiceClient: AxiosInstance;

  constructor() {
    super();
    this.notificationServiceClient = axios.create({
      baseURL: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3003',
      timeout: 10000
    });
  }

  protected canHandle(step: WorkflowStep): boolean {
    return step.type === 'notify';
  }

  protected async execute(step: WorkflowStep, context: IWorkflowContext): Promise<void> {
    this.logExecution(step.name, 'Starting notification step execution');
    
    const notificationConfig = step.config.notificationConfig;
    if (!notificationConfig) {
      throw new Error('Notification configuration is required');
    }

    try {
      // Prepare notification data
      const notificationData = {
        type: notificationConfig.type,
        template: notificationConfig.template,
        recipients: notificationConfig.recipients,
        context: {
          documentId: context.variables.get('documentId'),
          workflowName: context.metadata.workflowName,
          stepName: step.name,
          instanceId: context.variables.get('instanceId')
        }
      };

      // Handle scheduled notifications
      if (notificationConfig.schedule) {
        if (notificationConfig.schedule.delay) {
          notificationData['sendAfter'] = new Date(
            Date.now() + notificationConfig.schedule.delay
          ).toISOString();
        }
        
        if (notificationConfig.schedule.cronExpression) {
          notificationData['cronExpression'] = notificationConfig.schedule.cronExpression;
        }
      }

      // Send notification request
      const response = await this.notificationServiceClient.post(
        '/api/notifications/send',
        notificationData
      );

      // Store notification ID
      context.variables.set(`notification_${step.id}`, response.data.notificationId);
      
      this.logExecution(step.name, `Notification sent: ${response.data.notificationId}`);
      
      // Update step status
      context.variables.set(`step_${step.id}_status`, StepStatus.COMPLETED);
      
    } catch (error) {
      this.logExecution(step.name, `Notification step failed: ${(error as Error).message}`);
      throw error;
    }
  }
}

/**
 * Handler for conditional steps
 */
@injectable()
export class ConditionalStepHandler extends StepExecutionHandler {
  protected canHandle(step: WorkflowStep): boolean {
    return step.type === 'condition';
  }

  protected async execute(step: WorkflowStep, context: IWorkflowContext): Promise<void> {
    this.logExecution(step.name, 'Starting conditional step execution');
    
    const conditions = step.config.conditions || [];
    if (conditions.length === 0) {
      throw new Error('No conditions configured for conditional step');
    }

    try {
      // Evaluate conditions
      let selectedPath: string | null = null;
      
      for (const condition of conditions) {
        const fieldValue = this.getFieldValue(condition.field, context);
        const conditionMet = this.evaluateCondition(
          fieldValue,
          condition.operator,
          condition.value
        );
        
        if (conditionMet) {
          selectedPath = condition.nextStepId;
          this.logExecution(step.name, `Condition met: ${condition.field} ${condition.operator} ${condition.value}`);
          break;
        }
      }

      if (!selectedPath) {
        // Use default path if no condition met
        selectedPath = step.nextSteps[0] || null;
        this.logExecution(step.name, 'No condition met, using default path');
      }

      // Store selected path
      context.variables.set(`step_${step.id}_selectedPath`, selectedPath);
      context.variables.set(`step_${step.id}_status`, StepStatus.COMPLETED);
      
      this.logExecution(step.name, `Conditional step completed, selected path: ${selectedPath}`);
      
    } catch (error) {
      this.logExecution(step.name, `Conditional step failed: ${(error as Error).message}`);
      throw error;
    }
  }

  private getFieldValue(field: string, context: IWorkflowContext): any {
    // Handle nested field access with dot notation
    const parts = field.split('.');
    let value: any = context.variables.get(parts[0]);
    
    for (let i = 1; i < parts.length; i++) {
      if (value && typeof value === 'object') {
        value = value[parts[i]];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  private evaluateCondition(value: any, operator: string, expectedValue: any): boolean {
    switch (operator) {
      case 'equals':
        return value === expectedValue;
      case 'notEquals':
        return value !== expectedValue;
      case 'contains':
        return String(value).includes(String(expectedValue));
      case 'greaterThan':
        return Number(value) > Number(expectedValue);
      case 'lessThan':
        return Number(value) < Number(expectedValue);
      default:
        return false;
    }
  }
}

/**
 * Handler for parallel steps
 */
@injectable()
export class ParallelStepHandler extends StepExecutionHandler {
  protected canHandle(step: WorkflowStep): boolean {
    return step.type === 'parallel';
  }

  protected async execute(step: WorkflowStep, context: IWorkflowContext): Promise<void> {
    this.logExecution(step.name, 'Starting parallel step execution');
    
    const parallelSteps = step.config.parallelSteps || [];
    if (parallelSteps.length === 0) {
      throw new Error('No parallel steps configured');
    }

    try {
      // Mark parallel branches for execution
      const branches: any[] = [];
      
      for (const parallelStepId of parallelSteps) {
        const branch = {
          stepId: parallelStepId,
          status: 'pending',
          startedAt: null,
          completedAt: null
        };
        branches.push(branch);
        
        this.logExecution(step.name, `Parallel branch marked: ${parallelStepId}`);
      }

      // Store parallel execution info
      context.variables.set(`step_${step.id}_branches`, branches);
      context.variables.set(`step_${step.id}_status`, StepStatus.IN_PROGRESS);
      
      // The actual parallel execution would be handled by the workflow engine
      this.logExecution(step.name, `Parallel step prepared with ${branches.length} branches`);
      
    } catch (error) {
      this.logExecution(step.name, `Parallel step failed: ${(error as Error).message}`);
      throw error;
    }
  }
}

/**
 * Step execution chain builder
 * Builds and configures the chain of responsibility
 */
@injectable()
export class StepExecutionChainBuilder {
  private handlers: StepExecutionHandler[] = [];

  /**
   * Add a handler to the chain
   */
  public addHandler(handler: StepExecutionHandler): StepExecutionChainBuilder {
    this.handlers.push(handler);
    return this;
  }

  /**
   * Build the chain
   */
  public build(): StepExecutionHandler {
    if (this.handlers.length === 0) {
      throw new Error('No handlers added to the chain');
    }

    // Link handlers
    for (let i = 0; i < this.handlers.length - 1; i++) {
      this.handlers[i].setNext(this.handlers[i + 1]);
    }

    return this.handlers[0];
  }

  /**
   * Create default chain with all handlers
   */
  public static createDefaultChain(): StepExecutionHandler {
    return new StepExecutionChainBuilder()
      .addHandler(new SignatureStepHandler())
      .addHandler(new ApprovalStepHandler())
      .addHandler(new NotificationStepHandler())
      .addHandler(new ConditionalStepHandler())
      .addHandler(new ParallelStepHandler())
      .build();
  }
}