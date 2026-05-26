# SinergiCare v3.0
## Sistem Manajemen Kedisiplinan Siswa SMK

### Tech Stack
- **Backend**: Node.js + Express.js
- **Database**: MySQL 5.7+ / MariaDB
- **View Engine**: EJS
- **CSS**: Tailwind CSS (CDN)
- **Charts**: Chart.js (CDN)
- **Excel**: xlsx (npm)
- **Auth**: express-session + bcryptjs

---

### Setup & Instalasi

#### 1. Konfigurasi Database
Edit file `.env`:
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=sinergicare
SESSION_SECRET=your_secret_key
PORT=3000
```

#### 2. Install Dependencies
```bash
npm install
```

#### 3. Setup Database (Buat tabel + seed data)
```bash
npm run setup
```

#### 4. Jalankan Server
```bash
npm start
# atau untuk development:
npm run dev
```

Akses di: **http://localhost:3000**

---

### Akun Default

| Role | Username | Password |
|------|----------|----------|
| Super Admin | superadmin | admin123 |
| Admin | admin | admin123 |
| Guru BK | bk | bk123 |
| Guru | guru | guru123 |
| Waka Kesiswaan | waka | waka123 |
| Kepala Jurusan | kajur | kajur123 |

---

### Fitur Utama

#### 🎯 Radar Karakter (Zona Risiko)
- **Zona Hijau** (0–2 poin): Aman — Teguran lisan
- **Zona Kuning** (3–9 poin): Waspada — Intervensi BK
- **Zona Merah** (≥10 poin / ada pelanggaran Berat): Kritis — SP + Waka

#### 📋 Modul Sistem
1. **Dashboard** — Statistik zona, grafik donut, tren bulanan, log insiden
2. **Jurnal Insiden** — Pencatatan dengan AJAX search siswa, lock 30 menit
3. **Panel BK** — Intervensi siswa zona aktif, tugas konsekuensi, panggilan ortu
4. **Panel Waka** — Penerbitan & approval SP, manajemen probation
5. **Panel Kajur** — Matriks kelas, monitoring read-only
6. **Cetak Surat** — 5 jenis surat resmi (panggilan, izin, pernyataan, SP, riwayat)
7. **Admin** — CRUD siswa/staf/kelas/kategori, import/export Excel

#### 🔒 Keamanan
- Password hashing dengan bcrypt (cost factor 12)
- SQL Injection protection via parameterized queries (mysql2)
- XSS protection via EJS auto-escaping
- Role-based access control (RBAC) ketat
- File upload validation (5MB limit, .xlsx only)
- Session-based authentication

---

### Struktur Direktori
```
src/
├── config/db.js          # Database connection pool
├── core/
│   ├── auth.js           # Auth middleware & RBAC
│   └── functions.js      # hitungUlangRadarSiswa() & helpers
├── database/setup.js     # DB setup & seeder
├── modules/
│   ├── auth/             # Login/logout routes
│   ├── dashboard/        # Dashboard routes
│   ├── jurnal/           # Jurnal insiden + AJAX API
│   ├── bk/               # Panel BK routes
│   ├── waka/             # Panel Waka routes
│   ├── kajur/            # Panel Kajur routes
│   ├── admin/            # Admin CRUD + Excel import/export
│   ├── cetak/            # Generator surat routes
│   ├── siswa/            # Profil siswa routes
│   └── profile/          # Edit profil routes
├── views/
│   ├── layouts/          # header, footer, sidebar, topbar, flash
│   ├── pages/            # Semua halaman utama
│   └── prints/           # Template cetak surat
├── public/
│   └── uploads/          # Logo sekolah (logo.png)
└── server.js             # Entry point
```

### Import Excel
Format kolom template: `nisn | nama | nama_kelas | jenis_kelamin`
- NISN harus tepat 10 digit
- Kelas baru otomatis dibuat jika belum ada
- NISN duplikat otomatis dilewati (skip)
