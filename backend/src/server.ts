import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';

// Import routes
import authRoutes from './routes/auth';
import documentRoutes from './routes/documents';
import workflowRoutes from './routes/workflows';
import signatureRoutes from './routes/signatures';
import ocrRoutes from './routes/ocr';

// Load environment variables
dotenv.config();

// Initialize database
import { initDB, dbGet } from './db/database';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create upload directory if it doesn't exist
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Static files
app.use('/uploads', express.static(uploadDir));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/signatures', signatureRoutes);
app.use('/api/ocr', ocrRoutes);
app.use('/api/users', require('./routes/users').default);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Dashboard stats endpoint
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    // Get document counts by status
    const totalResult = await dbGet('SELECT COUNT(*) as count FROM documents');
    const pendingResult = await dbGet('SELECT COUNT(*) as count FROM documents WHERE status = ?', ['pending']);
    const signedResult = await dbGet('SELECT COUNT(*) as count FROM documents WHERE status = ?', ['signed']);
    const rejectedResult = await dbGet('SELECT COUNT(*) as count FROM documents WHERE status = ?', ['rejected']);
    const processingResult = await dbGet('SELECT COUNT(*) as count FROM documents WHERE status = ?', ['processing']);

    const stats = {
      total: totalResult?.count || 0,
      pending: pendingResult?.count || 0,
      signed: signedResult?.count || 0,
      rejected: rejectedResult?.count || 0,
      processing: processingResult?.count || 0
    };

    res.json(stats);
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to get dashboard stats' });
  }
});

// WebSocket connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-document', (documentId) => {
    socket.join(`document-${documentId}`);
    console.log(`Socket ${socket.id} joined document-${documentId}`);
  });

  socket.on('signature-update', (data) => {
    io.to(`document-${data.documentId}`).emit('signature-updated', data);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// Initialize database and start server
const PORT = process.env.PORT || 5100;

async function startServer() {
  try {
    await initDB();
    console.log('Database initialized');
    
    httpServer.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export { app, io };