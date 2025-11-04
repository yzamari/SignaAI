import { Signature } from '../models/Signature';

/**
 * Interface Segregation Principle - Separate interfaces for different repository concerns
 */

/**
 * Base repository interface for signature operations
 */
export interface ISignatureRepository {
  create(signature: Signature): Promise<Signature>;
  findById(id: string): Promise<Signature | null>;
  findByDocumentId(documentId: string): Promise<Signature[]>;
  findBySignerId(signerId: string): Promise<Signature[]>;
  update(id: string, signature: Partial<Signature>): Promise<Signature>;
  delete(id: string): Promise<boolean>;
}

/**
 * Advanced query operations interface
 */
export interface ISignatureQueryRepository {
  findByStatus(status: string): Promise<Signature[]>;
  findExpired(): Promise<Signature[]>;
  findPendingVerification(): Promise<Signature[]>;
  findByDateRange(startDate: Date, endDate: Date): Promise<Signature[]>;
  countByStatus(status: string): Promise<number>;
}

/**
 * Batch operations interface
 */
export interface ISignatureBatchRepository {
  createBatch(signatures: Signature[]): Promise<Signature[]>;
  updateBatch(updates: Array<{ id: string; data: Partial<Signature> }>): Promise<number>;
  deleteBatch(ids: string[]): Promise<number>;
}

/**
 * Audit and compliance interface
 */
export interface ISignatureAuditRepository {
  getAuditTrail(signatureId: string): Promise<any[]>;
  getSignerHistory(signerId: string): Promise<any[]>;
  getDocumentSignatures(documentId: string): Promise<any[]>;
  generateComplianceReport(startDate: Date, endDate: Date): Promise<any>;
}