# Finanzverwaltung Pro

Deutschsprachige **Electron-Desktop-App** zur privaten Finanzverwaltung – Einnahmen/Ausgaben, Fixkosten, Sparen & Depot mit Live-Kursen (ETFs, Aktien, Krypto), Mehrjahres-Verwaltung, Zählerstände und lokale Backups.Zählerstände erfassen und eigene Tabellen anlegen. 

> **Datenschutz:** Alle Daten bleiben lokal (`%APPDATA%\finanzverwaltung-pro\data.json`). Keine Cloud, kein Tracking.

## Schnellstart

```bash
npm install     # einmalig
npm start       # App starten
npm run build   # Windows-Installer (.exe) bauen → dist/
```

Benötigt Node.js + npm. Getestet unter Windows (x64).

## Projektstruktur

```
fp3/
├── package.json          # Electron-Konfiguration + Build-Settings
├── README.md             # Diese Datei (Entwickler-Doku)
├── LICENSE
└── src/
    ├── main.js           # Electron Main-Process (IPC, Kurs-Quellen, Persistenz)
    ├── preload.js        # Bridge Main ↔ Renderer (window.EA)
    ├── index.html        # UI-Skelett + Modals
    ├── app.js            # Gesamte Anwendungslogik
    └── styles.css        # Theme + Layout
```

> ℹ️ Die ausführliche Architektur-, Datenmodell- und Bug-Historie-Dokumentation folgt unten.

---

# Finanzverwaltung Pro – Entwickler-Dokumentation

> **Für KI-Assistenten und Entwickler, die an dieser App arbeiten.**
> Dieses Dokument beschreibt **alles** was du wissen musst, bevor du Änderungen machst – Architektur, kritische Regeln, gefährliche Stolperfallen und alle in der Vergangenheit bereits gefundenen Bugs.

---

## 1. Was ist die App?

**Finanzverwaltung Pro** ist eine deutschsprachige **Electron-Desktop-Anwendung** für persönliche Finanzverwaltung – mit Schwerpunkt auf:

- **Einnahmen/Ausgaben-Tracking** (Einkäufe, Ausgaben, Einnahmen, Spesen)
- **Fixkosten** (monatliche Wiederkehr, Gültigkeitszeiträume)
- **Sparen & Depot** (Bargeld + ETFs + Einzelaktien + Krypto, mit Live-Kursen)
- **Mehrjahres-Verwaltung** (jedes Jahr eigener Datenkontext + Startguthaben)
- **Zählerstände** (Strom, Wasser, Gas → Verbrauchsberechnung)
- **Backup & Datenexport** (lokal als JSON)

**Benutzer:** Marco Conrad (PayPal-Spendenadresse hardcoded in Settings: `marco.conrad00@gmail.com`)

**Sprache:** Komplett deutsch (UI, Codekommentare gemischt, Variablennamen deutsch+englisch).

**Plattform:** Windows (primär), als `.exe` ausgeliefert über `electron-builder`.

---

## 2. Verzeichnisstruktur

```
fp3/
├── package.json          # Electron-Konfiguration + Build-Settings
├── README.md             # Diese Datei
└── src/
    ├── main.js           # Electron Main-Process (Node.js, ~460 Zeilen)
    ├── preload.js        # Bridge zwischen Main und Renderer (~20 Zeilen)
    ├── index.html        # UI-Skelett + alle Modal-Definitionen (~612 Zeilen)
    ├── app.js            # GESAMTE Anwendungslogik (~5150 Zeilen)
    └── styles.css        # Theme + Layout (~505 Zeilen)
```

**Daten-Persistenz:** `%APPDATA%\finanzverwaltung-pro\data.json` (Windows)
- In Code: `app.setPath('userData', ...)` in `main.js`
- Backups landen in benutzerdefiniertem Pfad als `backup-<timestamp>.json`

---

## 3. Tech-Stack

- **Electron** (BrowserWindow + IPC)
- **Vanilla JavaScript** im Renderer (keine Frameworks, keine Build-Tools, keine Bundler)
- **Node.js `https`** im Main-Process für externe API-Calls
- **`electron-builder`** für `.exe`-Erstellung
- **`xlsx`** Library für Excel-Import (per CDN in index.html)

**Bewusst NICHT verwendet:** React, Vue, TypeScript, Webpack, Tailwind. Der Code ist absichtlich „vanilla" und framework-frei, damit Änderungen schnell ohne Build-Step funktionieren.

---

## 4. KRITISCHE REGELN – NIEMALS BRECHEN

### 4.1 IPC-Handler MÜSSEN auf Top-Level registriert werden

```javascript
// FALSCH (führt zu "No handler registered for 'X'"):
ipcMain.handle('outer', async () => {
  ipcMain.handle('inner', ...);  // Wird nie registriert ohne outer-Call!
});

// RICHTIG:
ipcMain.handle('outer', async () => { ... });
ipcMain.handle('inner', async () => { ... });
```

Dieser Bug ist bereits **dreimal** in der Geschichte aufgetreten. Beim Einfügen neuer Handler IMMER prüfen, dass sie außerhalb anderer Funktionen stehen.

### 4.2 `contextIsolation: false` ist Pflicht

In `main.js`:
```javascript
webPreferences: { preload: ..., contextIsolation: false, nodeIntegration: false }
```

Wenn du das änderst, brechen ALLE `onclick="funcName()"`-Handler in der App, weil dann `funcName` nicht mehr im `window`-Scope ist.

### 4.3 UUIDs in `onclick`-Attributen MÜSSEN gequotet werden

```javascript
// FALSCH (UUIDs werden als JS-Ausdruck interpretiert → Subtraktion!):
`<button onclick="deleteFixk(${f.id})">×</button>`

// RICHTIG:
`<button onclick="deleteFixk('${f.id}')">×</button>`
```

Bug bereits aufgetreten bei: `deleteFixk`, `updateFixk`, `deleteSpar`, `updateSparen`, `editSparenEntry`, `selectWertpapier`, etc.

### 4.4 `monthsBetween()` MUSS timezone-safe sein

```javascript
// FALSCH (in Berlin TZ: Januar doppelt, Dezember fehlt):
const monthsBetween = (from, to) => {
  let d = new Date(from + '-01');  // UTC!
  d = new Date(d.getFullYear(), d.getMonth()+1, 1);  // LOKAL!
  // Mischt UTC und Lokal → Off-by-one-Fehler
};

// RICHTIG (rein numerisch, keine Date-Objekte):
const monthsBetween = (from, to) => {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const r = [];
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    r.push(y + '-' + String(m).padStart(2, '0'));
    m++; if (m > 12) { m = 1; y++; }
  }
  return r;
};
```

### 4.5 Yahoo Finance blockiert Server-IPs (und CORS-Proxies)

Yahoo Finance (`query1/query2.finance.yahoo.com`) gibt **HTTP 403** zurück für:
- Direkte Requests aus dem Browser (CORS-Blocker)
- Alle bekannten CORS-Proxies (corsproxy.io, allorigins.win, codetabs, cors.sh, thingproxy)

**Lösung:** Anfragen MÜSSEN über den **Electron Main-Process** laufen mit korrekten Browser-Headers (User-Agent, Origin, Referer, sec-ch-ua). Dann gehen sie von der **Privat-IP** des Benutzers raus und werden durchgelassen.

Siehe `main.js` → `nodeFetch()` und `ipcMain.handle('fetch-quote', ...)`.

### 4.6 `main.js`-Änderungen brauchen App-Neustart

`Strg+R` lädt nur den Renderer neu. Wenn `main.js` oder `preload.js` geändert wurden, MUSS die App komplett geschlossen (`Strg+W` oder Fenster-X) und mit `npm start` neu gestartet werden.

### 4.7 Doppelte Funktionsdefinitionen vermeiden

```javascript
// FALSCH:
async function clearAllData() { ... uiConfirm ... }
// ... 500 Zeilen später ...
function clearAllData() { ... confirm() ... }  // ÜBERSCHREIBT die obere!
```

Beim Hinzufügen neuer Funktionen IMMER mit `grep -n "function NAME"` prüfen, ob sie bereits existiert. Die zweite Definition gewinnt – das hat in der Vergangenheit „App komplett zurücksetzen" mit native Browser-Dialog gezeigt statt mit der App-Modal.

---

## 5. Datenmodell (`state`)

Der gesamte App-State liegt in einer globalen JS-Variable `state` und wird als JSON nach `%APPDATA%\finanzverwaltung-pro\data.json` geschrieben.

### 5.1 Top-Level Struktur (v3 Multi-Year-Schema)

```javascript
state = {
  // ── GLOBALE DATEN (jahresübergreifend) ──
  meta: {
    schemaVersion: 3,
    userName: 'Marco',
    setupDone: true,
    year: 2026,            // aktuell ausgewähltes Jahr
    _lastKursRefresh: 1234567890123,  // Timestamp letzter Kurs-Update
  },
  config: {
    currency: 'EUR',
    locale: 'de-DE',
    theme: 'dark',         // 'light' | 'dark'
    startPage: 'dashboard',
    autoBackup: false,
    backupPath: 'C:\\...',
    backupInterval: 'weekly',  // 'daily' | 'weekly' | 'monthly'
    showStartupModal: false,
  },
  customCats: {            // Benutzerdefinierte Kategorien
    ausgabe: ['Tierarzt', ...],
    einnahme: ['Gutschein', ...],
    einkauf: ['Werkzeug', ...],
  },
  trash: [...],            // 30-Tage-Papierkorb für gelöschte Einträge
  imports: [...],          // Historie der Excel-Imports
  etfKurse: {              // Cache der zuletzt abgerufenen Live-Kurse
    'AAPL': { symbol, kurs, vortag, waehrung, aktualisiert, name, _source }
  },
  transactions: [...],     // (noch nicht aktiv genutzt, Platzhalter)
  yearEditUnlocked: false, // Erlaubt Bearbeitung in abgeschlossenen Jahren
  backupHistory: [...],

  // ── JAHRES-SPEZIFISCHE DATEN ──
  years: {
    2026: {
      status: 'active',    // 'active' | 'closed' | 'planned'
      startBalance: 5000,  // Startguthaben dieses Jahres
      closedAt: null,
      incomeByMonth: {     // Monatliches Einkommen
        '2026-01': 3500, '2026-02': 3500, ...
      },
      einkaeufe: [...],
      ausgaben: [...],
      einnahmen: [...],
      regelEinnahmen: [...],
      spesen: [...],
      fixkosten: [...],
      sparen: [...],
      zaehler: [...],
      tabellen: [...],
      finanzprodukte: [...],
    },
    2025: { status: 'closed', ... },
  },
}
```

### 5.2 Proxy-Pattern für Jahresdaten

`state.einkaeufe`, `state.fixkosten` etc. sind **`Object.defineProperty`-Proxies**, die intern auf `getYearData()[field]` zugreifen. Das heißt:

```javascript
state.fixkosten.push({...});  // schreibt in state.years[2026].fixkosten
```

**KRITISCH:** Bei `loadData()` darf `let state = createState()` verwendet werden, **NICHT**:
```javascript
state = JSON.parse(JSON.stringify(DEFAULT_DATA));  // Zerstört die Proxies!
```

### 5.3 Sparen-Eintrag (Wertpapier-Transaktion)

```javascript
{
  id: 'uuid-1234',
  date: '2026-06-21',
  month: '2026-06',          // optional, für Auto-Eintragungen
  amount: 200.00,            // gesamt (units * price + fees)
  note: 'Optional',
  kategorie: 'ETF',          // 'Tagesgeld' | 'Festgeld' | 'ETF' | 'Aktien' | 'Krypto' | 'Sparen' | 'Sonstiges'
  depot: 'Trade Republic',

  // ── Bei Wertpapier-Transaktionen ──
  wertpapier: {
    symbol: 'SXR8.DE',
    name: 'iShares Core S&P 500 UCITS ETF',
    isin: 'IE00B5BMR087',
    wkn: 'A0YEDG',
    typ: 'etf',              // 'etf' | 'aktie' | 'fonds' | 'krypto'
  },
  txType: 'kauf',            // 'kauf' | 'verkauf' | 'bestand'
  units: 12.2289,            // negative bei Verkauf
  price: 114.99,
  fees: 0,
  skipCashflow: false,       // true bei Bestand-Übernahme (historisch, zählt nicht im Cashflow)
  autoFromFixkostenId: null, // ID der Fixkosten, die diesen Eintrag automatisch erstellt hat

  // ── Legacy-Felder (Kompatibilität mit alten Datenbeständen) ──
  etf: {                     // Spiegelung von wertpapier für alten Code
    name: 'iShares Core S&P 500 UCITS ETF',
    ticker: 'SXR8.DE',
    isin: 'IE00B5BMR087',
    wkn: 'A0YEDG',
  }
}
```

### 5.4 Fixkosten-Eintrag (mit Sparplan-Verknüpfung)

```javascript
{
  id: 'uuid-5678',
  name: 'Netflix',
  category: 'Abos',          // Anzeige-Kategorie
  cat: 'Abos',               // Legacy-Spiegelung
  amount: 17.99,
  day: 15,                   // Fälligkeit (Tag des Monats)
  start: '2026-01',          // Gültig von (YYYY-MM)
  end: '2026-12',            // Gültig bis (YYYY-MM)

  // ── Bei category='Sparen' mit Sparplan-Verknüpfung ──
  sparenLink: {
    sparTyp: 'etf',          // 'bargeld' | 'etf' | 'aktie' | 'krypto'
    source: 'cashflow',      // 'cashflow' | 'startgeld'
    symbol: 'SXR8.DE',
    name: 'iShares Core S&P 500',
    isin: 'IE00B5BMR087',
  }
}
```

---

## 6. IPC-Handler (Main-Renderer Bridge)

Alle in `main.js` registriert, alle exposed via `preload.js → window.EA`:

| Handler | Args | Beschreibung |
|---|---|---|
| `load-data` | – | Lädt `data.json` als String |
| `save-data` | data | Schreibt `data.json` |
| `open-files` | – | File-Open-Dialog (für Excel-Import) |
| `read-file` | path | Liest Datei als Buffer |
| `get-version` | – | App-Version aus package.json |
| `open-data-folder` | – | Öffnet `%APPDATA%\finanzverwaltung-pro` im Explorer |
| `select-folder` | – | Folder-Pick-Dialog (für Backup-Pfad) |
| `open-folder` | path | Öffnet beliebigen Ordner |
| `write-backup` | path, content | Schreibt `backup-<timestamp>.json` in `path` |
| `fetch-url` | url | Generischer HTTP-Fetch mit Browser-Headers |
| `fetch-quote` | symbol, isin | Wertpapier-Kurs aus 8 Datenquellen |
| `fetch-search` | query | Wertpapier-Suche via Yahoo |
| `fetch-quote-at-date` | symbol, date | Historischer Kurs zu bestimmtem Datum |
| `print-to-pdf` | { html, filename } | HTML → PDF Druck |
| `create-shortcut` | – | Desktop-Verknüpfung erstellen |

### Preload-Layer

`preload.js` exposiert diese als `window.EA.<funcName>()`:
```javascript
window.EA = {
  loadData:         () => ipcRenderer.invoke('load-data'),
  saveData:         (d) => ipcRenderer.invoke('save-data', d),
  fetchQuote:       (sym, isin) => ipcRenderer.invoke('fetch-quote', sym, isin),
  // ... etc
};
```

---

## 7. Wertpapier-System (Kern-Feature)

### 7.1 Architektur-Übersicht

Die Wertpapier-Funktionalität (Yahoo-Sucher, Live-Kurse, ETF/Aktien-Tracking) ist auf 3 Schichten verteilt:

```
┌─────────────────────────────────────────────────────┐
│ RENDERER (app.js)                                   │
│  ├ openSparenModal()        – UI                    │
│  ├ saveSparenModal()        – Speichern             │
│  ├ buildEtfLiveSection()    – Depot-Karten          │
│  ├ refreshAllWertpapierKurse() – Manueller Refresh  │
│  ├ maybeAutoRefreshKurse()  – Daily Auto-Refresh    │
│  ├ fetchWertpapierKurs()    – Thin wrapper → EA     │
│  └ searchWertpapier()       – Lokale DB + Yahoo     │
│           ↓ via window.EA                            │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│ PRELOAD (preload.js)                                │
│  exposes fetchQuote, fetchSearch, fetchQuoteAtDate  │
│           ↓ via ipcRenderer.invoke                   │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│ MAIN (main.js)                                      │
│  ├ nodeFetch()              – Native HTTPS          │
│  ├ tryYahooChart()                                  │
│  ├ tryYahooSearch()                                 │
│  ├ tryBoerseFrankfurt()                             │
│  ├ tryJustETF()                                     │
│  ├ tryStooq()                                       │
│  ├ tryCoingecko()                                   │
│  └ ipcMain.handle('fetch-quote', ...)               │
│           ↓ via https.get with browser headers       │
└─────────────────────────────────────────────────────┘
```

### 7.2 Lokale Wertpapier-Datenbank

`WERTPAPIER_DB` in `app.js` enthält **~60 vorgefertigte Einträge** mit korrekten Symbol+ISIN+WKN-Mappings:

- **S&P 500 ETFs:** SXR8.DE, VUAA.DE, XDPP.DE, IUSA.DE
- **MSCI World ETFs:** EUNL.DE, XDWD.DE, IWDA.AS
- **FTSE All-World:** VWCE.DE, VWRL.AS
- **Nasdaq:** EQQQ.DE, SXRV.DE
- **Emerging Markets:** IS3N.DE
- **DAX/STOXX:** EXS1.DE, DBXD.DE, EXW1.DE
- **Small Cap/Gold:** IUSN.DE, 4GLD.DE
- **US-Aktien:** AAPL, MSFT, GOOGL, AMZN, META, TSLA, NVDA, NFLX, BRK-B, JPM, V, MA, DIS, KO, MCD, JNJ, PG, WMT, XOM, AMD, INTC, PYPL, CRM, BA
- **DAX 40:** SAP.DE, SIE.DE, ALV.DE, DTE.DE, BAS.DE, BMW.DE, MBG.DE, VOW3.DE, DBK.DE, CBK.DE, BAY.DE, ADS.DE, PUM.DE, P911.DE, IFX.DE, AIR.DE, RWE.DE, MUV2.DE, EOAN.DE
- **Krypto:** BTC-EUR, ETH-EUR, BTC-USD, ETH-USD

Diese DB ist die **primäre Suchquelle** – funktioniert immer, auch offline. Yahoo-Suche kommt nur als sekundärer Fallback (oft blockiert).

**Erweitern:** Einfach neue Objekte in `WERTPAPIER_DB`-Array einfügen. Format:
```javascript
{ symbol: 'XXX.DE', name: '...', isin: '...', wkn: '...', typ: 'etf', tags: ['s&p500', 'usa', ...] }
```

### 7.3 Live-Kurs Multi-Source-Strategie

Bei `fetchWertpapierKurs(symbol, isin)` wird folgende Reihenfolge probiert (siehe `main.js → fetch-quote`):

| # | Quelle | Wann besonders gut |
|---|---|---|
| 1 | **CoinGecko** (nur Krypto) | BTC, ETH, etc. mit `-EUR`/`-USD` Suffix |
| 2 | **Yahoo** Original-Symbol | Standard für alle gängigen Tickers |
| 3 | **Yahoo** normalisiert | `.Xetra→.DE`, `.LX→.L`, `.FRA→.F`, `.MIL→.MI`, `.SWX→.SW`, `.LON→.L`, `.PAR→.PA`, `.XET→.DE` |
| 4 | **Yahoo** ohne Suffix | Falls Yahoo das nackte Symbol kennt |
| 5 | **Börse Frankfurt** mit ISIN | Hervorragend für DE/EU-Fonds |
| 6 | **JustETF** mit ISIN | Hervorragend für LU-Fonds |
| 7 | **Yahoo-Search** → Symbol → Chart | Fallback wenn ISIN bekannt ist |
| 8 | **Stooq** | US-Aktien-Fallback |

Jede Quelle hat eine `tryXxx()`-Funktion in `main.js`. Wenn eine antwortet (`return { kurs, ... }`), bricht die Kette ab. Wenn alle scheitern: `null` → User sieht Modal „Kurse nicht abrufbar".

### 7.4 Manuelle Kurs-Eingabe als finale Rückfallebene

Pro Depot-Karte gibt es einen **„✎ Kurs"**-Button (`setManualPrice()`), der ein kleines Modal öffnet, in dem der User den aktuellen Kurs manuell eintragen kann. Wird in `state.etfKurse[symbol]` mit `_manual: true` gespeichert.

### 7.5 Sparplan ↔ Fixkosten-Verknüpfung

**Workflow:**
1. User legt Kauf in „Sparen & Depot" an (z.B. 200€ S&P 500 ETF)
2. Nach dem Speichern fragt App: „Soll dieses Wertpapier auch als monatlicher Sparplan angelegt werden?"
3. Bei „Ja" öffnet sich das `sparplanModal` mit Zeitraum + Quelle (cashflow/startgeld)
4. Nach Bestätigung wird ein **Fixkosten-Eintrag mit `sparenLink`** erstellt
5. Bei jedem Monatswechsel/App-Start läuft `runSparenAutoEintragung()`:
   - Iteriert über alle Fixkosten mit `sparenLink`
   - Erstellt für jeden Monat im Gültigkeitszeitraum (bis heute) einen Sparen-Eintrag
   - Holt historischen Kurs zum Monatsersten via `fetchWertpapierKursAtDate()`
   - Verwendet `autoFromFixkostenId` als Marker, um Duplikate zu vermeiden

**Duplikat-Schutz:** Bevor ein Auto-Eintrag erstellt wird, prüft die Funktion:
- Existiert bereits ein Eintrag mit `autoFromFixkostenId === f.id` und gleichem Monat? → Überspringen
- Existiert ein manueller Eintrag mit gleichem Symbol UND gleichem Monat? → Überspringen (verhindert Doppelung bei direkt vorher gemachtem Kauf)

### 7.6 Auto-Refresh beim App-Start

`maybeAutoRefreshKurse()` läuft 2,5 Sekunden nach App-Start, nur wenn:
- Mindestens ein Wertpapier im Depot ist
- Letztes Refresh > 8 Stunden her (`state.meta._lastKursRefresh`)

Verhindert API-Spam bei mehrfachem App-Start innerhalb desselben Tages.

---

## 8. UI-Komponenten und Modal-System

### 8.1 Custom Modal-Helpers

Statt nativen `confirm()`/`alert()` (die in Electron weiße System-Dialoge zeigen) gibt es:

- **`uiConfirm({ title, icon, message, details, danger, okLabel, cancelLabel })`** – Bestätigungs-Dialog mit OK/Abbrechen
- **`uiAlert({ title, icon, message })`** – Info-Dialog nur mit OK

Beide nutzen die `.modal`-CSS-Klasse mit `var(--surface)`-Hintergrund (dezenter als `--paper`). Enter = OK, Esc = Cancel.

### 8.2 Modal-CSS-Architektur

```css
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.5);
  display: flex; align-items: flex-start;   /* WICHTIG: flex-start, NICHT center */
  overflow-y: auto;                          /* Overlay scrollt, nicht das Modal */
  padding: 20px;
}
.modal {
  background: var(--surface);               /* Dezenter Look */
  margin: auto;
  /* KEIN max-height oder overflow */
}
```

**Warum:** Bei `align-items: center` mit `max-height: 90vh` und langem Inhalt wird das Modal beidseitig abgeschnitten – Footer (Speichern-Button) verschwindet. Die Lösung: das **Overlay** scrollt, das Modal wächst natürlich.

### 8.3 Theme-System

Die App hat **light** und **dark** Theme. Theme-Klasse wird am `body` gesetzt: `.theme-dark`. CSS-Variablen werden dann überschrieben:

```css
:root { --bg: #f0f4f2; --surface: #f6f8f6; --paper: #ffffff; ... }
.theme-dark { --bg: #111; --surface: #181818; --paper: #1c1c1c; ... }
```

**KRITISCH:** Wenn du Modals dynamisch in JS baust und Inline-Styles nutzt, NICHT auf `var(--text)` hoffen ohne Test – immer auch explizite Textfarbe setzen oder die `.modal`-Klasse verwenden.

### 8.4 Jahresübersicht (Multi-Year-Selector)

Topbar zeigt `<select id="yearSelector">` mit allen verfügbaren Jahren + Option „+ Neues Jahr…". Abgeschlossene Jahre zeigen 🔒-Icon.

**Lock-Mechanismus:**
- `isSelectedYearLocked()` → true wenn `status === 'closed'` und nicht `state.yearEditUnlocked`
- `requireUnlocked()` muss am Anfang aller 43 mutierenden Funktionen aufgerufen werden
- `lockBanner()` zeigt Hinweis auf 9 Seiten

---

## 9. Häufig auftretende Bugs und ihre Lösungen

### 9.1 „Cannot read properties of null/undefined"

**Ursache:** State noch nicht geladen, oder Eintrag wurde gelöscht aber UI referenziert ihn noch.
**Fix:** Optional-Chaining nutzen (`s?.wertpapier?.symbol`).

### 9.2 Modal öffnet, aber Felder leer / Speichern macht nichts

**Ursache:** UUID in onclick nicht gequotet.
**Fix:** `onclick="fn('${id}')"` statt `onclick="fn(${id})"`.

### 9.3 Live-Kurse: „API blockiert"

**Ursache:** Yahoo + Proxies blockieren, ISIN fehlt oder Symbol falsch.
**Fix-Versuche in Reihenfolge:**
1. Bei Wertpapier im Sparen-Modal Symbol nachschauen/korrigieren
2. ISIN ergänzen (wichtig für LU-Fonds)
3. Manuell „✎ Kurs"-Button nutzen

### 9.4 Cashflow zeigt falschen Wert

**Mögliche Ursachen:**
- Doppelter Sparen-Eintrag (manueller + Auto-Eintrag bei Sparplan-Erstellung) – Fix: Duplikat-Check in `runSparenAutoEintragung()`
- Bestand-Übernahme zählt mit (sollte nicht) – Fix: `skipCashflow: true` Flag
- `monthsBetween()`-Timezone-Bug – Fix: Pure numerische Implementation

### 9.5 Monats-Dropdown zeigt Januar doppelt, Dezember fehlt

**Ursache:** `monthsBetween()` mit Date-Objekt im Berlin TZ (siehe §4.4).
**Fix:** Pure numerische Implementation ohne `new Date()`.

### 9.6 „No handler registered for 'X'"

**Ursache:** IPC-Handler ist verschachtelt in einem anderen Handler (siehe §4.1).
**Fix:** Alle `ipcMain.handle()`-Aufrufe auf Top-Level verschieben.

---

## 10. Build & Distribution

```bash
# Setup (einmalig)
cd C:\path\to\fp3
npm install

# Entwicklung
npm start

# Build (.exe, MUSS als Administrator laufen)
npm run build
# Ergebnis: dist/Finanzverwaltung Pro Setup 2.0.0.exe
```

**Vor jedem Update:** Daten-Backup machen!
```bash
copy "%APPDATA%\finanzverwaltung-pro\data.json" "%APPDATA%\finanzverwaltung-pro\data-backup.json"
```

---

## 11. Wichtige Konventionen für neue Features

1. **Vor JEDER Code-Änderung:** Lies die relevante Funktion komplett, prüfe ob sie doppelt definiert ist (`grep -n "function NAME" src/app.js`).
2. **Nach Code-Änderungen:** `node --check src/app.js` und `node --check src/main.js` als Sanity-Check.
3. **Beim Hinzufügen neuer Funktionen für onclick-Handler:**
   - Stub in `index.html` hinzufügen: `function newFunc(){}` (verhindert ReferenceError vor dem Laden von app.js)
   - Export am Ende von app.js: `window.newFunc = newFunc;`
4. **Beim Erstellen neuer Modals:** Klasse `modal` nutzen, NICHT eigene Hintergründe definieren (führt zu Theme-Inkonsistenz).
5. **Bei IPC-Handler-Änderungen:** App komplett neustarten, nicht nur `Strg+R`.
6. **Workflow nach Änderungen:**
   ```bash
   node --check src/app.js
   node --check src/main.js
   zip -r FinanzverwaltungPro_vXX.zip src/
   ```

---

## 12. Roadmap / Bekannte offene Wünsche

- **Dashboard-Konfigurator** (Widgets ein/ausblenden)
- **Anhänge** (PDF/JPG) an Einträgen
- **Backup-Historie-UI** (zeigt vergangene Backups, Restore)
- **iOS-App** als PWA
- **Jahreswechsel-Assistent** (geführter Workflow am Jahresende)
- **Aktien-Empfehlungen** basierend auf bestehendem Depot
- **Dividenden-Tracking** für Aktien-Positionen

---

## 13. Bereits gelöste Bugs (Hall of Fame)

In chronologischer Reihenfolge, zur Referenz wenn ähnliche Probleme wieder auftauchen:

1. **`contextIsolation: true` brach alle Onclicks** → auf `false` fixiert
2. **`JSON.parse(JSON.stringify(DEFAULT_DATA))` zerstörte Proxies** → `createState()` verwendet
3. **`monthsBetween()` Timezone-Bug** → pure numerische Implementation
4. **Doppelte Funktionsdefinitionen** überschrieben App-Modals mit Native-Dialogen → alte Versionen entfernt
5. **`fetch-quote` Handler verschachtelt in `write-backup`** → „No handler registered" → Top-Level-Registrierung
6. **UUIDs in onclick nicht gequotet** → Subtraktion statt String-Pass → Fixkosten nicht löschbar
7. **Modal abgeschnitten** bei zu viel Inhalt → Overlay scrollt, nicht das Modal
8. **Modal-Hintergrund weiß im Dark-Mode** → `var(--surface)` statt hardcoded Farben
9. **Yahoo blockt CORS-Proxies** → Anfragen über Electron Main-Process mit Browser-Headers
10. **`SXR8.Xetra` von Yahoo nicht erkannt** → Symbol-Normalisierung + ISIN-Fallback
11. **Sparen-Eintrag doppelt bei Sparplan-Erstellung** → Duplikat-Check in `runSparenAutoEintragung`
12. **`fetchUrl` fehlte als Handler** → Backup-Code war broken, fetch-url verschachtelt

---

## 14. Tools für KI-Assistenten

Wenn du als KI an dieser App arbeitest, hier die wichtigsten Workflows:

### Workflow: Bug-Fix
```bash
# 1. Existierende Implementierung finden
grep -n "function NAME" src/app.js

# 2. Komplette Funktion lesen (mit Kontext)
sed -n '<startline>,<endline>p' src/app.js

# 3. Nach Fix: Syntax-Check
node --check src/app.js

# 4. Doppelte Definitionen prüfen
grep -c "^function NAME" src/app.js  # sollte 1 sein
```

### Workflow: Neues Feature
1. **HTML:** Modal/UI-Element in `index.html` hinzufügen
2. **Stubs:** Falls onclick auf neue JS-Funktion verweist → Stub in index.html (`function newFn(){}`)
3. **Logik:** Funktion in `app.js` schreiben
4. **Export:** Am Ende der Datei `window.newFn = newFn;`
5. **CSS:** Falls nötig, in `styles.css` (nutze CSS-Variablen, NICHT hardcoded Farben)
6. **Bei externer API:** Handler in `main.js`, Bridge in `preload.js`

### Workflow: Validate Before Commit
```bash
node --check src/app.js
node --check src/main.js
node --check src/preload.js
# Funktional testen mit npm start
```

---

**Stand:** Juni 2026 (Version 2.0.0+, intern v28)
**Letzte Sitzung:** Multi-Source-Live-Kurse (Börse Frankfurt + JustETF + CoinGecko) + Daily Auto-Refresh
