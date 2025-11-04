/**
 * Dependency Injection Container Configuration
 * Implements Dependency Inversion Principle
 */

import 'reflect-metadata';
import { Container } from 'inversify';
import {
  IWorkflowRepository,
  IWorkflowInstanceRepository
} from '../interfaces/IWorkflow.interface';
import {
  IWorkflowOrchestrationService,
  WorkflowOrchestrationService
} from '../services/WorkflowOrchestrationService';
import {
  WorkflowController,
  WorkflowTemplateController,
  WorkflowStatsController
} from '../controllers/WorkflowController';
import { WorkflowRepository } from '../repositories/WorkflowRepository';
import { WorkflowInstanceRepository } from '../repositories/WorkflowInstanceRepository';

/**
 * Service identifiers
 */
export const TYPES = {
  IWorkflowRepository: Symbol.for('IWorkflowRepository'),
  IWorkflowInstanceRepository: Symbol.for('IWorkflowInstanceRepository'),
  IWorkflowOrchestrationService: Symbol.for('IWorkflowOrchestrationService')
};

/**
 * Configure dependency injection container
 */
export function configureContainer(): Container {
  const container = new Container();

  // Bind repositories
  container.bind<IWorkflowRepository>(TYPES.IWorkflowRepository)
    .to(WorkflowRepository)
    .inSingletonScope();
    
  container.bind<IWorkflowInstanceRepository>(TYPES.IWorkflowInstanceRepository)
    .to(WorkflowInstanceRepository)
    .inSingletonScope();

  // Bind services
  container.bind<IWorkflowOrchestrationService>(TYPES.IWorkflowOrchestrationService)
    .to(WorkflowOrchestrationService)
    .inSingletonScope();

  // Bind controllers
  container.bind<WorkflowController>(WorkflowController).toSelf();
  container.bind<WorkflowTemplateController>(WorkflowTemplateController).toSelf();
  container.bind<WorkflowStatsController>(WorkflowStatsController).toSelf();

  return container;
}

/**
 * Create and configure container instance
 */
const container = configureContainer();

export { container };