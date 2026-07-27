/*
 * data-loader.js
 * ---------------------------------------------------------------------------
 * Mengambil data langsung dari sumber publik (tanpa server, tanpa API key):
 *   1. Google Sheet "Kinerja-Cabang-Makassar" via endpoint CSV export
 *   2. Web App Google Apps Script "KPI-Personel-Cabang-Makassar" via fetch() JSON
 *
 * PENTING (TODO): Bagian PARSING di bawah ini masih memakai data contoh (demo)
 * karena struktur kolom & gid asli tabs belum ditempel oleh pengguna.
 * Setelah source asli data-loader.js dan calc.js dari kedua repo GitHub
 * ditempelkan di chat, fungsi parseXxx() di bawah HARUS diganti agar cocok
 * 1:1 dengan struktur kolom/gid yang sebenarnya. Jangan menebak nama kolom.
 * ---------------------------------------------------------------------------
 */

const SHEET_ID = '1_uou6JDGV-Tm80oALMrduuj9ZIVWM1r9ppuQsYq7_qo';

// TODO: ganti dengan gid asli tiap tab (lihat data-loader.js repo Kinerja-Cabang-Makassar)
const SHEET_GIDS = {
  grandData: 'TODO_GID_GRAND_DATA_2026',
  revSum: 'TODO_GID_REV_SUM',
  salesSum: 'TODO_GID_SALES_SUM',
  kpiMonitoring: 'TODO_GID_KPI_MONITORING',
  stockGdMks: 'TODO_GID_STOCK_GD_MKS',
  poGudang: 'TODO_GID_PO_GUDANG',
  ar2026: 'TODO_GID_AR_2026',
};

// TODO: ganti dengan WEBAPP_URL asli dari repo KPI-Personel-Cabang-Makassar
const WEBAPP_URL = 'TODO_WEBAPP_URL_APPS_SCRIPT';

function csvExportUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
}

/** Parser CSV generik (menangani koma di dalam tanda kutip) -> array of objects pakai header baris pertama. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const filtered = rows.filter(r => r.some(v => v !== ''));
  if (filtered.length === 0) return [];
  const header = filtered[0].map(h => h.trim());
  return filtered.slice(1).map(r => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
}

async function fetchCsvTab(gid) {
  const res = await fetch(csvExportUrl(gid), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Gagal mengambil tab (gid ${gid}): HTTP ${res.status}`);
  const text = await res.text();
  return parseCsv(text);
}

async function fetchWebAppJson() {
  const res = await fetch(WEBAPP_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Gagal mengambil data personel: HTTP ${res.status}`);
  return res.json();
}

const TEAM = [
  { nama: 'ADI', divisi: 'Marketing' },
  { nama: 'ASTRID', divisi: 'Marketing' },
  { nama: 'PUTRI', divisi: 'Marketing' },
  { nama: 'REZA', divisi: 'Marketing' },
  { nama: 'ASPAR', divisi: 'Logistik' },
  { nama: 'BURHAMIN', divisi: 'Logistik' },
  { nama: 'TAUFIK', divisi: 'Logistik' },
  { nama: 'ZUL', divisi: 'Logistik' },
];

/** Data contoh (demo) dipakai sebagai fallback selama gid/WEBAPP_URL asli belum diisi,
 *  atau saat fetch gagal (offline / sumber belum bisa diakses). */
function buildDemoDataStore() {
  return {
    status: 'ready',
    lastUpdated: new Date(),
    usingDemoData: true,

    performaHarian: [
      { tanggal: '2026-07-25', sales: 42, revenue: 18500000 },
      { tanggal: '2026-07-26', sales: 38, revenue: 16200000 },
      { tanggal: '2026-07-27', sales: 45, revenue: 20100000 },
    ],

    revenue: {
      bulanIni: 412500000,
      bulanLalu: 389200000,
      targetBulanIni: 450000000,
      perBulan: { Januari: 350000000, Februari: 365000000, Maret: 372000000 },
    },

    penjualan: {
      bulanIni: 986,
      bulanLalu: 910,
      targetBulanIni: 1050,
      perBulan: { Januari: 820, Februari: 860, Maret: 890 },
    },

    rasioSalesRevenue: { bulanIni: 0.4183 },

    kpiMonitoring: TEAM.map((p, i) => ({
      nama: p.nama,
      divisi: p.divisi,
      skor: [92, 88, 95, 81, 90, 84, 78, 87][i],
      ranking: 0,
      kehadiran: [24, 22, 25, 20, 23, 21, 19, 22][i],
    })).sort((a, b) => b.skor - a.skor).map((p, i) => ({ ...p, ranking: i + 1 })),

    wilayah: [
      { nama: 'Makassar Kota', sales: 520, revenue: 220000000 },
      { nama: 'Gowa', sales: 210, revenue: 88000000 },
      { nama: 'Maros', sales: 156, revenue: 64500000 },
      { nama: 'Takalar', sales: 100, revenue: 40000000 },
    ],

    turnoverGudang: {
      barangMasuk: 1250,
      barangKeluar: 1180,
      sisaStok: 3400,
      tingkatPerputaran: 0.347,
    },

    stokGudang: [
      { item: 'Kabel Fiber Optic 1-Core', jumlah: 8500, satuan: 'meter' },
      { item: 'ONT/Modem', jumlah: 145, satuan: 'unit' },
      { item: 'Splitter 1:8', jumlah: 60, satuan: 'unit' },
      { item: 'Konektor SC/UPC', jumlah: 900, satuan: 'pcs' },
    ],

    poGudang: [
      { noPO: 'PO-2607-001', item: 'ONT/Modem', jumlah: 100, status: 'Dalam Perjalanan', tanggalPO: '2026-07-20' },
      { noPO: 'PO-2607-002', item: 'Kabel FO 1-Core', jumlah: 5000, satuan: 'meter', status: 'Diterima', tanggalPO: '2026-07-15' },
    ],

    delivery: [
      { tanggal: '2026-07-25', tujuan: 'Makassar Kota', jumlah: 18, status: 'Selesai' },
      { tanggal: '2026-07-26', tujuan: 'Gowa', jumlah: 9, status: 'Selesai' },
      { tanggal: '2026-07-27', tujuan: 'Maros', jumlah: 6, status: 'Proses' },
    ],

    piutang: [
      { customer: 'PT Sinar Jaya', nilai: 15500000, tanggalJatuhTempo: '2026-08-05', status: 'Belum Lunas' },
      { customer: 'CV Mitra Sejahtera', nilai: 8200000, tanggalJatuhTempo: '2026-07-30', status: 'Belum Lunas' },
      { customer: 'Toko Berkah', nilai: 3100000, tanggalJatuhTempo: '2026-07-20', status: 'Terlambat' },
    ],

    frekuensiCustomer: [
      { customer: 'PT Sinar Jaya', jumlahTransaksi: 12 },
      { customer: 'CV Mitra Sejahtera', jumlahTransaksi: 9 },
      { customer: 'Toko Berkah', jumlahTransaksi: 5 },
    ],

    fiberOptic1Core: [
      { lokasi: 'Jl. Perintis Kemerdekaan', panjangKabel: 1200, status: 'Aktif' },
      { lokasi: 'Jl. Sultan Alauddin', panjangKabel: 950, status: 'Aktif' },
      { lokasi: 'Jl. Tun Abdul Razak', panjangKabel: 700, status: 'Perbaikan' },
    ],

    personel: TEAM.map((p, i) => ({
      nama: p.nama,
      divisi: p.divisi,
      kehadiranBulanIni: [24, 22, 25, 20, 23, 21, 19, 22][i],
      terlambat: [1, 0, 0, 3, 2, 1, 4, 1][i],
      izin: [0, 1, 0, 1, 0, 0, 1, 0][i],
      sakit: [1, 0, 1, 0, 1, 0, 0, 1][i],
      alpha: [0, 0, 0, 1, 0, 0, 1, 0][i],
      skorAkhir: [92, 88, 95, 81, 90, 84, 78, 87][i],
      cutiAktif: i === 3,
      dinasLuarAktif: i === 5,
      dinasLuarTujuan: i === 5 ? 'Parepare' : null,
    })),
  };
}

/** Ambil semua data dari sumber asli. Jatuh ke demo data bila gagal / belum dikonfigurasi. */
async function loadAllData() {
  const isConfigured =
    WEBAPP_URL !== 'TODO_WEBAPP_URL_APPS_SCRIPT' &&
    Object.values(SHEET_GIDS).every(g => !g.startsWith('TODO_'));

  if (!isConfigured) {
    return buildDemoDataStore();
  }

  try {
    const [grandData, revSum, salesSum, kpiMonitoring, stockGdMks, poGudangRaw, ar2026] = await Promise.all([
      fetchCsvTab(SHEET_GIDS.grandData),
      fetchCsvTab(SHEET_GIDS.revSum),
      fetchCsvTab(SHEET_GIDS.salesSum),
      fetchCsvTab(SHEET_GIDS.kpiMonitoring),
      fetchCsvTab(SHEET_GIDS.stockGdMks),
      fetchCsvTab(SHEET_GIDS.poGudang),
      fetchCsvTab(SHEET_GIDS.ar2026),
    ]);
    const personelJson = await fetchWebAppJson();

    // TODO: setelah struktur kolom asli diketahui, mapping raw rows -> DataStore
    // ditulis di sini (menggantikan blok demo di bawah).
    throw new Error('Mapping data asli belum diimplementasikan — menunggu source data-loader.js/calc.js asli.');
  } catch (err) {
    const demo = buildDemoDataStore();
    demo.usingDemoData = true;
    demo.error = err.message;
    return demo;
  }
}
