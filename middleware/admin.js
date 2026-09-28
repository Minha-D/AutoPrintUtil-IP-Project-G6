function getAdminIds() {
  return (process.env.ADMIN_IDS || '')
    .split(',')
    .map(studentId => studentId.trim())
    .filter(Boolean);
}

function isAdmin(studentId) {
  return Boolean(studentId) && getAdminIds().includes(studentId);
}

function requireAdmin(req, res, next) {
  if (!req.session?.studentId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  if (!isAdmin(req.session.studentId)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

function requireAdminPage(req, res, next) {
  if (!req.session?.studentId) return res.redirect('/login.html');
  if (!isAdmin(req.session.studentId)) return res.redirect('/documents.html');
  next();
}

module.exports = { isAdmin, requireAdmin, requireAdminPage };