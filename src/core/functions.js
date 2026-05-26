'use strict';
const db = require('../config/db');

/**
 * Bobot poin pelanggaran
 */
const BOBOT_POIN = {
  'Ringan': 1,
  'Sedang': 3,
  'Berat': 10
};

/**
 * Hitung ulang radar siswa berdasarkan semua insiden aktif
 * Aturan:
 * - Ringan: 1 poin, Sedang: 3 poin, Berat: 10 poin
 * - Jika ada minimal 1 pelanggaran Berat → langsung Zona Merah
 * - 0-2 poin → Hijau, 3-9 poin → Kuning, >=10 poin → Merah
 */
async function hitungUlangRadarSiswa(studentId) {
  const conn = await db.getConnection();
  try {
    // Ambil semua insiden aktif beserta bobot kategori
    const [incidents] = await conn.execute(
      `SELECT vc.bobot_risiko 
       FROM incidents i
       JOIN violation_categories vc ON i.category_id = vc.id
       WHERE i.student_id = ?`,
      [studentId]
    );

    let totalPoin = 0;
    let adaBerat = false;

    for (const inc of incidents) {
      const bobot = inc.bobot_risiko;
      totalPoin += (BOBOT_POIN[bobot] || 0);
      if (bobot === 'Berat') adaBerat = true;
    }

    let statusWarna;
    if (adaBerat || totalPoin >= 10) {
      statusWarna = 'merah';
    } else if (totalPoin >= 3) {
      statusWarna = 'kuning';
    } else {
      statusWarna = 'hijau';
    }

    // Tentukan level eskalasi
    let levelEskalasi = 'teguran';
    if (statusWarna === 'kuning') levelEskalasi = 'konseling';
    if (statusWarna === 'merah') levelEskalasi = 'skorsing_drop';

    // Update student record
    await conn.execute(
      `UPDATE students SET status_warna = ?, level_eskalasi = ?, total_poin = ? WHERE id = ?`,
      [statusWarna, levelEskalasi, totalPoin, studentId]
    );

    return { statusWarna, levelEskalasi, totalPoin };
  } finally {
    conn.release();
  }
}

/**
 * Format tanggal ke format Indonesia
 */
function formatTanggal(date) {
  if (!date) return '-';
  const d = new Date(date);
  const bulan = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  return `${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Format tanggal + jam
 */
function formatTanggalJam(date) {
  if (!date) return '-';
  const d = new Date(date);
  const tgl = formatTanggal(d);
  const jam = d.toTimeString().slice(0, 5);
  return `${tgl}, ${jam} WIB`;
}

/**
 * Get badge warna zona
 */
function getBadgeWarna(warna) {
  const badges = {
    'hijau': { class: 'bg-green-100 text-green-800 border border-green-300', label: 'Zona Hijau' },
    'kuning': { class: 'bg-yellow-100 text-yellow-800 border border-yellow-300', label: 'Zona Kuning' },
    'merah': { class: 'bg-red-100 text-red-800 border border-red-300', label: 'Zona Merah' }
  };
  return badges[warna] || badges['hijau'];
}

/**
 * Get label bobot risiko dengan warna
 */
function getBadgeBobot(bobot) {
  const badges = {
    'Ringan': { class: 'bg-blue-100 text-blue-700 border border-blue-300', poin: '1 poin' },
    'Sedang': { class: 'bg-orange-100 text-orange-700 border border-orange-300', poin: '3 poin' },
    'Berat': { class: 'bg-red-100 text-red-700 border border-red-300', poin: '10 poin' }
  };
  return badges[bobot] || badges['Ringan'];
}

/**
 * Escape HTML untuk XSS protection
 */
function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Hitung probation end date (30 hari dari sekarang)
 */
function hitungProbationEnd() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

/**
 * Cek apakah probation masih aktif
 */
function isProbationAktif(probationEnd) {
  if (!probationEnd) return false;
  return new Date(probationEnd) >= new Date();
}

module.exports = {
  hitungUlangRadarSiswa,
  formatTanggal,
  formatTanggalJam,
  getBadgeWarna,
  getBadgeBobot,
  escHtml,
  hitungProbationEnd,
  isProbationAktif,
  BOBOT_POIN
};
