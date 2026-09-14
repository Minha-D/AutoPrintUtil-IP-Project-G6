function requireAuth(req, res, next) {
  if (!req.session.studentId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

module.exports = { requireAuth };
