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

module.exports = { fillMonth, exportMonate, dateiName, excelSerial };
