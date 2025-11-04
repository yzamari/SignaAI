import { v4 as uuidv4 } from 'uuid';
import { 
  ISignatureRepository, 
  ISignatureQueryRepository,
  ISignatureBatchRepository,
  ISignatureAuditRepository
} from '../interfaces/ISignatureRepository';
import { Signature, SignatureType, SignatureStatus, VerificationMethod } from '../models/Signature';
import { SignatureStrategyFactory, ISignatureStrategy, SignatureResult } from '../strategies/SignatureStrategy';
import { EventEmitter } from 'events';

/**
 * Signature Service Events
 */
export enum SignatureEvent {
  CREATED = 'signature.created',
  SIGNED = 'signature.signed',
  VERIFIED = 'signature.verified',
  REJECTED = 'signature.rejected',
  EXPIRED = 'signature.expired',
  BATCH_CREATED = 'signature.batch_created',
  BATCH_PROCESSED = 'signature.batch_processed'
}

/**
 * Service Request DTOs
 */
export interface CreateSignatureRequest {
  documentId: string;
  signerId: string;
  fieldId: string;
  type: SignatureType;
  verificationMethod?: VerificationMethod;
  metadata?: any;
  expiresIn?: number; // hours
}

export interface ApplySignatureRequest {
  signatureId: string;
  data: string;
  options?: any;
  metadata?: any;
}

export interface VerifySignatureRequest {
  signatureId: string;
  verificationData?: any;
  verifiedBy?: string;
}

export interface BatchSignatureRequest {
  documentId: string;
  signers: Array<{
    signerId: string;
    fieldId: string;
    type: SignatureType;
  }>;
  verificationMethod?: VerificationMethod;
}

/**
 * Main Signature Service
 * Implements business logic with dependency injection
 * Follows Single Responsibility and Dependency Inversion principles
 */
export class SignatureService {
  private readonly eventEmitter: EventEmitter;

  constructor(
    private readonly repository: ISignatureRepository & 
                                ISignatureQueryRepository & 
                                ISignatureBatchRepository & 
                                ISignatureAuditRepository,
    eventEmitter?: EventEmitter
  ) {
    this.eventEmitter = eventEmitter || new EventEmitter();
  }

  /**
   * Create a new signature request
   */
  async createSignature(request: CreateSignatureRequest): Promise<Signature> {
    // Validate request
    this.validateCreateRequest(request);

    // Create signature entity
    const signature = new Signature(
      uuidv4(),
      request.documentId,
      request.signerId,
      request.fieldId,
      request.type,
      request.verificationMethod || VerificationMethod.EMAIL
    );

    // Set expiration if specified
    if (request.expiresIn) {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + request.expiresIn);
      signature.setExpiration(expiresAt);
    }

    // Add metadata if provided
    if (request.metadata) {
      signature.startSigning(request.metadata);
    }

    // Save to repository
    const created = await this.repository.create(signature);

    // Emit event
    this.eventEmitter.emit(SignatureEvent.CREATED, {
      signatureId: created.getId(),
      documentId: created.getDocumentId(),
      signerId: created.getSignerId()
    });

    return created;
  }

  /**
   * Apply signature data to an existing signature
   */
  async applySignature(request: ApplySignatureRequest): Promise<SignatureResult> {
    // Retrieve signature
    const signature = await this.getSignatureById(request.signatureId);
    
    if (!signature) {
      throw new Error(`Signature not found: ${request.signatureId}`);
    }

    // Check if already signed
    if (signature.getStatus() !== SignatureStatus.IN_PROGRESS && 
        signature.getStatus() !== SignatureStatus.PENDING) {
      throw new Error(`Signature is not in a signable state: ${signature.getStatus()}`);
    }

    // Check expiration
    if (signature.isExpired()) {
      signature.reject('Signature expired');
      await this.repository.update(signature.getId(), signature);
      throw new Error('Signature has expired');
    }

    // Get appropriate strategy
    const strategy = SignatureStrategyFactory.getStrategy(signature.getType());
    
    // Process signature with strategy
    const result = await strategy.processSignature(request.data, request.options);
    
    // Apply processed signature to entity
    signature.applySignature(result.processedData, request.metadata);
    
    // Save to repository
    await this.repository.update(signature.getId(), {
      status: signature.getStatus(),
      data: signature.getData(),
      metadata: signature.getMetadata(),
      signedAt: signature.getSignedAt()
    } as any);

    // Emit event
    this.eventEmitter.emit(SignatureEvent.SIGNED, {
      signatureId: signature.getId(),
      documentId: signature.getDocumentId(),
      signerId: signature.getSignerId(),
      hash: result.hash
    });

    return result;
  }

  /**
   * Verify a signature
   */
  async verifySignature(request: VerifySignatureRequest): Promise<Signature> {
    const signature = await this.getSignatureById(request.signatureId);
    
    if (!signature) {
      throw new Error(`Signature not found: ${request.signatureId}`);
    }

    // Perform verification
    signature.verify(request.verificationData);
    
    // Update repository
    await this.repository.update(signature.getId(), {
      status: signature.getStatus(),
      verifiedAt: signature.getVerifiedAt()
    } as any);

    // Emit event
    this.eventEmitter.emit(SignatureEvent.VERIFIED, {
      signatureId: signature.getId(),
      documentId: signature.getDocumentId(),
      verifiedBy: request.verifiedBy
    });

    return signature;
  }

  /**
   * Reject a signature
   */
  async rejectSignature(signatureId: string, reason: string): Promise<Signature> {
    const signature = await this.getSignatureById(signatureId);
    
    if (!signature) {
      throw new Error(`Signature not found: ${signatureId}`);
    }

    signature.reject(reason);
    
    await this.repository.update(signature.getId(), {
      status: signature.getStatus()
    } as any);

    // Emit event
    this.eventEmitter.emit(SignatureEvent.REJECTED, {
      signatureId: signature.getId(),
      reason
    });

    return signature;
  }

  /**
   * Create batch signatures for multiple signers
   */
  async createBatchSignatures(request: BatchSignatureRequest): Promise<Signature[]> {
    const signatures: Signature[] = [];

    for (const signer of request.signers) {
      const signature = new Signature(
        uuidv4(),
        request.documentId,
        signer.signerId,
        signer.fieldId,
        signer.type,
        request.verificationMethod || VerificationMethod.EMAIL
      );
      signatures.push(signature);
    }

    const created = await this.repository.createBatch(signatures);

    // Emit event
    this.eventEmitter.emit(SignatureEvent.BATCH_CREATED, {
      documentId: request.documentId,
      count: created.length,
      signatureIds: created.map(s => s.getId())
    });

    return created;
  }

  /**
   * Process expired signatures
   */
  async processExpiredSignatures(): Promise<number> {
    const expired = await this.repository.findExpired();
    let processedCount = 0;

    for (const signature of expired) {
      try {
        signature.reject('Expired');
        await this.repository.update(signature.getId(), {
          status: SignatureStatus.EXPIRED
        } as any);
        
        this.eventEmitter.emit(SignatureEvent.EXPIRED, {
          signatureId: signature.getId()
        });
        
        processedCount++;
      } catch (error) {
        console.error(`Failed to process expired signature ${signature.getId()}:`, error);
      }
    }

    return processedCount;
  }

  /**
   * Get signature by ID
   */
  async getSignatureById(id: string): Promise<Signature | null> {
    return await this.repository.findById(id);
  }

  /**
   * Get signatures by document
   */
  async getDocumentSignatures(documentId: string): Promise<Signature[]> {
    return await this.repository.findByDocumentId(documentId);
  }

  /**
   * Get signatures by signer
   */
  async getSignerSignatures(signerId: string): Promise<Signature[]> {
    return await this.repository.findBySignerId(signerId);
  }

  /**
   * Get signatures by status
   */
  async getSignaturesByStatus(status: SignatureStatus): Promise<Signature[]> {
    return await this.repository.findByStatus(status);
  }

  /**
   * Get signature statistics
   */
  async getStatistics(): Promise<any> {
    const [pending, completed, verified, rejected] = await Promise.all([
      this.repository.countByStatus(SignatureStatus.PENDING),
      this.repository.countByStatus(SignatureStatus.COMPLETED),
      this.repository.countByStatus(SignatureStatus.VERIFIED),
      this.repository.countByStatus(SignatureStatus.REJECTED)
    ]);

    return {
      total: pending + completed + verified + rejected,
      pending,
      completed,
      verified,
      rejected,
      verificationRate: verified / (completed + verified) || 0
    };
  }

  /**
   * Get audit trail for a signature
   */
  async getAuditTrail(signatureId: string): Promise<any[]> {
    return await this.repository.getAuditTrail(signatureId);
  }

  /**
   * Get signer history
   */
  async getSignerHistory(signerId: string): Promise<any[]> {
    return await this.repository.getSignerHistory(signerId);
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(startDate: Date, endDate: Date): Promise<any> {
    return await this.repository.generateComplianceReport(startDate, endDate);
  }

  /**
   * Validate signature with strategy
   */
  async validateSignatureData(type: SignatureType, data: string): Promise<boolean> {
    const strategy = SignatureStrategyFactory.getStrategy(type);
    return await strategy.validateSignature(data);
  }

  /**
   * Generate signature thumbnail
   */
  async generateThumbnail(signatureId: string): Promise<string> {
    const signature = await this.getSignatureById(signatureId);
    
    if (!signature) {
      throw new Error(`Signature not found: ${signatureId}`);
    }

    const strategy = SignatureStrategyFactory.getStrategy(signature.getType());
    return await strategy.generateThumbnail(signature.getData());
  }

  /**
   * Private helper methods
   */
  
  private validateCreateRequest(request: CreateSignatureRequest): void {
    if (!request.documentId) {
      throw new Error('Document ID is required');
    }
    if (!request.signerId) {
      throw new Error('Signer ID is required');
    }
    if (!request.fieldId) {
      throw new Error('Field ID is required');
    }
    if (!Object.values(SignatureType).includes(request.type)) {
      throw new Error(`Invalid signature type: ${request.type}`);
    }
  }

  /**
   * Subscribe to signature events
   */
  on(event: SignatureEvent, listener: (...args: any[]) => void): void {
    this.eventEmitter.on(event, listener);
  }

  /**
   * Unsubscribe from signature events
   */
  off(event: SignatureEvent, listener: (...args: any[]) => void): void {
    this.eventEmitter.off(event, listener);
  }
}