'use strict';
const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireLogin } = require('../../core/auth');
const { formatTanggal, getBadgeWarna, getBadgeBobot } = require('../../core/functions');

// GET /siswa/:id - Profil lengkap siswa
router.get('/:id', requireLogin, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT s.*, c.nama_kelas FROM students s
      LEFT JOIN classes c ON s.class_id = c.id WHERE s.id = ?
    `, [req.params.id]);

    if (rows.length === 0) {
      req.flash('error', 'Siswa tidak ditemukan.');
      return res.redirect('/dashboard');
    }

    const siswa = rows[0];

    const [incidents] = await db.execute(`
      SELECT i.*, vc.nama_kejadian, vc.bobot_risiko, st.nama as nama_pelapor
      FROM incidents i
      JOIN violation_categories vc ON i.category_id = vc.id
      LEFT JOIN staf_sekolah st ON i.user_id = st.id
      WHERE i.student_id = ?
      ORDER BY i.tanggal_kejadian DESC
    `, [req.params.id]);

    const [tugas] = await db.execute(`
      SELECT con.*, st.nama as nama_pendamping
      FROM consequences con
      LEFT JOIN staf_sekolah st ON con.penanggung_jawab = st.id
      WHERE con.student_id = ?
      ORDER BY con.created_at DESC
    `, [req.params.id]);

    const [spRecords] = await db.execute(`
      SELECT sp.*, st1.nama as dibuat_nama, st2.nama as disetujui_nama
      FROM sp_records sp
      LEFT JOIN staf_sekolah st1 ON sp.dibuat_oleh = st1.id
      LEFT JOIN staf_sekolah st2 ON sp.disetujui_oleh = st2.id
      WHERE sp.student_id = ?
      ORDER BY sp.created_at DESC
    `, [req.params.id]);

    res.render('pages/siswa_detail', {
      title: `Profil Siswa - ${siswa.nama}`,
      siswa, incidents, tugas, spRecords,
      formatTanggal, getBadgeWarna, getBadgeBobot
    });
  } catch (err) {
    console.error('Siswa detail error:', err);
    req.flash('error', 'Gagal memuat profil siswa.');
    res.redirect('/dashboard');
  }
});

module.exports = router;
