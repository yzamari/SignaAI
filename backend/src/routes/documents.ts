import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { dbRun, dbGet, dbAll } from '../db/database';
import { authenticateToken } from './auth';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Upload document
router.post('/upload', authenticateToken, upload.single('file'), async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const documentId = uuidv4();
    const { originalname, filename } = req.file;

    await dbRun(
      'INSERT INTO documents (id, title, file_path, owner_id) VALUES (?, ?, ?, ?)',
      [documentId, originalname, filename, req.user.userId]
    );

    res.json({
      id: documentId,
      title: originalname,
      status: 'pending',
      uploadedAt: new Date()
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Get user's documents
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const { limit = 10, offset = 0, status } = req.query;
    
    let query = 'SELECT * FROM documents WHERE owner_id = ?';
    const params: any[] = [req.user.userId];
    
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const documents = await dbAll(query, params);
    
    // Get signers for each document
    const documentsWithSigners = await Promise.all(
      (documents as any[]).map(async (doc) => {
        const workflow = await dbGet(
          'SELECT * FROM workflows WHERE document_id = ?',
          [doc.id]
        ) as any;
        
        if (workflow) {
          const signers = await dbAll(
            'SELECT * FROM signers WHERE workflow_id = ?',
            [workflow.id]
          );
          return { ...doc, signers };
        }
        
        return { ...doc, signers: [] };
      })
    );
    
    res.json({ documents: documentsWithSigners });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: 'Failed to get documents' });
  }
});

// Get single document
router.get('/:id', authenticateToken, async (req: any, res) => {
  try {
    const document = await dbGet(
      'SELECT * FROM documents WHERE id = ? AND owner_id = ?',
      [req.params.id, req.user.userId]
    );
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json(document);
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ error: 'Failed to get document' });
  }
});

// Update document status
router.patch('/:id/status', authenticateToken, async (req: any, res) => {
  try {
    const { status } = req.body;
    
    await dbRun(
      'UPDATE documents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?',
      [status, req.params.id, req.user.userId]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

export default router;