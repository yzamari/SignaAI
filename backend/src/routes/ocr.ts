import express from 'express';
import multer from 'multer';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// OCR service configuration
const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://localhost:8002';

/**
 * POST /api/ocr/detect-fields
 * Proxy request to OCR service for field detection
 */
router.post('/detect-fields', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }

    // Create FormData for OCR service
    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    // Forward request to OCR service
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    
    const response = await fetch(`${OCR_SERVICE_URL}/detect-fields`, {
      method: 'POST',
      body: formData,
      headers: {
        ...formData.getHeaders(),
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OCR service error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: 'OCR service error',
        details: errorText 
      });
    }

    const result = await response.json();
    
    // Transform and validate OCR results
    const transformedFields = transformOCRFields(result);
    
    res.json({
      success: true,
      fields: transformedFields,
      processingTime: (result as any).processing_time || null,
      confidence: (result as any).overall_confidence || null,
    });

  } catch (error: any) {
    console.error('OCR proxy error:', error);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ 
        error: 'OCR service unavailable',
        message: 'Please ensure the OCR service is running on port 8002'
      });
    }
    
    if (error.name === 'AbortError') {
      return res.status(408).json({ 
        error: 'OCR processing timeout',
        message: 'The document is too large or complex to process'
      });
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message || 'Unknown error'
    });
  }
});

/**
 * POST /api/ocr/validate-fields
 * Validate detected fields and update confidence scores
 */
router.post('/validate-fields', authenticateToken, async (req, res) => {
  try {
    const { fields, userFeedback } = req.body;
    
    if (!fields || !Array.isArray(fields)) {
      return res.status(400).json({ error: 'Invalid fields data' });
    }

    // Here you could implement field validation logic
    // For now, we'll just return the fields with updated confidence
    const validatedFields = fields.map(field => ({
      ...field,
      validated: true,
      confidence: userFeedback?.[field.id]?.correct ? 
        Math.min(field.confidence + 0.1, 1.0) : 
        Math.max(field.confidence - 0.1, 0.1)
    }));

    res.json({
      success: true,
      fields: validatedFields
    });

  } catch (error: any) {
    console.error('Field validation error:', error);
    res.status(500).json({ 
      error: 'Field validation failed',
      message: error.message || 'Unknown validation error'
    });
  }
});

/**
 * GET /api/ocr/status
 * Check OCR service status
 */
router.get('/status', async (req, res) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${OCR_SERVICE_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    const isHealthy = response.ok;
    const status = await response.json().catch(() => ({}));

    res.json({
      ocrServiceUrl: OCR_SERVICE_URL,
      status: isHealthy ? 'healthy' : 'unhealthy',
      details: status,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    res.json({
      ocrServiceUrl: OCR_SERVICE_URL,
      status: 'unreachable',
      error: error.message || 'Connection failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Transform OCR service response to our field format
 */
function transformOCRFields(ocrResult: any): any[] {
  if (!ocrResult || !ocrResult.fields) {
    return [];
  }

  return ocrResult.fields.map((field: any, index: number) => ({
    id: field.id || `field-${index}`,
    type: mapFieldType(field.type || field.field_type),
    x: field.x || field.bbox?.x || 0,
    y: field.y || field.bbox?.y || 0,
    width: field.width || field.bbox?.width || 100,
    height: field.height || field.bbox?.height || 30,
    page: field.page || field.page_number || 1,
    confidence: field.confidence || field.score || 0.8,
    required: field.required !== false,
    text: field.text || field.detected_text || '',
    label: field.label || field.field_label || '',
  }));
}

/**
 * Map OCR service field types to our standard types
 */
function mapFieldType(ocrType: string): string {
  const typeMap: { [key: string]: string } = {
    'signature': 'signature',
    'sign': 'signature',
    'initial': 'initial',
    'date': 'date',
    'text': 'text',
    'name': 'text',
    'email': 'text',
    'address': 'text',
    'phone': 'text',
    'checkbox': 'checkbox',
    'radio': 'radio',
  };

  return typeMap[ocrType?.toLowerCase()] || 'signature';
}

/**
 * Error handling middleware for multer
 */
router.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: 'File too large',
        message: 'PDF file must be smaller than 50MB'
      });
    }
    return res.status(400).json({ 
      error: 'File upload error',
      message: error.message 
    });
  }
  
  if (error.message === 'Only PDF files are allowed') {
    return res.status(400).json({ 
      error: 'Invalid file type',
      message: 'Only PDF files are supported'
    });
  }
  
  next(error);
});

export default router;