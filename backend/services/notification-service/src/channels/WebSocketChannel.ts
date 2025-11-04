import { Server as SocketIOServer, Socket } from 'socket.io';
import { createServer } from 'http';
import { BaseChannel } from './BaseChannel';
import { IRealTimeChannel } from '../interfaces/INotificationChannel';
import { Notification } from '../models/Notification';
import { DeliveryResult, NotificationChannel, WebSocketConfig } from '../interfaces/types';

/**
 * WebSocket channel implementation using Strategy Pattern
 * Extends BaseChannel and implements IRealTimeChannel
 * Provides real-time notification delivery via Socket.IO
 */
export class WebSocketChannel extends BaseChannel implements IRealTimeChannel {
  private io: SocketIOServer | null = null;
  private server: any = null;
  private webSocketConfig: WebSocketConfig;
  private connectedUsers: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds
  private socketToUser: Map<string, string> = new Map(); // socketId -> userId

  constructor(config: WebSocketConfig, logger?: any) {
    super(config, logger);
    this.webSocketConfig = config;
    this.initializeServer();
  }

  /**
   * Get channel type for this implementation
   */
  getChannelType(): NotificationChannel {
    return NotificationChannel.WEBSOCKET;
  }

  /**
   * Initialize WebSocket server
   */
  private async initializeServer(): Promise<void> {
    try {
      // Create HTTP server for Socket.IO
      this.server = createServer();
      
      // Initialize Socket.IO server
      this.io = new SocketIOServer(this.server, {
        cors: {
          origin: "*", // Configure appropriately for production
          methods: ["GET", "POST"]
        },
        namespace: this.webSocketConfig.namespace || '/notifications'
      });

      this.setupSocketHandlers();

      // Start listening
      this.server.listen(this.webSocketConfig.port, () => {
        this.logger.info(`WebSocket server listening on port ${this.webSocketConfig.port}`);
      });

    } catch (error) {
      this.logger.error('Failed to initialize WebSocket server:', error);
      throw new Error(`WebSocket channel initialization failed: ${this.formatError(error)}`);
    }
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupSocketHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      this.logger.info(`New WebSocket connection: ${socket.id}`);

      // Handle user authentication/identification
      socket.on('authenticate', async (data: { userId: string, token?: string }) => {
        try {
          // TODO: Implement token validation in production
          // const isValid = await this.validateAuthToken(data.token);
          // if (!isValid) {
          //   socket.emit('auth_error', { message: 'Invalid token' });
          //   return;
          // }

          await this.connect(data.userId, socket.id);
          socket.emit('authenticated', { userId: data.userId, socketId: socket.id });
          
          this.logger.info(`User ${data.userId} authenticated with socket ${socket.id}`);
        } catch (error) {
          this.logger.error('Authentication error:', error);
          socket.emit('auth_error', { message: this.formatError(error) });
        }
      });

      // Handle disconnection
      socket.on('disconnect', async () => {
        const userId = this.socketToUser.get(socket.id);
        if (userId) {
          await this.disconnect(socket.id);
          this.logger.info(`User ${userId} disconnected (socket: ${socket.id})`);
        }
      });

      // Handle notification acknowledgment
      socket.on('notification_ack', (data: { notificationId: string }) => {
        this.logger.info(`Notification ${data.notificationId} acknowledged by socket ${socket.id}`);
        // TODO: Update notification status to delivered
      });

      // Handle ping/pong for connection health
      socket.on('ping', () => {
        socket.emit('pong');
      });
    });
  }

  /**
   * Concrete implementation of WebSocket notification sending
   */
  protected async doSend(notification: Notification): Promise<DeliveryResult> {
    if (!this.io) {
      throw new Error('WebSocket server not initialized');
    }

    const userId = notification.userId;
    const socketIds = this.connectedUsers.get(userId);

    if (!socketIds || socketIds.size === 0) {
      // User not connected - this is not necessarily an error for WebSocket
      return this.createDeliveryResult(
        false,
        undefined,
        'User not connected to WebSocket',
        {
          userId,
          connectedSockets: 0,
          reason: 'user_offline'
        }
      );
    }

    const notificationData = this.prepareNotificationData(notification);
    const deliveredSockets: string[] = [];
    const failedSockets: string[] = [];

    // Send to all user's connected sockets
    for (const socketId of socketIds) {
      try {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('notification', notificationData);
          deliveredSockets.push(socketId);
        } else {
          // Socket no longer exists, clean up
          failedSockets.push(socketId);
          await this.disconnect(socketId);
        }
      } catch (error) {
        this.logger.error(`Failed to send to socket ${socketId}:`, error);
        failedSockets.push(socketId);
      }
    }

    const messageId = `ws_${Date.now()}_${notification.id}`;
    const success = deliveredSockets.length > 0;

    return this.createDeliveryResult(
      success,
      success ? messageId : undefined,
      success ? undefined : 'Failed to deliver to any connected socket',
      {
        userId,
        deliveredSockets: deliveredSockets.length,
        failedSockets: failedSockets.length,
        totalSockets: socketIds.size,
        socketIds: deliveredSockets
      }
    );
  }

  /**
   * Prepare notification data for WebSocket transmission
   */
  private prepareNotificationData(notification: Notification): any {
    const data = notification.data;
    
    return {
      id: notification.id,
      type: notification.type,
      channel: notification.channel,
      priority: notification.priority,
      timestamp: notification.createdAt.toISOString(),
      data: {
        title: data.title || `New ${notification.type}`,
        message: data.message || data.body || 'You have a new notification',
        actionUrl: data.actionUrl,
        imageUrl: data.imageUrl,
        category: data.category,
        sound: data.sound || 'default',
        badge: data.badge,
        // Include rendered content if available
        ...(data.renderedContent && {
          renderedContent: {
            subject: data.renderedContent.subject,
            body: data.renderedContent.body
          }
        })
      },
      metadata: notification.getMetadata()
    };
  }

  /**
   * Validate WebSocket-specific notification data
   */
  validateNotification(notification: Notification): void {
    super.validateNotification(notification);

    // WebSocket notifications are more flexible - just need basic data
    const data = notification.data;
    if (!data.title && !data.message && !data.body && !data.renderedContent) {
      throw new Error('WebSocket notification must have title, message, body, or renderedContent');
    }
  }

  /**
   * Get user endpoint (not applicable for WebSocket - user must be connected)
   */
  protected getUserEndpoint(notification: Notification): string {
    return notification.userId; // Return userId as the "endpoint"
  }

  /**
   * Establish connection with client (IRealTimeChannel implementation)
   */
  async connect(userId: string, connectionId: string): Promise<void> {
    // Add user to connected users map
    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, new Set());
    }
    this.connectedUsers.get(userId)!.add(connectionId);
    
    // Map socket to user
    this.socketToUser.set(connectionId, userId);

    this.logger.info(`User ${userId} connected with socket ${connectionId}`, {
      totalConnections: this.connectedUsers.get(userId)!.size
    });
  }

  /**
   * Disconnect from client (IRealTimeChannel implementation)
   */
  async disconnect(connectionId: string): Promise<void> {
    const userId = this.socketToUser.get(connectionId);
    
    if (userId) {
      // Remove from user's connections
      const userSockets = this.connectedUsers.get(userId);
      if (userSockets) {
        userSockets.delete(connectionId);
        
        // Remove user entry if no more connections
        if (userSockets.size === 0) {
          this.connectedUsers.delete(userId);
        }
      }
      
      // Remove socket to user mapping
      this.socketToUser.delete(connectionId);

      this.logger.info(`Socket ${connectionId} disconnected for user ${userId}`);
    }
  }

  /**
   * Check if user is currently connected (IRealTimeChannel implementation)
   */
  isConnected(userId: string): boolean {
    const userSockets = this.connectedUsers.get(userId);
    return userSockets ? userSockets.size > 0 : false;
  }

  /**
   * Get all active connections for a user (IRealTimeChannel implementation)
   */
  getActiveConnections(userId: string): string[] {
    const userSockets = this.connectedUsers.get(userId);
    return userSockets ? Array.from(userSockets) : [];
  }

  /**
   * Enhanced health check for WebSocket channel
   */
  async isHealthy(): Promise<boolean> {
    if (!await super.isHealthy()) {
      return false;
    }

    // Check if server is running
    if (!this.server || !this.io) {
      return false;
    }

    try {
      // Check if server is listening
      return this.server.listening;
    } catch (error) {
      this.logger.error('WebSocket health check failed:', error);
      return false;
    }
  }

  /**
   * Validate WebSocket-specific configuration
   */
  protected validateConfig(): void {
    super.validateConfig();

    if (!this.webSocketConfig.port) {
      throw new Error('WebSocket config must specify port');
    }

    if (this.webSocketConfig.port < 1 || this.webSocketConfig.port > 65535) {
      throw new Error('WebSocket port must be between 1 and 65535');
    }
  }

  /**
   * Broadcast notification to all connected users
   */
  async broadcastToAll(notification: any): Promise<void> {
    if (!this.io) {
      throw new Error('WebSocket server not initialized');
    }

    this.io.emit('broadcast', notification);
    this.logger.info('Broadcast notification sent to all connected users');
  }

  /**
   * Broadcast notification to specific user group
   */
  async broadcastToGroup(groupId: string, notification: any): Promise<void> {
    if (!this.io) {
      throw new Error('WebSocket server not initialized');
    }

    this.io.to(groupId).emit('group_notification', notification);
    this.logger.info(`Broadcast notification sent to group ${groupId}`);
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    totalConnectedUsers: number;
    totalConnections: number;
    userConnections: Record<string, number>;
  } {
    const userConnections: Record<string, number> = {};
    let totalConnections = 0;

    for (const [userId, sockets] of this.connectedUsers.entries()) {
      userConnections[userId] = sockets.size;
      totalConnections += sockets.size;
    }

    return {
      totalConnectedUsers: this.connectedUsers.size,
      totalConnections,
      userConnections
    };
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    if (this.io) {
      this.io.close();
      this.io = null;
    }

    if (this.server) {
      this.server.close();
      this.server = null;
    }

    this.connectedUsers.clear();
    this.socketToUser.clear();

    this.logger.info('WebSocket server shut down');
  }
}