const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { readDB, writeDB } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const unique = `${req.session.studentId}_${Date.now()}${path.extname(file.originalname)}`;
    cb(null, unique);
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

  const db = readDB();
  const doc = {
    id: Date.now().toString(),
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

module.exports = router;
