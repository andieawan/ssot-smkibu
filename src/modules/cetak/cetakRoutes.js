'use strict';
const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { requireLogin } = require('../../core/auth');
const { formatTanggal, formatTanggalJam } = require('../../core/functions');
const path = require('path');
const fs = require('fs');

// GET /cetak - Pilih jenis surat
router.get('/', requireLogin, async (req, res) => {
  const [students] = await db.execute(`
    SELECT s.id, s.nisn, s.nama, c.nama_kelas FROM students s
    LEFT JOIN classes c ON s.class_id = c.id ORDER BY s.nama
  `);
  res.render('pages/cetak', { title: 'Generator Cetak Surat', students, formatTanggal });
});

// GET /cetak/panggilan/:id - Cetak surat panggilan orang tua
router.get('/panggilan/:id', requireLogin, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT po.*, s.nama as nama_siswa, s.nisn, c.nama_kelas,
             s.nama_ortu, s.no_hp_ortu, s.status_warna, s.total_poin,
             st.nama as dibuat_oleh_nama
      FROM panggilan_ortu po
      JOIN students s ON po.student_id = s.id
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN staf_sekolah st ON po.dibuat_oleh = st.id
      WHERE po.id = ?
    `, [req.params.id]);

    if (rows.length === 0) {
      req.flash('error', 'Data panggilan tidak ditemukan.');
      return res.redirect('/cetak');
    }

    const logoPath = path.join(__dirname, '../../public/uploads/logo.png');
    const hasLogo = fs.existsSync(logoPath);

    res.render('prints/panggilan_ortu', {
      title: 'Surat Panggilan Orang Tua',
      data: rows[0],
      hasLogo,
      formatTanggal,
      formatTanggalJam,
      today: formatTanggal(new Date())
    });
  } catch (err) {
    console.error('Cetak panggilan error:', err);
    req.flash('error', 'Gagal memuat surat panggilan.');
    res.redirect('/cetak');
  }
});

// GET /cetak/sp/:id - Cetak Surat Peringatan (harus sudah disetujui)
router.get('/sp/:id', requireLogin, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT sp.*, s.nama as nama_siswa, s.nisn, c.nama_kelas,
             s.nama_ortu, s.no_hp_ortu,
             st1.nama as dibuat_nama, st2.nama as disetujui_nama
      FROM sp_records sp
      JOIN students s ON sp.student_id = s.id
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN staf_sekolah st1 ON sp.dibuat_oleh = st1.id
      LEFT JOIN staf_sekolah st2 ON sp.disetujui_oleh = st2.id
      WHERE sp.id = ?
    `, [req.params.id]);

    if (rows.length === 0) {
      req.flash('error', 'SP tidak ditemukan.');
      return res.redirect('/cetak');
    }

    const sp = rows[0];
    if (sp.status_approval !== 'disetujui') {
      req.flash('error', 'SP belum disetujui. Tidak dapat dicetak.');
      return res.redirect('/waka');
    }

    const logoPath = path.join(__dirname, '../../public/uploads/logo.png');
    const hasLogo = fs.existsSync(logoPath);

    res.render('prints/surat_sp', {
      title: `Surat Peringatan ${sp.jenis_sp.toUpperCase()}`,
      data: sp, hasLogo, formatTanggal,
      today: formatTanggal(new Date())
    });
  } catch (err) {
    req.flash('error', 'Gagal memuat SP.');
    res.redirect('/cetak');
  }
});

// GET /cetak/riwayat/:studentId - Cetak riwayat pelanggaran
router.get('/riwayat/:studentId', requireLogin, async (req, res) => {
  try {
    const [siswaRows] = await db.execute(`
      SELECT s.*, c.nama_kelas FROM students s
      LEFT JOIN classes c ON s.class_id = c.id WHERE s.id = ?
    `, [req.params.studentId]);

    if (siswaRows.length === 0) {
      req.flash('error', 'Siswa tidak ditemukan.');
      return res.redirect('/cetak');
    }

    const siswa = siswaRows[0];

    const [incidents] = await db.execute(`
      SELECT i.*, vc.nama_kejadian, vc.bobot_risiko, st.nama as nama_pelapor
      FROM incidents i
      JOIN violation_categories vc ON i.category_id = vc.id
      LEFT JOIN staf_sekolah st ON i.user_id = st.id
      WHERE i.student_id = ?
      ORDER BY i.tanggal_kejadian DESC
    `, [req.params.studentId]);

    const [spRecords] = await db.execute(`
      SELECT sp.*, st.nama as disetujui_nama
      FROM sp_records sp
      LEFT JOIN staf_sekolah st ON sp.disetujui_oleh = st.id
      WHERE sp.student_id = ? ORDER BY sp.created_at DESC
    `, [req.params.studentId]);

    const logoPath = path.join(__dirname, '../../public/uploads/logo.png');
    const hasLogo = fs.existsSync(logoPath);

    res.render('prints/riwayat_pelanggaran', {
      title: `Riwayat Pelanggaran - ${siswa.nama}`,
      siswa, incidents, spRecords, hasLogo, formatTanggal,
      today: formatTanggal(new Date())
    });
  } catch (err) {
    req.flash('error', 'Gagal memuat riwayat.');
    res.redirect('/cetak');
  }
});

// GET /cetak/pernyataan/:studentId - Surat Pernyataan Kedisiplinan
router.get('/pernyataan/:studentId', requireLogin, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT s.*, c.nama_kelas FROM students s
      LEFT JOIN classes c ON s.class_id = c.id WHERE s.id = ?
    `, [req.params.studentId]);
    if (rows.length === 0) { req.flash('error', 'Siswa tidak ditemukan.'); return res.redirect('/cetak'); }
    const logoPath = path.join(__dirname, '../../public/uploads/logo.png');
    const hasLogo = fs.existsSync(logoPath);
    res.render('prints/surat_pernyataan', {
      title: 'Surat Pernyataan Kedisiplinan',
      siswa: rows[0], hasLogo, formatTanggal,
      today: formatTanggal(new Date())
    });
  } catch (err) {
    req.flash('error', 'Gagal memuat surat pernyataan.');
    res.redirect('/cetak');
  }
});

// GET /cetak/izin/:studentId - Surat Izin Meninggalkan Sekolah
router.get('/izin/buat', requireLogin, async (req, res) => {
  const [students] = await db.execute(`
    SELECT s.id, s.nisn, s.nama, c.nama_kelas FROM students s
    LEFT JOIN classes c ON s.class_id = c.id ORDER BY s.nama
  `);
  res.render('pages/cetak_izin_form', { title: 'Surat Izin Meninggalkan Sekolah', students, formatTanggal });
});

router.post('/izin/buat', requireLogin, async (req, res) => {
  const { student_id, alasan, tanggal_izin, jam_keluar, jam_kembali } = req.body;
  if (!student_id || !alasan || !tanggal_izin) {
    req.flash('error', 'Data tidak lengkap.');
    return res.redirect('/cetak/izin/buat');
  }
  try {
    const [result] = await db.execute(
      `INSERT INTO izin_meninggalkan (student_id, alasan, tanggal_izin, jam_keluar, jam_kembali, dibuat_oleh)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [student_id, alasan, tanggal_izin, jam_keluar || null, jam_kembali || null, req.session.user.id]
    );
    res.redirect(`/cetak/izin/${result.insertId}`);
  } catch (err) {
    req.flash('error', 'Gagal membuat surat izin.');
    res.redirect('/cetak/izin/buat');
  }
});

router.get('/izin/:id', requireLogin, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT im.*, s.nama as nama_siswa, s.nisn, c.nama_kelas,
             st.nama as dibuat_nama
      FROM izin_meninggalkan im
      JOIN students s ON im.student_id = s.id
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN staf_sekolah st ON im.dibuat_oleh = st.id
      WHERE im.id = ?
    `, [req.params.id]);
    if (rows.length === 0) { req.flash('error', 'Data izin tidak ditemukan.'); return res.redirect('/cetak'); }
    const logoPath = path.join(__dirname, '../../public/uploads/logo.png');
    const hasLogo = fs.existsSync(logoPath);
    res.render('prints/surat_izin', {
      title: 'Surat Izin Meninggalkan Sekolah',
      data: rows[0], hasLogo, formatTanggal,
      today: formatTanggal(new Date())
    });
  } catch (err) {
    req.flash('error', 'Gagal memuat surat izin.');
    res.redirect('/cetak');
  }
});

module.exports = router;
