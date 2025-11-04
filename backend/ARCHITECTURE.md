# SignaAI Microservices Architecture

## Overview

The SignaAI backend has been refactored from a monolithic architecture to a microservices architecture following Object-Oriented Programming (OOP) principles and SOLID design patterns. This architecture provides better scalability, maintainability, and separation of concerns.

## Architecture Principles

### SOLID Principles Applied

1. **Single Responsibility Principle (SRP)**
   - Each microservice handles a single business domain
   - Each class has a single, well-defined responsibility
   - Repository classes handle data access, Service classes handle business logic, Controllers handle HTTP requests

2. **Open/Closed Principle (OCP)**
   - Base classes provide extension points through abstract methods
   - New features can be added by extending base classes without modifying existing code
   - Strategy pattern allows algorithm variations without changing client code

3. **Liskov Substitution Principle (LSP)**
   - All derived classes can be substituted for their base classes
   - Interface contracts are properly maintained in implementations
   - Type hierarchies follow behavioral consistency

4. **Interface Segregation Principle (ISP)**
   - Interfaces are focused and cohesive
   - Clients depend only on the methods they use
   - Multiple specific interfaces instead of one general-purpose interface

5. **Dependency Inversion Principle (DIP)**
   - High-level modules depend on abstractions (interfaces)
   - Dependency injection container manages object creation and lifecycle
   - All dependencies are injected rather than instantiated directly

### Design Patterns Implemented

1. **Repository Pattern**
   - Abstracts data access logic
   - Provides a uniform interface for data operations
   - Enables easy switching between different data sources

2. **Factory Pattern**
   - Used for creating complex objects
   - Signature field creation uses factory pattern
   - Service instantiation through DI container

3. **Observer Pattern**
   - Event-driven architecture with EventBus
   - Microservices communicate through events
   - Loose coupling between services

4. **Strategy Pattern**
   - Different workflow execution strategies
   - Authentication strategies (JWT, OAuth, etc.)
   - Notification delivery strategies

5. **Template Method Pattern**
   - Base classes define algorithm structure
   - Derived classes implement specific steps
   - Used in BaseService and BaseRepository

6. **Dependency Injection Pattern**
   - IoC container manages dependencies
   - Constructor injection for required dependencies
   - Promotes testability and flexibility

7. **Gateway Pattern**
   - API Gateway handles routing and aggregation
   - Single entry point for client applications
   - Cross-cutting concerns handled centrally

## Microservices

### 1. API Gateway (Port 5100)
**Responsibilities:**
- Request routing to appropriate microservices
- Authentication and authorization
- Rate limiting and throttling
- Request/response transformation
- Service discovery and load balancing
- CORS handling
- Monitoring and logging

**Key Classes:**
- `ApiGateway`: Main gateway class with routing logic
- `RouteConfig`: Configuration for service routes
- Authentication and authorization middleware

### 2. Authentication Service (Port 5001)
**Responsibilities:**
- User registration and login
- Token generation and validation
- Password management
- Role-based access control
- User profile management

**Key Classes:**
- `User`: Domain entity with business rules
- `UserRepository`: Data access layer
- `AuthenticationService`: Business logic
- `JwtTokenService`: JWT token handling
- `BcryptPasswordService`: Password hashing
- `AuthController`: HTTP endpoint handling

**Design Patterns:**
- Repository Pattern for data access
- Factory Pattern for token generation
- Strategy Pattern for authentication methods

### 3. Document Service (Port 5002)
**Responsibilities:**
- Document upload and storage
- Document metadata management
- Version control
- Access control
- OCR processing integration

**Design Patterns:**
- Repository Pattern for document storage
- Factory Pattern for document creation
- Observer Pattern for document events

### 4. Signature Service (Port 5003)
**Responsibilities:**
- Signature field management
- Signature validation
- Digital signature creation
- Signature placement on documents
- Certificate management

**Design Patterns:**
- Factory Pattern for signature creation
- Strategy Pattern for signature types
- Chain of Responsibility for validation

### 5. Workflow Service (Port 5005)
**Responsibilities:**
- Workflow creation and management
- Signing order enforcement
- Deadline management
- Workflow status tracking
- Completion notifications

**Design Patterns:**
- Strategy Pattern for workflow types (sequential, parallel)
- State Pattern for workflow status
- Observer Pattern for status changes

### 6. Notification Service (Port 5004)
**Responsibilities:**
- Email notifications
- SMS notifications
- In-app notifications
- Notification templates
- Delivery tracking

**Design Patterns:**
- Observer Pattern for event subscriptions
- Strategy Pattern for delivery methods
- Template Pattern for notification formatting

## Shared Components

### Core Abstractions
Located in `/shared/core/`:

1. **BaseEntity**: Abstract base class for all domain entities
2. **BaseRepository**: Abstract repository with common CRUD operations
3. **BaseService**: Abstract service with common patterns
4. **IRepository**: Repository interface definition
5. **DependencyContainer**: IoC container for dependency injection
6. **ServiceRegistry**: Service discovery and registration

### Exception Hierarchy
Located in `/shared/exceptions/`:

1. **BaseException**: Root exception class
2. **BusinessRuleException**: Business logic violations
3. **ValidationException**: Input validation failures
4. **NotFoundException**: Resource not found
5. **UnauthorizedException**: Authentication failures
6. **ForbiddenException**: Authorization failures
7. **ServiceUnavailableException**: Service communication failures

### Messaging System
Located in `/shared/messaging/`:

1. **EventBus**: Centralized event management
2. **DomainEvent**: Base class for domain events
3. **IEventHandler**: Interface for event handlers
4. **EventAggregator**: Batch event processing

## Communication Patterns

### Synchronous Communication
- HTTP REST APIs between services
- Request/response pattern
- Used for immediate operations

### Asynchronous Communication
- Event-driven architecture with EventBus
- Publish/subscribe pattern
- Used for eventual consistency

### Service Discovery
- ServiceRegistry maintains service instances
- Health checks for service availability
- Load balancing across instances

## Database Architecture

Each microservice has its own database following the Database per Service pattern:
- Authentication Service: User data, sessions
- Document Service: Document metadata, versions
- Signature Service: Signature data, certificates
- Workflow Service: Workflow definitions, status
- Notification Service: Notification logs, templates

## Security

### Authentication
- JWT tokens for stateless authentication
- Refresh tokens for session management
- Token revocation support

### Authorization
- Role-based access control (RBAC)
- Permission-based authorization
- Service-to-service authentication

### Data Protection
- Password hashing with bcrypt
- Encrypted communication between services
- Input validation and sanitization

## Scalability Features

1. **Horizontal Scaling**: Each service can be scaled independently
2. **Load Balancing**: Multiple instances with round-robin distribution
3. **Caching**: Redis for session and data caching
4. **Message Queue**: RabbitMQ for asynchronous processing
5. **Database Optimization**: Connection pooling, query optimization

## Monitoring and Observability

1. **Health Checks**: Each service exposes `/health` endpoint
2. **Logging**: Structured logging with correlation IDs
3. **Metrics**: Service performance metrics
4. **Tracing**: Request tracing across services

## Development Setup

### Prerequisites
- Node.js 16+
- Docker and Docker Compose
- TypeScript 5+

### Running Locally

1. Install dependencies:
```bash
# Install shared dependencies
cd backend
npm install

# Install service dependencies
cd services/auth-service && npm install
cd ../api-gateway && npm install
# Repeat for other services
```

2. Start with Docker Compose:
```bash
docker-compose up -d
```

3. Or run services individually:
```bash
# Terminal 1 - Auth Service
cd services/auth-service
npm run dev

# Terminal 2 - API Gateway
cd services/api-gateway
npm run dev

# Continue for other services...
```

### Environment Variables

Create `.env` file in backend directory:
```env
NODE_ENV=development
JWT_ACCESS_SECRET=your-access-secret
JWT_REFRESH_SECRET=your-refresh-secret
CORS_ORIGINS=http://localhost:3000
DATABASE_URL=./signaai.db
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://localhost:5672
```

## API Endpoints

All endpoints go through the API Gateway at `http://localhost:5100`

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh token
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/password` - Update password

### Documents
- `GET /api/documents` - List documents
- `POST /api/documents` - Upload document
- `GET /api/documents/:id` - Get document
- `PUT /api/documents/:id` - Update document
- `DELETE /api/documents/:id` - Delete document

### Signatures
- `POST /api/signatures` - Create signature
- `GET /api/signatures/:id` - Get signature
- `POST /api/signatures/validate` - Validate signature

### Workflows
- `POST /api/workflows` - Create workflow
- `GET /api/workflows/:id` - Get workflow
- `PUT /api/workflows/:id/status` - Update status
- `POST /api/workflows/:id/complete` - Complete workflow

### Notifications
- `POST /api/notifications/send` - Send notification
- `GET /api/notifications` - List notifications
- `PUT /api/notifications/:id/read` - Mark as read

## Testing

### Unit Tests
```bash
cd services/auth-service
npm test
```

### Integration Tests
```bash
npm run test:integration
```

### End-to-End Tests
```bash
npm run test:e2e
```

## Deployment

### Docker Deployment
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Kubernetes Deployment
```bash
kubectl apply -f k8s/
```

## Benefits of This Architecture

1. **Maintainability**: Clear separation of concerns, SOLID principles
2. **Scalability**: Independent scaling of services
3. **Flexibility**: Easy to add new services or modify existing ones
4. **Testability**: Dependency injection enables easy mocking
5. **Reliability**: Service isolation prevents cascade failures
6. **Development Speed**: Teams can work independently on services

## Future Enhancements

1. **GraphQL Gateway**: Add GraphQL layer for flexible querying
2. **Service Mesh**: Implement Istio for advanced traffic management
3. **CQRS Pattern**: Separate read and write models
4. **Event Sourcing**: Store events for audit and replay
5. **Distributed Tracing**: Implement OpenTelemetry
6. **Circuit Breaker**: Add resilience patterns
7. **API Versioning**: Support multiple API versions
8. **Automated Testing**: CI/CD pipeline with comprehensive tests