const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
let win;
let tray = null;
let isQuiting = false;

// Fix userData path to always use 'finanzverwaltung-pro' regardless of productName
app.setPath('userData', path.join(app.getPath('appData'), 'finanzverwaltung-pro'));

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700,
    title: 'Finanzverwaltung Pro', backgroundColor: '#f6f8f6', show: false,
    icon: path.join(__dirname, 'logo.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: false, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => win.show());

  // Beim Schließen: in den Tray minimieren statt beenden (nur wenn Tray aktiv/gewünscht).
  win.on('close', (e) => {
    if (!isQuiting && trayEnabled && tray) {
      e.preventDefault();
      win.hide();
    }
  });
}

// Ob der Hintergrund-/Tray-Betrieb gewünscht ist (vom Renderer gesetzt).
let trayEnabled = false;

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ── ERINNERUNGEN: System-Tray + Benachrichtigungen ──────────────────────────
// Additiv & abgesichert: schlägt etwas fehl, läuft die App normal weiter.
function setupTray() {
  try {
    if (tray) return;
    let img;
    try {
      const iconPath = path.join(__dirname, 'logo.png');
      img = nativeImage.createFromPath(iconPath);
      if (img.isEmpty()) img = undefined;
    } catch { img = undefined; }
    tray = new Tray(img || nativeImage.createEmpty());
    tray.setToolTip('Finanzverwaltung Pro');
    const menu = Menu.buildFromTemplate([
      { label: 'Öffnen', click: () => { if (win) { win.show(); win.focus(); } } },
      { type: 'separator' },
      { label: 'Beenden', click: () => { isQuiting = true; app.quit(); } },
    ]);
    tray.setContextMenu(menu);
    tray.on('click', () => { if (win) { win.isVisible() ? win.focus() : win.show(); } });
  } catch (e) {
    console.warn('Tray konnte nicht erstellt werden:', e.message);
    tray = null;
  }
}

app.on('before-quit', () => { isQuiting = true; });

// ── AUTO-BACKUP BEIM BEENDEN ────────────────────────────────────────────────
// Der Renderer teilt den eingestellten Backup-Ordner mit. Beim Beenden schreibt
// der Hauptprozess selbst ein Backup der data.json dorthin (mit Rotation auf 5).
let _autoBackupDir = null;
ipcMain.handle('set-backup-dir', (_e, dir) => { _autoBackupDir = dir || null; return true; });

function writeBackupOnQuit() {
  try {
    if (!_autoBackupDir) return;
    const src = dp();
    if (!fs.existsSync(src)) return;
    const content = fs.readFileSync(src, 'utf8');
    try { JSON.parse(content); } catch { return; } // nur gültige Daten sichern
    if (!fs.existsSync(_autoBackupDir)) fs.mkdirSync(_autoBackupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(_autoBackupDir, 'backup-' + ts + '.json'), content, 'utf8');
    // Rotation: nur 5 neueste behalten (nur backup-*.json)
    try {
      const isBackup = n => /^backup-.*\.json$/i.test(n);
      const files = fs.readdirSync(_autoBackupDir).filter(isBackup)
        .map(n => ({ full: path.join(_autoBackupDir, n), t: fs.statSync(path.join(_autoBackupDir, n)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      files.slice(5).forEach(f => { try { fs.unlinkSync(f.full); } catch {} });
    } catch {}
  } catch (e) { console.warn('Auto-Backup beim Beenden fehlgeschlagen:', e.message); }
}

app.on('before-quit', writeBackupOnQuit);

// Renderer schaltet Hintergrundbetrieb an/aus (aus den Einstellungen).
ipcMain.handle('set-tray-enabled', (_e, enabled) => {
  trayEnabled = !!enabled;
  if (trayEnabled) setupTray();
  else if (tray) { try { tray.destroy(); } catch {} tray = null; }
  return { ok: true, trayEnabled };
});

// Renderer löst eine System-Benachrichtigung aus.
ipcMain.handle('notify', (_e, payload) => {
  try {
    const title = (payload && payload.title) || 'Erinnerung';
    const body  = (payload && payload.body)  || '';
    if (!Notification.isSupported()) return { ok: false, reason: 'not-supported' };
    let icon;
    try { icon = nativeImage.createFromPath(path.join(__dirname, 'logo.png')); if (icon.isEmpty()) icon = undefined; } catch {}
    const n = new Notification({ title, body, icon, silent: false });
    n.on('click', () => { if (win) { win.show(); win.focus(); } });
    n.show();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});


// ── AUTO-UPDATE (electron-updater über GitHub Releases) ──────────────────────
// Prüft beim Start auf neue Versionen, lädt sie im Hintergrund und fragt dann,
// ob neu gestartet werden soll. Nur in der gepackten App aktiv (nicht bei npm start).
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.fullChangelog = true;

  function sendUpdateStatus(channel, data) {
    if (win && win.webContents) win.webContents.send(channel, data);
  }

  app.whenReady().then(() => {
    // Kein Update-Check im Entwicklungsmodus (electron .) – nur in der Installation.
    if (!app.isPackaged) return;
    setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 4000);
  });

  autoUpdater.on('update-available', (info) => {
    sendUpdateStatus('update-available', { version: info.version });
  });
  autoUpdater.on('download-progress', (p) => {
    sendUpdateStatus('update-progress', { percent: Math.round(p.percent) });
  });
  autoUpdater.on('update-downloaded', async (info) => {
    // Release-Notes aus dem GitHub-Release (kann HTML oder Text sein).
    let notes = '';
    try {
      let raw = info && info.releaseNotes;
      if (Array.isArray(raw)) raw = raw.map(n => (n && n.note) || '').join('\n\n');
      if (typeof raw === 'string' && raw.trim()) {
        // HTML-Tags entfernen, Einträge lesbar machen
        notes = raw.replace(/<li>/gi, '• ').replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\n{3,}/g,'\n\n').trim();
        if (notes.length > 600) notes = notes.slice(0, 600) + '…';
      }
    } catch {}
    const detail = 'Die App wird beim Neustart automatisch aktualisiert.'
      + (notes ? ('\n\n─── Was ist neu ───\n' + notes) : '');
    const res = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Jetzt neu starten', 'Später'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update bereit',
      message: 'Version ' + info.version + ' wurde heruntergeladen.',
      detail
    });
    if (res.response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on('error', (err) => {
    console.error('AutoUpdater-Fehler:', err == null ? 'unbekannt' : (err.message || err));
  });
} catch (e) {
  console.warn('electron-updater nicht verfügbar:', e.message);
}

// Manueller Update-Check aus dem Renderer (z.B. Button in Einstellungen)
ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) return { ok: false, reason: 'dev' };
  if (!autoUpdater) return { ok: false, reason: 'updater-nicht-verfügbar' };
  try {
    const r = await autoUpdater.checkForUpdates();
    return { ok: true, version: r?.updateInfo?.version || null };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});


const dp = () => path.join(app.getPath('userData'), 'data.json');

// ── WERTPAPIER-KURSE: Direkter Fetch über Node.js (umgeht CORS + Bot-Detection) ─
const https = require('https');

function nodeFetch(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'application/json,text/javascript,*/*;q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Origin': 'https://finance.yahoo.com',
        'Referer': 'https://finance.yahoo.com/',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        ...headers,
      },
      timeout: 8000,
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        nodeFetch(res.headers.location, headers).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error('HTTP ' + res.statusCode));
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

// Helper: normalize symbol for Yahoo (.Xetra→.DE, .LX→.L, etc.)
function normalizeSymbol(sym) {
  if (!sym) return sym;
  return sym
    .replace(/\.xetra$/i, '.DE')
    .replace(/\.xet$/i, '.DE')
    .replace(/\.lx$/i, '.L')
    .replace(/\.lon$/i, '.L')
    .replace(/\.fra$/i, '.F')
    .replace(/\.par$/i, '.PA')
    .replace(/\.mil$/i, '.MI')
    .replace(/\.swx$/i, '.SW');
}

async function tryYahooChart(symbol) {
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try {
      const url = 'https://' + host + '/v8/finance/chart/' + encodeURIComponent(symbol);
      const text = await nodeFetch(url);
      const data = JSON.parse(text);
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta && typeof meta.regularMarketPrice === 'number') {
        return {
          symbol: meta.symbol,
          kurs: meta.regularMarketPrice,
          vortag: meta.chartPreviousClose || meta.previousClose,
          waehrung: meta.currency,
          aktualisiert: new Date().toISOString(),
          name: meta.longName || meta.shortName || meta.symbol,
          _source: 'yahoo:' + host.slice(0, 6),
        };
      }
    } catch (err) { /* try next */ }
  }
  return null;
}

async function tryYahooSearch(query) {
  try {
    const url = 'https://query2.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(query) + '&quotesCount=5';
    const text = await nodeFetch(url);
    const data = JSON.parse(text);
    const quotes = (data.quotes || []).filter(q => q.symbol);
    return quotes[0]?.symbol || null;
  } catch (err) { return null; }
}

// ── Börse Frankfurt API (kostenlos, hervorragend für DE/EU-Fonds) ─────────
async function tryBoerseFrankfurt(isin) {
  if (!isin || isin.length !== 12) return null;
  try {
    const url = 'https://api.boerse-frankfurt.de/v1/data/price_information?isin=' + encodeURIComponent(isin) + '&mic=XFRA';
    const text = await nodeFetch(url, { 'X-Client-TraceId': Math.random().toString(36).slice(2), 'X-Security': '' });
    const data = JSON.parse(text);
    if (data?.lastPrice && typeof data.lastPrice.value === 'number') {
      return {
        symbol: isin,
        kurs: data.lastPrice.value,
        vortag: data?.previousClose?.value || data.lastPrice.value,
        waehrung: data?.currency || 'EUR',
        aktualisiert: new Date().toISOString(),
        name: data?.instrumentName || isin,
        _source: 'boerse-frankfurt',
      };
    }
  } catch (err) { /* try next */ }
  return null;
}

// ── Stooq erweitert (mehrere Suffixe ausprobieren) ───────────────────────
async function tryStooq(symbol) {
  if (!symbol) return null;
  const base = symbol.toLowerCase().split('.')[0];
  const suffixes = symbol.includes('.') 
    ? [symbol.toLowerCase(), base + '.us', base + '.de']
    : [symbol.toLowerCase() + '.us', symbol.toLowerCase() + '.de', symbol.toLowerCase()];
  for (const sym of suffixes) {
    try {
      const url = 'https://stooq.com/q/l/?s=' + encodeURIComponent(sym) + '&f=sd2t2ohlcv&h&e=csv';
      const text = await nodeFetch(url);
      const lines = text.trim().split('\n');
      if (lines.length < 2) continue;
      const cols = lines[1].split(',');
      if (cols.length < 7) continue;
      const close = parseFloat(cols[6]);
      const open = parseFloat(cols[3]);
      if (!isFinite(close) || close <= 0 || isNaN(close)) continue;
      return {
        symbol: symbol,
        kurs: close,
        vortag: open,
        waehrung: sym.endsWith('.us') ? 'USD' : 'EUR',
        aktualisiert: new Date().toISOString(),
        name: symbol,
        _source: 'stooq',
      };
    } catch (err) { /* next suffix */ }
  }
  return null;
}

// ── JustETF (Web-Scrape via ISIN - für europäische Fonds) ────────────────
async function tryJustETF(isin) {
  if (!isin || isin.length !== 12) return null;
  try {
    const url = 'https://www.justetf.com/api/etfs/' + encodeURIComponent(isin) + '/quote?locale=de&currency=EUR';
    const text = await nodeFetch(url);
    const data = JSON.parse(text);
    const price = data?.latestQuote?.raw;
    if (typeof price === 'number' && price > 0) {
      return {
        symbol: isin,
        kurs: price,
        vortag: data?.previousQuote?.raw || price,
        waehrung: data?.currency || 'EUR',
        aktualisiert: new Date().toISOString(),
        name: data?.name || isin,
        _source: 'justetf',
      };
    }
  } catch (err) { /* try next */ }
  return null;
}

// ── CoinGecko für Krypto (kostenlos, kein Key) ───────────────────────────
async function tryCoingecko(symbol) {
  if (!symbol) return null;
  const sym = symbol.toLowerCase().replace(/-eur$|-usd$/, '');
  const idMap = { btc: 'bitcoin', eth: 'ethereum', sol: 'solana', ada: 'cardano', dot: 'polkadot', xrp: 'ripple', doge: 'dogecoin', ltc: 'litecoin', bnb: 'binancecoin', matic: 'matic-network' };
  const id = idMap[sym] || sym;
  const vs = symbol.toLowerCase().includes('-usd') ? 'usd' : 'eur';
  try {
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=' + id + '&vs_currencies=' + vs + '&include_24hr_change=true';
    const text = await nodeFetch(url);
    const data = JSON.parse(text);
    const entry = data[id];
    if (entry && typeof entry[vs] === 'number') {
      return {
        symbol,
        kurs: entry[vs],
        vortag: entry[vs] / (1 + (entry[vs + '_24h_change'] || 0) / 100),
        waehrung: vs.toUpperCase(),
        aktualisiert: new Date().toISOString(),
        name: symbol,
        _source: 'coingecko',
      };
    }
  } catch (err) { /* try next */ }
  return null;
}


// ── Fonds-NAV per ISIN (klassische/aktive Fonds, die Yahoo oft nicht führt) ─
async function tryFondsNAV(isin) {
  if (!isin || isin.length !== 12) return null;
  // Börse Frankfurt: master_data + quote für Fondsanteilswert (NAV)
  for (const mic of ['XFRA', 'XETR']) {
    try {
      const url = 'https://api.boerse-frankfurt.de/v1/data/quote_box/single?isin='
                + encodeURIComponent(isin) + '&mic=' + mic;
      const text = await nodeFetch(url, {
        'Origin': 'https://www.boerse-frankfurt.de',
        'Referer': 'https://www.boerse-frankfurt.de/',
        'X-Client-TraceId': Math.random().toString(36).slice(2),
        'X-Security': '',
      });
      const data = JSON.parse(text);
      const kurs = (data && (data.lastPrice ?? data.nav ?? data.value));
      const k = typeof kurs === 'object' ? kurs && kurs.value : kurs;
      if (typeof k === 'number' && k > 0) {
        return {
          symbol: isin,
          kurs: k,
          vortag: (data.previousClose && data.previousClose.value) || data.closingPricePrevTradingDay || k,
          waehrung: data.currency || 'EUR',
          aktualisiert: new Date().toISOString(),
          name: data.instrumentName || data.name || isin,
          _source: 'boerse-frankfurt-nav:' + mic,
        };
      }
    } catch (err) { /* nächster MIC */ }
  }
  return null;
}

ipcMain.handle('fetch-quote', async (e, symbol, isin) => {
  if (!symbol && !isin) return null;
  let r;
  // Krypto erkennen → CoinGecko (zuverlässig)
  if (symbol && (symbol.includes('-EUR') || symbol.includes('-USD') || /^(BTC|ETH|SOL|ADA|DOT|XRP|DOGE|LTC|BNB|MATIC)/i.test(symbol))) {
    r = await tryCoingecko(symbol);
    if (r) return r;
  }
  // 1. Yahoo mit Original-Symbol
  if (symbol) {
    r = await tryYahooChart(symbol);
    if (r) return r;
    // 2. Yahoo mit normalisiertem Symbol (.Xetra → .DE, .LX → .L, etc.)
    const normalized = normalizeSymbol(symbol);
    if (normalized !== symbol) {
      r = await tryYahooChart(normalized);
      if (r) return r;
    }
    // 3. Yahoo mit Basis-Symbol
    if (symbol.includes('.')) {
      const base = symbol.split('.')[0];
      r = await tryYahooChart(base);
      if (r) return r;
    }
  }
  // 4. Börse Frankfurt (excellent für DE/EU mit ISIN)
  if (isin) {
    r = await tryBoerseFrankfurt(isin);
    if (r) { if (symbol) r.symbol = symbol; return r; }
  }
  // 5. JustETF (excellent für LU-Fonds + europäische ETFs mit ISIN)
  if (isin) {
    r = await tryJustETF(isin);
    if (r) { if (symbol) r.symbol = symbol; return r; }
  }
  // 5b. Fonds-NAV (klassische/aktive Fonds per ISIN)
  if (isin) {
    r = await tryFondsNAV(isin);
    if (r) { if (symbol) r.symbol = symbol; return r; }
  }
  // 6. Yahoo-Search mit ISIN → Symbol → Chart
  if (isin) {
    const foundSym = await tryYahooSearch(isin);
    if (foundSym) {
      r = await tryYahooChart(foundSym);
      if (r) { r.symbol = symbol || foundSym; return r; }
    }
  }
  // 7. Stooq erweitert
  if (symbol) {
    r = await tryStooq(symbol);
    if (r) return r;
  }
  // 8. Legacy stooq inline (alter Code)
  if (symbol) try {
    let stooqSym = symbol.toLowerCase();
    if (!stooqSym.includes('.')) stooqSym += '.us';
    else if (stooqSym.endsWith('.as')) stooqSym = stooqSym.replace('.as', '.nl');
    const url = 'https://stooq.com/q/l/?s=' + encodeURIComponent(stooqSym) + '&f=sd2t2ohlcv&h&e=csv';
    const text = await nodeFetch(url);
    const lines = text.trim().split('\n');
    if (lines.length >= 2) {
      const cols = lines[1].split(',');
      if (cols.length >= 7) {
        const close = parseFloat(cols[6]);
        const open = parseFloat(cols[3]);
        if (isFinite(close) && close > 0) {
          return {
            symbol,
            kurs: close,
            vortag: open,
            waehrung: stooqSym.endsWith('.us') ? 'USD' : 'EUR',
            aktualisiert: new Date().toISOString(),
            name: symbol,
            _source: 'stooq',
          };
        }
      }
    }
  } catch (err) { /* failed */ }
  return null;
});

ipcMain.handle('fetch-search', async (e, query) => {
  if (!query) return [];
  try {
    const url = 'https://query2.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(query) + '&quotesCount=15';
    const text = await nodeFetch(url);
    const data = JSON.parse(text);
    return (data.quotes || []).filter(q => q.symbol && q.symbol.trim() &&
      (q.quoteType === 'EQUITY' || q.quoteType === 'ETF' || q.quoteType === 'MUTUALFUND' || q.quoteType === 'CRYPTOCURRENCY')
    );
  } catch (err) {
    return [];
  }
});

ipcMain.handle('fetch-quote-at-date', async (e, symbol, dateStr) => {
  if (!symbol || !dateStr) return null;
  try {
    const date = new Date(dateStr);
    const start = Math.floor(date.getTime() / 1000);
    const end = start + 86400 * 7;
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) +
                '?period1=' + start + '&period2=' + end + '&interval=1d';
    const text = await nodeFetch(url);
    const data = JSON.parse(text);
    const prices = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    return prices?.find(p => p !== null && p !== undefined) ?? null;
  } catch (err) {
    return null;
  }
});

// ── ROBUSTES SPEICHERN & LADEN ──────────────────────────────────────────────
// Sicheres Speichern: erst in temporäre Datei schreiben, prüfen, dann atomar
// umbenennen. Vorher die bisherige Datei als .prev sichern. So kann ein Absturz
// mitten im Schreiben die Hauptdatei nicht zerstören.
function safeSaveData(content) {
  const target = dp();
  const tmp = target + '.tmp';
  const prev = target + '.prev';
  // 1) In temporäre Datei schreiben und sofort verifizieren
  fs.writeFileSync(tmp, content, 'utf8');
  const check = fs.readFileSync(tmp, 'utf8');
  JSON.parse(check); // wirft, falls ungültig -> Abbruch, Hauptdatei bleibt heil
  // 2) Bisherige gültige Datei als .prev sichern
  try { if (fs.existsSync(target)) fs.copyFileSync(target, prev); } catch {}
  // 3) Atomar ersetzen (Umbenennen ist auf demselben Laufwerk atomar)
  fs.renameSync(tmp, target);
  return true;
}

// Robustes Laden: Hauptdatei → bei Defekt .prev → bei Defekt neuestes Backup.
function safeLoadData() {
  const target = dp();
  const prev = target + '.prev';
  function tryRead(p) {
    try {
      if (!fs.existsSync(p)) return null;
      const txt = fs.readFileSync(p, 'utf8');
      JSON.parse(txt); // Gültigkeit prüfen
      return txt;
    } catch { return null; }
  }
  // 1) Hauptdatei
  let data = tryRead(target);
  if (data !== null) return { data, source: 'main' };
  // 2) .prev (letzter guter Stand vor dem letzten Speichern)
  data = tryRead(prev);
  if (data !== null) {
    try { fs.copyFileSync(prev, target); } catch {} // Hauptdatei wiederherstellen
    return { data, source: 'prev' };
  }
  // 3) Neuestes Backup aus dem eingestellten Backup-Ordner (falls bekannt)
  try {
    const cfgRaw = tryRead(target); // (target ist kaputt, aber evtl. lesbar für backupPath?)
  } catch {}
  return { data: null, source: 'none' };
}

ipcMain.handle('open-external', async (_e, url) => {
  try {
    // Nur sichere Schemata zulassen (mailto, http, https)
    if (typeof url === 'string' && /^(mailto:|https?:)/i.test(url)) {
      await shell.openExternal(url);
      return { ok: true };
    }
    return { ok: false, reason: 'ungültiges Schema' };
  } catch (e) { return { ok: false, reason: e.message }; }
});

ipcMain.handle('load-data', () => {
  const r = safeLoadData();
  // Signalisiere dem Renderer, wenn aus einer Sicherung wiederhergestellt wurde.
  if (r.source === 'prev') {
    try { if (win && win.webContents) win.webContents.send('data-recovered', { source: 'prev' }); } catch {}
  }
  return r.data;
});

ipcMain.handle('save-data', (_, d) => {
  try {
    // Nur speichern, wenn gültiges JSON übergeben wurde (schützt vor Leerschreiben).
    JSON.parse(d);
    return safeSaveData(d);
  } catch (e) {
    console.error('save-data abgelehnt (ungültiges JSON):', e.message);
    return false;
  }
});

ipcMain.handle('open-files', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Kontoauszüge', filters: [{ name: 'Dateien', extensions: ['pdf','csv','txt'] }],
    properties: ['openFile','multiSelections']
  });
  if (r.canceled) return [];
  return r.filePaths.map(p => ({ name: path.basename(p), path: p, size: fs.statSync(p).size }));
});

ipcMain.handle('read-file', (_, fp) => {
  const buf = fs.readFileSync(fp);
  return fp.toLowerCase().endsWith('.pdf') ? { type:'base64', data:buf.toString('base64') } : { type:'text', data:buf.toString('utf8') };
});

ipcMain.handle('get-version', () => app.getVersion());

// User data lives ONLY in userData/data.json - never hardcoded in app code.
// Fresh install = empty data file = welcome screen shows automatically.

ipcMain.handle('open-data-folder', () => {
  const dp = path.join(app.getPath('userData'));
  shell.openPath(dp);
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Backup-Ordner auswählen',
  });
  if (result.canceled || !result.filePaths.length) return null;
  return { path: result.filePaths[0] };
});

ipcMain.handle('open-folder', async (e, folderPath) => {
  try { await shell.openPath(folderPath); return { ok: true }; }
  catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('write-backup', async (e, backupPath, content) => {
  try {
    if (!fs.existsSync(backupPath)) fs.mkdirSync(backupPath, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = path.join(backupPath, 'backup-' + ts + '.json');
    fs.writeFileSync(filename, content, 'utf8');

    // Aufräumen: nur die 5 neuesten Backups behalten, ältere löschen.
    // Sicherheit: NUR Dateien mit dem Backup-Namensmuster werden angefasst.
    let removed = [];
    try {
      const KEEP = 5;
      const isBackup = n => /^backup-.*\.json$/i.test(n);
      const files = fs.readdirSync(backupPath)
        .filter(isBackup)
        .map(n => ({ name: n, full: path.join(backupPath, n), t: fs.statSync(path.join(backupPath, n)).mtimeMs }))
        .sort((a, b) => b.t - a.t); // neueste zuerst
      const toDelete = files.slice(KEEP);
      for (const f of toDelete) {
        try { fs.unlinkSync(f.full); removed.push(f.name); } catch {}
      }
    } catch (cleanupErr) {
      // Aufräum-Fehler darf das Backup selbst nicht scheitern lassen
      console.warn('Backup-Aufräumen fehlgeschlagen:', cleanupErr.message);
    }
    return { ok: true, path: filename, removed };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('fetch-url', async (event, url) => {
  try {
    return await new Promise((resolve, reject) => {
      const opts = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json,text/plain,*/*',
          'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
        },
        timeout: 8000,
      };
      const req = https.get(url, opts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return https.get(res.headers.location, opts, (res2) => {
            let data = '';
            res2.on('data', c => data += c);
            res2.on('end', () => resolve({ ok: res2.statusCode === 200, status: res2.statusCode, body: data }));
          }).on('error', reject);
        }
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ ok: res.statusCode === 200, status: res.statusCode, body: data }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Print HTML to PDF
ipcMain.handle('print-to-pdf', async (_, { html, filename }) => {
  const { BrowserWindow, dialog } = require('electron');
  const path = require('path');
  const os = require('os');
  const fs = require('fs');

  // Save dialog first
  const result = await dialog.showSaveDialog(win, {
    title: 'Jahresbericht speichern',
    defaultPath: path.join(require('os').homedir(), 'Documents', filename),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (result.canceled) return false;

  // Create hidden window to render HTML
  const pdfWin = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
  const tmpHtml = path.join(os.tmpdir(), 'jahresbericht_tmp.html');
  fs.writeFileSync(tmpHtml, html, 'utf8');
  await pdfWin.loadFile(tmpHtml);

  // Print to PDF
  const pdfData = await pdfWin.webContents.printToPDF({
    pageSize: 'A4',
    printBackground: true,
    margins: { marginType: 'default' }
  });
  pdfWin.close();
  fs.writeFileSync(result.filePath, pdfData);
  fs.unlinkSync(tmpHtml);
  require('electron').shell.openPath(result.filePath);
  return true;
});

// Create desktop shortcut (Windows .bat)
ipcMain.handle('create-shortcut', async () => {
  try {
    const appDir = path.dirname(path.dirname(__dirname)); // folder containing fp2
    const desktopPath = path.join(require('os').homedir(), 'Desktop');
    const batPath = path.join(desktopPath, 'Finanzverwaltung.bat');
    const batContent = `@echo off\ncd /d "${appDir}"\nstart "" /B npx electron . --no-console\n`;
    fs.writeFileSync(batPath, batContent);

    // Also create a VBS wrapper so no CMD window flashes
    const vbsPath = path.join(desktopPath, 'Finanzverwaltung.vbs');
    const vbsContent = `Set WshShell = CreateObject("WScript.Shell")\nWshShell.Run "cmd /c cd /d ""${appDir}"" && npx electron .", 0, False\n`;
    fs.writeFileSync(vbsPath, vbsContent);
    return { ok: true, path: vbsPath };
  } catch(e) { return { ok: false, error: e.message }; }
});
