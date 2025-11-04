import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbRun, dbGet, dbAll } from '../db/database';
import { io } from '../server';

const router = Router();

// Get document by signature token
router.get('/token/:token', async (req, res) => {
  try {
    const signer = await dbGet(
      'SELECT * FROM signers WHERE token = ?',
      [req.params.token]
    ) as any;
    
    if (!signer) {
      return res.status(404).json({ error: 'Invalid signature link' });
    }
    
    if (signer.status === 'signed') {
      return res.status(400).json({ error: 'Document already signed' });
    }
    
    const workflow = await dbGet(
      'SELECT * FROM workflows WHERE id = ?',
      [signer.workflow_id]
    ) as any;
    
    const document = await dbGet(
      'SELECT * FROM documents WHERE id = ?',
      [workflow.document_id]
    ) as any;
    
    const fields = await dbAll(
      'SELECT * FROM signature_fields WHERE workflow_id = ? AND (signer_id = ? OR signer_id IS NULL)',
      [workflow.id, signer.id]
    );
    
    res.json({
      document: {
        id: document.id,
        title: document.title,
        filePath: document.file_path
      },
      signer: {
        id: signer.id,
        name: signer.name,
        email: signer.email
      },
      workflow: {
        id: workflow.id,
        type: workflow.type,
        deadline: workflow.deadline
      },
      fields
    });
  } catch (error) {
    console.error('Get signature document error:', error);
    res.status(500).json({ error: 'Failed to get document' });
  }
});

// Submit signature
router.post('/submit', async (req, res) => {
  try {
    const { token, signatureData, fields } = req.body;
    
    const signer = await dbGet(
      'SELECT * FROM signers WHERE token = ?',
      [token]
    ) as any;
    
    if (!signer) {
      return res.status(404).json({ error: 'Invalid signature link' });
    }
    
    if (signer.status === 'signed') {
      return res.status(400).json({ error: 'Document already signed' });
    }
    
    // Update signer status
    await dbRun(
      'UPDATE signers SET status = ?, signature_data = ?, signed_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['signed', signatureData, signer.id]
    );
    
    // Update signature fields
    if (fields && fields.length > 0) {
      for (const field of fields) {
        await dbRun(
          'UPDATE signature_fields SET value = ? WHERE id = ?',
          [field.value, field.id]
        );
      }
    }
    
    // Check if all signers have signed
    const workflow = await dbGet(
      'SELECT * FROM workflows WHERE id = ?',
      [signer.workflow_id]
    ) as any;
    
    const allSigners = await dbAll(
      'SELECT * FROM signers WHERE workflow_id = ?',
      [workflow.id]
    ) as any[];
    
    const allSigned = allSigners.every(s => s.status === 'signed');
    
    if (allSigned) {
      // Update document status
      await dbRun(
        'UPDATE documents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['signed', workflow.document_id]
      );
      
      // Update workflow status
      await dbRun(
        'UPDATE workflows SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['completed', workflow.id]
      );
    }
    
    // Add audit log
    await dbRun(
      'INSERT INTO audit_logs (id, document_id, action, details) VALUES (?, ?, ?, ?)',
      [uuidv4(), workflow.document_id, 'signed', JSON.stringify({ signerName: signer.name, signerEmail: signer.email })]
    );
    
    // Emit WebSocket event
    io.emit('signature-completed', {
      workflowId: workflow.id,
      signerId: signer.id,
      signerName: signer.name,
      allSigned
    });
    
    res.json({
      success: true,
      allSigned,
      message: 'Signature submitted successfully'
    });
  } catch (error) {
    console.error('Submit signature error:', error);
    res.status(500).json({ error: 'Failed to submit signature' });
  }
});

// Decline signature
router.post('/decline', async (req, res) => {
  try {
    const { token, reason } = req.body;
    
    const signer = await dbGet(
      'SELECT * FROM signers WHERE token = ?',
      [token]
    ) as any;
    
    if (!signer) {
      return res.status(404).json({ error: 'Invalid signature link' });
    }
    
    // Update signer status
    await dbRun(
      'UPDATE signers SET status = ? WHERE id = ?',
      ['rejected', signer.id]
    );
    
    const workflow = await dbGet(
      'SELECT * FROM workflows WHERE id = ?',
      [signer.workflow_id]
    ) as any;
    
    // Update document status
    await dbRun(
      'UPDATE documents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['rejected', workflow.document_id]
    );
    
    // Add audit log
    await dbRun(
      'INSERT INTO audit_logs (id, document_id, action, details) VALUES (?, ?, ?, ?)',
      [uuidv4(), workflow.document_id, 'declined', JSON.stringify({ signerName: signer.name, reason })]
    );
    
    // Emit WebSocket event
    io.emit('signature-declined', {
      workflowId: workflow.id,
      signerId: signer.id,
      signerName: signer.name,
      reason
    });
    
    res.json({
      success: true,
      message: 'Document declined'
    });
  } catch (error) {
    console.error('Decline signature error:', error);
    res.status(500).json({ error: 'Failed to decline signature' });
  }
});

export default router;