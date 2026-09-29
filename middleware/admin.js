function getAdminIds() {
  return (process.env.ADMIN_IDS || '')
    .split(',')
    .map(studentId => studentId.trim())
    .filter(Boolean);
}

function isAdmin(studentId) {
  return Boolean(studentId) && getAdminIds().includes(studentId);
}

function hasAdminAccess(req) {
  return req.session?.isAdmin === true || isAdmin(req.session?.studentId);
}

function requireAdmin(req, res, next) {
  if (!req.session?.studentId && !req.session?.isAdmin) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  if (!hasAdminAccess(req)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

function requireAdminPage(req, res, next) {
  if (!hasAdminAccess(req)) return res.redirect('/admin');
  next();
}

module.exports = { isAdmin, hasAdminAccess, requireAdmin, requireAdminPage };