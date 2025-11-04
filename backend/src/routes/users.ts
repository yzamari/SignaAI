import { Router } from 'express';
import { authenticateToken } from './auth';
import { dbGet, dbRun, dbAll } from '../db/database';

const router = Router();

// Get user profile with stats
router.get('/profile', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    
    // Get user info
    const user = await dbGet(
      'SELECT id, email, name, phone, role, created_at FROM users WHERE id = ?',
      [userId]
    );
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get document stats
    const stats = await dbGet(`
      SELECT 
        COUNT(*) as total_documents,
        SUM(CASE WHEN status = 'signed' THEN 1 ELSE 0 END) as signed_documents,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_documents,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_documents
      FROM documents 
      WHERE owner_id = ?
    `, [userId]);
    
    const profile = {
      ...user,
      stats: {
        totalDocuments: stats?.total_documents || 0,
        signedDocuments: stats?.signed_documents || 0,
        pendingDocuments: stats?.pending_documents || 0,
        rejectedDocuments: stats?.rejected_documents || 0,
        successRate: stats?.total_documents > 0 
          ? Math.round((stats?.signed_documents / stats?.total_documents) * 100)
          : 0
      }
    };
    
    res.json(profile);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const { name, phone, company } = req.body;
    
    await dbRun(
      'UPDATE users SET name = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, phone, userId]
    );
    
    const updatedUser = await dbGet(
      'SELECT id, email, name, phone, role FROM users WHERE id = ?',
      [userId]
    );
    
    res.json(updatedUser);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get user settings
router.get('/settings', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    
    // Get or create user settings
    let settings = await dbGet(
      'SELECT * FROM user_settings WHERE user_id = ?',
      [userId]
    );
    
    if (!settings) {
      // Create default settings
      await dbRun(`
        INSERT INTO user_settings (
          user_id, 
          email_notifications, 
          sms_notifications, 
          push_notifications,
          document_reminders,
          language,
          timezone,
          date_format
        ) VALUES (?, 1, 0, 1, 1, 'en', 'UTC-5', 'MM/DD/YYYY')
      `, [userId]);
      
      settings = await dbGet(
        'SELECT * FROM user_settings WHERE user_id = ?',
        [userId]
      );
    }
    
    res.json(settings);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Update user settings
router.put('/settings', authenticateToken, async (req: any, res) => {
  try {
    const userId = req.user.userId;
    const {
      email_notifications,
      sms_notifications,
      push_notifications,
      document_reminders,
      language,
      timezone,
      date_format
    } = req.body;
    
    await dbRun(`
      UPDATE user_settings SET
        email_notifications = ?,
        sms_notifications = ?,
        push_notifications = ?,
        document_reminders = ?,
        language = ?,
        timezone = ?,
        date_format = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `, [
      email_notifications,
      sms_notifications,
      push_notifications,
      document_reminders,
      language,
      timezone,
      date_format,
      userId
    ]);
    
    const updated = await dbGet(
      'SELECT * FROM user_settings WHERE user_id = ?',
      [userId]
    );
    
    res.json(updated);
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;