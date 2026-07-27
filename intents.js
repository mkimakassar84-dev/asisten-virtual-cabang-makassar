/*
 * intents.js
 * ---------------------------------------------------------------------------
 * Mesin tanya-jawab BERBASIS ATURAN (rule-based). TIDAK ada AI/LLM, TIDAK ada
 * panggilan API eksternal. Setiap pertanyaan dicocokkan ke kamus kata kunci,
 * lalu dijawab dari data yang sudah diambil (DataStore) dengan perhitungan
 * langsung di JavaScript.
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

function containsAny(text, phrases) {
  return phrases.some(p => text.includes(p));
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

  const lines = [];
  lines.push(`Data ${p.nama} (${p.divisi}) bulan ini:`);
  if (kpi) lines.push(`- Skor KPI: ${fmtNum(kpi.skor)} (ranking ${kpi.ranking} dari ${data.kpiMonitoring.length})`);
  lines.push(`- Kehadiran: ${fmtNum(p.kehadiranBulanIni)} hari`);
  lines.push(`- Terlambat: ${fmtNum(p.terlambat)} kali, Izin: ${fmtNum(p.izin)}, Sakit: ${fmtNum(p.sakit)}, Alpha: ${fmtNum(p.alpha)}`);
  if (p.cutiAktif) lines.push(`- Status: sedang CUTI`);
  else if (p.dinasLuarAktif) lines.push(`- Status: sedang DINAS LUAR ke ${p.dinasLuarTujuan}`);
  else lines.push(`- Status: aktif bekerja di cabang`);
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Kamus intent umum                                                   */
/* ------------------------------------------------------------------ */

const INTENTS = [
  {
    id: 'penjualan-bulan-ini',
    keywords: ['penjualan bulan ini', 'sales bulan ini', 'jumlah penjualan', 'penjualan bulanan', 'total penjualan'],
    handler(data) {
      const { bulanIni, bulanLalu, targetBulanIni } = data.penjualan;
      const chg = pctChange(bulanIni, bulanLalu);
      const lines = [
        `Penjualan bulan ini: ${fmtNum(bulanIni)} transaksi.`,
        `Bulan lalu: ${fmtNum(bulanLalu)} transaksi (${chg >= 0 ? 'naik' : 'turun'} ${fmtPercent(Math.abs(chg))}).`,
      ];
      if (targetBulanIni) lines.push(`Pencapaian target: ${fmtPercent(bulanIni / targetBulanIni)} dari target ${fmtNum(targetBulanIni)} transaksi.`);
      return lines.join('\n');
    },
  },
  {
    id: 'revenue-bulan-ini',
    keywords: ['revenue bulan ini', 'pendapatan bulan ini', 'omzet bulan ini', 'omset bulan ini', 'total revenue'],
    handler(data) {
      const { bulanIni, bulanLalu, targetBulanIni } = data.revenue;
      const chg = pctChange(bulanIni, bulanLalu);
      const lines = [
        `Revenue bulan ini: ${fmtRupiah(bulanIni)}.`,
        `Bulan lalu: ${fmtRupiah(bulanLalu)} (${chg >= 0 ? 'naik' : 'turun'} ${fmtPercent(Math.abs(chg))}).`,
      ];
      if (targetBulanIni) lines.push(`Pencapaian target: ${fmtPercent(bulanIni / targetBulanIni)} dari target ${fmtRupiah(targetBulanIni)}.`);
      return lines.join('\n');
    },
  },
  {
    id: 'performa-harian',
    keywords: ['performa hari ini', 'penjualan hari ini', 'revenue hari ini', 'hasil hari ini', 'omzet hari ini', 'performa harian'],
    handler(data) {
      const hariIni = data.performaHarian[data.performaHarian.length - 1];
      if (!hariIni) return 'Belum ada data performa harian.';
      return [
        `Performa terakhir (${fmtTanggal(hariIni.tanggal)}):`,
        `- Penjualan: ${fmtNum(hariIni.sales)} transaksi`,
        `- Revenue: ${fmtRupiah(hariIni.revenue)}`,
      ].join('\n');
    },
  },
  {
    id: 'rasio-sales-revenue',
    keywords: ['rasio sales', 'rasio penjualan', 'rasio revenue', 'perbandingan sales', 'sales revenue ratio', 'rata rata nilai penjualan'],
    handler(data) {
      const avgPerSale = data.revenue.bulanIni / data.penjualan.bulanIni;
      return [
        `Rasio sales terhadap revenue bulan ini:`,
        `- Total penjualan: ${fmtNum(data.penjualan.bulanIni)} transaksi`,
        `- Total revenue: ${fmtRupiah(data.revenue.bulanIni)}`,
        `- Rata-rata nilai per transaksi: ${fmtRupiah(avgPerSale)}`,
      ].join('\n');
    },
  },
  {
    id: 'top-performer',
    keywords: ['top performer', 'performa terbaik', 'ranking tertinggi', 'siapa yang terbaik', 'juara', 'kpi tertinggi'],
    handler(data) {
      const sorted = [...data.kpiMonitoring].sort((a, b) => a.ranking - b.ranking);
      const top3 = sorted.slice(0, 3).map(p => `${p.ranking}. ${p.nama} (skor ${fmtNum(p.skor)})`);
      return [`Top performer bulan ini:`, ...top3].join('\n');
    },
  },
  {
    id: 'kpi-tim-rekap',
    keywords: ['kinerja tim', 'rekap kpi', 'rekap kinerja', 'kpi tim', 'performa tim', 'kinerja semua'],
    handler(data) {
      const sorted = [...data.kpiMonitoring].sort((a, b) => a.ranking - b.ranking);
      const lines = sorted.map(p => `${p.ranking}. ${p.nama} - skor ${fmtNum(p.skor)}, hadir ${fmtNum(p.kehadiran)} hari`);
      return [`Rekap kinerja tim (${data.kpiMonitoring.length} orang):`, ...lines].join('\n');
    },
  },
  {
    id: 'piutang',
    keywords: ['piutang', 'account receivable', 'belum lunas', 'tagihan', ' ar '],
    handler(data) {
      const total = data.piutang.reduce((s, p) => s + p.nilai, 0);
      const lines = data.piutang
        .slice()
        .sort((a, b) => b.nilai - a.nilai)
        .map(p => `- ${p.customer}: ${fmtRupiah(p.nilai)}, umur ${p.aging || '-'} (${p.kategori || p.status})`);
      return [
        `Total piutang belum lunas: ${fmtRupiah(total)} dari ${data.piutang.length} customer (top 10):`,
        ...lines,
      ].join('\n');
    },
  },
  {
    id: 'stok-gudang',
    keywords: ['stok gudang', 'stock gudang', 'persediaan', 'sisa stok', 'stok barang'],
    handler(data) {
      const lines = data.stokGudang.map(s => `- ${s.item}: ${fmtNum(s.jumlah)} ${s.satuan}`);
      return [`Stok gudang saat ini (10 item terbanyak):`, ...lines].join('\n');
    },
  },
  {
    id: 'po-gudang',
    keywords: ['po gudang', 'purchase order', 'status po', 'pesanan gudang'],
    handler(data) {
      const lines = data.poGudang.map(p => `- ${p.noPO}: ${p.item} (${fmtNum(p.jumlah)}${p.satuan ? ' ' + p.satuan : ''}) - status: ${p.status}`);
      return [`Status PO gudang:`, ...lines].join('\n');
    },
  },
  {
    id: 'turnover-gudang',
    keywords: ['turnover gudang', 'perputaran gudang', 'tingkat perputaran'],
    handler(data) {
      const t = data.turnoverGudang;
      const lines = t.topItems.map(i => `- ${i.item}: ${fmtNum(i.turnover)}`);
      return [
        `Total turnover gudang (MKI & CFN): ${fmtNum(t.totalTurnover)} unit.`,
        `Item dengan turnover tertinggi:`,
        ...lines,
      ].join('\n');
    },
  },
  {
    id: 'delivery',
    keywords: ['delivery', 'pengiriman', 'kirim barang', 'status pengiriman'],
    handler(data) {
      const selesai = data.delivery.filter(d => d.status === 'Selesai').length;
      const lines = data.delivery.map(d => `- ${fmtTanggal(d.tanggal)} ke ${d.tujuan}: ${fmtNum(d.jumlah)} unit (${d.status})`);
      return [`Status delivery (${selesai}/${data.delivery.length} selesai):`, ...lines].join('\n');
    },
  },
  {
    id: 'wilayah',
    keywords: ['wilayah', 'per wilayah', 'daerah penjualan', 'area penjualan'],
    handler(data) {
      const sorted = [...data.wilayah].sort((a, b) => b.revenue - a.revenue);
      const top = sorted.slice(0, 10);
      const lines = top.map(w => `- ${w.nama}: ${fmtNum(w.sales)} penjualan, revenue ${fmtRupiah(w.revenue)}`);
      const sisa = sorted.length - top.length;
      const result = [`Top 10 wilayah (dari ${sorted.length} wilayah, tertinggi ke terendah):`, ...lines];
      if (sisa > 0) result.push(`(dan ${sisa} wilayah lainnya)`);
      return result.join('\n');
    },
  },
  {
    id: 'frekuensi-customer',
    keywords: ['frekuensi customer', 'pelanggan sering', 'customer paling sering', 'frekuensi pelanggan'],
    handler(data) {
      const sorted = [...data.frekuensiCustomer].sort((a, b) => b.jumlahTransaksi - a.jumlahTransaksi);
      const lines = sorted.map(c => `- ${c.customer}: ${fmtNum(c.jumlahTransaksi)} transaksi`);
      return [`Frekuensi customer (paling sering bertransaksi):`, ...lines].join('\n');
    },
  },
  {
    id: 'fiber-optic',
    keywords: ['fiber optic', '1 core', '1-core', 'kabel fiber', 'fo 1 core'],
    handler(data) {
      const f = data.fiberOptic1Core;
      if (!f || !f.deskripsi) return 'Data fiber optic 1-core tidak ditemukan.';
      return [
        `${f.deskripsi}:`,
        `- Total terjual: ${fmtNum(f.totalTerjual)} (revenue ${fmtRupiah(f.totalRevenue)})`,
        `- Stok tersedia: ${f.stokTersedia === null ? '-' : fmtNum(f.stokTersedia)}`,
      ].join('\n');
    },
  },
  {
    id: 'cuti',
    keywords: ['siapa yang cuti', 'sedang cuti', 'cuti hari ini', 'yang cuti', 'daftar cuti'],
    handler(data) {
      const cuti = data.personel.filter(p => p.cutiAktif);
      if (cuti.length === 0) return 'Tidak ada anggota tim yang sedang cuti saat ini.';
      return ['Anggota tim yang sedang cuti:', ...cuti.map(p => `- ${p.nama} (${p.divisi})`)].join('\n');
    },
  },
  {
    id: 'dinas-luar',
    keywords: ['dinas luar', 'sedang dinas', 'tugas luar', 'perjalanan dinas'],
    handler(data) {
      const dinas = data.personel.filter(p => p.dinasLuarAktif);
      if (dinas.length === 0) return 'Tidak ada anggota tim yang sedang dinas luar saat ini.';
      return ['Anggota tim yang sedang dinas luar:', ...dinas.map(p => `- ${p.nama} ke ${p.dinasLuarTujuan}`)].join('\n');
    },
  },
  {
    id: 'kehadiran',
    keywords: ['kehadiran', 'absensi', 'tingkat kehadiran', 'hadir berapa'],
    handler(data) {
      const lines = data.personel.map(p => `- ${p.nama}: hadir ${fmtNum(p.kehadiranBulanIni)} hari, terlambat ${fmtNum(p.terlambat)}x, izin ${fmtNum(p.izin)}, sakit ${fmtNum(p.sakit)}, alpha ${fmtNum(p.alpha)}`);
      return [`Kehadiran tim bulan ini:`, ...lines].join('\n');
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
