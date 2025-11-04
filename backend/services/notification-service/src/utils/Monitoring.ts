import { EventEmitter } from 'events';
import { Logger } from './Logger';
import { NotificationMetrics } from '../interfaces/types';
import { IMetricsObserver, IAuditObserver } from '../interfaces/INotificationObserver';
import { Notification } from '../models/Notification';
import { NotificationStatus } from '../interfaces/types';

/**
 * Monitoring and metrics collection system
 * Implements Observer Pattern for metrics collection
 * Follows Single Responsibility Principle - handles monitoring only
 */
export class MonitoringService extends EventEmitter implements IMetricsObserver, IAuditObserver {
  private logger: Logger;
  private metrics: NotificationMetrics;
  private healthChecks: Map<string, HealthCheck> = new Map();
  private alerts: Alert[] = [];
  private isEnabled: boolean;
  private config: any;

  constructor(config: any, logger: Logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.isEnabled = config.metricsEnabled !== false;
    this.initializeMetrics();
    this.setupHealthChecks();
    
    if (this.isEnabled) {
      this.startMetricsCollection();
    }
  }

  /**
   * Initialize metrics structure
   */
  private initializeMetrics(): void {
    this.metrics = {
      sent: 0,
      delivered: 0,
      failed: 0,
      pending: 0,
      retrying: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
      channelMetrics: {
        email: { sent: 0, delivered: 0, failed: 0, averageDeliveryTime: 0 },
        sms: { sent: 0, delivered: 0, failed: 0, averageDeliveryTime: 0 },
        push: { sent: 0, delivered: 0, failed: 0, averageDeliveryTime: 0 },
        websocket: { sent: 0, delivered: 0, failed: 0, averageDeliveryTime: 0 },
        in_app: { sent: 0, delivered: 0, failed: 0, averageDeliveryTime: 0 }
      }
    };
  }

  /**
   * Setup default health checks
   */
  private setupHealthChecks(): void {
    // System health check
    this.addHealthCheck('system', async () => {
      const usage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      return {
        healthy: usage.heapUsed < 1024 * 1024 * 1024, // 1GB limit
        details: {
          memory: {
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
            external: Math.round(usage.external / 1024 / 1024) + 'MB'
          },
          cpu: {
            user: cpuUsage.user,
            system: cpuUsage.system
          },
          uptime: Math.round(process.uptime()) + 's'
        }
      };
    });

    // Queue health check
    this.addHealthCheck('queue', async () => {
      // This would integrate with the actual queue service
      return {
        healthy: true,
        details: {
          size: 0,
          processing: 0
        }
      };
    });
  }

  /**
   * Start periodic metrics collection
   */
  private startMetricsCollection(): void {
    const interval = this.config.healthCheckInterval || 30000; // 30 seconds

    setInterval(async () => {
      try {
        await this.collectMetrics();
        this.checkAlerts();
      } catch (error) {
        this.logger.error('Error collecting metrics:', error);
      }
    }, interval);

    this.logger.info('Metrics collection started', { interval: `${interval}ms` });
  }

  /**
   * Collect current metrics
   */
  private async collectMetrics(): Promise<void> {
    const timestamp = new Date().toISOString();
    
    // Calculate error rates
    const totalSent = this.metrics.sent;
    const errorRate = totalSent > 0 ? this.metrics.failed / totalSent : 0;
    
    // Emit metrics event
    this.emit('metrics', {
      timestamp,
      ...this.metrics,
      errorRate,
      successRate: totalSent > 0 ? this.metrics.delivered / totalSent : 0
    });

    this.logger.logMetrics({
      timestamp,
      totalSent,
      totalDelivered: this.metrics.delivered,
      totalFailed: this.metrics.failed,
      errorRate: errorRate.toFixed(4),
      averageProcessingTime: this.metrics.averageProcessingTime.toFixed(2) + 'ms'
    });
  }

  /**
   * Check alert conditions
   */
  private checkAlerts(): void {
    if (!this.config.alerting?.enabled) return;

    const thresholds = this.config.alerting.thresholds;
    const totalSent = this.metrics.sent;
    
    if (totalSent > 0) {
      const errorRate = this.metrics.failed / totalSent;
      
      if (errorRate > thresholds.errorRate) {
        this.triggerAlert('HIGH_ERROR_RATE', {
          current: errorRate,
          threshold: thresholds.errorRate,
          total: totalSent,
          failed: this.metrics.failed
        });
      }
    }

    if (this.metrics.averageProcessingTime > thresholds.responseTime) {
      this.triggerAlert('HIGH_RESPONSE_TIME', {
        current: this.metrics.averageProcessingTime,
        threshold: thresholds.responseTime
      });
    }

    if (this.metrics.pending > thresholds.queueSize) {
      this.triggerAlert('LARGE_QUEUE_SIZE', {
        current: this.metrics.pending,
        threshold: thresholds.queueSize
      });
    }
  }

  /**
   * Trigger alert
   */
  private triggerAlert(type: string, data: any): void {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      level: 'warning',
      message: this.formatAlertMessage(type, data),
      data,
      timestamp: new Date(),
      resolved: false
    };

    this.alerts.push(alert);
    
    this.logger.warn(`Alert Triggered: ${alert.type}`, {
      alertId: alert.id,
      ...alert.data
    });

    this.emit('alert', alert);
  }

  /**
   * Format alert message
   */
  private formatAlertMessage(type: string, data: any): string {
    switch (type) {
      case 'HIGH_ERROR_RATE':
        return `Error rate ${(data.current * 100).toFixed(2)}% exceeds threshold ${(data.threshold * 100).toFixed(2)}%`;
      case 'HIGH_RESPONSE_TIME':
        return `Average response time ${data.current.toFixed(2)}ms exceeds threshold ${data.threshold}ms`;
      case 'LARGE_QUEUE_SIZE':
        return `Queue size ${data.current} exceeds threshold ${data.threshold}`;
      default:
        return `Alert: ${type}`;
    }
  }

  // IMetricsObserver implementation

  getObserverId(): string {
    return 'monitoring-service';
  }

  async onStatusChange(
    notification: Notification,
    oldStatus: NotificationStatus,
    newStatus: NotificationStatus
  ): Promise<void> {
    if (!this.isEnabled) return;

    this.logger.logNotificationEvent(
      'status_change',
      notification.id,
      notification.userId,
      notification.channel,
      { oldStatus, newStatus }
    );
  }

  async onMetricsUpdate(
    channelType: string,
    success: boolean,
    processingTime: number
  ): Promise<void> {
    if (!this.isEnabled) return;

    if (success) {
      this.metrics.sent++;
      this.metrics.delivered++;
    } else {
      this.metrics.failed++;
    }

    // Update channel-specific metrics
    const channelMetrics = this.metrics.channelMetrics[channelType as keyof typeof this.metrics.channelMetrics];
    if (channelMetrics) {
      if (success) {
        channelMetrics.sent++;
        channelMetrics.delivered++;
        
        // Update average delivery time
        const totalDeliveries = channelMetrics.delivered;
        const totalTime = channelMetrics.averageDeliveryTime * (totalDeliveries - 1) + processingTime;
        channelMetrics.averageDeliveryTime = totalTime / totalDeliveries;
      } else {
        channelMetrics.failed++;
      }
    }

    // Update overall average processing time
    this.metrics.totalProcessingTime += processingTime;
    const totalProcessed = this.metrics.sent + this.metrics.failed;
    if (totalProcessed > 0) {
      this.metrics.averageProcessingTime = this.metrics.totalProcessingTime / totalProcessed;
    }
  }

  async onRetryAttempt(notification: Notification, attemptNumber: number): Promise<void> {
    if (!this.isEnabled) return;

    this.metrics.retrying++;
    
    this.logger.logNotificationEvent(
      'retry_attempt',
      notification.id,
      notification.userId,
      notification.channel,
      { attemptNumber }
    );
  }

  // IAuditObserver implementation

  async onAuditEvent(
    event: string,
    notification: Notification,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.isEnabled) return;

    this.logger.info('Audit Event', {
      event,
      notificationId: notification.id,
      userId: notification.userId,
      channel: notification.channel,
      audit: true,
      ...metadata
    });
  }

  async onSecurityEvent(
    event: string,
    userId: string,
    details: Record<string, any>
  ): Promise<void> {
    this.logger.logSecurityEvent(event, userId, details);
  }

  // Public API methods

  /**
   * Get current metrics
   */
  getMetrics(): NotificationMetrics {
    return { ...this.metrics };
  }

  /**
   * Get detailed metrics with calculations
   */
  getDetailedMetrics(): any {
    const totalSent = this.metrics.sent;
    const totalProcessed = totalSent + this.metrics.failed;
    
    return {
      ...this.metrics,
      errorRate: totalSent > 0 ? this.metrics.failed / totalSent : 0,
      successRate: totalSent > 0 ? this.metrics.delivered / totalSent : 0,
      throughput: {
        totalProcessed,
        averagePerSecond: totalProcessed / (process.uptime() || 1)
      },
      health: this.getOverallHealth()
    };
  }

  /**
   * Add custom health check
   */
  addHealthCheck(name: string, check: () => Promise<HealthCheckResult>): void {
    this.healthChecks.set(name, { name, check });
    this.logger.debug(`Health check added: ${name}`);
  }

  /**
   * Run all health checks
   */
  async runHealthChecks(): Promise<Record<string, HealthCheckResult>> {
    const results: Record<string, HealthCheckResult> = {};
    
    for (const [name, healthCheck] of this.healthChecks.entries()) {
      try {
        results[name] = await healthCheck.check();
      } catch (error) {
        results[name] = {
          healthy: false,
          details: {
            error: error instanceof Error ? error.message : String(error)
          }
        };
      }
    }

    return results;
  }

  /**
   * Get overall service health
   */
  private getOverallHealth(): 'healthy' | 'degraded' | 'unhealthy' {
    const totalSent = this.metrics.sent;
    
    if (totalSent === 0) return 'healthy';
    
    const errorRate = this.metrics.failed / totalSent;
    const thresholds = this.config.alerting?.thresholds;
    
    if (!thresholds) return 'healthy';
    
    if (errorRate > thresholds.errorRate * 2) return 'unhealthy';
    if (errorRate > thresholds.errorRate) return 'degraded';
    
    return 'healthy';
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      this.logger.info(`Alert resolved: ${alertId}`);
      return true;
    }
    return false;
  }

  /**
   * Clear old alerts
   */
  clearOldAlerts(maxAge: number = 24 * 60 * 60 * 1000): number {
    const cutoff = new Date(Date.now() - maxAge);
    const initialCount = this.alerts.length;
    
    this.alerts = this.alerts.filter(alert => alert.timestamp > cutoff);
    
    const clearedCount = initialCount - this.alerts.length;
    if (clearedCount > 0) {
      this.logger.info(`Cleared ${clearedCount} old alerts`);
    }
    
    return clearedCount;
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.initializeMetrics();
    this.logger.info('Metrics reset');
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics(): string {
    const lines: string[] = [];
    
    lines.push('# HELP notification_sent_total Total number of notifications sent');
    lines.push('# TYPE notification_sent_total counter');
    lines.push(`notification_sent_total ${this.metrics.sent}`);
    
    lines.push('# HELP notification_delivered_total Total number of notifications delivered');
    lines.push('# TYPE notification_delivered_total counter');
    lines.push(`notification_delivered_total ${this.metrics.delivered}`);
    
    lines.push('# HELP notification_failed_total Total number of notifications failed');
    lines.push('# TYPE notification_failed_total counter');
    lines.push(`notification_failed_total ${this.metrics.failed}`);
    
    lines.push('# HELP notification_processing_time_ms Average processing time in milliseconds');
    lines.push('# TYPE notification_processing_time_ms gauge');
    lines.push(`notification_processing_time_ms ${this.metrics.averageProcessingTime}`);
    
    // Channel-specific metrics
    for (const [channel, metrics] of Object.entries(this.metrics.channelMetrics)) {
      lines.push(`notification_sent_total{channel="${channel}"} ${metrics.sent}`);
      lines.push(`notification_delivered_total{channel="${channel}"} ${metrics.delivered}`);
      lines.push(`notification_failed_total{channel="${channel}"} ${metrics.failed}`);
      lines.push(`notification_delivery_time_ms{channel="${channel}"} ${metrics.averageDeliveryTime}`);
    }
    
    return lines.join('\n') + '\n';
  }

  /**
   * Shutdown monitoring service
   */
  shutdown(): void {
    this.removeAllListeners();
    this.healthChecks.clear();
    this.logger.info('Monitoring service shut down');
  }
}

// Interfaces
interface HealthCheck {
  name: string;
  check: () => Promise<HealthCheckResult>;
}

interface HealthCheckResult {
  healthy: boolean;
  details?: any;
}

interface Alert {
  id: string;
  type: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  data: any;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

/**
 * Factory function to create monitoring service
 */
export function createMonitoringService(config: any, logger: Logger): MonitoringService {
  return new MonitoringService(config, logger);
}