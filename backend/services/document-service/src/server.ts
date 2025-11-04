import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { Database } from 'sqlite3';
import path from 'path';

// Import our service classes
import { DocumentController } from './controllers/DocumentController';
import { DocumentService } from './services/DocumentService';
import { SQLiteDocumentRepository } from './repositories/SQLiteDocumentRepository';
import { DocumentFactory } from './factories/DocumentFactory';

// Import interfaces for dependency injection
import { IDocumentRepository } from './interfaces/IDocumentRepository';
import { IStorageService } from './interfaces/IStorageService';
import { IDocumentProcessor } from './interfaces/IDocumentProcessor';
import { IEventPublisher } from './interfaces/IEventPublisher';

/**
 * Document Service Server
 * Implements Dependency Injection pattern for loose coupling and testability.
 * 
 * Architecture:
 * - Express.js web framework
 * - Dependency injection container
 * - Clean separation of concerns
 * - Proper error handling and middleware
 */

/**
 * Dependency Injection Container
 * Manages service dependencies and their lifecycle
 */
class DIContainer {
    private services: Map<string, any> = new Map();
    private database: Database;

    constructor() {
        this.initializeDatabase();
        this.registerServices();
    }

    private initializeDatabase(): void {
        const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/documents.db');
        this.database = new Database(dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
                process.exit(1);
            }
            console.log('Connected to SQLite database');
        });
    }

    private registerServices(): void {
        // Register repository
        const documentRepository = new SQLiteDocumentRepository(this.database);
        this.services.set('documentRepository', documentRepository);

        // Register storage service (mock implementation)
        const storageService = new MockStorageService();
        this.services.set('storageService', storageService);

        // Register document processor (mock implementation)
        const documentProcessor = new MockDocumentProcessor();
        this.services.set('documentProcessor', documentProcessor);

        // Register event publisher (mock implementation)
        const eventPublisher = new MockEventPublisher();
        this.services.set('eventPublisher', eventPublisher);

        // Register document service
        const documentService = new DocumentService(
            documentRepository,
            storageService,
            documentProcessor,
            eventPublisher
        );
        this.services.set('documentService', documentService);

        // Register controller
        const documentController = new DocumentController(documentService);
        this.services.set('documentController', documentController);
    }

    public get<T>(serviceName: string): T {
        const service = this.services.get(serviceName);
        if (!service) {
            throw new Error(`Service ${serviceName} not found`);
        }
        return service;
    }

    public shutdown(): void {
        if (this.database) {
            this.database.close((err) => {
                if (err) {
                    console.error('Error closing database:', err.message);
                } else {
                    console.log('Database connection closed');
                }
            });
        }
    }
}

/**
 * Mock Storage Service for demonstration
 * In production, this would be replaced with AWS S3, Google Cloud Storage, etc.
 */
class MockStorageService implements IStorageService {
    async store(file: any, path?: string): Promise<any> {
        return {
            filePath: `/mock/storage/${Date.now()}_${file.originalName}`,
            fileName: `${Date.now()}_${file.originalName}`,
            size: file.size,
            hash: file.hash || 'mock-hash',
            url: `http://localhost:3000/files/${Date.now()}_${file.originalName}`
        };
    }

    async retrieve(filePath: string): Promise<Buffer> {
        return Buffer.from('mock file content');
    }

    async getInfo(filePath: string): Promise<any> {
        return {
            path: filePath,
            name: path.basename(filePath),
            size: 1024,
            lastModified: new Date(),
            contentType: 'application/octet-stream'
        };
    }

    async exists(filePath: string): Promise<boolean> {
        return true;
    }

    async delete(filePath: string): Promise<boolean> {
        return true;
    }

    async copy(sourcePath: string, destinationPath: string): Promise<any> {
        return this.getInfo(destinationPath);
    }

    async move(sourcePath: string, destinationPath: string): Promise<any> {
        return this.getInfo(destinationPath);
    }

    async list(options?: any): Promise<any[]> {
        return [];
    }

    async generateSignedUrl(filePath: string, expirationTime: number): Promise<string> {
        return `http://localhost:3000/signed/${filePath}?expires=${expirationTime}`;
    }
}

/**
 * Mock Document Processor for demonstration
 * In production, this would integrate with OCR services, PDF processors, etc.
 */
class MockDocumentProcessor implements IDocumentProcessor {
    async process(documentVersion: any, options: any): Promise<any> {
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 1000));

        return {
            success: true,
            processingTime: 1000,
            extractedText: 'Mock extracted text from document',
            extractedFields: [
                {
                    id: 'field1',
                    name: 'Mock Field',
                    value: 'Mock Value',
                    confidence: 0.95
                }
            ],
            metadata: {
                pageCount: 1,
                language: 'en'
            }
        };
    }

    async canProcess(documentVersion: any): Promise<boolean> {
        const supportedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
        return supportedTypes.includes(documentVersion.mimeType);
    }

    getSupportedMimeTypes(): string[] {
        return ['application/pdf', 'image/jpeg', 'image/png'];
    }

    getDefaultOptions(mimeType: string): any {
        return {
            performOCR: true,
            extractFields: true,
            generateThumbnails: true
        };
    }

    async estimateProcessingTime(documentVersion: any, options: any): Promise<number> {
        return 1000; // 1 second
    }
}

/**
 * Mock Event Publisher for demonstration
 * In production, this would integrate with message queues, webhooks, etc.
 */
class MockEventPublisher implements IEventPublisher {
    async publish(event: any): Promise<void> {
        console.log('Publishing event:', event.type, event.id);
    }

    async publishBatch(events: any[]): Promise<void> {
        for (const event of events) {
            await this.publish(event);
        }
    }

    async scheduleEvent(event: any, publishAt: Date): Promise<string> {
        console.log('Scheduling event:', event.type, 'for', publishAt);
        return `scheduled-${event.id}`;
    }

    async cancelScheduledEvent(scheduledEventId: string): Promise<boolean> {
        console.log('Cancelling scheduled event:', scheduledEventId);
        return true;
    }

    async getStatistics(): Promise<any> {
        return {
            totalPublished: 100,
            publishRate: 10.5,
            errorRate: 0.1,
            averagePublishTime: 50
        };
    }
}

/**
 * Express Application Setup
 */
function createApp(container: DIContainer): express.Application {
    const app = express();

    // Middleware
    app.use(cors());
    app.use(express.json({ limit: '100mb' }));
    app.use(express.urlencoded({ extended: true, limit: '100mb' }));

    // Multer for file uploads
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize: 100 * 1024 * 1024 // 100MB
        }
    });

    // Get controller from DI container
    const documentController = container.get<DocumentController>('documentController');

    // Routes
    app.post('/api/documents', documentController.createDocument.bind(documentController));
    app.get('/api/documents/search', documentController.searchDocuments.bind(documentController));
    app.get('/api/documents/statistics', documentController.getStatistics.bind(documentController));
    app.get('/api/documents/:id', documentController.getDocument.bind(documentController));
    app.put('/api/documents/:id', documentController.updateDocument.bind(documentController));
    app.delete('/api/documents/:id', documentController.deleteDocument.bind(documentController));
    
    app.post('/api/documents/:id/versions', 
        upload.single('file'), 
        documentController.uploadDocumentVersion.bind(documentController)
    );
    
    app.post('/api/documents/:id/versions/:versionId/process', 
        documentController.processDocument.bind(documentController)
    );
    
    app.get('/api/documents/:id/versions/:versionId/download', 
        documentController.downloadDocumentVersion.bind(documentController)
    );

    // Health check endpoint
    app.get('/health', (req, res) => {
        res.json({
            status: 'healthy',
            service: 'document-service',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    });

    // Error handling middleware
    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
        console.error('Unhandled error:', err);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    });

    // 404 handler
    app.use((req: express.Request, res: express.Response) => {
        res.status(404).json({
            success: false,
            message: 'Endpoint not found'
        });
    });

    return app;
}

/**
 * Server Startup
 */
function startServer(): void {
    const container = new DIContainer();
    const app = createApp(container);
    
    const port = process.env.PORT || 3003;

    const server = app.listen(port, () => {
        console.log(`Document Service listening on port ${port}`);
        console.log(`Health check: http://localhost:${port}/health`);
        console.log(`API docs: http://localhost:${port}/api/documents`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
        console.log('SIGTERM received, shutting down gracefully');
        server.close(() => {
            container.shutdown();
            process.exit(0);
        });
    });

    process.on('SIGINT', () => {
        console.log('SIGINT received, shutting down gracefully');
        server.close(() => {
            container.shutdown();
            process.exit(0);
        });
    });
}

// Start the server if this file is run directly
if (require.main === module) {
    startServer();
}

export { createApp, DIContainer };