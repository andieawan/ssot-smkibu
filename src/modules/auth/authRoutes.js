'use strict';
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../../config/db');

// GET /login
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('pages/login', { title: 'Login - SinergiCare v3.0' });
});

// POST /login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    req.flash('error', 'Username dan password wajib diisi.');
    return res.redirect('/login');
  }
  try {
    const [rows] = await db.execute(
      `SELECT * FROM staf_sekolah WHERE username = ? LIMIT 1`,
      [username.trim()]
    );
    if (rows.length === 0) {
      req.flash('error', 'Username atau password salah.');
      return res.redirect('/login');
    }
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      req.flash('error', 'Username atau password salah.');
      return res.redirect('/login');
    }
    req.session.user = {
      id: user.id,
      nama: user.nama,
      username: user.username,
      email: user.email,
      role: user.role,
      foto: user.foto
    };
    req.flash('success', `Selamat datang, ${user.nama}!`);
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Login error:', err);
    req.flash('error', 'Terjadi kesalahan sistem. Coba lagi.');
    res.redirect('/login');
  }
});

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
