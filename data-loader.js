/*
 * data-loader.js
 * ---------------------------------------------------------------------------
 * Mengambil data langsung dari sumber publik (tanpa server, tanpa API key):
 *   1. Google Sheet "Sistem Integrasi Makassar 2026" via endpoint CSV export
 *      (tabs: Grand Data 2026, Stock GD MKS, PO Gudang, AR 2026, Delivery)
 *   2. Web App Google Apps Script "KPI-Personel-Cabang-Makassar" via fetch() JSON
 *      (BELUM TERSAMBUNG — menunggu WEBAPP_URL asli, lihat TODO di bawah)
 * ---------------------------------------------------------------------------
 */

const SHEET_ID = '1_uou6JDGV-Tm80oALMrduuj9ZIVWM1r9ppuQsYq7_qo';

const SHEET_GIDS = {
  grandData: '1703817529',
  stockGdMks: '507949843',
  poGudang: '2047354384',
  ar2026: '1407414424',
  delivery: '24678794',
};

// TODO: ganti dengan WEBAPP_URL asli dari repo KPI-Personel-Cabang-Makassar
// (dibutuhkan untuk data KPI personel per-orang, kehadiran, cuti, dinas luar).
const WEBAPP_URL = 'TODO_WEBAPP_URL_APPS_SCRIPT';

function csvExportUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
}

/** Parser CSV generik (menangani koma di dalam tanda kutip) -> array of arrays (rows mentah). */
function parseCsvRows(text) {
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
  return rows.filter(r => r.some(v => v !== ''));
}

/** Ubah rows mentah jadi array of objects memakai baris ke-`headerIdx` sebagai header. */
function rowsToObjects(rows, headerIdx) {
  if (rows.length <= headerIdx) return [];
  const header = rows[headerIdx].map(h => h.trim());
  return rows.slice(headerIdx + 1).map(r => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
}

async function fetchCsvTab(gid, headerIdx = 0) {
  const res = await fetch(csvExportUrl(gid), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Gagal mengambil tab (gid ${gid}): HTTP ${res.status}`);
  const text = await res.text();
  return rowsToObjects(parseCsvRows(text), headerIdx);
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

const INDO_MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, Mei: 4, Jun: 5, Jul: 6, Agu: 7, Sep: 8, Okt: 9, Nov: 10, Des: 11 };

function parseIndoDate(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const mon = INDO_MONTHS[m[2]];
  if (mon === undefined) return null;
  return new Date(+m[3], mon, +m[1]);
}

function parseRupiah(s) {
  if (!s) return 0;
  const n = String(s).replace(/[^0-9-]/g, '');
  return n ? parseInt(n, 10) : 0;
}

function monthKey(d) { return d.getFullYear() + '-' + d.getMonth(); }

/** Data contoh (demo) untuk bagian yang belum tersambung ke sumber asli (KPI personel). */
function buildDemoPersonnel() {
  const kpiMonitoring = TEAM.map((p, i) => ({
    nama: p.nama,
    divisi: p.divisi,
    skor: [92, 88, 95, 81, 90, 84, 78, 87][i],
    ranking: 0,
    kehadiran: [24, 22, 25, 20, 23, 21, 19, 22][i],
  })).sort((a, b) => b.skor - a.skor).map((p, i) => ({ ...p, ranking: i + 1 }));

  const personel = TEAM.map((p, i) => ({
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
  }));

  return { kpiMonitoring, personel };
}

/** Susun DataStore dari data Sheet asli (Grand Data 2026, Stock GD MKS, PO Gudang, AR 2026, Delivery). */
function buildDataStoreFromSheets(grandDataRaw, stockRaw, poRaw, arRaw, deliveryRaw) {
  const now = new Date();
  const curKey = monthKey(now);
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = monthKey(prevDate);

  const itemNames = {};
  stockRaw.forEach(r => { itemNames[r['KODE BARANG']] = r['DESKRIPSI']; });

  const grandData = grandDataRaw.map(r => ({
    tanggal: parseIndoDate(r['Order Date']),
    noInvoice: r['No Invoice'],
    payment: r['Payment'],
    customer: r['Customer'],
    kodeBarang: r['Kode Barang'],
    qty: parseInt(r['Quantity'], 10) || 0,
    amount: parseRupiah(r['Amount']),
    company: r['Company'],
    lokasi: r['Lokasi'],
    tanggalTerkirim: r['Tanggal Terkirim'],
  })).filter(r => r.tanggal);

  const invoicesByMonth = {};
  const revenueByMonth = {};
  grandData.forEach(r => {
    const k = monthKey(r.tanggal);
    if (!invoicesByMonth[k]) invoicesByMonth[k] = new Set();
    invoicesByMonth[k].add(r.noInvoice);
    revenueByMonth[k] = (revenueByMonth[k] || 0) + r.amount;
  });

  const penjualan = {
    bulanIni: (invoicesByMonth[curKey] || new Set()).size,
    bulanLalu: (invoicesByMonth[prevKey] || new Set()).size,
    targetBulanIni: null,
  };
  const revenue = {
    bulanIni: revenueByMonth[curKey] || 0,
    bulanLalu: revenueByMonth[prevKey] || 0,
    targetBulanIni: null,
  };

  const perfByDay = {};
  grandData.forEach(r => {
    const dKey = r.tanggal.toISOString().slice(0, 10);
    if (!perfByDay[dKey]) perfByDay[dKey] = { invoices: new Set(), revenue: 0 };
    perfByDay[dKey].invoices.add(r.noInvoice);
    perfByDay[dKey].revenue += r.amount;
  });
  const performaHarian = Object.keys(perfByDay).sort().slice(-7).map(dKey => ({
    tanggal: dKey,
    sales: perfByDay[dKey].invoices.size,
    revenue: perfByDay[dKey].revenue,
  }));

  const wilayahMap = {};
  grandData.forEach(r => {
    if (!r.lokasi) return;
    if (!wilayahMap[r.lokasi]) wilayahMap[r.lokasi] = { invoices: new Set(), revenue: 0 };
    wilayahMap[r.lokasi].invoices.add(r.noInvoice);
    wilayahMap[r.lokasi].revenue += r.amount;
  });
  const wilayah = Object.keys(wilayahMap).map(nama => ({
    nama, sales: wilayahMap[nama].invoices.size, revenue: wilayahMap[nama].revenue,
  })).sort((a, b) => b.revenue - a.revenue);

  const custMap = {};
  grandData.forEach(r => {
    if (!r.customer) return;
    if (!custMap[r.customer]) custMap[r.customer] = new Set();
    custMap[r.customer].add(r.noInvoice);
  });
  const frekuensiCustomer = Object.keys(custMap)
    .map(customer => ({ customer, jumlahTransaksi: custMap[customer].size }))
    .sort((a, b) => b.jumlahTransaksi - a.jumlahTransaksi)
    .slice(0, 10);

  const fiberRows = grandData.filter(r => /1\s*core/i.test(itemNames[r.kodeBarang] || ''));
  const fiberKode = fiberRows.length ? fiberRows[0].kodeBarang : null;
  const fiberStock = stockRaw.find(r => r['KODE BARANG'] === fiberKode);
  const fiberOptic1Core = {
    deskripsi: fiberKode ? itemNames[fiberKode] : null,
    totalTerjual: fiberRows.reduce((s, r) => s + r.qty, 0),
    totalRevenue: fiberRows.reduce((s, r) => s + r.amount, 0),
    stokTersedia: fiberStock ? (parseInt(fiberStock['MKI & CFN'], 10) || 0) : null,
  };

  const stokEntries = stockRaw.map(r => ({
    item: r['DESKRIPSI'],
    jumlah: parseInt(r['MKI & CFN'], 10) || 0,
    turnover: parseInt(r['MKI & CFN Turnover'], 10) || 0,
  })).filter(r => r.item);
  const stokGudang = stokEntries
    .filter(r => r.jumlah > 0)
    .sort((a, b) => b.jumlah - a.jumlah)
    .slice(0, 10)
    .map(r => ({ item: r.item, jumlah: r.jumlah, satuan: 'unit' }));

  const totalTurnover = stokEntries.reduce((s, r) => s + r.turnover, 0);
  const topTurnover = stokEntries.slice().sort((a, b) => b.turnover - a.turnover).slice(0, 5);
  const turnoverGudang = {
    totalTurnover,
    topItems: topTurnover.map(r => ({ item: r.item, turnover: r.turnover })),
  };

  const poGudang = poRaw
    .map(r => ({
      noPO: r['NO PO'],
      item: itemNames[r['Kode Barang']] || r['Kode Barang'],
      jumlah: parseInt(r['Quantity'], 10) || 0,
      status: r['Stage'] || r['Status (Ekspedisi)'] || '-',
      tanggalPO: parseIndoDate(r['Order Date']),
    }))
    .filter(r => r.tanggalPO)
    .sort((a, b) => b.tanggalPO - a.tanggalPO)
    .slice(0, 8)
    .map(r => ({ ...r, tanggalPO: r.tanggalPO.toISOString().slice(0, 10) }));

  const delivery = deliveryRaw
    .map(r => ({
      tanggal: parseIndoDate(r['Tanggal Cetak SJ']),
      tujuan: r['Lokasi'],
      jumlah: parseInt(r['Qty'], 10) || 0,
      status: r['Tanggal Kirim SJ'] ? 'Selesai' : 'Proses',
    }))
    .filter(r => r.tanggal)
    .sort((a, b) => b.tanggal - a.tanggal)
    .slice(0, 8)
    .map(r => ({ ...r, tanggal: r.tanggal.toISOString().slice(0, 10) }));

  const piutang = arRaw
    .map(r => ({
      customer: r['Nama Customer'],
      nilai: parseRupiah(r['Sisa Saldo Piutang']),
      aging: r['Aging'],
      kategori: r['Kategori'],
      status: r['Status'],
    }))
    .filter(r => r.status && r.status !== 'Lunas' && r.nilai > 0)
    .sort((a, b) => b.nilai - a.nilai)
    .slice(0, 10);

  return {
    performaHarian, revenue, penjualan, wilayah, frekuensiCustomer,
    fiberOptic1Core, stokGudang, turnoverGudang, poGudang, delivery, piutang,
  };
}

/** Ambil semua data dari sumber asli. Bagian KPI personel jatuh ke demo bila WEBAPP_URL belum diisi. */
async function loadAllData() {
  const result = { status: 'loading', lastUpdated: null, usingDemoData: false };

  try {
    const [grandDataRaw, stockRaw, poRaw, arRaw, deliveryRaw] = await Promise.all([
      fetchCsvTab(SHEET_GIDS.grandData, 0),
      fetchCsvTab(SHEET_GIDS.stockGdMks, 1),
      fetchCsvTab(SHEET_GIDS.poGudang, 0),
      fetchCsvTab(SHEET_GIDS.ar2026, 0),
      fetchCsvTab(SHEET_GIDS.delivery, 0),
    ]);
    Object.assign(result, buildDataStoreFromSheets(grandDataRaw, stockRaw, poRaw, arRaw, deliveryRaw));
  } catch (err) {
    result.status = 'error';
    result.error = err.message;
    return result;
  }

  const isPersonnelConfigured = WEBAPP_URL !== 'TODO_WEBAPP_URL_APPS_SCRIPT';
  if (isPersonnelConfigured) {
    try {
      const personnelJson = await fetchWebAppJson();
      // TODO: mapping JSON personel asli -> { kpiMonitoring, personel } setelah struktur JSON diketahui.
      Object.assign(result, personnelJson);
    } catch (err) {
      Object.assign(result, buildDemoPersonnel());
      result.usingDemoData = true;
      result.personnelError = err.message;
    }
  } else {
    Object.assign(result, buildDemoPersonnel());
    result.usingDemoData = true;
  }

  result.status = 'ready';
  result.lastUpdated = new Date();
  return result;
}
