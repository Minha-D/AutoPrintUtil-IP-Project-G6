const express = require('express');
const path = require('path');
const { print, getPrinters } = require('pdf-to-printer');
const { readDB, writeDB } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// IMPORTANT: change this to match the exact printer name as it appears
// in Windows "Devices and Printers" (or `lpstat -p` on Linux/Mac)
const PRINTER_NAME = 'YourPrinterName';

router.post('/print', requireAuth, async (req, res) => {
  const { documentId, copies, color } = req.body;
  const db = readDB();
  const doc = db.documents.find(
    d => d.id === documentId && d.studentId === req.session.studentId
  );

  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }
