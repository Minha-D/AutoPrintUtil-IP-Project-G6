const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { readDB, writeDB } = require('../db');
const { requireAuth } = require('../middleware/auth');
const {
  ensureUserUploadDirectory,
  getDocumentPath,
  migrateLegacyUploads,
  secureUploadedFile
} = require('../lib/user-files');

const router = express.Router();

migrateLegacyUploads(readDB().students.map(student => student.id));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      cb(null, ensureUserUploadDirectory(req.session.studentId));
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase() || '.pdf'}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
  },
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB cap
});

router.post('/upload', requireAuth, upload.single('pdf'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded' });
  }

  try {
    secureUploadedFile(req.file.path);
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    return res.status(500).json({ error: 'Could not secure the uploaded document.' });
  }

  const db = readDB();
  const doc = {
    id: randomUUID(),
    studentId: req.session.studentId,
    originalName: req.file.originalname,
    filename: req.file.filename,
    uploadedAt: new Date().toISOString()
  };
  db.documents.push(doc);
  writeDB(db);

  res.json({ success: true, document: doc });
});

router.get('/documents', requireAuth, (req, res) => {
  const db = readDB();
  const docs = db.documents.filter(d => d.studentId === req.session.studentId);
  res.json(docs);
});

router.get('/documents/:documentId/file', requireAuth, (req, res) => {
  const db = readDB();
  const doc = db.documents.find(document =>
    document.id === req.params.documentId && document.studentId === req.session.studentId
  );

  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const filePath = getDocumentPath(req.session.studentId, doc.filename);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Document file not found' });
  }

  res.type('application/pdf').sendFile(filePath);
});

module.exports = router;
