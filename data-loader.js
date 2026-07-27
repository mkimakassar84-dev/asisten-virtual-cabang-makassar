/*
 * data-loader.js
 * ---------------------------------------------------------------------------
 * Mengambil data langsung dari sumber publik (tanpa server, tanpa API key):
 *   1. Google Sheet "Sistem Integrasi Makassar 2026" via endpoint CSV export
 *      (tabs: Grand Data 2026, Stock GD MKS, PO Gudang, AR 2026, Delivery)
 *   2. Web App Google Apps Script "KPI-Personel-Cabang-Makassar" via fetch() JSON
 *      (action=teamOverview) untuk skor/kehadiran per orang
 *   3. Google Sheet "KPI Personel Cabang MKS" tab DINAS_CUTI via CSV export
 *      untuk status cuti/dinas luar
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

const KPI_SHEET_ID = '1WSp2VmHs2LqCD16cMc8JI1l1HHfnP0MAgK-G_kf4Rqw';
const KPI_SHEET_GIDS = {
  dinasCuti: '572213901',
};

const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyZjdcOqCzQZ3i54Y2pAZVfbnMfuaEHmPFOaMhlpPqBgD958CWKTN5iujN4lPOkvJ43/exec';

function csvExportUrl(gid, sheetId = SHEET_ID) {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
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

async function fetchCsvTab(gid, headerIdx = 0, sheetId = SHEET_ID) {
  const res = await fetch(csvExportUrl(gid, sheetId), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Gagal mengambil tab (gid ${gid}): HTTP ${res.status}`);
  const text = await res.text();
  return rowsToObjects(parseCsvRows(text), headerIdx);
}

async function fetchTeamOverview(yearMonth) {
  const url = `${WEBAPP_URL}?action=teamOverview&month=${yearMonth}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Gagal mengambil data KPI personel: HTTP ${res.status}`);
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

/** Susun kpiMonitoring + personel dari teamOverview (webapp) dan DINAS_CUTI (sheet). */
function buildPersonnelData(teamOverview, dinasCutiRaw) {
  const now = new Date();
  const byName = {};
  teamOverview.forEach(p => { byName[p.nama] = p; });

  const cutiAktifNow = {};
  dinasCutiRaw.forEach(r => {
    const mulai = parseIndoDate(r['TanggalMulai']);
    const selesai = parseIndoDate(r['TanggalSelesai']);
    if (!mulai || !selesai) return;
    if (now >= mulai && now <= selesai) {
      cutiAktifNow[r['Nama']] = r['Keterangan'] || 'Cuti/dinas luar';
    }
  });

  const kpiMonitoring = TEAM.map(p => {
    const t = byName[p.nama] || {};
    return {
      nama: p.nama,
      divisi: p.divisi,
      skor: t.skorAkhir ?? null,
      ranking: 0,
      kehadiran: t.countedDays ?? null,
    };
  }).sort((a, b) => (b.skor ?? -1) - (a.skor ?? -1)).map((p, i) => ({ ...p, ranking: i + 1 }));

  const personel = TEAM.map(p => {
    const t = byName[p.nama] || {};
    const keterangan = cutiAktifNow[p.nama];
    const isDinas = keterangan && /dinas/i.test(keterangan);
    const isCuti = keterangan && !isDinas;
    return {
      nama: p.nama,
      divisi: p.divisi,
      kehadiranBulanIni: t.countedDays ?? null,
      skorAkhir: t.skorAkhir ?? null,
      percent: t.percent ?? null,
      totalWorkHours: t.totalWorkHours ?? null,
      cutiAktif: !!isCuti,
      dinasLuarAktif: !!isDinas,
      dinasLuarTujuan: keterangan || null,
    };
  });

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

  try {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [teamOverview, dinasCutiRaw] = await Promise.all([
      fetchTeamOverview(yearMonth),
      fetchCsvTab(KPI_SHEET_GIDS.dinasCuti, 0, KPI_SHEET_ID),
    ]);
    Object.assign(result, buildPersonnelData(teamOverview, dinasCutiRaw));
  } catch (err) {
    result.usingDemoData = true;
    result.personnelError = err.message;
    result.kpiMonitoring = [];
    result.personel = [];
  }

  result.status = 'ready';
  result.lastUpdated = new Date();
  return result;
}
