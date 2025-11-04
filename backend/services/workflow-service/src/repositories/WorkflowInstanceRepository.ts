/**
 * Workflow Instance Repository Implementation
 * Manages persistence of workflow instances
 */

import { injectable } from 'inversify';
import {
  IWorkflowInstanceRepository,
  IWorkflowInstance
} from '../interfaces/IWorkflow.interface';
import { WorkflowState } from '../types/workflow.types';

/**
 * In-memory workflow instance repository
 * In production, this would use a database
 */
@injectable()
export class WorkflowInstanceRepository implements IWorkflowInstanceRepository {
  private instances: Map<string, IWorkflowInstance> = new Map();

  /**
   * Find instance by ID
   */
  public async findById(id: string): Promise<IWorkflowInstance | null> {
    const instance = this.instances.get(id);
    return instance || null;
  }

  /**
   * Find instances by workflow ID
   */
  public async findByWorkflowId(workflowId: string): Promise<IWorkflowInstance[]> {
    const results: IWorkflowInstance[] = [];
    
    for (const instance of this.instances.values()) {
      if (instance.workflowId === workflowId) {
        results.push(instance);
      }
    }
    
    return results;
  }

  /**
   * Find instance by document ID
   */
  public async findByDocumentId(documentId: string): Promise<IWorkflowInstance | null> {
    for (const instance of this.instances.values()) {
      if (instance.documentId === documentId) {
        return instance;
      }
    }
    
    return null;
  }

  /**
   * Save instance
   */
  public async save(instance: IWorkflowInstance): Promise<void> {
    this.instances.set(instance.id, instance);
  }

  /**
   * Update instance
   */
  public async update(id: string, instance: Partial<IWorkflowInstance>): Promise<void> {
    const existing = this.instances.get(id);
    if (!existing) {
      throw new Error(`Workflow instance ${id} not found`);
    }
    
    const updated = {
      ...existing,
      ...instance
    };
    
    this.instances.set(id, updated);
  }

  /**
   * Find active instances
   */
  public async findActive(): Promise<IWorkflowInstance[]> {
    const activeStates = [
      WorkflowState.ACTIVE,
      WorkflowState.EXECUTING,
      WorkflowState.PAUSED,
      WorkflowState.WAITING
    ];
    
    const results: IWorkflowInstance[] = [];
    
    for (const instance of this.instances.values()) {
      if (activeStates.includes(instance.state)) {
        results.push(instance);
      }
    }
    
    return results;
  }

  /**
   * Find instances by state
   */
  public async findByState(state: WorkflowState): Promise<IWorkflowInstance[]> {
    const results: IWorkflowInstance[] = [];
    
    for (const instance of this.instances.values()) {
      if (instance.state === state) {
        results.push(instance);
      }
    }
    
    return results;
  }
}