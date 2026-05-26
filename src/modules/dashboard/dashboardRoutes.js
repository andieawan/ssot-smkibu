'use strict';
const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireLogin } = require('../../core/auth');

router.get('/', requireLogin, async (req, res) => {
  try {
    const user = req.session.user;

    // Hitung distribusi zona radar
    const [zonaStats] = await db.execute(`
      SELECT status_warna, COUNT(*) as jumlah FROM students GROUP BY status_warna
    `);
    const zona = { hijau: 0, kuning: 0, merah: 0 };
    for (const row of zonaStats) zona[row.status_warna] = row.jumlah;

    // Total siswa
    const [[{ total }]] = await db.execute(`SELECT COUNT(*) as total FROM students`);

    // Top 3 kelas rawan kasus
    const [topKelas] = await db.execute(`
      SELECT c.nama_kelas, 
             COUNT(CASE WHEN s.status_warna='merah' THEN 1 END) as merah,
             COUNT(CASE WHEN s.status_warna='kuning' THEN 1 END) as kuning,
             COUNT(i.id) as total_insiden
      FROM classes c
      LEFT JOIN students s ON s.class_id = c.id
      LEFT JOIN incidents i ON i.student_id = s.id
      GROUP BY c.id, c.nama_kelas
      ORDER BY merah DESC, total_insiden DESC
      LIMIT 3
    `);

    // Tren pelanggaran 6 bulan terakhir
    const [trenBulanan] = await db.execute(`
      SELECT DATE_FORMAT(tanggal_kejadian, '%Y-%m') as bulan,
             COUNT(*) as jumlah
      FROM incidents
      WHERE tanggal_kejadian >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
      GROUP BY bulan
      ORDER BY bulan ASC
    `);

    // Log insiden hari ini
    let insidenQuery;
    let insidenParams = [];
    if (['super_admin', 'admin', 'bk'].includes(user.role)) {
      insidenQuery = `
        SELECT i.*, s.nama as nama_siswa, s.nisn, c.nama_kelas,
               vc.nama_kejadian, vc.bobot_risiko, st.nama as nama_pelapor
        FROM incidents i
        JOIN students s ON i.student_id = s.id
        LEFT JOIN classes c ON s.class_id = c.id
        JOIN violation_categories vc ON i.category_id = vc.id
        LEFT JOIN staf_sekolah st ON i.user_id = st.id
        WHERE DATE(i.tanggal_kejadian) = CURDATE()
        ORDER BY i.created_at DESC
        LIMIT 50
      `;
    } else {
      insidenQuery = `
        SELECT i.*, s.nama as nama_siswa, s.nisn, c.nama_kelas,
               vc.nama_kejadian, vc.bobot_risiko, st.nama as nama_pelapor
        FROM incidents i
        JOIN students s ON i.student_id = s.id
        LEFT JOIN classes c ON s.class_id = c.id
        JOIN violation_categories vc ON i.category_id = vc.id
        LEFT JOIN staf_sekolah st ON i.user_id = st.id
        WHERE i.user_id = ?
        ORDER BY i.created_at DESC
        LIMIT 15
      `;
      insidenParams = [user.id];
    }
    const [insidenHariIni] = await db.execute(insidenQuery, insidenParams);

    // Siswa probation aktif
    const [probationSiswa] = await db.execute(`
      SELECT s.*, c.nama_kelas FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      WHERE s.is_probation = 1 AND s.probation_end >= CURDATE()
      ORDER BY s.probation_end ASC
      LIMIT 5
    `);

    res.render('pages/dashboard', {
      title: 'Dashboard - SinergiCare v3.0',
      zona, total, topKelas, trenBulanan, insidenHariIni, probationSiswa
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    req.flash('error', 'Gagal memuat dashboard.');
    res.render('pages/dashboard', {
      title: 'Dashboard',
      zona: { hijau: 0, kuning: 0, merah: 0 },
      total: 0, topKelas: [], trenBulanan: [], insidenHariIni: [], probationSiswa: []
    });
  }
});

module.exports = router;
