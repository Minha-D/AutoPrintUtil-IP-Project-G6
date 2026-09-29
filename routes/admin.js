const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { timingSafeEqual } = require('crypto');
const { promisify } = require('util');
const { readDB, writeDB } = require('../db');
const { requireAdmin } = require('../middleware/admin');
const { getDocumentPath } = require('../lib/user-files');
const { getPrinters, getDefaultPrinter } = require('pdf-to-printer');
const printRoutes = require('./print');

const router = express.Router();
const execFileAsync = promisify(execFile);
const rootDir = path.join(__dirname, '..');
const uploadsDir = path.join(rootDir, 'uploads');

function passwordMatches(candidate) {
  const expected = Buffer.from(process.env.ADMIN_PASSWORD || 'admin123');
  const supplied = Buffer.from(typeof candidate === 'string' ? candidate : '');
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

router.post('/admin/login', (req, res) => {
  if (!passwordMatches(req.body.password)) {
    return res.status(401).json({ error: 'Incorrect admin password.' });
  }

  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Could not start admin session.' });
    req.session.isAdmin = true;
    req.session.studentName = 'Administrator';
    res.json({ success: true });
  });
});

router.use(requireAdmin);

router.get('/admin/payment-requests', (req, res) => {
  const db = readDB();
  const students = new Map((db.students || []).map(student => [student.id, student.name]));
  const requests = Array.isArray(db.paymentRequests) ? db.paymentRequests : [];
  res.json(requests
    .filter(request => request.status === 'pending_approval')
    .slice()
    .reverse()
    .map(request => ({
      requestId: request.requestId,
      studentId: request.studentId,
      studentName: students.get(request.studentId) || 'Unknown user',
      documentId: request.documentId,
      filename: request.filename,
      pages: request.pages,
      copies: request.copies,
      color: request.color,
      ratePerPage: request.ratePerPage,
      totalPages: request.totalPages,
      totalBdt: request.totalBdt,
      requestedAt: request.requestedAt
    })));
});

router.get('/admin/payment-history', (req, res) => {
  const db = readDB();
  const students = new Map((db.students || []).map(student => [student.id, student.name]));
  const jobsById = new Map((db.printLog || []).map(job => [job.jobId, job]));
  const requests = Array.isArray(db.paymentRequests) ? db.paymentRequests : [];

  res.json(requests
    .slice()
    .reverse()
    .slice(0, 100)
    .map(request => {
      const printJob = request.printJobId ? jobsById.get(request.printJobId) : null;
      return {
        requestId: request.requestId,
        studentId: request.studentId,
        studentName: students.get(request.studentId) || 'Unknown user',
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
        printStatus: printJob?.status || null,
        printError: printJob?.error || null,
        printedAt: printJob?.completedAt || null
      };
    }));
});

router.post('/admin/payment-requests/:requestId/review', (req, res) => {
  const decision = req.body.decision;
  if (!['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'Choose approve or reject.' });
  }

  const db = readDB();
  db.paymentRequests = Array.isArray(db.paymentRequests) ? db.paymentRequests : [];
  const request = db.paymentRequests.find(entry => entry.requestId === req.params.requestId);
  if (!request) return res.status(404).json({ error: 'Payment request not found.' });
  if (request.status !== 'pending_approval') {
    return res.status(409).json({ error: 'This payment request has already been reviewed.' });
  }

  request.status = decision === 'approve' ? 'approved' : 'rejected';
  request.reviewedAt = new Date().toISOString();
  request.reviewedBy = req.session.studentId || 'password-admin';
  if (decision === 'reject') {
    request.rejectionReason = typeof req.body.reason === 'string'
      ? req.body.reason.trim().slice(0, 240)
      : '';
    writeDB(db);
    return res.json({ success: true, status: request.status });
  }

  writeDB(db);
  const printJob = printRoutes.enqueueApprovedRequest(request);
  if (!printJob) {
    const latestDb = readDB();
    const savedRequest = latestDb.paymentRequests.find(entry => entry.requestId === request.requestId);
    savedRequest.status = 'pending_approval';
    delete savedRequest.reviewedAt;
    delete savedRequest.reviewedBy;
    writeDB(latestDb);
    return res.status(500).json({ error: 'Could not add the approved payment to the print queue.' });
  }

  res.json({ success: true, status: request.status, position: printJob.position });
});

async function getDirectoryBytes(directory) {
  let total = 0;
  let entries;

  try {
    entries = await fs.promises.readdir(directory, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      total += await getDirectoryBytes(entryPath);
    } else if (entry.isFile()) {
      total += (await fs.promises.stat(entryPath)).size;
    }
  }

  return total;
}

async function getWindowsPrinterStatuses() {
  if (process.platform !== 'win32') return null;

  const script = 'Get-Printer | Select-Object Name,PrinterStatus,WorkOffline,JobCount | ConvertTo-Json -Compress';
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command', script
  ], { timeout: 5000, windowsHide: true, maxBuffer: 1024 * 1024 });

  if (!stdout.trim()) return [];
  const result = JSON.parse(stdout);
  return Array.isArray(result) ? result : [result];
}

async function getCpuUsage() {
  const sample = () => os.cpus().reduce((total, cpu) => {
    const times = Object.values(cpu.times);
    return {
      idle: total.idle + cpu.times.idle,
      total: total.total + times.reduce((sum, value) => sum + value, 0)
    };
  }, { idle: 0, total: 0 });

  const before = sample();
  await new Promise(resolve => setTimeout(resolve, 100));
  const after = sample();
  const elapsed = after.total - before.total;
  if (elapsed <= 0) return null;
  return Math.round((1 - (after.idle - before.idle) / elapsed) * 100);
}

function formatPrinterStatus(windowsStatus) {
  if (!windowsStatus) return 'Available';
  if (windowsStatus.WorkOffline) return 'Offline';

  const statusNames = {
    0: 'Normal', 1: 'Paused', 2: 'Error', 3: 'Pending deletion',
    4: 'Paper jam', 5: 'Paper out', 6: 'Manual feed', 7: 'Paper problem',
    8: 'Offline', 9: 'I/O active', 10: 'Busy', 11: 'Printing',
    12: 'Output bin full', 13: 'Unavailable', 14: 'Waiting', 15: 'Processing',
    16: 'Initializing', 17: 'Warming up', 18: 'Toner low', 19: 'No toner',
    21: 'User intervention required', 22: 'Out of memory', 23: 'Door open',
    24: 'Server unknown', 25: 'Power save'
  };

  return statusNames[windowsStatus.PrinterStatus] || 'Available';
}

router.get('/admin/status', async (req, res) => {
  try {
    const db = readDB();
    const uploadsBytes = await getDirectoryBytes(uploadsDir);
    const cpuUsage = await getCpuUsage();
    const databasePath = path.join(rootDir, 'db.json');
    let databaseBytes = 0;
    try {
      databaseBytes = (await fs.promises.stat(databasePath)).size;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    let disk;
    try {
      const stats = await fs.promises.statfs(rootDir);
      const total = stats.blocks * stats.bsize;
      const free = stats.bfree * stats.bsize;
      disk = { total, free, used: total - free };
    } catch (err) {
      disk = { error: err.message };
    }

    let printers = [];
    let defaultPrinter = null;
    let printerError = null;
    let windowsStatuses = null;
    try {
      printers = await getPrinters();
      defaultPrinter = await getDefaultPrinter();
      windowsStatuses = await getWindowsPrinterStatuses();
    } catch (err) {
      printerError = err instanceof Error ? err.message : String(err);
    }

    const windowsStatusByName = new Map(
      (windowsStatuses || []).map(printer => [printer.Name, printer])
    );
    const printJobs = Array.isArray(db.printLog) ? db.printLog : [];
    const documents = Array.isArray(db.documents) ? db.documents : [];
    const students = Array.isArray(db.students) ? db.students : [];
    const failures = printJobs
      .filter(job => job.status === 'failed')
      .slice(-10)
      .reverse()
      .map(job => ({
        studentId: job.studentId,
        documentId: job.documentId,
        error: job.error || 'Print job failed',
        occurredAt: job.completedAt || job.queuedAt
      }));

    res.json({
      refreshedAt: new Date().toISOString(),
      machine: {
        hostname: os.hostname(),
        platform: `${os.type()} ${os.release()}`,
        architecture: os.arch(),
        cpu: os.cpus()[0]?.model || 'Unknown',
        cpuCount: os.cpus().length,
        cpuUsage,
        uptime: os.uptime(),
        memory: { total: os.totalmem(), free: os.freemem() },
        disk
      },
      storage: {
        uploadsBytes,
        databaseBytes,
        applicationDataBytes: uploadsBytes + databaseBytes,
        documents: documents.length
      },
      users: students.map(student => {
        const userDocuments = documents.filter(document => document.studentId === student.id);
        return {
          studentId: student.id,
          name: student.name,
          documents: userDocuments.length,
          storageBytes: userDocuments.reduce((total, document) => {
            try {
              const filePath = getDocumentPath(document.studentId, document.filename);
              return filePath ? total + fs.statSync(filePath).size : total;
            } catch {
              return total;
            }
          }, 0)
        };
      }),
      printers: printers.map(printer => {
        const windowsStatus = windowsStatusByName.get(printer.name);
        return {
          name: printer.name,
          isDefault: defaultPrinter?.name === printer.name,
          status: formatPrinterStatus(windowsStatus),
          jobCount: windowsStatus?.JobCount ?? null
        };
      }),
      printerError,
      printQueue: {
        queued: printJobs.filter(job => job.status === 'queued').length,
        printing: printJobs.filter(job => job.status === 'printing').length,
        completed: printJobs.filter(job => job.status === 'completed').length,
        failed: printJobs.filter(job => job.status === 'failed').length
      },
      pendingPaymentApprovals: (Array.isArray(db.paymentRequests) ? db.paymentRequests : [])
        .filter(request => request.status === 'pending_approval').length,
      failures
    });
  } catch (err) {
    console.error('Could not load admin status:', err);
    res.status(500).json({ error: 'Could not load system status.' });
  }
});

module.exports = router;