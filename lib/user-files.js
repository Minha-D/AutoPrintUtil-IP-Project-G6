const crypto = require('crypto');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const uploadsRoot = path.join(__dirname, '..', 'uploads');
let windowsPermissionsApplied = false;

function secureUploadsRoot() {
  fs.mkdirSync(uploadsRoot, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') {
    fs.chmodSync(uploadsRoot, 0o700);
    return;
  }

  if (windowsPermissionsApplied) return;
  const identity = execFileSync('whoami.exe', [], { encoding: 'utf8', windowsHide: true }).trim();
  execFileSync('icacls.exe', [
    uploadsRoot,
    '/inheritance:r',
    '/grant:r',
    `${identity}:(OI)(CI)F`,
    'SYSTEM:(OI)(CI)F'
  ], { windowsHide: true, stdio: 'ignore' });
  windowsPermissionsApplied = true;
}

function getUserDirectoryName(studentId) {
  return crypto.createHash('sha256').update(String(studentId)).digest('hex');
}

function getUserUploadDirectory(studentId) {
  return path.join(uploadsRoot, getUserDirectoryName(studentId));
}

function ensureUserUploadDirectory(studentId) {
  secureUploadsRoot();
  const directory = getUserUploadDirectory(studentId);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') fs.chmodSync(directory, 0o700);
  return directory;
}

function migrateLegacyUploads(studentIds) {
  secureUploadsRoot();
  const entries = fs.readdirSync(uploadsRoot, { withFileTypes: true });
  let migrated = false;

  for (const studentId of studentIds) {
    const prefix = `${studentId}_`;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith(prefix)) continue;
      const destinationDirectory = ensureUserUploadDirectory(studentId);
      const source = path.join(uploadsRoot, entry.name);
      const destination = path.join(destinationDirectory, entry.name);
      fs.renameSync(source, destination);
      secureUploadedFile(destination);
      migrated = true;
    }
  }

  return migrated;
}

function getDocumentPath(studentId, filename) {
  const safeFilename = path.basename(filename);
  if (!safeFilename || safeFilename !== filename) return null;

  const privatePath = path.join(getUserUploadDirectory(studentId), safeFilename);
  if (fs.existsSync(privatePath)) return privatePath;

  // Existing records may still point to files from the old flat uploads folder.
  const legacyPath = path.join(uploadsRoot, safeFilename);
  if (safeFilename.startsWith(`${studentId}_`) && fs.existsSync(legacyPath)) {
    return legacyPath;
  }

  return privatePath;
}

function secureUploadedFile(filePath) {
  if (process.platform !== 'win32') fs.chmodSync(filePath, 0o600);
}

module.exports = {
  ensureUserUploadDirectory,
  getDocumentPath,
  migrateLegacyUploads,
  secureUploadedFile
};