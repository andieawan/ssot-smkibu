'use strict';
const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireLogin, canEditIncident } = require('../../core/auth');
const { hitungUlangRadarSiswa } = require('../../core/functions');

// GET /jurnal - Daftar insiden
router.get('/', requireLogin, async (req, res) => {
  try {
    const user = req.session.user;
    const { search, kelas, bobot, page = 1 } = req.query;
    const limit = 20;
    const offset = (parseInt(page) - 1) * limit;

    let where = ['1=1'];
    let params = [];

    if (search) {
      where.push(`(s.nama LIKE ? OR s.nisn LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }
    if (kelas) {
      where.push(`s.class_id = ?`);
      params.push(kelas);
    }
    if (bobot) {
      where.push(`vc.bobot_risiko = ?`);
      params.push(bobot);
    }

    const whereStr = where.join(' AND ');

    const [incidents] = await db.execute(`
      SELECT i.*, s.nama as nama_siswa, s.nisn, c.nama_kelas,
             vc.nama_kejadian, vc.bobot_risiko, st.nama as nama_pelapor
      FROM incidents i
      JOIN students s ON i.student_id = s.id
      LEFT JOIN classes c ON s.class_id = c.id
      JOIN violation_categories vc ON i.category_id = vc.id
      LEFT JOIN staf_sekolah st ON i.user_id = st.id
      WHERE ${whereStr}
      ORDER BY i.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `, params);

    const [[{ total_count }]] = await db.execute(`
      SELECT COUNT(*) as total_count FROM incidents i
      JOIN students s ON i.student_id = s.id
      LEFT JOIN classes c ON s.class_id = c.id
      JOIN violation_categories vc ON i.category_id = vc.id
      WHERE ${whereStr}
    `, params);

    const [categories] = await db.execute(`SELECT * FROM violation_categories ORDER BY bobot_risiko, nama_kejadian`);
    const [classes] = await db.execute(`SELECT * FROM classes ORDER BY nama_kelas`);

    const totalPages = Math.ceil(total_count / limit);

    // Tandai apakah bisa edit
    const now = new Date();
    const incidentsWithEdit = incidents.map(inc => ({
      ...inc,
      canEdit: canEditIncident(user, inc.created_at)
    }));

    res.render('pages/jurnal', {
      title: 'Jurnal Insiden',
      incidents: incidentsWithEdit,
      categories, classes,
      search: search || '', kelas: kelas || '', bobot: bobot || '',
      page: parseInt(page), totalPages, total_count
    });
  } catch (err) {
    console.error('Jurnal error:', err);
    req.flash('error', 'Gagal memuat jurnal insiden.');
    res.redirect('/dashboard');
  }
});

// GET /jurnal/tambah - Form tambah insiden
router.get('/tambah', requireLogin, async (req, res) => {
  try {
    const [categories] = await db.execute(`SELECT * FROM violation_categories ORDER BY bobot_risiko, nama_kejadian`);
    res.render('pages/jurnal_tambah', {
      title: 'Tambah Insiden',
      categories,
      today: new Date().toISOString().slice(0, 10)
    });
  } catch (err) {
    req.flash('error', 'Gagal memuat form.');
    res.redirect('/jurnal');
  }
});

// POST /jurnal/tambah - Simpan insiden baru
router.post('/tambah', requireLogin, async (req, res) => {
  const { student_id, category_id, tanggal_kejadian, lokasi_kejadian, catatan } = req.body;
  if (!student_id || !category_id || !tanggal_kejadian) {
    req.flash('error', 'Data tidak lengkap. Pastikan siswa, kategori, dan tanggal diisi.');
    return res.redirect('/jurnal/tambah');
  }
  try {
    await db.execute(
      `INSERT INTO incidents (student_id, category_id, user_id, catatan, lokasi_kejadian, tanggal_kejadian)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [student_id, category_id, req.session.user.id, catatan || null, lokasi_kejadian || null, tanggal_kejadian]
    );
    await hitungUlangRadarSiswa(parseInt(student_id));
    req.flash('success', 'Insiden berhasil dicatat.');
    res.redirect('/jurnal');
  } catch (err) {
    console.error('Tambah insiden error:', err);
    req.flash('error', 'Gagal menyimpan insiden.');
    res.redirect('/jurnal/tambah');
  }
});

// GET /jurnal/edit/:id
router.get('/edit/:id', requireLogin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT i.*, s.nama as nama_siswa, s.nisn FROM incidents i
       JOIN students s ON i.student_id = s.id WHERE i.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) {
      req.flash('error', 'Insiden tidak ditemukan.');
      return res.redirect('/jurnal');
    }
    const incident = rows[0];
    if (!canEditIncident(req.session.user, incident.created_at)) {
      req.flash('error', 'Waktu edit sudah habis (30 menit).');
      return res.redirect('/jurnal');
    }
    const [categories] = await db.execute(`SELECT * FROM violation_categories ORDER BY bobot_risiko, nama_kejadian`);
    res.render('pages/jurnal_edit', { title: 'Edit Insiden', incident, categories });
  } catch (err) {
    req.flash('error', 'Gagal memuat form edit.');
    res.redirect('/jurnal');
  }
});

// POST /jurnal/edit/:id
router.post('/edit/:id', requireLogin, async (req, res) => {
  const { category_id, tanggal_kejadian, lokasi_kejadian, catatan } = req.body;
  try {
    const [rows] = await db.execute(`SELECT * FROM incidents WHERE id = ?`, [req.params.id]);
    if (rows.length === 0) {
      req.flash('error', 'Insiden tidak ditemukan.');
      return res.redirect('/jurnal');
    }
    const incident = rows[0];
    if (!canEditIncident(req.session.user, incident.created_at)) {
      req.flash('error', 'Waktu edit sudah habis (30 menit).');
      return res.redirect('/jurnal');
    }
    await db.execute(
      `UPDATE incidents SET category_id=?, tanggal_kejadian=?, lokasi_kejadian=?, catatan=? WHERE id=?`,
      [category_id, tanggal_kejadian, lokasi_kejadian || null, catatan || null, req.params.id]
    );
    await hitungUlangRadarSiswa(incident.student_id);
    req.flash('success', 'Insiden berhasil diperbarui.');
    res.redirect('/jurnal');
  } catch (err) {
    console.error('Edit insiden error:', err);
    req.flash('error', 'Gagal memperbarui insiden.');
    res.redirect('/jurnal');
  }
});

// POST /jurnal/hapus/:id
router.post('/hapus/:id', requireLogin, async (req, res) => {
  try {
    const [rows] = await db.execute(`SELECT * FROM incidents WHERE id = ?`, [req.params.id]);
    if (rows.length === 0) {
      req.flash('error', 'Insiden tidak ditemukan.');
      return res.redirect('/jurnal');
    }
    const incident = rows[0];
    if (!canEditIncident(req.session.user, incident.created_at)) {
      req.flash('error', 'Waktu hapus sudah habis (30 menit).');
      return res.redirect('/jurnal');
    }
    await db.execute(`DELETE FROM incidents WHERE id = ?`, [req.params.id]);
    await hitungUlangRadarSiswa(incident.student_id);
    req.flash('success', 'Insiden berhasil dihapus.');
    res.redirect('/jurnal');
  } catch (err) {
    console.error('Hapus insiden error:', err);
    req.flash('error', 'Gagal menghapus insiden.');
    res.redirect('/jurnal');
  }
});

// GET /jurnal/api/cari-siswa - AJAX search
router.get('/api/cari-siswa', requireLogin, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);
  try {
    const [rows] = await db.execute(
      `SELECT s.id, s.nisn, s.nama, c.nama_kelas, s.status_warna
       FROM students s
       LEFT JOIN classes c ON s.class_id = c.id
       WHERE s.nama LIKE ? OR s.nisn LIKE ?
       LIMIT 10`,
      [`%${q}%`, `%${q}%`]
    );
    res.json(rows);
  } catch (err) {
    res.json([]);
  }
});

module.exports = router;
