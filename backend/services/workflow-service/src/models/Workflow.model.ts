/**
 * Workflow domain model
 * Follows Single Responsibility Principle - manages workflow definition only
 */

import { v4 as uuidv4 } from 'uuid';
import {
  IWorkflowDefinition,
  IWorkflowStep,
  IWorkflowRepository
} from '../interfaces/IWorkflow.interface';
import { WorkflowMetadata } from '../types/workflow.types';
import { WorkflowStep } from './WorkflowStep.model';
import { injectable } from 'inversify';

/**
 * Abstract base class for workflows
 * Open/Closed Principle: Open for extension, closed for modification
 */
@injectable()
export abstract class BaseWorkflow implements IWorkflowDefinition {
  public readonly id: string;
  public readonly createdAt: Date;
  public updatedAt: Date;
  protected steps: Map<string, WorkflowStep>;
  protected _metadata: WorkflowMetadata;

  constructor(
    public readonly name: string,
    public readonly description: string,
    public readonly version: string = '1.0.0',
    public readonly isTemplate: boolean = false
  ) {
    this.id = uuidv4();
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.steps = new Map();
    this._metadata = this.initializeMetadata();
  }

  /**
   * Template Method pattern - subclasses define metadata initialization
   */
  protected abstract initializeMetadata(): WorkflowMetadata;

  /**
   * Add a step to the workflow
   */
  public addStep(step: WorkflowStep): void {
    this.validateStep(step);
    this.steps.set(step.id, step);
    this.updatedAt = new Date();
  }

  /**
   * Remove a step from the workflow
   */
  public removeStep(stepId: string): void {
    if (!this.steps.has(stepId)) {
      throw new Error(`Step ${stepId} not found in workflow`);
    }
    
    // Remove references to this step from other steps
    this.steps.forEach(step => {
      step.removeNextStep(stepId);
    });
    
    this.steps.delete(stepId);
    this.updatedAt = new Date();
  }

  /**
   * Get a step by ID
   */
  public getStep(stepId: string): WorkflowStep | undefined {
    return this.steps.get(stepId);
  }

  /**
   * Get all steps
   */
  public getSteps(): WorkflowStep[] {
    return Array.from(this.steps.values());
  }

  /**
   * Find the starting step(s) of the workflow
   */
  public getStartingSteps(): WorkflowStep[] {
    const referencedSteps = new Set<string>();
    
    this.steps.forEach(step => {
      step.nextSteps.forEach(nextId => referencedSteps.add(nextId));
    });
    
    return Array.from(this.steps.values()).filter(
      step => !referencedSteps.has(step.id)
    );
  }

  /**
   * Validate workflow structure
   */
  public validate(): void {
    this.validateStructure();
    this.validateStepReferences();
    this.validateNoCycles();
  }

  /**
   * Clone the workflow (for creating instances from templates)
   */
  public clone(): BaseWorkflow {
    const ClonedClass = this.constructor as new (
      name: string,
      description: string,
      version: string,
      isTemplate: boolean
    ) => BaseWorkflow;
    
    const cloned = new ClonedClass(
      `${this.name} (Copy)`,
      this.description,
      this.version,
      false
    );
    
    // Deep clone steps
    this.steps.forEach(step => {
      cloned.addStep(step.clone());
    });
    
    return cloned;
  }

  /**
   * Get workflow metadata
   */
  public get metadata(): Record<string, any> {
    return { ...this._metadata };
  }

  /**
   * Update workflow metadata
   */
  public updateMetadata(metadata: Partial<WorkflowMetadata>): void {
    this._metadata = { ...this._metadata, ...metadata };
    this.updatedAt = new Date();
  }

  /**
   * Protected validation methods
   */
  protected validateStep(step: WorkflowStep): void {
    if (!step.id || !step.name || !step.type) {
      throw new Error('Invalid step configuration');
    }
    
    if (this.steps.has(step.id)) {
      throw new Error(`Step with ID ${step.id} already exists`);
    }
  }

  protected validateStructure(): void {
    if (this.steps.size === 0) {
      throw new Error('Workflow must have at least one step');
    }
    
    const startingSteps = this.getStartingSteps();
    if (startingSteps.length === 0) {
      throw new Error('Workflow must have at least one starting step');
    }
  }

  protected validateStepReferences(): void {
    this.steps.forEach(step => {
      step.nextSteps.forEach(nextId => {
        if (!this.steps.has(nextId)) {
          throw new Error(`Step ${step.id} references non-existent step ${nextId}`);
        }
      });
    });
  }

  protected validateNoCycles(): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const hasCycle = (stepId: string): boolean => {
      visited.add(stepId);
      recursionStack.add(stepId);
      
      const step = this.steps.get(stepId);
      if (!step) return false;
      
      for (const nextId of step.nextSteps) {
        if (!visited.has(nextId)) {
          if (hasCycle(nextId)) return true;
        } else if (recursionStack.has(nextId)) {
          return true;
        }
      }
      
      recursionStack.delete(stepId);
      return false;
    };
    
    for (const step of this.steps.values()) {
      if (!visited.has(step.id)) {
        if (hasCycle(step.id)) {
          throw new Error('Workflow contains cycles');
        }
      }
    }
  }

  /**
   * Export workflow as JSON
   */
  public toJSON(): Record<string, any> {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      version: this.version,
      isTemplate: this.isTemplate,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      metadata: this.metadata,
      steps: Array.from(this.steps.values()).map(step => step.toJSON())
    };
  }
}

/**
 * Sequential workflow implementation
 */
@injectable()
export class SequentialWorkflow extends BaseWorkflow {
  protected initializeMetadata(): WorkflowMetadata {
    return {
      tags: ['sequential'],
      category: 'standard',
      owner: 'system',
      complianceLevel: 'standard'
    };
  }

  /**
   * Build a sequential chain of steps
   */
  public buildSequentialChain(steps: WorkflowStep[]): void {
    if (steps.length === 0) return;
    
    for (let i = 0; i < steps.length; i++) {
      this.addStep(steps[i]);
      
      if (i < steps.length - 1) {
        steps[i].addNextStep(steps[i + 1].id);
      }
    }
  }
}

/**
 * Parallel workflow implementation
 */
@injectable()
export class ParallelWorkflow extends BaseWorkflow {
  protected initializeMetadata(): WorkflowMetadata {
    return {
      tags: ['parallel'],
      category: 'advanced',
      owner: 'system',
      complianceLevel: 'standard'
    };
  }

  /**
   * Create parallel branches
   */
  public createParallelBranches(
    startStep: WorkflowStep,
    branches: WorkflowStep[][],
    endStep: WorkflowStep
  ): void {
    this.addStep(startStep);
    
    branches.forEach(branch => {
      if (branch.length > 0) {
        startStep.addNextStep(branch[0].id);
        
        for (let i = 0; i < branch.length; i++) {
          this.addStep(branch[i]);
          
          if (i < branch.length - 1) {
            branch[i].addNextStep(branch[i + 1].id);
          } else {
            branch[i].addNextStep(endStep.id);
          }
        }
      }
    });
    
    this.addStep(endStep);
  }
}

/**
 * Conditional workflow implementation
 */
@injectable()
export class ConditionalWorkflow extends BaseWorkflow {
  protected initializeMetadata(): WorkflowMetadata {
    return {
      tags: ['conditional', 'dynamic'],
      category: 'advanced',
      owner: 'system',
      complianceLevel: 'high'
    };
  }

  /**
   * Add conditional branching
   */
  public addConditionalBranch(
    decisionStep: WorkflowStep,
    conditions: Map<string, WorkflowStep>
  ): void {
    this.addStep(decisionStep);
    
    conditions.forEach((targetStep, condition) => {
      this.addStep(targetStep);
      decisionStep.addConditionalNext(condition, targetStep.id);
    });
  }
}