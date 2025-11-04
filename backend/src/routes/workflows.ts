import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbRun, dbGet, dbAll } from '../db/database';
import { authenticateToken } from './auth';
import { io } from '../server';

const router = Router();

// Create workflow
router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const { documentId, signers, type = 'parallel', deadline, fields } = req.body;
    
    // Verify document ownership
    const document = await dbGet(
      'SELECT * FROM documents WHERE id = ? AND owner_id = ?',
      [documentId, req.user.userId]
    );
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const workflowId = uuidv4();
    
    // Create workflow
    await dbRun(
      'INSERT INTO workflows (id, document_id, type, deadline) VALUES (?, ?, ?, ?)',
      [workflowId, documentId, type, deadline]
    );
    
    // Create signers
    const signerTokens: any[] = [];
    for (let i = 0; i < signers.length; i++) {
      const signer = signers[i];
      const signerId = uuidv4();
      const token = uuidv4();
      
      await dbRun(
        'INSERT INTO signers (id, workflow_id, name, email, phone, token, order_num) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [signerId, workflowId, signer.name, signer.email, signer.phone, token, i]
      );
      
      signerTokens.push({
        ...signer,
        id: signerId,
        token,
        signLink: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/sign/${token}`
      });
    }
    
    // Create signature fields
    if (fields && fields.length > 0) {
      for (const field of fields) {
        const fieldId = uuidv4();
        await dbRun(
          'INSERT INTO signature_fields (id, workflow_id, signer_id, type, page, x, y, width, height, required) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [fieldId, workflowId, field.signerId, field.type, field.page, field.x, field.y, field.width, field.height, field.required ? 1 : 0]
        );
      }
    }
    
    res.json({
      workflowId,
      signers: signerTokens
    });
  } catch (error) {
    console.error('Create workflow error:', error);
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

// Get workflow by ID
router.get('/:id', authenticateToken, async (req: any, res) => {
  try {
    const workflow = await dbGet(
      `SELECT w.*, d.title, d.file_path 
       FROM workflows w 
       JOIN documents d ON w.document_id = d.id 
       WHERE w.id = ?`,
      [req.params.id]
    );
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    const signers = await dbAll(
      'SELECT * FROM signers WHERE workflow_id = ?',
      [req.params.id]
    );
    
    const fields = await dbAll(
      'SELECT * FROM signature_fields WHERE workflow_id = ?',
      [req.params.id]
    );
    
    res.json({
      ...workflow,
      signers,
      fields
    });
  } catch (error) {
    console.error('Get workflow error:', error);
    res.status(500).json({ error: 'Failed to get workflow' });
  }
});

// Send notifications to signers
router.post('/:id/send', authenticateToken, async (req: any, res) => {
  try {
    const { sendVia = ['email'] } = req.body;
    
    const signers = await dbAll(
      'SELECT * FROM signers WHERE workflow_id = ?',
      [req.params.id]
    );
    
    // Here you would integrate with actual email/SMS services
    // For now, we'll just return the sign links
    const notifications = (signers as any[]).map(signer => ({
      name: signer.name,
      email: signer.email,
      signLink: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/sign/${signer.token}`,
      status: 'sent'
    }));
    
    // Emit WebSocket event
    io.emit('workflow-sent', {
      workflowId: req.params.id,
      signers: notifications
    });
    
    res.json({ notifications });
  } catch (error) {
    console.error('Send notifications error:', error);
    res.status(500).json({ error: 'Failed to send notifications' });
  }
});

export default router;