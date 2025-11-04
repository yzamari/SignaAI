import { Request, Response } from 'express';
import { DocumentService } from '../services/DocumentService';
import { CreateDocumentRequest, UpdateDocumentRequest, DocumentSearchCriteria } from '../types/DocumentTypes';

/**
 * Document Controller - HTTP endpoint handler
 * Implements dependency injection pattern and follows REST conventions.
 * 
 * Follows SOLID principles:
 * - Single Responsibility: HTTP request/response handling only
 * - Open/Closed: Extensible through middleware and dependency injection
 * - Liskov Substitution: Can be replaced with other controller implementations
 * - Interface Segregation: Focused on document HTTP operations
 * - Dependency Inversion: Depends on DocumentService abstraction
 */
export class DocumentController {
    private readonly documentService: DocumentService;

    constructor(documentService: DocumentService) {
        this.documentService = documentService;
    }

    /**
     * Creates a new document
     * POST /api/documents
     */
    public async createDocument(req: Request, res: Response): Promise<void> {
        try {
            const request: CreateDocumentRequest = req.body;
            const userId = this.extractUserId(req);

            const document = await this.documentService.createDocument(request, userId);

            res.status(201).json({
                success: true,
                data: document.toJSON(),
                message: 'Document created successfully'
            });
        } catch (error) {
            this.handleError(error, res);
        }
    }

    /**
     * Retrieves a document by ID
     * GET /api/documents/:id
     */
    public async getDocument(req: Request, res: Response): Promise<void> {
        try {
            const documentId = req.params.id;
            const userId = this.extractUserId(req);

            const document = await this.documentService.getDocument(documentId, userId);

            if (!document) {
                res.status(404).json({
                    success: false,
                    message: 'Document not found'
                });
                return;
            }

            res.json({
                success: true,
                data: document.toJSON()
            });
        } catch (error) {
            this.handleError(error, res);
        }
    }

    /**
     * Updates an existing document
     * PUT /api/documents/:id
     */
    public async updateDocument(req: Request, res: Response): Promise<void> {
        try {
            const documentId = req.params.id;
            const request: UpdateDocumentRequest = req.body;
            const userId = this.extractUserId(req);

            const document = await this.documentService.updateDocument(documentId, request, userId);

            res.json({
                success: true,
                data: document.toJSON(),
                message: 'Document updated successfully'
            });
        } catch (error) {
            this.handleError(error, res);
        }
    }

    /**
     * Deletes a document
     * DELETE /api/documents/:id
     */
    public async deleteDocument(req: Request, res: Response): Promise<void> {
        try {
            const documentId = req.params.id;
            const userId = this.extractUserId(req);
            const reason = req.body.reason;

            const deleted = await this.documentService.deleteDocument(documentId, userId, reason);

            if (!deleted) {
                res.status(404).json({
                    success: false,
                    message: 'Document not found'
                });
                return;
            }

            res.json({
                success: true,
                message: 'Document deleted successfully'
            });
        } catch (error) {
            this.handleError(error, res);
        }
    }

    /**
     * Uploads a new version of a document
     * POST /api/documents/:id/versions
     */
    public async uploadDocumentVersion(req: Request, res: Response): Promise<void> {
        try {
            const documentId = req.params.id;
            const userId = this.extractUserId(req);
            const changeDescription = req.body.changeDescription;

            if (!req.file) {
                res.status(400).json({
                    success: false,
                    message: 'File is required'
                });
                return;
            }

            const file = {
                originalName: req.file.originalname,
                mimeType: req.file.mimetype,
                size: req.file.size,
                buffer: req.file.buffer
            };

            const version = await this.documentService.uploadDocumentVersion(
                documentId,
                file,
                userId,
                changeDescription
            );

            res.status(201).json({
                success: true,
                data: version.toJSON(),
                message: 'Document version uploaded successfully'
            });
        } catch (error) {
            this.handleError(error, res);
        }
    }

    /**
     * Processes a document version
     * POST /api/documents/:id/versions/:versionId/process
     */
    public async processDocument(req: Request, res: Response): Promise<void> {
        try {
            const documentId = req.params.id;
            const versionId = req.params.versionId;
            const userId = this.extractUserId(req);
            const options = req.body.options || {};

            const result = await this.documentService.processDocument(
                documentId,
                versionId,
                options,
                userId
            );

            res.json({
                success: true,
                data: result,
                message: 'Document processed successfully'
            });
        } catch (error) {
            this.handleError(error, res);
        }
    }

    /**
     * Searches for documents
     * GET /api/documents/search
     */
    public async searchDocuments(req: Request, res: Response): Promise<void> {
        try {
            const userId = this.extractUserId(req);
            const criteria: DocumentSearchCriteria = {
                name: req.query.name as string,
                type: req.query.type as any,
                status: req.query.status as any,
                tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
                categories: req.query.categories ? (req.query.categories as string).split(',') : undefined,
                templateId: req.query.templateId as string,
                workflowId: req.query.workflowId as string,
                limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
                offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
                sortBy: req.query.sortBy as any,
                sortOrder: req.query.sortOrder as any
            };

            // Handle date filters
            if (req.query.createdAfter) {
                criteria.createdAfter = new Date(req.query.createdAfter as string);
            }
            if (req.query.createdBefore) {
                criteria.createdBefore = new Date(req.query.createdBefore as string);
            }
            if (req.query.updatedAfter) {
                criteria.updatedAfter = new Date(req.query.updatedAfter as string);
            }
            if (req.query.updatedBefore) {
                criteria.updatedBefore = new Date(req.query.updatedBefore as string);
            }

            const documents = await this.documentService.searchDocuments(criteria, userId);

            res.json({
                success: true,
                data: documents.map(doc => doc.toJSON()),
                count: documents.length
            });
        } catch (error) {
            this.handleError(error, res);
        }
    }

    /**
     * Gets document statistics
     * GET /api/documents/statistics
     */
    public async getStatistics(req: Request, res: Response): Promise<void> {
        try {
            const userId = this.extractUserId(req);
            const statistics = await this.documentService.getDocumentStatistics(userId);

            res.json({
                success: true,
                data: statistics
            });
        } catch (error) {
            this.handleError(error, res);
        }
    }

    /**
     * Downloads a document version
     * GET /api/documents/:id/versions/:versionId/download
     */
    public async downloadDocumentVersion(req: Request, res: Response): Promise<void> {
        try {
            const documentId = req.params.id;
            const versionId = req.params.versionId;
            const userId = this.extractUserId(req);

            // First check if user has access to the document
            const document = await this.documentService.getDocument(documentId, userId);
            if (!document) {
                res.status(404).json({
                    success: false,
                    message: 'Document not found'
                });
                return;
            }

            // Find the version
            const version = document.versions.find(v => v.id === versionId);
            if (!version) {
                res.status(404).json({
                    success: false,
                    message: 'Document version not found'
                });
                return;
            }

            // Set appropriate headers for file download
            res.setHeader('Content-Type', version.mimeType);
            res.setHeader('Content-Disposition', `attachment; filename="${version.originalFileName}"`);
            res.setHeader('Content-Length', version.fileSize.toString());

            // In a real implementation, you would stream the file from storage
            res.json({
                success: true,
                message: 'File download would be implemented here',
                data: {
                    filePath: version.filePath,
                    fileName: version.originalFileName,
                    mimeType: version.mimeType,
                    size: version.fileSize
                }
            });
        } catch (error) {
            this.handleError(error, res);
        }
    }

    // Private helper methods

    private extractUserId(req: Request): string {
        // Extract user ID from request (from JWT token, session, etc.)
        // For now, return a mock user ID
        return req.headers['x-user-id'] as string || 'mock-user-id';
    }

    private handleError(error: any, res: Response): void {
        console.error('Controller error:', error);

        let statusCode = 500;
        let message = 'Internal server error';

        if (error.message) {
            message = error.message;

            // Determine status code based on error type
            if (error.message.includes('not found')) {
                statusCode = 404;
            } else if (error.message.includes('required') || 
                      error.message.includes('invalid') || 
                      error.message.includes('cannot exceed')) {
                statusCode = 400;
            } else if (error.message.includes('unauthorized') || 
                      error.message.includes('permission')) {
                statusCode = 403;
            }
        }

        res.status(statusCode).json({
            success: false,
            message,
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}