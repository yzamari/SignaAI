import sqlite3 from 'sqlite3';
import path from 'path';
import { promisify } from 'util';

const dbPath = path.join(__dirname, '../../signaai.db');
const db = new sqlite3.Database(dbPath);

// Custom promisified database methods
export const dbRun = (sql: string, params?: any[]): Promise<any> => {
  return new Promise((resolve, reject) => {
    db.run(sql, params || [], function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

export const dbGet = (sql: string, params?: any[]): Promise<any> => {
  return new Promise((resolve, reject) => {
    db.get(sql, params || [], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

export const dbAll = (sql: string, params?: any[]): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    db.all(sql, params || [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

export async function initDB() {
  try {
    // Users table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'sender',
        phone TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Documents table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        file_path TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        owner_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users (id)
      )
    `);

    // Workflows table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        type TEXT DEFAULT 'parallel',
        deadline DATETIME,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents (id)
      )
    `);

    // Signers table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS signers (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        status TEXT DEFAULT 'pending',
        signed_at DATETIME,
        signature_data TEXT,
        token TEXT UNIQUE,
        order_num INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workflow_id) REFERENCES workflows (id)
      )
    `);

    // Signature fields table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS signature_fields (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        signer_id TEXT,
        type TEXT DEFAULT 'signature',
        page INTEGER NOT NULL,
        x REAL NOT NULL,
        y REAL NOT NULL,
        width REAL NOT NULL,
        height REAL NOT NULL,
        value TEXT,
        required INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workflow_id) REFERENCES workflows (id),
        FOREIGN KEY (signer_id) REFERENCES signers (id)
      )
    `);

    // Audit logs table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        action TEXT NOT NULL,
        user_id TEXT,
        ip_address TEXT,
        user_agent TEXT,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // User settings table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY,
        email_notifications INTEGER DEFAULT 1,
        sms_notifications INTEGER DEFAULT 0,
        push_notifications INTEGER DEFAULT 1,
        document_reminders INTEGER DEFAULT 1,
        language TEXT DEFAULT 'en',
        timezone TEXT DEFAULT 'UTC-5',
        date_format TEXT DEFAULT 'MM/DD/YYYY',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    console.log('Database tables created successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

export default db;