import { Database } from 'sqlite3';
import { promisify } from 'util';
import { 
  ISignatureRepository, 
  ISignatureQueryRepository, 
  ISignatureBatchRepository,
  ISignatureAuditRepository 
} from '../interfaces/ISignatureRepository';
import { Signature, SignatureStatus, SignatureType, VerificationMethod } from '../models/Signature';
import { v4 as uuidv4 } from 'uuid';

/**
 * Concrete implementation of signature repository
 * Implements multiple interfaces following Interface Segregation Principle
 */
export class SQLiteSignatureRepository implements 
  ISignatureRepository,
  ISignatureQueryRepository,
  ISignatureBatchRepository,
  ISignatureAuditRepository {
  
  private db: Database;
  private dbRun: (sql: string, params?: any[]) => Promise<any>;
  private dbGet: (sql: string, params?: any[]) => Promise<any>;
  private dbAll: (sql: string, params?: any[]) => Promise<any[]>;

  constructor(database: Database) {
    this.db = database;
    
    // Promisify database methods for async/await
    this.dbRun = promisify(this.db.run.bind(this.db));
    this.dbGet = promisify(this.db.get.bind(this.db));
    this.dbAll = promisify(this.db.all.bind(this.db));
    
    this.initializeDatabase();
  }

  /**
   * Initialize database schema
   */
  private async initializeDatabase(): Promise<void> {
    const signatureTableSQL = `
      CREATE TABLE IF NOT EXISTS signatures (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        signer_id TEXT NOT NULL,
        field_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        data TEXT,
        certificate_id TEXT,
        metadata TEXT,
        verification_method TEXT NOT NULL,
        verification_token TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        signed_at DATETIME,
        verified_at DATETIME,
        expires_at DATETIME,
        FOREIGN KEY (document_id) REFERENCES documents(id),
        FOREIGN KEY (signer_id) REFERENCES users(id)
      )
    `;

    const auditTableSQL = `
      CREATE TABLE IF NOT EXISTS signature_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signature_id TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        performed_by TEXT,
        details TEXT,
        FOREIGN KEY (signature_id) REFERENCES signatures(id) ON DELETE CASCADE
      )
    `;

    const indicesSQL = [
      'CREATE INDEX IF NOT EXISTS idx_signatures_document ON signatures(document_id)',
      'CREATE INDEX IF NOT EXISTS idx_signatures_signer ON signatures(signer_id)',
      'CREATE INDEX IF NOT EXISTS idx_signatures_status ON signatures(status)',
      'CREATE INDEX IF NOT EXISTS idx_signatures_created ON signatures(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_audit_signature ON signature_audit(signature_id)'
    ];

    await this.dbRun(signatureTableSQL);
    await this.dbRun(auditTableSQL);
    
    for (const indexSQL of indicesSQL) {
      await this.dbRun(indexSQL);
    }
  }

  /**
   * ISignatureRepository Implementation
   */
  
  async create(signature: Signature): Promise<Signature> {
    const id = signature.getId() || uuidv4();
    
    const sql = `
      INSERT INTO signatures (
        id, document_id, signer_id, field_id, type, status, 
        data, certificate_id, metadata, verification_method, 
        verification_token, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      id,
      signature.getDocumentId(),
      signature.getSignerId(),
      signature.getFieldId(),
      signature.getType(),
      signature.getStatus(),
      signature.getData(),
      null, // certificate_id
      JSON.stringify(signature.getMetadata()),
      VerificationMethod.EMAIL, // default
      null, // verification_token
      new Date().toISOString(),
      new Date().toISOString()
    ];

    await this.dbRun(sql, params);
    
    // Add initial audit entry
    await this.addAuditEntry(id, 'CREATED', signature.getStatus(), null, 'Signature created');
    
    return await this.findById(id) as Signature;
  }

  async findById(id: string): Promise<Signature | null> {
    const sql = 'SELECT * FROM signatures WHERE id = ?';
    const row = await this.dbGet(sql, [id]);
    
    if (!row) return null;
    
    return this.mapRowToSignature(row);
  }

  async findByDocumentId(documentId: string): Promise<Signature[]> {
    const sql = 'SELECT * FROM signatures WHERE document_id = ? ORDER BY created_at DESC';
    const rows = await this.dbAll(sql, [documentId]);
    
    return rows.map(row => this.mapRowToSignature(row));
  }

  async findBySignerId(signerId: string): Promise<Signature[]> {
    const sql = 'SELECT * FROM signatures WHERE signer_id = ? ORDER BY created_at DESC';
    const rows = await this.dbAll(sql, [signerId]);
    
    return rows.map(row => this.mapRowToSignature(row));
  }

  async update(id: string, updates: Partial<Signature>): Promise<Signature> {
    const updateFields: string[] = [];
    const params: any[] = [];
    
    // Build dynamic update query
    const allowedFields = ['status', 'data', 'metadata', 'signed_at', 'verified_at', 'expires_at'];
    
    for (const field of allowedFields) {
      if (updates.hasOwnProperty(field)) {
        updateFields.push(`${field} = ?`);
        params.push((updates as any)[field]);
      }
    }
    
    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }
    
    // Always update updated_at
    updateFields.push('updated_at = ?');
    params.push(new Date().toISOString());
    
    params.push(id);
    
    const sql = `UPDATE signatures SET ${updateFields.join(', ')} WHERE id = ?`;
    await this.dbRun(sql, params);
    
    // Add audit entry for update
    await this.addAuditEntry(id, 'UPDATED', (updates as any).status || '', null, 'Signature updated');
    
    return await this.findById(id) as Signature;
  }

  async delete(id: string): Promise<boolean> {
    const sql = 'DELETE FROM signatures WHERE id = ?';
    const result = await this.dbRun(sql, [id]);
    
    return result.changes > 0;
  }

  /**
   * ISignatureQueryRepository Implementation
   */
  
  async findByStatus(status: string): Promise<Signature[]> {
    const sql = 'SELECT * FROM signatures WHERE status = ? ORDER BY created_at DESC';
    const rows = await this.dbAll(sql, [status]);
    
    return rows.map(row => this.mapRowToSignature(row));
  }

  async findExpired(): Promise<Signature[]> {
    const sql = `
      SELECT * FROM signatures 
      WHERE expires_at IS NOT NULL 
      AND expires_at < datetime('now')
      AND status != ?
      ORDER BY expires_at DESC
    `;
    const rows = await this.dbAll(sql, [SignatureStatus.EXPIRED]);
    
    return rows.map(row => this.mapRowToSignature(row));
  }

  async findPendingVerification(): Promise<Signature[]> {
    const sql = `
      SELECT * FROM signatures 
      WHERE status = ? 
      AND verified_at IS NULL
      ORDER BY signed_at DESC
    `;
    const rows = await this.dbAll(sql, [SignatureStatus.COMPLETED]);
    
    return rows.map(row => this.mapRowToSignature(row));
  }

  async findByDateRange(startDate: Date, endDate: Date): Promise<Signature[]> {
    const sql = `
      SELECT * FROM signatures 
      WHERE created_at BETWEEN ? AND ?
      ORDER BY created_at DESC
    `;
    const rows = await this.dbAll(sql, [startDate.toISOString(), endDate.toISOString()]);
    
    return rows.map(row => this.mapRowToSignature(row));
  }

  async countByStatus(status: string): Promise<number> {
    const sql = 'SELECT COUNT(*) as count FROM signatures WHERE status = ?';
    const result = await this.dbGet(sql, [status]);
    
    return result.count || 0;
  }

  /**
   * ISignatureBatchRepository Implementation
   */
  
  async createBatch(signatures: Signature[]): Promise<Signature[]> {
    const sql = `
      INSERT INTO signatures (
        id, document_id, signer_id, field_id, type, status,
        data, metadata, verification_method, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const stmt = this.db.prepare(sql);
    const createdSignatures: Signature[] = [];

    for (const signature of signatures) {
      const id = signature.getId() || uuidv4();
      const params = [
        id,
        signature.getDocumentId(),
        signature.getSignerId(),
        signature.getFieldId(),
        signature.getType(),
        signature.getStatus(),
        signature.getData(),
        JSON.stringify(signature.getMetadata()),
        VerificationMethod.EMAIL,
        new Date().toISOString(),
        new Date().toISOString()
      ];

      await new Promise((resolve, reject) => {
        stmt.run(params, (err: any) => {
          if (err) reject(err);
          else resolve(null);
        });
      });

      const created = await this.findById(id);
      if (created) createdSignatures.push(created);
    }

    stmt.finalize();
    return createdSignatures;
  }

  async updateBatch(updates: Array<{ id: string; data: Partial<Signature> }>): Promise<number> {
    let updatedCount = 0;
    
    for (const update of updates) {
      try {
        await this.update(update.id, update.data);
        updatedCount++;
      } catch (error) {
        console.error(`Failed to update signature ${update.id}:`, error);
      }
    }
    
    return updatedCount;
  }

  async deleteBatch(ids: string[]): Promise<number> {
    const placeholders = ids.map(() => '?').join(',');
    const sql = `DELETE FROM signatures WHERE id IN (${placeholders})`;
    const result = await this.dbRun(sql, ids);
    
    return result.changes || 0;
  }

  /**
   * ISignatureAuditRepository Implementation
   */
  
  async getAuditTrail(signatureId: string): Promise<any[]> {
    const sql = `
      SELECT * FROM signature_audit 
      WHERE signature_id = ? 
      ORDER BY timestamp DESC
    `;
    return await this.dbAll(sql, [signatureId]);
  }

  async getSignerHistory(signerId: string): Promise<any[]> {
    const sql = `
      SELECT s.*, sa.action, sa.timestamp as audit_timestamp
      FROM signatures s
      LEFT JOIN signature_audit sa ON s.id = sa.signature_id
      WHERE s.signer_id = ?
      ORDER BY s.created_at DESC, sa.timestamp DESC
    `;
    return await this.dbAll(sql, [signerId]);
  }

  async getDocumentSignatures(documentId: string): Promise<any[]> {
    const sql = `
      SELECT 
        s.*,
        COUNT(sa.id) as audit_count,
        MAX(sa.timestamp) as last_activity
      FROM signatures s
      LEFT JOIN signature_audit sa ON s.id = sa.signature_id
      WHERE s.document_id = ?
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `;
    return await this.dbAll(sql, [documentId]);
  }

  async generateComplianceReport(startDate: Date, endDate: Date): Promise<any> {
    const statsSQL = `
      SELECT 
        COUNT(*) as total_signatures,
        COUNT(CASE WHEN status = ? THEN 1 END) as verified_count,
        COUNT(CASE WHEN status = ? THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = ? THEN 1 END) as rejected_count,
        AVG(CASE 
          WHEN verified_at IS NOT NULL AND signed_at IS NOT NULL 
          THEN julianday(verified_at) - julianday(signed_at) 
        END) * 24 as avg_verification_hours
      FROM signatures
      WHERE created_at BETWEEN ? AND ?
    `;

    const stats = await this.dbGet(statsSQL, [
      SignatureStatus.VERIFIED,
      SignatureStatus.PENDING,
      SignatureStatus.REJECTED,
      startDate.toISOString(),
      endDate.toISOString()
    ]);

    const typeDistributionSQL = `
      SELECT type, COUNT(*) as count
      FROM signatures
      WHERE created_at BETWEEN ? AND ?
      GROUP BY type
    `;

    const typeDistribution = await this.dbAll(typeDistributionSQL, [
      startDate.toISOString(),
      endDate.toISOString()
    ]);

    return {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      statistics: stats,
      typeDistribution,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Helper Methods
   */
  
  private mapRowToSignature(row: any): Signature {
    const signature = new Signature(
      row.id,
      row.document_id,
      row.signer_id,
      row.field_id,
      row.type as SignatureType,
      row.verification_method as VerificationMethod
    );

    // Use reflection or a factory to properly reconstruct the object
    // This is a simplified version - in production, use a proper mapper
    Object.assign(signature, {
      status: row.status,
      data: row.data || '',
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      signedAt: row.signed_at ? new Date(row.signed_at) : undefined,
      verifiedAt: row.verified_at ? new Date(row.verified_at) : undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined
    });

    return signature;
  }

  private async addAuditEntry(
    signatureId: string,
    action: string,
    status: string,
    performedBy: string | null,
    details: string
  ): Promise<void> {
    const sql = `
      INSERT INTO signature_audit (signature_id, action, status, performed_by, details)
      VALUES (?, ?, ?, ?, ?)
    `;
    await this.dbRun(sql, [signatureId, action, status, performedBy, details]);
  }
}