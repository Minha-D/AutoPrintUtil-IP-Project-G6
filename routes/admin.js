const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { readDB } = require('../db');
const { requireAdmin } = require('../middleware/admin');
const { getPrinters, getDefaultPrinter } = require('pdf-to-printer');

const router = express.Router();
const execFileAsync = promisify(execFile);
const rootDir = path.join(__dirname, '..');
const uploadsDir = path.join(rootDir, 'uploads');

router.use(requireAdmin);

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
              return total + fs.statSync(path.join(uploadsDir, path.basename(document.filename))).size;
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
      failures
    });
  } catch (err) {
    console.error('Could not load admin status:', err);
    res.status(500).json({ error: 'Could not load system status.' });
  }
});

module.exports = router;