import express from 'express';
import path from 'path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { db } from './server/db';
import { processCopilotMessage } from './server/copilot';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // API ROUTES

  // Health
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'AI Complaint Copilot API', timestamp: new Date().toISOString() });
  });

  // Current Auth User
  app.get('/api/auth/me', (req, res) => {
    res.json({
      id: 'usr-1',
      name: 'Sarah Jenkins',
      email: 's.jenkins@pharmaco.com',
      role: 'Quality Manager',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
    });
  });

  // Copilot Chat & Edit Endpoint
  app.post('/api/copilot/chat', async (req, res) => {
    try {
      const { message, currentFormState, conversationHistory } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Message text is required.' });
        return;
      }

      const copilotResult = await processCopilotMessage({
        message,
        currentFormState,
        conversationHistory,
      });

      // Perform duplicate detection
      let duplicateWarning;
      if (copilotResult.extractedJSON.productName && copilotResult.extractedJSON.batchNumber) {
        duplicateWarning = db.findDuplicates(
          copilotResult.extractedJSON.productName,
          copilotResult.extractedJSON.batchNumber,
          copilotResult.extractedJSON.defectDescription || ''
        );
      }

      // Save/Update in DB draft state
      const { complaint, isNew } = db.saveComplaint(
        {
          ...copilotResult.extractedJSON,
          priority: (copilotResult.riskAssessment.severity === 'Critical' ? 'Critical' : copilotResult.riskAssessment.severity === 'Major' ? 'High' : 'Medium') as any,
        },
        'AI Copilot Assistant'
      );

      // Save Risk Assessment
      db.saveRiskAssessment(complaint.id, copilotResult.riskAssessment);

      res.json({
        ...copilotResult,
        extractedJSON: complaint,
        duplicateWarning,
        isNewComplaint: isNew,
      });
    } catch (err: any) {
      console.error('API /api/copilot/chat error:', err);
      res.status(500).json({ error: 'Copilot processing failed.', details: err.message });
    }
  });

  // Document OCR & File Extraction Endpoint
  app.post('/api/copilot/extract-document', upload.single('file'), async (req, res) => {
    try {
      const file = req.file;
      const currentFormStateRaw = req.body.currentFormState;
      let currentFormState = {};
      if (currentFormStateRaw) {
        try {
          currentFormState = JSON.parse(currentFormStateRaw);
        } catch (e) {
          /* ignore */
        }
      }

      if (!file) {
        res.status(400).json({ error: 'No file uploaded.' });
        return;
      }

      const copilotResult = await processCopilotMessage({
        message: `Extracted data from document ${file.originalname}`,
        currentFormState,
        documentFile: {
          filename: file.originalname,
          mimetype: file.mimetype,
          buffer: file.buffer,
        },
      });

      // Add file attachment to complaint
      const attachmentItem = {
        id: `att-${Date.now()}`,
        name: file.originalname,
        size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        type: file.mimetype,
      };

      const updatedAttachments = [...(copilotResult.extractedJSON.attachments || []), attachmentItem];
      copilotResult.extractedJSON.attachments = updatedAttachments;

      const { complaint } = db.saveComplaint(
        {
          ...copilotResult.extractedJSON,
          customerRemarks: (copilotResult.extractedJSON.customerRemarks ? `${copilotResult.extractedJSON.customerRemarks}\n` : '') + `[Extracted from uploaded document: ${file.originalname}]`,
        },
        'AI Document OCR Processor'
      );

      db.saveRiskAssessment(complaint.id, copilotResult.riskAssessment);

      res.json({
        ...copilotResult,
        extractedJSON: complaint,
        uploadedFile: attachmentItem,
      });
    } catch (err: any) {
      console.error('API /api/copilot/extract-document error:', err);
      res.status(500).json({ error: 'Document extraction failed.', details: err.message });
    }
  });

  // Complaints CRUD
  app.get('/api/complaints', (req, res) => {
    const { search, status, priority } = req.query;
    let list = db.getComplaints();

    if (search && typeof search === 'string') {
      const query = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.complaintId.toLowerCase().includes(query) ||
          c.customerName.toLowerCase().includes(query) ||
          c.productName.toLowerCase().includes(query) ||
          c.batchNumber.toLowerCase().includes(query) ||
          c.defectDescription.toLowerCase().includes(query)
      );
    }

    if (status && typeof status === 'string') {
      list = list.filter((c) => c.status === status);
    }

    if (priority && typeof priority === 'string') {
      list = list.filter((c) => c.priority === priority);
    }

    res.json({ complaints: list, total: list.length });
  });

  app.get('/api/complaints/:id', (req, res) => {
    const complaint = db.getComplaintById(req.params.id);
    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found' });
      return;
    }

    const riskAssessment = db.getLatestRiskAssessment(complaint.id);
    const history = db.getComplaintHistory(complaint.id);
    const comments = db.getComments(complaint.id);

    res.json({ complaint, riskAssessment, history, comments });
  });

  app.post('/api/complaints', (req, res) => {
    const { complaintData, modifiedBy } = req.body;
    const { complaint, isNew } = db.saveComplaint(complaintData, modifiedBy || 'User');
    res.json({ complaint, isNew });
  });

  app.get('/api/complaints/:id/history', (req, res) => {
    const history = db.getComplaintHistory(req.params.id);
    res.json({ history });
  });

  app.post('/api/comments', (req, res) => {
    const { complaintId, comment, userId, userName, userRole } = req.body;
    if (!complaintId || !comment) {
      res.status(400).json({ error: 'complaintId and comment are required' });
      return;
    }
    const newComment = db.addComment(complaintId, userId || 'usr-1', userName || 'Sarah Jenkins', userRole || 'Quality Manager', comment);
    res.json({ comment: newComment });
  });

  app.get('/api/audit-logs', (req, res) => {
    res.json({ auditLogs: db.getAuditLogs() });
  });

  app.get('/api/notifications', (req, res) => {
    res.json({ notifications: db.getNotifications() });
  });

  app.post('/api/db/reset', (req, res) => {
    const result = db.resetToSeed();
    res.json(result);
  });

  app.get('/api/system/schema', (req, res) => {
    res.json({
      schemaDump: db.getFullSchemaDump(),
      tables: ['Users', 'Complaints', 'ComplaintHistory', 'Comments', 'Attachments', 'AuditLogs', 'RiskAssessment', 'AIConversations', 'DocumentMetadata', 'Notifications'],
    });
  });

  // VITE MIDDLEWARE OR STATIC SERVING
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AI Complaint Copilot Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
