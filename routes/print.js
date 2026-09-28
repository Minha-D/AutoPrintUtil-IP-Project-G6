const express = require('express');
const path = require('path');
const { randomUUID } = require('crypto');
const { print, getPrinters, getDefaultPrinter } = require('pdf-to-printer');
const { readDB, writeDB } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const PRINTER_NAME = process.env.PRINTER_NAME?.trim();
let queuedJobIds = [];
let activeJobId = null;
let queueWorkerRunning = false;

function getQueuedJobs(db) {
  return db.printLog
    .filter(job => job.jobId && job.status === 'queued');
}

function getQueuePosition(db, jobId) {
  const index = getQueuedJobs(db).findIndex(job => job.jobId === jobId);
  return index < 0 ? null : index + (activeJobId ? 2 : 1);
}

function getPrintError(err) {
  const error = err instanceof Error ? err.message : String(err);
  if (error.includes('Operating System not supported')) {
    return 'Printing is only available when the server is running on Windows.';
  }
  return 'The print job could not be completed. Check the printer and try again.';
}

async function processQueue() {
  if (queueWorkerRunning) return;
  queueWorkerRunning = true;

  try {
    while (queuedJobIds.length > 0) {
      const jobId = queuedJobIds.shift();
      activeJobId = jobId;
      const db = readDB();
      const job = db.printLog.find(entry => entry.jobId === jobId);
      if (!job) {
        activeJobId = null;
        continue;
      }

      job.status = 'printing';
      job.startedAt = new Date().toISOString();
      writeDB(db);

      try {
        const document = db.documents.find(entry =>
          entry.id === job.documentId && entry.studentId === job.studentId
        );
        if (!document) throw new Error('Document not found');

        const printers = await getPrinters();
        const selectedPrinter = PRINTER_NAME
          ? printers.find(printer => printer.name === PRINTER_NAME)
          : await getDefaultPrinter();

        if (!selectedPrinter || !printers.some(printer => printer.name === selectedPrinter.name)) {
          throw new Error('No printer available');
        }

        await print(path.join(__dirname, '..', 'uploads', document.filename), {
          printer: selectedPrinter.name,
          sumatraPdfSettings: [job.color === 'bw' ? 'monochrome' : 'color', `${job.copies}x`]
        });

        const latestDb = readDB();
        const completedJob = latestDb.printLog.find(entry => entry.jobId === jobId);
        if (completedJob) {
          completedJob.status = 'completed';
          completedJob.completedAt = new Date().toISOString();
          delete completedJob.error;
          writeDB(latestDb);
        }
      } catch (err) {
        console.error('Print job failed:', err);
        const latestDb = readDB();
        const failedJob = latestDb.printLog.find(entry => entry.jobId === jobId);
        if (failedJob) {
          failedJob.status = 'failed';
          failedJob.error = getPrintError(err);
          failedJob.completedAt = new Date().toISOString();
          writeDB(latestDb);
        }
      }

      activeJobId = null;
    }
  } finally {
    queueWorkerRunning = false;
    activeJobId = null;
    if (queuedJobIds.length > 0) void processQueue();
  }
}

const startupDb = readDB();
const interruptedJobs = startupDb.printLog.filter(job =>
  job.jobId && (job.status === 'queued' || job.status === 'printing')
);
interruptedJobs.forEach(job => {
  if (job.status === 'printing') {
    job.status = 'queued';
    delete job.startedAt;
  }
});
queuedJobIds = getQueuedJobs(startupDb).map(job => job.jobId);
if (interruptedJobs.length > 0) writeDB(startupDb);
if (queuedJobIds.length > 0) void processQueue();

router.post('/print', requireAuth, (req, res) => {
  const { documentId, copies, color } = req.body;
  const db = readDB();
  const doc = db.documents.find(
    d => d.id === documentId && d.studentId === req.session.studentId
  );

  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  const numCopies = Math.max(1, parseInt(copies, 10) || 1);
  const job = {
    jobId: randomUUID(),
    documentId: doc.id,
    studentId: req.session.studentId,
    copies: numCopies,
    color,
    status: 'queued',
    queuedAt: new Date().toISOString()
  };

  db.printLog.push(job);
  writeDB(db);
  queuedJobIds.push(job.jobId);
  const position = getQueuePosition(db, job.jobId);
  res.status(202).json({ success: true, jobId: job.jobId, status: job.status, position });
  void processQueue();
});

router.get('/print/jobs', requireAuth, (req, res) => {
  const db = readDB();
  const jobs = db.printLog
    .filter(job => job.jobId && job.studentId === req.session.studentId)
    .reverse()
    .slice(0, 50)
    .map(job => ({
      jobId: job.jobId,
      documentId: job.documentId,
      status: job.status,
      position: job.status === 'queued' ? getQueuePosition(db, job.jobId) : null,
      queuedAt: job.queuedAt,
      error: job.status === 'failed' ? job.error : undefined
    }));

  res.json(jobs);
});

// Handy endpoint to check exact printer names available on the machine
router.get('/printers', requireAuth, async (req, res) => {
  try {
    const printers = await getPrinters();
    res.json(printers);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err)
    });
  }
});

module.exports = router;
