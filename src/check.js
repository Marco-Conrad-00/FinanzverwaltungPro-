#!/usr/bin/env node
/**
 * Finanzverwaltung Pro – Stabilitäts-Check
 * ════════════════════════════════════════
 * Fängt automatisch die in README §4 / §13 dokumentierten wiederkehrenden Bugs ab,
 * BEVOR sie in die App gelangen. Ausführen vor jedem Build/Commit:
 *
 *     node check.js
 *
 * Exit-Code 0 = alles ok, 1 = mindestens ein Fehler gefunden.
 *
 * Geprüft wird (alle als FEHLER, außer markiert):
 *   1. Syntax (node --check) für app.js / main.js / preload.js
 *   2. Doppelte Funktionsdefinitionen     (README §4.7 / Bug #4)
 *   3. Ungequotete UUIDs in onclick        (README §4.3 / Bug #6)
 *   4. Verschachtelte ipcMain.handle       (README §4.1 / Bug #5)
 *   5. contextIsolation: true              (README §4.2 / Bug #1)
 *   6. JSON.parse(JSON.stringify(DEFAULT)) (README §5.2 / Bug #2)
 *   7. onclick→Funktion ohne window-Export (WARNUNG)  (README §11.3)
 *
 * Pfade ggf. an deine Struktur anpassen (Konstante FILES unten).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Konfiguration ──────────────────────────────────────────────────
// Passe diese Pfade an deine echte Struktur an.
// Logikdatei = die ~5150-Zeilen-Datei, HTML = Skelett, MAIN = Electron-Main.
const ROOT = process.argv[2] || '.';
const FILES = {
  logic:   ['src/app.js', 'app.js'],          // App-Logik (Renderer)
  html:    ['src/index.html', 'index.html'],   // HTML-Skelett
  main:    ['src/main.js', 'main.js'],         // Electron Main-Process
  preload: ['src/preload.js', 'preload.js'],   // Preload-Bridge
};

// ── Hilfen ─────────────────────────────────────────────────────────
let errors = 0, warnings = 0;
const RED = '\x1b[31m', YEL = '\x1b[33m', GRN = '\x1b[32m', DIM = '\x1b[2m', RST = '\x1b[0m';

function fail(msg)  { console.log(`${RED}  ✗ ${msg}${RST}`); errors++; }
function warn(msg)  { console.log(`${YEL}  ⚠ ${msg}${RST}`); warnings++; }
function ok(msg)    { console.log(`${GRN}  ✓ ${msg}${RST}`); }
function section(t) { console.log(`\n${t}`); }

/** Findet die erste existierende Datei aus einer Kandidatenliste. */
function resolve(candidates) {
  for (const c of candidates) {
    const p = path.join(ROOT, c);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function read(p) { return fs.readFileSync(p, 'utf8'); }

/** Zeilennummer eines Zeichen-Offsets (für Fehlermeldungen). */
function lineOf(text, idx) { return text.slice(0, idx).split('\n').length; }

// ── Check 1: Syntax ────────────────────────────────────────────────
function checkSyntax() {
  section('1. Syntax-Check (node --check)');
  for (const key of ['logic', 'main', 'preload']) {
    const p = resolve(FILES[key]);
    if (!p) { warn(`${key}: Datei nicht gefunden – übersprungen`); continue; }
    // HTML-Skelett (logic kann je nach Mapping HTML sein) nicht syntaxchecken
    if (read(p).trimStart().startsWith('<')) {
      warn(`${path.basename(p)}: sieht wie HTML aus – Syntax-Check übersprungen`);
      continue;
    }
    try {
      execSync(`node --check "${p}"`, { stdio: 'pipe' });
      ok(`${path.basename(p)}: Syntax ok`);
    } catch (e) {
      fail(`${path.basename(p)}: Syntax-Fehler\n${DIM}${e.stderr?.toString().trim()}${RST}`);
    }
  }
}

// ── Check 2: Doppelte Funktionsdefinitionen ────────────────────────
// README §4.7: "Die zweite Definition gewinnt" → überschreibt App-Modals etc.
function checkDuplicateFunctions() {
  section('2. Doppelte Funktionsdefinitionen (README §4.7)');
  const p = resolve(FILES.logic);
  if (!p) { warn('Logikdatei nicht gefunden – übersprungen'); return; }
  const text = read(p);
  // Nur TOP-LEVEL-Funktionen (Zeilenanfang ohne Einrückung).
  // Eingerückte function-Deklarationen sind lokale Closures (z.B. cleanup/kh
  // in Modal-Helpern) und dürfen denselben Namen mehrfach tragen.
  const re = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  const seen = new Map();
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[1];
    const ln = lineOf(text, m.index);
    if (!seen.has(name)) seen.set(name, []);
    seen.get(name).push(ln);
  }
  let found = false;
  for (const [name, lines] of seen) {
    if (lines.length > 1) {
      fail(`Funktion "${name}" ${lines.length}× definiert (Zeilen ${lines.join(', ')}) – zweite gewinnt!`);
      found = true;
    }
  }
  if (!found) ok('Keine doppelten Funktionsdefinitionen');
}

// ── Check 3: Ungequotete UUIDs in onclick ──────────────────────────
// README §4.3: onclick="fn(${id})" → UUID wird als Subtraktion interpretiert.
// Korrekt ist onclick="fn('${id}')". Wir prüfen Logik- UND HTML-Datei.
function checkUnquotedOnclick() {
  section('3. Ungequotete IDs in onclick (README §4.3)');
  let found = false;
  for (const key of ['logic', 'html']) {
    const p = resolve(FILES[key]);
    if (!p) continue;
    const text = read(p);
    // onclick="...fn(${...})..."  ohne umschließende Quotes um ${...}
    // Trefferbedingung: ${ direkt nach ( ODER nach , ohne vorangehendes '
    const re = /onclick\s*=\s*["'`][^"'`]*?\b[\w$]+\(\s*\$\{/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      // Prüfen, ob unmittelbar vor ${ ein ' steht (dann ist es ok)
      const before = text[m.index + m[0].length - 3]; // Zeichen vor "${"
      if (before !== "'" && before !== '"') {
        fail(`${path.basename(p)}:${lineOf(text, m.index)} – onclick mit ungequoteter ID: ${DIM}${m[0].slice(0, 60)}…${RST}`);
        found = true;
      }
    }
  }
  if (!found) ok('Alle onclick-IDs korrekt gequotet');
}

// ── Check 4: Verschachtelte ipcMain.handle ─────────────────────────
// README §4.1: handle innerhalb eines anderen handle wird nie registriert.
function checkNestedIpcHandlers() {
  section('4. Verschachtelte ipcMain.handle (README §4.1)');
  const p = resolve(FILES.main);
  if (!p) { warn('main.js nicht gefunden – übersprungen'); return; }
  const text = read(p);
  if (text.trimStart().startsWith('<')) {
    warn(`${path.basename(p)} sieht wie HTML aus – Check übersprungen`);
    return;
  }
  // Naive Tiefenverfolgung über geschweifte Klammern ab jedem handle-Aufruf.
  const re = /ipcMain\.handle\s*\(/g;
  let m;
  const opens = [];
  while ((m = re.exec(text)) !== null) opens.push(m.index);

  let found = false;
  for (let i = 0; i < opens.length; i++) {
    // Klammertiefe vom Dateianfang bis zu diesem handle berechnen
    const prefix = text.slice(0, opens[i]);
    let depth = 0, inStr = null, prev = '';
    for (let c = 0; c < prefix.length; c++) {
      const ch = prefix[c];
      if (inStr) { if (ch === inStr && prev !== '\\') inStr = null; }
      else if (ch === '"' || ch === "'" || ch === '`') inStr = ch;
      else if (ch === '{') depth++;
      else if (ch === '}') depth--;
      prev = ch;
    }
    // Top-Level handle-Aufrufe stehen typischerweise auf Klammertiefe 0.
    // Tiefe > 0 = innerhalb einer Funktion/eines anderen handle → verdächtig.
    if (depth > 0) {
      fail(`${path.basename(p)}:${lineOf(text, opens[i])} – ipcMain.handle auf Klammertiefe ${depth} (verschachtelt?)`);
      found = true;
    }
  }
  if (!found) ok('Alle ipcMain.handle auf Top-Level');
}

// ── Check 5: contextIsolation: true ────────────────────────────────
// README §4.2: muss false sein, sonst brechen alle onclick-Handler.
function checkContextIsolation() {
  section('5. contextIsolation (README §4.2)');
  const p = resolve(FILES.main);
  if (!p) { warn('main.js nicht gefunden – übersprungen'); return; }
  const text = read(p);
  if (/contextIsolation\s*:\s*true/.test(text)) {
    fail('contextIsolation: true gefunden – bricht alle onclick-Handler! Muss false sein.');
  } else if (/contextIsolation\s*:\s*false/.test(text)) {
    ok('contextIsolation: false');
  } else {
    warn('contextIsolation nicht gefunden (Default ist true ab Electron 12 – explizit false setzen!)');
  }
}

// ── Check 6: Proxy-zerstörendes Deep-Clone ─────────────────────────
// README §5.2: JSON.parse(JSON.stringify(DEFAULT_DATA)) zerstört die State-Proxies.
function checkProxyClone() {
  section('6. Proxy-zerstörendes State-Clone (README §5.2)');
  const p = resolve(FILES.logic);
  if (!p) { warn('Logikdatei nicht gefunden – übersprungen'); return; }
  const text = read(p);
  const re = /state\s*=\s*JSON\.parse\s*\(\s*JSON\.stringify\s*\(\s*DEFAULT_DATA/g;
  let m, found = false;
  while ((m = re.exec(text)) !== null) {
    fail(`${path.basename(p)}:${lineOf(text, m.index)} – JSON.parse(JSON.stringify(DEFAULT_DATA)) zerstört Proxies! createState() nutzen.`);
    found = true;
  }
  if (!found) ok('Kein proxy-zerstörendes State-Clone');
}

// ── Check 7: onclick→Funktion ohne window-Export (WARNUNG) ─────────
// README §11.3: onclick-Funktionen müssen am Ende via window.fn = fn exportiert sein.
function checkWindowExports() {
  section('7. onclick-Funktionen ohne window-Export (Warnung, README §11.3)');
  const logic = resolve(FILES.logic);
  const html  = resolve(FILES.html);
  if (!logic) { warn('Logikdatei nicht gefunden – übersprungen'); return; }
  const logicText = read(logic);
  const htmlText  = html ? read(html) : '';
  const allText   = logicText + '\n' + htmlText;

  // Funktionsnamen, die in onclick="NAME(" aufgerufen werden
  const calls = new Set();
  const callRe = /onclick\s*=\s*["'`]\s*([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = callRe.exec(allText)) !== null) calls.add(m[1]);

  // window.NAME = ... oder window.NAME=...
  const exported = new Set();
  const expRe = /window\.([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = expRe.exec(logicText)) !== null) exported.add(m[1]);

  // In logic definierte Funktionen
  const defined = new Set();
  const defRe = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = defRe.exec(logicText)) !== null) defined.add(m[1]);

  let found = false;
  for (const name of calls) {
    // Nur warnen, wenn die Funktion in der Logikdatei definiert, aber nicht exportiert ist.
    // (Stubs in index.html zählen nicht als Export.)
    if (defined.has(name) && !exported.has(name)) {
      warn(`"${name}" wird in onclick benutzt + in app.js definiert, aber kein window.${name} Export gefunden`);
      found = true;
    }
  }
  if (!found) ok('Alle onclick-Funktionen exportiert (oder als Stub vorhanden)');
}

// ── Lauf ───────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════');
console.log(' Finanzverwaltung Pro – Stabilitäts-Check');
console.log('═══════════════════════════════════════════');

checkSyntax();
checkDuplicateFunctions();
checkUnquotedOnclick();
checkNestedIpcHandlers();
checkContextIsolation();
checkProxyClone();
checkWindowExports();

console.log('\n═══════════════════════════════════════════');
if (errors > 0) {
  console.log(`${RED} ${errors} Fehler${RST}, ${warnings} Warnung(en) – Commit/Build stoppen.`);
  process.exit(1);
} else {
  console.log(`${GRN} Keine Fehler${RST}, ${warnings} Warnung(en).`);
  process.exit(0);
}
