/*
 * intents.js
 * ---------------------------------------------------------------------------
 * Mesin tanya-jawab BERBASIS ATURAN (rule-based). TIDAK ada AI/LLM, TIDAK ada
 * panggilan API eksternal. Setiap pertanyaan dicocokkan ke kamus kata kunci,
 * lalu dijawab dari data yang sudah diambil (DataStore) dengan perhitungan
 * langsung di JavaScript. Jawaban sengaja dibuat ringkas (1-3 baris).
 * ---------------------------------------------------------------------------
 */

const FALLBACK_ANSWER =
  'Maaf, saya belum bisa menjawab pertanyaan ini. Coba tanyakan soal penjualan, revenue, piutang, stok, delivery, atau kinerja tim.';

const BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function fmtRupiah(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}
function fmtNum(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return Number(n).toLocaleString('id-ID');
}
function fmtPercent(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return (n * 100).toFixed(1).replace('.', ',') + '%';
}
function fmtTanggal(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}
function pctChange(now, before) {
  if (!before) return null;
  return (now - before) / before;
}

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ------------------------------------------------------------------ */
/* Jawaban khusus per-anggota tim (dicek lebih dulu sebelum intent lain) */
/* ------------------------------------------------------------------ */

function findPersonInQuestion(text, team) {
  return team.find(p => new RegExp(`\\b${p.nama.toLowerCase()}\\b`, 'i').test(text));
}

function answerPerson(nama, data) {
  const p = data.personel.find(x => x.nama === nama);
  const kpi = data.kpiMonitoring.find(x => x.nama === nama);
  if (!p) return FALLBACK_ANSWER;

  let status = 'aktif bekerja di cabang';
  if (p.cutiAktif) status = `CUTI (${p.dinasLuarTujuan})`;
  else if (p.dinasLuarAktif) status = `DINAS LUAR (${p.dinasLuarTujuan})`;

  const line1 = kpi && kpi.skor !== null
    ? `${p.nama} (${p.divisi}): skor KPI ${fmtNum(kpi.skor)}, ranking ${kpi.ranking} dari ${data.kpiMonitoring.length}.`
    : `${p.nama} (${p.divisi}):`;
  const line2 = `Hadir ${fmtNum(p.kehadiranBulanIni)} hari, completion ${fmtNum(p.percent)}%, ${fmtNum(p.totalWorkHours)} jam kerja. Status: ${status}.`;
  return [line1, line2].join('\n');
}

/* ------------------------------------------------------------------ */
/* Kamus intent umum                                                   */
/* ------------------------------------------------------------------ */

const INTENTS = [
  {
    id: 'penjualan-bulan-ini',
    keywords: ['penjualan bulan ini', 'sales bulan ini', 'jumlah penjualan', 'penjualan bulanan', 'total penjualan', 'penjualan', 'sales'],
    handler(data) {
      const { bulanIni, bulanLalu, targetBulanIni } = data.penjualan;
      const chg = pctChange(bulanIni, bulanLalu);
      let line = `Penjualan bulan ini: ${fmtNum(bulanIni)} transaksi (${chg >= 0 ? 'naik' : 'turun'} ${fmtPercent(Math.abs(chg))} dari ${fmtNum(bulanLalu)} bulan lalu).`;
      if (targetBulanIni) line += ` Target: ${fmtPercent(bulanIni / targetBulanIni)}.`;
      return line;
    },
  },
  {
    id: 'revenue-bulan-ini',
    keywords: ['revenue bulan ini', 'pendapatan bulan ini', 'omzet bulan ini', 'omset bulan ini', 'total revenue', 'revenue', 'omzet', 'omset', 'pendapatan'],
    handler(data) {
      const { bulanIni, bulanLalu, targetBulanIni } = data.revenue;
      const chg = pctChange(bulanIni, bulanLalu);
      let line = `Revenue bulan ini: ${fmtRupiah(bulanIni)} (${chg >= 0 ? 'naik' : 'turun'} ${fmtPercent(Math.abs(chg))} dari ${fmtRupiah(bulanLalu)} bulan lalu).`;
      if (targetBulanIni) line += ` Target: ${fmtPercent(bulanIni / targetBulanIni)}.`;
      return line;
    },
  },
  {
    id: 'performa-harian',
    keywords: ['performa hari ini', 'penjualan hari ini', 'revenue hari ini', 'hasil hari ini', 'omzet hari ini', 'performa harian', 'harian'],
    handler(data) {
      const hariIni = data.performaHarian[data.performaHarian.length - 1];
      if (!hariIni) return 'Belum ada data performa harian.';
      return `Performa ${fmtTanggal(hariIni.tanggal)}: ${fmtNum(hariIni.sales)} transaksi, revenue ${fmtRupiah(hariIni.revenue)}.`;
    },
  },
  {
    id: 'rasio-sales-revenue',
    keywords: ['rasio sales', 'rasio penjualan', 'rasio revenue', 'perbandingan sales', 'sales revenue ratio', 'rata rata nilai penjualan', 'rasio'],
    handler(data) {
      const avgPerSale = data.revenue.bulanIni / data.penjualan.bulanIni;
      return `Rata-rata nilai per transaksi bulan ini: ${fmtRupiah(avgPerSale)} (dari ${fmtNum(data.penjualan.bulanIni)} transaksi, total revenue ${fmtRupiah(data.revenue.bulanIni)}).`;
    },
  },
  {
    id: 'top-performer',
    keywords: ['top performer', 'performa terbaik', 'ranking tertinggi', 'siapa yang terbaik', 'juara', 'kpi tertinggi', 'terbaik'],
    handler(data) {
      const sorted = [...data.kpiMonitoring].sort((a, b) => a.ranking - b.ranking);
      const top3 = sorted.slice(0, 3).map(p => `${p.ranking}. ${p.nama} (${fmtNum(p.skor)})`).join(', ');
      return `Top performer bulan ini: ${top3}.`;
    },
  },
  {
    id: 'kpi-tim-rekap',
    keywords: ['kinerja tim', 'rekap kpi', 'rekap kinerja', 'kpi tim', 'performa tim', 'kinerja semua', 'ranking kpi', 'ranking tim'],
    handler(data) {
      const sorted = [...data.kpiMonitoring].sort((a, b) => a.ranking - b.ranking);
      const list = sorted.map(p => `${p.ranking}. ${p.nama} (${fmtNum(p.skor)})`).join(', ');
      return `Ranking KPI tim (${data.kpiMonitoring.length} orang): ${list}.`;
    },
  },
  {
    id: 'piutang',
    keywords: ['piutang', 'account receivable', 'belum lunas', 'tagihan', ' ar '],
    handler(data) {
      const total = data.piutang.reduce((s, p) => s + p.nilai, 0);
      const top3 = data.piutang.slice(0, 3).map(p => `${p.customer} ${fmtRupiah(p.nilai)}`).join(', ');
      return `Total piutang belum lunas: ${fmtRupiah(total)} dari ${data.piutang.length} customer. Terbesar: ${top3}.`;
    },
  },
  {
    id: 'stok-gudang',
    keywords: ['stok gudang', 'stock gudang', 'persediaan', 'sisa stok', 'stok barang', 'stok'],
    handler(data) {
      const top3 = data.stokGudang.slice(0, 3).map(s => `${s.item} (${fmtNum(s.jumlah)})`).join(', ');
      return `Stok gudang terbanyak: ${top3}.`;
    },
  },
  {
    id: 'po-gudang',
    keywords: ['po gudang', 'purchase order', 'status po', 'pesanan gudang'],
    handler(data) {
      const top3 = data.poGudang.slice(0, 3).map(p => `${p.noPO} (${p.status})`).join(', ');
      return `PO gudang terbaru: ${top3}.`;
    },
  },
  {
    id: 'turnover-gudang',
    keywords: ['turnover gudang', 'perputaran gudang', 'tingkat perputaran', 'turnover'],
    handler(data) {
      const t = data.turnoverGudang;
      const top3 = t.topItems.slice(0, 3).map(i => `${i.item} (${fmtNum(i.turnover)})`).join(', ');
      return `Total turnover gudang: ${fmtNum(t.totalTurnover)} unit. Tertinggi: ${top3}.`;
    },
  },
  {
    id: 'delivery',
    keywords: ['delivery', 'pengiriman', 'kirim barang', 'status pengiriman', 'ekspedisi'],
    handler(data) {
      const selesai = data.delivery.filter(d => d.status === 'Selesai').length;
      const terakhir = data.delivery[0];
      const info = terakhir ? ` Terakhir: ${fmtTanggal(terakhir.tanggal)} ke ${terakhir.tujuan} (${fmtNum(terakhir.jumlah)} unit).` : '';
      return `Status delivery: ${selesai}/${data.delivery.length} selesai.${info}`;
    },
  },
  {
    id: 'wilayah',
    keywords: ['wilayah', 'per wilayah', 'daerah penjualan', 'area penjualan', 'daerah'],
    handler(data) {
      const sorted = [...data.wilayah].sort((a, b) => b.revenue - a.revenue);
      const top3 = sorted.slice(0, 3).map(w => `${w.nama} (${fmtRupiah(w.revenue)})`).join(', ');
      return `Top wilayah dari ${sorted.length}: ${top3}.`;
    },
  },
  {
    id: 'frekuensi-customer',
    keywords: ['frekuensi customer', 'pelanggan sering', 'customer paling sering', 'frekuensi pelanggan', 'pelanggan', 'customer'],
    handler(data) {
      const sorted = [...data.frekuensiCustomer].sort((a, b) => b.jumlahTransaksi - a.jumlahTransaksi);
      const top3 = sorted.slice(0, 3).map(c => `${c.customer} (${fmtNum(c.jumlahTransaksi)}x)`).join(', ');
      return `Customer paling sering bertransaksi: ${top3}.`;
    },
  },
  {
    id: 'fiber-optic',
    keywords: ['fiber optic', '1 core', '1-core', 'kabel fiber', 'fo 1 core', 'kabel fo'],
    handler(data) {
      const f = data.fiberOptic1Core;
      if (!f || !f.deskripsi) return 'Data fiber optic 1-core tidak ditemukan.';
      return `${f.deskripsi}: terjual ${fmtNum(f.totalTerjual)} (revenue ${fmtRupiah(f.totalRevenue)}), stok ${f.stokTersedia === null ? '-' : fmtNum(f.stokTersedia)}.`;
    },
  },
  {
    id: 'cuti',
    keywords: ['siapa yang cuti', 'sedang cuti', 'cuti hari ini', 'yang cuti', 'daftar cuti', 'cuti'],
    handler(data) {
      const cuti = data.personel.filter(p => p.cutiAktif);
      if (cuti.length === 0) return 'Tidak ada anggota tim yang sedang cuti saat ini.';
      return `Sedang cuti: ${cuti.map(p => p.nama).join(', ')}.`;
    },
  },
  {
    id: 'dinas-luar',
    keywords: ['dinas luar', 'sedang dinas', 'tugas luar', 'perjalanan dinas', 'dinas'],
    handler(data) {
      const dinas = data.personel.filter(p => p.dinasLuarAktif);
      if (dinas.length === 0) return 'Tidak ada anggota tim yang sedang dinas luar saat ini.';
      return `Sedang dinas luar: ${dinas.map(p => `${p.nama} (${p.dinasLuarTujuan})`).join(', ')}.`;
    },
  },
  {
    id: 'kehadiran',
    keywords: ['kehadiran', 'absensi', 'tingkat kehadiran', 'hadir berapa', 'hadir', 'absen'],
    handler(data) {
      const list = data.personel.map(p => `${p.nama} ${fmtNum(p.kehadiranBulanIni)}hr`).join(', ');
      return `Kehadiran tim bulan ini: ${list}.`;
    },
  },
];

/**
 * Cocokkan pertanyaan dengan intent yang paling sesuai lalu jalankan handler-nya.
 * Mengembalikan string jawaban (Bahasa Indonesia), atau FALLBACK_ANSWER bila
 * tidak ada intent yang cocok. Murni rule-based, tanpa AI/LLM/API eksternal.
 */
function answerQuestion(question, data) {
  if (!data || data.status !== 'ready') {
    return 'Data belum siap. Coba tekan tombol "Refresh Data" terlebih dahulu.';
  }

  const text = normalize(question);

  const person = findPersonInQuestion(text, data.personel);
  if (person) return answerPerson(person.nama, data);

  let best = null;
  let bestScore = 0;
  for (const intent of INTENTS) {
    const score = intent.keywords.reduce((s, kw) => s + (text.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = intent;
    }
  }

  if (best && bestScore > 0) return best.handler(data);
  return FALLBACK_ANSWER;
}
