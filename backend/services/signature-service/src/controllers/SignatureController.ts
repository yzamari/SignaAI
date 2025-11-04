import { Request, Response, NextFunction } from 'express';
import { SignatureService } from '../services/SignatureService';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { SignatureType, SignatureStatus, VerificationMethod } from '../models/Signature';

/**
 * Request validation DTOs
 */
class CreateSignatureDTO {
  documentId!: string;
  signerId!: string;
  fieldId!: string;
  type!: SignatureType;
  verificationMethod?: VerificationMethod;
  metadata?: any;
  expiresIn?: number;
}

class ApplySignatureDTO {
  data!: string;
  options?: any;
  metadata?: any;
}

class VerifySignatureDTO {
  verificationData?: any;
  verifiedBy?: string;
}

class BatchSignatureDTO {
  documentId!: string;
  signers!: Array<{
    signerId: string;
    fieldId: string;
    type: SignatureType;
  }>;
  verificationMethod?: VerificationMethod;
}

/**
 * Signature Controller
 * Handles HTTP requests and responses
 * Follows Single Responsibility Principle - only handles HTTP concerns
 */
export class SignatureController {
  constructor(private readonly signatureService: SignatureService) {}

  /**
   * Create a new signature
   * POST /api/signatures
   */
  async createSignature(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate request body
      const dto = plainToClass(CreateSignatureDTO, req.body);
      const errors = await validate(dto);
      
      if (errors.length > 0) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.map(e => Object.values(e.constraints || {})).flat()
        });
        return;
      }

      // Create signature
      const signature = await this.signatureService.createSignature({
        documentId: dto.documentId,
        signerId: dto.signerId,
        fieldId: dto.fieldId,
        type: dto.type,
        verificationMethod: dto.verificationMethod,
        metadata: dto.metadata,
        expiresIn: dto.expiresIn
      });

      res.status(201).json({
        success: true,
        data: signature.toJSON()
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Apply signature data
   * POST /api/signatures/:id/apply
   */
  async applySignature(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      
      // Validate request body
      const dto = plainToClass(ApplySignatureDTO, req.body);
      const errors = await validate(dto);
      
      if (errors.length > 0) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.map(e => Object.values(e.constraints || {})).flat()
        });
        return;
      }

      // Apply signature
      const result = await this.signatureService.applySignature({
        signatureId: id,
        data: dto.data,
        options: dto.options,
        metadata: dto.metadata
      });

      res.json({
        success: true,
        data: {
          hash: result.hash,
          thumbnail: result.thumbnail,
          metadata: result.metadata
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify signature
   * POST /api/signatures/:id/verify
   */
  async verifySignature(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      
      // Validate request body
      const dto = plainToClass(VerifySignatureDTO, req.body);
      const errors = await validate(dto);
      
      if (errors.length > 0) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.map(e => Object.values(e.constraints || {})).flat()
        });
        return;
      }

      // Verify signature
      const signature = await this.signatureService.verifySignature({
        signatureId: id,
        verificationData: dto.verificationData,
        verifiedBy: dto.verifiedBy || (req as any).user?.id
      });

      res.json({
        success: true,
        data: signature.toJSON()
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reject signature
   * POST /api/signatures/:id/reject
   */
  async rejectSignature(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        res.status(400).json({
          error: 'Reason is required for rejection'
        });
        return;
      }

      const signature = await this.signatureService.rejectSignature(id, reason);

      res.json({
        success: true,
        data: signature.toJSON()
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get signature by ID
   * GET /api/signatures/:id
   */
  async getSignature(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const signature = await this.signatureService.getSignatureById(id);

      if (!signature) {
        res.status(404).json({
          error: 'Signature not found'
        });
        return;
      }

      res.json({
        success: true,
        data: signature.toJSON()
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get signatures by document
   * GET /api/signatures/document/:documentId
   */
  async getDocumentSignatures(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { documentId } = req.params;
      const signatures = await this.signatureService.getDocumentSignatures(documentId);

      res.json({
        success: true,
        data: signatures.map(s => s.toJSON()),
        count: signatures.length
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get signatures by signer
   * GET /api/signatures/signer/:signerId
   */
  async getSignerSignatures(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { signerId } = req.params;
      const signatures = await this.signatureService.getSignerSignatures(signerId);

      res.json({
        success: true,
        data: signatures.map(s => s.toJSON()),
        count: signatures.length
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get signatures by status
   * GET /api/signatures/status/:status
   */
  async getSignaturesByStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status } = req.params;
      
      if (!Object.values(SignatureStatus).includes(status as SignatureStatus)) {
        res.status(400).json({
          error: `Invalid status: ${status}`
        });
        return;
      }

      const signatures = await this.signatureService.getSignaturesByStatus(status as SignatureStatus);

      res.json({
        success: true,
        data: signatures.map(s => s.toJSON()),
        count: signatures.length
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create batch signatures
   * POST /api/signatures/batch
   */
  async createBatchSignatures(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate request body
      const dto = plainToClass(BatchSignatureDTO, req.body);
      const errors = await validate(dto);
      
      if (errors.length > 0) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.map(e => Object.values(e.constraints || {})).flat()
        });
        return;
      }

      const signatures = await this.signatureService.createBatchSignatures({
        documentId: dto.documentId,
        signers: dto.signers,
        verificationMethod: dto.verificationMethod
      });

      res.status(201).json({
        success: true,
        data: signatures.map(s => s.toJSON()),
        count: signatures.length
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get signature thumbnail
   * GET /api/signatures/:id/thumbnail
   */
  async getThumbnail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const thumbnail = await this.signatureService.generateThumbnail(id);

      res.json({
        success: true,
        data: {
          thumbnail
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get signature audit trail
   * GET /api/signatures/:id/audit
   */
  async getAuditTrail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const auditTrail = await this.signatureService.getAuditTrail(id);

      res.json({
        success: true,
        data: auditTrail
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get signer history
   * GET /api/signers/:signerId/history
   */
  async getSignerHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { signerId } = req.params;
      const history = await this.signatureService.getSignerHistory(signerId);

      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get statistics
   * GET /api/signatures/statistics
   */
  async getStatistics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await this.signatureService.getStatistics();

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate compliance report
   * GET /api/signatures/compliance-report
   */
  async generateComplianceReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        res.status(400).json({
          error: 'Start date and end date are required'
        });
        return;
      }

      const report = await this.signatureService.generateComplianceReport(
        new Date(startDate as string),
        new Date(endDate as string)
      );

      res.json({
        success: true,
        data: report
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Process expired signatures (cron job endpoint)
   * POST /api/signatures/process-expired
   */
  async processExpiredSignatures(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const processedCount = await this.signatureService.processExpiredSignatures();

      res.json({
        success: true,
        data: {
          processedCount
        }
      });
    } catch (error) {
      next(error);
    }
  }
}