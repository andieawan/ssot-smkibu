'use strict';
const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const bcrypt = require('bcryptjs');
const { requireLogin } = require('../../core/auth');

// GET /profile - Edit profil
router.get('/', requireLogin, async (req, res) => {
  const [rows] = await db.execute(`SELECT id, nama, email, username, role FROM staf_sekolah WHERE id=?`, [req.session.user.id]);
  res.render('pages/profile', { title: 'Edit Profil', staf: rows[0] || {} });
});

// POST /profile - Update profil
router.post('/', requireLogin, async (req, res) => {
  const { nama, email, password_baru, password_lama } = req.body;
  try {
    const [rows] = await db.execute(`SELECT * FROM staf_sekolah WHERE id=?`, [req.session.user.id]);
    if (rows.length === 0) { req.flash('error', 'Akun tidak ditemukan.'); return res.redirect('/profile'); }
    const user = rows[0];

    if (password_baru && password_baru.length >= 6) {
      const match = await bcrypt.compare(password_lama || '', user.password);
      if (!match) { req.flash('error', 'Password lama tidak sesuai.'); return res.redirect('/profile'); }
      const hashed = await bcrypt.hash(password_baru, 12);
      await db.execute(`UPDATE staf_sekolah SET nama=?, email=?, password=? WHERE id=?`,
        [nama.trim(), email || null, hashed, req.session.user.id]);
    } else {
      await db.execute(`UPDATE staf_sekolah SET nama=?, email=? WHERE id=?`,
        [nama.trim(), email || null, req.session.user.id]);
    }

    req.session.user.nama = nama.trim();
    req.session.user.email = email;
    req.flash('success', 'Profil berhasil diperbarui.');
    res.redirect('/profile');
  } catch (err) {
    req.flash('error', 'Gagal memperbarui profil.');
    res.redirect('/profile');
  }
});

module.exports = router;
