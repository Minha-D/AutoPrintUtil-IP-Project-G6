const express = require('express');
const { randomUUID } = require('crypto');
const { print, getPrinters, getDefaultPrinter } = require('pdf-to-printer');
const { readDB, writeDB } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getDocumentPath } = require('../lib/user-files');
const { createPrintQuote } = require('../lib/print-quotes');

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

        await print(getDocumentPath(job.studentId, document.filename), {
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

function enqueueApprovedRequest(paymentRequest) {
  const db = readDB();
  db.paymentRequests = Array.isArray(db.paymentRequests) ? db.paymentRequests : [];
  const storedRequest = db.paymentRequests.find(request => request.requestId === paymentRequest.requestId);
  if (!storedRequest || storedRequest.status !== 'approved' || storedRequest.printJobId) {
    return storedRequest?.printJobId ? { jobId: storedRequest.printJobId, position: null } : null;
  }

  const job = {
    jobId: randomUUID(),
    paymentRequestId: storedRequest.requestId,
    documentId: storedRequest.documentId,
    studentId: storedRequest.studentId,
    copies: storedRequest.copies,
    color: storedRequest.color,
    pages: storedRequest.pages,
    totalBdt: storedRequest.totalBdt,
    status: 'queued',
    queuedAt: new Date().toISOString()
  };

  db.printLog.push(job);
  storedRequest.printJobId = job.jobId;
  writeDB(db);
  queuedJobIds.push(job.jobId);
  const position = getQueuePosition(db, job.jobId);
  void processQueue();
  return { jobId: job.jobId, position };
}

const approvedWithoutJobs = (readDB().paymentRequests || [])
  .filter(request => request.status === 'approved' && !request.printJobId);
approvedWithoutJobs.forEach(enqueueApprovedRequest);

router.post('/print/quote', requireAuth, async (req, res) => {
  try {
    const quote = await createPrintQuote(
      readDB(), req.session.studentId, req.body.documentId, req.body.copies, req.body.color
    );
    res.json(quote);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not create print receipt.' });
  }
});

router.post('/print/payment-requests', requireAuth, async (req, res) => {
  try {
    const db = readDB();
    const quote = await createPrintQuote(
      db, req.session.studentId, req.body.documentId, req.body.copies, req.body.color
    );
    db.paymentRequests = Array.isArray(db.paymentRequests) ? db.paymentRequests : [];
    const hasActiveRequest = db.paymentRequests.some(request => {
      if (request.studentId !== req.session.studentId || request.documentId !== quote.documentId) return false;
      if (request.status === 'pending_approval') return true;
      if (request.status !== 'approved' || !request.printJobId) return false;
      return db.printLog.some(job =>
        job.jobId === request.printJobId && ['queued', 'printing'].includes(job.status)
      );
    });
    if (hasActiveRequest) {
      return res.status(409).json({ error: 'A payment request or print job is already in progress for this document.' });
    }

    const request = {
      requestId: randomUUID(),
      studentId: req.session.studentId,
      ...quote,
      status: 'pending_approval',
      requestedAt: new Date().toISOString()
    };
    db.paymentRequests.push(request);
    writeDB(db);
    res.status(202).json({
      requestId: request.requestId,
      status: request.status,
      totalBdt: request.totalBdt
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not submit payment request.' });
  }
});

router.get('/print/payment-requests', requireAuth, (req, res) => {
  const db = readDB();
  const requests = Array.isArray(db.paymentRequests) ? db.paymentRequests : [];
  const jobsById = new Map((db.printLog || []).map(job => [job.jobId, job]));
  res.json(requests
    .filter(request => request.studentId === req.session.studentId)
    .slice()
    .reverse()
    .slice(0, 50)
    .map(request => {
      const printJob = request.printJobId ? jobsById.get(request.printJobId) : null;
      return {
        requestId: request.requestId,
        documentId: request.documentId,
        filename: request.filename,
        pages: request.pages,
        copies: request.copies,
        color: request.color,
        ratePerPage: request.ratePerPage,
        totalPages: request.totalPages,
        totalBdt: request.totalBdt,
        status: request.status,
        requestedAt: request.requestedAt,
        reviewedAt: request.reviewedAt,
        reviewedBy: request.reviewedBy,
        rejectionReason: request.rejectionReason,
        printJobId: request.printJobId,
        printStatus: printJob?.status || null,
        printError: printJob?.error || null,
        printedAt: printJob?.completedAt || null
      };
    }));
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

router.enqueueApprovedRequest = enqueueApprovedRequest;

module.exports = router;
