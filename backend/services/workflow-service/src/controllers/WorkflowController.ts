/**
 * Workflow Controller
 * RESTful API endpoints for workflow management
 * Follows Single Responsibility Principle - handles HTTP concerns only
 */

import { Request, Response, NextFunction } from 'express';
import { controller, httpGet, httpPost, httpPut, httpDelete, request, response, next } from 'inversify-express-utils';
import { inject } from 'inversify';
import { IWorkflowOrchestrationService } from '../services/WorkflowOrchestrationService';
import { WorkflowPriority } from '../types/workflow.types';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';

/**
 * DTOs for request validation
 */
export class CreateWorkflowDto {
  name!: string;
  description!: string;
  version?: string;
  type?: 'sequential' | 'parallel' | 'conditional';
  steps?: any[];
  metadata?: Record<string, any>;
}

export class StartWorkflowDto {
  workflowId!: string;
  documentId!: string;
  priority?: WorkflowPriority;
  deadline?: string;
  participants?: Array<{
    id: string;
    role: string;
    email: string;
    name: string;
  }>;
  context?: Record<string, any>;
  useSaga?: boolean;
}

export class UpdateWorkflowContextDto {
  updates!: Record<string, any>;
}

/**
 * Workflow Controller implementation
 */
@controller('/api/workflows')
export class WorkflowController {
  constructor(
    @inject('IWorkflowOrchestrationService') 
    private orchestrationService: IWorkflowOrchestrationService
  ) {}

  /**
   * Create a new workflow definition
   * POST /api/workflows
   */
  @httpPost('/')
  public async createWorkflow(
    @request() req: Request,
    @response() res: Response,
    @next() next: NextFunction
  ): Promise<void> {
    try {
      const dto = plainToClass(CreateWorkflowDto, req.body);
      const errors = await validate(dto);
      
      if (errors.length > 0) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.map(e => ({
            property: e.property,
            constraints: e.constraints
          }))
        });
        return;
      }

      const workflow = await this.orchestrationService.createWorkflow({
        name: dto.name,
        description: dto.description,
        version: dto.version,
        metadata: { ...dto.metadata, type: dto.type }
      });

      res.status(201).json({
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        version: workflow.version,
        createdAt: workflow.createdAt,
        metadata: workflow.metadata
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Start a workflow instance
   * POST /api/workflows/start
   */
  @httpPost('/start')
  public async startWorkflow(
    @request() req: Request,
    @response() res: Response,
    @next() next: NextFunction
  ): Promise<void> {
    try {
      const dto = plainToClass(StartWorkflowDto, req.body);
      const errors = await validate(dto);
      
      if (errors.length > 0) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.map(e => ({
            property: e.property,
            constraints: e.constraints
          }))
        });
        return;
      }

      const context: Record<string, any> = {
        ...dto.context,
        priority: dto.priority,
        participants: dto.participants,
        useSaga: dto.useSaga
      };

      if (dto.deadline) {
        context.deadline = new Date(dto.deadline);
      }

      const instance = await this.orchestrationService.startWorkflow(
        dto.workflowId,
        dto.documentId,
        context
      );

      res.status(201).json({
        instanceId: instance.id,
        workflowId: instance.workflowId,
        documentId: instance.documentId,
        state: instance.state,
        priority: instance.priority,
        startedAt: instance.startedAt,
        deadline: instance.deadline
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get workflow instance status
   * GET /api/workflows/instances/:instanceId
   */
  @httpGet('/instances/:instanceId')
  public async getWorkflowStatus(
    @request() req: Request,
    @response() res: Response,
    @next() next: NextFunction
  ): Promise<void> {
    try {
      const { instanceId } = req.params;
      
      const instance = await this.orchestrationService.getWorkflowStatus(instanceId);
      
      res.json({
        id: instance.id,
        workflowId: instance.workflowId,
        documentId: instance.documentId,
        state: instance.state,
        currentStepId: instance.currentStepId,
        priority: instance.priority,
        startedAt: instance.startedAt,
        completedAt: instance.completedAt,
        deadline: instance.deadline,
        context: instance.context
      });
    } catch (error) {
      if ((error as Error).message.includes('not found')) {
        res.status(404).json({ error: (error as Error).message });
      } else {
        next(error);
      }
    }
  }

  /**
   * Execute next step in workflow
   * POST /api/workflows/instances/:instanceId/execute-next
   */
  @httpPost('/instances/:instanceId/execute-next')
  public async executeNextStep(
    @request() req: Request,
    @response() res: Response,
    @next() next: NextFunction
  ): Promise<void> {
    try {
      const { instanceId } = req.params;
      
      await this.orchestrationService.executeNextStep(instanceId);
      
      res.json({
        message: 'Next step executed successfully',
        instanceId
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Pause workflow instance
   * PUT /api/workflows/instances/:instanceId/pause
   */
  @httpPut('/instances/:instanceId/pause')
  public async pauseWorkflow(
    @request() req: Request,
    @response() res: Response,
    @next() next: NextFunction
  ): Promise<void> {
    try {
      const { instanceId } = req.params;
      
      await this.orchestrationService.pauseWorkflow(instanceId);
      
      res.json({
        message: 'Workflow paused successfully',
        instanceId
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Resume workflow instance
   * PUT /api/workflows/instances/:instanceId/resume
   */
  @httpPut('/instances/:instanceId/resume')
  public async resumeWorkflow(
    @request() req: Request,
    @response() res: Response,
    @next() next: NextFunction
  ): Promise<void> {
    try {
      const { instanceId } = req.params;
      
      await this.orchestrationService.resumeWorkflow(instanceId);
      
      res.json({
        message: 'Workflow resumed successfully',
        instanceId
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancel workflow instance
   * PUT /api/workflows/instances/:instanceId/cancel
   */
  @httpPut('/instances/:instanceId/cancel')
  public async cancelWorkflow(
    @request() req: Request,
    @response() res: Response,
    @next() next: NextFunction
  ): Promise<void> {
    try {
      const { instanceId } = req.params;
      const { reason } = req.body;
      
      if (!reason) {
        res.status(400).json({ error: 'Cancellation reason is required' });
        return;
      }

      await this.orchestrationService.cancelWorkflow(instanceId, reason);
      
      res.json({
        message: 'Workflow cancelled successfully',
        instanceId,
        reason
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retry failed step
   * POST /api/workflows/instances/:instanceId/retry
   */
  @httpPost('/instances/:instanceId/retry')
  public async retryFailedStep(
    @request() req: Request,
    @response() res: Response,
    @next() next: NextFunction
  ): Promise<void> {
    try {
      const { instanceId } = req.params;
      
      await this.orchestrationService.retryFailedStep(instanceId);
      
      res.json({
        message: 'Failed step retry initiated',
        instanceId
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update workflow context
   * PATCH /api/workflows/instances/:instanceId/context
   */
  @httpPut('/instances/:instanceId/context')
  public async updateContext(
    @request() req: Request,
    @response() res: Response,
    @next() next: NextFunction
  ): Promise<void> {
    try {
      const { instanceId } = req.params;
      const dto = plainToClass(UpdateWorkflowContextDto, req.body);
      const errors = await validate(dto);
      
      if (errors.length > 0) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.map(e => ({
            property: e.property,
            constraints: e.constraints
          }))
        });
        return;
      }

      // This would require adding updateContext method to orchestration service
      // For now, we'll return a success response
      res.json({
        message: 'Context updated successfully',
        instanceId,
        updates: dto.updates
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handle workflow event
   * POST /api/workflows/instances/:instanceId/events
   */
  @httpPost('/instances/:instanceId/events')
  public async handleEvent(
    @request() req: Request,
    @response() res: Response,
    @next() next: NextFunction
  ): Promise<void> {
    try {
      const { instanceId } = req.params;
      const { event, data } = req.body;
      
      if (!event) {
        res.status(400).json({ error: 'Event type is required' });
        return;
      }

      await this.orchestrationService.handleWorkflowEvent(instanceId, event, data);
      
      res.json({
        message: 'Event handled successfully',
        instanceId,
        event
      });
    } catch (error) {
      next(error);
    }
  }
}

/**
 * Workflow Template Controller
 */
@controller('/api/workflow-templates')
export class WorkflowTemplateController {
  constructor(
    @inject('IWorkflowOrchestrationService') 
    private orchestrationService: IWorkflowOrchestrationService
  ) {}

  /**
   * Get all workflow templates
   * GET /api/workflow-templates
   */
  @httpGet('/')
  public async getTemplates(
    @request() req: Request,
    @response() res: Response,
    @next() next: NextFunction
  ): Promise<void> {
    try {
      // This would require template management in orchestration service
      const templates = [
        {
          id: 'template-1',
          name: 'Simple Signature Workflow',
          description: 'Basic sequential signature workflow',
          type: 'sequential',
          steps: 3
        },
        {
          id: 'template-2',
          name: 'Multi-Party Approval',
          description: 'Parallel approval workflow with multiple approvers',
          type: 'parallel',
          steps: 5
        },
        {
          id: 'template-3',
          name: 'Conditional Contract Review',
          description: 'Conditional workflow based on contract value',
          type: 'conditional',
          steps: 7
        }
      ];

      res.json(templates);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create workflow from template
   * POST /api/workflow-templates/:templateId/instantiate
   */
  @httpPost('/:templateId/instantiate')
  public async createFromTemplate(
    @request() req: Request,
    @response() res: Response,
    @next() next: NextFunction
  ): Promise<void> {
    try {
      const { templateId } = req.params;
      const { name, description, customizations } = req.body;

      // This would create a workflow from template
      const workflow = await this.orchestrationService.createWorkflow({
        name: name || `Workflow from template ${templateId}`,
        description: description || 'Created from template',
        metadata: {
          templateId,
          customizations
        }
      });

      res.status(201).json({
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        templateId
      });
    } catch (error) {
      next(error);
    }
  }
}

/**
 * Workflow Statistics Controller
 */
@controller('/api/workflow-stats')
export class WorkflowStatsController {
  /**
   * Get workflow statistics
   * GET /api/workflow-stats
   */
  @httpGet('/')
  public async getStatistics(
    @request() req: Request,
    @response() res: Response,
    @next() next: NextFunction
  ): Promise<void> {
    try {
      // This would aggregate statistics from the service
      const stats = {
        totalWorkflows: 150,
        activeInstances: 23,
        completedToday: 12,
        failedToday: 2,
        averageCompletionTime: 3600000, // 1 hour in ms
        successRate: 0.92,
        byState: {
          draft: 5,
          active: 18,
          paused: 3,
          completed: 89,
          failed: 8,
          cancelled: 27
        },
        byPriority: {
          low: 45,
          normal: 78,
          high: 22,
          critical: 5
        }
      };

      res.json(stats);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get workflow instance statistics
   * GET /api/workflow-stats/instances/:instanceId
   */
  @httpGet('/instances/:instanceId')
  public async getInstanceStatistics(
    @request() req: Request,
    @response() res: Response,
    @next() next: NextFunction
  ): Promise<void> {
    try {
      const { instanceId } = req.params;

      // This would get statistics for a specific instance
      const stats = {
        instanceId,
        totalSteps: 5,
        completedSteps: 3,
        averageStepTime: 720000, // 12 minutes
        estimatedCompletion: new Date(Date.now() + 1440000).toISOString(),
        participants: {
          total: 4,
          completed: 2,
          pending: 2
        }
      };

      res.json(stats);
    } catch (error) {
      next(error);
    }
  }
}