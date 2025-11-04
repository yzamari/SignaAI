# SignaAI Notification Service

A production-ready notification microservice built with TypeScript, implementing proper Object-Oriented Programming principles and design patterns.

## Architecture Overview

This notification service implements multiple design patterns to ensure maintainability, scalability, and extensibility:

### Core Design Patterns Implemented

- **Strategy Pattern**: Different notification channels (Email, SMS, Push, WebSocket)
- **Observer Pattern**: Real-time notification status updates and monitoring
- **Template Method Pattern**: Consistent notification rendering workflow
- **Factory Pattern**: Dynamic channel creation and management
- **Facade Pattern**: Simplified interface to complex notification subsystem
- **Producer-Consumer Pattern**: Queue-based notification processing

### SOLID Principles Adherence

- **Single Responsibility**: Each class has one clear purpose
- **Open/Closed**: Extensible without modifying existing code
- **Liskov Substitution**: Interfaces can be substituted seamlessly
- **Interface Segregation**: Focused, specific interfaces
- **Dependency Inversion**: Depends on abstractions, not concretions

## Features

### Multi-Channel Support
- **Email**: SMTP with HTML/text rendering and attachments
- **SMS**: Twilio, AWS SNS, or mock provider support
- **Push Notifications**: FCM (Android/Web) and APNS (iOS)
- **WebSocket**: Real-time notifications via Socket.IO
- **In-App**: Future extension point for in-app notifications

### Advanced Capabilities
- ✅ Template-based notifications with variable substitution
- ✅ Priority-based queue processing
- ✅ Exponential backoff retry logic with multiple strategies
- ✅ Rate limiting and throttling
- ✅ Comprehensive monitoring and metrics
- ✅ Health checks and alerting
- ✅ Graceful error handling and recovery
- ✅ Docker containerization
- ✅ Production-ready logging
- ✅ Security best practices

## Quick Start

### Prerequisites
- Node.js 18.x or higher
- TypeScript 5.x
- Docker (optional)

### Installation

```bash
# Clone the repository
git clone https://github.com/signaai/notification-service.git
cd notification-service

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your configuration
# Configure at minimum: SMTP settings for email

# Build the service
npm run build

# Start in development mode
npm run dev

# Or start in production mode
npm start
```

### Docker Deployment

```bash
# Build Docker image
docker build -t notification-service .

# Run with Docker
docker run -p 3000:3000 --env-file .env notification-service

# Or use Docker Compose
docker-compose up -d
```

## Configuration

### Environment Variables

Key configuration options (see `.env.example` for complete list):

```env
# Server
PORT=3000
NODE_ENV=production

# Email (SMTP)
EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# SMS (Twilio example)
SMS_ENABLED=true
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token

# Push Notifications
PUSH_ENABLED=true
FCM_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

# WebSocket
WEBSOCKET_ENABLED=true
WEBSOCKET_PORT=3001
```

### Channel Configuration

Each notification channel can be independently configured:

```typescript
{
  email: {
    enabled: true,
    rateLimitPerMinute: 60,
    timeout: 30000,
    smtp: { /* SMTP config */ }
  },
  sms: {
    enabled: true,
    provider: 'twilio',
    rateLimitPerMinute: 30
  }
  // ... other channels
}
```

## API Reference

### Core Endpoints

#### Send Notification
```http
POST /api/notifications
Content-Type: application/json

{
  "userId": "user123",
  "type": "welcome",
  "channel": "email",
  "priority": "normal",
  "data": {
    "email": "user@example.com",
    "message": "Welcome to our service!",
    "actionUrl": "https://app.example.com/welcome"
  }
}
```

#### Send from Template
```http
POST /api/notifications/template
Content-Type: application/json

{
  "userId": "user123",
  "templateId": "welcome-email",
  "channel": "email",
  "data": {
    "email": "user@example.com",
    "firstName": "John",
    "activationLink": "https://app.example.com/activate/abc123"
  }
}
```

#### Batch Notifications
```http
POST /api/notifications/batch
Content-Type: application/json

{
  "notifications": [
    {
      "userId": "user1",
      "type": "reminder",
      "channel": "email",
      "data": { /* notification data */ }
    },
    {
      "userId": "user2",
      "type": "reminder", 
      "channel": "sms",
      "data": { /* notification data */ }
    }
  ]
}
```

### Monitoring Endpoints

#### Health Check
```http
GET /health
```

#### Metrics (Prometheus format)
```http
GET /metrics
```

#### Service Status
```http
GET /api/metrics
```

## Usage Examples

### Basic Email Notification

```typescript
import { NotificationService, Notification, NotificationChannel, NotificationPriority } from './src';

const notification = new Notification(
  'notif_123',
  'user123',
  'welcome',
  NotificationChannel.EMAIL,
  NotificationPriority.NORMAL,
  {
    email: 'user@example.com',
    subject: 'Welcome!',
    message: 'Welcome to our service!'
  }
);

await notificationService.sendNotification(notification);
```

### Template-Based Notification

```typescript
// Create template
const template = new NotificationTemplate(
  'welcome-email',
  'Welcome Email',
  NotificationChannel.EMAIL,
  'Welcome {{firstName}}! Click {{activationLink}} to activate.',
  ['firstName', 'activationLink'],
  true,
  'Welcome to {{companyName}}'
);

// Send notification using template
await notificationService.sendFromTemplate(
  'user123',
  'welcome-email',
  {
    firstName: 'John',
    activationLink: 'https://app.com/activate/abc',
    companyName: 'Acme Corp'
  },
  NotificationChannel.EMAIL
);
```

### Real-time WebSocket Notifications

```typescript
// Client-side connection
const socket = io('http://localhost:3001/notifications');

socket.emit('authenticate', { 
  userId: 'user123', 
  token: 'auth-token' 
});

socket.on('notification', (notification) => {
  console.log('Received notification:', notification);
  // Handle notification in UI
});

// Server will automatically send notifications to connected users
```

## Architecture Deep Dive

### Class Hierarchy

```
NotificationService (Facade)
├── ChannelFactory (Factory Pattern)
│   ├── EmailChannel (Strategy)
│   ├── SmsChannel (Strategy)
│   ├── PushChannel (Strategy)
│   └── WebSocketChannel (Strategy)
├── NotificationQueue (Producer-Consumer)
├── RetryStrategy (Strategy Pattern)
│   ├── ExponentialBackoffStrategy
│   ├── LinearBackoffStrategy
│   └── AdaptiveRetryStrategy
├── NotificationRenderer (Template Method)
│   ├── EmailRenderer
│   ├── SmsRenderer
│   └── PushRenderer
└── MonitoringService (Observer)
```

### Data Flow

1. **Request Reception**: REST API receives notification request
2. **Validation**: Request validated and notification object created
3. **Template Rendering**: If template specified, content rendered with data
4. **Queue Insertion**: Notification added to priority queue
5. **Channel Selection**: Factory creates appropriate channel instance
6. **Delivery Attempt**: Channel attempts delivery with timeout
7. **Result Processing**: Success/failure handled with retry logic
8. **Observer Notification**: Status changes broadcast to observers
9. **Metrics Collection**: Performance and delivery metrics updated

### Error Handling Strategy

The service implements comprehensive error handling:

- **Validation Errors**: Input validation with detailed error messages
- **Channel Errors**: Channel-specific error handling and recovery
- **Rate Limiting**: Automatic backoff when limits exceeded
- **Circuit Breaker**: Fail-fast for consistently failing services
- **Graceful Degradation**: Continue operating when individual channels fail

## Monitoring and Observability

### Built-in Metrics

- Notification counts by channel and status
- Average processing and delivery times
- Error rates and retry statistics
- Queue depth and processing rates
- Channel health and availability

### Health Checks

- Service overall health
- Individual channel health
- Database connectivity (when implemented)
- External service dependencies
- Resource utilization (memory, CPU)

### Alerting

Configurable alerts for:
- High error rates (>5% default)
- Slow response times (>5s default)
- Large queue sizes (>1000 default)
- Channel failures
- Resource exhaustion

## Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint
```

## Performance Considerations

### Scalability Features

- **Horizontal Scaling**: Stateless service design
- **Queue-Based Processing**: Async processing with backpressure
- **Connection Pooling**: Efficient resource utilization
- **Batch Processing**: Bulk operations where supported
- **Caching**: Template and configuration caching

### Performance Tuning

Key configuration parameters:

```env
QUEUE_BATCH_SIZE=10          # Process notifications in batches
QUEUE_PROCESSING_INTERVAL=1000  # Queue check frequency (ms)
EMAIL_RATE_LIMIT=60          # Max emails per minute
SMS_RATE_LIMIT=30            # Max SMS per minute
PUSH_RATE_LIMIT=120          # Max push notifications per minute
```

## Security

### Implemented Security Measures

- **Input Validation**: Comprehensive request validation
- **Rate Limiting**: Prevent abuse and DoS attacks
- **CORS Configuration**: Proper cross-origin settings
- **Helmet.js**: Security headers and protections
- **Sensitive Data Handling**: Credentials safely managed
- **Error Sanitization**: No sensitive data in error responses

### Security Best Practices

- Store secrets in environment variables
- Use HTTPS in production
- Implement proper authentication/authorization
- Regular security audits and dependency updates
- Monitor for suspicious activity patterns

## Production Deployment

### Recommended Architecture

```
[Load Balancer] 
    ↓
[Notification Service Instances] × N
    ↓
[Redis/Queue Service]
    ↓
[External Services: SMTP, Twilio, FCM, etc.]
```

### Environment Configuration

#### Development
```env
NODE_ENV=development
LOG_LEVEL=debug
EMAIL_ENABLED=true
SMS_ENABLED=false
PUSH_ENABLED=false
```

#### Production
```env
NODE_ENV=production
LOG_LEVEL=info
LOG_FILE_ENABLED=true
METRICS_ENABLED=true
ALERTING_ENABLED=true
```

### Deployment Checklist

- [ ] Environment variables configured
- [ ] SMTP credentials tested
- [ ] External service credentials validated
- [ ] Health checks responding
- [ ] Monitoring and alerting active
- [ ] Log aggregation configured
- [ ] Backup and recovery procedures
- [ ] Security headers and HTTPS enabled

## Troubleshooting

### Common Issues

#### Email Delivery Issues
```bash
# Check SMTP configuration
curl -X GET http://localhost:3000/health

# Test email channel
curl -X POST http://localhost:3000/api/notifications \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","type":"test","channel":"email","data":{"email":"test@example.com","message":"Test"}}'
```

#### Queue Processing Issues
```bash
# Check queue status
curl -X GET http://localhost:3000/api/metrics

# Monitor logs
tail -f logs/notification-service.log
```

#### Performance Issues
```bash
# Check metrics endpoint
curl -X GET http://localhost:3000/metrics

# Monitor resource usage
docker stats notification-service
```

### Debug Mode

Enable detailed logging:
```env
LOG_LEVEL=debug
```

## Contributing

### Development Setup

```bash
git clone https://github.com/signaai/notification-service.git
cd notification-service
npm install
cp .env.example .env
npm run dev
```

### Code Style

- Follow TypeScript strict mode
- Use ESLint and Prettier for formatting
- Write comprehensive tests for new features
- Document public APIs and complex logic
- Follow SOLID principles and design patterns

### Pull Request Process

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- Documentation: [GitHub Wiki](https://github.com/signaai/notification-service/wiki)
- Issues: [GitHub Issues](https://github.com/signaai/notification-service/issues)
- Discussions: [GitHub Discussions](https://github.com/signaai/notification-service/discussions)

---

Built with ❤️ by the SignaAI Team