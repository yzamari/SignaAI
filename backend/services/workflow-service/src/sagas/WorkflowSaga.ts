/**
 * Saga pattern implementation for distributed transactions
 * Manages complex multi-service operations with compensation logic
 */

import { injectable } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import { SagaStatus, ServiceType } from '../types/workflow.types';
import axios, { AxiosInstance } from 'axios';

/**
 * Saga step interface
 * Single Responsibility: Define a single transactional step
 */
export interface ISagaStep {
  readonly id: string;
  readonly name: string;
  readonly service: ServiceType;
  execute(context: SagaContext): Promise<any>;
  compensate(context: SagaContext): Promise<void>;
}

/**
 * Saga context for sharing data between steps
 */
export class SagaContext {
  private data: Map<string, any> = new Map();
  private stepResults: Map<string, any> = new Map();
  
  constructor(initialData?: Record<string, any>) {
    if (initialData) {
      Object.entries(initialData).forEach(([key, value]) => {
        this.data.set(key, value);
      });
    }
  }

  /**
   * Set context data
   */
  public set(key: string, value: any): void {
    this.data.set(key, value);
  }

  /**
   * Get context data
   */
  public get<T = any>(key: string): T | undefined {
    return this.data.get(key) as T;
  }

  /**
   * Store step result
   */
  public setStepResult(stepId: string, result: any): void {
    this.stepResults.set(stepId, result);
  }

  /**
   * Get step result
   */
  public getStepResult<T = any>(stepId: string): T | undefined {
    return this.stepResults.get(stepId) as T;
  }

  /**
   * Clone context
   */
  public clone(): SagaContext {
    const cloned = new SagaContext();
    this.data.forEach((value, key) => cloned.data.set(key, value));
    this.stepResults.forEach((value, key) => cloned.stepResults.set(key, value));
    return cloned;
  }
}

/**
 * Abstract base saga step
 * Open/Closed Principle: Extended by specific saga steps
 */
export abstract class BaseSagaStep implements ISagaStep {
  public readonly id: string;
  protected httpClient: AxiosInstance;

  constructor(
    public readonly name: string,
    public readonly service: ServiceType,
    protected serviceUrl: string
  ) {
    this.id = uuidv4();
    this.httpClient = axios.create({
      baseURL: serviceUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Execute the step
   */
  public abstract execute(context: SagaContext): Promise<any>;

  /**
   * Compensate the step (rollback)
   */
  public abstract compensate(context: SagaContext): Promise<void>;

  /**
   * Log step execution
   */
  protected log(action: string, details?: any): void {
    console.log(`[Saga Step ${this.name}] ${action}`, details || '');
  }

  /**
   * Handle HTTP errors
   */
  protected handleError(error: any): never {
    if (error.response) {
      throw new Error(`${this.service} error: ${error.response.status} - ${error.response.data?.message || 'Unknown error'}`);
    } else if (error.request) {
      throw new Error(`${this.service} unavailable: No response received`);
    } else {
      throw new Error(`${this.service} error: ${error.message}`);
    }
  }
}

/**
 * Document creation saga step
 */
@injectable()
export class CreateDocumentStep extends BaseSagaStep {
  constructor() {
    super(
      'Create Document',
      ServiceType.DOCUMENT_SERVICE,
      process.env.DOCUMENT_SERVICE_URL || 'http://localhost:3001'
    );
  }

  public async execute(context: SagaContext): Promise<any> {
    this.log('Executing');
    
    const documentData = context.get('documentData');
    if (!documentData) {
      throw new Error('Document data not found in context');
    }

    try {
      const response = await this.httpClient.post('/api/documents', documentData);
      const documentId = response.data.id;
      
      context.set('documentId', documentId);
      context.setStepResult(this.id, response.data);
      
      this.log('Completed', { documentId });
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  public async compensate(context: SagaContext): Promise<void> {
    this.log('Compensating');
    
    const documentId = context.get('documentId');
    if (!documentId) {
      this.log('No document to compensate');
      return;
    }

    try {
      await this.httpClient.delete(`/api/documents/${documentId}`);
      this.log('Compensated', { documentId });
    } catch (error) {
      this.log('Compensation failed', error);
      // Log but don't throw - compensation should be best effort
    }
  }
}

/**
 * Signature request creation saga step
 */
@injectable()
export class CreateSignatureRequestStep extends BaseSagaStep {
  constructor() {
    super(
      'Create Signature Request',
      ServiceType.SIGNATURE_SERVICE,
      process.env.SIGNATURE_SERVICE_URL || 'http://localhost:3002'
    );
  }

  public async execute(context: SagaContext): Promise<any> {
    this.log('Executing');
    
    const documentId = context.get('documentId');
    const signers = context.get('signers');
    
    if (!documentId || !signers) {
      throw new Error('Document ID and signers required');
    }

    try {
      const requests = [];
      const signatureRequestIds: string[] = [];
      
      for (const signer of signers as any[]) {
        const response = await this.httpClient.post('/api/signatures/request', {
          documentId,
          signerId: signer.id,
          signerEmail: signer.email,
          signerName: signer.name,
          workflowInstanceId: context.get('workflowInstanceId')
        });
        
        requests.push(response.data);
        signatureRequestIds.push(response.data.requestId);
      }
      
      context.set('signatureRequestIds', signatureRequestIds);
      context.setStepResult(this.id, requests);
      
      this.log('Completed', { count: requests.length });
      return requests;
    } catch (error) {
      this.handleError(error);
    }
  }

  public async compensate(context: SagaContext): Promise<void> {
    this.log('Compensating');
    
    const signatureRequestIds = context.get<string[]>('signatureRequestIds');
    if (!signatureRequestIds || signatureRequestIds.length === 0) {
      this.log('No signature requests to compensate');
      return;
    }

    for (const requestId of signatureRequestIds) {
      try {
        await this.httpClient.delete(`/api/signatures/request/${requestId}`);
        this.log('Compensated signature request', { requestId });
      } catch (error) {
        this.log('Compensation failed for signature request', { requestId, error });
      }
    }
  }
}

/**
 * Notification sending saga step
 */
@injectable()
export class SendNotificationStep extends BaseSagaStep {
  constructor() {
    super(
      'Send Notification',
      ServiceType.NOTIFICATION_SERVICE,
      process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3003'
    );
  }

  public async execute(context: SagaContext): Promise<any> {
    this.log('Executing');
    
    const notificationData = context.get('notificationData');
    if (!notificationData) {
      throw new Error('Notification data not found');
    }

    try {
      const response = await this.httpClient.post('/api/notifications/send', {
        ...notificationData,
        context: {
          documentId: context.get('documentId'),
          workflowInstanceId: context.get('workflowInstanceId'),
          timestamp: new Date().toISOString()
        }
      });
      
      const notificationId = response.data.notificationId;
      context.set('notificationId', notificationId);
      context.setStepResult(this.id, response.data);
      
      this.log('Completed', { notificationId });
      return response.data;
    } catch (error) {
      this.handleError(error);
    }
  }

  public async compensate(context: SagaContext): Promise<void> {
    this.log('Compensating');
    
    const notificationId = context.get('notificationId');
    if (!notificationId) {
      this.log('No notification to compensate');
      return;
    }

    try {
      // Cancel or mark notification as invalid
      await this.httpClient.post(`/api/notifications/${notificationId}/cancel`);
      this.log('Compensated', { notificationId });
    } catch (error) {
      this.log('Compensation failed', error);
    }
  }
}

/**
 * Audit log saga step
 */
@injectable()
export class CreateAuditLogStep extends BaseSagaStep {
  constructor() {
    super(
      'Create Audit Log',
      ServiceType.AUDIT_SERVICE,
      process.env.AUDIT_SERVICE_URL || 'http://localhost:3004'
    );
  }

  public async execute(context: SagaContext): Promise<any> {
    this.log('Executing');
    
    try {
      const auditData = {
        action: context.get('action') || 'workflow_execution',
        entityType: 'workflow',
        entityId: context.get('workflowInstanceId'),
        userId: context.get('userId'),
        metadata: {
          documentId: context.get('documentId'),
          stepResults: Array.from(context['stepResults'].entries())
        },
        timestamp: new Date().toISOString()
      };
      
      const response = await this.httpClient.post('/api/audit/log', auditData);
      
      context.set('auditLogId', response.data.id);
      context.setStepResult(this.id, response.data);
      
      this.log('Completed', { auditLogId: response.data.id });
      return response.data;
    } catch (error) {
      // Audit logging failure shouldn't fail the saga
      this.log('Failed but continuing', error);
      return null;
    }
  }

  public async compensate(context: SagaContext): Promise<void> {
    // Audit logs are typically not compensated
    this.log('No compensation needed for audit logs');
  }
}

/**
 * Saga execution result
 */
export interface ISagaExecutionResult {
  sagaId: string;
  status: SagaStatus;
  completedSteps: string[];
  compensatedSteps: string[];
  error?: Error;
  context: SagaContext;
}

/**
 * Saga orchestrator
 * Manages saga execution and compensation
 */
@injectable()
export class SagaOrchestrator {
  private readonly sagas: Map<string, Saga> = new Map();

  /**
   * Create a new saga
   */
  public createSaga(name: string, steps: ISagaStep[]): Saga {
    const saga = new Saga(name, steps);
    this.sagas.set(saga.id, saga);
    return saga;
  }

  /**
   * Execute a saga
   */
  public async executeSaga(sagaId: string, initialContext?: Record<string, any>): Promise<ISagaExecutionResult> {
    const saga = this.sagas.get(sagaId);
    if (!saga) {
      throw new Error(`Saga ${sagaId} not found`);
    }

    return await saga.execute(initialContext);
  }

  /**
   * Get saga by ID
   */
  public getSaga(sagaId: string): Saga | undefined {
    return this.sagas.get(sagaId);
  }

  /**
   * Remove completed saga
   */
  public removeSaga(sagaId: string): void {
    this.sagas.delete(sagaId);
  }
}

/**
 * Saga implementation
 * Encapsulates saga execution logic
 */
export class Saga {
  public readonly id: string;
  private status: SagaStatus = SagaStatus.PENDING;
  private completedSteps: ISagaStep[] = [];
  private context: SagaContext = new SagaContext();

  constructor(
    public readonly name: string,
    private readonly steps: ISagaStep[]
  ) {
    this.id = uuidv4();
  }

  /**
   * Execute the saga
   */
  public async execute(initialContext?: Record<string, any>): Promise<ISagaExecutionResult> {
    console.log(`[Saga ${this.name}] Starting execution`);
    
    this.status = SagaStatus.EXECUTING;
    this.context = new SagaContext(initialContext);
    this.completedSteps = [];
    
    try {
      // Execute steps in order
      for (const step of this.steps) {
        console.log(`[Saga ${this.name}] Executing step: ${step.name}`);
        
        try {
          const result = await step.execute(this.context);
          this.completedSteps.push(step);
          
          console.log(`[Saga ${this.name}] Step completed: ${step.name}`);
        } catch (stepError) {
          console.error(`[Saga ${this.name}] Step failed: ${step.name}`, stepError);
          
          // Begin compensation
          await this.compensate();
          
          this.status = SagaStatus.COMPENSATED;
          
          return {
            sagaId: this.id,
            status: this.status,
            completedSteps: this.completedSteps.map(s => s.id),
            compensatedSteps: this.completedSteps.map(s => s.id),
            error: stepError as Error,
            context: this.context
          };
        }
      }
      
      // All steps completed successfully
      this.status = SagaStatus.COMPLETED;
      console.log(`[Saga ${this.name}] Completed successfully`);
      
      return {
        sagaId: this.id,
        status: this.status,
        completedSteps: this.completedSteps.map(s => s.id),
        compensatedSteps: [],
        context: this.context
      };
      
    } catch (error) {
      console.error(`[Saga ${this.name}] Failed with error`, error);
      this.status = SagaStatus.FAILED;
      
      return {
        sagaId: this.id,
        status: this.status,
        completedSteps: this.completedSteps.map(s => s.id),
        compensatedSteps: [],
        error: error as Error,
        context: this.context
      };
    }
  }

  /**
   * Compensate completed steps in reverse order
   */
  private async compensate(): Promise<void> {
    console.log(`[Saga ${this.name}] Starting compensation`);
    this.status = SagaStatus.COMPENSATING;
    
    const stepsToCompensate = [...this.completedSteps].reverse();
    
    for (const step of stepsToCompensate) {
      try {
        console.log(`[Saga ${this.name}] Compensating step: ${step.name}`);
        await step.compensate(this.context);
        console.log(`[Saga ${this.name}] Step compensated: ${step.name}`);
      } catch (compensationError) {
        console.error(`[Saga ${this.name}] Compensation failed for step: ${step.name}`, compensationError);
        // Continue with other compensations
      }
    }
    
    console.log(`[Saga ${this.name}] Compensation completed`);
  }

  /**
   * Get saga status
   */
  public getStatus(): SagaStatus {
    return this.status;
  }

  /**
   * Get completed steps
   */
  public getCompletedSteps(): ISagaStep[] {
    return [...this.completedSteps];
  }
}

/**
 * Predefined saga templates
 */
export class SagaTemplates {
  /**
   * Create document signing saga
   */
  public static createDocumentSigningSaga(): Saga {
    const steps: ISagaStep[] = [
      new CreateDocumentStep(),
      new CreateSignatureRequestStep(),
      new SendNotificationStep(),
      new CreateAuditLogStep()
    ];
    
    return new Saga('Document Signing Saga', steps);
  }

  /**
   * Create approval workflow saga
   */
  public static createApprovalWorkflowSaga(): Saga {
    const steps: ISagaStep[] = [
      new CreateDocumentStep(),
      new SendNotificationStep(),
      new CreateAuditLogStep()
    ];
    
    return new Saga('Approval Workflow Saga', steps);
  }
}