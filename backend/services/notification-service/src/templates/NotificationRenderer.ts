import { NotificationTemplate } from '../models/NotificationTemplate';
import { Notification } from '../models/Notification';
import { NotificationChannel } from '../interfaces/types';

/**
 * Abstract base class implementing Template Method Pattern for notification rendering
 * Defines the skeleton of the rendering algorithm while allowing subclasses to customize specific steps
 * Follows Open/Closed Principle - extendable without modification
 */
export abstract class NotificationRenderer {
  protected logger: any;

  constructor(logger?: any) {
    this.logger = logger || console;
  }

  /**
   * Template method defining the rendering algorithm
   * This is the invariant part that should not change
   */
  async renderNotification(
    template: NotificationTemplate,
    data: Record<string, any>,
    notification?: Notification
  ): Promise<{ subject?: string; body: string; metadata?: Record<string, any> }> {
    
    try {
      // Step 1: Validate inputs
      this.validateInputs(template, data);
      
      // Step 2: Pre-process data (hook for subclasses)
      const processedData = await this.preProcessData(data, template, notification);
      
      // Step 3: Render template content
      const rendered = template.render(processedData);
      
      // Step 4: Post-process rendered content (hook for subclasses)
      const finalContent = await this.postProcessContent(rendered, template, processedData);
      
      // Step 5: Add metadata (hook for subclasses)
      const metadata = await this.generateMetadata(template, processedData, finalContent);
      
      return {
        ...finalContent,
        metadata
      };
      
    } catch (error) {
      this.logger.error('Template rendering failed:', {
        templateId: template.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Validate inputs - can be overridden by subclasses for channel-specific validation
   */
  protected validateInputs(template: NotificationTemplate, data: Record<string, any>): void {
    if (!template) {
      throw new Error('Template is required for rendering');
    }
    
    if (!template.isActive) {
      throw new Error(`Template ${template.id} is not active`);
    }
    
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be a valid object');
    }
  }

  /**
   * Pre-process data hook - can be overridden by subclasses
   * Allows for channel-specific data transformation before rendering
   */
  protected async preProcessData(
    data: Record<string, any>,
    template: NotificationTemplate,
    notification?: Notification
  ): Promise<Record<string, any>> {
    // Add common data that might be useful in templates
    const commonData = {
      ...data,
      currentDate: new Date().toLocaleDateString(),
      currentTime: new Date().toLocaleTimeString(),
      timestamp: new Date().toISOString()
    };

    // Add notification metadata if available
    if (notification) {
      commonData.notificationId = notification.id;
      commonData.notificationType = notification.type;
      commonData.priority = notification.priority;
    }

    return commonData;
  }

  /**
   * Post-process content hook - must be implemented by subclasses
   * This is where channel-specific formatting happens
   */
  protected abstract postProcessContent(
    content: { subject?: string; body: string },
    template: NotificationTemplate,
    data: Record<string, any>
  ): Promise<{ subject?: string; body: string }>;

  /**
   * Generate metadata hook - can be overridden by subclasses
   */
  protected async generateMetadata(
    template: NotificationTemplate,
    data: Record<string, any>,
    content: { subject?: string; body: string }
  ): Promise<Record<string, any>> {
    return {
      templateId: template.id,
      templateName: template.name,
      channel: template.channel,
      renderedAt: new Date().toISOString(),
      dataKeys: Object.keys(data),
      contentLength: content.body.length
    };
  }

  /**
   * Get the channel this renderer supports
   */
  abstract getSupportedChannel(): NotificationChannel;

  /**
   * Check if this renderer can handle the given template
   */
  canRender(template: NotificationTemplate): boolean {
    return template.channel === this.getSupportedChannel() && template.isActive;
  }
}

/**
 * Email-specific renderer implementation
 * Handles HTML formatting and email-specific features
 */
export class EmailRenderer extends NotificationRenderer {
  
  getSupportedChannel(): NotificationChannel {
    return NotificationChannel.EMAIL;
  }

  protected async postProcessContent(
    content: { subject?: string; body: string },
    template: NotificationTemplate,
    data: Record<string, any>
  ): Promise<{ subject?: string; body: string }> {
    
    // Ensure we have HTML content for email
    let htmlBody = content.body;
    
    // Convert plain text to HTML if needed
    if (!this.isHtmlContent(htmlBody)) {
      htmlBody = this.convertTextToHtml(htmlBody);
    }
    
    // Add email-specific styling
    htmlBody = this.addEmailStyling(htmlBody, data);
    
    // Add unsubscribe link if configured
    if (data.unsubscribeUrl) {
      htmlBody = this.addUnsubscribeLink(htmlBody, data.unsubscribeUrl);
    }
    
    return {
      subject: content.subject,
      body: htmlBody
    };
  }

  private isHtmlContent(content: string): boolean {
    return /<[a-z][\s\S]*>/i.test(content);
  }

  private convertTextToHtml(text: string): string {
    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            ${text.replace(/\n/g, '<br>')}
          </div>
        </body>
      </html>
    `;
  }

  private addEmailStyling(html: string, data: Record<string, any>): string {
    // Add responsive meta tags if not present
    if (!html.includes('viewport')) {
      html = html.replace('<head>', `<head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
      `);
    }

    // Add company branding if specified
    if (data.brandColor) {
      html = html.replace(/<body[^>]*>/, 
        `<body style="background-color: #f8f9fa; margin: 0; padding: 0;">`);
    }

    return html;
  }

  private addUnsubscribeLink(html: string, unsubscribeUrl: string): string {
    const unsubscribeFooter = `
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
        <p>If you no longer wish to receive these emails, you can 
           <a href="${unsubscribeUrl}" style="color: #666;">unsubscribe here</a>.
        </p>
      </div>
    `;
    
    // Insert before closing body tag
    return html.replace('</body>', `${unsubscribeFooter}</body>`);
  }
}

/**
 * SMS-specific renderer implementation
 * Handles text length limits and SMS formatting
 */
export class SmsRenderer extends NotificationRenderer {
  
  getSupportedChannel(): NotificationChannel {
    return NotificationChannel.SMS;
  }

  protected async postProcessContent(
    content: { subject?: string; body: string },
    template: NotificationTemplate,
    data: Record<string, any>
  ): Promise<{ subject?: string; body: string }> {
    
    let smsBody = content.body;
    
    // Remove HTML tags if present
    smsBody = this.stripHtml(smsBody);
    
    // Normalize whitespace
    smsBody = this.normalizeWhitespace(smsBody);
    
    // Add short URL if provided
    if (data.shortUrl || data.actionUrl) {
      const url = data.shortUrl || data.actionUrl;
      smsBody = this.addUrlToSms(smsBody, url);
    }
    
    // Truncate to SMS limits
    smsBody = this.truncateForSms(smsBody);
    
    return {
      body: smsBody
    };
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  private normalizeWhitespace(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .trim();
  }

  private addUrlToSms(text: string, url: string): string {
    // If text is short enough, append URL
    if (text.length + url.length + 1 <= 140) {
      return `${text} ${url}`;
    }
    
    // Otherwise, truncate text to make room for URL
    const maxTextLength = 140 - url.length - 4; // 4 chars for " ..." + space
    if (maxTextLength > 20) {
      return `${text.substring(0, maxTextLength)}... ${url}`;
    }
    
    // If URL is too long, just return original text
    return text;
  }

  private truncateForSms(text: string, maxLength: number = 160): string {
    if (text.length <= maxLength) {
      return text;
    }
    
    return text.substring(0, maxLength - 3) + '...';
  }
}

/**
 * Push notification renderer implementation
 * Handles platform-specific formatting for mobile push notifications
 */
export class PushRenderer extends NotificationRenderer {
  
  getSupportedChannel(): NotificationChannel {
    return NotificationChannel.PUSH;
  }

  protected async postProcessContent(
    content: { subject?: string; body: string },
    template: NotificationTemplate,
    data: Record<string, any>
  ): Promise<{ subject?: string; body: string }> {
    
    // Strip HTML for push notifications
    const plainBody = this.stripHtml(content.body);
    
    // Truncate for push notification limits
    const title = this.truncateTitle(content.subject || data.title || 'Notification');
    const body = this.truncateBody(plainBody);
    
    return {
      subject: title,
      body: body
    };
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private truncateTitle(title: string): string {
    const maxLength = 50; // Platform-specific limits
    if (title.length <= maxLength) {
      return title;
    }
    return title.substring(0, maxLength - 3) + '...';
  }

  private truncateBody(body: string): string {
    const maxLength = 150; // Platform-specific limits
    if (body.length <= maxLength) {
      return body;
    }
    return body.substring(0, maxLength - 3) + '...';
  }
}

/**
 * WebSocket renderer implementation
 * Prepares structured data for real-time notifications
 */
export class WebSocketRenderer extends NotificationRenderer {
  
  getSupportedChannel(): NotificationChannel {
    return NotificationChannel.WEBSOCKET;
  }

  protected async postProcessContent(
    content: { subject?: string; body: string },
    template: NotificationTemplate,
    data: Record<string, any>
  ): Promise<{ subject?: string; body: string }> {
    
    // WebSocket notifications can contain rich content
    // Keep original formatting but ensure it's JSON-safe
    const processedContent = {
      subject: content.subject,
      body: content.body
    };
    
    // Validate that content can be serialized to JSON
    try {
      JSON.stringify(processedContent);
    } catch (error) {
      this.logger.warn('WebSocket content contains non-serializable data, cleaning up');
      processedContent.body = this.cleanForJson(content.body);
    }
    
    return processedContent;
  }

  private cleanForJson(content: string): string {
    // Remove or escape problematic characters for JSON serialization
    return content
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
      .replace(/\\/g, '\\\\') // Escape backslashes
      .replace(/"/g, '\\"'); // Escape quotes
  }
}