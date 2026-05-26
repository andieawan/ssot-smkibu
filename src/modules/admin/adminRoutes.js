'use strict';
const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const bcrypt = require('bcryptjs');
const { requireRole } = require('../../core/auth');
const { hitungUlangRadarSiswa } = require('../../core/functions');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const adminAccess = requireRole('super_admin', 'admin');
const superAdminAccess = requireRole('super_admin');

// ─── GET /admin - Dashboard Admin ───────────────────────────────
router.get('/', adminAccess, async (req, res) => {
  try {
    const [[{ totalSiswa }]] = await db.execute(`SELECT COUNT(*) as totalSiswa FROM students`);
    const [[{ totalStaf }]] = await db.execute(`SELECT COUNT(*) as totalStaf FROM staf_sekolah`);
    const [[{ totalKelas }]] = await db.execute(`SELECT COUNT(*) as totalKelas FROM classes`);
    const [[{ totalKategori }]] = await db.execute(`SELECT COUNT(*) as totalKategori FROM violation_categories`);

    res.render('pages/admin', {
      title: 'Panel Administrasi',
      stats: { totalSiswa, totalStaf, totalKelas, totalKategori }
    });
  } catch (err) {
    req.flash('error', 'Gagal memuat panel admin.');
    res.redirect('/dashboard');
  }
});

// ═══════════════════════════════════════════════════════════════
// KELAS MANAGEMENT
// ═══════════════════════════════════════════════════════════════
router.get('/kelas', adminAccess, async (req, res) => {
  const [classes] = await db.execute(`
    SELECT c.*, COUNT(s.id) as jumlah_siswa
    FROM classes c LEFT JOIN students s ON s.class_id = c.id
    GROUP BY c.id ORDER BY c.nama_kelas
  `);
  res.render('pages/admin_kelas', { title: 'Manajemen Kelas', classes });
});

router.post('/kelas/tambah', adminAccess, async (req, res) => {
  const { nama_kelas } = req.body;
  if (!nama_kelas) { req.flash('error', 'Nama kelas wajib diisi.'); return res.redirect('/admin/kelas'); }
  try {
    await db.execute(`INSERT INTO classes (nama_kelas) VALUES (?)`, [nama_kelas.trim()]);
    req.flash('success', 'Kelas berhasil ditambahkan.');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') req.flash('error', 'Nama kelas sudah ada.');
    else req.flash('error', 'Gagal menambahkan kelas.');
  }
  res.redirect('/admin/kelas');
});

router.post('/kelas/edit/:id', adminAccess, async (req, res) => {
  const { nama_kelas } = req.body;
  try {
    await db.execute(`UPDATE classes SET nama_kelas=? WHERE id=?`, [nama_kelas.trim(), req.params.id]);
    req.flash('success', 'Kelas berhasil diperbarui.');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') req.flash('error', 'Nama kelas sudah ada.');
    else req.flash('error', 'Gagal memperbarui kelas.');
  }
  res.redirect('/admin/kelas');
});

router.post('/kelas/hapus/:id', adminAccess, async (req, res) => {
  try {
    await db.execute(`DELETE FROM classes WHERE id=?`, [req.params.id]);
    req.flash('success', 'Kelas berhasil dihapus.');
  } catch (err) {
    req.flash('error', 'Gagal menghapus kelas. Pastikan tidak ada siswa di kelas ini.');
  }
  res.redirect('/admin/kelas');
});

// ═══════════════════════════════════════════════════════════════
// KATEGORI PELANGGARAN
// ═══════════════════════════════════════════════════════════════
router.get('/kategori', adminAccess, async (req, res) => {
  const [categories] = await db.execute(`SELECT * FROM violation_categories ORDER BY bobot_risiko, nama_kejadian`);
  res.render('pages/admin_kategori', { title: 'Kategori Pelanggaran', categories });
});

router.post('/kategori/tambah', adminAccess, async (req, res) => {
  const { nama_kejadian, bobot_risiko, deskripsi } = req.body;
  if (!nama_kejadian || !bobot_risiko) { req.flash('error', 'Data tidak lengkap.'); return res.redirect('/admin/kategori'); }
  try {
    await db.execute(`INSERT INTO violation_categories (nama_kejadian, bobot_risiko, deskripsi) VALUES (?, ?, ?)`,
      [nama_kejadian.trim(), bobot_risiko, deskripsi || null]);
    req.flash('success', 'Kategori berhasil ditambahkan.');
  } catch (err) { req.flash('error', 'Gagal menambahkan kategori.'); }
  res.redirect('/admin/kategori');
});

router.post('/kategori/edit/:id', adminAccess, async (req, res) => {
  const { nama_kejadian, bobot_risiko, deskripsi } = req.body;
  try {
    await db.execute(`UPDATE violation_categories SET nama_kejadian=?, bobot_risiko=?, deskripsi=? WHERE id=?`,
      [nama_kejadian.trim(), bobot_risiko, deskripsi || null, req.params.id]);
    req.flash('success', 'Kategori berhasil diperbarui.');
  } catch (err) { req.flash('error', 'Gagal memperbarui kategori.'); }
  res.redirect('/admin/kategori');
});

router.post('/kategori/hapus/:id', adminAccess, async (req, res) => {
  try {
    await db.execute(`DELETE FROM violation_categories WHERE id=?`, [req.params.id]);
    req.flash('success', 'Kategori berhasil dihapus.');
  } catch (err) { req.flash('error', 'Gagal menghapus kategori.'); }
  res.redirect('/admin/kategori');
});

// ═══════════════════════════════════════════════════════════════
// MANAJEMEN STAF
// ═══════════════════════════════════════════════════════════════
router.get('/staf', adminAccess, async (req, res) => {
  const [stafList] = await db.execute(`SELECT id, nama, email, username, role, created_at FROM staf_sekolah ORDER BY nama`);
  res.render('pages/admin_staf', { title: 'Manajemen Staf', stafList });
});

router.post('/staf/tambah', adminAccess, async (req, res) => {
  const { nama, email, username, password, role } = req.body;
  // Cegah pembuatan super_admin dari UI
  if (role === 'super_admin') { req.flash('error', 'Tidak dapat membuat akun Super Admin dari UI.'); return res.redirect('/admin/staf'); }
  if (!nama || !username || !password || !role) { req.flash('error', 'Data tidak lengkap.'); return res.redirect('/admin/staf'); }
  try {
    const hashed = await bcrypt.hash(password, 12);
    await db.execute(`INSERT INTO staf_sekolah (nama, email, username, password, role) VALUES (?, ?, ?, ?, ?)`,
      [nama.trim(), email || null, username.trim(), hashed, role]);
    req.flash('success', 'Akun staf berhasil dibuat.');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') req.flash('error', 'Username atau email sudah digunakan.');
    else req.flash('error', 'Gagal membuat akun staf.');
  }
  res.redirect('/admin/staf');
});

router.post('/staf/edit/:id', adminAccess, async (req, res) => {
  const { nama, email, role, password } = req.body;
  if (role === 'super_admin') { req.flash('error', 'Tidak dapat mengubah role menjadi Super Admin.'); return res.redirect('/admin/staf'); }
  try {
    if (password && password.length >= 6) {
      const hashed = await bcrypt.hash(password, 12);
      await db.execute(`UPDATE staf_sekolah SET nama=?, email=?, role=?, password=? WHERE id=?`,
        [nama.trim(), email || null, role, hashed, req.params.id]);
    } else {
      await db.execute(`UPDATE staf_sekolah SET nama=?, email=?, role=? WHERE id=?`,
        [nama.trim(), email || null, role, req.params.id]);
    }
    req.flash('success', 'Data staf berhasil diperbarui.');
  } catch (err) { req.flash('error', 'Gagal memperbarui data staf.'); }
  res.redirect('/admin/staf');
});

router.post('/staf/hapus/:id', adminAccess, async (req, res) => {
  if (parseInt(req.params.id) === req.session.user.id) {
    req.flash('error', 'Tidak dapat menghapus akun sendiri.');
    return res.redirect('/admin/staf');
  }
  try {
    await db.execute(`DELETE FROM staf_sekolah WHERE id=?`, [req.params.id]);
    req.flash('success', 'Akun staf berhasil dihapus.');
  } catch (err) { req.flash('error', 'Gagal menghapus akun staf.'); }
  res.redirect('/admin/staf');
});

// ═══════════════════════════════════════════════════════════════
// MANAJEMEN SISWA
// ═══════════════════════════════════════════════════════════════
router.get('/siswa', adminAccess, async (req, res) => {
  const { search, kelas, page = 1 } = req.query;
  const limit = 20;
  const offset = (parseInt(page) - 1) * limit;
  let where = ['1=1'];
  let params = [];
  if (search) { where.push(`(s.nama LIKE ? OR s.nisn LIKE ?)`); params.push(`%${search}%`, `%${search}%`); }
  if (kelas) { where.push(`s.class_id = ?`); params.push(kelas); }
  const whereStr = where.join(' AND ');
  const [students] = await db.execute(`
    SELECT s.*, c.nama_kelas FROM students s
    LEFT JOIN classes c ON s.class_id = c.id
    WHERE ${whereStr} ORDER BY s.nama LIMIT ${limit} OFFSET ${offset}
  `, params);
  const [[{ total_count }]] = await db.execute(`SELECT COUNT(*) as total_count FROM students s WHERE ${whereStr}`, params);
  const [classes] = await db.execute(`SELECT * FROM classes ORDER BY nama_kelas`);
  const totalPages = Math.ceil(total_count / limit);
  res.render('pages/admin_siswa', {
    title: 'Manajemen Siswa', students, classes,
    search: search || '', kelas: kelas || '',
    page: parseInt(page), totalPages, total_count
  });
});

router.post('/siswa/tambah', adminAccess, async (req, res) => {
  const { nisn, nama, class_id, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp_ortu, nama_ortu } = req.body;
  if (!nisn || !nama || nisn.length !== 10) { req.flash('error', 'NISN harus tepat 10 digit dan nama wajib diisi.'); return res.redirect('/admin/siswa'); }
  try {
    await db.execute(
      `INSERT INTO students (nisn, nama, class_id, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp_ortu, nama_ortu)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nisn.trim(), nama.trim(), class_id || null, jenis_kelamin || 'L', tempat_lahir || null, tanggal_lahir || null, alamat || null, no_hp_ortu || null, nama_ortu || null]
    );
    req.flash('success', 'Siswa berhasil ditambahkan.');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') req.flash('error', 'NISN sudah terdaftar.');
    else req.flash('error', 'Gagal menambahkan siswa.');
  }
  res.redirect('/admin/siswa');
});

router.post('/siswa/hapus/:id', adminAccess, async (req, res) => {
  try {
    await db.execute(`DELETE FROM students WHERE id=?`, [req.params.id]);
    req.flash('success', 'Data siswa berhasil dihapus.');
  } catch (err) { req.flash('error', 'Gagal menghapus data siswa.'); }
  res.redirect('/admin/siswa');
});

// ═══════════════════════════════════════════════════════════════
// IMPORT EXCEL
// ═══════════════════════════════════════════════════════════════
router.post('/siswa/import', adminAccess, async (req, res) => {
  if (!req.files || !req.files.file_excel) {
    req.flash('error', 'File Excel tidak ditemukan.');
    return res.redirect('/admin/siswa');
  }
  const file = req.files.file_excel;

  // Validasi ukuran (5MB)
  if (file.size > 5 * 1024 * 1024) {
    req.flash('error', 'Ukuran file melebihi 5MB.');
    return res.redirect('/admin/siswa');
  }

  // Validasi ekstensi
  const ext = path.extname(file.name).toLowerCase();
  if (ext !== '.xlsx') {
    req.flash('error', 'Format file harus .xlsx');
    return res.redirect('/admin/siswa');
  }

  try {
    const workbook = XLSX.read(file.data, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    let imported = 0, skipped = 0, errors = 0;

    for (const row of rows) {
      const nisn = String(row['nisn'] || row['NISN'] || '').trim();
      const nama = String(row['nama'] || row['Nama'] || '').trim();
      const namaKelas = String(row['nama_kelas'] || row['Kelas'] || '').trim();
      const jk = String(row['jenis_kelamin'] || row['JK'] || 'L').trim().toUpperCase();

      if (!nisn || !nama || nisn.length !== 10) { errors++; continue; }

      // Auto-create kelas jika belum ada
      let classId = null;
      if (namaKelas) {
        const [existKelas] = await db.execute(`SELECT id FROM classes WHERE nama_kelas=?`, [namaKelas]);
        if (existKelas.length > 0) {
          classId = existKelas[0].id;
        } else {
          const [newKelas] = await db.execute(`INSERT INTO classes (nama_kelas) VALUES (?)`, [namaKelas]);
          classId = newKelas.insertId;
        }
      }

      try {
        await db.execute(
          `INSERT IGNORE INTO students (nisn, nama, class_id, jenis_kelamin) VALUES (?, ?, ?, ?)`,
          [nisn, nama, classId, ['L','P'].includes(jk) ? jk : 'L']
        );
        imported++;
      } catch (e) {
        skipped++;
      }
    }

    req.flash('success', `Import selesai: ${imported} berhasil, ${skipped} dilewati (duplikat), ${errors} error.`);
  } catch (err) {
    console.error('Import error:', err);
    req.flash('error', 'Gagal memproses file Excel.');
  }
  res.redirect('/admin/siswa');
});

// ═══════════════════════════════════════════════════════════════
// EXPORT EXCEL
// ═══════════════════════════════════════════════════════════════
router.get('/siswa/export', adminAccess, async (req, res) => {
  try {
    const [students] = await db.execute(`
      SELECT s.nisn, s.nama, c.nama_kelas, s.jenis_kelamin,
             s.status_warna, s.level_eskalasi, s.status_sp,
             s.is_probation, s.probation_end, s.total_poin,
             s.nama_ortu, s.no_hp_ortu
      FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      ORDER BY c.nama_kelas, s.nama
    `);

    const data = students.map(s => ({
      'NISN': s.nisn,
      'Nama Siswa': s.nama,
      'Kelas': s.nama_kelas || '-',
      'JK': s.jenis_kelamin,
      'Zona Radar': s.status_warna.toUpperCase(),
      'Level Eskalasi': s.level_eskalasi,
      'Status SP': s.status_sp,
      'Probation': s.is_probation ? 'Ya' : 'Tidak',
      'Probation Berakhir': s.probation_end || '-',
      'Total Poin': s.total_poin,
      'Nama Orang Tua': s.nama_ortu || '-',
      'No HP Ortu': s.no_hp_ortu || '-'
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Master Siswa');

    const tanggal = new Date().toISOString().slice(0, 10);
    const filename = `SinergiCare_MasterSiswa_${tanggal}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.send(buffer);
  } catch (err) {
    console.error('Export error:', err);
    req.flash('error', 'Gagal mengekspor data.');
    res.redirect('/admin/siswa');
  }
});

// ═══════════════════════════════════════════════════════════════
// RESET DATABASE (Super Admin Only)
// ═══════════════════════════════════════════════════════════════
router.post('/reset', superAdminAccess, async (req, res) => {
  const { konfirmasi } = req.body;
  if (konfirmasi !== 'RESET SINERGICARE') {
    req.flash('error', 'Konfirmasi tidak sesuai. Reset dibatalkan.');
    return res.redirect('/admin');
  }
  try {
    await db.execute(`SET FOREIGN_KEY_CHECKS = 0`);
    const tables = ['log_surat', 'panggilan_ortu', 'izin_meninggalkan', 'sp_records', 'consequences', 'incidents', 'students'];
    for (const t of tables) {
      await db.execute(`TRUNCATE TABLE ${t}`);
    }
    await db.execute(`SET FOREIGN_KEY_CHECKS = 1`);
    req.flash('success', 'Database berhasil direset. Semua data siswa dan insiden telah dihapus.');
    res.redirect('/admin');
  } catch (err) {
    console.error('Reset error:', err);
    req.flash('error', 'Gagal mereset database.');
    res.redirect('/admin');
  }
});

module.exports = router;
