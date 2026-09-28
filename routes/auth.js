const express = require('express');
const router = express.Router();
const { readDB } = require('../db');
const { isAdmin } = require('../middleware/admin');

router.post('/login', (req, res) => {
  const { studentId } = req.body;
  const db = readDB();
  const admin = isAdmin(studentId);
  const student = db.students.find(s => s.id === studentId);

  if (!student && !admin) {
    return res.status(401).json({ error: 'Invalid student ID' });
  }

  req.session.studentId = studentId;
  req.session.studentName = student?.name || 'Administrator';
  res.json({ success: true, name: req.session.studentName, isAdmin: admin });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

router.get('/me', (req, res) => {
  if (!req.session.studentId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  res.json({
    studentId: req.session.studentId,
    name: req.session.studentName,
    isAdmin: isAdmin(req.session.studentId)
  });
});

module.exports = router;
