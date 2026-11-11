// ════════════════════════════════════════════════════════════════════════════
// ARBEITSZEIT → DATEV-EXCEL (Main-Process)
// ════════════════════════════════════════════════════════════════════════════
// Füllt die vom Nutzer gewählte DATEV-Vorlage „Arbeitszeitdokumentation" mit
// den Tageszeilen eines Monats. Es werden NUR Zellwerte im Blatt
// „Arbeitszeitdokumentation" gesetzt – Formatierung, Formeln, Blattschutz,
// Bilder und die übrigen Blätter bleiben unverändert. Die Vorlage selbst liegt
// nie im Repo (enthält Name/Firma), sondern wird per Pfad übergeben.
//
// Layout der Vorlage: H7 = Monat (Excel-Datum), Zeile 10+Tag je Kalendertag,
// C = Beginn, E = Ende (jeweils HHMM als Zahl, z.B. 840 = 08:40),
// G = Kürzel (K/U/F …), H = aufgezeichnet am (Excel-Datum), I = Bemerkung.
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const SHEET_NAME = 'Arbeitszeitdokumentation';
const MONATE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

// 'YYYY-MM-DD' → Excel-Seriennummer (Tage seit 30.12.1899)
function excelSerial(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}
function xmlEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function dateiName(jahr, monat) {
  return 'Arbeitszeitdokumentation ' + MONATE[monat - 1] + ' ' + jahr + '.xlsx';
}

// Pfad des Blatts „Arbeitszeitdokumentation" in der Mappe ermitteln.
async function findSheetPath(zip) {
  const wb = await zip.file('xl/workbook.xml').async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const sheet = [...wb.matchAll(/<sheet\b[^>]*>/g)].map(m => m[0])
    .find(tag => (tag.match(/\bname="([^"]*)"/) || [])[1] === SHEET_NAME);
  if (!sheet) throw new Error('Blatt „' + SHEET_NAME + '" nicht in der Vorlage gefunden.');
  const rid = (sheet.match(/\br:id="([^"]+)"/) || [])[1];
  const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map(m => m[0])
    .find(tag => (tag.match(/\bId="([^"]+)"/) || [])[1] === rid);
  if (!rel) throw new Error('Vorlage beschädigt (Blatt-Verweis fehlt).');
  const target = (rel.match(/\bTarget="([^"]+)"/) || [])[1];
  return target.startsWith('/') ? target.slice(1) : 'xl/' + target;
}

// Setzt den Inhalt einer bestehenden Zelle; Stil (s=) bleibt erhalten.
// value: null = leeren, number = Zahl, string = Inline-Text.
function setCell(xml, ref, value) {
  const re = new RegExp('<c r="' + ref + '"([^>]*?)(?:/>|>[\\s\\S]*?</c>)');
  const m = xml.match(re);
  if (!m) throw new Error('Zelle ' + ref + ' fehlt in der Vorlage – ist das die DATEV-Arbeitszeitvorlage?');
  const style = (m[1].match(/\bs="(\d+)"/) || [])[1];
  const s = style != null ? ' s="' + style + '"' : '';
  let cell;
  if (value == null || value === '') cell = '<c r="' + ref + '"' + s + ' t="n"></c>';
  else if (typeof value === 'number') cell = '<c r="' + ref + '"' + s + ' t="n"><v>' + value + '</v></c>';
  else cell = '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(value) + '</t></is></c>';
  return xml.replace(re, cell);
}

// Eine Monatsdatei erzeugen. zeilen: [{ tag, beginn, ende, aufgezeichnet, kuerzel, bemerkung }]
async function fillMonth(templateBuf, { jahr, monat, zeilen }) {
  const zip = await JSZip.loadAsync(templateBuf);
  const sheetPath = await findSheetPath(zip);
  let xml = await zip.file(sheetPath).async('string');
  xml = setCell(xml, 'H7', excelSerial(jahr + '-' + String(monat).padStart(2, '0') + '-01'));
  // Alle Tageszeilen leeren (falls eine bereits befüllte Datei als Vorlage dient)
  for (let tag = 1; tag <= 31; tag++) {
    for (const col of ['C', 'E', 'G', 'H', 'I']) xml = setCell(xml, col + (10 + tag), null);
  }
  for (const z of zeilen || []) {
    const r = 10 + z.tag;
    if (z.beginn != null) xml = setCell(xml, 'C' + r, z.beginn);
    if (z.ende != null)   xml = setCell(xml, 'E' + r, z.ende);
    if (z.kuerzel)        xml = setCell(xml, 'G' + r, z.kuerzel);
    if (z.aufgezeichnet)  xml = setCell(xml, 'H' + r, excelSerial(z.aufgezeichnet));
    if (z.bemerkung)      xml = setCell(xml, 'I' + r, z.bemerkung);
  }
  zip.file(sheetPath, xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// Mehrere Monate in den Zielordner schreiben (je Monat eine Datei).
async function exportMonate({ vorlage, ordner, monate }) {
  if (!vorlage || !fs.existsSync(vorlage)) throw new Error('DATEV-Vorlage nicht gefunden: ' + (vorlage || '–'));
  if (!ordner || !fs.existsSync(ordner)) throw new Error('Zielordner nicht gefunden: ' + (ordner || '–'));
  const tpl = fs.readFileSync(vorlage);
  const dateien = [];
  for (const mo of monate || []) {
    const buf = await fillMonth(tpl, mo);
    const pfad = path.join(ordner, dateiName(mo.jahr, mo.monat));
    fs.writeFileSync(pfad, buf);
    dateien.push({ pfad, name: path.basename(pfad) });
  }
  return dateien;
}

// ── Einlesen bestehender Listen (Import früherer Monate) ────────────────────
function serialToIso(n) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(+n) * 86400000);
  return d.toISOString().slice(0, 10);
}
function xmlUnesc(s) {
  return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (m, c) => String.fromCharCode(+c)).replace(/&amp;/g, '&');
}
// Zellwerte des Blatts als { 'C11': 840, 'I21': 'verkaufsoffen', … } – Inline- und
// Shared-Strings (falls die Datei in Excel bearbeitet wurde). Formelzellen zählen nicht.
function zellwerte(xml, shared) {
  const out = {};
  for (const m of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const [, ref, attr, inner] = m;
    if (!inner || inner.includes('<f')) continue;
    const t = (attr.match(/\bt="([^"]+)"/) || [])[1];
    const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
    if (t === 's' && v != null) out[ref] = shared[+v] ?? '';
    else if (t === 'inlineStr' || t === 'str') {
      const txt = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('');
      if (txt !== '') out[ref] = xmlUnesc(txt);
    } else if (v != null && v !== '') out[ref] = +v;
  }
  return out;
}
// Eine ausgefüllte DATEV-Liste lesen → { jahr, monat, zeilen:[{ datum, beginn, ende,
// kuerzel, aufgezeichnet, bemerkung }] } mit Zeiten als 'HH:MM'.
async function readMonth(buf) {
  const zip = await JSZip.loadAsync(buf);
  const sheetPath = await findSheetPath(zip);
  const xml = await zip.file(sheetPath).async('string');
  const ssFile = zip.file('xl/sharedStrings.xml');
  const shared = ssFile
    ? [...(await ssFile.async('string')).matchAll(/<si>([\s\S]*?)<\/si>/g)]
        .map(m => xmlUnesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('')))
    : [];
  const z = zellwerte(xml, shared);
  if (typeof z.H7 !== 'number') throw new Error('Monat (Zelle H7) fehlt – ist das eine ausgefüllte Arbeitszeitliste?');
  const start = serialToIso(z.H7);
  const jahr = +start.slice(0, 4), monat = +start.slice(5, 7);
  const tageImMonat = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  const hhmm = n => {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    if (n > 0 && n < 1) { const min = Math.round(n * 1440); n = Math.floor(min / 60) * 100 + min % 60; } // echte Excel-Uhrzeit
    const h = Math.floor(n / 100), mi = Math.round(n % 100);
    return h < 24 && mi < 60 ? String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0') : '';
  };
  const zeilen = [];
  for (let tag = 1; tag <= tageImMonat; tag++) {
    const r = 10 + tag;
    const beginn = hhmm(z['C' + r]), ende = hhmm(z['E' + r]);
    const kuerzel = typeof z['G' + r] === 'string' ? z['G' + r].trim() : '';
    if (!(beginn && ende) && !kuerzel) continue;
    zeilen.push({
      datum: start.slice(0, 8) + String(tag).padStart(2, '0'),
      beginn: beginn && ende ? beginn : '', ende: beginn && ende ? ende : '',
      kuerzel,
      aufgezeichnet: typeof z['H' + r] === 'number' ? serialToIso(z['H' + r]) : '',
      bemerkung: z['I' + r] != null ? String(z['I' + r]).trim() : '',
    });
  }
  return { jahr, monat, zeilen };
}
async function readDateien(pfade) {
  const out = [];
  for (const p of pfade || []) {
    try { out.push(Object.assign({ datei: path.basename(p) }, await readMonth(fs.readFileSync(p)))); }
    catch (err) { out.push({ datei: path.basename(p), fehler: err.message }); }
  }
  return out;
}

module.exports = { fillMonth, exportMonate, dateiName, excelSerial, readMonth, readDateien };
