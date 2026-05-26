'use strict';
const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireRole } = require('../../core/auth');
const { hitungProbationEnd } = require('../../core/functions');

const wakaAccess = requireRole('super_admin', 'admin', 'waka_kesiswaan');

// GET /waka - Panel Waka Kesiswaan
router.get('/', wakaAccess, async (req, res) => {
  try {
    const { search, page = 1 } = req.query;
    const limit = 15;
    const offset = (parseInt(page) - 1) * limit;

    let where = [`(s.status_warna = 'merah' OR s.status_sp != 'tidak_ada' OR s.is_probation = 1)`];
    let params = [];

    if (search) {
      where.push(`(s.nama LIKE ? OR s.nisn LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereStr = where.join(' AND ');

    const [students] = await db.execute(`
      SELECT s.*, c.nama_kelas,
             COUNT(DISTINCT i.id) as total_insiden
      FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN incidents i ON i.student_id = s.id
      WHERE ${whereStr}
      GROUP BY s.id
      ORDER BY FIELD(s.status_sp,'sp_3','sp_2','sp_1','tidak_ada'), s.total_poin DESC
      LIMIT ${limit} OFFSET ${offset}
    `, params);

    const [[{ total_count }]] = await db.execute(`
      SELECT COUNT(*) as total_count FROM students s WHERE ${whereStr}
    `, params);

    // SP menunggu approval
    const [spMenunggu] = await db.execute(`
      SELECT sp.*, s.nama as nama_siswa, s.nisn, c.nama_kelas, st.nama as dibuat_nama
      FROM sp_records sp
      JOIN students s ON sp.student_id = s.id
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN staf_sekolah st ON sp.dibuat_oleh = st.id
      WHERE sp.status_approval = 'menunggu'
      ORDER BY sp.created_at DESC
    `);

    const totalPages = Math.ceil(total_count / limit);

    res.render('pages/waka', {
      title: 'Panel Waka Kesiswaan',
      students, spMenunggu,
      search: search || '',
      page: parseInt(page), totalPages, total_count
    });
  } catch (err) {
    console.error('Waka error:', err);
    req.flash('error', 'Gagal memuat panel Waka.');
    res.redirect('/dashboard');
  }
});

// POST /waka/sp/buat - Buat SP baru
router.post('/sp/buat', wakaAccess, async (req, res) => {
  const { student_id, jenis_sp, alasan } = req.body;
  if (!student_id || !jenis_sp || !alasan) {
    req.flash('error', 'Data SP tidak lengkap.');
    return res.redirect('/waka');
  }
  try {
    const today = new Date().toISOString().slice(0, 10);
    await db.execute(
      `INSERT INTO sp_records (student_id, jenis_sp, alasan, status_approval, dibuat_oleh, tanggal_dibuat)
       VALUES (?, ?, ?, 'menunggu', ?, ?)`,
      [student_id, jenis_sp, alasan, req.session.user.id, today]
    );
    req.flash('success', 'Usulan SP berhasil dibuat. Menunggu persetujuan.');
    res.redirect('/waka');
  } catch (err) {
    console.error('Buat SP error:', err);
    req.flash('error', 'Gagal membuat SP.');
    res.redirect('/waka');
  }
});

// POST /waka/sp/:id/approve - Setujui SP
router.post('/sp/:id/approve', wakaAccess, async (req, res) => {
  try {
    const [rows] = await db.execute(`SELECT * FROM sp_records WHERE id = ?`, [req.params.id]);
    if (rows.length === 0) {
      req.flash('error', 'SP tidak ditemukan.');
      return res.redirect('/waka');
    }
    const sp = rows[0];
    const today = new Date().toISOString().slice(0, 10);
    const probEnd = hitungProbationEnd();

    // Update SP record
    await db.execute(
      `UPDATE sp_records SET status_approval='disetujui', disetujui_oleh=?, tanggal_disetujui=?, probation_end=? WHERE id=?`,
      [req.session.user.id, today, probEnd, req.params.id]
    );

    // Update student status
    await db.execute(
      `UPDATE students SET status_sp=?, is_probation=1, probation_end=?, status_warna='merah', level_eskalasi='skorsing_drop' WHERE id=?`,
      [sp.jenis_sp, probEnd, sp.student_id]
    );

    req.flash('success', 'SP berhasil disetujui. Probation 30 hari diaktifkan.');
    res.redirect('/waka');
  } catch (err) {
    console.error('Approve SP error:', err);
    req.flash('error', 'Gagal menyetujui SP.');
    res.redirect('/waka');
  }
});

// POST /waka/sp/:id/tolak - Tolak SP
router.post('/sp/:id/tolak', wakaAccess, async (req, res) => {
  try {
    await db.execute(
      `UPDATE sp_records SET status_approval='ditolak' WHERE id=?`,
      [req.params.id]
    );
    req.flash('info', 'SP ditolak.');
    res.redirect('/waka');
  } catch (err) {
    req.flash('error', 'Gagal menolak SP.');
    res.redirect('/waka');
  }
});

module.exports = router;
