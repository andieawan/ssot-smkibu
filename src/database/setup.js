'use strict';
/**
 * SinergiCare v3.0 - Database Setup & Seeder
 * Run: node src/database/setup.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function setup() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    charset: 'utf8mb4',
    multipleStatements: true
  });

  console.log('✅ Terhubung ke MySQL server');

  // Create database
  await conn.execute(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'sinergicare'}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.execute(`USE \`${process.env.DB_NAME || 'sinergicare'}\``);
  console.log('✅ Database dibuat/dipilih');

  // ============================================================
  // TABLE: classes
  // ============================================================
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS classes (
      id INT PRIMARY KEY AUTO_INCREMENT,
      nama_kelas VARCHAR(100) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ============================================================
  // TABLE: roles
  // ============================================================
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS roles (
      id INT PRIMARY KEY AUTO_INCREMENT,
      nama_role VARCHAR(50) NOT NULL UNIQUE,
      label VARCHAR(100) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ============================================================
  // TABLE: staf_sekolah
  // ============================================================
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS staf_sekolah (
      id INT PRIMARY KEY AUTO_INCREMENT,
      nama VARCHAR(150) NOT NULL,
      email VARCHAR(150) UNIQUE,
      username VARCHAR(100) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'guru',
      foto VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ============================================================
  // TABLE: students
  // ============================================================
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS students (
      id INT PRIMARY KEY AUTO_INCREMENT,
      nisn VARCHAR(20) NOT NULL UNIQUE,
      nama VARCHAR(150) NOT NULL,
      class_id INT,
      jenis_kelamin ENUM('L','P') DEFAULT 'L',
      tempat_lahir VARCHAR(100),
      tanggal_lahir DATE,
      alamat TEXT,
      no_hp_ortu VARCHAR(20),
      nama_ortu VARCHAR(150),
      status_warna ENUM('hijau','kuning','merah') DEFAULT 'hijau',
      level_eskalasi ENUM('teguran','konseling','skorsing_drop') DEFAULT 'teguran',
      status_sp ENUM('tidak_ada','sp_1','sp_2','sp_3') DEFAULT 'tidak_ada',
      is_probation TINYINT(1) DEFAULT 0,
      probation_end DATE DEFAULT NULL,
      total_poin INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ============================================================
  // TABLE: violation_categories
  // ============================================================
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS violation_categories (
      id INT PRIMARY KEY AUTO_INCREMENT,
      nama_kejadian VARCHAR(200) NOT NULL,
      bobot_risiko ENUM('Ringan','Sedang','Berat') NOT NULL DEFAULT 'Ringan',
      deskripsi TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ============================================================
  // TABLE: incidents
  // ============================================================
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS incidents (
      id INT PRIMARY KEY AUTO_INCREMENT,
      student_id INT NOT NULL,
      category_id INT NOT NULL,
      user_id INT,
      catatan TEXT,
      lokasi_kejadian VARCHAR(100),
      tanggal_kejadian DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES violation_categories(id),
      FOREIGN KEY (user_id) REFERENCES staf_sekolah(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ============================================================
  // TABLE: consequences (Tugas Pemulihan BK)
  // ============================================================
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS consequences (
      id INT PRIMARY KEY AUTO_INCREMENT,
      student_id INT NOT NULL,
      incident_id INT,
      deskripsi_tugas TEXT NOT NULL,
      penanggung_jawab INT,
      status_tugas ENUM('proses','selesai') DEFAULT 'proses',
      catatan_penyelesaian TEXT,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (penanggung_jawab) REFERENCES staf_sekolah(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES staf_sekolah(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ============================================================
  // TABLE: sp_records (Surat Peringatan)
  // ============================================================
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS sp_records (
      id INT PRIMARY KEY AUTO_INCREMENT,
      student_id INT NOT NULL,
      jenis_sp ENUM('sp_1','sp_2','sp_3') NOT NULL,
      alasan TEXT NOT NULL,
      status_approval ENUM('menunggu','disetujui','ditolak') DEFAULT 'menunggu',
      dibuat_oleh INT,
      disetujui_oleh INT,
      tanggal_dibuat DATE NOT NULL,
      tanggal_disetujui DATE,
      probation_end DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (dibuat_oleh) REFERENCES staf_sekolah(id) ON DELETE SET NULL,
      FOREIGN KEY (disetujui_oleh) REFERENCES staf_sekolah(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ============================================================
  // TABLE: log_surat (Arsip Cetak Surat)
  // ============================================================
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS log_surat (
      id INT PRIMARY KEY AUTO_INCREMENT,
      student_id INT NOT NULL,
      jenis_surat VARCHAR(100) NOT NULL,
      data_surat JSON,
      dicetak_oleh INT,
      tanggal_cetak TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (dicetak_oleh) REFERENCES staf_sekolah(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ============================================================
  // TABLE: panggilan_ortu
  // ============================================================
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS panggilan_ortu (
      id INT PRIMARY KEY AUTO_INCREMENT,
      student_id INT NOT NULL,
      tanggal_hadir DATE NOT NULL,
      jam_hadir TIME NOT NULL,
      keperluan TEXT,
      dibuat_oleh INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (dibuat_oleh) REFERENCES staf_sekolah(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ============================================================
  // TABLE: izin_meninggalkan
  // ============================================================
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS izin_meninggalkan (
      id INT PRIMARY KEY AUTO_INCREMENT,
      student_id INT NOT NULL,
      alasan TEXT NOT NULL,
      tanggal_izin DATE NOT NULL,
      jam_keluar TIME,
      jam_kembali TIME,
      dibuat_oleh INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (dibuat_oleh) REFERENCES staf_sekolah(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  console.log('✅ Semua tabel berhasil dibuat');

  // ============================================================
  // INDEXES
  // ============================================================
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_students_status_warna ON students(status_warna)`,
    `CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id)`,
    `CREATE INDEX IF NOT EXISTS idx_students_nisn ON students(nisn)`,
    `CREATE INDEX IF NOT EXISTS idx_incidents_student_id ON incidents(student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_incidents_tanggal ON incidents(tanggal_kejadian)`,
    `CREATE INDEX IF NOT EXISTS idx_incidents_user_id ON incidents(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_staf_username ON staf_sekolah(username)`,
    `CREATE INDEX IF NOT EXISTS idx_staf_role ON staf_sekolah(role)`,
    `CREATE INDEX IF NOT EXISTS idx_sp_student ON sp_records(student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sp_status ON sp_records(status_approval)`,
    `CREATE INDEX IF NOT EXISTS idx_consequences_student ON consequences(student_id)`,
  ];

  for (const idx of indexes) {
    try { await conn.execute(idx); } catch(e) { /* index may already exist */ }
  }
  console.log('✅ Index database berhasil dibuat');

  // ============================================================
  // SEED: Roles
  // ============================================================
  const rolesData = [
    ['super_admin', 'Super Administrator'],
    ['admin', 'Administrator'],
    ['bk', 'Guru BK'],
    ['guru', 'Guru'],
    ['waka_kesiswaan', 'Waka Kesiswaan'],
    ['kepala_jurusan', 'Kepala Jurusan']
  ];
  for (const [nama, label] of rolesData) {
    await conn.execute(
      `INSERT IGNORE INTO roles (nama_role, label) VALUES (?, ?)`,
      [nama, label]
    );
  }

  // ============================================================
  // SEED: Super Admin
  // ============================================================
  const hashedPassword = await bcrypt.hash('admin123', 12);
  await conn.execute(
    `INSERT IGNORE INTO staf_sekolah (nama, email, username, password, role) VALUES (?, ?, ?, ?, ?)`,
    ['Super Administrator', 'superadmin@sinergicare.sch.id', 'superadmin', hashedPassword, 'super_admin']
  );

  // SEED: Admin
  const adminPass = await bcrypt.hash('admin123', 12);
  await conn.execute(
    `INSERT IGNORE INTO staf_sekolah (nama, email, username, password, role) VALUES (?, ?, ?, ?, ?)`,
    ['Administrator', 'admin@sinergicare.sch.id', 'admin', adminPass, 'admin']
  );

  // SEED: BK
  const bkPass = await bcrypt.hash('bk123', 12);
  await conn.execute(
    `INSERT IGNORE INTO staf_sekolah (nama, email, username, password, role) VALUES (?, ?, ?, ?, ?)`,
    ['Guru BK Utama', 'bk@sinergicare.sch.id', 'bk', bkPass, 'bk']
  );

  // SEED: Guru
  const guruPass = await bcrypt.hash('guru123', 12);
  await conn.execute(
    `INSERT IGNORE INTO staf_sekolah (nama, email, username, password, role) VALUES (?, ?, ?, ?, ?)`,
    ['Budi Santoso', 'guru@sinergicare.sch.id', 'guru', guruPass, 'guru']
  );

  // SEED: Waka
  const wakaPass = await bcrypt.hash('waka123', 12);
  await conn.execute(
    `INSERT IGNORE INTO staf_sekolah (nama, email, username, password, role) VALUES (?, ?, ?, ?, ?)`,
    ['Waka Kesiswaan', 'waka@sinergicare.sch.id', 'waka', wakaPass, 'waka_kesiswaan']
  );

  // SEED: Kajur
  const kajurPass = await bcrypt.hash('kajur123', 12);
  await conn.execute(
    `INSERT IGNORE INTO staf_sekolah (nama, email, username, password, role) VALUES (?, ?, ?, ?, ?)`,
    ['Kepala Jurusan TKJ', 'kajur@sinergicare.sch.id', 'kajur', kajurPass, 'kepala_jurusan']
  );

  // ============================================================
  // SEED: Classes
  // ============================================================
  const classes = ['X TKJ 1', 'X TKJ 2', 'X RPL 1', 'XI TKJ 1', 'XI TKJ 2', 'XI RPL 1', 'XII TKJ 1', 'XII RPL 1'];
  for (const kelas of classes) {
    await conn.execute(`INSERT IGNORE INTO classes (nama_kelas) VALUES (?)`, [kelas]);
  }

  // ============================================================
  // SEED: Violation Categories
  // ============================================================
  const categories = [
    ['Terlambat masuk sekolah', 'Ringan'],
    ['Tidak memakai seragam lengkap', 'Ringan'],
    ['Tidak mengerjakan tugas', 'Ringan'],
    ['Membuang sampah sembarangan', 'Ringan'],
    ['Ribut di kelas', 'Ringan'],
    ['Bolos pelajaran', 'Sedang'],
    ['Merokok di lingkungan sekolah', 'Sedang'],
    ['Berkelahi dengan teman', 'Sedang'],
    ['Membawa HP saat ujian', 'Sedang'],
    ['Tidak hadir tanpa keterangan (Alpha)', 'Sedang'],
    ['Membawa senjata tajam', 'Berat'],
    ['Terlibat narkoba', 'Berat'],
    ['Tindakan kekerasan fisik serius', 'Berat'],
    ['Pencurian', 'Berat'],
    ['Perusakan fasilitas sekolah', 'Berat']
  ];
  for (const [nama, bobot] of categories) {
    await conn.execute(
      `INSERT IGNORE INTO violation_categories (nama_kejadian, bobot_risiko) VALUES (?, ?)`,
      [nama, bobot]
    );
  }

  // ============================================================
  // SEED: Sample Students
  // ============================================================
  const [classRows] = await conn.execute(`SELECT id FROM classes LIMIT 1`);
  if (classRows.length > 0) {
    const classId = classRows[0].id;
    const sampleStudents = [
      ['1234567890', 'Ahmad Fauzi', classId, 'L'],
      ['1234567891', 'Budi Prasetyo', classId, 'L'],
      ['1234567892', 'Citra Dewi', classId, 'P'],
      ['1234567893', 'Dian Permata', classId, 'P'],
      ['1234567894', 'Eko Saputra', classId, 'L'],
    ];
    for (const [nisn, nama, cid, jk] of sampleStudents) {
      await conn.execute(
        `INSERT IGNORE INTO students (nisn, nama, class_id, jenis_kelamin) VALUES (?, ?, ?, ?)`,
        [nisn, nama, cid, jk]
      );
    }
  }

  console.log('✅ Data seed berhasil dimasukkan');
  console.log('\n🎉 Setup SinergiCare v3.0 selesai!');
  console.log('📋 Akun default:');
  console.log('   Super Admin : superadmin / admin123');
  console.log('   Admin       : admin / admin123');
  console.log('   BK          : bk / bk123');
  console.log('   Guru        : guru / guru123');
  console.log('   Waka        : waka / waka123');
  console.log('   Kajur       : kajur / kajur123');

  await conn.end();
}

setup().catch(err => {
  console.error('❌ Setup gagal:', err.message);
  process.exit(1);
});
