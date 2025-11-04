import { IsUUID, IsEnum, IsString, IsDate, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Signature Types following Strategy Pattern
 */
export enum SignatureType {
  DRAWN = 'drawn',
  TYPED = 'typed',
  UPLOADED = 'uploaded',
  BIOMETRIC = 'biometric',
  DIGITAL_CERTIFICATE = 'digital_certificate'
}

/**
 * Signature Status State Pattern
 */
export enum SignatureStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  EXPIRED = 'expired'
}

/**
 * Verification Method Types
 */
export enum VerificationMethod {
  EMAIL = 'email',
  SMS = 'sms',
  TWO_FACTOR = 'two_factor',
  BIOMETRIC = 'biometric',
  CERTIFICATE = 'certificate'
}

/**
 * Signature Metadata with proper encapsulation
 */
export class SignatureMetadata {
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsObject()
  geoLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    city?: string;
    country?: string;
  };

  @IsOptional()
  @IsObject()
  deviceInfo?: {
    type: string;
    os: string;
    browser?: string;
    fingerprint?: string;
  };

  @IsOptional()
  @IsObject()
  biometricData?: {
    pressure?: number[];
    velocity?: number[];
    acceleration?: number[];
    touchPoints?: number;
  };

  constructor(data?: Partial<SignatureMetadata>) {
    if (data) {
      Object.assign(this, data);
    }
  }

  /**
   * Validate metadata completeness
   */
  isComplete(): boolean {
    return !!(this.ipAddress && this.userAgent && this.geoLocation);
  }

  /**
   * Get privacy-safe metadata (removes sensitive info)
   */
  getSafeMetadata(): Partial<SignatureMetadata> {
    const { biometricData, deviceInfo, ...safe } = this;
    return {
      ...safe,
      deviceInfo: deviceInfo ? { type: deviceInfo.type, os: deviceInfo.os } : undefined
    };
  }
}

/**
 * Signature Audit Trail for compliance
 */
export class SignatureAuditEntry {
  @IsDate()
  timestamp: Date;

  @IsEnum(SignatureStatus)
  status: SignatureStatus;

  @IsString()
  action: string;

  @IsOptional()
  @IsString()
  performedBy?: string;

  @IsOptional()
  @IsString()
  details?: string;

  constructor(action: string, status: SignatureStatus, performedBy?: string, details?: string) {
    this.timestamp = new Date();
    this.action = action;
    this.status = status;
    this.performedBy = performedBy;
    this.details = details;
  }
}

/**
 * Main Signature Entity with business logic encapsulation
 * Follows Single Responsibility Principle
 */
export class Signature {
  @IsUUID()
  private readonly id: string;

  @IsUUID()
  private documentId: string;

  @IsUUID()
  private signerId: string;

  @IsUUID()
  private fieldId: string;

  @IsEnum(SignatureType)
  private type: SignatureType;

  @IsEnum(SignatureStatus)
  private status: SignatureStatus;

  @IsString()
  private data: string; // Base64 encoded signature data

  @IsOptional()
  @IsString()
  private certificateId?: string;

  @ValidateNested()
  @Type(() => SignatureMetadata)
  private metadata: SignatureMetadata;

  @IsEnum(VerificationMethod)
  private verificationMethod: VerificationMethod;

  @IsOptional()
  @IsString()
  private verificationToken?: string;

  @IsDate()
  private readonly createdAt: Date;

  @IsDate()
  private updatedAt: Date;

  @IsOptional()
  @IsDate()
  private signedAt?: Date;

  @IsOptional()
  @IsDate()
  private verifiedAt?: Date;

  @IsOptional()
  @IsDate()
  private expiresAt?: Date;

  @ValidateNested({ each: true })
  @Type(() => SignatureAuditEntry)
  private auditTrail: SignatureAuditEntry[];

  constructor(
    id: string,
    documentId: string,
    signerId: string,
    fieldId: string,
    type: SignatureType,
    verificationMethod: VerificationMethod = VerificationMethod.EMAIL
  ) {
    this.id = id;
    this.documentId = documentId;
    this.signerId = signerId;
    this.fieldId = fieldId;
    this.type = type;
    this.status = SignatureStatus.PENDING;
    this.data = '';
    this.metadata = new SignatureMetadata();
    this.verificationMethod = verificationMethod;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.auditTrail = [];
    
    this.addAuditEntry('Signature created', SignatureStatus.PENDING);
  }

  // Getters with proper encapsulation
  getId(): string { return this.id; }
  getDocumentId(): string { return this.documentId; }
  getSignerId(): string { return this.signerId; }
  getFieldId(): string { return this.fieldId; }
  getType(): SignatureType { return this.type; }
  getStatus(): SignatureStatus { return this.status; }
  getData(): string { return this.data; }
  getMetadata(): SignatureMetadata { return this.metadata; }
  getCreatedAt(): Date { return this.createdAt; }
  getSignedAt(): Date | undefined { return this.signedAt; }
  getVerifiedAt(): Date | undefined { return this.verifiedAt; }
  getAuditTrail(): ReadonlyArray<SignatureAuditEntry> { return [...this.auditTrail]; }

  /**
   * Business Logic Methods
   */

  /**
   * Start the signing process
   */
  startSigning(metadata: Partial<SignatureMetadata>): void {
    this.validateStatus(SignatureStatus.PENDING);
    this.status = SignatureStatus.IN_PROGRESS;
    this.metadata = new SignatureMetadata({ ...this.metadata, ...metadata });
    this.updatedAt = new Date();
    this.addAuditEntry('Signing started', SignatureStatus.IN_PROGRESS);
  }

  /**
   * Apply signature data
   */
  applySignature(data: string, metadata?: Partial<SignatureMetadata>): void {
    this.validateStatus(SignatureStatus.IN_PROGRESS);
    
    if (!data || data.length === 0) {
      throw new Error('Signature data cannot be empty');
    }

    this.data = data;
    this.status = SignatureStatus.COMPLETED;
    this.signedAt = new Date();
    this.updatedAt = new Date();
    
    if (metadata) {
      this.metadata = new SignatureMetadata({ ...this.metadata, ...metadata });
    }
    
    this.addAuditEntry('Signature applied', SignatureStatus.COMPLETED);
  }

  /**
   * Verify the signature
   */
  verify(verificationData?: any): void {
    this.validateStatus(SignatureStatus.COMPLETED);
    
    // Perform verification logic based on verification method
    switch (this.verificationMethod) {
      case VerificationMethod.CERTIFICATE:
        this.verifyCertificate(verificationData);
        break;
      case VerificationMethod.BIOMETRIC:
        this.verifyBiometric(verificationData);
        break;
      default:
        this.verifyStandard();
    }
    
    this.status = SignatureStatus.VERIFIED;
    this.verifiedAt = new Date();
    this.updatedAt = new Date();
    this.addAuditEntry('Signature verified', SignatureStatus.VERIFIED);
  }

  /**
   * Reject the signature
   */
  reject(reason: string): void {
    if (this.status === SignatureStatus.VERIFIED) {
      throw new Error('Cannot reject a verified signature');
    }
    
    this.status = SignatureStatus.REJECTED;
    this.updatedAt = new Date();
    this.addAuditEntry('Signature rejected', SignatureStatus.REJECTED, undefined, reason);
  }

  /**
   * Check if signature is expired
   */
  isExpired(): boolean {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
  }

  /**
   * Set expiration
   */
  setExpiration(expiresAt: Date): void {
    if (this.status === SignatureStatus.VERIFIED) {
      throw new Error('Cannot set expiration on verified signature');
    }
    
    if (expiresAt <= new Date()) {
      throw new Error('Expiration date must be in the future');
    }
    
    this.expiresAt = expiresAt;
    this.updatedAt = new Date();
    this.addAuditEntry('Expiration set', this.status, undefined, `Expires at ${expiresAt.toISOString()}`);
  }

  /**
   * Check if signature is valid
   */
  isValid(): boolean {
    return (
      this.status === SignatureStatus.VERIFIED &&
      !this.isExpired() &&
      this.data.length > 0
    );
  }

  /**
   * Private helper methods
   */
  private validateStatus(expectedStatus: SignatureStatus): void {
    if (this.status !== expectedStatus) {
      throw new Error(`Invalid status transition: expected ${expectedStatus}, got ${this.status}`);
    }
  }

  private addAuditEntry(action: string, status: SignatureStatus, performedBy?: string, details?: string): void {
    this.auditTrail.push(new SignatureAuditEntry(action, status, performedBy, details));
  }

  private verifyCertificate(certificateData: any): void {
    if (!this.certificateId) {
      throw new Error('No certificate associated with this signature');
    }
    // Certificate verification logic
  }

  private verifyBiometric(biometricData: any): void {
    if (!this.metadata.biometricData) {
      throw new Error('No biometric data available for verification');
    }
    // Biometric verification logic
  }

  private verifyStandard(): void {
    if (!this.data) {
      throw new Error('No signature data to verify');
    }
    // Standard verification logic
  }

  /**
   * Convert to plain object for serialization
   */
  toJSON(): any {
    return {
      id: this.id,
      documentId: this.documentId,
      signerId: this.signerId,
      fieldId: this.fieldId,
      type: this.type,
      status: this.status,
      metadata: this.metadata.getSafeMetadata(),
      verificationMethod: this.verificationMethod,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      signedAt: this.signedAt,
      verifiedAt: this.verifiedAt,
      expiresAt: this.expiresAt,
      isValid: this.isValid(),
      auditTrail: this.auditTrail
    };
  }
}