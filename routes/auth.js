const express = require('express');
const router = express.Router();
const { readDB } = require('../db');

router.post('/login', (req, res) => {
  const { studentId } = req.body;
  const db = readDB();
  const student = db.students.find(s => s.id === studentId);

  if (!student) {
    return res.status(401).json({ error: 'Invalid student ID' });
  }

  req.session.studentId = student.id;
  req.session.studentName = student.name;
  res.json({ success: true, name: student.name });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

router.get('/me', (req, res) => {
  if (!req.session.studentId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  res.json({ studentId: req.session.studentId, name: req.session.studentName });
});

module.exports = router;
