'use strict';
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const methodOverride = require('method-override');
const fileUpload = require('express-fileupload');

const { attachUser } = require('./core/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── View Engine ────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── Static Files ───────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Body Parsers ───────────────────────────────────────────────
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(methodOverride('_method'));

// ─── File Upload ─────────────────────────────────────────────────
app.use(fileUpload({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  abortOnLimit: true
}));

// ─── Session ────────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'sinergicare_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    maxAge: 8 * 60 * 60 * 1000 // 8 jam
  }
}));

// ─── Flash Messages ─────────────────────────────────────────────
app.use(flash());

// ─── Attach User to Locals ──────────────────────────────────────
app.use(attachUser);

// ─── Global Locals ──────────────────────────────────────────────
app.use((req, res, next) => {
  res.locals.appName = 'SinergiCare v3.0';
  res.locals.currentPath = req.path;
  next();
});

// ─── Routes ─────────────────────────────────────────────────────
app.use('/', require('./modules/auth/authRoutes'));
app.use('/dashboard', require('./modules/dashboard/dashboardRoutes'));
app.use('/jurnal', require('./modules/jurnal/jurnalRoutes'));
app.use('/bk', require('./modules/bk/bkRoutes'));
app.use('/waka', require('./modules/waka/wakaRoutes'));
app.use('/kajur', require('./modules/kajur/kajurRoutes'));
app.use('/admin', require('./modules/admin/adminRoutes'));
app.use('/cetak', require('./modules/cetak/cetakRoutes'));
app.use('/siswa', require('./modules/siswa/siswaRoutes'));
app.use('/profile', require('./modules/profile/profileRoutes'));

// ─── Root Redirect ──────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.redirect('/login');
});

// ─── 404 Handler ────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('pages/404', { title: 'Halaman Tidak Ditemukan' });
});

// ─── Error Handler ──────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).render('pages/error', {
    title: 'Terjadi Kesalahan',
    message: err.message || 'Internal Server Error'
  });
});

// ─── Start Server ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 SinergiCare v3.0 berjalan di http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
