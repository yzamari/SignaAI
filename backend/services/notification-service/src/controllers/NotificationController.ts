import { Request, Response, NextFunction } from 'express';
import { NotificationService } from '../services/NotificationService';
import { Notification } from '../models/Notification';
import { NotificationTemplate } from '../models/NotificationTemplate';
import { NotificationChannel, NotificationPriority } from '../interfaces/types';

/**
 * REST API controller for notification service
 * Follows Controller Pattern and implements proper error handling
 * Adheres to Single Responsibility Principle - handles HTTP requests only
 */
export class NotificationController {
  private notificationService: NotificationService;
  private logger: any;

  constructor(notificationService: NotificationService, logger?: any) {
    this.notificationService = notificationService;
    this.logger = logger || console;

    // Bind methods to preserve 'this' context
    this.sendNotification = this.sendNotification.bind(this);
    this.sendBatchNotifications = this.sendBatchNotifications.bind(this);
    this.sendFromTemplate = this.sendFromTemplate.bind(this);
    this.scheduleNotification = this.scheduleNotification.bind(this);
    this.cancelNotification = this.cancelNotification.bind(this);
    this.getNotification = this.getNotification.bind(this);
    this.getUserNotifications = this.getUserNotifications.bind(this);
    this.getHealthStatus = this.getHealthStatus.bind(this);
    this.getMetrics = this.getMetrics.bind(this);
    this.createTemplate = this.createTemplate.bind(this);
    this.getTemplates = this.getTemplates.bind(this);
    this.previewTemplate = this.previewTemplate.bind(this);
  }

  /**
   * Send a single notification
   * POST /notifications
   */
  async sendNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        userId,
        type,
        channel,
        priority = NotificationPriority.NORMAL,
        data,
        templateId,
        scheduledFor
      } = req.body;

      // Validate required fields
      if (!userId || !type || !channel || !data) {
        res.status(400).json({
          error: 'Missing required fields: userId, type, channel, data'
        });
        return;
      }

      // Validate channel
      if (!Object.values(NotificationChannel).includes(channel)) {
        res.status(400).json({
          error: `Invalid channel: ${channel}`
        });
        return;
      }

      // Create notification
      const notificationId = this.generateNotificationId();
      const notification = new Notification(
        notificationId,
        userId,
        type,
        channel,
        priority,
        data,
        templateId,
        scheduledFor ? new Date(scheduledFor) : undefined
      );

      const id = await this.notificationService.sendNotification(notification);

      this.logger.info(`Notification sent via API:`, {
        notificationId: id,
        userId,
        channel,
        type
      });

      res.status(201).json({
        success: true,
        notificationId: id,
        message: 'Notification queued for delivery'
      });

    } catch (error) {
      this.handleError(error, req, res, next);
    }
  }

  /**
   * Send multiple notifications in batch
   * POST /notifications/batch
   */
  async sendBatchNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { notifications } = req.body;

      if (!Array.isArray(notifications) || notifications.length === 0) {
        res.status(400).json({
          error: 'notifications must be a non-empty array'
        });
        return;
      }

      if (notifications.length > 100) {
        res.status(400).json({
          error: 'Batch size cannot exceed 100 notifications'
        });
        return;
      }

      // Create notification objects
      const notificationObjects = notifications.map((notifData: any) => {
        const {
          userId,
          type,
          channel,
          priority = NotificationPriority.NORMAL,
          data,
          templateId,
          scheduledFor
        } = notifData;

        if (!userId || !type || !channel || !data) {
          throw new Error('Each notification must have userId, type, channel, and data');
        }

        const notificationId = this.generateNotificationId();
        return new Notification(
          notificationId,
          userId,
          type,
          channel,
          priority,
          data,
          templateId,
          scheduledFor ? new Date(scheduledFor) : undefined
        );
      });

      const ids = await this.notificationService.sendBatchNotifications(notificationObjects);

      this.logger.info(`Batch of ${ids.length} notifications sent via API`);

      res.status(201).json({
        success: true,
        notificationIds: ids,
        count: ids.length,
        message: 'Notifications queued for delivery'
      });

    } catch (error) {
      this.handleError(error, req, res, next);
    }
  }

  /**
   * Send notification from template
   * POST /notifications/template
   */
  async sendFromTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        userId,
        templateId,
        data,
        channel,
        priority = NotificationPriority.NORMAL,
        scheduledFor
      } = req.body;

      if (!userId || !templateId || !data || !channel) {
        res.status(400).json({
          error: 'Missing required fields: userId, templateId, data, channel'
        });
        return;
      }

      const id = await this.notificationService.sendFromTemplate(
        userId,
        templateId,
        data,
        channel,
        priority,
        scheduledFor ? new Date(scheduledFor) : undefined
      );

      this.logger.info(`Template notification sent via API:`, {
        notificationId: id,
        userId,
        templateId,
        channel
      });

      res.status(201).json({
        success: true,
        notificationId: id,
        message: 'Template notification queued for delivery'
      });

    } catch (error) {
      this.handleError(error, req, res, next);
    }
  }

  /**
   * Schedule notification for future delivery
   * POST /notifications/schedule
   */
  async scheduleNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        userId,
        type,
        channel,
        priority = NotificationPriority.NORMAL,
        data,
        templateId,
        scheduledFor
      } = req.body;

      if (!scheduledFor) {
        res.status(400).json({
          error: 'scheduledFor is required for scheduled notifications'
        });
        return;
      }

      const scheduledDate = new Date(scheduledFor);
      if (scheduledDate <= new Date()) {
        res.status(400).json({
          error: 'scheduledFor must be in the future'
        });
        return;
      }

      const notificationId = this.generateNotificationId();
      const notification = new Notification(
        notificationId,
        userId,
        type,
        channel,
        priority,
        data,
        templateId
      );

      const id = await this.notificationService.scheduleNotification(notification, scheduledDate);

      this.logger.info(`Notification scheduled via API:`, {
        notificationId: id,
        userId,
        scheduledFor: scheduledDate.toISOString()
      });

      res.status(201).json({
        success: true,
        notificationId: id,
        scheduledFor: scheduledDate.toISOString(),
        message: 'Notification scheduled for delivery'
      });

    } catch (error) {
      this.handleError(error, req, res, next);
    }
  }

  /**
   * Cancel a pending notification
   * DELETE /notifications/:id
   */
  async cancelNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          error: 'Notification ID is required'
        });
        return;
      }

      const cancelled = await this.notificationService.cancelNotification(id);

      if (cancelled) {
        this.logger.info(`Notification cancelled via API: ${id}`);
        res.json({
          success: true,
          message: 'Notification cancelled successfully'
        });
      } else {
        res.status(404).json({
          error: 'Notification not found or already processed'
        });
      }

    } catch (error) {
      this.handleError(error, req, res, next);
    }
  }

  /**
   * Get notification by ID
   * GET /notifications/:id
   */
  async getNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const notification = await this.notificationService.getNotification(id);

      if (notification) {
        res.json({
          success: true,
          notification: this.formatNotificationResponse(notification)
        });
      } else {
        res.status(404).json({
          error: 'Notification not found'
        });
      }

    } catch (error) {
      this.handleError(error, req, res, next);
    }
  }

  /**
   * Get notifications for a user
   * GET /users/:userId/notifications
   */
  async getUserNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      if (limit > 100) {
        res.status(400).json({
          error: 'Limit cannot exceed 100'
        });
        return;
      }

      const notifications = await this.notificationService.getUserNotifications(userId, limit, offset);

      res.json({
        success: true,
        notifications: notifications.map(n => this.formatNotificationResponse(n)),
        count: notifications.length,
        limit,
        offset
      });

    } catch (error) {
      this.handleError(error, req, res, next);
    }
  }

  /**
   * Get service health status
   * GET /health
   */
  async getHealthStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const healthStatus = await this.notificationService.getHealthStatus();
      
      const overallHealthy = Object.values(healthStatus.channels).every(healthy => healthy);
      const statusCode = overallHealthy ? 200 : 503;

      res.status(statusCode).json(healthStatus);

    } catch (error) {
      this.handleError(error, req, res, next);
    }
  }

  /**
   * Get service metrics
   * GET /metrics
   */
  async getMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const metrics = await this.notificationService.getMetrics();

      res.json({
        success: true,
        metrics
      });

    } catch (error) {
      this.handleError(error, req, res, next);
    }
  }

  /**
   * Create a new notification template
   * POST /templates
   */
  async createTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        name,
        channel,
        subject,
        body,
        variables,
        isActive = true
      } = req.body;

      if (!name || !channel || !body || !Array.isArray(variables)) {
        res.status(400).json({
          error: 'Missing required fields: name, channel, body, variables'
        });
        return;
      }

      const templateId = this.generateTemplateId();
      const template = new NotificationTemplate(
        templateId,
        name,
        channel,
        body,
        variables,
        isActive,
        subject
      );

      this.notificationService.addTemplate(template);

      this.logger.info(`Template created via API:`, {
        templateId,
        name,
        channel
      });

      res.status(201).json({
        success: true,
        templateId,
        message: 'Template created successfully'
      });

    } catch (error) {
      this.handleError(error, req, res, next);
    }
  }

  /**
   * Get all templates or templates for a specific channel
   * GET /templates
   */
  async getTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { channel } = req.query;

      // In a real implementation, this would query a database
      // For now, return a placeholder response
      res.json({
        success: true,
        templates: [],
        message: 'Template listing not implemented - requires database integration'
      });

    } catch (error) {
      this.handleError(error, req, res, next);
    }
  }

  /**
   * Preview template with sample data
   * POST /templates/:id/preview
   */
  async previewTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { data } = req.body;

      // In a real implementation, this would retrieve the template and render it
      // For now, return a placeholder response
      res.json({
        success: true,
        preview: {
          subject: 'Preview Subject',
          body: 'Preview body content'
        },
        message: 'Template preview not implemented - requires database integration'
      });

    } catch (error) {
      this.handleError(error, req, res, next);
    }
  }

  /**
   * Format notification for API response
   */
  private formatNotificationResponse(notification: Notification): any {
    return {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      channel: notification.channel,
      priority: notification.priority,
      status: notification.status,
      createdAt: notification.createdAt.toISOString(),
      deliveredAt: notification.deliveredAt?.toISOString(),
      scheduledFor: notification.scheduledFor?.toISOString(),
      retryCount: notification.retryCount,
      templateId: notification.templateId,
      data: notification.data
    };
  }

  /**
   * Generate unique notification ID
   */
  private generateNotificationId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique template ID
   */
  private generateTemplateId(): string {
    return `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Handle errors and send appropriate responses
   */
  private handleError(error: any, req: Request, res: Response, next: NextFunction): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    this.logger.error(`API Error:`, {
      method: req.method,
      path: req.path,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });

    // Determine status code based on error type
    let statusCode = 500;
    if (errorMessage.includes('not found')) {
      statusCode = 404;
    } else if (errorMessage.includes('invalid') || errorMessage.includes('required')) {
      statusCode = 400;
    } else if (errorMessage.includes('unauthorized') || errorMessage.includes('forbidden')) {
      statusCode = 403;
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Helper function to create and configure routes
 */
export function setupNotificationRoutes(
  app: any,
  notificationService: NotificationService,
  logger?: any
): void {
  const controller = new NotificationController(notificationService, logger);

  // Notification routes
  app.post('/notifications', controller.sendNotification);
  app.post('/notifications/batch', controller.sendBatchNotifications);
  app.post('/notifications/template', controller.sendFromTemplate);
  app.post('/notifications/schedule', controller.scheduleNotification);
  app.delete('/notifications/:id', controller.cancelNotification);
  app.get('/notifications/:id', controller.getNotification);

  // User notification routes
  app.get('/users/:userId/notifications', controller.getUserNotifications);

  // Template routes
  app.post('/templates', controller.createTemplate);
  app.get('/templates', controller.getTemplates);
  app.post('/templates/:id/preview', controller.previewTemplate);

  // Service routes
  app.get('/health', controller.getHealthStatus);
  app.get('/metrics', controller.getMetrics);

  if (logger) {
    logger.info('Notification API routes configured');
  }
}