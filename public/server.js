const express = require('express');
const session = require('express-session');
const path = require('path');

const authRoutes = require('../routes/auth');
const uploadRoutes = require('../routes/upload');
const printRoutes = require('../routes/print');
const adminRoutes = require('../routes/admin');
const { requireAdmin, requireAdminPage } = require('../middleware/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'student-print-system-secret', // change before any real deployment
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 2 } // 2 hour session
}));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'landing.html'));
});

app.get('/admin.html', requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Keep the server entry point private while serving frontend assets.
app.get('/server.js', (req, res) => res.sendStatus(404));
app.use(express.static(__dirname));

// Serve uploaded PDFs so they can be previewed in the browser
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use('/api', authRoutes);
app.use('/api', uploadRoutes);
app.use('/api', printRoutes);
app.use('/api', adminRoutes);

app.listen(PORT, () => {
  console.log(`Student Print System running at http://localhost:${PORT}`);
});
