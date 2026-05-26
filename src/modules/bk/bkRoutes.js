'use strict';
const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireRole } = require('../../core/auth');

const bkAccess = requireRole('super_admin', 'admin', 'bk');

// GET /bk - Panel BK
router.get('/', bkAccess, async (req, res) => {
  try {
    const { search, zona, page = 1 } = req.query;
    const limit = 15;
    const offset = (parseInt(page) - 1) * limit;

    let where = [`s.status_warna IN ('kuning','merah')`];
    let params = [];

    if (search) {
      where.push(`(s.nama LIKE ? OR s.nisn LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }
    if (zona && ['kuning', 'merah'].includes(zona)) {
      where.push(`s.status_warna = ?`);
      params.push(zona);
    }

    const whereStr = where.join(' AND ');

    const [students] = await db.execute(`
      SELECT s.*, c.nama_kelas,
             COUNT(DISTINCT i.id) as total_insiden,
             COUNT(DISTINCT con.id) as total_tugas,
             COUNT(DISTINCT CASE WHEN con.status_tugas='proses' THEN con.id END) as tugas_proses
      FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN incidents i ON i.student_id = s.id
      LEFT JOIN consequences con ON con.student_id = s.id
      WHERE ${whereStr}
      GROUP BY s.id
      ORDER BY FIELD(s.status_warna,'merah','kuning'), s.total_poin DESC
      LIMIT ${limit} OFFSET ${offset}
    `, params);

    const [[{ total_count }]] = await db.execute(`
      SELECT COUNT(*) as total_count FROM students s WHERE ${whereStr}
    `, params);

    // Tugas konsekuensi aktif
    const [tugasAktif] = await db.execute(`
      SELECT con.*, s.nama as nama_siswa, s.nisn, c.nama_kelas,
             st.nama as nama_pendamping
      FROM consequences con
      JOIN students s ON con.student_id = s.id
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN staf_sekolah st ON con.penanggung_jawab = st.id
      WHERE con.status_tugas = 'proses'
      ORDER BY con.created_at DESC
      LIMIT 20
    `);

    // Daftar guru untuk dropdown pendamping
    const [guruList] = await db.execute(`
      SELECT id, nama, role FROM staf_sekolah ORDER BY nama
    `);

    const totalPages = Math.ceil(total_count / limit);

    res.render('pages/bk', {
      title: 'Panel BK - Intervensi Siswa',
      students, tugasAktif, guruList,
      search: search || '', zona: zona || '',
      page: parseInt(page), totalPages, total_count
    });
  } catch (err) {
    console.error('BK error:', err);
    req.flash('error', 'Gagal memuat panel BK.');
    res.redirect('/dashboard');
  }
});

// POST /bk/tugas - Tambah tugas konsekuensi
router.post('/tugas', bkAccess, async (req, res) => {
  const { student_id, deskripsi_tugas, penanggung_jawab } = req.body;
  if (!student_id || !deskripsi_tugas) {
    req.flash('error', 'Data tugas tidak lengkap.');
    return res.redirect('/bk');
  }
  try {
    await db.execute(
      `INSERT INTO consequences (student_id, deskripsi_tugas, penanggung_jawab, created_by)
       VALUES (?, ?, ?, ?)`,
      [student_id, deskripsi_tugas, penanggung_jawab || null, req.session.user.id]
    );
    req.flash('success', 'Tugas konsekuensi berhasil ditambahkan.');
    res.redirect('/bk');
  } catch (err) {
    console.error('Tambah tugas error:', err);
    req.flash('error', 'Gagal menambahkan tugas.');
    res.redirect('/bk');
  }
});

// POST /bk/tugas/:id/selesai - Tandai tugas selesai
router.post('/tugas/:id/selesai', bkAccess, async (req, res) => {
  const { catatan_penyelesaian } = req.body;
  try {
    await db.execute(
      `UPDATE consequences SET status_tugas='selesai', catatan_penyelesaian=? WHERE id=?`,
      [catatan_penyelesaian || null, req.params.id]
    );
    req.flash('success', 'Tugas ditandai selesai.');
    res.redirect('/bk');
  } catch (err) {
    req.flash('error', 'Gagal memperbarui status tugas.');
    res.redirect('/bk');
  }
});

// POST /bk/panggilan - Buat surat panggilan orang tua
router.post('/panggilan', bkAccess, async (req, res) => {
  const { student_id, tanggal_hadir, jam_hadir, keperluan } = req.body;
  if (!student_id || !tanggal_hadir || !jam_hadir) {
    req.flash('error', 'Data panggilan tidak lengkap.');
    return res.redirect('/bk');
  }
  try {
    const [result] = await db.execute(
      `INSERT INTO panggilan_ortu (student_id, tanggal_hadir, jam_hadir, keperluan, dibuat_oleh)
       VALUES (?, ?, ?, ?, ?)`,
      [student_id, tanggal_hadir, jam_hadir, keperluan || null, req.session.user.id]
    );
    // Log surat
    await db.execute(
      `INSERT INTO log_surat (student_id, jenis_surat, data_surat, dicetak_oleh)
       VALUES (?, 'panggilan_ortu', ?, ?)`,
      [student_id, JSON.stringify({ panggilan_id: result.insertId, tanggal_hadir, jam_hadir }), req.session.user.id]
    );
    req.flash('success', 'Surat panggilan berhasil dibuat. Silakan cetak dari menu Cetak Surat.');
    res.redirect(`/cetak/panggilan/${result.insertId}`);
  } catch (err) {
    console.error('Panggilan error:', err);
    req.flash('error', 'Gagal membuat surat panggilan.');
    res.redirect('/bk');
  }
});

// GET /bk/siswa/:id - Detail siswa
router.get('/siswa/:id', bkAccess, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT s.*, c.nama_kelas FROM students s
       LEFT JOIN classes c ON s.class_id = c.id WHERE s.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) {
      req.flash('error', 'Siswa tidak ditemukan.');
      return res.redirect('/bk');
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

    const [guruList] = await db.execute(`SELECT id, nama FROM staf_sekolah ORDER BY nama`);

    res.render('pages/bk_detail', {
      title: `Detail Siswa - ${siswa.nama}`,
      siswa, incidents, tugas, spRecords, guruList
    });
  } catch (err) {
    console.error('BK detail error:', err);
    req.flash('error', 'Gagal memuat detail siswa.');
    res.redirect('/bk');
  }
});

module.exports = router;
