'use strict';
const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireRole } = require('../../core/auth');

const kajurAccess = requireRole('super_admin', 'admin', 'kepala_jurusan');

// GET /kajur - Panel Ketua Jurusan
router.get('/', kajurAccess, async (req, res) => {
  try {
    // Matriks kelas
    const [matriksKelas] = await db.execute(`
      SELECT c.id, c.nama_kelas,
             COUNT(s.id) as total_siswa,
             COUNT(CASE WHEN s.status_warna='hijau' THEN 1 END) as zona_hijau,
             COUNT(CASE WHEN s.status_warna='kuning' THEN 1 END) as zona_kuning,
             COUNT(CASE WHEN s.status_warna='merah' THEN 1 END) as zona_merah,
             COUNT(DISTINCT i.id) as total_insiden
      FROM classes c
      LEFT JOIN students s ON s.class_id = c.id
      LEFT JOIN incidents i ON i.student_id = s.id
      GROUP BY c.id, c.nama_kelas
      ORDER BY zona_merah DESC, zona_kuning DESC, c.nama_kelas ASC
    `);

    // Siswa berisiko tinggi (read-only)
    const [siswaBerisiko] = await db.execute(`
      SELECT s.*, c.nama_kelas,
             COUNT(i.id) as total_insiden
      FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN incidents i ON i.student_id = s.id
      WHERE s.status_warna IN ('kuning','merah')
      GROUP BY s.id
      ORDER BY FIELD(s.status_warna,'merah','kuning'), s.total_poin DESC
      LIMIT 30
    `);

    // Statistik ringkasan
    const [[stats]] = await db.execute(`
      SELECT 
        COUNT(*) as total_siswa,
        COUNT(CASE WHEN status_warna='hijau' THEN 1 END) as hijau,
        COUNT(CASE WHEN status_warna='kuning' THEN 1 END) as kuning,
        COUNT(CASE WHEN status_warna='merah' THEN 1 END) as merah,
        COUNT(CASE WHEN is_probation=1 THEN 1 END) as probation
      FROM students
    `);

    res.render('pages/kajur', {
      title: 'Panel Ketua Jurusan',
      matriksKelas, siswaBerisiko, stats
    });
  } catch (err) {
    console.error('Kajur error:', err);
    req.flash('error', 'Gagal memuat panel Kajur.');
    res.redirect('/dashboard');
  }
});

module.exports = router;
