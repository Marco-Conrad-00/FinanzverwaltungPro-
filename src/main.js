// ════════════════════════════════════════════════════════════════════════════
//  Finanzverwaltung Pro — Electron Main-Process
//  ---------------------------------------------------------------------------
//  Rekonstruiert aus README.md (Sektionen 4, 5, 6, 7).
//
//  Aufgaben dieses Prozesses:
//    • BrowserWindow erstellen (contextIsolation:false → onclick-Handler im
//      window-Scope funktionieren, siehe README §4.2)
//    • Daten-Persistenz nach %APPDATA%\finanzverwaltung-pro\data.json
//    • Backups, Datei-Import, PDF-Druck, Desktop-Verknüpfung
//    • Wertpapier-Kurse aus mehreren Quellen (Yahoo, Börse Frankfurt,
//      JustETF, Stooq, CoinGecko) mit Browser-Headers von der Privat-IP
//      des Nutzers (siehe README §4.5 + §7.3)
//
//  KRITISCH (README §4.1): Alle ipcMain.handle(...)-Aufrufe stehen auf
//  Top-Level, niemals verschachtelt in anderen Handlern.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

// ── Daten-Pfade ─────────────────────────────────────────────────────────────
// %APPDATA%\finanzverwaltung-pro\ (Windows) bzw. Plattform-Äquivalent.
app.setPath('userData', path.join(app.getPath('appData'), 'finanzverwaltung-pro'));
const USER_DATA_DIR = app.getPath('userData');
const DATA_FILE = path.join(USER_DATA_DIR, 'data.json');

function ensureUserDir() {
  try { fs.mkdirSync(USER_DATA_DIR, { recursive: true }); } catch (_) {}
}

// ════════════════════════════════════════════════════════════════════════════
//  BrowserWindow
// ════════════════════════════════════════════════════════════════════════════

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#111111',
    autoHideMenuBar: true,
    title: 'Finanzverwaltung Pro',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // README §4.2 — Pflicht, sonst brechen alle onclick="fn()"-Handler.
      contextIsolation: false,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  ensureUserDir();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ════════════════════════════════════════════════════════════════════════════
//  HTTP-Helper — native HTTPS mit Browser-Headers (README §4.5)
//  Yahoo & Co. blockieren Server-IPs/Proxies; über den Main-Process gehen die
//  Requests von der Privat-IP des Nutzers raus und werden durchgelassen.
// ════════════════════════════════════════════════════════════════════════════

function nodeFetch(url, extraHeaders = {}) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch (e) { resolve({ ok: false, status: 0, body: '', error: 'bad-url' }); return; }

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
      'Origin': u.origin,
      'Referer': u.origin + '/',
      'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      ...extraHeaders,
    };

    const req = https.get(
      { hostname: u.hostname, path: u.pathname + u.search, headers, timeout: 9000 },
      (res) => {
        // Redirects folgen (Yahoo/Stooq nutzen 301/302).
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : u.origin + res.headers.location;
          res.resume();
          resolve(nodeFetch(next, extraHeaders));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body }));
      }
    );
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, body: '', error: 'timeout' }); });
    req.on('error', (e) => resolve({ ok: false, status: 0, body: '', error: e.message }));
  });
}

const nowIso = () => new Date().toISOString();

// ════════════════════════════════════════════════════════════════════════════
//  Kurs-Quellen (README §7.3) — jede gibt bei Erfolg { symbol, kurs, vortag,
//  waehrung, aktualisiert, name, _source } zurück, sonst null.
// ════════════════════════════════════════════════════════════════════════════

// Symbol-Normalisierung (README §7.3, Zeile "Yahoo normalisiert")
function normalizeSymbol(symbol) {
  const map = {
    '.Xetra': '.DE', '.XET': '.DE', '.LX': '.L', '.LON': '.L',
    '.FRA': '.F', '.MIL': '.MI', '.SWX': '.SW', '.PAR': '.PA',
  };
  for (const [from, to] of Object.entries(map)) {
    if (symbol.endsWith(from)) return symbol.slice(0, -from.length) + to;
  }
  return symbol;
}

function parseYahooChart(body) {
  try {
    const data = JSON.parse(body);
    const meta = data?.chart?.result?.[0]?.meta;
    if (meta && typeof meta.regularMarketPrice === 'number') {
      return {
        symbol: meta.symbol,
        kurs: meta.regularMarketPrice,
        vortag: meta.chartPreviousClose ?? meta.previousClose ?? null,
        waehrung: meta.currency || 'EUR',
        aktualisiert: nowIso(),
        name: meta.longName || meta.shortName || meta.symbol,
      };
    }
  } catch (_) {}
  return null;
}

async function tryYahooChart(symbol) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol);
  const r = await nodeFetch(url);
  if (!r.ok) return null;
  const q = parseYahooChart(r.body);
  return q ? { ...q, _source: 'yahoo' } : null;
}

async function tryYahooSearch(query) {
  const url = 'https://query2.finance.yahoo.com/v1/finance/search?q=' +
    encodeURIComponent(query) + '&quotesCount=10&newsCount=0';
  const r = await nodeFetch(url);
  if (!r.ok) return [];
  try {
    const data = JSON.parse(r.body);
    return (data.quotes || [])
      .filter((q) => q.symbol)
      .map((q) => ({
        symbol: q.symbol,
        name: q.longname || q.shortname || q.symbol,
        isin: q.isin || '',
        typ: (q.quoteType || '').toLowerCase() === 'etf' ? 'etf' : 'aktie',
        _source: 'yahoo-search',
      }));
  } catch (_) { return []; }
}

// Börse Frankfurt — hervorragend für DE/EU-Fonds via ISIN.
async function tryBoerseFrankfurt(isin) {
  if (!isin) return null;
  const url = 'https://api.boerse-frankfurt.de/v1/data/quote_box/single?isin=' + encodeURIComponent(isin);
  const r = await nodeFetch(url, { 'Accept': 'application/json' });
  if (!r.ok) return null;
  try {
    const d = JSON.parse(r.body);
    const kurs = d.lastPrice ?? d.last ?? d.previousClose;
    if (typeof kurs === 'number') {
      return {
        symbol: isin, kurs,
        vortag: d.previousClose ?? null,
        waehrung: d.currency || 'EUR',
        aktualisiert: nowIso(),
        name: d.name || isin,
        _source: 'boerse-frankfurt',
      };
    }
  } catch (_) {}
  return null;
}

// JustETF — hervorragend für LU-Fonds via ISIN.
async function tryJustETF(isin) {
  if (!isin) return null;
  const url = 'https://www.justetf.com/api/etfs/' + encodeURIComponent(isin) +
    '/quote?locale=de&currency=EUR';
  const r = await nodeFetch(url, { 'Accept': 'application/json' });
  if (!r.ok) return null;
  try {
    const d = JSON.parse(r.body);
    const kurs = d?.latestQuote?.raw ?? d?.quote?.raw;
    if (typeof kurs === 'number') {
      return {
        symbol: isin, kurs,
        vortag: d?.previousDayQuote?.raw ?? null,
        waehrung: d?.currency || 'EUR',
        aktualisiert: nowIso(),
        name: d?.name || isin,
        _source: 'justetf',
      };
    }
  } catch (_) {}
  return null;
}

// Stooq — US-Aktien-Fallback (CSV).
async function tryStooq(symbol) {
  let sym = symbol.toLowerCase();
  if (!sym.includes('.')) sym += '.us';
  else sym = sym.replace('-', '.');
  const url = 'https://stooq.com/q/l/?s=' + encodeURIComponent(sym) + '&f=sd2t2ohlcv&h&e=csv';
  const r = await nodeFetch(url);
  if (!r.ok || !r.body) return null;
  const lines = r.body.trim().split('\n');
  if (lines.length < 2) return null;
  const cols = lines[1].split(',');
  const close = parseFloat(cols[6]);
  const open = parseFloat(cols[3]);
  if (!close || isNaN(close)) return null;
  return {
    symbol, kurs: close,
    vortag: (open && !isNaN(open)) ? open : close,
    waehrung: 'USD',
    aktualisiert: nowIso(),
    name: symbol,
    _source: 'stooq',
  };
}

// CoinGecko — nur Krypto (Symbole mit -EUR/-USD Suffix).
const COINGECKO_IDS = {
  'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana',
  'ADA': 'cardano', 'XRP': 'ripple', 'DOGE': 'dogecoin',
};
async function tryCoingecko(symbol) {
  const m = /^([A-Za-z0-9]+)-(EUR|USD)$/.exec(symbol);
  if (!m) return null;
  const id = COINGECKO_IDS[m[1].toUpperCase()];
  if (!id) return null;
  const vs = m[2].toLowerCase();
  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=' + id +
    '&vs_currencies=' + vs + '&include_24hr_change=true';
  const r = await nodeFetch(url, { 'Accept': 'application/json' });
  if (!r.ok) return null;
  try {
    const d = JSON.parse(r.body);
    const kurs = d?.[id]?.[vs];
    if (typeof kurs === 'number') {
      const chg = d[id][vs + '_24h_change'];
      const vortag = typeof chg === 'number' ? kurs / (1 + chg / 100) : null;
      return {
        symbol, kurs, vortag,
        waehrung: m[2].toUpperCase(),
        aktualisiert: nowIso(),
        name: m[1].toUpperCase(),
        _source: 'coingecko',
      };
    }
  } catch (_) {}
  return null;
}

// Multi-Source-Kette (README §7.3, Reihenfolge 1–8).
async function fetchQuoteMulti(symbol, isin) {
  if (!symbol && !isin) return null;
  const chain = [];
  if (symbol) {
    chain.push(() => tryCoingecko(symbol));            // 1
    chain.push(() => tryYahooChart(symbol));           // 2
    const norm = normalizeSymbol(symbol);              // 3
    if (norm !== symbol) chain.push(() => tryYahooChart(norm));
    if (symbol.includes('.'))                          // 4
      chain.push(() => tryYahooChart(symbol.split('.')[0]));
  }
  if (isin) {
    chain.push(() => tryBoerseFrankfurt(isin));        // 5
    chain.push(() => tryJustETF(isin));                // 6
  }
  if (symbol) chain.push(() => tryStooq(symbol));      // 8

  for (const step of chain) {
    try {
      const q = await step();
      if (q && typeof q.kurs === 'number') return q;
    } catch (_) {}
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
//  IPC-Handler — ALLE auf Top-Level (README §4.1). Namen/Signaturen exakt wie
//  in preload.js (window.EA.*) erwartet.
// ════════════════════════════════════════════════════════════════════════════

// load-data → String (data.json-Inhalt) oder null.
ipcMain.handle('load-data', async () => {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    return fs.readFileSync(DATA_FILE, 'utf8');
  } catch (e) { return null; }
});

// save-data(data:String) → schreibt data.json atomar.
ipcMain.handle('save-data', async (_evt, data) => {
  try {
    ensureUserDir();
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, typeof data === 'string' ? data : JSON.stringify(data), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

// open-files → [{ path, name }] (Excel/PDF-Import).
ipcMain.handle('open-files', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Dateien importieren',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Import-Dateien', extensions: ['xlsx', 'xls', 'csv', 'pdf', 'txt'] },
      { name: 'Alle Dateien', extensions: ['*'] },
    ],
  });
  if (res.canceled) return [];
  return res.filePaths.map((p) => ({ path: p, name: path.basename(p) }));
});

// read-file(path) → { type:'base64'|'text', data }. PDFs base64, Rest text.
ipcMain.handle('read-file', async (_evt, filePath) => {
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
      return { type: 'base64', data: fs.readFileSync(filePath).toString('base64') };
    }
    return { type: 'text', data: fs.readFileSync(filePath, 'utf8') };
  } catch (e) {
    return { type: 'text', data: '', error: e.message };
  }
});

// get-version → Version aus package.json.
ipcMain.handle('get-version', async () => app.getVersion());

// open-data-folder → Explorer im userData-Verzeichnis.
ipcMain.handle('open-data-folder', async () => {
  ensureUserDir();
  await shell.openPath(USER_DATA_DIR);
  return { ok: true };
});

// select-folder → { path } | null (Backup-Pfad-Auswahl).
ipcMain.handle('select-folder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Backup-Ordner wählen',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths.length) return null;
  return { path: res.filePaths[0] };
});

// open-folder(path) → beliebigen Ordner öffnen.
ipcMain.handle('open-folder', async (_evt, folderPath) => {
  if (!folderPath) return { ok: false };
  await shell.openPath(folderPath);
  return { ok: true };
});

// write-backup(path, content) → { ok, fileName }.
ipcMain.handle('write-backup', async (_evt, folderPath, content) => {
  try {
    if (!folderPath) return { ok: false, error: 'no-path' };
    fs.mkdirSync(folderPath, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = 'backup-' + stamp + '.json';
    fs.writeFileSync(path.join(folderPath, fileName), content, 'utf8');
    return { ok: true, fileName };
  } catch (e) { return { ok: false, error: e.message }; }
});

// fetch-url(url) → { ok, status, body } (generischer HTTP-Fetch).
ipcMain.handle('fetch-url', async (_evt, url) => {
  if (!url) return { ok: false, status: 0, body: '' };
  return nodeFetch(url);
});

// fetch-quote(symbol, isin) → Kurs-Objekt oder null (Multi-Source).
ipcMain.handle('fetch-quote', async (_evt, symbol, isin) => {
  return fetchQuoteMulti(symbol, isin);
});

// fetch-search(query) → [{ symbol, name, isin, typ }] via Yahoo-Search.
ipcMain.handle('fetch-search', async (_evt, query) => {
  if (!query || query.length < 2) return [];
  return tryYahooSearch(query);
});

// fetch-quote-at-date(symbol, date) → Number (Kurs am Datum) | null.
ipcMain.handle('fetch-quote-at-date', async (_evt, symbol, dateStr) => {
  if (!symbol || !dateStr) return null;
  try {
    const date = new Date(dateStr);
    const start = Math.floor(date.getTime() / 1000);
    const end = start + 86400 * 7;
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
      encodeURIComponent(symbol) + '?period1=' + start + '&period2=' + end + '&interval=1d';
    const r = await nodeFetch(url);
    if (!r.ok) return null;
    const data = JSON.parse(r.body);
    const prices = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    const found = prices?.find((p) => p !== null && p !== undefined);
    return typeof found === 'number' ? found : null;
  } catch (e) { return null; }
});

// print-to-pdf({ html, filename }) → rendert HTML in verstecktem Fenster,
// druckt als PDF und bietet Speichern-Dialog an.
ipcMain.handle('print-to-pdf', async (_evt, opts) => {
  const { html, filename } = opts || {};
  if (!html) return { ok: false, error: 'no-html' };

  const pdfWin = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: false, sandbox: true },
  });
  try {
    await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const data = await pdfWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'default' },
    });
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'PDF speichern',
      defaultPath: filename || 'Bericht.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(res.filePath, data);
    return { ok: true, path: res.filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    if (!pdfWin.isDestroyed()) pdfWin.destroy();
  }
});

// create-shortcut → Desktop-Verknüpfung. { ok, path } | { ok:false, error }.
ipcMain.handle('create-shortcut', async () => {
  try {
    const desktop = app.getPath('desktop');
    const exePath = process.execPath;
    if (process.platform === 'win32') {
      const linkPath = path.join(desktop, 'Finanzverwaltung Pro.lnk');
      const ok = shell.writeShortcutLink(linkPath, 'create', {
        target: exePath,
        cwd: path.dirname(exePath),
        description: 'Finanzverwaltung Pro',
      });
      return ok ? { ok: true, path: linkPath } : { ok: false, error: 'writeShortcutLink fehlgeschlagen' };
    }
    // Nicht-Windows: einfache Verknüpfung/Alias.
    const linkPath = path.join(desktop, 'Finanzverwaltung Pro');
    try { fs.symlinkSync(exePath, linkPath); } catch (_) {}
    return { ok: true, path: linkPath };
  } catch (e) { return { ok: false, error: e.message }; }
});
