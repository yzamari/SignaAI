/**
 * Workflow Repository Implementation
 * Implements Repository pattern for data persistence
 */

import { injectable } from 'inversify';
import { IWorkflowRepository, IWorkflowDefinition } from '../interfaces/IWorkflow.interface';

/**
 * In-memory workflow repository
 * In production, this would use a database
 */
@injectable()
export class WorkflowRepository implements IWorkflowRepository {
  private workflows: Map<string, IWorkflowDefinition> = new Map();

  /**
   * Find workflow by ID
   */
  public async findById(id: string): Promise<IWorkflowDefinition | null> {
    const workflow = this.workflows.get(id);
    return workflow || null;
  }

  /**
   * Find workflows by name
   */
  public async findByName(name: string): Promise<IWorkflowDefinition[]> {
    const results: IWorkflowDefinition[] = [];
    
    for (const workflow of this.workflows.values()) {
      if (workflow.name.toLowerCase().includes(name.toLowerCase())) {
        results.push(workflow);
      }
    }
    
    return results;
  }

  /**
   * Save workflow
   */
  public async save(workflow: IWorkflowDefinition): Promise<void> {
    this.workflows.set(workflow.id, workflow);
  }

  /**
   * Update workflow
   */
  public async update(id: string, workflow: Partial<IWorkflowDefinition>): Promise<void> {
    const existing = this.workflows.get(id);
    if (!existing) {
      throw new Error(`Workflow ${id} not found`);
    }
    
    const updated = {
      ...existing,
      ...workflow,
      updatedAt: new Date()
    };
    
    this.workflows.set(id, updated);
  }

  /**
   * Delete workflow
   */
  public async delete(id: string): Promise<void> {
    if (!this.workflows.has(id)) {
      throw new Error(`Workflow ${id} not found`);
    }
    
    this.workflows.delete(id);
  }

  /**
   * Find template workflows
   */
  public async findTemplates(): Promise<IWorkflowDefinition[]> {
    const templates: IWorkflowDefinition[] = [];
    
    for (const workflow of this.workflows.values()) {
      if (workflow.isTemplate) {
        templates.push(workflow);
      }
    }
    
    return templates;
  }
}