// ── PDF.js ────────────────────────────────────────────────────────────────
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ── HELPERS ───────────────────────────────────────────────────────────────
const el = (id) => document.getElementById(id);
const fmt = (n, decimals = 2) => (+n || 0).toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
// Currency symbol mapping
const CURRENCY_SYMBOLS = { EUR: '€', USD: '$', CHF: 'CHF', GBP: '£', JPY: '¥' };
function currencySymbol() {
  return CURRENCY_SYMBOLS[state?.meta?.waehrung || 'EUR'] || '€';
}
const fmtEur = (n) => fmt(n) + ' ' + currencySymbol();
const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const monthLabel = (m) => { const [y, mo] = m.split('-'); return ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][+mo-1] + ' ' + y; };
const monthsBetween = (from, to) => {
  // Timezone-safe: parse YYYY-MM directly without Date()
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const r = [];
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    r.push(y + '-' + String(m).padStart(2, '0'));
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return r;
};
let allMonths2026 = ['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10','2026-11','2026-12'];
let chartInstances = {};

// ── DEFAULT DATA ──────────────────────────────────────────────────────────
// ── DATA STRUCTURE WITH YEAR-PARTITIONING ──────────────────────────────────
// V3 schema: per-year data partitioned into state.years[year]
// Old code still accesses state.einkaeufe etc. - these are proxied via Object.defineProperty

const YEAR_FIELDS = ['incomeByMonth','einkaeufe','ausgaben','einnahmen','regelEinnahmen','spesen','fixkosten','sparen','zaehler','tabellen','finanzprodukte','umbuchungen'];

function emptyIncomeByMonth(year) {
  const obj = {};
  for (let m = 1; m <= 12; m++) {
    obj[year + '-' + String(m).padStart(2,'0')] = { gehalt: 0, nebenjob: 0 };
  }
  return obj;
}
// Jahres-Zuordnung Gehalt/Nebenjob → Konto (einmal gewählt, gilt fürs ganze Jahr).
function getGehaltKonto(yr) {
  const c = (state.config && state.config.incomeKonten) || {};
  return (c[(yr||getSelectedYear())] || {}).gehalt || defaultKontoId(yr);
}
function getNebenjobKonto(yr) {
  const c = (state.config && state.config.incomeKonten) || {};
  return (c[(yr||getSelectedYear())] || {}).nebenjob || defaultKontoId(yr);
}
function setIncomeKonto(field, kontoId, yr) {
  yr = yr || getSelectedYear();
  if (!state.config) state.config = {};
  if (!state.config.incomeKonten) state.config.incomeKonten = {};
  if (!state.config.incomeKonten[yr]) state.config.incomeKonten[yr] = {};
  state.config.incomeKonten[yr][field] = kontoId;
}

// ── SPARZIEL ────────────────────────────────────────────────────────────────
function getSparziel() {
  const c = state.config || {};
  return { aktiv: !!c.sparzielAktiv, summe: +c.sparzielSumme || 0 };
}
function setSparziel(field, val) {
  if (!state.config) state.config = {};
  if (field === 'aktiv')  state.config.sparzielAktiv = !!val;
  if (field === 'summe')  state.config.sparzielSumme = +val || 0;
}
function updateSparzielSumme(val) {  setSparziel('summe', val);
  saveData(); renderPage();
}
// Tatsächlich Gespartes im laufenden Jahr, kumuliert bis einschl. aktuellem Monat.
// ── ERINNERUNGEN ────────────────────────────────────────────────────────────
// Struktur je Erinnerung:
// { id, title, when:'monthEnd'|'monthStart'|'day', day:1-31,
//   repeatMonths:1, active:true, notify:false, lastDone:'YYYY-MM' }
function getReminders() { return state.reminders || (state.reminders = []); }

function reminderDueDay(r, year, month1) {
  // liefert den konkreten Tag (1..31) im gegebenen Monat, an dem r fällig ist
  const daysInMonth = new Date(year, month1, 0).getDate();
  if (r.when === 'monthStart') return 1;
  if (r.when === 'monthEnd')   return daysInMonth;
  const d = Math.max(1, Math.min(31, +r.day || 1));
  return Math.min(d, daysInMonth); // 31 in einem 30-Tage-Monat -> letzter Tag
}

// Ist die Erinnerung heute (oder überfällig) im aktuellen Zyklus fällig und noch nicht erledigt?
function reminderIsDue(r, now) {
  if (!r.active) return false;
  now = now || new Date();
  const year = now.getFullYear();
  const month1 = now.getMonth() + 1;        // 1..12
  const ym = year + '-' + String(month1).padStart(2, '0');
  // Wiederholungs-Rhythmus: nur in passenden Monaten fällig
  const rep = Math.max(1, +r.repeatMonths || 1);
  if (rep > 1) {
    // Anker: erster fälliger Monat = anchorYm (oder Erstellung). Wir nutzen anchorYm falls vorhanden.
    const anchor = r.anchorYm || ym;
    const [ay, am] = anchor.split('-').map(Number);
    const diff = (year - ay) * 12 + (month1 - am);
    if (diff < 0 || (diff % rep) !== 0) return false;
  }
  // Schon in diesem Zyklus erledigt?
  if (r.lastDone === ym) return false;
  // Fällig ab dem Zieltag des Monats
  const dueDay = reminderDueDay(r, year, month1);
  return now.getDate() >= dueDay;
}

function dueReminders(now) {
  return getReminders().filter(r => reminderIsDue(r, now));
}

function addReminder() {
  const r = { id: uid(), title: 'Neue Erinnerung', when: 'monthEnd', day: 1,
    repeatMonths: 1, active: true, notify: false, lastDone: '',
    anchorYm: new Date().toISOString().slice(0,7) };
  getReminders().push(r);
  saveData(); renderPage();
}
function updateReminder(id, field, val) {
  const r = getReminders().find(x => String(x.id) === String(id));
  if (!r) return;
  if (field === 'day' || field === 'repeatMonths') val = +val || 1;
  if (field === 'active' || field === 'notify') val = !!val;
  r[field] = val;
  saveData();
  if (field === 'notify') { try { initReminders(); } catch {} }
  if (field === 'when' || field === 'active') renderPage();
}
async function deleteReminder(id) {
  if (!await uiConfirm({ title: 'Erinnerung löschen', icon: '🗑', message: 'Diese Erinnerung wirklich löschen?' })) return;
  state.reminders = getReminders().filter(x => String(x.id) !== String(id));
  saveData(); renderPage();
}
function reminderDone(id) {
  const r = getReminders().find(x => String(x.id) === String(id));
  if (!r) return;
  r.lastDone = new Date().toISOString().slice(0,7); // aktueller Monat als erledigt
  saveData(); renderPage();
}
function reminderSnooze(id) {
  // "Später" – blendet den Banner für diese Sitzung aus (nicht persistent)
  _snoozedReminders[id] = true;
  renderPage();
}
let _snoozedReminders = {};

// ── "WAS IST NEU" / CHANGELOG ───────────────────────────────────────────────
// ▼▼▼ CHANGELOG – wird bei jedem Update gepflegt. Neueste Version ZUERST. ▼▼▼
// Format je Eintrag: { v: 'Version', date: 'YYYY-MM-DD', changes: ['...','...'] }
// Änderungen dürfen mit **Fett** Markierung versehen werden.
const CHANGELOG = [
  { v: '1.0.8', date: '2026-07-08', changes: [
    '**Grafik bei den Zählerständen**: pro Zählertyp (Strom, Wasser …) zeigt eine Linie den Verlauf der Zählerstände über die Zeit',
    'Die Grafik erscheint automatisch, sobald mindestens zwei Werte erfasst sind, und passt sich dem Design an',
  ]},
  { v: '1.0.7', date: '2026-07-06', changes: [
    '**Neues Dark-Mode-Design in Türkis/Blau** – passend zum Logo, modern und hochwertig',
    'Aktiver Menüpunkt jetzt dezent blau/türkis hervorgehoben statt vollflächig',
    'Buttons, Eingabefelder und Karten im neuen kontrastreichen Blau-Schema',
    'Der helle Modus bleibt unverändert',
  ]},
  { v: '1.0.6', date: '2026-07-06', changes: [
    '**Nutzungsbedingungen** überarbeitet und erweitert (Zweck, keine Beratung, Datenschutz, Datensicherung, Haftung)',
    'In den Einstellungen ist jetzt sichtbar, dass die Bedingungen bestätigt wurden (mit Datum)',
    'Bedingungen lassen sich jederzeit erneut ansehen, ohne die Bestätigung zu verlieren',
  ]},
  { v: '1.0.5', date: '2026-07-06', changes: [
    '**Mehr Datensicherheit**: Speichern erfolgt jetzt absturzsicher (die Hauptdatei kann bei einem Absturz nicht mehr beschädigt werden)',
    '**Automatische Wiederherstellung**: Ist die Datendatei doch einmal defekt, greift die App automatisch auf die letzte gültige Sicherung zurück',
    '**Backup beim Beenden**: Beim Schließen der App wird automatisch ein Backup in deinen Backup-Ordner geschrieben (nur die 5 neuesten werden behalten)',
  ]},
  { v: '1.0.4', date: '2026-07-05', changes: [
    '**Änderungsverlauf** ("Was ist neu") wird jetzt automatisch in der App gepflegt und zeigt auch ältere Versionen',
    '**Backup-Aufräumen**: es werden automatisch nur die 5 neuesten Backups behalten',
    '**Taschenrechner** neben den Betragsfeldern (Einkäufe, Fixkosten, Sparen, Einnahmen)',
    '**Erinnerungen** an wiederkehrende Aufgaben mit In-App-Banner und optionaler Windows-Benachrichtigung',
    '**Onboarding**: Nutzungsbedingungen und geführte App-Tour beim ersten Start (jederzeit erneut aufrufbar)',
    'Release-Notes werden nach einem Update im Modal angezeigt',
    'Fehlerbehebung: Erinnerungen bleiben nach dem Neustart erhalten',
  ]},
];
// ▲▲▲ ENDE CHANGELOG ▲▲▲

function changelogToNotes(entry) {
  if (!entry) return '';
  return entry.changes.map(c => '- ' + c).join('\n');
}

async function checkWhatsNew() {
  try {
    let version = null;
    if (window.EA && window.EA.getVersion) { try { version = await window.EA.getVersion(); } catch {} }
    // Fallback: neueste Changelog-Version, falls keine App-Version verfügbar (Dev-Modus)
    if (!version) version = CHANGELOG[0] ? CHANGELOG[0].v : null;
    if (!version) return;
    const seen = (state.config && state.config.lastSeenVersion) || '';
    if (!seen) { state.config.lastSeenVersion = version; saveData(); return; }
    if (seen === version) return;
    state.config.lastSeenVersion = version;
    saveData();
    showWhatsNewModal();  // zeigt neueste Version + Verlauf aus CHANGELOG
  } catch (e) { console.error('checkWhatsNew:', e); }
}

function mdToHtml(md) {
  if (!md) return '<p style="color:var(--muted-text)">Keine Detailinfos für diese Version hinterlegt.</p>';
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const lines = md.split('\n');
  let html = '', inList = false;
  for (let line of lines) {
    line = line.replace(/\r/g,'');
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) { html += '<ul style="margin:6px 0 6px 18px;padding:0">'; inList = true; }
      let item = esc(line.replace(/^\s*[-*]\s+/, '')).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      html += '<li style="margin:3px 0">' + item + '</li>';
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      const t = line.trim();
      if (!t) continue;
      if (/^#{1,6}\s/.test(t)) {
        html += '<div style="font-weight:700;font-size:14px;margin:10px 0 4px">' + esc(t.replace(/^#{1,6}\s/, '')) + '</div>';
      } else {
        html += '<p style="margin:5px 0">' + esc(t).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') + '</p>';
      }
    }
  }
  if (inList) html += '</ul>';
  return html;
}

function showWhatsNewModal() {
  if (!CHANGELOG.length) return;
  const newest = CHANGELOG[0];
  const older = CHANGELOG.slice(1);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const newestHtml =
    '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent);margin-bottom:8px">Neu in Version ' + newest.v + '</div>' +
    mdToHtml(changelogToNotes(newest));
  const olderHtml = older.length ? (
    '<div style="margin-top:18px;border-top:1px solid var(--border);padding-top:14px">' +
    '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted-text);margin-bottom:8px">Frühere Versionen</div>' +
    older.map(e =>
      '<details style="margin-bottom:6px">' +
        '<summary style="cursor:pointer;font-weight:600;font-size:13px;color:var(--text);padding:4px 0">Version ' + e.v + (e.date ? ' <span style="color:var(--muted-text);font-weight:400">· ' + e.date + '</span>' : '') + '</summary>' +
        '<div style="padding:4px 0 8px 4px">' + mdToHtml(changelogToNotes(e)) + '</div>' +
      '</details>'
    ).join('') +
    '</div>'
  ) : '';
  overlay.innerHTML =
    '<div class="modal" style="max-width:500px;padding:0;animation:fadeIn .2s ease-out" onclick="event.stopPropagation()">' +
      '<div style="padding:20px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 14%,var(--paper)),var(--paper))">' +
        '<div style="font-size:30px;line-height:1">🎉</div>' +
        '<div><h3 style="margin:0;font-size:17px;font-weight:700;color:var(--text)">Was ist neu</h3>' +
        '<div style="font-size:13px;color:var(--muted-text)">Du nutzt jetzt Version ' + newest.v + '</div></div>' +
      '</div>' +
      '<div style="padding:18px 24px;max-height:400px;overflow-y:auto;font-size:13px;line-height:1.55;color:var(--text)">' +
        newestHtml + olderHtml +
      '</div>' +
      '<div style="padding:14px 24px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;background:var(--surface);border-radius:0 0 14px 14px">' +
        '<button class="btn btn-primary" onclick="this.closest(\'.modal-overlay\').remove()">Alles klar</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// Beim Start: Tray-Betrieb aktivieren, wenn eine Erinnerung System-Hinweise nutzt,
// und für fällige Erinnerungen mit notify=true eine Windows-Benachrichtigung zeigen.
async function initReminders() {
  try {
    if (!window.EA) return; // nur in der installierten App
    const anyNotify = getReminders().some(r => r.active && r.notify);
    // Tray nur einschalten, wenn wirklich System-Hinweise gewünscht sind.
    if (window.EA.setTrayEnabled) {
      try { await window.EA.setTrayEnabled(!!anyNotify); } catch {}
    }
    // Fällige Erinnerungen mit System-Hinweis einmalig melden.
    if (window.EA.notify) {
      for (const r of dueReminders()) {
        if (!r.notify) continue;
        // pro Zyklus nur einmal benachrichtigen
        const ym = new Date().toISOString().slice(0,7);
        if (r.notifiedYm === ym) continue;
        try {
          await window.EA.notify({ title: '🔔 ' + (r.title || 'Erinnerung'),
            body: 'Fällig ' + whenLabel(r) + ' · ' + repeatLabel(r) });
          r.notifiedYm = ym;
        } catch {}
      }
      saveData();
    }
  } catch (e) { console.error('initReminders:', e); }
}

function whenLabel(r) {
  if (r.when === 'monthStart') return 'Monatsanfang';
  if (r.when === 'monthEnd')   return 'Monatsende';
  return 'am ' + (Math.max(1, Math.min(31, +r.day||1))) + '.';
}
function repeatLabel(r) {
  const n = Math.max(1, +r.repeatMonths || 1);
  return n === 1 ? 'monatlich' : ('alle ' + n + ' Monate');
}

function sparenKumuliertBisMonat(month) {
  const yr = (month || currentMonth).slice(0,4);
  let summe = 0;
  (state.sparen||[]).forEach(s => {
    const m = s.month || (s.date ? s.date.slice(0,7) : '');
    if (!m) return;
    if (m.slice(0,4) !== yr) return;     // nur laufendes Jahr
    if (m > month) return;               // nur bis aktueller Monat
    summe += (+s.amount||0);
  });
  return Math.round(summe * 100) / 100;
}

function createEmptyYearData(year) {
  return {
    status: 'active',           // 'active' | 'closed' | 'planned'
    startBalance: 0,
    konten: null,  // [{id,name,start,cashflow}] – wird lazy migriert
    closedAt: null,
    incomeByMonth: emptyIncomeByMonth(Number(year)),
    einkaeufe: [],
    ausgaben: [],
    einnahmen: [],
    regelEinnahmen: [],
    spesen: [],
    fixkosten: [],
    sparen: [],
    zaehler: [],
    tabellen: [],
    finanzprodukte: [],
    umbuchungen: [],
  };
}

const DEFAULT_DATA_RAW = {
  dataVersion: 3,
  currentYear: new Date().getFullYear(),
  selectedYear: new Date().getFullYear(),
  years: { },
  meta: { year: new Date().getFullYear(), startgeld: 0, userName: '', email: '', paypal: '', setupDone: false, waehrung: 'EUR' },
  config: { theme:'light', accent:'#0f766e', startPage:'dashboard', dateFormat:'de', compactMode:false, autoBackup:false, etfLiveDaten:false, etfAutoRefresh:false, etfInterval:0, lastBackup:'', showStartupModal:true },
  customCats: { ausgabe: [], einnahme: [], einkauf: [] },
  trash: [],
  imports: [],
  etfKurse: {},
  transactions: [],
  yearEditUnlocked: false,
  backupHistory: [],
  reminders: [],
};

// Year-data accessors
function getSelectedYear() {
  return String(state.selectedYear || state.currentYear || state.meta?.year || new Date().getFullYear());
}
function getYearData(year) {
  year = String(year || getSelectedYear());
  if (!state.years) state.years = {};
  if (!state.years[year]) state.years[year] = createEmptyYearData(Number(year));
  // Ensure all year-fields exist (forward-compat)
  YEAR_FIELDS.forEach(f => {
    if (state.years[year][f] === undefined) {
      state.years[year][f] = f === 'incomeByMonth' ? emptyIncomeByMonth(Number(year)) : [];
    }
  });
  return state.years[year];
}
function setSelectedYear(year) {
  year = String(year);
  state.selectedYear = Number(year);
  if (!state.years[year]) state.years[year] = createEmptyYearData(Number(year));
  // Sync legacy fields
  state.meta.year = Number(year);
  state.meta.startgeld = state.years[year].startBalance;
  // Rebuild monthly cache
  const months = monthsBetween(year + '-01', year + '-12');
  if (typeof allMonths2026 !== 'undefined') {
    allMonths2026.splice(0, allMonths2026.length, ...months);
  }
  currentMonth = year + '-' + (new Date().getMonth()+1+'').padStart(2,'0');
  if (!months.includes(currentMonth)) currentMonth = months[0];
  saveData();
  if (typeof buildMonthSelector === 'function') buildMonthSelector();
  renderPage();
  // Trigger auto-eintragung for newly selected year
  setTimeout(() => runSparenAutoEintragung().catch(e => console.error(e)), 500);
}

function requireUnlocked(action) {
  if (isSelectedYearLocked()) {
    showToast('Jahr ist abgeschlossen. Bitte in Einstellungen entsperren.', 'error');
    return false;
  }
  return true;
}

function lockAttr() {
  // Returns 'disabled' attribute string if year is locked
  return isSelectedYearLocked() ? 'disabled' : '';
}

function lockBanner() {
  // Returns HTML banner shown above tables for locked years
  if (!isSelectedYearLocked()) return '';
  return '<div style="background:rgba(220,38,38,.08);border:1px solid rgba(220,38,38,.3);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px;display:flex;align-items:center;gap:10px">' +
    '<span style="font-size:18px">🔒</span>' +
    '<span style="flex:1">Dieses Jahr ist abgeschlossen und schreibgeschützt.</span>' +
    '<button class="btn btn-ghost btn-sm" onclick="reopenYear()">Entsperren</button>' +
    '</div>';
}

function isSelectedYearLocked() {
  return getYearData().status === 'closed' && !state.yearEditUnlocked;
}
function listYears() {
  return Object.keys(state.years || {}).map(Number).sort((a,b) => a - b).map(String);
}

// Create state with year-data proxies for legacy access
function createState() {
  const raw = JSON.parse(JSON.stringify(DEFAULT_DATA_RAW));
  raw.years[String(raw.selectedYear)] = createEmptyYearData(raw.selectedYear);
  // Add legacy proxy properties: state.einkaeufe → state.years[selectedYear].einkaeufe
  YEAR_FIELDS.forEach(field => {
    Object.defineProperty(raw, field, {
      get() { return getYearData()[field]; },
      set(val) { getYearData()[field] = val; },
      enumerable: true,
      configurable: true,
    });
  });
  // Legacy: meta.startgeld is the SELECTED year's startBalance
  return raw;
}

const DEFAULT_DATA = createState();

// ── STATE ─────────────────────────────────────────────────────────────────
let state = createState();
let currentPage = 'dashboard';
let currentMonth = thisMonth();
let quickAddType = 'ausgabe';
// Stable unique IDs - never collide, never need re-init
function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Fallback for older environments
  return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
}

// ── PAPIERKORB ──────────────────────────────────────────────────────────────
function moveToTrash(collection, id, label) {
  const arr = state[collection];
  if (!arr) return false;
  const sid = String(id);
  const idx = arr.findIndex(x => String(x.id) === sid);
  if (idx === -1) {
    console.error('moveToTrash: id not found', { collection, id, available: arr.slice(0,3).map(x => x.id) });
    return false;
  }
  const item = arr.splice(idx, 1)[0];
  state.trash = state.trash || [];
  state.trash.push({
    id: uid(),
    year: getSelectedYear(),
    originalType: collection,
    label: label || '',
    deletedAt: new Date().toISOString(),
    data: item
  });
  saveData();
  return true;
}

function restoreFromTrash(trashId) {
  state.trash = state.trash || [];
  const sid = String(trashId);
  const idx = state.trash.findIndex(t => String(t.id) === sid);
  if (idx === -1) { console.error('restoreFromTrash: not found', trashId); return; }
  const entry = state.trash.splice(idx, 1)[0];
  // Restore to ORIGINAL year if known, else current year
  const targetYear = entry.year || getSelectedYear();
  const targetYd = getYearData(targetYear);
  if (!targetYd[entry.originalType]) targetYd[entry.originalType] = [];
  targetYd[entry.originalType].push(entry.data);
  saveData();
  renderPage();
  showToast('Eintrag in ' + targetYear + ' wiederhergestellt');
}

async function deleteFromTrashForever(trashId) {
  if (!await uiConfirm({ message: 'Eintrag endgültig löschen? Kann nicht rückgängig gemacht werden!', title: 'Endgültig löschen', icon: '🗑' })) return;
  const sid = String(trashId);
  state.trash = (state.trash||[]).filter(t => String(t.id) !== sid);
  saveData(); renderPage();
}

async function emptyTrash() {
  if (!await uiConfirm({ message: 'Papierkorb komplett leeren? Alle Einträge werden endgültig gelöscht!', title: 'Papierkorb leeren', icon: '🗑' })) return;
  state.trash = [];
  saveData(); renderPage();
  showToast('Papierkorb geleert');
}

// ── GLOBALE SUCHE ───────────────────────────────────────────────────────────
let _searchTimer = null;
function doGlobalSearch(query) {
  clearTimeout(_searchTimer);
  const box = document.getElementById('searchResults');
  if (!box) return;
  if (!query || query.trim().length < 2) { box.classList.add('hidden'); return; }
  _searchTimer = setTimeout(() => {
    const q = query.trim().toLowerCase();
    const results = [];
    const check = (txt) => (txt||'').toString().toLowerCase().includes(q);
    const push = (icon, bereich, page, date, desc, amount) => results.push({icon, bereich, page, date, desc, amount});
    (state.einkaeufe||[]).forEach(e => { if (check(e.store)||check(e.note)) push('🛒','Einkauf','einkaeufe',e.date,e.store,e.amount); });
    (state.ausgaben||[]).forEach(a => { if (check(a.desc)||check(a.category)||check(a.note)) push('💸','Ausgabe','ausgaben',a.date,a.desc,a.amount); });
    (state.einnahmen||[]).forEach(e => { if (check(e.source)||check(e.note)) push('💰','Einnahme','einnahmen',e.date,e.source,e.amount); });
    (state.regelEinnahmen||[]).forEach(r => { if (check(r.source)||check(r.note)) push('🔁','Wiederkehrend','einnahmen','',r.source,r.amount); });
    (state.spesen||[]).forEach(s => { if (check(s.kunde)||check(s.land)||check(s.note)) push('✈️','Reise','spesen',s.dateFrom||s.date,s.kunde||s.land,s.allowance); });
    (state.fixkosten||[]).forEach(f => { if (check(f.name)||check(f.category)) push('📌','Fixkosten','fixkosten','',f.name,f.amount); });
    (state.sparen||[]).forEach(s => { if (check(s.depot)||check(s.kategorie)||check(s.note)||check(s.etf?.name)) push('🏦','Sparen','sparen',s.date,s.kategorie||s.depot,s.amount); });
    (state.zaehler||[]).forEach(z => { if (check(z.type)||check(z.note)) push('⚡','Zähler','zaehler',z.date,z.type,z.value); });
    (state.finanzprodukte||[]).forEach(fp => { if (check(fp.name)||check(fp.anbieter)||check(fp.typ)) push('📋','Finanzprodukt','finanzprodukte',fp.datum,fp.name,fp.wert); });

    if (!results.length) {
      box.innerHTML = '<p style="padding:14px;font-size:13px;color:var(--muted);text-align:center">Keine Treffer für „' + query + '"</p>';
    } else {
      box.innerHTML = results.slice(0, 20).map(r =>
        '<div onclick="navigate(\'' + r.page + '\');document.getElementById(\'searchResults\').classList.add(\'hidden\');document.getElementById(\'globalSearch\').value=\'\'" ' +
        'style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;cursor:pointer;transition:background .1s" ' +
        'onmouseover="this.style.background=\'var(--surface-2)\'" onmouseout="this.style.background=\'\'" >' +
        '<span style="font-size:16px">' + r.icon + '</span>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (r.desc||'–') + '</div>' +
          '<div style="font-size:11px;color:var(--muted)">' + r.bereich + (r.date ? ' · ' + r.date : '') + '</div>' +
        '</div>' +
        (r.amount !== undefined ? '<span style="font-size:13px;font-weight:600;white-space:nowrap">' + fmtEur(r.amount) + '</span>' : '') +
        '</div>'
      ).join('') + (results.length > 20 ? '<p style="padding:8px;font-size:11px;color:var(--muted);text-align:center">+ ' + (results.length-20) + ' weitere Treffer</p>' : '');
    }
    box.classList.remove('hidden');
  }, 200);
}

// ── AUTOMATISCHES BACKUP SETUP ──────────────────────────────────────────
function onToggleAutoBackup() {
  state.config = state.config || {};
  if (state.config.autoBackup) {
    // Turning OFF
    state.config.autoBackup = false;
    saveData();
    renderPage();
    return;
  }
  // Turning ON - require path + interval
  if (!state.config.backupPath || !state.config.backupInterval) {
    if (!state.config.backupPath) {
      uiAlert('Bitte zuerst einen Backup-Ordner auswählen.');
      selectBackupPath(true); // pass flag to enable autoBackup after path is set
      return;
    }
    if (!state.config.backupInterval) {
      uiAlert('Bitte ein Backup-Intervall wählen (täglich/wöchentlich/monatlich).');
      // open the section anyway
      state.config.autoBackup = true; // show config block so user can pick
      saveData();
      renderPage();
      return;
    }
  }
  state.config.autoBackup = true;
  scheduleNextBackup();
  saveData();
  renderPage();
  showToast('Automatisches Backup aktiviert');
}

async function selectBackupPath(enableAfter) {
  try {
    if (!window.EA || !window.EA.selectFolder) {
      // Fallback for environments without API
      const path = await uiPrompt({ title: 'Backup-Ordner', message: 'Backup-Ordner-Pfad eingeben:', value: state.config.backupPath || '' });
      if (path) {
        state.config = state.config || {};
        state.config.backupPath = path;
        saveData();
        renderPage();
        if (enableAfter) onToggleAutoBackup();
      }
      return;
    }
    const result = await window.EA.selectFolder();
    if (result && result.path) {
      state.config = state.config || {};
      state.config.backupPath = result.path;
      saveData();
      try { window.EA.setBackupDir && window.EA.setBackupDir(result.path); } catch {}
      renderPage();
      showToast('Backup-Ordner gespeichert');
      if (enableAfter) onToggleAutoBackup();
    }
  } catch (e) {
    console.error('selectBackupPath:', e);
    uiAlert('Ordner konnte nicht ausgewählt werden: ' + e.message);
  }
}

async function openBackupFolder() {
  if (!state.config?.backupPath) { uiAlert('Kein Backup-Ordner gesetzt.'); return; }
  try {
    if (window.EA && window.EA.openFolder) await window.EA.openFolder(state.config.backupPath);
  } catch (e) { console.error(e); }
}

function scheduleNextBackup() {
  const intervalDays = { daily: 1, weekly: 7, monthly: 30 }[state.config?.backupInterval] || 0;
  if (!intervalDays) return;
  const next = new Date();
  next.setDate(next.getDate() + intervalDays);
  state.config.nextBackupAt = next.toISOString();
}

async function checkAutoBackup() {
  const cfg = state.config || {};
  if (!cfg.autoBackup || !cfg.backupPath || !cfg.backupInterval) return;
  const now = new Date();
  const nextAt = cfg.nextBackupAt ? new Date(cfg.nextBackupAt) : null;
  if (nextAt && now < nextAt) return; // not due yet
  try {
    if (!window.EA || !window.EA.writeBackup) return;
    const result = await window.EA.writeBackup(cfg.backupPath, JSON.stringify(state, null, 2));
    if (result && result.ok) {
      cfg.lastBackup = new Date().toLocaleString('de-DE');
      cfg.lastBackupAt = new Date().toISOString();
      scheduleNextBackup();
      saveData();
      console.log('Auto-Backup erstellt:', result.fileName);
    } else {
      console.error('Auto-Backup fehlgeschlagen:', result?.error);
    }
  } catch (e) {
    console.error('checkAutoBackup error:', e);
  }
}

function updateYearField(field, val) {
  const yd = getYearData();
  yd[field] = val;
  if (field === 'startBalance') state.meta.startgeld = val;
  saveData();
  showToast('Jahr ' + getSelectedYear() + ': ' + field + ' aktualisiert');
}

async function closeYear() {
  const sy = getSelectedYear();
  const ok = await uiConfirm({
    title: 'Jahr ' + sy + ' abschließen?',
    icon: '🔒',
    message: 'Das Jahr wird auf <strong>schreibgeschützt</strong> gesetzt. Bearbeiten, Hinzufügen und Löschen werden gesperrt.',
    details: ['Daten bleiben weiterhin sichtbar', 'Suche und Statistiken funktionieren', 'Entsperren ist jederzeit möglich', 'Backup vor dem Abschließen wird empfohlen'],
    okLabel: 'Jahr abschließen',
    cancelLabel: 'Abbrechen',
  });
  if (!ok) return;
  const yd = getYearData();
  yd.status = 'closed';
  yd.closedAt = new Date().toISOString();
  state.yearEditUnlocked = false;
  saveData();
  renderPage();
  showToast('Jahr ' + sy + ' abgeschlossen');
}

async function deleteYear() {
  const sy = getSelectedYear();
  const years = listYears();
  if (years.length <= 1) {
    await uiAlert({ title: 'Nicht möglich', icon: '⚠', message: 'Mindestens ein Jahr muss bestehen bleiben.' });
    return;
  }
  const yd = getYearData();
  // Count actual data
  const counts = {
    'Einkäufe':       (yd.einkaeufe||[]).length,
    'Ausgaben':       (yd.ausgaben||[]).length,
    'Einnahmen':      (yd.einnahmen||[]).length,
    'Fixkosten':      (yd.fixkosten||[]).length,
    'Spesen/Reisen':  (yd.spesen||[]).length,
    'Sparen/Depot':   (yd.sparen||[]).length,
    'Zähler':         (yd.zaehler||[]).length,
    'Finanzprodukte': (yd.finanzprodukte||[]).length,
    'Eigene Tabellen':(yd.tabellen||[]).length,
  };
  const details = Object.entries(counts).filter(([_,c]) => c > 0).map(([n,c]) => n + ': ' + c);
  const hasData = details.length > 0;

  if (hasData) {
    const ok1 = await uiConfirm({
      title: 'Jahr ' + sy + ' löschen?',
      icon: '📅',
      danger: true,
      message: 'Folgende Daten werden <strong>unwiderruflich gelöscht</strong>:',
      details: details,
      okLabel: 'Weiter',
      cancelLabel: 'Abbrechen',
    });
    if (!ok1) return;
    const ok2 = await uiConfirm({
      title: 'Letzte Sicherheitsabfrage',
      icon: '⚠',
      danger: true,
      message: 'Jahr <strong>' + sy + '</strong> mit allen Daten wirklich endgültig löschen?',
      okLabel: 'Ja, jetzt löschen',
      cancelLabel: 'Abbrechen',
    });
    if (!ok2) return;
  } else {
    const ok = await uiConfirm({
      title: 'Jahr ' + sy + ' löschen?',
      icon: '📅',
      message: 'Dieses Jahr enthält keine Daten und kann sicher gelöscht werden.',
      okLabel: 'Löschen',
      cancelLabel: 'Abbrechen',
    });
    if (!ok) return;
  }
  // Delete year
  delete state.years[sy];
  // Switch to another year - prefer current real year, else first available
  const remaining = listYears();
  const realYear = String(new Date().getFullYear());
  const target = remaining.includes(realYear) ? realYear : remaining[0];
  state.selectedYear = Number(target);
  state.currentYear = Number(target);
  state.meta.year = Number(target);
  state.meta.startgeld = state.years[target].startBalance;
  // Rebuild monthly cache
  const months = monthsBetween(target + '-01', target + '-12');
  allMonths2026 = months;
  currentMonth = target + '-' + (new Date().getMonth()+1+'').padStart(2,'0');
  if (!months.includes(currentMonth)) currentMonth = months[0];
  saveData();
  buildMonthSelector();
  renderPage();
  showToast('Jahr ' + sy + ' gelöscht');
}

async function reopenYear() {
  if (state.yearEditUnlocked) {
    state.yearEditUnlocked = false;
    saveData();
    renderPage();
    showToast('Jahr wieder gesperrt');
    return;
  }
  const ok = await uiConfirm({
    title: 'Jahr entsperren?',
    icon: '🔓',
    message: 'Dieses Jahr ist abgeschlossen. Änderungen können <strong>Jahresberichte und Auswertungen verändern</strong>.',
    okLabel: 'Trotzdem entsperren',
    cancelLabel: 'Abbrechen',
  });
  if (!ok) return;
  state.yearEditUnlocked = true;
  saveData();
  renderPage();
  showToast('Jahr temporär entsperrt');
}

function cleanOldTrash() {
  // Auto-remove entries older than 30 days
  const cutoff = Date.now() - 30*24*60*60*1000;
  const before = (state.trash||[]).length;
  state.trash = (state.trash||[]).filter(t => new Date(t.deletedAt).getTime() > cutoff);
  if (state.trash.length !== before) saveData();
}

// ── PERSISTENCE ───────────────────────────────────────────────────────────
function saveData() {
  // Build clean snapshot - exclude year-proxy properties (they're virtual)
  const snapshot = {};
  Object.keys(state).forEach(k => {
    if (YEAR_FIELDS.indexOf(k) === -1) snapshot[k] = state[k];
  });
  // Sync legacy meta.startgeld with selected year's startBalance
  try { snapshot.meta.startgeld = getYearData().startBalance; } catch {}
  const raw = JSON.stringify(snapshot);
  if (window.EA) window.EA.saveData(raw).catch(() => {});
  else { try { localStorage.setItem('fv_pro_data', raw); } catch {} }
}

async function loadData() {
  let raw = null;
  if (window.EA) { try { raw = await window.EA.loadData(); } catch {} }
  if (!raw) { try { raw = localStorage.getItem('fv_pro_data'); } catch {} }
  if (!raw) return;
  let saved;
  try { saved = JSON.parse(raw); } catch { return; }

  // ── MIGRATION: legacy v1/v2 (flat) → v3 (per-year) ─────────────────────
  if (!saved.dataVersion || saved.dataVersion < 3) {
    const year = String(saved.meta?.year || new Date().getFullYear());
    if (!saved.years) saved.years = {};
    if (!saved.years[year]) {
      saved.years[year] = createEmptyYearData(Number(year));
    }
    // Move flat fields into year
    const yd = saved.years[year];
    YEAR_FIELDS.forEach(f => {
      if (saved[f] !== undefined) {
        yd[f] = saved[f];
        delete saved[f];
      }
    });
    yd.startBalance = +(saved.meta?.startgeld) || 0;
    yd.status = 'active';
    saved.dataVersion = 3;
    saved.currentYear = Number(year);
    saved.selectedYear = Number(year);
    console.log('[Migration] v1→v3 done for year', year);
  }

  // ── Merge into state (preserves proxy properties) ───────────────────────
  const fields = ['meta','config','customCats','trash','imports','etfKurse','transactions',
                   'years','dataVersion','currentYear','selectedYear','backupHistory','yearEditUnlocked','reminders'];
  fields.forEach(f => { if (saved[f] !== undefined) state[f] = saved[f]; });
  if (!Array.isArray(state.reminders)) state.reminders = [];

  if (state.meta.email  === undefined) state.meta.email  = '';
  if (state.meta.paypal === undefined) state.meta.paypal = '';
  if (!state.imports)     state.imports     = [];
  if (!state.etfKurse)    state.etfKurse    = {};
  if (!state.trash)       state.trash       = [];
  if (!state.years)       state.years       = {};
  if (!state.selectedYear) state.selectedYear = state.meta.year || new Date().getFullYear();
  if (!state.currentYear)  state.currentYear  = state.selectedYear;
  // Migrate customCats: array → object
  if (Array.isArray(state.customCats)) {
    state.customCats = { ausgabe: state.customCats, einnahme: [], einkauf: [] };
  } else if (!state.customCats) {
    state.customCats = { ausgabe: [], einnahme: [], einkauf: [] };
  }
  // Ensure every year has full structure + fixkosten migration
  Object.keys(state.years).forEach(y => {
    const yd = state.years[y];
    YEAR_FIELDS.forEach(f => {
      if (yd[f] === undefined) yd[f] = f === 'incomeByMonth' ? emptyIncomeByMonth(Number(y)) : [];
    });
    if (yd.status === undefined) yd.status = 'active';
    if (yd.startBalance === undefined) yd.startBalance = 0;
    if (yd.closedAt === undefined) yd.closedAt = null;
    // Spesen migration: ensure month field
    (yd.spesen||[]).forEach(s => {
      if (!s.month && s.dateFrom) s.month = s.dateFrom.slice(0,7);
      else if (!s.month && s.date) s.month = s.date.slice(0,7);
    });
    // Fixkosten category migration
    const FK_CATS = {'Miete/Nebenkosten':'Wohnen','Strom':'Wohnen','Krankenzusatzvesicherung Zahn':'Versicherung','Privathaftpflicht':'Versicherung','Hausratversicherung':'Versicherung','Berufsunfähigkeitsversicherung':'Versicherung','Unfallversicherung ':'Versicherung','Unfallversicherung':'Versicherung','Rentenversicherung':'Versicherung','Sparen Trade/FNZ':'Sparen','Sparen Tagesgeld':'Sparen','Spotify':'Abo','Internet Vodafone':'Abo','Handy Vodafone':'Abo','AppleCare':'Abo','I-Tunes':'Abo','Amazon Prime':'Abo','Finanzierung':'Kredit','Fahrrad':'Kredit'};
    (yd.fixkosten||[]).forEach(f => {
      if (f.cat && f.cat !== f.category) f.category = f.cat;
      if (!f.category) f.category = FK_CATS[f.name?.trim()] || 'Sonstiges';
      delete f.cat;
    });
  });
  // Sync legacy: meta.startgeld = selected year's startBalance
  state.meta.startgeld = getYearData().startBalance;
}

// ── CATEGORIES ────────────────────────────────────────────────────────────

// ── SUPERMÄRKTE ────────────────────────────────────────────────────────────
const SUPERMAERKTE = [
  { name: 'Aldi', emoji: '🟦', color: '#004b97' },
  { name: 'Lidl', emoji: '🟡', color: '#0050aa' },
  { name: 'Rewe', emoji: '🔴', color: '#cc0000' },
  { name: 'Edeka', emoji: '🟡', color: '#ffcc00' },
  { name: 'Kaufland', emoji: '🔴', color: '#cc0000' },
  { name: 'Penny', emoji: '🔴', color: '#dd0000' },
  { name: 'Netto', emoji: '🟠', color: '#e8a000' },
  { name: 'Norma', emoji: '🔵', color: '#003d99' },
  { name: 'Real', emoji: '🔵', color: '#003d99' },
  { name: 'Globus', emoji: '🔵', color: '#004f9f' },
  { name: 'dm', emoji: '🩷', color: '#e40066' },
  { name: 'Rossmann', emoji: '🔴', color: '#cc0000' },
  { name: 'Müller', emoji: '🟠', color: '#f07d00' },
  { name: 'Budni', emoji: '🟢', color: '#00843d' },
  { name: 'Bäcker', emoji: '🥐', color: '#c8860a' },
  { name: 'Metzger', emoji: '🥩', color: '#8b0000' },
  { name: 'Wochenmarkt', emoji: '🥦', color: '#2d7d2d' },
  { name: 'Amazon Fresh', emoji: '📦', color: '#ff9900' },
  { name: 'Flink', emoji: '🛵', color: '#ff3c00' },
  { name: 'Gorillas', emoji: '🦍', color: '#000000' },
  { name: 'Picnic', emoji: '🧺', color: '#00a650' },
  { name: 'Sonstiges', emoji: '🛒', color: '#666666' },
];

const EXPENSE_CATS_DEFAULT = ['Essen & Trinken','Einkauf Lebensmittel','Einkauf Haushalt','Auto','Versicherungen','Miete & Wohnen','Kreditrate','Freizeit','Kleidung','Gesundheit','Abos & Software','Sonstige Ausgaben'];

function getExpenseCats() { return mergeCats(EXPENSE_CATS_DEFAULT, 'ausgabe'); }

// Backwards-compat aliases - any code reading these consts gets the merged list
Object.defineProperty(globalThis, 'EXPENSE_CATS', { get: () => getExpenseCats() });
Object.defineProperty(globalThis, 'INCOME_TYPES', { get: () => getIncomeTypes() });
Object.defineProperty(globalThis, 'EINKAUF_CATS', { get: () => getEinkaufCats() });

const SPESEN_LAENDER = [{"land": "Afghanistan", "halb": 20.0, "ganz": 30.0}, {"land": "Ägypten", "halb": 28.0, "ganz": 41.0}, {"land": "Äthiopien", "halb": 26.0, "ganz": 30.0}, {"land": "Äquatorialguinea", "halb": 24.0, "ganz": 36.0}, {"land": "Albanien", "halb": 20.0, "ganz": 30.0}, {"land": "Algerien", "halb": 34.0, "ganz": 51.0}, {"land": "Andorra", "halb": 28.0, "ganz": 41.0}, {"land": "Angola", "halb": 35.0, "ganz": 52.0}, {"land": "Antigua und Barbuda", "halb": 30.0, "ganz": 45.0}, {"land": "Argentinien", "halb": 24.0, "ganz": 35.0}, {"land": "Armenien", "halb": 16.0, "ganz": 24.0}, {"land": "Aserbaidschan", "halb": 20.0, "ganz": 30.0}, {"land": "Australien / Canberra", "halb": 34.0, "ganz": 51.0}, {"land": "Australien / Sydney", "halb": 45.0, "ganz": 68.0}, {"land": "Australien / im Übrigen", "halb": 34.0, "ganz": 51.0}, {"land": "Bahrain", "halb": 30.0, "ganz": 45.0}, {"land": "Bangladesch", "halb": 33.0, "ganz": 50.0}, {"land": "Barbados", "halb": 35.0, "ganz": 52.0}, {"land": "Belgien", "halb": 28.0, "ganz": 42.0}, {"land": "Benin", "halb": 35.0, "ganz": 52.0}, {"land": "Bolivien", "halb": 20.0, "ganz": 30.0}, {"land": "Bosnien und Herzegowina", "halb": 16.0, "ganz": 23.0}, {"land": "Botsuana", "halb": 31.0, "ganz": 46.0}, {"land": "Brasilien / Brasilia", "halb": 38.0, "ganz": 57.0}, {"land": "Brasilien / Rio de Janeiro", "halb": 38.0, "ganz": 57.0}, {"land": "Brasilien / Sao Paulo", "halb": 36.0, "ganz": 53.0}, {"land": "Brasilien / im Übrigen", "halb": 34.0, "ganz": 51.0}, {"land": "Brunei", "halb": 35.0, "ganz": 52.0}, {"land": "Bulgarien", "halb": 15.0, "ganz": 22.0}, {"land": "Burkina Faso", "halb": 25.0, "ganz": 38.0}, {"land": "Burundi", "halb": 24.0, "ganz": 36.0}, {"land": "Chile", "halb": 29.0, "ganz": 44.0}, {"land": "China / Chengdu", "halb": 28.0, "ganz": 41.0}, {"land": "China / Hongkong", "halb": 49.0, "ganz": 74.0}, {"land": "China / Kanton", "halb": 24.0, "ganz": 36.0}, {"land": "China / Peking", "halb": 20.0, "ganz": 30.0}, {"land": "China / Shanghai", "halb": 39.0, "ganz": 58.0}, {"land": "China / im Übrigen", "halb": 32.0, "ganz": 48.0}, {"land": "Costa Rica", "halb": 32.0, "ganz": 47.0}, {"land": "Cote d Ivoire", "halb": 40.0, "ganz": 59.0}, {"land": "Deutschland", "halb": 14.0, "ganz": 28.0}, {"land": "Dänemark", "halb": 39.0, "ganz": 58.0}, {"land": "Dominica", "halb": 30.0, "ganz": 45.0}, {"land": "Dominikanische Republik", "halb": 30.0, "ganz": 45.0}, {"land": "Dschibuti", "halb": 44.0, "ganz": 65.0}, {"land": "Ecuador", "halb": 29.0, "ganz": 44.0}, {"land": "El Salvador", "halb": 29.0, "ganz": 44.0}, {"land": "Eritrea", "halb": 33.0, "ganz": 50.0}, {"land": "Estland", "halb": 20.0, "ganz": 29.0}, {"land": "Fidschi", "halb": 23.0, "ganz": 34.0}, {"land": "Finnland", "halb": 33.0, "ganz": 50.0}, {"land": "Frankreich / Lyon", "halb": 36.0, "ganz": 53.0}, {"land": "Frankreich / Marseille", "halb": 31.0, "ganz": 46.0}, {"land": "Frankreich / Paris", "halb": 39.0, "ganz": 58.0}, {"land": "Frankreich / Straßburg", "halb": 34.0, "ganz": 51.0}, {"land": "Frankreich / im Übrigen", "halb": 29.0, "ganz": 44.0}, {"land": "Gabun", "halb": 35.0, "ganz": 52.0}, {"land": "Gambia", "halb": 20.0, "ganz": 30.0}, {"land": "Georgien", "halb": 24.0, "ganz": 35.0}, {"land": "Ghana", "halb": 31.0, "ganz": 46.0}, {"land": "Grenada", "halb": 30.0, "ganz": 45.0}, {"land": "Griechenland / Athen", "halb": 31.0, "ganz": 46.0}, {"land": "Griechenland / Im Übrigen", "halb": 24.0, "ganz": 36.0}, {"land": "Guatemala", "halb": 23.0, "ganz": 34.0}, {"land": "Guinea", "halb": 31.0, "ganz": 46.0}, {"land": "Guinea-Bissau", "halb": 16.0, "ganz": 24.0}, {"land": "Guyana", "halb": 30.0, "ganz": 45.0}, {"land": "Haiti", "halb": 39.0, "ganz": 58.0}, {"land": "Honduras", "halb": 32.0, "ganz": 48.0}, {"land": "Indien / Bangalore", "halb": 28.0, "ganz": 42.0}, {"land": "Indien / Chennai", "halb": 21.0, "ganz": 32.0}, {"land": "Indien / Kalkutta", "halb": 24.0, "ganz": 35.0}, {"land": "Indien / Mumbai", "halb": 33.0, "ganz": 50.0}, {"land": "Indien / Neu Delhi", "halb": 25.0, "ganz": 38.0}, {"land": "Indien / im Übrigen", "halb": 21.0, "ganz": 32.0}, {"land": "Indonesien", "halb": 24.0, "ganz": 36.0}, {"land": "Iran", "halb": 22.0, "ganz": 33.0}, {"land": "Irland", "halb": 39.0, "ganz": 58.0}, {"land": "Island", "halb": 32.0, "ganz": 47.0}, {"land": "Israel", "halb": 44.0, "ganz": 66.0}, {"land": "Italien / Mailand", "halb": 30.0, "ganz": 45.0}, {"land": "Italien / Rom", "halb": 27.0, "ganz": 40.0}, {"land": "Italien / im Übrigen", "halb": 27.0, "ganz": 40.0}, {"land": "Jamaika", "halb": 38.0, "ganz": 57.0}, {"land": "Japan / Tokio", "halb": 44.0, "ganz": 66.0}, {"land": "Japan / im Übrigen", "halb": 25.0, "ganz": 52.0}, {"land": "Jemen", "halb": 16.0, "ganz": 24.0}, {"land": "Jordanien", "halb": 31.0, "ganz": 46.0}, {"land": "Kambodscha", "halb": 25.0, "ganz": 38.0}, {"land": "Kamerun", "halb": 33.0, "ganz": 50.0}, {"land": "Kanada / Ottawa", "halb": 32.0, "ganz": 47.0}, {"land": "Kanada / Toronto", "halb": 34.0, "ganz": 51.0}, {"land": "Kanada / Vancouver", "halb": 33.0, "ganz": 50.0}, {"land": "Kanada / im Übrigen", "halb": 32.0, "ganz": 47.0}, {"land": "Kap Verde", "halb": 20.0, "ganz": 30.0}, {"land": "Kasachstan", "halb": 30.0, "ganz": 45.0}, {"land": "Katar", "halb": 37.0, "ganz": 56.0}, {"land": "Kenia", "halb": 34.0, "ganz": 51.0}, {"land": "Kirgisistan", "halb": 18.0, "ganz": 27.0}, {"land": "Kolumbien", "halb": 31.0, "ganz": 46.0}, {"land": "Kongo / Republik", "halb": 41.0, "ganz": 62.0}, {"land": "Kongo / Demokratische Republik", "halb": 47.0, "ganz": 70.0}, {"land": "Korea / Demokratische Volksrepublik", "halb": 19.0, "ganz": 28.0}, {"land": "Korea / Republik", "halb": 32.0, "ganz": 48.0}, {"land": "Kosovo", "halb": 16.0, "ganz": 23.0}, {"land": "Kroatien", "halb": 24.0, "ganz": 35.0}, {"land": "Kuba", "halb": 31.0, "ganz": 46.0}, {"land": "Kuwait", "halb": 37.0, "ganz": 56.0}, {"land": "Laos", "halb": 22.0, "ganz": 33.0}, {"land": "Lesotho", "halb": 16.0, "ganz": 24.0}, {"land": "Lettland", "halb": 24.0, "ganz": 35.0}, {"land": "Libanon", "halb": 40.0, "ganz": 59.0}, {"land": "Libyen", "halb": 42.0, "ganz": 63.0}, {"land": "Liechtenstein", "halb": 37.0, "ganz": 56.0}, {"land": "Litauen", "halb": 17.0, "ganz": 26.0}, {"land": "Luxemburg", "halb": 32.0, "ganz": 47.0}, {"land": "Madagaskar", "halb": 23.0, "ganz": 34.0}, {"land": "Malawi", "halb": 32.0, "ganz": 47.0}, {"land": "Malaysia", "halb": 23.0, "ganz": 34.0}, {"land": "Malediven", "halb": 35.0, "ganz": 52.0}, {"land": "Mali", "halb": 25.0, "ganz": 38.0}, {"land": "Malta", "halb": 31.0, "ganz": 46.0}, {"land": "Marokko", "halb": 28.0, "ganz": 42.0}, {"land": "Marshall Inseln", "halb": 42.0, "ganz": 63.0}, {"land": "Mauretanien", "halb": 26.0, "ganz": 39.0}, {"land": "Mauritius", "halb": 36.0, "ganz": 54.0}, {"land": "Mazedonien", "halb": 20.0, "ganz": 29.0}, {"land": "Mexiko", "halb": 32.0, "ganz": 48.0}, {"land": "Mikronesien", "halb": 22.0, "ganz": 33.0}, {"land": "Moldau / Republik", "halb": 16.0, "ganz": 24.0}, {"land": "Monaco", "halb": 28.0, "ganz": 42.0}, {"land": "Mongolei", "halb": 18.0, "ganz": 27.0}, {"land": "Montenegro", "halb": 20.0, "ganz": 29.0}, {"land": "Mosambik", "halb": 25.0, "ganz": 38.0}, {"land": "Myanmar", "halb": 24.0, "ganz": 35.0}, {"land": "Namibia", "halb": 20.0, "ganz": 30.0}, {"land": "Nepal", "halb": 24.0, "ganz": 36.0}, {"land": "Neuseeland", "halb": 37.0, "ganz": 56.0}, {"land": "Nicaragua", "halb": 24.0, "ganz": 36.0}, {"land": "Niederlande", "halb": 32.0, "ganz": 47.0}, {"land": "Niger", "halb": 28.0, "ganz": 42.0}, {"land": "Nigeria", "halb": 31.0, "ganz": 46.0}, {"land": "Norwegen", "halb": 53.0, "ganz": 80.0}, {"land": "Österreich", "halb": 33.0, "ganz": 50.0}, {"land": "Oman", "halb": 40.0, "ganz": 60.0}, {"land": "Pakistan / Islamabad", "halb": 16.0, "ganz": 23.0}, {"land": "Pakistan / im Übrigen", "halb": 23.0, "ganz": 34.0}, {"land": "Palau", "halb": 34.0, "ganz": 51.0}, {"land": "Panama", "halb": 26.0, "ganz": 39.0}, {"land": "Papua-Neuguinea", "halb": 40.0, "ganz": 60.0}, {"land": "Paraguay", "halb": 25.0, "ganz": 38.0}, {"land": "Peru", "halb": 23.0, "ganz": 34.0}, {"land": "Philippinen", "halb": 22.0, "ganz": 33.0}, {"land": "Polen / Breslau", "halb": 22.0, "ganz": 33.0}, {"land": "Polen / Danzig", "halb": 20.0, "ganz": 30.0}, {"land": "Polen / Krakau", "halb": 18.0, "ganz": 27.0}, {"land": "Polen / Warschau", "halb": 20.0, "ganz": 29.0}, {"land": "Polen / im Übrigen", "halb": 20.0, "ganz": 29.0}, {"land": "Portugal", "halb": 24.0, "ganz": 36.0}, {"land": "Ruanda", "halb": 31.0, "ganz": 46.0}, {"land": "Rumänien / Bukarest", "halb": 21.0, "ganz": 32.0}, {"land": "Rumänien / Im Übrigen", "halb": 18.0, "ganz": 27.0}, {"land": "Russische Föderation / Jekatarinenburg", "halb": 19.0, "ganz": 28.0}, {"land": "Russische Föderation / Moskau", "halb": 20.0, "ganz": 30.0}, {"land": "Russische Föderation / St. Petersburg", "halb": 17.0, "ganz": 26.0}, {"land": "Russische Föderation / Im Übrigen", "halb": 16.0, "ganz": 24.0}, {"land": "Sambia", "halb": 24.0, "ganz": 36.0}, {"land": "Samoa", "halb": 20.0, "ganz": 29.0}, {"land": "San Marino", "halb": 23.0, "ganz": 34.0}, {"land": "Sao Tome / Principe", "halb": 32.0, "ganz": 47.0}, {"land": "Saudi-Arabien / Djiddah", "halb": 25.0, "ganz": 38.0}, {"land": "Saudi-Arabien / Riad", "halb": 32.0, "ganz": 48.0}, {"land": "Saudi-Arabien / im Übrigen", "halb": 32.0, "ganz": 48.0}, {"land": "Schweden", "halb": 33.0, "ganz": 50.0}, {"land": "Schweiz / Genf", "halb": 44.0, "ganz": 66.0}, {"land": "Schweiz / im Übrigen", "halb": 43.0, "ganz": 64.0}, {"land": "Senegal", "halb": 28.0, "ganz": 42.0}, {"land": "Serbien", "halb": 13.0, "ganz": 20.0}, {"land": "Sierra Leone", "halb": 32.0, "ganz": 48.0}, {"land": "Simbabwe", "halb": 30.0, "ganz": 45.0}, {"land": "Singapur", "halb": 36.0, "ganz": 54.0}, {"land": "Slowakische Republik", "halb": 16.0, "ganz": 24.0}, {"land": "Slowenien", "halb": 22.0, "ganz": 33.0}, {"land": "Spanien / Barcelona", "halb": 23.0, "ganz": 34.0}, {"land": "Spanien / Kanarische Inseln", "halb": 27.0, "ganz": 40.0}, {"land": "Spanien / Palma de Mallorca", "halb": 24.0, "ganz": 35.0}, {"land": "Spanien / Madrid", "halb": 27.0, "ganz": 40.0}, {"land": "Spanien / im Übrigen", "halb": 23.0, "ganz": 34.0}, {"land": "Sri Lanka", "halb": 28.0, "ganz": 42.0}, {"land": "St. Kitts und Nevis", "halb": 30.0, "ganz": 45.0}, {"land": "St. Lucia", "halb": 30.0, "ganz": 45.0}, {"land": "St. Vincent und Grenadinen", "halb": 30.0, "ganz": 45.0}, {"land": "Sudan", "halb": 22.0, "ganz": 33.0}, {"land": "Südafrika / Kapstadt", "halb": 18.0, "ganz": 27.0}, {"land": "Südafrika / Johannisburg", "halb": 20.0, "ganz": 29.0}, {"land": "Südafrika / im Übrigen", "halb": 15.0, "ganz": 22.0}, {"land": "Süd-Sudan", "halb": 23.0, "ganz": 34.0}, {"land": "Suriname", "halb": 30.0, "ganz": 45.0}, {"land": "Syrien", "halb": 25.0, "ganz": 38.0}, {"land": "Tadschikistan", "halb": 18.0, "ganz": 27.0}, {"land": "Taiwan", "halb": 31.0, "ganz": 46.0}, {"land": "Tansania", "halb": 32.0, "ganz": 47.0}, {"land": "Thailand", "halb": 25.0, "ganz": 38.0}, {"land": "Togo", "halb": 26.0, "ganz": 39.0}, {"land": "Tonga", "halb": 26.0, "ganz": 39.0}, {"land": "Tobago und Trinidad", "halb": 30.0, "ganz": 45.0}, {"land": "Tschad", "halb": 43.0, "ganz": 64.0}, {"land": "Tschechische Republik", "halb": 21.0, "ganz": 35.0}, {"land": "Türkei / Istanbul", "halb": 17.0, "ganz": 26.0}, {"land": "Türkei / Izmir", "halb": 20.0, "ganz": 29.0}, {"land": "Türkei / im Übrigen", "halb": 12.0, "ganz": 17.0}, {"land": "Tunesien", "halb": 27.0, "ganz": 40.0}, {"land": "Turkmenistan", "halb": 22.0, "ganz": 33.0}, {"land": "Uganda", "halb": 28.0, "ganz": 41.0}, {"land": "Ukraine", "halb": 17.0, "ganz": 26.0}, {"land": "Ungarn", "halb": 15.0, "ganz": 22.0}, {"land": "Uruguay", "halb": 32.0, "ganz": 48.0}, {"land": "USA / Atlanta", "halb": 41.0, "ganz": 62.0}, {"land": "USA / Boston", "halb": 39.0, "ganz": 58.0}, {"land": "USA / Chicago", "halb": 36.0, "ganz": 54.0}, {"land": "USA / Houston", "halb": 42.0, "ganz": 63.0}, {"land": "USA / Los Angeles", "halb": 37.0, "ganz": 56.0}, {"land": "USA / Miami", "halb": 43.0, "ganz": 64.0}, {"land": "USA / New York City", "halb": 39.0, "ganz": 58.0}, {"land": "USA / San Francisco", "halb": 34.0, "ganz": 51.0}, {"land": "USA / Washington D.C.", "halb": 41.0, "ganz": 62.0}, {"land": "USA / Im Übrigen", "halb": 34.0, "ganz": 51.0}, {"land": "Usbekistan", "halb": 23.0, "ganz": 34.0}, {"land": "Vatikanstaat", "halb": 35.0, "ganz": 52.0}, {"land": "Venezuela", "halb": 30.0, "ganz": 45.0}, {"land": "Vereinigte Arabische Emirate", "halb": 44.0, "ganz": 65.0}, {"land": "Vereinigtes Königreich von Großbritannien und Nordirland / London", "halb": 41.0, "ganz": 62.0}, {"land": "Vereinigtes Königreich von Großbritannien und Nordirland / im Übrigen", "halb": 30.0, "ganz": 45.0}, {"land": "Vietnam", "halb": 28.0, "ganz": 41.0}, {"land": "Weißrussland", "halb": 13.0, "ganz": 20.0}, {"land": "Zentral-Afrikanische Republik", "halb": 31.0, "ganz": 46.0}, {"land": "Zypern", "halb": 30.0, "ganz": 45.0}];
const INCOME_TYPES_DEFAULT = ['Gehalt','Nebenjob','Verkauf','Steuerrückerstattung','Geschenk','Blutspende','Sonstiges'];
const EINKAUF_CATS_DEFAULT = ['Supermarkt','Drogerie','Bäcker/Metzger','Online'];

// Custom categories: stored grouped by domain  
// state.customCats can be:
//   - Array (legacy): treated as 'ausgabe' cats
//   - Object: { ausgabe: [...], einnahme: [...], einkauf: [...] }
function getCustomCats(group) {
  const cc = state.customCats;
  if (!cc) return [];
  if (Array.isArray(cc)) return group === 'ausgabe' ? cc : [];
  return Array.isArray(cc[group]) ? cc[group] : [];
}
function setCustomCats(group, list) {
  // Ensure object structure
  if (Array.isArray(state.customCats) || !state.customCats) {
    const legacy = Array.isArray(state.customCats) ? state.customCats : [];
    state.customCats = { ausgabe: legacy, einnahme: [], einkauf: [] };
  }
  state.customCats[group] = list;
}
function mergeCats(defaults, group) {
  const custom = getCustomCats(group).filter(c => c && c.trim());
  const seen = new Set(defaults.map(c => c.toLowerCase()));
  const merged = [...defaults];
  custom.forEach(c => {
    if (!seen.has(c.toLowerCase())) { merged.push(c); seen.add(c.toLowerCase()); }
  });
  return merged;
}
function getIncomeTypes()  { return mergeCats(INCOME_TYPES_DEFAULT,  'einnahme'); }
function getEinkaufCats()  { return mergeCats(EINKAUF_CATS_DEFAULT,  'einkauf'); }
// EXPENSE_CATS getter is already defined below

// ── CATEGORY RULES ────────────────────────────────────────────────────────
// Generische Erkennungsregeln für den Kontoauszug-Import. Bewusst ohne
// personenbezogene Daten (keine Arbeitgeber-/Personennamen), damit die App
// neutral weitergegeben werden kann. Eigene Begriffe lassen sich über die
// individuelle Kategorisierung in der App ergänzen.
const CAT_RULES = [
  { match: /umbuchung|sparplan|trade republic|tagesgeld|übertrag|uebertrag/i, cat: '__skip__' },
  { match: /gehalt|lohn|salär|salaer|bezüge|bezuege/i, cat: 'Gehalt', income: true },
  { match: /rewe|edeka|aldi|lidl|kaufland|netto|penny|norma|e-center|ecenter|e center|aldi sued/i, cat: 'Einkauf Lebensmittel' },
  { match: /\bdm\b|rossmann|müller|bäcker|baecker|konditorei|metzger/i, cat: 'Einkauf Lebensmittel' },
  { match: /restaurant|cafe|bäckerei|baeckerei|kebap|mcdonald|lieferando|imbiss|pizza|sushi/i, cat: 'Essen & Trinken' },
  { match: /shell|aral|esso|tankstelle|tanken/i, cat: 'Auto' },
  { match: /easypark|parkhaus|parken/i, cat: 'Auto' },
  { match: /jobrad|fahrrad.*leasing/i, cat: 'Kreditrate' },
  { match: /allianz|huk|versicherung|debeka|nürnberger|nuernberger/i, cat: 'Versicherungen' },
  { match: /miete|nebenkosten|strom|e wie einfach/i, cat: 'Miete & Wohnen' },
  { match: /vodafone|telekom|o2|internet/i, cat: 'Miete & Wohnen' },
  { match: /targobank|kreditrate|kredit/i, cat: 'Kreditrate' },
  { match: /apotheke|arzt|zahnarzt/i, cat: 'Gesundheit' },
  { match: /gym|fitness|fitnessstudio/i, cat: 'Freizeit' },
  { match: /spotify|netflix|apple\.com|amazon.*prime|amznprime/i, cat: 'Abos & Software' },
  { match: /ikea|obi|bauhaus|hornbach|toom|amazon payments|amazon eu/i, cat: 'Einkauf Haushalt' },
  { match: /myprotein|paypal europe/i, cat: 'Sonstige Ausgaben' },
  { match: /zalando|h&m|c&a|kleidung|schuhe/i, cat: 'Kleidung' },
  { match: /kleinanzeigen|vinted|ebay/i, cat: 'Verkauf', income: true },
];

function classify(desc, amount) {
  if (/paypal.*instant/i.test(desc) && amount > 0) return { cat: 'Verkauf', income: true };
  for (const r of CAT_RULES) {
    if (r.match.test(desc)) {
      if (r.cat === '__skip__') return null;
      return { cat: r.cat, income: r.income || false };
    }
  }
  return amount >= 0 ? { cat: 'Sonstiges', income: true } : { cat: 'Sonstige Ausgaben', income: false };
}

// ── FIXKOSTEN HELPERS ─────────────────────────────────────────────────────
// Zählt die Monate zwischen zwei YYYY-MM (a..b), 0 wenn gleich.
function monthDiff(a, b) {
  const [ay,am] = a.split('-').map(Number);
  const [by,bm] = b.split('-').map(Number);
  return (by-ay)*12 + (bm-am);
}
// Ist eine Fixkost im gegebenen Monat fällig? Berücksichtigt Start, Ende und
// Rhythmus (interval = alle X Monate, voller Betrag im ersten Monat des Intervalls).
function fixkostenAktivImMonat(f, month) {
  const start = f.start || month;
  const end   = f.end || month;
  if (month < start || month > end) return false;
  const iv = +f.interval || 1;             // 1 = monatlich (Standard / Altbestand)
  if (iv <= 1) return true;
  return (monthDiff(start, month) % iv) === 0;
}
function fixkostenForMonth(month) {
  return state.fixkosten.filter(f => fixkostenAktivImMonat(f, month));
}
function fixkostenTotal(month) {
  return fixkostenForMonth(month).reduce((s, f) => s + f.amount, 0);
}

// ── FINANCIALS FOR MONTH ──────────────────────────────────────────────────
function getVormonatSaldo(month) {
  const yr = month.slice(0,4);
  const yd = getYearData(yr);
  const allMonths = monthsBetween(yr + '-01', yr + '-12');
  const idx = allMonths.indexOf(month);
  const startBalance = +(yd.startBalance) || 0;
  if (idx <= 0) return startBalance;
  let saldo = startBalance;
  for (let i = 0; i < idx; i++) {
    const f = monthFinancials(allMonths[i], false);
    saldo += f.cashflow;
  }
  return Math.round(saldo * 100) / 100;
}

// ── Multi-Konto-Modell ──────────────────────────────────────────────────────
// Konten leben pro Jahr in yd.konten = [{id, name, start, cashflow}].
// 'cashflow:true' = Buchungen dieses Kontos zählen zum Monats-Cashflow.
// Migration: fehlt die Liste, wird ein Konto "Girokonto" mit dem bisherigen
// startBalance (cashflow:true) angelegt; bestehende Buchungen ohne kontoId
// gelten als auf diesem ersten Konto.
// ── Konten-CRUD (Settings) ──────────────────────────────────────────────────
function addKonto() {
  if (!requireUnlocked()) return;
  const yd = getYearData();
  getKonten(); // sorgt für Migration
  yd.konten.push({ id: 'k_' + uid(), name: 'Neues Konto', start: 0, cashflow: false });
  syncStartgeldAusKonten();
  saveData(); renderPage();
}
function updateKonto(id, field, val) {
  if (!requireUnlocked()) return;
  const k = kontoById(id);
  if (!k) return;
  if (field === 'start') val = +val || 0;
  k[field] = val;
  if (field === 'start') syncStartgeldAusKonten();
  saveData(); renderPage();
}
function deleteKonto(id) {
  if (!requireUnlocked()) return;
  const yd = getYearData();
  const ks = getKonten();
  if (ks.length <= 1) { showToast('Mindestens ein Konto muss bleiben','info'); return; }
  // Buchungen dieses Kontos auf das erste verbleibende Konto umhängen
  const rest = ks.filter(k => k.id !== id);
  const fallback = (rest.find(k=>k.cashflow) || rest[0]).id;
  (state.ausgaben||[]).forEach(a => { if ((a.kontoId||defaultKontoId()) === id) a.kontoId = fallback; });
  (state.einnahmen||[]).forEach(e => { if ((e.kontoId||defaultKontoId()) === id) e.kontoId = fallback; });
  yd.konten = rest;
  syncStartgeldAusKonten();
  saveData(); renderPage();
  showToast('Konto gelöscht, Buchungen umgehängt','info');
}
// Gesamt-Startgeld = Summe aller Konten-Startwerte (hält startBalance konsistent).
function syncStartgeldAusKonten() {
  const yd = getYearData();
  const sum = getKonten().reduce((s,k) => s + (+k.start||0), 0);
  yd.startBalance = Math.round(sum * 100) / 100;
  if (state.meta) state.meta.startgeld = yd.startBalance;
}
//MARKkontencrud
function getKonten(yr) {
  const yd = getYearData(yr);
  if (!yd) return [];
  if (!Array.isArray(yd.konten) || yd.konten.length === 0) {
    yd.konten = [{
      id: 'k_giro',
      name: 'Girokonto',
      start: +(yd.startBalance) || 0,
      cashflow: true,
    }];
  }
  return yd.konten;
}
function getCashflowKontoIds(yr) {
  return getKonten(yr).filter(k => k.cashflow).map(k => k.id);
}
// Default-Konto für neue Buchungen = erstes Cashflow-Konto (oder erstes Konto).
function defaultKontoId(yr) {
  const ks = getKonten(yr);
  const cf = ks.find(k => k.cashflow);
  return (cf || ks[0] || {id:'k_giro'}).id;
}
function kontoById(id, yr) {
  return getKonten(yr).find(k => k.id === id) || null;
}
// Gehört eine Buchung zu einem Cashflow-Konto? (fehlende kontoId = Default/erstes)
function istCashflowBuchung(b, yr) {
  const ids = getCashflowKontoIds(yr);
  const kid = b.kontoId || defaultKontoId(yr);
  return ids.includes(kid);
}
// Netto-Bewegung eines Kontos im Jahr bis einschl. month (Einnahmen − Ausgaben).
function kontoNetBis(kontoId, month) {
  const ausg = (state.ausgaben||[]).filter(a => (a.kontoId||defaultKontoId()) === kontoId && !a._korrektur && (!month || a.month <= month))
    .reduce((s,a) => s + (+a.amount||0), 0);
  const einn = (state.einnahmen||[]).filter(e => (e.kontoId||defaultKontoId()) === kontoId && !e._korrektur && (!month || e.month <= month) && !['Gehalt','Nebenjob'].includes(e.type))
    .reduce((s,e) => s + (+e.amount||0), 0);
  // Wiederkehrende Einnahmen dieses Kontos: für jeden aktiven Monat bis 'month' zählen.
  let regel = 0;
  const yr = getSelectedYear();
  // Ohne explizites 'month': bis heute zählen (nicht bis Dezember!), begrenzt aufs Jahr.
  const heute = thisMonth();
  const jahrEnde = yr + '-12';
  const grenze = month || (heute <= jahrEnde && heute >= (yr + '-01') ? heute : jahrEnde);
  (state.regelEinnahmen||[]).forEach(r => {
    if ((r.kontoId||defaultKontoId()) !== kontoId) return;
    const start = r.startMonth || (yr + '-01');
    const end = r.endMonth || grenze;
    // Monate von start bis min(end, grenze) zählen
    const bisM = (end < grenze) ? end : grenze;
    if (bisM >= start) monthsBetween(start, bisM).forEach(() => { regel += (+r.amount||0); });
  });
  // Fixkosten-Sparen mit Zielkonto = diesem Konto: monatliche Sparbeträge gutschreiben.
  // Nur Bargeld-Sparen (kein Wertpapierkauf) zählt als Cash-Zufluss aufs Konto.
  let sparTransfer = 0;
  (state.fixkosten||[]).forEach(f => {
    if (!f.sparenLink || f.sparenLink.extern) return;
    if (f.sparenLink.zielkonto !== kontoId) return;
    if (f.sparenLink.sparTyp && f.sparenLink.sparTyp !== 'bargeld') return;
    const start = f.start || (yr + '-01');
    const end = f.end || grenze;
    const bisM = (end < grenze) ? end : grenze;
    if (bisM >= start) monthsBetween(start, bisM).forEach((m) => { if (fixkostenAktivImMonat(f, m)) sparTransfer += (+f.amount||0); });
  });
  // Umbuchungen: Abgang bei vonKonto, Zugang bei nachKonto (bis einschl. month)
  let umb = 0;
  (state.umbuchungen||[]).forEach(u => {
    const um = u.month || (u.date||'').slice(0,7);
    if (month && um > month) return;
    if (u.nachKonto === kontoId) umb += (+u.amount||0);
    if (u.vonKonto === kontoId) umb -= (+u.amount||0);
  });
  // Gehalt/Nebenjob → zugeordnetes Konto; Fixkosten/Einkäufe/Spesen → Default-Konto.
  // So ist der Saldo jedes Kontos vollständig über kontoNetBis bestimmt und
  // unabhängig vom Cashflow-Flag (das nur die Cashflow-Anzeige steuert).
  let sonst = 0;
  const def = defaultKontoId();
  const months = monthsBetween(yr + '-01', grenze);
  months.forEach(m => {
    const inc = state.incomeByMonth[m] || { gehalt: 0, nebenjob: 0 };
    if (getGehaltKonto(yr) === kontoId)   sonst += (+inc.gehalt||0);
    if (getNebenjobKonto(yr) === kontoId) sonst += (+inc.nebenjob||0);
    // Fixkosten mindern ihr zugeordnetes Konto (Default für Altbestand ohne kontoId).
    (state.fixkosten||[]).forEach(f => {
      if ((f.kontoId||def) !== kontoId) return;
      if (fixkostenAktivImMonat(f, m)) sonst -= (+f.amount||0);
    });
    // Einkäufe mindern ihr zugeordnetes Konto (Default für Altbestand).
    (state.einkaeufe||[]).forEach(e => {
      if (e.month !== m) return;
      if ((e.kontoId||def) === kontoId) sonst -= (+e.amount||0);
    });
    // Spesen-Saldo (Spesen − Ausgaben) auf zugeordnetes Konto (Default für Altbestand).
    (state.spesen||[]).forEach(t => {
      if (t.month !== m) return;
      if ((t.kontoId||def) === kontoId) sonst += (+(t.allowance||0) - +(t.ausgaben||0));
    });
  });
  return einn + regel + sparTransfer + umb + sonst - ausg;
}
// Aktueller Saldo eines Kontos = Startwert + Netto-Bewegung des Jahres.
// Cashflow-Konten: voller Geldfluss (Gehalt/Nebenjob/Fixkosten/Einkäufe/Spesen
// gehören per Definition zum Cashflow-Konto und werden mitgerechnet).
// Reserve-Konten: nur explizit zugeordnete Ausgaben/Einnahmen.
function kontoSaldo(kontoId, month) {
  const k = kontoById(kontoId);
  if (!k) return 0;
  // Saldo = Startwert + Netto-Bewegung bis einschl. gewähltem Monat.
  // Ohne Angabe: aktuell gewählter Monat (currentMonth), nicht der reale Heute-Monat.
  const grenze = month || (typeof currentMonth !== 'undefined' ? currentMonth : null);
  let netto = kontoNetBis(kontoId, grenze);
  let korr = 0;
  (state.einnahmen||[]).forEach(e => { if (e._korrektur && (e.kontoId||defaultKontoId()) === kontoId && (!grenze || (e.month||'') <= grenze)) korr += (+e.amount||0); });
  (state.ausgaben||[]).forEach(a => { if (a._korrektur && (a.kontoId||defaultKontoId()) === kontoId && (!grenze || (a.month||'') <= grenze)) korr -= (+a.amount||0); });
  return Math.round(((+k.start||0) + netto + korr) * 100) / 100;
}
// Summe Netto-Bewegung aller NICHT-Cashflow-Konten bis month (für Gesamtsaldo).
function nichtCashflowNetBis(month) {
  return getKonten().filter(k => !k.cashflow)
    .reduce((s,k) => s + kontoNetBis(k.id, month), 0);
}

// ── Konto-Auswahl-Modal (für Ausgaben + Einnahmen) ──────────────────────────
// Zeigt alle Konten als Auswahl. Gibt gewählte kontoId zurück (oder null bei Abbruch).
function askKontoWahl(opts) {
  return new Promise((resolve) => {
    const o = opts || {};
    const ks = getKonten();
    const aktuelle = o.kontoId || defaultKontoId();
    const isDark = document.documentElement.classList.contains('theme-dark');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)';
    const optionsHtml = ks.map(k =>
      '<button class="konto-wahl-btn" data-kid="' + k.id + '" style="display:flex;justify-content:space-between;align-items:center;width:100%;text-align:left;padding:12px 14px;margin:6px 0;border:1px solid var(--border);border-radius:8px;background:' +
      (k.id === aktuelle ? 'var(--surface-2)' : 'transparent') + ';color:var(--text);cursor:pointer;font-size:14px">' +
        '<span><strong>' + (k.name||'Konto') + '</strong>' +
          (k.cashflow ? ' <span class="badge badge-green" style="font-size:9px">CASHFLOW</span>' : ' <span class="badge badge-muted" style="font-size:9px">Reserve</span>') +
        '</span>' +
        '<span style="color:var(--muted)">Saldo: ' + fmtEur(kontoSaldo(k.id)) + '</span>' +
      '</button>'
    ).join('') + (o.extraOptions||[]).map(eo =>
      '<button class="konto-wahl-btn" data-kid="' + eo.value + '" style="display:flex;justify-content:space-between;align-items:center;width:100%;text-align:left;padding:12px 14px;margin:6px 0;border:1px dashed var(--border);border-radius:8px;background:' +
      (eo.value === aktuelle ? 'var(--surface-2)' : 'transparent') + ';color:var(--text);cursor:pointer;font-size:14px">' +
        '<span><strong>' + eo.label + '</strong></span>' +
        (eo.hint ? '<span style="color:var(--muted)">' + eo.hint + '</span>' : '') +
      '</button>'
    ).join('');
    overlay.innerHTML =
      '<div style="background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:12px;padding:0;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.5);animation:fadeIn .15s ease-out">' +
        '<div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px">' +
          '<div style="font-size:28px;line-height:1">' + (o.icon||'🏦') + '</div>' +
          '<h3 style="margin:0;font-size:16px;font-weight:600;color:var(--text)">' + (o.title||'Welches Konto?') + '</h3>' +
        '</div>' +
        '<div style="padding:18px 22px;font-size:14px;line-height:1.5;color:var(--text)">' +
          (o.message ? '<p style="margin:0 0 8px">' + o.message + '</p>' : '') +
          optionsHtml +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    function cleanup(kid) { overlay.remove(); resolve(kid); }
    overlay.querySelectorAll('.konto-wahl-btn').forEach(btn => {
      btn.addEventListener('click', () => cleanup(btn.getAttribute('data-kid')));
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(null); });
  });
}

// Abfrage für Ausgabe: Konto wählen, Ergebnis speichern.
async function askAusgabeKonto(eintrag) {
  if (!eintrag) return;
  const kid = await askKontoWahl({
    title: 'Ausgabe – welches Konto?',
    icon: '🏦',
    message: 'Ausgabe' + (eintrag.desc ? ' (' + eintrag.desc + ')' : '') + ' über ' + fmtEur(+eintrag.amount||0) + ':',
    kontoId: eintrag.kontoId,
  });
  if (kid) { eintrag.kontoId = kid; }
  saveData(); if (typeof updateBadges==='function') updateBadges(); renderPage();
  const k = kontoById(eintrag.kontoId);
  if (k) showToast(k.name + (k.cashflow ? ' (im Cashflow)' : ' (Reserve, nicht im Cashflow)'), 'info');
}

// Abfrage für Einnahme: erst Konto, dann (nur bei Cashflow-Konto) bar?
async function askEinnahmeKonto(eintrag) {
  if (!eintrag) return;
  const kid = await askKontoWahl({
    title: 'Einnahme – welches Konto?',
    icon: '💰',
    message: 'Einnahme' + (eintrag.source ? ' (' + eintrag.source + ')' : '') + ' über ' + fmtEur(+eintrag.amount||0) + ':',
    kontoId: eintrag.kontoId,
  });
  if (kid) eintrag.kontoId = kid;
  const k = kontoById(eintrag.kontoId);
  if (k && !k.cashflow) {
    eintrag.bar = false;
    saveData(); if (typeof updateBadges==='function') updateBadges(); renderPage();
    showToast(k.name + ' gutgeschrieben (Reserve)', 'info');
    return;
  }
  // Cashflow-Konto → bar-Frage
  const aufsKonto = await uiConfirm({
    title: 'Einnahme verbuchen', icon: '💰',
    message: 'Einnahme über ' + fmtEur(+eintrag.amount||0) + ' – wie verbuchen?',
    details: ['Aufs Konto: zählt zum Cashflow.', 'Bar zur Seite: aus dem Cashflow herausgehalten.'],
    okLabel: 'Aufs Konto', cancelLabel: 'Bar zur Seite',
  });
  eintrag.bar = !aufsKonto;
  saveData(); if (typeof updateBadges==='function') updateBadges(); renderPage();
  showToast(eintrag.bar ? 'Bar (nicht im Cashflow)' : 'Aufs Konto verbucht', 'info');
}

// Schneller Zeilen-Umschalter: Konto-Auswahl per Modal (Ausgabe).
async function pickAusgabeKonto(id) {
  if (!requireUnlocked()) return;
  const a = state.ausgaben.find(x => String(x.id)===String(id)); if (!a) return;
  await askAusgabeKonto(a);
}
async function pickRegelEinnahmeKonto(id) {
  if (!requireUnlocked()) return;
  const r = (state.regelEinnahmen||[]).find(x => String(x.id)===String(id));
  if (!r) return;
  const kid = await askKontoWahl({
    title: 'Wiederkehrende Einnahme – welches Konto?',
    icon: '🔁',
    message: (r.source||'Einnahme') + ' (' + fmtEur(+r.amount||0) + '/Monat):',
    kontoId: r.kontoId,
  });
  if (kid) { r.kontoId = kid; saveData(); if (typeof updateBadges==='function') updateBadges(); renderPage();
    const k = kontoById(kid); if (k) showToast(k.name + (k.cashflow?' (im Cashflow)':' (Reserve)'), 'info'); }
}
async function pickFixkZielkonto(id) {
  if (!requireUnlocked()) return;
  const f = (state.fixkosten||[]).find(x => String(x.id)===String(id));
  if (!f || !f.sparenLink) return;
  const kid = await askKontoWahl({
    title: 'Sparen – Zielkonto wählen',
    icon: '💸',
    message: 'Wohin soll „' + (f.name||'Sparen') + '" (' + fmtEur(+f.amount||0) + '/Monat) gespart werden?',
    kontoId: f.sparenLink.extern ? '__extern__' : f.sparenLink.zielkonto,
    extraOptions: [{ value:'__extern__', label:'🌍 Extern', hint:'verlässt alle Konten' }],
  });
  if (kid) {
    if (kid === '__extern__') { f.sparenLink.extern = true; f.sparenLink.zielkonto = ''; }
    else { f.sparenLink.extern = false; f.sparenLink.zielkonto = kid; }
    saveData(); if (typeof updateBadges==='function') updateBadges(); renderPage();
    showToast(kid === '__extern__' ? 'Sparen extern (echte Ausgabe)' : 'Zielkonto: ' + (kontoById(kid)?.name||''), 'info');
  }
}
async function pickFixkKonto(id) {
  if (!requireUnlocked()) return;
  const f = (state.fixkosten||[]).find(x => String(x.id)===String(id));
  if (!f) return;
  const kid = await askKontoWahl({
    title: 'Fixkost – von welchem Konto?',
    icon: '🏦',
    message: '„' + (f.name||'Fixkost') + '" (' + fmtEur(+f.amount||0) + '/Monat) geht ab von:',
    kontoId: f.kontoId || defaultKontoId(),
  });
  if (kid) {
    f.kontoId = kid;
    saveData(); if (typeof updateBadges==='function') updateBadges(); renderPage();
    const k = kontoById(kid); if (k) showToast('Von Konto: ' + k.name, 'info');
  }
}
async function pickEinnahmeKonto(id) {
  if (!requireUnlocked()) return;
  const e = state.einnahmen.find(x => String(x.id)===String(id)); if (!e) return;
  await askEinnahmeKonto(e);
}
//MARKkontohelpers
function monthFinancials(month, includeVormonat = true) {
  const inc = state.incomeByMonth[month] || { gehalt: 0, nebenjob: 0 };
  const einnahmenExtra = state.einnahmen.filter(e => e.month === month && !e.bar && !e._korrektur && istCashflowBuchung(e) && !['Gehalt','Nebenjob'].includes(e.type));//MARKcf
  const extraIncome = einnahmenExtra.reduce((s, e) => s + e.amount, 0);
  // Wiederkehrende Einnahmen die diesen Monat aktiv sind
  const regelIncome = (state.regelEinnahmen||[])
    .filter(r => (!r.startMonth || r.startMonth <= month) && (!r.endMonth || r.endMonth >= month) && istCashflowBuchung(r))
    .reduce((s,r) => s + r.amount, 0);
  const totalIncome = inc.gehalt + inc.nebenjob + extraIncome + regelIncome;
  // For display: combine extra + regel so columns show correct totals
  const extraIncomeTotal = extraIncome + regelIncome;

  const fixTotal = fixkostenTotal(month);
  const einkTotal = state.einkaeufe.filter(e => e.month === month).reduce((s, e) => s + e.amount, 0);
  const ausgTotal = state.ausgaben.filter(a => a.month === month && !a._korrektur && istCashflowBuchung(a)).reduce((s, a) => s + a.amount, 0);

  const spesen = state.spesen.filter(s => s.month === month);
  const spesenSaldo = spesen.reduce((s, t) => s + (+(t.allowance||0) - +(t.ausgaben||0)), 0);

  const totalExpenses = fixTotal + einkTotal + ausgTotal;
  const cashflow = totalIncome + spesenSaldo - totalExpenses;

  // Kumulativer Saldo: Startgeld + alle Vormonate + aktueller Cashflow
  const vormonatSaldo = includeVormonat ? getVormonatSaldo(month) : 0;
  const _ncNet = nichtCashflowNetBis(month);
  // Korrektur-Buchungen auf Cashflow-Konten sind aus 'cashflow' ausgeschlossen,
  // müssen aber im Gesamtsaldo zählen → bis 'month' separat summieren.
  let _korrCf = 0;
  const _cfIds = getCashflowKontoIds();
  (state.einnahmen||[]).forEach(e => { if (e._korrektur && e.month <= month && _cfIds.includes(e.kontoId||defaultKontoId())) _korrCf += (+e.amount||0); });
  (state.ausgaben||[]).forEach(a => { if (a._korrektur && a.month <= month && _cfIds.includes(a.kontoId||defaultKontoId())) _korrCf -= (+a.amount||0); });
  const endsaldo = Math.round((vormonatSaldo + cashflow + _ncNet + _korrCf) * 100) / 100;

  return { totalIncome, inc, extraIncome: extraIncomeTotal, regelIncome, fixTotal, einkTotal, ausgTotal, spesenSaldo, totalExpenses, cashflow, vormonatSaldo, endsaldo };
}

// ── Cashflow pro Konto für einen Monat ──────────────────────────────────────
// Das erste Cashflow-Konto (Default) trägt zusätzlich Gehalt/Fixkosten/Einkäufe/
// Spesen, da diese keine eigene kontoId haben. Weitere Cashflow-Konten zählen
// nur ihre eigenen Ein-/Ausgaben. Umbuchungen wirken −Betrag beim Quell- und
// +Betrag beim Zielkonto (gesamt neutral).
function kontoCashflowMonat(kontoId, month) {
  const def = defaultKontoId();
  const ausg = (state.ausgaben||[])
    .filter(a => (a.kontoId||def) === kontoId && a.month === month && !a._korrektur)
    .reduce((s,a) => s + (+a.amount||0), 0);
  const einn = (state.einnahmen||[])
    .filter(e => (e.kontoId||def) === kontoId && e.month === month && !e._korrektur && !e.bar && !['Gehalt','Nebenjob'].includes(e.type))
    .reduce((s,e) => s + (+e.amount||0), 0);
  const regel = (state.regelEinnahmen||[])
    .filter(r => (r.kontoId||def) === kontoId && (!r.startMonth || r.startMonth <= month) && (!r.endMonth || r.endMonth >= month))
    .reduce((s,r) => s + (+r.amount||0), 0);
  // Sparen-Transfer (Bargeld, intern): Zielkonto bekommt den Sparbetrag gutgeschrieben.
  const sparIn = (state.fixkosten||[])
    .filter(f => f.sparenLink && !f.sparenLink.extern && f.sparenLink.zielkonto === kontoId
      && (!f.sparenLink.sparTyp || f.sparenLink.sparTyp === 'bargeld')
      && fixkostenAktivImMonat(f, month))
    .reduce((s,f) => s + (+f.amount||0), 0);
  // Fixkosten dieses Kontos (Quelle = kontoId, Default für Altbestand)
  const fixK = (state.fixkosten||[])
    .filter(f => (f.kontoId||def) === kontoId && fixkostenAktivImMonat(f, month))
    .reduce((s,f) => s + (+f.amount||0), 0);
  // Umbuchungen: Abgang bei vonKonto, Zugang bei nachKonto
  const umbAus = (state.umbuchungen||[])
    .filter(u => u.vonKonto === kontoId && (u.month || (u.date||'').slice(0,7)) === month)
    .reduce((s,u) => s + (+u.amount||0), 0);
  const umbEin = (state.umbuchungen||[])
    .filter(u => u.nachKonto === kontoId && (u.month || (u.date||'').slice(0,7)) === month)
    .reduce((s,u) => s + (+u.amount||0), 0);

  let cf = einn + regel + sparIn + umbEin - ausg - umbAus - fixK;

  // Gehalt/Nebenjob fließen dem zugeordneten Konto zu.
  const inc = state.incomeByMonth[month] || { gehalt: 0, nebenjob: 0 };
  if (getGehaltKonto() === kontoId)   cf += (+inc.gehalt||0);
  if (getNebenjobKonto() === kontoId) cf += (+inc.nebenjob||0);

  // Einkäufe + Spesen-Saldo dieses Kontos (Default für Altbestand)
  const eink = (state.einkaeufe||[])
    .filter(e => (e.kontoId||def) === kontoId && e.month === month)
    .reduce((s,e) => s + (+e.amount||0), 0);
  const spesen = (state.spesen||[])
    .filter(t => (t.kontoId||def) === kontoId && t.month === month)
    .reduce((s,t) => s + (+(t.allowance||0) - +(t.ausgaben||0)), 0);
  cf += -eink + spesen;

  return Math.round(cf * 100) / 100;
}

// ── NAVIGATION ────────────────────────────────────────────────────────────
function navigate(page) {
  currentPage = page;
  // Update active nav item by matching onclick content
  document.querySelectorAll('.nav-item').forEach(b => {
    const oc = b.getAttribute('onclick') || '';
    b.classList.toggle('active', oc.includes("'" + page + "'"));
  });
  const titles = {
    dashboard: ['Übersicht', 'Dashboard'],
    jahresuebersicht: ['Jahresübersicht', getSelectedYear() + ' im Überblick'],
    buchungen: ['Monatsauswertung', 'Alle Buchungen'],
    einkaeufe: ['Monatsauswertung', 'Einkäufe'],
    ausgaben: ['Monatsauswertung', 'Ausgaben'],
    einnahmen: ['Monatsauswertung', 'Einnahmen & Verkäufe'],
    spesen: ['Reisen', 'Spesen & Geschäftsreisen'],
    fixkosten: ['Planung', 'Fixkosten'],
    sparen: ['Planung', 'Sparen & Depot'],
    zaehler: ['Planung', 'Zählerstände'],
    finanzprodukte: ['Planung', 'Finanzprodukte'],  
    einstellungen: ['App', 'Einstellungen'],
    tabellen: ['Planung', 'Eigene Tabellen'],
    einstellungen: ['App', 'Einstellungen'],
    import: ['Kontoauszug', 'PDF Import'],
  };
  const [eyebrow, title] = titles[page] || ['', page];
  if(el('topbar_eyebrow')) el('topbar_eyebrow').textContent = eyebrow;
  if(el('topbar_title')) el('topbar_title').textContent = title;
  renderPage();
  // Scroll to top only when changing page
  const pc = el('pageContent');
  if (pc) pc.scrollTop = 0;
}

function onMonthChange() {
  currentMonth = el('monthSelector').value;
  renderPage();
  updateBadges();
}

function buildMonthSelector() {
  const sel = el('monthSelector');
  if (sel) sel.innerHTML = allMonths2026.map(m => `<option value="${m}" ${m === currentMonth ? 'selected' : ''}>${monthLabel(m)}</option>`).join('');
  buildYearSelector();
}

function buildYearSelector() {
  const sel = el('yearSelector');
  if (!sel) return;
  // Ensure current year exists in state.years
  const sy = getSelectedYear();
  if (!state.years[sy]) state.years[sy] = createEmptyYearData(Number(sy));
  // Build year list - existing + ability to add new
  const years = listYears();
  if (!years.includes(sy)) years.push(sy);
  years.sort();
  const opts = years.map(y => {
    const yd = state.years[y] || {};
    const lock = yd.status === 'closed' ? ' 🔒' : '';
    return '<option value="' + y + '" ' + (y === sy ? 'selected' : '') + '>' + y + lock + '</option>';
  }).join('');
  sel.innerHTML = opts + '<option value="__new__">+ Neues Jahr…</option>';
}

function createNewYear() {
  // Open custom modal (prompt() is blocked in Electron)
  const modal = document.getElementById('newYearModal');
  if (!modal) {
    console.error('newYearModal not found in DOM');
    showToast('Fehler: Modal nicht gefunden', 'error');
    return;
  }
  const inp = document.getElementById('newYear_input');
  if (inp) inp.value = String(new Date().getFullYear() + 1);
  modal.classList.remove('hidden');
  setTimeout(() => inp?.focus(), 100);
}

function closeNewYearModal() {
  const modal = document.getElementById('newYearModal');
  if (modal) modal.classList.add('hidden');
}

function confirmNewYear() {
  const inp = document.getElementById('newYear_input');
  const input = (inp?.value || '').trim();
  if (!input) { showToast('Bitte ein Jahr eingeben', 'error'); return; }
  const newYr = parseInt(input);
  if (!newYr || newYr < 2000 || newYr > 2100) { showToast('Ungültiges Jahr (2000–2100)', 'error'); return; }
  if (state.years[String(newYr)]) { showToast('Jahr ' + newYr + ' existiert bereits', 'error'); return; }
  const takeBalance = document.getElementById('newYear_takeBalance')?.checked;
  const takeFixkosten = document.getElementById('newYear_takeFixkosten')?.checked;
  const takeRegel = document.getElementById('newYear_takeRegel')?.checked;
  state.years[String(newYr)] = createEmptyYearData(newYr);
  // Take over data from previous year based on checkboxes
  const prev = String(newYr - 1);
  if (state.years[prev]) {
    const prevYr = state.years[prev];
    if (takeBalance) {
      // Endstand Vorjahr über die konto-genaue Logik berechnen, sofern das
      // Vorjahr gerade ausgewählt ist (kontoSaldo rechnet fürs ausgewählte Jahr).
      // Sonst Fallback auf gespeicherten startBalance des Vorjahres.
      if (String(getSelectedYear()) === prev) {
        const sum = getKonten(prev).reduce((s,k) => s + kontoSaldo(k.id, prev + '-12'), 0);
        state.years[String(newYr)].startBalance = Math.round(sum * 100) / 100;
      } else {
        state.years[String(newYr)].startBalance = +(prevYr.startBalance) || 0;
      }
    }
    if (takeFixkosten) {
      state.years[String(newYr)].fixkosten = (prevYr.fixkosten||[]).map(f => ({
        ...f, id: uid(),
        start: String(newYr) + '-01',
        end:   String(newYr) + '-12',
      }));
    }
    if (takeRegel) {
      state.years[String(newYr)].regelEinnahmen = (prevYr.regelEinnahmen||[]).map(r => ({
        ...r, id: uid(),
        startMonth: String(newYr) + '-01',
        endMonth: '',
      }));
    }
    const takeKonten = document.getElementById('newYear_takeKonten')?.checked;
    if (takeKonten) {
      // Konten übernehmen: Namen + Cashflow-Einstellung.
      // Startwert = Endstand Vorjahr, ABER kontoSaldo() rechnet nur fürs aktuell
      // ausgewählte Jahr. Nur wenn das ausgewählte Jahr das direkte Vorjahr ist,
      // können wir die Endstände sauber berechnen; sonst Vorjahres-Startwerte
      // übernehmen (Nutzer prüft/aktualisiert sie dann manuell – siehe Dialog-Hinweis).
      const vorjahrKonten = getKonten(prev);
      const kannBerechnen = (String(getSelectedYear()) === prev);
      const neueKonten = vorjahrKonten.map(k => ({
        id: k.id,
        name: k.name,
        cashflow: k.cashflow,
        start: kannBerechnen ? kontoSaldo(k.id, prev + '-12') : (+k.start||0),
      }));
      state.years[String(newYr)].konten = neueKonten;
      const sum = neueKonten.reduce((s,k) => s + (+k.start||0), 0);
      state.years[String(newYr)].startBalance = Math.round(sum * 100) / 100;
      // Gehalt/Nebenjob-Konto-Zuordnung des Vorjahres übernehmen
      if (state.config && state.config.incomeKonten && state.config.incomeKonten[prev]) {
        state.config.incomeKonten[String(newYr)] = { ...state.config.incomeKonten[prev] };
      }
    }
  }
  closeNewYearModal();
  setSelectedYear(newYr);
  showToast('Jahr ' + newYr + ' angelegt');
}

function onYearChange(val) {
  if (val === '__new__') {
    // Reset select to current year first (since user might re-click)
    buildYearSelector();
    createNewYear();
    return;
  }
  setSelectedYear(val);
}

window.onYearChange = onYearChange;
window.createNewYear = createNewYear;
window.closeNewYearModal = closeNewYearModal;
window.confirmNewYear = confirmNewYear;
window.updateYearField = updateYearField;
window.closeYear = closeYear;
window.reopenYear = reopenYear;
window.deleteYear = deleteYear;
window.requireUnlocked = requireUnlocked;
window.lockAttr = lockAttr;
window.lockBanner = lockBanner;
window.isSelectedYearLocked = isSelectedYearLocked;
window.setSelectedYear = setSelectedYear;

function updateBadges() {
  const b = el('badge_buchungen');
  if (!b) return;
  b.textContent = (state.einkaeufe.filter(e => e.month === currentMonth).length +
    state.ausgaben.filter(a => a.month === currentMonth && !a._korrektur).length +
    state.einnahmen.filter(e => e.month === currentMonth && !e._korrektur).length);
}

// ── RENDER PAGE ───────────────────────────────────────────────────────────
// ── TASCHENRECHNER-POPUP ────────────────────────────────────────────────────
// Öffnet einen Rechner, dessen Ergebnis in das Feld mit targetId übernommen wird.
let _calcTargetId = null;
let _calcExpr = '';
function openCalc(targetId) {
  _calcTargetId = targetId;
  const inp = document.getElementById(targetId);
  const start = inp && inp.value ? String(inp.value).replace(',', '.') : '';
  _calcExpr = (start && !isNaN(parseFloat(start))) ? start : '';
  let overlay = document.getElementById('_calcOverlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = '_calcOverlay';
  const btn = (label, action, extra) => `<button type="button" class="calc-btn ${extra||''}" onclick="calcPress('${action}')">${label}</button>`;
  overlay.innerHTML =
    '<div class="modal" style="max-width:300px;padding:0" onclick="event.stopPropagation()">' +
      '<div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">' +
        '<span style="font-size:20px">🧮</span><h3 style="margin:0;font-size:15px;font-weight:600;color:var(--text)">Rechner</h3>' +
      '</div>' +
      '<div style="padding:14px 18px">' +
        '<div id="_calcDisplay" style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-family:ui-monospace,monospace;font-size:20px;text-align:right;min-height:44px;color:var(--text);overflow-x:auto;white-space:nowrap">0</div>' +
        '<div id="_calcPreview" style="text-align:right;font-size:12px;color:var(--muted-text);min-height:16px;margin-top:4px"></div>' +
        '<div class="calc-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:12px">' +
          btn('C','clear','calc-fn') + btn('(','(','calc-fn') + btn(')',')','calc-fn') + btn('÷','/','calc-op') +
          btn('7','7') + btn('8','8') + btn('9','9') + btn('×','*','calc-op') +
          btn('4','4') + btn('5','5') + btn('6','6') + btn('−','-','calc-op') +
          btn('1','1') + btn('2','2') + btn('3','3') + btn('+','+','calc-op') +
          btn('0','0') + btn(',','.') + btn('⌫','back','calc-fn') + btn('=','eq','calc-eq') +
        '</div>' +
      '</div>' +
      '<div style="padding:12px 18px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;background:var(--surface);border-radius:0 0 14px 14px">' +
        '<button class="btn btn-ghost" onclick="closeCalc()">Abbrechen</button>' +
        '<button class="btn btn-primary" onclick="calcApply()">Übernehmen</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeCalc(); });
  calcRender();
  // Tastatur-Unterstützung
  _calcKeyHandler = (e) => {
    if (e.key >= '0' && e.key <= '9') calcPress(e.key);
    else if (e.key === '.' || e.key === ',') calcPress('.');
    else if (['+','-','*','/','(',')'].includes(e.key)) calcPress(e.key);
    else if (e.key === 'Enter') { e.preventDefault(); calcApply(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeCalc(); }
    else if (e.key === 'Backspace') { e.preventDefault(); calcPress('back'); }
  };
  document.addEventListener('keydown', _calcKeyHandler);
}
let _calcKeyHandler = null;
function calcPress(action) {
  if (action === 'clear') _calcExpr = '';
  else if (action === 'back') _calcExpr = _calcExpr.slice(0, -1);
  else if (action === 'eq') { const v = calcEval(_calcExpr); if (v !== null) _calcExpr = String(v); }
  else _calcExpr += action;
  calcRender();
}
function calcEval(expr) {
  if (!expr) return null;
  // Nur erlaubte Zeichen (Sicherheit): Ziffern, Operatoren, Klammern, Punkt
  if (!/^[0-9+\-*/().\s]+$/.test(expr)) return null;
  try {
    const v = Function('"use strict";return (' + expr + ')')();
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return Math.round(v * 100) / 100;
  } catch { return null; }
}
function calcRender() {
  const disp = document.getElementById('_calcDisplay');
  const prev = document.getElementById('_calcPreview');
  if (disp) disp.textContent = _calcExpr ? _calcExpr.replace(/\*/g,'×').replace(/\//g,'÷') : '0';
  if (prev) { const v = calcEval(_calcExpr); prev.textContent = (v !== null && _calcExpr) ? ('= ' + fmtEur(v)) : ''; }
}
function calcApply() {
  const v = calcEval(_calcExpr);
  const val = (v !== null) ? v : parseFloat((_calcExpr||'').replace(',','.'));
  if (_calcTargetId && !isNaN(val)) {
    const inp = document.getElementById(_calcTargetId);
    if (inp) {
      inp.value = val;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  closeCalc();
}
function closeCalc() {
  const o = document.getElementById('_calcOverlay');
  if (o) o.remove();
  if (_calcKeyHandler) { document.removeEventListener('keydown', _calcKeyHandler); _calcKeyHandler = null; }
  _calcTargetId = null; _calcExpr = '';
}

function reminderBannerHtml() {
  const due = dueReminders().filter(r => !_snoozedReminders[r.id]);
  if (!due.length) return '';
  return due.map(r => `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 12%,var(--paper)),var(--paper));border:1px solid color-mix(in srgb,var(--accent) 35%,var(--border));border-radius:10px;padding:12px 16px;margin-bottom:14px">
      <span style="font-size:20px">🔔</span>
      <div style="flex:1;min-width:180px">
        <div style="font-weight:700;font-size:14px">${(r.title||'Erinnerung').replace(/</g,'&lt;')}</div>
        <div style="font-size:12px;color:var(--muted-text)">Fällig ${whenLabel(r)} · ${repeatLabel(r)}</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="reminderDone('${r.id}')">✓ Erledigt</button>
      <button class="btn btn-ghost btn-sm" onclick="reminderSnooze('${r.id}')">Später</button>
    </div>`).join('');
}

function renderPage() {
  Object.values(chartInstances).forEach(c => { try { c.destroy(); } catch {} });
  chartInstances = {};
  const pages = { dashboard, jahresuebersicht, suche, buchungen, einkaeufe, ausgaben, einnahmen, spesen, fixkosten, sparen, umbuchungen, zaehler, finanzprodukte, tabellen, einstellungen, importPage };
  const fn = pages[currentPage === 'import' ? 'importPage' : currentPage];
  const banner = reminderBannerHtml();
  if (fn) el('pageContent').innerHTML = banner + fn();
  else el('pageContent').innerHTML = banner + '<div class="empty-state"><p>Seite nicht gefunden</p></div>';
  afterRender();
}

function afterRender() {
  const cv = document.getElementById('creditsVersion');
  const cv2 = document.getElementById('creditsVersion2');
  const av = document.getElementById('appVersion');
  if (cv && av) cv.textContent = av.textContent;
  if (cv2 && av) cv2.textContent = av.textContent;

  if (currentPage === 'dashboard') renderCharts();
  if (currentPage === 'zaehler') renderZaehlerCharts();
  if (currentPage === 'jahresuebersicht') renderJahresCharts();
}

// ── PAGE: DASHBOARD ───────────────────────────────────────────────────────
// Kumulierte Summe aller Fixkosten mit Kategorie "Sparen", über ihre aktiven
// Monate bis zum aktuellen Monat (nicht bis Dezember).
// Gespart nur für einen bestimmten Monat (YYYY-MM)
function sparenMonat(month) {
  let summe = 0;
  (state.fixkosten||[]).forEach(f => {
    const kat = f.category || f.cat;
    if (kat !== 'Sparen') return;
    if (f.sparenLink && f.sparenLink.extern) return;  // extern verlässt das System
    if (fixkostenAktivImMonat(f, month)) summe += (+f.amount||0);
  });
  return Math.round(summe * 100) / 100;
}

function dashboard() {
  const f = monthFinancials(currentMonth);
  const prevMonth = (() => { const d = new Date(currentMonth + '-01'); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,7); })();
  const prev = monthFinancials(prevMonth);
  const trendIcon = (curr, prev) => curr > prev ? '<span class="kpi-trend up">↑ mehr</span>' : curr < prev ? '<span class="kpi-trend down">↓ weniger</span>' : '';

  const fixItems = fixkostenForMonth(currentMonth).sort((a,b) => b.amount - a.amount);
  const totalFix = fixItems.reduce((s,f) => s + f.amount, 0) || 1;
  const timelineHtml = fixItems.map(f => {
    const pct = (f.amount / totalFix) * 100;
    return `<div class="timeline-item">
      <span class="timeline-day" style="width:130px;text-align:left;font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${f.name||''}">${f.name||'–'}</span>
      <div class="timeline-bar"><i style="width:${pct}%"></i></div>
      <span style="white-space:nowrap;font-size:11px">${fmtEur(f.amount)} <span style="color:var(--muted)">· ${pct.toFixed(1)}%</span></span>
    </div>`;
  }).join('');

  const topAusgaben = [...state.ausgaben.filter(a => a.month === currentMonth && !a._korrektur)]
    .sort((a,b) => b.amount - a.amount).slice(0, 5);

  return `
    <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div class="kpi">
        <div class="kpi-label">Einnahmen</div>
        <div class="kpi-value positive">${fmtEur(f.totalIncome)}</div>
        <div class="kpi-sub">Gehalt ${fmtEur(f.inc.gehalt)} + NJ ${fmtEur(f.inc.nebenjob)}</div>
        ${trendIcon(f.totalIncome, prev.totalIncome)}
      </div>
      <div class="kpi">
        <div class="kpi-label">Fixkosten</div>
        <div class="kpi-value neutral">${fmtEur(f.fixTotal)}</div>
        <div class="kpi-sub">${fixItems.length} Posten</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Einkäufe</div>
        <div class="kpi-value neutral">${fmtEur(f.einkTotal)}</div>
        <div class="kpi-sub">${state.einkaeufe.filter(e=>e.month===currentMonth).length} Buchungen</div>
        ${trendIcon(f.einkTotal, prev.einkTotal)}
      </div>
      <div class="kpi">
        <div class="kpi-label">Ausgaben</div>
        <div class="kpi-value ${f.ausgTotal > 800 ? 'negative' : 'neutral'}">${fmtEur(f.ausgTotal)}</div>
        <div class="kpi-sub">${state.ausgaben.filter(a=>a.month===currentMonth && !a._korrektur).length} Buchungen</div>
        ${trendIcon(f.ausgTotal, prev.ausgTotal)}
      </div>
      ${getKonten().filter(k => k.cashflow).map(k => {
        const cfM = kontoCashflowMonat(k.id, currentMonth);
        const saldo = kontoSaldo(k.id);
        return `<div class="kpi">
        <div class="kpi-label">Cashflow · ${k.name}</div>
        <div class="kpi-value ${cfM >= 0 ? 'positive' : 'negative'}">${cfM >= 0 ? '+' : ''}${fmtEur(cfM)}</div>
        <div class="kpi-sub">Saldo ${fmtEur(saldo)}</div>
      </div>`; }).join('')}
      <div class="kpi">
        <div class="kpi-label">💰 Gespart (Monat)</div>
        <div class="kpi-value positive">${fmtEur(sparenMonat(currentMonth))}</div>
        <div class="kpi-sub">Sparen-Fixkosten ${monthLabel(currentMonth)}</div>
      </div>
    </div>

    ${(() => {
      const z = getSparziel();
      if (!z.aktiv || z.summe <= 0) return '';
      const ist = sparenKumuliertBisMonat(currentMonth);
      const pct = Math.round((ist / z.summe) * 100);
      const erreicht = ist >= z.summe;
      const barPct = Math.min(100, pct);
      const rest = z.summe - ist;
      return `<div class="card" style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:20px">🎯</span>
            <div>
              <div style="font-weight:700;font-size:15px">Sparziel ${getSelectedYear()}</div>
              <div style="font-size:12px;color:var(--muted)">Gespart bis ${monthLabel(currentMonth)}</div>
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:18px;font-weight:700"><span class="${erreicht?'positive':''}">${fmtEur(ist)}</span> <span style="color:var(--muted);font-weight:500">/ ${fmtEur(z.summe)}</span></div>
            <div style="font-size:12px;color:${erreicht?'var(--green)':'var(--muted)'}">${erreicht ? '✓ Ziel erreicht! +' + fmtEur(ist - z.summe) : 'Noch ' + fmtEur(rest)}</div>
          </div>
        </div>
        <div style="height:12px;border-radius:7px;background:var(--surface-2);overflow:hidden">
          <div style="height:100%;width:${barPct}%;border-radius:7px;background:linear-gradient(90deg,var(--accent),var(--green));transition:width .4s ease"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:6px">
          <span>${pct}% erreicht</span>
          <span>${erreicht ? 'übererfüllt um ' + (pct-100) + '%' : ''}</span>
        </div>
      </div>` ;
    })()}

    <div style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:14px">
      <div class="card">
        <div class="card-header"><h3>Ausgaben nach Kategorie</h3></div>
        <div style="position:relative;max-height:260px;max-width:100%"><canvas id="catChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Kostenkalender ${monthLabel(currentMonth)}</h3></div>
        <div class="timeline">${timelineHtml || '<div class="empty-state"><p>Keine Fixkosten</p></div>'}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px">
      <div class="card">
        <div class="card-header">
          <h3>Top Ausgaben</h3>
          <button class="btn btn-ghost btn-sm" onclick="navigate('ausgaben')">Alle →</button>
        </div>
        ${topAusgaben.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Datum</th><th>Beschreibung</th><th>Kategorie</th><th style="text-align:right">Betrag</th></tr></thead>
          <tbody>${topAusgaben.map(a => `<tr>
            <td class="muted">${a.date}</td>
            <td>${a.desc}</td>
            <td><span class="badge badge-amber">${a.category}</span></td>
            <td class="amount negative">-${fmtEur(a.amount)}</td>
          </tr>`).join('')}</tbody>
        </table></div>` : '<div class="empty-state"><div class="empty-icon">✅</div><p>Keine Ausgaben diesen Monat</p></div>'}
      </div>
      <div class="card">
        <div class="card-header"><h3>Bilanz</h3></div>
        <div style="display:grid;gap:8px">
          ${[
            ['Einkäufe',fmtEur(f.einkTotal),'neutral'],
            ['Sonstige Ausgaben',fmtEur(f.ausgTotal),'neutral'],
            ['Fixkosten',fmtEur(f.fixTotal),'neutral'],
            ['Spesen-Saldo',(f.spesenSaldo>=0?'+':'')+fmtEur(f.spesenSaldo), f.spesenSaldo>=0?'positive':'negative'],
            ['Sonstige Einnahmen','+'+fmtEur(f.extraIncome),'positive'],
          ].map(([l,v,cls]) => `<div style="display:flex;justify-content:space-between;align-items:center;background:var(--surface);border-left:3px solid var(--accent);border-radius:6px;padding:9px 12px">
            <span style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase">${l}</span>
            <span style="font-weight:700;color:var(--${cls==='neutral'?'ink':cls==='positive'?'green':'red'})">${v}</span>
          </div>`).join('')}
        </div>
      </div>
    </div>`;
}

function renderCharts() {
  const ausgaben = state.ausgaben.filter(a => a.month === currentMonth && !a._korrektur);
  const einkaeufe = state.einkaeufe.filter(e => e.month === currentMonth);
  const all = [...ausgaben.map(a => ({cat: a.category, v: a.amount})), ...einkaeufe.map(e => ({cat: 'Einkauf Lebensmittel', v: e.amount}))];
  const bycat = {};
  all.forEach(({cat, v}) => { bycat[cat] = (bycat[cat]||0) + v; });
  const labels = Object.keys(bycat);
  const data = labels.map(k => bycat[k]);
  const colors = ['#0f766e','#2563eb','#7c3aed','#b45309','#b42318','#11845b','#64716d','#0096c7','#f59f00','#e64980'];
  const ctx = el('catChart');
  if (ctx && labels.length) {
    chartInstances.cat = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors.slice(0,labels.length), borderWidth: 2, borderColor: '#fff' }] },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 1.8,
        plugins: { legend: { position: 'right', labels: { font: { size: 11, family: 'Inter' }, boxWidth: 12, padding: 10 } } }
      }
    });
  }
}

// ── PAGE: JAHRESÜBERSICHT ─────────────────────────────────────────────────
function jahresuebersicht() {
  // Cumulative saldo calculation in single pass - guaranteed correct
  const seen = new Set();
  const months = allMonths2026.filter(m => { if(seen.has(m)) return false; seen.add(m); return true; });
  let runningSaldo = +(getYearData().startBalance) || 0;
  const rows = months.map(m => {
    const f = monthFinancials(m, false); // false = no recursive vormonat lookup
    f.vormonatSaldo = runningSaldo;
    f.endsaldo = Math.round((runningSaldo + f.cashflow) * 100) / 100;
    runningSaldo = f.endsaldo;
    const inc = state.incomeByMonth[m] || {};
    return { m, f, inc };
  });
  const totals = rows.reduce((acc, {f,inc}) => {
    acc.gehalt += inc.gehalt||0; acc.nebenjob += inc.nebenjob||0;
    acc.fix += f.fixTotal; acc.eink += f.einkTotal; acc.ausg += f.ausgTotal;
    acc.extra += f.extraIncome; acc.spesen += f.spesenSaldo; acc.cf += f.cashflow;
    return acc;
  }, { gehalt:0, nebenjob:0, fix:0, eink:0, ausg:0, extra:0, spesen:0, cf:0 });

  const colClass = (v) => v >= 0 ? 'positive' : 'negative';

  return `
    <div class="card">
      <div class="card-header"><h3>Jahresübersicht ${getSelectedYear()}</h3><span class="badge badge-muted">Startgeld: ${fmtEur(getYearData().startBalance)}</span> ${getKonten().filter(k=>!k.cashflow).map(k=>`<span class="badge badge-amber" title="Reserve-Konto: Startwert + Bewegungen">${k.name}: ${fmtEur(kontoSaldo(k.id))}</span>`).join(' ')}</div>
      <div class="table-wrap">
        <table class="year-table">
          <thead><tr>
            <th>Monat</th><th style="text-align:right">Gehalt</th><th style="text-align:right">Nebenjob</th>
            <th style="text-align:right">Fixkosten</th><th style="text-align:right">Einkäufe</th>
            <th style="text-align:right">Ausgaben</th><th style="text-align:right">Spesen</th>
            <th style="text-align:right">Sonstige Einnahmen</th><th style="text-align:right">Cashflow</th>
            <th style="text-align:right">Kontostand</th>
          </tr></thead>
          <tbody>
            ${rows.map(({m,f,inc}) => `<tr class="${m===currentMonth?'highlight':''}">
              <td><strong>${monthLabel(m)}</strong></td>
              <td class="amount">${fmtEur(inc.gehalt||0)}</td>
              <td class="amount">${fmtEur(inc.nebenjob||0)}</td>
              <td class="amount">${fmtEur(f.fixTotal)}</td>
              <td class="amount">${fmtEur(f.einkTotal)}</td>
              <td class="amount">${fmtEur(f.ausgTotal)}</td>
              <td class="amount ${colClass(f.spesenSaldo)}">${f.spesenSaldo!==0?(f.spesenSaldo>0?'+':'')+fmtEur(f.spesenSaldo):'–'}</td>
              <td class="amount positive">${f.extraIncome>0?'+'+fmtEur(f.extraIncome):'–'}</td>
              <td class="amount ${colClass(f.cashflow)}">${(f.cashflow>0?'+':'')+fmtEur(f.cashflow)}</td>
              <td class="amount ${colClass(f.endsaldo)}">${fmtEur(f.endsaldo)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot><tr class="total-row">
            <td><strong>Gesamt</strong></td>
            <td class="amount"><strong>${fmtEur(totals.gehalt)}</strong></td>
            <td class="amount"><strong>${fmtEur(totals.nebenjob)}</strong></td>
            <td class="amount"><strong>${fmtEur(totals.fix)}</strong></td>
            <td class="amount"><strong>${fmtEur(totals.eink)}</strong></td>
            <td class="amount"><strong>${fmtEur(totals.ausg)}</strong></td>
            <td class="amount ${colClass(totals.spesen)}"><strong>${(totals.spesen>0?'+':'')+fmtEur(totals.spesen)}</strong></td>
            <td class="amount positive"><strong>+${fmtEur(totals.extra)}</strong></td>
            <td class="amount ${colClass(totals.cf)}"><strong>${(totals.cf>0?'+':'')+fmtEur(totals.cf)}</strong></td>
            <td class="amount ${colClass((rows[rows.length-1]||{}).f?.endsaldo||0)}"><strong>${fmtEur((rows[rows.length-1]||{}).f?.endsaldo||0)}</strong></td>
          </tr></tfoot>
        </table>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px">
      <div class="card"><div class="card-header"><h3>Monatlicher Cashflow ${getSelectedYear()}</h3></div><canvas id="yearCfChart" height="200"></canvas></div>
      <div class="card"><div class="card-header"><h3>Einnahmen vs. Ausgaben</h3></div><canvas id="yearIncExpChart" height="200"></canvas></div>
    </div>`;
}

function renderJahresCharts() {
  const labels = allMonths2026.map(m => monthLabel(m).slice(0,3));
  const cfs = allMonths2026.map(m => monthFinancials(m).cashflow);
  const incs = allMonths2026.map(m => monthFinancials(m).totalIncome);
  const exps = allMonths2026.map(m => monthFinancials(m).totalExpenses);

  const cfCtx = el('yearCfChart');
  if (cfCtx) chartInstances.yearCf = new Chart(cfCtx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Cashflow', data: cfs, backgroundColor: cfs.map(v => v>=0?'#0f766e':'#b42318'), borderRadius: 4, borderSkipped: false }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => v.toLocaleString('de-DE')+' '+currencySymbol() } } } }
  });

  const ieCtx = el('yearIncExpChart');
  if (ieCtx) chartInstances.yearIE = new Chart(ieCtx, {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Einnahmen', data: incs, borderColor: '#0f766e', backgroundColor: 'rgba(15,118,110,.1)', fill: true, tension: .3 },
      { label: 'Ausgaben', data: exps, borderColor: '#b42318', backgroundColor: 'rgba(180,35,24,.06)', fill: true, tension: .3 },
    ]},
    options: { responsive: true, scales: { y: { ticks: { callback: v => v.toLocaleString('de-DE')+' '+currencySymbol() } } } }
  });
}

// ── PAGE: BUCHUNGEN ───────────────────────────────────────────────────────
// ── PAGE: GLOBALE SUCHE ───────────────────────────────────────────────────
// Durchsucht alle Buchungsarten über das ganze ausgewählte Jahr mit
// Text-, Typ-, Konto- und Betragsfilter.
let sucheFilter = { text: '', typ: 'alle', konto: 'alle', min: '', max: '', vonM: '', bisM: '' };

function alleBuchungen() {
  const def = defaultKontoId();
  const out = [];
  (state.einkaeufe||[]).forEach(e => out.push({ art:'Einkauf', cls:'badge-blue', sign:-1,
    date:e.date, month:e.month, text:e.store||'', kat:'Einkauf', konto:e.kontoId||def, amount:+e.amount||0, ref:e }));
  (state.ausgaben||[]).forEach(a => { if (a._korrektur) return; out.push({ art:'Ausgabe', cls:'badge-amber', sign:-1,
    date:a.date, month:a.month, text:a.desc||'', kat:a.category||'', konto:a.kontoId||def, amount:+a.amount||0, ref:a }); });
  (state.einnahmen||[]).forEach(e => { if (e._korrektur) return; out.push({ art:'Einnahme', cls:'badge-green', sign:1,
    date:e.date, month:e.month, text:e.source||'', kat:e.type||'', konto:e.kontoId||def, amount:+e.amount||0, ref:e }); });
  (state.umbuchungen||[]).forEach(u => out.push({ art:'Umbuchung', cls:'badge-muted', sign:0,
    date:u.date, month:u.month||(u.date||'').slice(0,7), text:(u.note||'')+' ('+kontoName(u.vonKonto)+'→'+kontoName(u.nachKonto)+')',
    kat:'Transfer', konto:u.vonKonto, amount:+u.amount||0, ref:u }));
  (state.sparen||[]).forEach(s => out.push({ art:'Sparen', cls:'badge-green', sign:0,
    date:s.date, month:s.month||(s.date||'').slice(0,7), text:(s.kategorie||'Sparen')+(s.anbieter?(' · '+s.anbieter):''),
    kat:'Sparen', konto:s.kontoId||def, amount:+s.amount||0, ref:s }));
  return out;
}

function suche() {
  const f = sucheFilter;
  const konten = getKonten();
  const txt = (f.text||'').trim().toLowerCase();
  let rows = alleBuchungen().filter(b => {
    if (f.typ !== 'alle' && b.art !== f.typ) return false;
    if (f.konto !== 'alle' && b.konto !== f.konto) return false;
    if (f.vonM && (b.month||'') < f.vonM) return false;
    if (f.bisM && (b.month||'') > f.bisM) return false;
    if (f.min !== '' && b.amount < +f.min) return false;
    if (f.max !== '' && b.amount > +f.max) return false;
    if (txt) {
      const hay = (b.text + ' ' + b.kat + ' ' + b.art).toLowerCase();
      if (!hay.includes(txt)) return false;
    }
    return true;
  }).sort((a,b) => (b.date||'').localeCompare(a.date||''));

  const summe = rows.reduce((s,b) => s + b.sign * b.amount, 0);
  const anzahl = rows.length;
  const opt = (val, label, cur) => '<option value="'+val+'"'+(cur===val?' selected':'')+'>'+label+'</option>';

  return `${lockBanner()}
    <div class="card">
    <div class="card-header"><h3>🔍 Suche – ${getSelectedYear()}</h3>
      <span class="badge badge-muted">${anzahl} Treffer · Netto ${fmtEur(summe)}</span>
    </div>
    <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px">
      <label class="field" style="grid-column:1/-1">Suchbegriff
        <input type="text" id="su_text" value="${(f.text||'').replace(/"/g,'&quot;')}" placeholder="Beschreibung, Kategorie…" oninput="updateSuche('text',this.value)" />
      </label>
      <label class="field">Typ
        <select onchange="updateSuche('typ',this.value)">
          ${opt('alle','Alle Typen',f.typ)}${opt('Einkauf','Einkauf',f.typ)}${opt('Ausgabe','Ausgabe',f.typ)}${opt('Einnahme','Einnahme',f.typ)}${opt('Umbuchung','Umbuchung',f.typ)}${opt('Sparen','Sparen',f.typ)}
        </select>
      </label>
      <label class="field">Konto
        <select onchange="updateSuche('konto',this.value)">
          ${opt('alle','Alle Konten',f.konto)}${konten.map(k => opt(k.id, k.name||'Konto', f.konto)).join('')}
        </select>
      </label>
      <label class="field">Von Monat
        <input type="month" value="${f.vonM||''}" onchange="updateSuche('vonM',this.value)" />
      </label>
      <label class="field">Bis Monat
        <input type="month" value="${f.bisM||''}" onchange="updateSuche('bisM',this.value)" />
      </label>
      <label class="field">Betrag min
        <input type="number" step="0.01" value="${f.min}" placeholder="0" onchange="updateSuche('min',this.value)" />
      </label>
      <label class="field">Betrag max
        <input type="number" step="0.01" value="${f.max}" placeholder="∞" onchange="updateSuche('max',this.value)" />
      </label>
      <label class="field" style="align-self:end">
        <button class="btn btn-ghost btn-sm" onclick="resetSuche()">↺ Filter zurücksetzen</button>
      </label>
    </div>
    ${rows.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Datum</th><th>Beschreibung</th><th>Typ</th><th>Kategorie</th><th>Konto</th><th style="text-align:right">Betrag</th></tr></thead>
      <tbody>${rows.map(b => `<tr>
        <td class="muted">${b.date||'–'}</td>
        <td>${(b.text||'–')}</td>
        <td><span class="badge ${b.cls}">${b.art}</span></td>
        <td class="muted">${b.kat||'–'}</td>
        <td class="muted">${kontoName(b.konto)}</td>
        <td class="amount ${b.sign>0?'positive':(b.sign<0?'negative':'')}">${b.sign>0?'+':(b.sign<0?'-':'')}${fmtEur(b.amount)}</td>
      </tr>`).join('')}</tbody>
    </table></div>` : '<div class="empty-state" style="padding:24px"><div class="empty-icon">🔍</div><p>Keine Treffer. Passe die Filter an.</p></div>'}
  </div>`;
}

function updateSuche(field, val) {
  sucheFilter[field] = val;
  // Nur die Ergebnisliste neu rendern wäre ideal; hier reicht renderPage,
  // aber Fokus im Textfeld erhalten:
  const aktiv = document.activeElement;
  const istText = aktiv && aktiv.id === 'su_text';
  const pos = istText ? aktiv.selectionStart : null;
  renderPage();
  if (istText) { const t = document.getElementById('su_text'); if (t) { t.focus(); if (pos!=null) try{t.setSelectionRange(pos,pos);}catch{} } }
}
function resetSuche() {
  sucheFilter = { text: '', typ: 'alle', konto: 'alle', min: '', max: '', vonM: '', bisM: '' };
  renderPage();
}

function buchungen() {
  const eink = state.einkaeufe.filter(e => e.month === currentMonth);
  const ausg = state.ausgaben.filter(a => a.month === currentMonth && !a._korrektur);
  const einn = state.einnahmen.filter(e => e.month === currentMonth && !e._korrektur);
  const all = [
    ...eink.map(e => ({ ...e, type: 'Einkauf', badgeCls: 'badge-blue' })),
    ...ausg.map(a => ({ ...a, type: 'Ausgabe', badgeCls: 'badge-amber' })),
    ...einn.map(e => ({ ...e, type: 'Einnahme', badgeCls: 'badge-green' })),
  ].sort((a,b) => (a.date||'').localeCompare(b.date||''));

  return `${lockBanner()}
    <div class="card">
    <div class="card-header">
      <h3>Alle Buchungen – ${monthLabel(currentMonth)}</h3>
      <div class="actions">
        <button class="btn btn-ghost btn-sm" onclick="openQuickAdd('einkauf')">+ Einkauf</button>
        <button class="btn btn-ghost btn-sm" onclick="openQuickAdd('ausgabe')">+ Ausgabe</button>
        <button class="btn btn-ghost btn-sm" onclick="openQuickAdd('einnahme')">+ Einnahme</button>
      </div>
    </div>
    ${all.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Datum</th><th>Beschreibung</th><th>Typ</th><th>Kategorie</th><th style="text-align:right">Betrag</th></tr></thead>
      <tbody>${all.map(b => `<tr>
        <td class="muted">${b.date||'–'}</td>
        <td>${b.desc||b.store||b.source||'–'}</td>
        <td><span class="badge ${b.badgeCls}">${b.type}</span></td>
        <td class="muted">${b.category||b.type||'–'}</td>
        <td class="amount ${b.type==='Einnahme'?'positive':'negative'}">${b.type==='Einnahme'?'+':'-'}${fmtEur(b.amount)}</td>
      </tr>`).join('')}</tbody>
    </table></div>` : '<div class="empty-state"><div class="empty-icon">📋</div><p>Noch keine Buchungen für diesen Monat</p></div>'}
  </div>`;
}

// ── PAGE: EINKÄUFE ────────────────────────────────────────────────────────
function einkaeufe() {
  const items = state.einkaeufe.filter(e => e.month === currentMonth).sort((a,b) => (a.date||'').localeCompare(b.date||''));
  const total = items.reduce((s,e) => s+e.amount, 0);
  return `${lockBanner()}
    <div class="card">
    <div class="card-header">
      <h3>Einkäufe – ${monthLabel(currentMonth)}</h3>
      <div class="actions">
        <span class="badge badge-blue">Gesamt: ${fmtEur(total)}</span>
        <button class="btn btn-primary btn-sm" onclick="openQuickAdd('einkauf')">+ Einkauf</button>
      </div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Datum</th><th>Händler / Beschreibung</th><th>Betrag</th><th>Konto</th><th></th></tr></thead>
      <tbody id="einkaufTable">
        ${items.map(e => einkaufRow(e)).join('')}

      </tbody>
    </table></div>
  </div>`;
}

function einkaufRow(e) {
  const _k = kontoById(e.kontoId || defaultKontoId());
  const _kn = _k ? _k.name : 'Konto';
  const _cf = _k ? _k.cashflow : true;
  return `<tr id="eink_${e.id}">
    <td><input type="date" value="${e.date||''}" onchange="updateEinkauf('${e.id}','date',this.value)" style="width:145px" /></td>
    <td><input type="text" value="${(e.store||'').replace(/"/g,'&quot;')}" onchange="updateEinkauf('${e.id}','store',this.value)" placeholder="Händler / Beschreibung…" /></td>
    <td><input type="number" value="${(+e.amount||0).toFixed(2)}" onchange="updateEinkauf('${e.id}','amount',+this.value)" step="0.01" style="width:90px;text-align:right"/> ${currencySymbol()}</td>
    <td><button class="btn-icon" title="Konto: ${_kn} – klicken zum Ändern" onclick="pickEinkaufKonto('${e.id}')" style="width:auto;min-width:0;padding:0 8px;font-size:12px;white-space:nowrap;gap:4px">${_cf?'🏦':'📈'} ${_kn}</button></td>
    <td><button class="btn-icon danger" onclick="deleteEinkauf('${e.id}')">×</button></td>
  </tr>`;
}

function addEinkauf() {
  if (!requireUnlocked()) return;
  const e = { id: uid(), month: currentMonth, date: today(), store: '', amount: 0, kontoId: defaultKontoId() };
  state.einkaeufe.push(e);
  saveData(); updateBadges(); renderPage();
}

async function pickEinkaufKonto(id) {
  if (!requireUnlocked()) return;
  const e = state.einkaeufe.find(x => String(x.id) === String(id)); if (!e) return;
  const kid = await askKontoWahl({
    title: 'Einkauf – welches Konto?', icon: '🛒',
    message: (e.store||'Einkauf') + ' (' + fmtEur(+e.amount||0) + '):',
    kontoId: e.kontoId || defaultKontoId(),
  });
  if (kid) { e.kontoId = kid; saveData(); if (typeof updateBadges==='function') updateBadges(); renderPage();
    const k = kontoById(kid); if (k) showToast('Konto: ' + k.name, 'info'); }
}

function updateEinkauf(id, field, val) {
  if (!requireUnlocked()) return;
  const e = state.einkaeufe.find(x => String(x.id) === String(id));
  if (e) { e[field] = val; saveData(); }
}

function deleteEinkauf(id) {
  if (!requireUnlocked()) return;
  if (moveToTrash('einkaeufe', id, 'Einkauf')) { renderPage(); showToast('In Papierkorb verschoben','info'); }
}

function createRowEl(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }

// ── PAGE: AUSGABEN ────────────────────────────────────────────────────────
function ausgaben() {
  const alle = state.ausgaben.filter(a => a.month === currentMonth).sort((a,b) => (a.date||'').localeCompare(b.date||''));
  const items = alle.filter(a => !a._korrektur);
  const korrekturen = alle.filter(a => a._korrektur);
  const total = items.reduce((s,a) => s+a.amount, 0);
  const catOpts = EXPENSE_CATS.map(c => `<option value="${c}">${c}</option>`).join('');
  return `${lockBanner()}
    <div class="card">
    <div class="card-header">
      <h3>Ausgaben – ${monthLabel(currentMonth)}</h3>
      <div class="actions">
        <span class="badge badge-amber">Gesamt: ${fmtEur(total)}</span>
        <button class="btn btn-primary btn-sm" onclick="openQuickAdd('ausgabe')">+ Ausgabe</button>
      </div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Datum</th><th>Beschreibung</th><th>Kategorie</th><th>Betrag</th><th>Konto</th><th></th></tr></thead>
      <tbody id="ausgabeTable">
        ${items.map(a => ausgabeRow(a, catOpts)).join('')}

      </tbody>
    </table></div>
  </div>
  ${korrekturen.length ? `<div class="card" style="margin-top:14px">
    <div class="card-header"><h3>🎯 Kontostand-Abgleiche – ${monthLabel(currentMonth)}</h3></div>
    <p style="font-size:12px;color:var(--muted);margin:0 16px 12px">Korrektur-Buchungen zur Saldo-Angleichung. Zählen NICHT zum Cashflow oder zu den Ausgaben.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Datum</th><th>Beschreibung</th><th>Betrag</th><th>Konto</th><th></th></tr></thead>
      <tbody>
        ${korrekturen.map(a => { const _k=kontoById(a.kontoId||defaultKontoId()); const _n=_k?_k.name:'Konto';
          return `<tr><td>${a.date||''}</td><td>${a.desc||'Kontostand-Abgleich'}</td><td style="text-align:right">−${fmtEur(a.amount)}</td><td>${_n}</td><td><button class="btn-icon danger" onclick="deleteAusgabe('${a.id}')" title="Korrektur löschen">×</button></td></tr>`;
        }).join('')}
      </tbody>
    </table></div>
  </div>` : ''}`;
}

function ausgabeRow(a, catOpts) {
  if (!catOpts) catOpts = EXPENSE_CATS.map(c => `<option value="${c}" ${c===a.category?'selected':''}>${c}</option>`).join('');
  const _k = kontoById(a.kontoId || defaultKontoId());
  const _kLabel = _k ? _k.name : 'Konto';
  const _kCf = _k ? _k.cashflow : true;
  return `<tr id="ausg_${a.id}">
    <td><input type="date" value="${a.date||''}" onchange="updateAusgabe('${a.id}','date',this.value)" style="width:145px" /></td>
    <td><input type="text" value="${a.desc||''}" onchange="updateAusgabe('${a.id}','desc',this.value)" placeholder="Beschreibung…" /></td>
    <td><select onchange="updateAusgabe('${a.id}','category',this.value)">${EXPENSE_CATS.map(c=>`<option value="${c}" ${c===a.category?'selected':''}>${c}</option>`).join('')}</select></td>
    <td style="white-space:nowrap"><input type="number" value="${(+a.amount||0).toFixed(2)}" onchange="updateAusgabe('${a.id}','amount',+this.value)" step="0.01" style="width:90px;text-align:right" /> ${currencySymbol()}</td>
    <td><button class="btn-icon" title="Konto: ${_kLabel}${_kCf?' (Cashflow)':' (Reserve)'} – klicken zum Ändern" onclick="pickAusgabeKonto('${a.id}')" style="width:auto;min-width:0;padding:0 8px;font-size:12px;white-space:nowrap;gap:4px">${_kCf?'🏦':'📈'} ${_kLabel}</button></td>
    <td><button class="btn-icon danger" onclick="deleteAusgabe('${a.id}')">×</button></td>
  </tr>`;
}

function addAusgabe() {
  if (!requireUnlocked()) return;
  const a = { id: uid(), month: currentMonth, date: today(), desc: '', category: 'Sonstige Ausgaben', amount: 0, kontoId: defaultKontoId() };
  state.ausgaben.push(a);
  saveData(); updateBadges(); renderPage();
}
function updateAusgabe(id, f, v) {
  if (!requireUnlocked()) return;
  const a = state.ausgaben.find(x=>String(x.id) === String(id));
  if (!a) return;
  a[f] = v; saveData();
  if (f === 'amount' && (+v) >= 100 && !a._kontoGefragt) {
    a._kontoGefragt = true; saveData();
    setTimeout(() => askAusgabeKonto(a), 50);
  }
}
function deleteAusgabe(id) {
  if (!requireUnlocked()) return;
  if (moveToTrash('ausgaben', id, 'Ausgabe')) { renderPage(); showToast('In Papierkorb verschoben','info'); }
}

// ── PAGE: EINNAHMEN ───────────────────────────────────────────────────────
function regelEinnahmeRow(r) {
  const types = ['Nebenjob','Miete','Unterhalt','Sonstiges'];
  const typeOpts = types.map(function(t) {
    return '<option value="' + t + '"' + (t===r.type?' selected':'') + '>' + t + '</option>';
  }).join('');
  const _rk = kontoById(r.kontoId || defaultKontoId());
  const _rkn = _rk ? _rk.name : 'Konto';
  const _rkcf = _rk ? _rk.cashflow : true;
  return '<tr>' +
    '<td><input type="text" value="' + (r.source||'').replace(/"/g,'&quot;') + '" onchange="updateRegelEinnahme(\'' + r.id + '\',\'source\',this.value)" /></td>' +
    '<td><select onchange="updateRegelEinnahme(\'' + r.id + '\',\'type\',this.value)">' + typeOpts + '</select></td>' +
    '<td><input type="month" value="' + (r.startMonth||'') + '" onchange="updateRegelEinnahme(\'' + r.id + '\',\'startMonth\',this.value)" style="width:145px"/></td>' +
    '<td><input type="month" value="' + (r.endMonth||'') + '" onchange="updateRegelEinnahme(\'' + r.id + '\',\'endMonth\',this.value)" style="width:145px" placeholder="Kein Ende"/></td>' +
    '<td><input type="text" value="' + (r.note||'').replace(/"/g,'&quot;') + '" onchange="updateRegelEinnahme(\'' + r.id + '\',\'note\',this.value)" placeholder="Notiz…"/></td>' +
    '<td style="white-space:nowrap"><input type="number" value="' + (+r.amount||0).toFixed(2) + '" step="0.01" onchange="updateRegelEinnahme(\'' + r.id + '\',\'amount\',+this.value)" style="width:90px;text-align:right"/> ' + currencySymbol() + '</td>' +
    '<td><button class="btn-icon" title="Konto: ' + _rkn + (_rkcf?' (Cashflow)':' (Reserve)') + ' – klicken zum Ändern" onclick="pickRegelEinnahmeKonto(\'' + r.id + '\')" style="width:auto;min-width:0;padding:0 8px;font-size:12px;white-space:nowrap;gap:4px">' + (_rkcf?'🏦':'📈') + ' ' + _rkn + '</button></td>' +
    '<td><button class="btn-icon danger" onclick="deleteRegelEinnahme(\'' + r.id + '\')">×</button></td>' +
    '</tr>';
}

function einnahmen() {
  const inc = state.incomeByMonth[currentMonth] || { gehalt: 0, nebenjob: 0 };
  const alleExtra = state.einnahmen.filter(e => e.month === currentMonth);
  const extra = alleExtra.filter(e => !e._korrektur);       // echte Einnahmen
  const korrekturen = alleExtra.filter(e => e._korrektur);  // Kontostand-Abgleiche
  const totalExtra = extra.reduce((s,e) => s+e.amount, 0);
  const allRegel = state.regelEinnahmen || [];
  const regel = allRegel.filter(r =>
    (!r.startMonth || r.startMonth <= currentMonth) &&
    (!r.endMonth || r.endMonth >= currentMonth)
  );
  const totalRegel = regel.reduce((s,r) => s+r.amount, 0); // only active in currentMonth
  // Show all entries in management table, but mark inactive ones
  const regelTableHtml = allRegel.length
    ? '<div class="table-wrap"><table><thead><tr><th>Quelle</th><th>Typ</th><th>Von</th><th>Bis</th><th>Notiz</th><th style="text-align:right">Betrag/Monat</th><th>Konto</th><th></th></tr></thead><tbody>' +
      allRegel.map(r => regelEinnahmeRow(r, currentMonth)).join('') + '</tbody></table></div>'
    : '<div class="empty-state" style="padding:20px"><div class="empty-icon">🔁</div><p>Noch keine wiederkehrenden Einnahmen.<br>Über „+ Wiederkehrend" oder Quick-Add hinzufügen.</p></div>';

  return `${lockBanner()}
    
    <div class="kpi-grid kpi-grid-4 mb-2">
      <div class="kpi"><div class="kpi-label">Gehalt</div>
        <div class="kpi-value positive">${fmtEur(inc.gehalt)}</div>
        <div class="kpi-sub">Hauptjob</div>
      </div>
      <div class="kpi"><div class="kpi-label">Nebenjob</div>
        <div class="kpi-value positive">${fmtEur(inc.nebenjob)}</div>
        <div class="kpi-sub">Nebenjob</div>
      </div>
      <div class="kpi"><div class="kpi-label">🔁 Wiederkehrend</div>
        <div class="kpi-value positive">${fmtEur(totalRegel)}</div>
        <div class="kpi-sub">${regel.length} aktive Posten</div>
      </div>
      <div class="kpi"><div class="kpi-label">💰 Einmalig</div>
        <div class="kpi-value positive">${fmtEur(totalExtra)}</div>
        <div class="kpi-sub">Verkäufe, Erstattungen…</div>
      </div>
    </div>

    <div class="card mb-2">
      <div class="card-header"><h3>Feste Einnahmen anpassen</h3></div>
      <div class="form-grid form-grid-2">
        <label class="field">Gehalt ${monthLabel(currentMonth)}
          <input type="number" value="${(+inc.gehalt||0).toFixed(2)}" step="0.01"
            onchange="updateFixedIncome('${currentMonth}','gehalt',+this.value)" /> ${currencySymbol()}
        </label>
        <label class="field">Nebenjob ${monthLabel(currentMonth)}
          <input type="number" value="${(+inc.nebenjob||0).toFixed(2)}" step="0.01"
            onchange="updateFixedIncome('${currentMonth}','nebenjob',+this.value)" /> ${currencySymbol()}
        </label>
        <label class="field">Gehalt → Konto (ganzes Jahr ${getSelectedYear()})
          <select onchange="updateIncomeKonto('gehalt',this.value)" ${lockAttr()}>
            ${getKonten().map(k => '<option value="'+k.id+'"'+(getGehaltKonto()===k.id?' selected':'')+'>'+(k.name||'Konto')+(k.cashflow?' (Cashflow)':' (Reserve)')+'</option>').join('')}
          </select>
        </label>
        <label class="field">Nebenjob → Konto (ganzes Jahr ${getSelectedYear()})
          <select onchange="updateIncomeKonto('nebenjob',this.value)" ${lockAttr()}>
            ${getKonten().map(k => '<option value="'+k.id+'"'+(getNebenjobKonto()===k.id?' selected':'')+'>'+(k.name||'Konto')+(k.cashflow?' (Cashflow)':' (Reserve)')+'</option>').join('')}
          </select>
        </label>
      </div>
    </div>

    <div class="card mb-2">
      <div class="card-header">
        <h3>🔁 Wiederkehrende Einnahmen</h3>
        <button class="btn btn-primary btn-sm" onclick="openRegelEinnahmeModal()" ${lockAttr()}>+ Wiederkehrend</button>
      </div>
      <p style="font-size:12px;color:var(--muted);margin-bottom:12px">Feste monatliche Einnahmen (z.B. 100 €/Monat von jemandem)</p>
      ${regelTableHtml}
    </div>

    <div class="card">
      <div class="card-header">
        <h3>💰 Einmalige Einnahmen & Verkäufe – ${monthLabel(currentMonth)}</h3>
        <button class="btn btn-primary btn-sm" onclick="openQuickAdd('einnahme')">+ Einnahme</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Datum</th><th>Quelle / Beschreibung</th><th>Typ</th><th>Betrag</th><th>Konto</th><th></th></tr></thead>
        <tbody id="einnahmeTable">
          ${extra.map(e => einnahmeRow(e)).join('')}
        </tbody>
      </table></div>
    </div>
    ${korrekturen.length ? `<div class="card mb-2">
      <div class="card-header"><h3>🎯 Kontostand-Abgleiche – ${monthLabel(currentMonth)}</h3></div>
      <p style="font-size:12px;color:var(--muted);margin-bottom:12px">Diese Korrektur-Buchungen gleichen die Konto-Salden an deine echten Stände an. Sie zählen NICHT zum Cashflow oder zu den Einnahmen, halten aber die Salden korrekt.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Datum</th><th>Beschreibung</th><th>Betrag</th><th>Konto</th><th></th></tr></thead>
        <tbody>
          ${korrekturen.map(e => { const _k=kontoById(e.kontoId||defaultKontoId()); const _n=_k?_k.name:'Konto';
            return `<tr><td>${e.date||''}</td><td>${e.source||'Kontostand-Abgleich'}</td><td style="text-align:right">${fmtEur(e.amount)}</td><td>${_n}</td><td><button class="btn-icon danger" onclick="deleteEinnahme('${e.id}')" title="Korrektur löschen">×</button></td></tr>`;
          }).join('')}
        </tbody>
      </table></div>
    </div>` : ''}`;
}

function einnahmeRow(e) {
  const _k = kontoById(e.kontoId || defaultKontoId());
  const _cf = _k ? _k.cashflow : true;
  const _n = _k ? _k.name : 'Konto';
  return `<tr id="einn_${e.id}">
    <td><input type="date" value="${e.date||''}" onchange="updateEinnahme('${e.id}','date',this.value)" style="width:145px" /></td>
    <td><input type="text" value="${e.source||''}" onchange="updateEinnahme('${e.id}','source',this.value)" placeholder="Verkauf, Blutspende…" /></td>
    <td><select onchange="updateEinnahme('${e.id}','type',this.value)">${INCOME_TYPES.map(t=>`<option value="${t}" ${t===e.type?'selected':''}>${t}</option>`).join('')}</select></td>
    <td style="white-space:nowrap"><input type="number" value="${(+e.amount||0).toFixed(2)}" onchange="updateEinnahme('${e.id}','amount',+this.value)" step="0.01" style="width:90px;text-align:right" /> ${currencySymbol()}</td>
    <td style="white-space:nowrap">
      <button class="btn-icon" title="Konto: ${_n}${_cf?' (Cashflow)':' (Reserve)'} – klicken zum Ändern" onclick="pickEinnahmeKonto('${e.id}')" style="width:auto;min-width:0;padding:0 8px;font-size:12px;white-space:nowrap;gap:4px">${_cf?'🏦':'📈'} ${_n}</button>
      ${_cf ? `<button class="btn-icon" title="${e.bar?'Bar (nicht im Cashflow)':'Aufs Konto (im Cashflow)'} – umschalten" onclick="toggleEinnahmeBar('${e.id}')" style="font-size:13px">${e.bar?'💵':'✓'}</button>` : ''}
    </td>
    <td><button class="btn-icon danger" onclick="deleteEinnahme('${e.id}')">×</button></td>
  </tr>`;
}

function toggleEinnahmeBar(id) {
  if (!requireUnlocked()) return;
  const e = state.einnahmen.find(x => String(x.id) === String(id));
  if (!e) return;
  e.bar = !e.bar;
  saveData(); if (typeof updateBadges === 'function') updateBadges(); renderPage();
  showToast(e.bar ? 'Als Bargeld markiert (nicht im Cashflow)' : 'Aufs Konto verbucht', 'info');
}

function updateFixedIncome(month, field, val) {
  if (!state.incomeByMonth[month]) state.incomeByMonth[month] = { gehalt: 0, nebenjob: 0 };
  state.incomeByMonth[month][field] = val;
  saveData();
}
function updateIncomeKonto(field, kontoId) {
  if (!requireUnlocked()) return;
  setIncomeKonto(field, kontoId);
  saveData(); if (typeof updateBadges==='function') updateBadges(); renderPage();
  const k = kontoById(kontoId);
  if (k) showToast((field==='gehalt'?'Gehalt':'Nebenjob') + ' → ' + k.name + ' (ganzes Jahr)', 'info');
}
let _pendingBarAsk = null;
let _pendingAusgabeAsk = null;
// ── Bar/Konto-Abfrage für Einnahmen ────────────────────────────────────────
// Fragt bei einer neuen Einnahme, ob sie aufs Konto geht (zählt zum Monats-
// Cashflow) oder bar zur Seite gelegt wird (aus Cashflow ausgeschlossen).
// Setzt eintrag.bar = true/false und speichert.
async function askEinnahmeBar(eintrag) {
  if (!eintrag) return;
  const betrag = (+eintrag.amount || 0);
  const quelle = eintrag.source ? (' (' + eintrag.source + ')') : '';
  const aufsKonto = await uiConfirm({
    title: 'Einnahme verbuchen',
    icon: '💰',
    message: 'Wie soll diese Einnahme' + quelle + ' über ' +
             fmtEur(betrag) + ' verbucht werden?',
    details: [
      'Aufs Konto: zählt zum Cashflow des Monats.',
      'Bar zur Seite: wird aus dem Cashflow herausgehalten.',
    ],
    okLabel: 'Aufs Konto',
    cancelLabel: 'Bar zur Seite',
  });
  eintrag.bar = !aufsKonto;
  saveData();
  if (typeof updateBadges === 'function') updateBadges();
  renderPage();
  showToast(eintrag.bar ? 'Als Bargeld markiert (nicht im Cashflow)' : 'Aufs Konto verbucht', 'info');
}
//MARKhelper
function addEinnahme() {
  if (!requireUnlocked()) return;
  const e = { id: uid(), month: currentMonth, date: today(), source: '', type: 'Verkauf', amount: 0, bar: false, kontoId: defaultKontoId() };//MARKadd
  state.einnahmen.push(e);
  saveData(); updateBadges(); renderPage();
}
function toggleWiederkehrendOptions() {
  const freq = document.getElementById('qa_freq');
  const opts = document.getElementById('qa_wiederkehrend_opts');
  if (!opts) return;
  const isW = freq && freq.value === 'wiederkehrend';
  opts.style.display = isW ? 'grid' : 'none';
  if (isW) opts.style.gridTemplateColumns = '1fr 1fr';
}

function openRegelEinnahmeModal() {
  if (!requireUnlocked()) return;
  const modal = document.getElementById('regelEinnahmeModal');
  if (!modal) return;
  const re_source = document.getElementById('re_source');
  const re_amount = document.getElementById('re_amount');
  const re_type = document.getElementById('re_type');
  const re_start = document.getElementById('re_start');
  const re_end = document.getElementById('re_end');
  const re_note = document.getElementById('re_note');
  if (re_source) re_source.value = '';
  if (re_amount) re_amount.value = '';
  const re_konto = document.getElementById('re_konto');
  if (re_konto) {
    re_konto.innerHTML = getKonten().map(k =>
      '<option value="' + k.id + '">' + (k.name||'Konto') + (k.cashflow?' (Cashflow)':' (Reserve)') + '</option>'
    ).join('');
    re_konto.value = defaultKontoId();
  }
  if (re_type) {
    // Populate with all income types (default + custom)
    re_type.innerHTML = INCOME_TYPES.map(t => '<option value="' + t + '">' + t + '</option>').join('');
    re_type.value = 'Sonstiges';
  }
  if (re_start)  re_start.value = currentMonth;
  if (re_end)    re_end.value = '';
  if (re_note)   re_note.value = '';
  modal.classList.remove('hidden');
  setTimeout(() => re_source?.focus(), 100);
}
function closeRegelEinnahmeModal() {
  const modal = document.getElementById('regelEinnahmeModal');
  if (modal) modal.classList.add('hidden');
}

function saveRegelEinnahmeModal() {
  if (!requireUnlocked()) return;
  const source = (document.getElementById('re_source')?.value || '').trim();
  const amount = +(document.getElementById('re_amount')?.value) || 0;
  const type   = document.getElementById('re_type')?.value || 'Sonstiges';
  const start  = document.getElementById('re_start')?.value || currentMonth;
  const end    = document.getElementById('re_end')?.value   || '';
  const note   = document.getElementById('re_note')?.value  || '';
  if (!source) { uiAlert('Bitte Quelle / Beschreibung eingeben.'); return; }
  if (!amount) { uiAlert('Bitte Betrag eingeben.'); return; }
  state.regelEinnahmen = state.regelEinnahmen || [];
  const konto = document.getElementById('re_konto')?.value || defaultKontoId();
  state.regelEinnahmen.push({ id: uid(), source, type, amount, startMonth: start, endMonth: end, note, kontoId: konto });
  saveData();
  closeRegelEinnahmeModal();
  renderPage();
  showToast('Wiederkehrende Einnahme gespeichert');
}

function updateRegelEinnahme(id, f, v) {
  if (!requireUnlocked()) return;
  const r = (state.regelEinnahmen||[]).find(x=>String(x.id) === String(id));
  if (r) { r[f]=v; saveData(); }
}
function deleteRegelEinnahme(id) {
  state.regelEinnahmen = (state.regelEinnahmen||[]).filter(r=>String(r.id) !== String(id));
  saveData(); renderPage();
}

function updateEinnahme(id,f,v){
  if (!requireUnlocked()) return;const e=state.einnahmen.find(x=>String(x.id) === String(id));if(e){e[f]=v;saveData();}}
function deleteEinnahme(id) {
  if (!requireUnlocked()) return;
  if (moveToTrash('einnahmen', id, 'Einnahme')) { renderPage(); showToast('In Papierkorb verschoben','info'); }
}

// ── PAGE: SPESEN ──────────────────────────────────────────────────────────
function spesen() {
  const showAll = document.getElementById('spesenShowAll')?.checked;
  const items = [...state.spesen].filter(s => showAll || s.month === currentMonth).sort((a,b)=>(a.dateFrom||'').localeCompare(b.dateFrom||''));
  items.forEach(s => calcSpesen(s));

  const totalSpesen   = items.reduce((s,t)=>s+(t.allowance||0),0);
  const totalAusgaben = items.reduce((s,t)=>s+(+t.ausgaben||0),0);
  const totalAuslagen = items.reduce((s,t)=>s+(t.auslagen||0),0);
  const totalSaldo    = totalSpesen - totalAusgaben;
  const totalNetto    = totalSpesen + totalAuslagen;

  return `${lockBanner()}
    <div class="card">
    <div class="card-header">
      <h3>Geschäftsreisen & Spesen – ${showAll ? 'Gesamtjahr' : monthLabel(currentMonth)}</h3>
      <div class="actions">
        <label style="font-size:12px;font-weight:600;color:var(--muted);display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" id="spesenShowAll" ${showAll?'checked':''} onchange="renderPage()"> Alle anzeigen
        </label>
        <button class="btn btn-primary btn-sm" onclick="openSpeseModal()" ${lockAttr()}>+ Reise</button>
      </div>
    </div>

    <div class="kpi-grid kpi-grid-4" style="margin-bottom:16px">
      <div class="kpi"><div class="kpi-label">Spesen gesamt</div><div class="kpi-value positive">${fmtEur(totalSpesen)}</div></div>
      <div class="kpi"><div class="kpi-label">Ausgaben gesamt</div><div class="kpi-value negative">${fmtEur(totalAusgaben)}</div></div>
      <div class="kpi"><div class="kpi-label">Auslagen gesamt</div><div class="kpi-value neutral">${fmtEur(totalAuslagen)}</div></div>
      <div class="kpi"><div class="kpi-label">Zu überweisen</div><div class="kpi-value ${totalNetto>=0?'positive':'negative'}">${fmtEur(totalNetto)}</div></div>
    </div>

    <div class="table-wrap"><table>
      <thead><tr>
        <th>Anreise</th><th>Land</th><th>Kunde</th>
        <th style="text-align:center">An-/Abreise</th><th style="text-align:center">Vor Ort</th>
        <th style="text-align:center">Frühstück</th><th style="text-align:center">Mittag</th><th style="text-align:center">Abend</th>
        <th style="text-align:right">Ausgaben</th><th style="text-align:right">Spesen</th>
        <th style="text-align:right">+/−</th><th style="text-align:right">Auslagen</th>
        <th style="text-align:right">Zu überweisen</th><th></th>
      </tr></thead>
      <tbody id="spesenTable">
        ${items.map(s => speseRow(s)).join('')}
        <tr style="background:var(--surface)">
          <td colspan="8" style="padding:8px 12px;font-weight:700">Gesamt</td>
          <td class="amount negative">${fmtEur(totalAusgaben)}</td>
          <td class="amount positive">${fmtEur(totalSpesen)}</td>
          <td class="amount ${totalSaldo>=0?'positive':'negative'}">${totalSaldo>=0?'+':''}${fmtEur(totalSaldo)}</td>
          <td class="amount">${fmtEur(totalAuslagen)}</td>
          <td class="amount ${totalNetto>=0?'positive':'negative'}" style="font-weight:700">${fmtEur(totalNetto)}</td>
          <td></td>
        </tr>
        <tr><td colspan="14" style="padding:8px 12px"><button class="btn btn-ghost btn-sm" onclick="addSpese()">+ Reise hinzufügen</button></td></tr>
      </tbody>
    </table></div>
    <div class="mt-2" style="font-size:11px;color:var(--muted)">
      ½ Tag = An-/Abreise · Ganzer Tag = voller Reisetag · Frühstück/Mittag/Abend reduziert den Tagessatz
    </div>
  </div>`;
}

function calcSpesen(s) {
  if (!s.dateFrom) return;
  const rH = s.rateHalf || 14;
  const rG = s.ratePerDay || 28;

  // Use manually entered anreise/vorOrt if available, else auto-calc from dates
  let halfDays, fullDays;
  if (s.anreise !== undefined || s.vorOrt !== undefined) {
    halfDays = +(s.anreise || 0);
    fullDays  = +(s.vorOrt  || 0);
  } else if (s.dateFrom && s.dateTo) {
    const totalDays = Math.round((new Date(s.dateTo)-new Date(s.dateFrom))/(1000*60*60*24))+1;
    halfDays = totalDays <= 1 ? 1 : 2;
    fullDays  = Math.max(0, totalDays - 2);
  } else {
    halfDays = 1; fullDays = 0;
  }

  // Basis-Spesen berechnen
  const basis = halfDays * rH + fullDays * rG;
  let detail = '';
  if (halfDays > 0) detail += halfDays + '× ½ Tag';
  if (fullDays > 0)  detail += (detail?', ':'')+fullDays+'× ganzer Tag';
  if (!detail) detail = '0 Tage';

  // Mahlzeitenkürzung: immer % vom vollen Tagessatz (rG = 28€ o.ä.)
  // Frühstück: 20%, Mittag: 40%, Abend: 40%
  const anzFrueh  = Math.max(0, +(s.fruehstueck||0));
  const anzMittag = Math.max(0, +(s.mittagessen||s.mittag||0));
  const anzAbend  = Math.max(0, +(s.abendessen||s.abend||0));
  const kuerzung  = Math.round((anzFrueh * rG * 0.20 + anzMittag * rG * 0.40 + anzAbend * rG * 0.40) * 100) / 100;

  if (kuerzung > 0) {
    const kParts = [];
    if (anzFrueh)  kParts.push(`${anzFrueh}× Frühstück −${fmtEur(rG*0.20)}`);
    if (anzMittag) kParts.push(`${anzMittag}× Mittag −${fmtEur(rG*0.40)}`);
    if (anzAbend)  kParts.push(`${anzAbend}× Abend −${fmtEur(rG*0.40)}`);
    detail += ` | Kürzung: ${kParts.join(', ')}`;
  }

  s.allowance = Math.max(0, Math.round((basis - kuerzung) * 100) / 100);
  s.spesenDetail = detail;
  s.month = s.dateFrom.slice(0, 7);
}

function speseRow(s) {
  calcSpesen(s);
  // An-/Abreise Tage und Vor-Ort Tage berechnen
  const from = s.dateFrom||''; const to = s.dateTo||'';
  const totalDays = from && to ? Math.round((new Date(to)-new Date(from))/(1000*60*60*24))+1 : 0;
  const anAbreiseTage = totalDays <= 1 ? 1 : 2;
  const vorOrtTage = Math.max(0, totalDays - 2);
  const saldo    = (s.allowance||0) - (+s.ausgaben||0);
  const zuUeberweisen = (s.allowance||0) + (s.auslagen||0);
  const countryOpts = SPESEN_LAENDER.map(l => `<option value="${l.land}" ${l.land===s.country?'selected':''}>${l.land} (${l.halb}€/${l.ganz}€)</option>`).join('');
  const deutschlandOpt = `<option value="Deutschland" ${'Deutschland'===s.country?'selected':''}>Deutschland (14€/28€)</option>`;
  return `<tr id="spese_${s.id}">
    <td><input type="date" value="${from}" onchange="updateSpeseDate('${s.id}','dateFrom',this.value)" style="width:145px"/></td>
    <td>
      <select onchange="updateSpeseCountry('${s.id}',this.value)" style="width:160px">
        <option value="">– Land –</option>
        ${deutschlandOpt}
        ${countryOpts}
      </select>
    </td>
    <td><input type="text" value="${s.kunde||''}" onchange="updateSpese('${s.id}','kunde',this.value)" placeholder="Kunde…" style="width:140px"/></td>
    <td style="text-align:center"><input type="number" value="${s.anreise||anAbreiseTage}" min="0" max="30" onchange="updateSpese('${s.id}','anreise',+this.value);recalcSpeseRow('${s.id}')" style="width:45px;text-align:center"/></td>
    <td style="text-align:center"><input type="number" value="${s.vorOrt||vorOrtTage}" min="0" max="30" onchange="updateSpese('${s.id}','vorOrt',+this.value);recalcSpeseRow('${s.id}')" style="width:45px;text-align:center"/></td>
    <td style="text-align:center"><input type="number" value="${s.fruehstueck||0}" min="0" onchange="updateSpese('${s.id}','fruehstueck',+this.value);recalcSpeseRow('${s.id}')" style="width:45px;text-align:center"/></td>
    <td style="text-align:center"><input type="number" value="${s.mittagessen||0}" min="0" onchange="updateSpese('${s.id}','mittagessen',+this.value);recalcSpeseRow('${s.id}')" style="width:45px;text-align:center"/></td>
    <td style="text-align:center"><input type="number" value="${s.abendessen||0}" min="0" onchange="updateSpese('${s.id}','abendessen',+this.value);recalcSpeseRow('${s.id}')" style="width:45px;text-align:center"/></td>
    <td><input type="number" value="${(+s.ausgaben||0).toFixed(2)}" onchange="updateSpese('${s.id}','ausgaben',+this.value);recalcSpeseRow('${s.id}')" step="0.01" style="width:75px;text-align:right"/> ${currencySymbol()}</td>
    <td class="amount positive">${fmtEur(s.allowance||0)}</td>
    <td class="amount ${saldo>=0?'positive':'negative'}">${saldo>=0?'+':''}${fmtEur(saldo)}</td>
    <td><input type="number" value="${(+s.auslagen||0).toFixed(2)}" onchange="updateSpese('${s.id}','auslagen',+this.value);recalcSpeseRow('${s.id}')" step="0.01" style="width:75px;text-align:right"/> ${currencySymbol()}</td>
    <td class="amount ${zuUeberweisen>=0?'positive':'negative'}" style="font-weight:700">${fmtEur(zuUeberweisen)}</td>
    <td style="white-space:nowrap">${(() => { const _k=kontoById(s.kontoId||defaultKontoId()); const _kn=_k?_k.name:'Konto'; const _cf=_k?_k.cashflow:true; return `<button class="btn-icon" title="Konto (Spesen-Saldo): ${_kn} – klicken zum Ändern" onclick="pickSpeseKonto('${s.id}')" style="width:auto;min-width:0;padding:0 8px;font-size:12px;white-space:nowrap;gap:4px">${_cf?'🏦':'📈'} ${_kn}</button>`; })()}<button class="btn-icon danger" onclick="deleteSpese('${s.id}')">×</button></td>
  </tr>`;
}

function updateSpeseCountry(id, land) {
  if (!requireUnlocked()) return;
  const s = state.spesen.find(x=>String(x.id) === String(id));
  if (!s) return;
  s.country = land;
  if (land === 'Deutschland') { s.rateHalf = 14; s.ratePerDay = 28; }
  else {
    const l = SPESEN_LAENDER.find(x=>x.land===land);
    if (l) { s.rateHalf = l.halb; s.ratePerDay = l.ganz; }
  }
  calcSpesen(s);
  saveData();
  renderPage();
}

function updateSpeseDate(id, field, val) {
  if (!requireUnlocked()) return;
  const s = state.spesen.find(x=>String(x.id) === String(id));
  if (!s) return;
  s[field] = val;
  s.month = (s.dateFrom||val).slice(0,7);
  calcSpesen(s);
  saveData();
  renderPage();
}

function recalcSpeseRow(id) {
  const s = state.spesen.find(x=>String(x.id) === String(id));
  if (!s) return;
  calcSpesen(s);          // Pauschale (allowance) neu berechnen
  saveData();
  const row = document.getElementById('spese_'+id);
  if (!row) return;
  const cells = row.querySelectorAll('td');
  const saldo = (+(s.allowance||0)) - (+(s.ausgaben||0));
  const zuUeberweisen = (s.allowance||0) + (s.auslagen||0);
  // col 9 = Spesenbetrag (allowance), col 10 = saldo, col 12 = zuUeberweisen
  if (cells[9])  { cells[9].textContent = fmtEur(s.allowance||0); }
  if (cells[10]) { cells[10].className='amount '+(saldo>=0?'positive':'negative'); cells[10].textContent=(saldo>=0?'+':'')+fmtEur(saldo); }
  if (cells[12]) { cells[12].className='amount '+(zuUeberweisen>=0?'positive':'negative'); cells[12].style.fontWeight='700'; cells[12].textContent=fmtEur(zuUeberweisen); }
}

function openSpeseModal() {
  if (!requireUnlocked()) return;
  const modal = document.getElementById('speseModal');
  if (!modal) { addSpese(); return; }
  document.getElementById('sm_dateFrom').value = today();
  document.getElementById('sm_dateTo').value = today();
  document.getElementById('sm_country').value = 'Deutschland';
  document.getElementById('sm_kunde').value = '';
  document.getElementById('sm_auslagen').value = '0';
  document.getElementById('sm_note').value = '';
  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('sm_kunde')?.focus(), 100);
}
function closeSpeseModal() {
  document.getElementById('speseModal')?.classList.add('hidden');
}
function saveSpeseModal() {
  if (!requireUnlocked()) return;
  const dateFrom = document.getElementById('sm_dateFrom')?.value || today();
  const dateTo   = document.getElementById('sm_dateTo')?.value   || today();
  const country  = document.getElementById('sm_country')?.value  || 'Deutschland';
  const kunde    = document.getElementById('sm_kunde')?.value    || '';
  const auslagen = +(document.getElementById('sm_auslagen')?.value) || 0;
  const note     = document.getElementById('sm_note')?.value     || '';
  const s = { id: uid(), dateFrom, dateTo, date: dateFrom,
    country, land: country, kunde,
    anreise: dateTo === dateFrom ? 1 : 2,
    vorOrt:  dateTo === dateFrom ? 0 : Math.max(0, Math.round((new Date(dateTo)-new Date(dateFrom))/(1000*60*60*24))-1),
    fruehstueck:0, mittagessen:0, abendessen:0,
    ausgaben:0, auslagen, note,
    kontoId: defaultKontoId(),
    month: dateFrom.slice(0,7)
  };
  calcSpesen(s);
  state.spesen = state.spesen || [];
  state.spesen.push(s);
  saveData(); closeSpeseModal(); renderPage();
  showToast('Reise gespeichert');
}
function addSpese(){
  if (!requireUnlocked()) return;const s={id:uid(),month:currentMonth,country:'Deutschland',dateFrom:today(),dateTo:today(),kunde:'',rateHalf:14,ratePerDay:28,allowance:0,expenses:0,auslagen:0,kontoId:defaultKontoId()};calcSpesen(s);state.spesen.push(s);saveData();const tbody=el('spesenTable');if(tbody){const last=tbody.lastElementChild;tbody.insertBefore(createRowEl(speseRow(s)),last);}}
async function pickSpeseKonto(id) {
  if (!requireUnlocked()) return;
  const s = state.spesen.find(x => String(x.id) === String(id)); if (!s) return;
  const kid = await askKontoWahl({
    title: 'Spesen – welches Konto?', icon: '✈️',
    message: 'Spesen-Saldo' + (s.kunde?(' ('+s.kunde+')'):'') + ' diesem Konto zuordnen:',
    kontoId: s.kontoId || defaultKontoId(),
  });
  if (kid) { s.kontoId = kid; saveData(); if (typeof updateBadges==='function') updateBadges(); renderPage();
    const k = kontoById(kid); if (k) showToast('Konto: ' + k.name, 'info'); }
}
function updateSpese(id,f,v){
  if (!requireUnlocked()) return;const s=state.spesen.find(x=>String(x.id) === String(id));if(s){s[f]=v;saveData();}}
function deleteSpese(id) {
  if (!requireUnlocked()) return;
  if (moveToTrash('spesen', id, 'Reise')) { renderPage(); showToast('In Papierkorb verschoben','info'); }
}

// ── PAGE: FIXKOSTEN ───────────────────────────────────────────────────────
let fixkostenFilter = 'alle';

function setFixkostenFilter(cat) {
  fixkostenFilter = cat;
  renderPage();
}

function fixkosten() {
  const items = fixkostenForMonth(currentMonth);
  const total = items.reduce((s,f) => s+f.amount, 0);
  const byCat = {};
  items.forEach(f => {
    const cat = f.category || f.cat || 'Sonstiges';
    byCat[cat] = (byCat[cat]||0) + f.amount;
  });
  const catEntries = Object.entries(byCat).sort((a,b) => b[1]-a[1]);

  // Alle vorkommenden Kategorien (über alle Fixkosten, nicht nur aktive) für den Filter
  const alleKats = [...new Set((state.fixkosten||[]).map(f => f.category || f.cat || 'Sonstiges'))].sort();
  if (fixkostenFilter !== 'alle' && !alleKats.includes(fixkostenFilter)) fixkostenFilter = 'alle';
  const gefiltert = (state.fixkosten||[]).filter(f => fixkostenFilter === 'alle' || (f.category || f.cat || 'Sonstiges') === fixkostenFilter);
  const filterChip = (val, label) => `<button onclick="setFixkostenFilter('${val}')" style="font-size:12px;padding:6px 12px;border-radius:999px;cursor:pointer;border:1px solid ${fixkostenFilter===val?'var(--accent)':'var(--border)'};background:${fixkostenFilter===val?'color-mix(in srgb,var(--accent) 16%,transparent)':'transparent'};color:${fixkostenFilter===val?'var(--accent)':'var(--muted)'}">${label}</button>`;

  return `${lockBanner()}
    
    <div class="kpi-grid mb-2" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
      ${catEntries.map(([c,amt]) => `<div class="kpi"><div class="kpi-label">${c}</div><div class="kpi-value neutral">${fmtEur(amt)}</div></div>`).join('')}
    </div>
    <div class="card">
      <div class="card-header">
        <h3>Fixkosten ${monthLabel(currentMonth)}</h3>
        <div class="actions">
          <span class="badge badge-muted">Gesamt: ${fmtEur(total)}</span>
          <button class="btn btn-primary btn-sm" onclick="addFixkosten()" ${lockAttr()}>+ Posten</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center">
        <span style="font-size:12px;color:var(--muted);margin-right:4px">Filter:</span>
        ${filterChip('alle','Alle')}
        ${alleKats.map(c => filterChip(c, c)).join('')}
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Bezeichnung</th><th>Kategorie</th><th>Rhythmus</th><th>Gültig von</th><th>Gültig bis</th><th>Fällig am</th><th style="text-align:right">Betrag</th><th></th></tr></thead>
        <tbody>
          ${gefiltert.map(f => {
            const active = fixkostenAktivImMonat(f, currentMonth);
            const _istSparen = f.sparenLink && (f.category === 'Sparen' || f.cat === 'Sparen');
            const _istBargeld = _istSparen && (!f.sparenLink.sparTyp || f.sparenLink.sparTyp === 'bargeld');
            let _zielBtn = '';
            if (_istBargeld) {
              if (f.sparenLink.extern) {
                _zielBtn = `<button class="btn-icon" title="Sparen extern – Geld verlässt alle Konten. Klicken zum Ändern." onclick="pickFixkZielkonto('${f.id}')" style="width:auto;min-width:0;padding:0 8px;font-size:12px;white-space:nowrap;gap:4px">🌍 Extern</button>`;
              } else {
                const _zk = kontoById(f.sparenLink.zielkonto);
                const _zkn = _zk ? _zk.name : '— Zielkonto —';
                _zielBtn = `<button class="btn-icon" title="Zielkonto (wohin gespart wird): ${_zkn} – klicken zum Ändern" onclick="pickFixkZielkonto('${f.id}')" style="width:auto;min-width:0;padding:0 8px;font-size:12px;white-space:nowrap;gap:4px">💸 ${_zkn}</button>`;
              }
            }
            // Von-Konto-Button (Quelle der Fixkost)
            const _vk = kontoById(f.kontoId || defaultKontoId());
            const _vkn = _vk ? _vk.name : 'Default';
            const _vonBtn = `<button class="btn-icon" title="Von Konto (woher das Geld abgeht): ${_vkn} – klicken zum Ändern" onclick="pickFixkKonto('${f.id}')" style="width:auto;min-width:0;padding:0 8px;font-size:12px;white-space:nowrap;gap:4px">🏦 ${_vkn}</button>`;
            return `<tr style="${active?'':'opacity:.4'}">
              <td><input type="text" value="${f.name}" onchange="updateFixk('${f.id}','name',this.value)" /></td>
              <td><select onchange="updateFixk('${f.id}','category',this.value)">${['Wohnen','Versicherung','Abo','Kredit','Sparen','Freizeit','Sonstiges'].map(c=>`<option value="${c}" ${c===(f.category||f.cat)?'selected':''}>${c}</option>`).join('')}</select></td>
              <td><select onchange="updateFixk('${f.id}','interval',+this.value)" title="Wie oft wird abgebucht? Voller Betrag im ersten Monat des Intervalls.">${[[1,'monatlich'],[2,'alle 2 Monate'],[3,'alle 3 Monate'],[6,'alle 6 Monate'],[12,'jährlich']].map(([v,l])=>`<option value="${v}" ${(+f.interval||1)===v?'selected':''}>${l}</option>`).join('')}</select></td>
              <td><input type="month" value="${f.start}" onchange="updateFixk('${f.id}','start',this.value)" style="width:145px"/></td>
              <td><input type="month" value="${f.end}" onchange="updateFixk('${f.id}','end',this.value)" style="width:145px"/></td>
              <td><input type="number" value="${f.day||1}" onchange="updateFixk('${f.id}','day',+this.value)" style="width:60px;text-align:center" min="1" max="31"/></td>
              <td><input type="number" value="${(+f.amount||0).toFixed(2)}" onchange="updateFixk('${f.id}','amount',+this.value)" step="0.01" style="width:90px;text-align:right"/> ${currencySymbol()}</td>
              <td style="white-space:nowrap">${_vonBtn}${_zielBtn}<button class="btn-icon danger" onclick="deleteFixk('${f.id}')">×</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>
    </div>`;
}

function addFixkosten(){
  if (!requireUnlocked()) return; openFixkostenModal(); }
function openFixkostenModal() {
  const modal = document.getElementById('fixkostenModal');
  if (!modal) return;
  // Set defaults
  document.getElementById('fk_name').value = '';
  document.getElementById('fk_amount').value = '';
  document.getElementById('fk_day').value = '1';
  if (document.getElementById('fk_interval')) document.getElementById('fk_interval').value = '1';
  document.getElementById('fk_cat').value = 'Sonstiges';
  // Auto-set start to current month
  document.getElementById('fk_start').value = currentMonth;
  // Auto-set end to December of current year
  const yr = getSelectedYear();
  document.getElementById('fk_end').value = yr + '-12';
  // Zielkonto-Dropdown füllen (alle Konten + Extern; Default = erstes Reserve-Konto)
  const fkz = document.getElementById('fk_spar_zielkonto');
  if (fkz) {
    const ks = getKonten();
    fkz.innerHTML = ks.map(k => '<option value="' + k.id + '">' + (k.name||'Konto') + (k.cashflow?' (Cashflow)':' (Reserve)') + '</option>').join('')
      + '<option value="__extern__">🌍 Extern (verlässt alle Konten)</option>';
    const reserve = ks.find(k => !k.cashflow);
    fkz.value = (reserve || ks[0] || {id:''}).id;
  }
  // Von-Konto-Dropdown füllen (Quelle der Fixkost; Default = erstes Cashflow-Konto)
  const fkk = document.getElementById('fk_konto');
  if (fkk) {
    const ks = getKonten();
    fkk.innerHTML = ks.map(k => '<option value="' + k.id + '">' + (k.name||'Konto') + (k.cashflow?' (Cashflow)':' (Reserve)') + '</option>').join('');
    fkk.value = defaultKontoId();
  }
  modal.classList.remove('hidden');
  setTimeout(() => { const n = document.getElementById('fk_name'); if(n) n.focus(); }, 100);
}

function closeFixkostenModal() {
  const modal = document.getElementById('fixkostenModal');
  if (modal) modal.classList.add('hidden');
}

async function saveFixkostenModal() {
  const name   = (document.getElementById('fk_name').value || '').trim();
  const amount = +(document.getElementById('fk_amount').value) || 0;
  const cat    = document.getElementById('fk_cat').value;
  const day    = +(document.getElementById('fk_day').value) || 1;
  const interval = +(document.getElementById('fk_interval')?.value) || 1;
  const start  = document.getElementById('fk_start').value || currentMonth;
  const end    = document.getElementById('fk_end').value || (getSelectedYear()+'-12');
  if (!name || !amount) {
    await uiAlert({ title: 'Eingabe fehlt', icon: '⚠', message: 'Bitte Bezeichnung und Betrag eingeben.' });
    return;
  }
  const f = { id: uid(), name, category: cat, cat, amount, day, interval, start, end };
  // Von-Konto (Quelle der Fixkost)
  f.kontoId = document.getElementById('fk_konto')?.value || defaultKontoId();

  // Sparen-Link: wenn Kategorie = Sparen
  if (cat === 'Sparen') {
    const sparTyp = document.getElementById('fk_spar_typ')?.value || 'bargeld';
    const source  = document.getElementById('fk_spar_source')?.value || 'cashflow';
    const zielRaw = document.getElementById('fk_spar_zielkonto')?.value || '';
    const extern  = zielRaw === '__extern__';
    f.sparenLink = { sparTyp, source, zielkonto: extern ? '' : zielRaw, extern };
    if (sparTyp !== 'bargeld') {
      const sym = document.getElementById('fk_wp_symbol')?.value?.trim() || '';
      const wpName = document.getElementById('fk_wp_name')?.value?.trim() || '';
      if (!sym || !wpName) {
        await uiAlert({ title: 'Wertpapier fehlt', icon: '⚠', message: 'Bitte ein Wertpapier auswählen.' });
        return;
      }
      f.sparenLink.symbol = sym;
      f.sparenLink.name   = wpName;
      f.sparenLink.isin   = document.getElementById('fk_wp_isin')?.value?.trim() || '';
    }
  }

  state.fixkosten.push(f);
  saveData();
  closeFixkostenModal();
  renderPage();
  showToast('Fixkosten gespeichert');
  // Trigger Auto-Eintragung sofort für den ersten Monat
  if (f.sparenLink) await runSparenAutoEintragung();
}

// ── AUTO-EINTRAGUNG: Fixkosten "Sparen" → Sparen-/Depot-Einträge ────────
async function runSparenAutoEintragung() {
  const yr = getSelectedYear();
  const months = monthsBetween(yr + '-01', yr + '-12');
  const today_ym = new Date().toISOString().slice(0,7);
  let createdCount = 0;
  // Alle Fixkosten der Kategorie „Sparen" – auch ohne sparenLink (= einfaches Bargeld-Sparen).
  const linkedFixkosten = (state.fixkosten||[]).filter(f => (f.category === 'Sparen' || f.cat === 'Sparen'));

  for (const f of linkedFixkosten) {
    // Externe Sparpläne (verlassen alle Konten) erzeugen keinen Sparen-Eintrag.
    if (f.sparenLink && f.sparenLink.extern) continue;
    for (const m of months) {
      // Nur Monate in Gültigkeitszeitraum + nicht in Zukunft + im Rhythmus fällig
      if (f.start && m < f.start) continue;
      if (f.end && m > f.end) continue;
      if (m > today_ym) continue;  // future months not yet auto-created
      if (!fixkostenAktivImMonat(f, m)) continue;  // Rhythmus berücksichtigen
      // Check ob bereits eingetragen (entweder Auto oder manuell mit gleichem Wertpapier+Monat)
      const sym = f.sparenLink?.symbol || '';
      const alreadyExists = (state.sparen||[]).some(s => {
        const sMonth = s.month || (s.date ? s.date.slice(0,7) : '');
        if (s.autoFromFixkostenId === f.id && sMonth === m) return true;
        // Manuelle Einträge mit gleichem Wertpapier+Monat → nicht doppeln
        if (sym && sMonth === m) {
          const sSym = (s.wertpapier?.symbol) || (s.etf?.ticker) || '';
          if (sSym === sym) return true;
        }
        return false;
      });
      if (alreadyExists) continue;
      // Erstelle Eintrag - Datum = Monatsanfang
      const date = m + '-01';
      const sparTyp = f.sparenLink?.sparTyp || 'bargeld';
      const entry = {
        id: uid(),
        date,
        month: m,
        amount: +f.amount,
        kategorie: sparTyp === 'bargeld' ? 'Sparen' :
                   sparTyp === 'etf' ? 'ETF' :
                   sparTyp === 'fonds' ? 'Fonds' :
                   sparTyp === 'aktie' ? 'Aktien' : 'Krypto',
        depot: 'Auto (' + f.name + ')',
        note: 'Automatisch aus Fixkosten „' + f.name + '"',
        autoFromFixkostenId: f.id,
      };
      if (f.sparenLink && sparTyp !== 'bargeld' && f.sparenLink.symbol) {
        entry.wertpapier = {
          symbol: f.sparenLink.symbol,
          name:   f.sparenLink.name,
          isin:   f.sparenLink.isin || '',
          typ:    sparTyp,
        };
        // Try to fetch historical price for this month
        const price = await fetchWertpapierKursAtDate(f.sparenLink.symbol, date);
        if (price) {
          entry.price = price;
          entry.units = +((Math.max(0, f.amount) / price).toFixed(6));
        }
        // Legacy etf field
        entry.etf = { name: f.sparenLink.name, ticker: f.sparenLink.symbol, isin: f.sparenLink.isin || '' };
      }
      state.sparen.push(entry);
      createdCount++;
    }
  }
  if (createdCount > 0) {
    saveData();
    showToast(createdCount + ' Sparen-Eintrag/e automatisch erstellt');
    if (currentPage === 'sparen' || currentPage === 'fixkosten') renderPage();
  }
}

window.runSparenAutoEintragung = runSparenAutoEintragung;

function updateFixk(id,field,val){
  if (!requireUnlocked()) return;const f=state.fixkosten.find(x=>String(x.id) === String(id));if(f){f[field]=val;saveData();}}
async function deleteFixk(id) {
  if (!requireUnlocked()) return;
  // Check if this Fixkosten has a sparenLink → ask whether to also clean up auto-sparen entries
  const f = state.fixkosten.find(x => String(x.id) === String(id));
  let cleanupAuto = false;
  if (f && f.sparenLink) {
    const linkedAutos = (state.sparen||[]).filter(s => s.autoFromFixkostenId === f.id);
    if (linkedAutos.length > 0) {
      cleanupAuto = await uiConfirm({
        title: 'Auto-Einträge auch löschen?',
        icon: '🔗',
        message: 'Dieser Sparplan hat <strong>' + linkedAutos.length + ' automatische Einträge</strong> in „Sparen & Depot" erzeugt.',
        details: ['Bei „Ja" werden auch diese Einträge gelöscht', 'Bei „Nein" bleiben sie als manuelle Einträge erhalten'],
        okLabel: 'Ja, auch löschen',
        cancelLabel: 'Nein, behalten',
      });
    }
  }
  if (moveToTrash('fixkosten', id, 'Fixkosten')) {
    if (cleanupAuto && f) {
      state.sparen = (state.sparen||[]).filter(s => s.autoFromFixkostenId !== f.id);
      saveData();
    }
    renderPage();
    showToast('In Papierkorb verschoben','info');
  }
}

// ── PAGE: SPAREN ──────────────────────────────────────────────────────────
function sparen() {
  const items = [...state.sparen].sort((a,b)=>a.date.localeCompare(b.date));
  const total = items.reduce((s,x)=>s+x.amount,0);
  const byMonth = {};
  items.forEach(s => { const m = s.month || (s.date ? s.date.slice(0,7) : ''); if (!m) return; byMonth[m] = (byMonth[m]||0) + (+s.amount||0); });
  const monthRows = Object.keys(byMonth).sort().map(m =>
    '<div style="display:flex;justify-content:space-between;align-items:center;background:var(--surface);border-left:3px solid var(--accent);border-radius:6px;padding:8px 12px">' +
      '<span style="font-size:12px;font-weight:600;color:var(--muted)">' + monthLabel(m) + '</span>' +
      '<span style="font-weight:700;color:var(--green)">' + fmtEur(byMonth[m]) + '</span>' +
    '</div>').join('');
  return `${lockBanner()}
    <div class="card">
    <div class="card-header">
      <h3>Sparen & Depot ${getSelectedYear()}</h3>
      <div class="actions">
        <span class="badge badge-green">Gesamt: ${fmtEur(total)}</span>
        <button class="btn btn-primary btn-sm" onclick="addSparen()" ${lockAttr()}>+ Einzahlung</button>
      </div>
    </div>
    ${monthRows ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin-bottom:16px">${monthRows}</div>` : ''}
    <div class="table-wrap"><table>
      <thead><tr><th>Datum</th><th>Kategorie / Anbieter</th><th>Notiz</th><th style="text-align:right">Betrag</th><th></th></tr></thead>
      <tbody id="sparenTable">
        ${items.map(s=>{
          const wp = s.wertpapier || s.etf || null;
          const wpName = wp ? (wp.name || wp.ticker || wp.symbol || '') : '';
          const wpInfo = wp ? '<div style="font-size:11px;color:var(--muted);margin-top:2px">' +
              (wp.typ === 'aktie' ? '📊 ' : wp.typ === 'etf' ? '📈 ' : wp.typ === 'fonds' ? '🏛 ' : wp.typ === 'krypto' ? '🪙 ' : '💼 ') + wpName +
              (s.units ? ' · ' + (s.units > 0 ? s.units.toFixed(4) + ' Stk' : Math.abs(s.units).toFixed(4) + ' Stk Verkauf') : '') +
              (s.price ? ' @ ' + fmtEur(s.price) : '') +
            '</div>' : '';
          return `<tr id="spar_${s.id}">
          <td><input type="date" value="${s.date}" onchange="updateSparen('${s.id}','date',this.value)" style="width:145px"/></td>
          <td><input type="text" value="${s.depot||''}" onchange="updateSparen('${s.id}','depot',this.value)" placeholder="Trade Republic, Tagesgeld…"/>${wpInfo}</td>
          <td><input type="text" value="${s.note||''}" onchange="updateSparen('${s.id}','note',this.value)" placeholder="Notiz…"/></td>
          <td><input type="number" value="${(+s.amount||0).toFixed(2)}" onchange="updateSparen('${s.id}','amount',+this.value)" step="0.01" style="width:100px;text-align:right"/> ${currencySymbol()}</td>
          <td style="white-space:nowrap">
            ${wp ? '<button class="btn-icon" onclick="editSparenEntry(\''+s.id+'\')" title="Bearbeiten">✎</button>' : ''}
            <button class="btn-icon danger" onclick="deleteSpar('${s.id}')">×</button>
          </td>
        </tr>`}).join('')}

      </tbody>
    </table></div>
    <div id='etf_live_wrap' style='min-height:0'>${buildEtfLiveSection()}</div>
  </div>`;
}

// ── PAGE: UMBUCHUNGEN ───────────────────────────────────────────────────────
function kontoName(id) { const k = kontoById(id); return k ? k.name : '—'; }

function umbuchungen() {
  const items = [...(state.umbuchungen||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const ks = getKonten();
  const kontoOpts = (sel) => ks.map(k => '<option value="'+k.id+'"'+(k.id===sel?' selected':'')+'>'+(k.name||'Konto')+(k.cashflow?' (Cashflow)':' (Reserve)')+'</option>').join('');
  const total = items.reduce((s,u)=>s+(+u.amount||0),0);
  const rows = items.map(u => {
    return '<tr id="umb_'+u.id+'">' +
      '<td><input type="date" value="'+(u.date||'')+'" onchange="updateUmbuchung(\''+u.id+'\',\'date\',this.value)" style="width:145px"/></td>' +
      '<td><select onchange="updateUmbuchung(\''+u.id+'\',\'vonKonto\',this.value)" '+lockAttr()+'>'+kontoOpts(u.vonKonto)+'</select></td>' +
      '<td style="text-align:center;color:var(--muted)">→</td>' +
      '<td><select onchange="updateUmbuchung(\''+u.id+'\',\'nachKonto\',this.value)" '+lockAttr()+'>'+kontoOpts(u.nachKonto)+'</select></td>' +
      '<td><input type="text" value="'+(u.note||'').replace(/"/g,'&quot;')+'" onchange="updateUmbuchung(\''+u.id+'\',\'note\',this.value)" placeholder="Notiz…"/></td>' +
      '<td style="white-space:nowrap"><input type="number" value="'+(+u.amount||0).toFixed(2)+'" step="0.01" onchange="updateUmbuchung(\''+u.id+'\',\'amount\',+this.value)" style="width:100px;text-align:right"/> '+currencySymbol()+'</td>' +
      '<td><button class="btn-icon danger" onclick="deleteUmbuchung(\''+u.id+'\')" '+lockAttr()+'>×</button></td>' +
      '</tr>';
  }).join('');
  // Sparen-Fixkosten (Bargeld + Zielkonto) als automatische Umbuchungen (read-only)
  const def = defaultKontoId();
  const autoTransfers = (state.fixkosten||[])
    .filter(f => f.sparenLink && (f.category==='Sparen'||f.cat==='Sparen')
      && (!f.sparenLink.sparTyp || f.sparenLink.sparTyp==='bargeld')
      && f.sparenLink.zielkonto)
    .map(f => '<tr style="opacity:.85">' +
      '<td style="color:var(--muted)">monatl. (Tag '+(f.day||1)+')</td>' +
      '<td>'+kontoName(def)+'</td>' +
      '<td style="text-align:center;color:var(--muted)">→</td>' +
      '<td>'+kontoName(f.sparenLink.zielkonto)+'</td>' +
      '<td><span class="badge badge-green" style="font-size:9px">SPARPLAN</span> '+(f.name||'')+'</td>' +
      '<td style="text-align:right">'+fmtEur(+f.amount||0)+' '+currencySymbol()+'</td>' +
      '<td><span style="color:var(--muted);font-size:11px" title="In Fixkosten verwalten">🔒</span></td>' +
      '</tr>').join('');
  return `${lockBanner()}
    <div class="card">
    <div class="card-header">
      <h3>🔄 Umbuchungen ${getSelectedYear()}</h3>
      <div class="actions">
        <span class="badge badge-muted">Gesamt umgebucht: ${fmtEur(total)}</span>
        <button class="btn btn-primary btn-sm" onclick="addUmbuchung()" ${lockAttr()}>+ Umbuchung</button>
      </div>
    </div>
    <p style="font-size:12px;color:var(--muted);margin:0 0 12px">Umbuchungen verschieben Geld zwischen deinen Konten. Sie mindern den Cashflow des Quellkontos und erhöhen den des Zielkontos – in der Gesamtsumme sind sie neutral.</p>
    ${(items.length || autoTransfers) ? `<div class="table-wrap"><table>
      <thead><tr><th>Datum</th><th>Von Konto</th><th></th><th>Nach Konto</th><th>Notiz</th><th style="text-align:right">Betrag</th><th></th></tr></thead>
      <tbody>${rows}${autoTransfers}</tbody>
    </table></div>` : '<div class="empty-state" style="padding:24px"><div class="empty-icon">🔄</div><p>Noch keine Umbuchungen.<br>Über „+ Umbuchung" einen Transfer zwischen zwei Konten anlegen.</p></div>'}
  </div>`;
}

function addUmbuchung() {
  if (!requireUnlocked()) return;
  const ks = getKonten();
  if (ks.length < 2) { showToast('Mindestens zwei Konten nötig für eine Umbuchung','info'); return; }
  const von = (ks.find(k=>k.cashflow) || ks[0]).id;
  const nach = (ks.find(k=>k.id!==von) || ks[1] || ks[0]).id;
  const u = { id: uid(), date: today(), month: currentMonth, vonKonto: von, nachKonto: nach, amount: 0, note: '' };
  state.umbuchungen.push(u);
  saveData(); renderPage();
}
function updateUmbuchung(id, field, val) {
  if (!requireUnlocked()) return;
  const u = (state.umbuchungen||[]).find(x => String(x.id) === String(id));
  if (!u) return;
  u[field] = val;
  if (field === 'date') u.month = (val||'').slice(0,7);
  saveData(); renderPage();
}
function deleteUmbuchung(id) {
  if (!requireUnlocked()) return;
  if (moveToTrash('umbuchungen', id, 'Umbuchung')) { renderPage(); showToast('In Papierkorb verschoben','info'); }
}

function buildEtfLiveSection() {
  const cfg = state.config || {};
  const kurse = state.etfKurse || {};
  // Aggregate positions: group by symbol
  const positions = {};
  (state.sparen||[]).forEach(s => {
    const wp = s.wertpapier || s.etf;
    if (!wp || !(wp.symbol || wp.ticker)) return;
    const sym = wp.symbol || wp.ticker;
    if (!positions[sym]) {
      positions[sym] = {
        symbol: sym,
        name: wp.name || sym,
        isin: wp.isin || '',
        typ:  wp.typ || (s.kategorie === 'ETF' ? 'etf' : s.kategorie === 'Fonds' ? 'fonds' : 'aktie'),
        invested: 0,
        units: 0,
        trades: [],
      };
    }
    const p = positions[sym];
    p.invested += (+s.amount) || 0;
    if (typeof s.units === 'number') p.units += s.units;
    p.trades.push(s);
  });
  const list = Object.values(positions);
  if (!list.length) return '';

  const cards = list.map(p => {
    const k = kurse[p.symbol];
    const hasLive = !!(k && k.kurs);
    const change = hasLive && k.vortag ? ((k.kurs - k.vortag) / k.vortag * 100) : null;
    const aktuellerWert = hasLive ? p.units * k.kurs : null;
    const gv = (aktuellerWert !== null) ? (aktuellerWert - p.invested) : null;
    const gvPct = (gv !== null && p.invested > 0) ? (gv / p.invested * 100) : null;
    const tradesCount = p.trades.length;
    const typeBadge = '<span class="badge ' + (p.typ === 'etf' ? 'badge-green' : p.typ === 'aktie' ? 'badge-blue' : p.typ === 'fonds' ? 'badge-amber' : 'badge-muted') + '" style="font-size:9px">' + (p.typ === 'etf' ? 'ETF' : p.typ === 'aktie' ? 'AKTIE' : p.typ === 'fonds' ? 'FONDS' : (p.typ||'').toUpperCase()) + '</span>';
    const priceBtn = '<button class="btn-icon" onclick="setManualPrice(\'' + p.symbol + '\',' + (k?.kurs||'null') + ')" title="Kurs manuell eintragen" style="font-size:11px;padding:3px 7px;background:transparent;border:1px solid var(--border);border-radius:4px;cursor:pointer">✎ Kurs</button>';
    return '<div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px 16px;min-width:0">' +
      '<div style="display:flex;align-items:start;justify-content:space-between;gap:8px;margin-bottom:4px">' +
        '<div style="font-size:13px;font-weight:700;line-height:1.3;flex:1;min-width:0">' + p.name + '</div>' +
        typeBadge +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
        '<div style="font-size:10px;color:var(--muted);font-family:monospace">' + p.symbol + (p.isin ? ' · ' + p.isin : '') + '</div>' +
        priceBtn +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">' +
        '<div><div style="font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase">Investiert</div>' +
          '<div style="font-size:14px;font-weight:700">' + fmtEur(p.invested) + '</div></div>' +
        '<div><div style="font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase">Stücke</div>' +
          '<div style="font-size:14px;font-weight:700">' + (p.units ? p.units.toFixed(4) : '–') + '</div></div>' +
        (hasLive ? (
          '<div><div style="font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase">Aktueller Kurs</div>' +
            '<div style="font-size:14px;font-weight:700">' + fmtEur(k.kurs) + (change !== null ? ' <span style="font-size:11px;color:' + (change >= 0 ? 'var(--green)' : 'var(--red)') + '">' + (change >= 0 ? '+' : '') + change.toFixed(2) + '%</span>' : '') + '</div></div>' +
          '<div><div style="font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase">Wert</div>' +
            '<div style="font-size:14px;font-weight:700">' + fmtEur(aktuellerWert) + '</div></div>'
        ) : '') +
      '</div>' +
      (gv !== null ? (
        '<div style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px">' +
          '<div style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;margin-bottom:2px">Gewinn/Verlust</div>' +
          '<div style="font-size:16px;font-weight:700;color:' + (gv >= 0 ? 'var(--green)' : 'var(--red)') + '">' +
            (gv >= 0 ? '+' : '') + fmtEur(gv) + 
            (gvPct !== null ? ' <span style="font-size:12px">(' + (gvPct >= 0 ? '+' : '') + gvPct.toFixed(2) + '%)</span>' : '') +
          '</div>' +
        '</div>'
      ) : '') +
      '<div style="font-size:11px;color:var(--muted);margin-top:8px">' + tradesCount + ' Transaktion' + (tradesCount === 1 ? '' : 'en') + '</div>' +
      '</div>';
  }).join('');

  const refreshBtn = '<button class="btn btn-ghost btn-sm" onclick="refreshAllWertpapierKurse()">↻ Kurse aktualisieren</button>';
  return '<div style="margin-top:24px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
    '<h3 style="margin:0">📈 Depot-Positionen</h3>' + refreshBtn +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">' + cards + '</div>' +
    '</div>';
}


function onSparKatChange() {
  const kat = document.getElementById('sp_kat').value;
  const cl  = document.getElementById('sp_kat_custom_label');
  const etf = document.getElementById('sp_etf_section');
  if (cl) cl.classList.toggle('hidden', kat !== 'Sonstiges');
  // Show Wertpapier section for all securities types
  const isWp = ['ETF','Fonds','Aktien','Krypto'].includes(kat);
  if (etf) etf.classList.toggle('hidden', !isWp);
  // Auto-select correct Typ
  const wpTyp = document.getElementById('sp_wp_typ');
  if (wpTyp && isWp) {
    if (kat === 'ETF') wpTyp.value = 'etf';
    else if (kat === 'Fonds') wpTyp.value = 'fonds';
    else if (kat === 'Aktien') wpTyp.value = 'aktie';
    else if (kat === 'Krypto') wpTyp.value = 'krypto';
  }
}
function onSparAnbieterChange() {
  const val = document.getElementById('sp_anbieter').value;
  const cl  = document.getElementById('sp_anbieter_custom_label');
  if (cl) cl.classList.toggle('hidden', val !== 'Sonstiges');
}
function onEtfChange() {
  const etf = document.getElementById('sp_etf').value;
  const cl  = document.getElementById('sp_etf_custom_label');
  if (cl) cl.classList.toggle('hidden', etf !== 'Eigener ETF / Sonstiges');
  const found = ETF_LISTE.find(e => e.name === etf);
  if (found) {
    const fields = {sp_isin: found.isin, sp_wkn: found.wkn, sp_ticker: found.ticker, sp_etf_anbieter: found.beispiel.split(' UCITS')[0]};
    Object.entries(fields).forEach(([id, val]) => {
      const el2 = document.getElementById(id);
      if (el2) el2.value = val || '';
    });
  }
}
function openSparenModal() {
  if (!requireUnlocked()) return;
  const modal = document.getElementById('sparenModal');
  if (!modal) return;
  document.getElementById('sp_date').value    = today();
  document.getElementById('sp_amount').value  = '';
  document.getElementById('sp_kat').value     = 'Tagesgeld';
  document.getElementById('sp_anbieter').value= 'Trade Republic';
  document.getElementById('sp_note').value    = '';
  ['sp_kat_custom_label','sp_anbieter_custom_label','sp_etf_section'].forEach(id => {
    const el2 = document.getElementById(id);
    if (el2) el2.classList.add('hidden');
  });
  // Reset Wertpapier fields
  ['sp_isin','sp_wkn','sp_ticker','sp_etf_custom','sp_wp_search','sp_tx_units','sp_tx_price','sp_tx_fees'].forEach(id => {
    const el2 = document.getElementById(id);
    if (el2) el2.value = '';
  });
  const wpTyp = document.getElementById('sp_wp_typ');
  if (wpTyp) wpTyp.value = 'etf';
  const txType = document.getElementById('sp_tx_type');
  if (txType) txType.value = 'kauf';
  const txMode = document.getElementById('sp_tx_mode');
  if (txMode) txMode.value = 'amount';
  // Hide unit/price fields by default
  ['sp_tx_units_label','sp_tx_price_label'].forEach(id => {
    const el2 = document.getElementById(id);
    if (el2) el2.classList.add('hidden');
  });
  const res = document.getElementById('sp_wp_results');
  if (res) { res.innerHTML = ''; res.style.display = 'none'; }
  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('sp_amount').focus(), 100);
}

// Edit an existing Sparen entry - opens modal pre-filled
function editSparenEntry(id) {
  if (!requireUnlocked()) return;
  const entry = state.sparen.find(s => String(s.id) === String(id));
  if (!entry) return;
  // Mark editing mode
  state._editingSparenId = String(id);
  openSparenModal();
  // Pre-fill fields after modal is open
  setTimeout(() => {
    document.getElementById('sp_date').value     = entry.date || today();
    document.getElementById('sp_amount').value   = (Math.abs(+entry.amount) || 0).toFixed(2);
    document.getElementById('sp_kat').value      = entry.kategorie || 'Tagesgeld';
    document.getElementById('sp_anbieter').value = entry.depot || 'Trade Republic';
    document.getElementById('sp_note').value     = entry.note || '';
    // Trigger Kat handler (shows ETF section)
    onSparKatChange();
    const wp = entry.wertpapier || entry.etf || null;
    if (wp) {
      document.getElementById('sp_etf_custom').value = wp.name || '';
      document.getElementById('sp_ticker').value     = wp.symbol || wp.ticker || '';
      document.getElementById('sp_isin').value       = wp.isin || '';
      document.getElementById('sp_wkn').value        = wp.wkn || '';
      const wpTyp = document.getElementById('sp_wp_typ');
      if (wpTyp) wpTyp.value = wp.typ || 'etf';
      document.getElementById('sp_wp_search').value  = wp.name || '';
      // Set transaction details
      document.getElementById('sp_tx_type').value = entry.txType || (entry.amount < 0 ? 'verkauf' : 'kauf');
      if (entry.units) {
        document.getElementById('sp_tx_mode').value = 'units';
        onTxModeChange();
        document.getElementById('sp_tx_units').value = Math.abs(+entry.units).toFixed(4);
        document.getElementById('sp_tx_price').value = (+entry.price || 0).toFixed(2);
      }
      if (entry.fees) document.getElementById('sp_tx_fees').value = (+entry.fees).toFixed(2);
    }
    // Change modal title + button label
    const title = document.querySelector('#sparenModal .modal-title');
    if (title) title.textContent = 'Eintrag bearbeiten';
  }, 50);
}

window.editSparenEntry = editSparenEntry;

// ── WERTPAPIER SEARCH UI ────────────────────────────────────────────────
let _wpSearchDebounce = null;
function onWpSearchInput(query) {
  clearTimeout(_wpSearchDebounce);
  const resultsEl = document.getElementById('sp_wp_results');
  if (!resultsEl) return;
  if (!query || query.length < 1) {
    resultsEl.innerHTML = '';
    resultsEl.style.display = 'none';
    return;
  }
  resultsEl.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px">Suche…</div>';
  resultsEl.style.display = 'block';
  _wpSearchDebounce = setTimeout(() => {
    searchWertpapier(query, (results) => {
      if (!results.length) {
        resultsEl.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px">Keine Treffer.</div>';
        return;
      }
      resultsEl.innerHTML = results.map(r => {
        const name = (r.longname || r.shortname || r.symbol || '').replace(/"/g, '&quot;');
        const typeColors = { EQUITY: 'badge-blue', ETF: 'badge-green', MUTUALFUND: 'badge-muted' };
        const typeLabels = { EQUITY: 'Aktie', ETF: 'ETF', MUTUALFUND: 'Fonds' };
        const badge = '<span class="badge ' + (typeColors[r.quoteType]||'badge-muted') + '" style="font-size:10px">' + (typeLabels[r.quoteType]||r.quoteType) + '</span>';
        const exch = r.exchange ? '<span style="font-size:10px;color:var(--muted)"> · ' + r.exchange + '</span>' : '';
        return '<div style="padding:10px 14px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;align-items:center;gap:10px" ' +
          'onmouseover="this.style.background=\'var(--surface)\'" onmouseout="this.style.background=\'\'" ' +
          'onclick="selectWertpapier(\'' + r.symbol + '\',\'' + name.replace(/'/g, '&#39;') + '\',\'' + (r.quoteType||'') + '\')">' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + name + '</div>' +
            '<div style="font-size:11px;color:var(--muted);font-family:monospace">' + r.symbol + exch + '</div>' +
          '</div>' + badge +
          '</div>';
      }).join('');
    });
  }, 300);
}

async function selectWertpapier(symbol, name, quoteType) {
  // Hide results
  const res = document.getElementById('sp_wp_results');
  if (res) res.style.display = 'none';
  // Look up in local DB for full details (ISIN/WKN)
  const local = WERTPAPIER_DB.find(wp => wp.symbol === symbol);
  // Fill manual fields
  document.getElementById('sp_etf_custom').value = name;
  document.getElementById('sp_ticker').value = symbol;
  document.getElementById('sp_wp_search').value = name;
  if (local) {
    document.getElementById('sp_isin').value = local.isin || '';
    document.getElementById('sp_wkn').value  = local.wkn || '';
  }
  // Set type
  const wpTyp = document.getElementById('sp_wp_typ');
  if (wpTyp) {
    if (local?.typ) wpTyp.value = local.typ;
    else if (quoteType === 'EQUITY') wpTyp.value = 'aktie';
    else if (quoteType === 'ETF') wpTyp.value = 'etf';
    else if (quoteType === 'MUTUALFUND') wpTyp.value = 'fonds';
    else if (quoteType === 'CRYPTOCURRENCY') wpTyp.value = 'krypto';
  }
  // Try to fetch + cache current price (best-effort, often blocked)
  try {
    const k = await fetchWertpapierKurs(symbol);
    if (k) {
      state.etfKurse = state.etfKurse || {};
      state.etfKurse[symbol] = k;
      const priceEl = document.getElementById('sp_tx_price');
      if (priceEl && !priceEl.value) priceEl.value = (+k.kurs).toFixed(2);
    }
  } catch {}
}

function onTxModeChange() {
  const mode = document.getElementById('sp_tx_mode')?.value;
  const unitsLabel = document.getElementById('sp_tx_units_label');
  const priceLabel = document.getElementById('sp_tx_price_label');
  if (mode === 'units') {
    unitsLabel?.classList.remove('hidden');
    priceLabel?.classList.remove('hidden');
  } else {
    unitsLabel?.classList.add('hidden');
    priceLabel?.classList.add('hidden');
  }
}

window.onWpSearchInput = onWpSearchInput;
window.selectWertpapier = selectWertpapier;
window.onTxModeChange = onTxModeChange;

function onSpTxTypeChange() {
  const type = document.getElementById('sp_tx_type')?.value;
  if (type === 'bestand') {
    // Force unit-mode (need stückzahl + kaufkurs to compute G/V correctly)
    const modeSel = document.getElementById('sp_tx_mode');
    if (modeSel) {
      modeSel.value = 'units';
      onTxModeChange();
    }
    showToast('Bestand-Modus: Bitte Stückzahl und damaligen Kaufkurs eintragen', 'info');
  }
}
window.onSpTxTypeChange = onSpTxTypeChange;

async function editEtfTicker(id) {
  if (!requireUnlocked()) return;
  const s = (state.sparen||[]).find(x=>String(x.id) === String(id));
  if (!s) return;
  const ticker = await uiPrompt({ title: 'ETF-Ticker', message: 'Ticker eingeben: ' + (s.etf?.name||'ETF') + ' — Beispiele: EUNL.DE, VWCE.DE, SXR8.DE', value: s.etf?.ticker || '', placeholder: 'z.B. VWCE.DE' });
  if (ticker === null) return; // cancelled
  if (!s.etf) s.etf = {};
  s.etf.ticker = ticker.trim().toUpperCase();
  saveData();
  renderPage();
  if (ticker.trim()) showToast('Ticker gespeichert: ' + s.etf.ticker);
}

function closeSparenModal() {
  const modal = document.getElementById('sparenModal');
  if (modal) modal.classList.add('hidden');
  state._editingSparenId = null;
  // Reset title back to default
  const title = document.querySelector('#sparenModal .modal-title');
  if (title) title.textContent = 'Neue Einzahlung';
}

// ── SPARPLAN MODAL (Fixkosten aus Sparen) ──────────────────────────────
let _sparplanContext = null; // { wertpapier, amount }

function openSparplanModal(wertpapier, amount) {
  _sparplanContext = { wertpapier, amount };
  const modal = document.getElementById('sparplanModal');
  if (!modal) return;
  // Pre-fill
  document.getElementById('spp_name').value   = 'Sparplan ' + (wertpapier.name || wertpapier.symbol);
  document.getElementById('spp_amount').value = (+amount).toFixed(2);
  document.getElementById('spp_day').value    = '1';
  document.getElementById('spp_start').value  = currentMonth;
  document.getElementById('spp_end').value    = getSelectedYear() + '-12';
  document.getElementById('spp_source').value = 'cashflow';
  // Show readonly Wertpapier info
  const info = document.getElementById('spp_wp_info');
  if (info) {
    const typLabel = wertpapier.typ === 'aktie' ? 'Aktie' : wertpapier.typ === 'etf' ? 'ETF' : wertpapier.typ === 'fonds' ? 'Fonds' : wertpapier.typ === 'krypto' ? 'Krypto' : 'Wertpapier';
    info.innerHTML = '<strong>' + (wertpapier.name || '') + '</strong><br>' +
      '<span style="font-family:monospace;font-size:11px;color:var(--muted)">' + (wertpapier.symbol || '') +
      (wertpapier.isin ? ' · ' + wertpapier.isin : '') + ' · ' + typLabel + '</span>';
  }
  modal.classList.remove('hidden');
}

function closeSparplanModal() {
  const modal = document.getElementById('sparplanModal');
  if (modal) modal.classList.add('hidden');
  _sparplanContext = null;
}

async function saveSparplanModal() {
  if (!_sparplanContext) { closeSparplanModal(); return; }
  const { wertpapier } = _sparplanContext;
  const name   = document.getElementById('spp_name').value?.trim() || 'Sparplan';
  const amount = +(document.getElementById('spp_amount').value) || 0;
  const day    = +(document.getElementById('spp_day').value) || 1;
  const start  = document.getElementById('spp_start').value || currentMonth;
  const end    = document.getElementById('spp_end').value || (getSelectedYear()+'-12');
  const source = document.getElementById('spp_source').value || 'cashflow';
  if (!amount || amount <= 0) {
    await uiAlert({ title: 'Betrag fehlt', icon: '⚠', message: 'Bitte gültigen Betrag eingeben.' });
    return;
  }
  if (start > end) {
    await uiAlert({ title: 'Zeitraum ungültig', icon: '⚠', message: '„Gültig von" muss vor „Gültig bis" liegen.' });
    return;
  }
  // Create Fixkosten entry with sparenLink
  const fk = {
    id: uid(),
    name,
    category: 'Sparen', cat: 'Sparen',
    amount, day, start, end,
    sparenLink: {
      sparTyp: wertpapier.typ || 'etf',
      source,
      symbol: wertpapier.symbol || '',
      name:   wertpapier.name || '',
      isin:   wertpapier.isin || '',
    },
  };
  state.fixkosten.push(fk);
  saveData();
  closeSparplanModal();
  renderPage();
  showToast('Sparplan angelegt – wird monatlich automatisch eingetragen');
  // Trigger auto-eintragung for all months in range
  await runSparenAutoEintragung();
}

window.openSparplanModal = openSparplanModal;
window.closeSparplanModal = closeSparplanModal;
window.saveSparplanModal = saveSparplanModal;
async function saveSparenModal() {
  if (!requireUnlocked()) return;
  const date    = document.getElementById('sp_date').value;
  let   amount  = +(document.getElementById('sp_amount').value) || 0;
  const kat     = document.getElementById('sp_kat').value;
  const katCustom = document.getElementById('sp_kat_custom')?.value || '';
  const anbieter = document.getElementById('sp_anbieter').value;
  const anbieterCustom = document.getElementById('sp_anbieter_custom')?.value || '';
  const note    = document.getElementById('sp_note').value;

  // Wertpapier-Felder (ETF/Aktien/Fonds/Krypto)
  const isWertpapier = ['ETF','Fonds','Aktien','Krypto'].includes(kat);
  let wertpapier = null, txType = 'kauf', units = 0, price = 0, fees = 0;
  if (isWertpapier) {
    const symbol = document.getElementById('sp_ticker')?.value?.trim() || '';
    const wpName = document.getElementById('sp_etf_custom')?.value?.trim() || '';
    if (!wpName) { await uiAlert({ title: 'Wertpapier fehlt', icon: '⚠', message: 'Bitte ein Wertpapier auswählen oder suchen.' }); return; }
    if (!symbol) {
      const cont = await uiConfirm({
        title: 'Symbol fehlt',
        icon: '⚠',
        message: 'Ohne Symbol/Ticker können keine Live-Kurse abgerufen werden. Trotzdem speichern?',
        details: ['Du kannst das Symbol später ergänzen', 'Stückzahl-Berechnung erfolgt dann manuell'],
        okLabel: 'Trotzdem speichern',
        cancelLabel: 'Abbrechen',
      });
      if (!cont) return;
    }
    wertpapier = {
      symbol,
      name: wpName,
      isin: document.getElementById('sp_isin')?.value?.trim() || '',
      wkn:  document.getElementById('sp_wkn')?.value?.trim() || '',
      typ:  document.getElementById('sp_wp_typ')?.value || 'etf',
    };
    txType = document.getElementById('sp_tx_type')?.value || 'kauf';
    fees = +(document.getElementById('sp_tx_fees')?.value) || 0;
    const mode = document.getElementById('sp_tx_mode')?.value || 'amount';
    if (mode === 'units') {
      units = +(document.getElementById('sp_tx_units')?.value) || 0;
      price = +(document.getElementById('sp_tx_price')?.value) || 0;
      if (!units || !price) { await uiAlert({ title: 'Werte fehlen', icon: '⚠', message: 'Bitte Stückzahl und Kurs eingeben.' }); return; }
      amount = +(units * price + fees).toFixed(2);
    } else {
      // amount-Modus
      if (!amount) { await uiAlert({ title: 'Betrag fehlt', icon: '⚠', message: 'Bitte Betrag eingeben.' }); return; }
      // Try to get current price from cache to compute units
      const cached = symbol ? (state.etfKurse?.[symbol]) : null;
      if (cached?.kurs) {
        const usable = Math.max(0, amount - fees);
        price = +cached.kurs;
        units = +((usable / price).toFixed(6));
      }
    }
  } else {
    if (!amount) { await uiAlert({ title: 'Betrag fehlt', icon: '⚠', message: 'Bitte Betrag eingeben.' }); return; }
  }

  const entry = {
    id: uid(),
    date,
    amount: txType === 'verkauf' ? -Math.abs(amount) : amount,
    note,
    kategorie: kat === 'Sonstiges' ? katCustom || 'Sonstiges' : kat,
    depot: anbieter === 'Sonstiges' ? anbieterCustom || 'Sonstiges' : anbieter,
  };
  if (wertpapier) {
    entry.wertpapier = wertpapier;
    entry.txType = txType;
    entry.units  = txType === 'verkauf' ? -Math.abs(units) : units;
    entry.price  = price;
    entry.fees   = fees;
    // Bestand-Übernahme zählt NICHT zum aktuellen Cashflow (rein historisch)
    if (txType === 'bestand') entry.skipCashflow = true;
    // Legacy compatibility for existing etfLive code
    entry.etf = {
      name:   wertpapier.name,
      ticker: wertpapier.symbol,
      isin:   wertpapier.isin,
      wkn:    wertpapier.wkn,
    };
  }
  // Edit-Mode: replace existing entry instead of pushing new one
  const editId = state._editingSparenId;
  if (editId) {
    const oldIdx = state.sparen.findIndex(s => String(s.id) === editId);
    if (oldIdx !== -1) {
      entry.id = state.sparen[oldIdx].id;
      // Preserve auto-Eintragung marker
      if (state.sparen[oldIdx].autoFromFixkostenId) entry.autoFromFixkostenId = state.sparen[oldIdx].autoFromFixkostenId;
      state.sparen[oldIdx] = entry;
    }
    state._editingSparenId = null;
  } else {
    state.sparen.push(entry);
  }
  saveData(); closeSparenModal(); renderPage();
  showToast((editId ? 'Bearbeitet' : (txType === 'verkauf' ? 'Verkauf' : 'Eintrag')) + ' gespeichert');

  // After saving a Wertpapier-Kauf: ask whether to create a monthly Sparplan via Fixkosten
  if (!editId && wertpapier && txType === 'kauf') {
    const sym = wertpapier.symbol || '';
    const wpName = wertpapier.name || '';
    const existingSparplan = (state.fixkosten||[]).find(f => f.sparenLink &&
      ((sym && f.sparenLink.symbol === sym) || (wpName && f.sparenLink.name === wpName))
    );
    if (!existingSparplan) {
      setTimeout(async () => {
        const ok = await uiConfirm({
          title: 'Monatlicher Sparplan?',
          icon: '💰',
          message: 'Soll <strong>' + wertpapier.name + '</strong> auch als monatliche Fixkosten angelegt werden?',
          details: ['Jeden Monat wird automatisch ein Eintrag in „Sparen & Depot" erstellt', 'Historischer Kurs zum Monatsersten wird genutzt', 'Kann später jederzeit angepasst werden'],
          okLabel: 'Ja, Sparplan anlegen',
          cancelLabel: 'Nein, danke',
        });
        if (ok) openSparplanModal(wertpapier, +amount);
      }, 400);
    }
  }
}
function addSparen(){
  if (!requireUnlocked()) return; openSparenModal(); }

function updateSparen(id,f,v){
  if (!requireUnlocked()) return;const s=state.sparen.find(x=>String(x.id) === String(id));if(s){s[f]=v;saveData();}}
function deleteSpar(id){
  if (!requireUnlocked()) return; if(moveToTrash('sparen', id, 'Einzahlung')) { renderPage(); showToast('In Papierkorb verschoben','info'); } }

// ── PAGE: ZÄHLERSTÄNDE ────────────────────────────────────────────────────
function tabellen() {
  const tabs = state.tabellen || [];
  const tabsHtml = tabs.map((t,ti) => `
    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <input type="text" value="${t.name||'Tabelle '+(ti+1)}" onchange="updateTabName('${t.id}',this.value)"
          style="font-size:14px;font-weight:700;border:none;background:transparent;padding:0;width:200px"/>
        <div class="actions">
          <button class="btn btn-ghost btn-sm" onclick="addTabColumn('${t.id}')">+ Spalte</button>
          <button class="btn btn-ghost btn-sm" onclick="addTabRow('${t.id}')">+ Zeile</button>
          <button class="btn btn-danger btn-sm" onclick="deleteTab('${t.id}')">Tabelle löschen</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            ${(t.columns||[]).map(c => `<th style="position:relative">
              <input type="text" value="${c.name||'Spalte'}" onchange="updateColName('${t.id}','${c.id}',this.value)"
                style="font-size:11px;font-weight:700;color:var(--muted);background:transparent;border:none;text-transform:uppercase;letter-spacing:.04em;width:100%;padding:0"/>
              <select onchange="updateColType('${t.id}','${c.id}',this.value)"
                style="font-size:10px;border:none;background:transparent;color:var(--muted);cursor:pointer">
                <option value="text" ${c.type==='text'?'selected':''}>Text</option>
                <option value="number" ${c.type==='number'?'selected':''}>Zahl</option>
                <option value="date" ${c.type==='date'?'selected':''}>Datum</option>
                <option value="select" ${c.type==='select'?'selected':''}>Auswahl</option>
              </select>
              <button onclick="deleteTabColumn('${t.id}','${c.id}')" style="position:absolute;right:2px;top:2px;background:none;border:none;cursor:pointer;color:var(--text3);font-size:12px">×</button>
            </th>`).join('')}
            <th></th>
          </tr></thead>
          <tbody>
            ${(t.rows||[]).map(r => `<tr>
              ${(t.columns||[]).map(c => {
                const val = r.cells[c.id] || '';
                if (c.type==='number') return `${lockBanner()}
    <td style="white-space:nowrap"><input type="number" value="${val}" step="0.01" onchange="updateTabCell('${t.id}','${r.id}','${c.id}',this.value)" style="width:90px;text-align:right"/> ${currencySymbol()}</td>`;
                if (c.type==='date') return `<td><input type="date" value="${val}" onchange="updateTabCell('${t.id}','${r.id}','${c.id}',this.value)" style="width:145px"/></td>`;
                return `<td><input type="text" value="${val}" onchange="updateTabCell('${t.id}','${r.id}','${c.id}',this.value)" placeholder="–"/></td>`;
              }).join('')}
              <td><button class="btn-icon danger" onclick="deleteTabRow('${t.id}','${r.id}')">×</button></td>
            </tr>`).join('')}
          </tbody>
          ${(t.columns||[]).some(c=>c.type==='number') ? `<tfoot><tr>
            ${(t.columns||[]).map(c => c.type==='number'
              ? `<td class="amount" style="font-weight:700;padding:8px 12px">${fmtEur((t.rows||[]).reduce((s,r)=>s+(+r.cells[c.id]||0),0))}</td>`
              : `<td></td>`).join('')}<td></td>
          </tr></tfoot>` : ''}
        </table>
      </div>
    </div>`).join('');

  return `<div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
      <button class="btn btn-primary" onclick="addTab()">+ Neue Tabelle</button>
    </div>
    ${tabs.length ? tabsHtml : '<div class="empty-state"><div class="empty-icon">📝</div><p>Noch keine eigenen Tabellen.<br>Klicke auf „+ Neue Tabelle" um zu starten.</p></div>'}
  </div>`;
}

// ── Tabellen CRUD ──────────────────────────────────────────────────────────
function addTab() {
  const t = { id: uid(), name: 'Neue Tabelle', columns: [
    { id: uid(), name: 'Datum', type: 'date' },
    { id: uid(), name: 'Beschreibung', type: 'text' },
    { id: uid(), name: 'Betrag', type: 'number' },
  ], rows: [] };
  state.tabellen = state.tabellen || [];
  state.tabellen.push(t);
  saveData(); renderPage();
}
async function deleteTab(id) {
  if (!requireUnlocked()) return;
  if (!await uiConfirm({ message: 'Tabelle wirklich löschen?', title: 'Tabelle löschen', icon: '🗑' })) return;
  state.tabellen = state.tabellen.filter(t=>String(t.id) !== String(id));
  saveData(); renderPage();
}
function updateTabName(id, name) {
  const t = state.tabellen.find(t=>String(t.id) === String(id)); if(t){t.name=name;saveData();}
}
function addTabColumn(tid) {
  if (!requireUnlocked()) return;
  const t = state.tabellen.find(t=>String(t.id) === String(tid)); if(!t) return;
  const col = { id: uid(), name: 'Spalte', type: 'text' };
  t.columns.push(col);
  // Add empty cell to all rows
  t.rows.forEach(r => r.cells[col.id] = '');
  saveData(); renderPage();
}
function deleteTabColumn(tid, cid) {
  if (!requireUnlocked()) return;
  const t = state.tabellen.find(t=>String(t.id) === String(tid)); if(!t) return;
  t.columns = t.columns.filter(c=>String(c.id) !== String(cid));
  t.rows.forEach(r => delete r.cells[cid]);
  saveData(); renderPage();
}
function updateColName(tid, cid, name) {
  const t = state.tabellen.find(t=>String(t.id) === String(tid)); if(!t) return;
  const c = t.columns.find(c=>String(c.id) === String(cid)); if(c){c.name=name;saveData();}
}
function updateColType(tid, cid, type) {
  const t = state.tabellen.find(t=>String(t.id) === String(tid)); if(!t) return;
  const c = t.columns.find(c=>String(c.id) === String(cid)); if(c){c.type=type;saveData();renderPage();}
}
function addTabRow(tid) {
  if (!requireUnlocked()) return;
  const t = state.tabellen.find(t=>String(t.id) === String(tid)); if(!t) return;
  const cells = {}; t.columns.forEach(c => cells[c.id]='');
  t.rows.push({ id: uid(), cells });
  saveData(); renderPage();
}
function deleteTabRow(tid, rid) {
  if (!requireUnlocked()) return;
  const t = state.tabellen.find(t=>String(t.id) === String(tid)); if(!t) return;
  t.rows = t.rows.filter(r=>String(r.id) !== String(rid));
  saveData(); renderPage();
}
function updateTabCell(tid, rid, cid, val) {
  if (!requireUnlocked()) return;
  const t = state.tabellen.find(t=>String(t.id) === String(tid)); if(!t) return;
  const r = t.rows.find(r=>String(r.id) === String(rid)); if(r){r.cells[cid]=val;saveData();}
}

// Aktuellen Ist-Stand eines Kontos setzen: fragt den echten Stand ab und legt
// eine Korrektur-Buchung (Einnahme oder Ausgabe) an, sodass der App-Saldo dem
// echten Stand entspricht. Historie bleibt erhalten, ab Stichtag stimmt das Konto.
// Schlüsselt auf, woraus sich der Saldo eines Kontos zusammensetzt.
function saldoBreakdown(kontoId) {
  const yr = getSelectedYear();
  const def = defaultKontoId();
  const heute = thisMonth();
  const jahrEnde = yr + '-12';
  const grenze = (heute <= jahrEnde && heute >= (yr + '-01')) ? heute : jahrEnde;
  const months = monthsBetween(yr + '-01', grenze);
  const k = kontoById(kontoId) || {};
  const b = { start: +k.start||0, gehalt:0, nebenjob:0, fixkosten:0, einkaeufe:0, spesen:0,
    einnahmen:0, regelEinnahmen:0, ausgaben:0, sparTransfer:0, umbuchungen:0, korrekturen:0 };

  // Einnahmen / Ausgaben (ohne Korrektur)
  (state.einnahmen||[]).forEach(e => {
    if ((e.kontoId||def)!==kontoId || e._korrektur || e.bar) return;
    if (['Gehalt','Nebenjob'].includes(e.type)) return;
    if ((e.month||'') > grenze) return;
    b.einnahmen += (+e.amount||0);
  });
  (state.ausgaben||[]).forEach(a => {
    if ((a.kontoId||def)!==kontoId) return;
    if ((a.month||'') > grenze) return;
    if (a._korrektur) b.korrekturen -= (+a.amount||0);
    else b.ausgaben -= (+a.amount||0);
  });
  (state.einnahmen||[]).forEach(e => {
    if ((e.kontoId||def)!==kontoId || !e._korrektur) return;
    b.korrekturen += (+e.amount||0);
  });
  // Wiederkehrende Einnahmen
  (state.regelEinnahmen||[]).forEach(r => {
    if ((r.kontoId||def)!==kontoId) return;
    months.forEach(m => { if ((!r.startMonth||r.startMonth<=m)&&(!r.endMonth||r.endMonth>=m)) b.regelEinnahmen += (+r.amount||0); });
  });
  // Sparpläne (intern) → Gutschrift Zielkonto
  (state.fixkosten||[]).forEach(f => {
    if (!f.sparenLink || f.sparenLink.extern || f.sparenLink.zielkonto!==kontoId) return;
    if (f.sparenLink.sparTyp && f.sparenLink.sparTyp!=='bargeld') return;
    months.forEach(m => { if (m<=grenze && fixkostenAktivImMonat(f, m)) b.sparTransfer += (+f.amount||0); });
  });
  // Umbuchungen
  (state.umbuchungen||[]).forEach(u => {
    const um = u.month || (u.date||'').slice(0,7);
    if (um > grenze) return;
    if (u.nachKonto===kontoId) b.umbuchungen += (+u.amount||0);
    if (u.vonKonto===kontoId)  b.umbuchungen -= (+u.amount||0);
  });
  // Gehalt/Nebenjob/Fixkosten/Einkäufe/Spesen
  months.forEach(m => {
    const inc = state.incomeByMonth[m] || { gehalt:0, nebenjob:0 };
    if (getGehaltKonto(yr)===kontoId)   b.gehalt   += (+inc.gehalt||0);
    if (getNebenjobKonto(yr)===kontoId) b.nebenjob += (+inc.nebenjob||0);
    (state.fixkosten||[]).forEach(f => {
      if ((f.kontoId||def)!==kontoId) return;
      if (fixkostenAktivImMonat(f, m)) b.fixkosten -= (+f.amount||0);
    });
    (state.einkaeufe||[]).forEach(e => { if (e.month===m && (e.kontoId||def)===kontoId) b.einkaeufe -= (+e.amount||0); });
    (state.spesen||[]).forEach(t => { if (t.month===m && (t.kontoId||def)===kontoId) b.spesen += (+(t.allowance||0) - +(t.ausgaben||0)); });
  });
  b.total = Math.round((b.start+b.gehalt+b.nebenjob+b.fixkosten+b.einkaeufe+b.spesen+b.einnahmen+b.regelEinnahmen+b.ausgaben+b.sparTransfer+b.umbuchungen+b.korrekturen)*100)/100;
  return b;
}

function zeigeSaldoDiagnose(kontoId) {
  const k = kontoById(kontoId); if (!k) return;
  const b = saldoBreakdown(kontoId);
  const row = (label, val, hint) => (Math.abs(val) < 0.005 ? '' :
    '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border)">' +
      '<span>' + label + (hint?(' <span style=\"color:var(--muted);font-size:11px\">'+hint+'</span>'):'') + '</span>' +
      '<span style="font-weight:600;color:' + (val>=0?'var(--green)':'var(--red)') + '">' + (val>=0?'+':'') + fmtEur(val) + '</span>' +
    '</div>');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)';
  overlay.innerHTML =
    '<div style="background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:12px;max-width:460px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.5)">' +
      '<div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px">' +
        '<div style="font-size:26px">🔍</div><h3 style="margin:0;font-size:16px">Saldo-Diagnose: ' + (k.name||'Konto') + '</h3>' +
      '</div>' +
      '<div style="padding:18px 22px;font-size:14px">' +
        '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:2px solid var(--border)"><span><strong>Startwert</strong></span><span style="font-weight:700">' + fmtEur(b.start) + '</span></div>' +
        row('Gehalt', b.gehalt) + row('Nebenjob', b.nebenjob) +
        row('Einnahmen', b.einnahmen, 'einmalig') + row('Wiederkehrende Einnahmen', b.regelEinnahmen) +
        row('Fixkosten', b.fixkosten) + row('Einkäufe', b.einkaeufe) + row('Spesen-Saldo', b.spesen) +
        row('Ausgaben', b.ausgaben) + row('Sparplan-Zuflüsse', b.sparTransfer, 'intern') +
        row('Umbuchungen', b.umbuchungen) + row('Kontostand-Korrekturen', b.korrekturen) +
        '<div style="display:flex;justify-content:space-between;padding:10px 0 2px;margin-top:6px;border-top:2px solid var(--border)"><span><strong>Saldo gesamt</strong></span><span style="font-weight:700;font-size:16px;color:' + (b.total>=0?'var(--green)':'var(--red)') + '">' + fmtEur(b.total) + '</span></div>' +
        (Math.abs(b.korrekturen) > 0.005 ? '<p style="margin:12px 0 0;font-size:12px;color:var(--muted)">💡 Es liegen alte Kontostand-Korrekturen vor (' + fmtEur(b.korrekturen) + '). Falls der Saldo nicht stimmt: „🧹 Korrekturen“ klicken und danach „🎯 Stand setzen“ neu.</p>' : '') +
      '</div>' +
      '<div style="padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;background:var(--surface-2);border-radius:0 0 12px 12px">' +
        '<button class="btn btn-primary" id="_diagClose">Schließen</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.querySelector('#_diagClose').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

async function resetKontoKorrekturen(kontoId) {
  if (!requireUnlocked()) return;
  const k = kontoById(kontoId); if (!k) return;
  const def = defaultKontoId();
  const treffer = [
    ...(state.einnahmen||[]).filter(e => e._korrektur && (e.kontoId||def)===kontoId),
    ...(state.ausgaben||[]).filter(a => a._korrektur && (a.kontoId||def)===kontoId),
  ];
  if (!treffer.length) { showToast('Keine Kontostand-Korrekturen bei ' + k.name, 'info'); return; }
  const summe = treffer.reduce((s,x)=> s + (x.desc!==undefined ? -(+x.amount||0) : (+x.amount||0)), 0);
  const ok = await uiConfirm({
    title: 'Korrekturen entfernen', icon: '🧹',
    message: treffer.length + ' Kontostand-Korrektur(en) bei „' + k.name + '“ entfernen (Wirkung: ' + (summe>=0?'+':'') + fmtEur(summe) + ')?',
    details: ['Deine echten Buchungen bleiben unberührt.', 'Danach „🎯 Stand setzen“ neu ausführen.'],
    okLabel: 'Entfernen', cancelLabel: 'Abbrechen',
  });
  if (!ok) return;
  state.einnahmen = (state.einnahmen||[]).filter(e => !(e._korrektur && (e.kontoId||def)===kontoId));
  state.ausgaben  = (state.ausgaben||[]).filter(a => !(a._korrektur && (a.kontoId||def)===kontoId));
  saveData(); if (typeof updateBadges==='function') updateBadges(); renderPage();
  showToast(k.name + ': ' + treffer.length + ' Korrektur(en) entfernt – jetzt neu „Stand setzen“', 'info');
}

function setKontoIstStand(kontoId) {
  if (!requireUnlocked()) return;
  const k = kontoById(kontoId);
  if (!k) return;
  const aktuell = kontoSaldo(kontoId);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)';
  overlay.innerHTML =
    '<div style="background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:12px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.5)">' +
      '<div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px">' +
        '<div style="font-size:28px">🎯</div>' +
        '<h3 style="margin:0;font-size:16px;font-weight:600">Kontostand setzen: ' + (k.name||'Konto') + '</h3>' +
      '</div>' +
      '<div style="padding:18px 22px;font-size:14px;line-height:1.5">' +
        '<p style="margin:0 0 12px">App-Saldo aktuell: <strong>' + fmtEur(aktuell) + '</strong></p>' +
        '<label style="display:block;font-size:13px;margin-bottom:6px">Echter Kontostand heute (' + currencySymbol() + '):</label>' +
        '<input type="number" id="_istStandInput" step="0.01" value="' + aktuell.toFixed(2) + '" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--surface-2);color:var(--text);font-size:15px;text-align:right" />' +
        '<p style="margin:10px 0 0;font-size:12px;color:var(--muted)">Die Differenz wird als datierte Korrektur-Buchung angelegt. Deine bisherigen Buchungen bleiben erhalten.</p>' +
      '</div>' +
      '<div style="padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;background:var(--surface-2);border-radius:0 0 12px 12px">' +
        '<button class="btn btn-ghost" id="_istCancel">Abbrechen</button>' +
        '<button class="btn btn-primary" id="_istOk">Stand setzen</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  const inp = overlay.querySelector('#_istStandInput');
  setTimeout(() => { inp?.focus(); inp?.select(); }, 50);
  function close() { overlay.remove(); }
  overlay.querySelector('#_istCancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#_istOk').addEventListener('click', () => {
    const ziel = parseFloat(inp.value);
    if (isNaN(ziel)) { showToast('Bitte einen gültigen Betrag eingeben', 'error'); return; }
    const diff = Math.round((ziel - aktuell) * 100) / 100;
    close();
    if (Math.abs(diff) < 0.01) { showToast('Saldo stimmt bereits', 'info'); return; }
    const datum = today();
    const monat = datum.slice(0, 7);
    if (diff > 0) {
      // zu wenig im App-Saldo → Einnahme als Korrektur
      state.einnahmen.push({ id: uid(), month: monat, date: datum,
        source: 'Kontostand-Abgleich', type: 'Sonstiges', amount: diff,
        bar: false, kontoId: kontoId, _korrektur: true });
    } else {
      // zu viel im App-Saldo → Ausgabe als Korrektur
      state.ausgaben.push({ id: uid(), month: monat, date: datum,
        desc: 'Kontostand-Abgleich', category: 'Sonstige Ausgaben', amount: Math.abs(diff),
        kontoId: kontoId, _korrektur: true });
    }
    saveData(); if (typeof updateBadges==='function') updateBadges(); renderPage();
    showToast(k.name + ': Stand auf ' + fmtEur(ziel) + ' gesetzt (Korrektur ' + (diff>0?'+':'') + fmtEur(diff) + ')', 'info');
  });
}

function einstellungen() {
  const meta = state.meta || {};
  const cfg  = state.config || {};
  const isDev = !!(window.EA && window.location && window.location.href.includes('localhost'));

  return `<div>

    <!-- ── PROFIL ──────────────────────────────────────────────────────── -->
    <div class="settings-section">
      <div class="settings-section-header">👤 Profil & Konto</div>
      <div class="card mb-2">
        <div class="form-grid form-grid-2">
          <label class="field">Name
            <input type="text" value="${meta.userName||''}" onchange="updateSetting('userName',this.value)" placeholder="Dein Name"/>
          </label>
          <label class="field">Startjahr
            <input type="number" value="${meta.year || new Date().getFullYear()}" min="2020" max="2040" onchange="updateSetting('year',+this.value)"/>
          </label>
          <label class="field">Startguthaben gesamt (${currencySymbol()})
            <input type="number" value="${(+(meta.startgeld)||0).toFixed(2)}" step="0.01" onchange="updateSetting('startgeld',+this.value)"/>
            <span style="font-size:11px;color:var(--muted)">Summe aller Konten-Startwerte. Aufteilung unten bei „Konten".</span>
          </label>
          <label class="field">Währung
            <select onchange="updateSetting('waehrung',this.value)">
              ${['EUR','USD','CHF','GBP','JPY'].map(c=>'<option value="'+c+'"'+(( meta.waehrung||'EUR')===c?' selected':'')+'>'+c+'</option>').join('')}
            </select>          </label>
          <div class="field" style="grid-column:1/-1">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <strong>Konten</strong>
              <button class="btn btn-sm btn-primary" onclick="addKonto()">+ Konto</button>
            </div>
            <div style="font-size:12px;color:var(--muted);margin-bottom:10px">
              Lege deine Konten an (z.B. Girokonto, Trade). Häkchen „Cashflow" = Buchungen
              dieses Kontos zählen zum Monats-Cashflow. Konten ohne Häkchen (z.B. Reserve/Trade)
              laufen separat und beeinflussen den Cashflow nicht.
            </div>
            ${getKonten().map(k => `
              <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
                <input type="text" value="${(k.name||'').replace(/"/g,'&quot;')}" onchange="updateKonto('${k.id}','name',this.value)" placeholder="Kontoname" style="flex:1;min-width:120px" />
                <input type="number" value="${(+k.start||0).toFixed(2)}" step="0.01" onchange="updateKonto('${k.id}','start',+this.value)" style="width:110px;text-align:right" title="Startwert" /> ${currencySymbol()}
                <label style="display:flex;align-items:center;gap:5px;font-size:13px;white-space:nowrap;cursor:pointer">
                  <input type="checkbox" ${k.cashflow?'checked':''} onchange="updateKonto('${k.id}','cashflow',this.checked)" /> Cashflow
                </label>
                <span style="font-size:12px;color:var(--muted);white-space:nowrap">Saldo: ${fmtEur(kontoSaldo(k.id))}</span>
                <button class="btn-icon" onclick="setKontoIstStand('${k.id}')" title="Aktuellen Kontostand setzen – legt eine Korrektur-Buchung an, damit der Saldo deinem echten Stand entspricht" style="width:auto;min-width:0;padding:0 8px;font-size:12px;white-space:nowrap;gap:4px">🎯 Stand setzen</button>
                <button class="btn-icon" onclick="zeigeSaldoDiagnose('${k.id}')" title="Zeigt, woraus sich der Saldo zusammensetzt" style="width:auto;min-width:0;padding:0 8px;font-size:12px;white-space:nowrap;gap:4px">🔍 Diagnose</button>
                <button class="btn-icon" onclick="resetKontoKorrekturen('${k.id}')" title="Entfernt alle alten Kontostand-Korrekturen dieses Kontos (danach neu „Stand setzen“)" style="width:auto;min-width:0;padding:0 8px;font-size:12px;white-space:nowrap;gap:4px">🧹 Korrekturen</button>
                ${getKonten().length>1 ? `<button class="btn-icon danger" onclick="deleteKonto('${k.id}')" title="Konto löschen">×</button>` : ''}
              </div>`).join('')}
          </div>
          </label>
          <label class="field">Startseite
            <select onchange="updateConfig('startPage',this.value)">
              ${[['dashboard','📊 Dashboard'],['jahresuebersicht','📅 Jahresübersicht'],['einkaeufe','🛒 Einkäufe'],['ausgaben','💸 Ausgaben'],['einnahmen','💰 Einnahmen']].map(([v,l])=>'<option value="'+v+'"'+((cfg.startPage||'dashboard')===v?' selected':'')+'>'+l+'</option>').join('')}
            </select>
          </label>
          <label class="field">Datumsformat
            <select onchange="updateConfig('dateFormat',this.value)">
              ${[['de','TT.MM.JJJJ'],['iso','JJJJ-MM-TT'],['us','MM/TT/JJJJ']].map(([v,l])=>'<option value="'+v+'"'+((cfg.dateFormat||'de')===v?' selected':'')+'>'+l+'</option>').join('')}
            </select>
          </label>
        </div>
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);display:flex;align-items:center;gap:12px">
          <div class="div-switch ${(cfg.showStartupModal !== false) ? 'div-switch-on' : ''}" onclick="toggleConfig('showStartupModal')" style="cursor:pointer">
            <div class="div-switch-thumb"></div>
          </div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:500">Schnellerfassung beim App-Start öffnen</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">Modal für neue Einkäufe/Ausgaben/Einnahmen erscheint automatisch nach dem Start</div>
          </div>
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="restartSetup()">🔄 Willkommensassistent erneut starten</button>
          <button class="btn btn-ghost btn-sm" onclick="startTour()">🧭 App-Tour erneut ansehen</button>
          <button class="btn btn-ghost btn-sm" onclick="showTermsModal(null, true)">📋 Nutzungsbedingungen anzeigen</button>
          <button class="btn btn-ghost btn-sm" onclick="showWhatsNewModal()">📝 Änderungsverlauf</button>
        </div>
        <div style="margin-top:10px;display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted-text)">
          ${termsAcceptedCurrent()
            ? `<span style="color:var(--accent);font-weight:700">✓ Nutzungsbedingungen bestätigt</span>${state.meta?.termsAcceptedAt ? ' <span style="color:var(--muted-text)">· am ' + new Date(state.meta.termsAcceptedAt).toLocaleDateString('de-DE') + '</span>' : ''}`
            : '<span style="color:var(--amber)">⚠ Nutzungsbedingungen noch nicht bestätigt</span>'}
        </div>
      </div>
    </div>

    <!-- ── AUSSEHEN ─────────────────────────────────────────────────────── -->
    <div class="settings-section">
      <div class="settings-section-header">🎨 Aussehen & Design</div>
      <div class="card mb-2">
        <div class="form-grid form-grid-2">
          <label class="field">Theme
            <select onchange="applyTheme(this.value)">
              ${[['light','☀️ Hell'],['dark','🌙 Dunkel'],['system','💻 System']].map(([v,l])=>'<option value="'+v+'"'+((cfg.theme||'light')===v?' selected':'')+'>'+l+'</option>').join('')}
            </select>
          </label>

        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-top:10px">
          <div class="div-switch ${cfg.compactMode?'div-switch-on':''}" onclick="toggleConfig('compactMode');document.body.classList.toggle('compact',(state.config||{}).compactMode)" style="cursor:pointer">
            <div class="div-switch-thumb"></div>
          </div>
          <span style="font-size:13px">Kompaktmodus (weniger Abstände)</span>
        </div>
      </div>
    </div>

    <!-- ── SPARZIEL ────────────────────────────────────────────────────── -->
    <div class="settings-section">
      <div class="settings-section-header">🎯 Sparziel</div>
      <div class="card mb-2">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="div-switch ${cfg.sparzielAktiv?'div-switch-on':''}" onclick="toggleConfig('sparzielAktiv')" style="cursor:pointer">
            <div class="div-switch-thumb"></div>
          </div>
          <span style="font-size:13px">Sparziel aktivieren (zeigt einen Fortschrittsbalken im Dashboard)</span>
        </div>
        ${cfg.sparzielAktiv ? `<div class="form-grid form-grid-2" style="margin-top:14px">
          <label class="field">Zielsumme (€ pro Jahr)
            <input type="number" step="100" min="0" value="${+cfg.sparzielSumme||0}" onchange="updateSparzielSumme(+this.value)" placeholder="z.B. 5000" />
          </label>
          <div class="field" style="justify-content:flex-end">
            <div style="font-size:12px;color:var(--muted);line-height:1.5">Der Fortschritt zählt das im laufenden Jahr Gesparte bis zum aktuellen Monat — z.B. im Mai 5× deine monatliche Sparrate.</div>
          </div>
        </div>` : ''}
      </div>
    </div>

    <!-- ── ERINNERUNGEN ────────────────────────────────────────────────── -->
    <div class="settings-section">
      <div class="settings-section-header">🔔 Erinnerungen</div>
      <div class="card mb-2">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <span style="font-size:13px;color:var(--muted-text)">Erinnere dich an wiederkehrende Aufgaben (z.B. Zählerstände erfassen). Fällige Erinnerungen erscheinen als Banner in der App.</span>
          <button class="btn btn-primary btn-sm" onclick="addReminder()">+ Erinnerung</button>
        </div>
        ${getReminders().length ? `<div class="table-wrap"><table>
          <thead><tr><th>Bezeichnung</th><th>Zeitpunkt</th><th>Tag</th><th>Wiederholung</th><th>System-Hinweis</th><th>Aktiv</th><th></th></tr></thead>
          <tbody>${getReminders().map(r => `<tr>
            <td><input type="text" value="${(r.title||'').replace(/"/g,'&quot;')}" onchange="updateReminder('${r.id}','title',this.value)" style="background:transparent;border:none;color:var(--text);width:100%;font-size:13px" /></td>
            <td><select onchange="updateReminder('${r.id}','when',this.value)">
              <option value="monthEnd" ${r.when==='monthEnd'?'selected':''}>Monatsende</option>
              <option value="monthStart" ${r.when==='monthStart'?'selected':''}>Monatsanfang</option>
              <option value="day" ${r.when==='day'?'selected':''}>Bestimmter Tag</option>
            </select></td>
            <td>${r.when==='day' ? `<input type="number" min="1" max="31" value="${+r.day||1}" onchange="updateReminder('${r.id}','day',this.value)" style="width:56px" />` : '<span class="muted">–</span>'}</td>
            <td><select onchange="updateReminder('${r.id}','repeatMonths',this.value)">
              ${[[1,'monatlich'],[2,'alle 2 Monate'],[3,'alle 3 Monate'],[6,'alle 6 Monate'],[12,'jährlich']].map(([v,l])=>`<option value="${v}" ${(+r.repeatMonths||1)===v?'selected':''}>${l}</option>`).join('')}
            </select></td>
            <td><div class="div-switch ${r.notify?'div-switch-on':''}" onclick="updateReminder('${r.id}','notify',${r.notify?'false':'true'})" style="cursor:pointer;transform:scale(.85)"><div class="div-switch-thumb"></div></div></td>
            <td><div class="div-switch ${r.active?'div-switch-on':''}" onclick="updateReminder('${r.id}','active',${r.active?'false':'true'})" style="cursor:pointer;transform:scale(.85)"><div class="div-switch-thumb"></div></div></td>
            <td><button class="btn btn-ghost btn-sm" onclick="deleteReminder('${r.id}')" title="Löschen">✕</button></td>
          </tr>`).join('')}</tbody>
        </table></div>
        <p style="font-size:11px;color:var(--muted-text);margin-top:10px;line-height:1.5">„System-Hinweis" zeigt zusätzlich eine Windows-Benachrichtigung (funktioniert in der installierten App). Der In-App-Banner erscheint immer, wenn eine Erinnerung fällig ist.</p>` : '<div class="empty-state" style="padding:20px"><div class="empty-icon">🔔</div><p>Noch keine Erinnerungen. Lege eine an, um an wiederkehrende Aufgaben erinnert zu werden.</p></div>'}
      </div>
    </div>

    <!-- ── DATEN & BACKUP ──────────────────────────────────────────────── -->
    <div class="settings-section">
      <div class="settings-section-header">💾 Daten & Backup</div>
      <div class="card mb-2">
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="background:var(--surface);border-radius:8px;padding:12px 14px">
            <p style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Speicherort</p>
            <code style="font-size:12px;color:var(--ink)">%APPDATA%\finanzverwaltung-pro\data.json</code>
            <div style="margin-top:8px;display:flex;gap:8px">
              <button class="btn btn-ghost btn-sm" onclick="openDataFolder()">📂 Ordner öffnen</button>
            </div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" onclick="exportBackup()">⬇️ Backup exportieren</button>
            <button class="btn btn-ghost btn-sm" onclick="importBackup()">⬆️ Backup importieren</button>
            <button class="btn btn-ghost btn-sm" onclick="exportCSV()">📊 Als CSV exportieren</button>
            <button class="btn btn-ghost btn-sm" onclick="exportJSON()">📄 Als JSON exportieren</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:12px">
            <div style="display:flex;align-items:center;gap:12px">
              <div class="div-switch ${cfg.autoBackup?'div-switch-on':''}" onclick="onToggleAutoBackup()" style="cursor:pointer">
                <div class="div-switch-thumb"></div>
              </div>
              <span style="font-size:13px">Automatische Backups</span>
              ${cfg.lastBackup ? '<span style="font-size:11px;color:var(--muted);margin-left:auto">Letztes Backup: '+cfg.lastBackup+'</span>' : '<span style="font-size:11px;color:var(--muted);margin-left:auto">Noch kein Backup erstellt</span>'}
            </div>
            ${cfg.autoBackup ? `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 14px;display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:12px">
              <div>
                <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Backup-Ordner</div>
                <div style="font-family:monospace;font-size:11px;word-break:break-all;margin-bottom:8px;color:var(--text)">${cfg.backupPath || '<span style="color:var(--red)">⚠ Kein Pfad gewählt</span>'}</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  <button class="btn btn-ghost btn-sm" onclick="selectBackupPath()">📁 Ordner ändern</button>
                  ${cfg.backupPath ? '<button class="btn btn-ghost btn-sm" onclick="openBackupFolder()">↗ Öffnen</button>' : ''}
                </div>
              </div>
              <div>
                <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Intervall</div>
                <select onchange="updateConfig('backupInterval',this.value)" style="width:100%">
                  <option value="">– Bitte wählen –</option>
                  <option value="daily" ${cfg.backupInterval==='daily'?'selected':''}>Täglich</option>
                  <option value="weekly" ${cfg.backupInterval==='weekly'?'selected':''}>Wöchentlich</option>
                  <option value="monthly" ${cfg.backupInterval==='monthly'?'selected':''}>Monatlich</option>
                </select>
                ${cfg.nextBackupAt ? '<div style="font-size:10px;color:var(--muted);margin-top:6px">Nächste Sicherung: ' + new Date(cfg.nextBackupAt).toLocaleDateString('de-DE') + '</div>' : ''}
              </div>
            </div>` : ''}
          </div>
        </div>
      </div>
    </div>

    <!-- ── KATEGORIEN ─────────────────────────────────────────────────── -->
    <div class="settings-section">
      <div class="settings-section-header">🏷️ Kategorien verwalten</div>
      ${['ausgabe','einnahme','einkauf'].map(group => {
        const labels = { ausgabe: ['💸 Ausgaben-Kategorien', 'Standardkategorien wie „Essen", „Auto" + eigene'],
                         einnahme: ['💰 Einnahmen-Typen', 'Standardtypen wie „Gehalt", „Verkauf" + eigene (gilt auch für wiederkehrende Einnahmen)'],
                         einkauf: ['🛒 Einkaufs-Kategorien', 'Standardkategorien wie „Supermarkt", „Drogerie" + eigene'] };
        const list = getCustomCats(group);
        return '<div class="card mb-2"><h4 style="font-size:13px;font-weight:700;margin-bottom:4px">' + labels[group][0] + '</h4>' +
          '<p style="font-size:11px;color:var(--muted);margin-bottom:10px">' + labels[group][1] + '</p>' +
          (list.length > 0
            ? '<div class="table-wrap" style="margin-bottom:10px"><table><tbody>' + list.map((c,i) =>
                '<tr><td style="padding:8px 12px;font-size:13px">' + c + '</td>' +
                '<td style="padding:4px 8px;width:48px"><button class="btn-icon danger" onclick="removeCustomCatByGroup(&quot;' + group + '&quot;,' + i + ')">×</button></td></tr>'
              ).join('') + '</tbody></table></div>'
            : '<p style="font-size:11px;color:var(--muted);margin-bottom:10px">Noch keine eigenen Einträge in diesem Bereich.</p>') +
          '<div style="display:flex;gap:8px">' +
            '<input type="text" id="new_cat_' + group + '" placeholder="Neuer Eintrag…" style="flex:1" />' +
            '<button class="btn btn-primary btn-sm" onclick="addCustomCatByGroup(&quot;' + group + '&quot;)">+ Hinzufügen</button>' +
          '</div></div>';
      }).join('')}
    </div>

    <!-- ── ETF EINSTELLUNGEN ──────────────────────────────────────────── -->
    <div class="settings-section">
      <div class="settings-section-header">📈 ETF & Depot</div>
      <div class="card mb-2">
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="display:flex;align-items:center;gap:12px">
            <div class="div-switch ${cfg.etfLiveDaten?'div-switch-on':''}" onclick="toggleConfig('etfLiveDaten')" style="cursor:pointer">
              <div class="div-switch-thumb"></div>
            </div>
            <span style="font-size:13px">ETF Live-Daten aktivieren</span>
          </div>
          <div style="display:flex;align-items:center;gap:12px">
            <div class="div-switch ${cfg.etfAutoRefresh?'div-switch-on':''}" onclick="toggleConfig('etfAutoRefresh')" style="cursor:pointer">
              <div class="div-switch-thumb"></div>
            </div>
            <span style="font-size:13px">Automatisch beim Start aktualisieren</span>
          </div>
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <span style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase">Intervall:</span>
            <select style="width:140px" onchange="updateConfig('etfInterval',+this.value)">
              ${[[0,'Manuell'],[15,'Alle 15 min'],[30,'Alle 30 min'],[60,'Jede Stunde']].map(([v,l])=>'<option value="'+v+'"'+((cfg.etfInterval||0)===v?' selected':'')+'>'+l+'</option>').join('')}
            </select>
            <span class="badge ${cfg.etfLiveDaten?'badge-green':'badge-muted'}">${cfg.etfLiveDaten?'✓ Live-Daten aktiv':'Live-Daten inaktiv'}</span>
          </div>
        </div>
        <div style="margin-top:10px;background:var(--surface);border-radius:8px;padding:10px 12px">
          <p style="font-size:11px;color:var(--muted)">Datenquelle: Yahoo Finance (kein API-Key erforderlich) · Ticker z.B. EUNL.DE für MSCI World</p>
        </div>
      </div>
    </div>

    <!-- ── SPENDEN ───────────────────────────────────────────────────── -->
    <div class="settings-section">
      <div class="settings-section-header">💖 Entwicklung unterstützen</div>
      <div class="card mb-2" style="background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 8%,var(--paper)),var(--paper));border-color:color-mix(in srgb,var(--accent) 30%,var(--border))">
        <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <p style="font-size:14px;font-weight:700;margin-bottom:6px">Finanzverwaltung Pro</p>
            <p style="font-size:12px;color:var(--muted-text);margin-bottom:12px;line-height:1.6">Diese App wird privat entwickelt und kostenlos zur Verfügung gestellt. Wenn dir die App gefällt und du die Weiterentwicklung unterstützen möchtest, freue ich mich über eine kleine freiwillige Spende.</p>
            <div style="background:var(--surface-2);border-radius:8px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">
              <div>
                <p style="font-size:10px;font-weight:700;color:var(--muted-text);text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">PayPal</p>
                <p style="font-size:13px;font-weight:600;color:var(--accent)">Marco.Conrad00@gmail.com</p>
              </div>
              <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('Marco.Conrad00@gmail.com').then(()=>showToast('E-Mail kopiert!'))">📋 Kopieren</button>
            </div>
            <p style="font-size:11px;color:var(--muted-text)">Jede Unterstützung wird wertgeschätzt 🙏</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ── SYSTEM ─────────────────────────────────────────────────────── -->
    <div class="settings-section">
      <div class="settings-section-header">🖥️ System</div>
      <div class="card mb-2">
        <div style="display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" onclick="createDesktopShortcut()">🖥 Desktop-Verknüpfung erstellen</button>
            <button class="btn btn-ghost btn-sm" onclick="archiveYear()">📦 Jahr archivieren & PDF</button>
          </div>
          <div style="font-size:11px;color:var(--muted)">
            <span id="creditsVersion">v1.01</span> · Finanzverwaltung Pro · <a href="mailto:marco.conrad00@gmail.com" style="color:var(--accent)">marco.conrad00@gmail.com</a>
          </div>
          <div style="background:var(--amber-bg);border-radius:6px;padding:8px 12px">
            <p style="font-size:11px;color:var(--amber);font-weight:600">⚠️ Diese App kann Bugs enthalten. Keine Haftung für fehlerhafte Berechnungen.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ── UPDATES ───────────────────────────────────────────────────── -->
    <div class="settings-section">
      <div class="settings-section-header">🔄 Updates</div>
      <div class="card mb-2">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
          <div class="div-switch ${cfg.autoBackupBeforeUpdate?'div-switch-on':''}" onclick="toggleConfig('autoBackupBeforeUpdate')" style="cursor:pointer">
            <div class="div-switch-thumb"></div>
          </div>
          <span style="font-size:13px">Automatisches Backup vor jedem Update erstellen</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn btn-primary btn-sm" onclick="openUpdateManager()">🔄 Nach Updates suchen</button>
          <span style="font-size:12px;color:var(--muted)">Aktuelle Version: <span id="creditsVersion2">v1.01</span></span>
        </div>
        <p style="font-size:11px;color:var(--muted);margin-top:10px;line-height:1.5">Prüft, ob eine neuere Version verfügbar ist. Ist das Auto-Backup aktiviert, wird vor dem Einspielen automatisch eine Sicherung deiner Daten angelegt.</p>
      </div>
    </div>

    <!-- ── JAHRES-VERWALTUNG ─────────────────────────────────────────── -->
    <div class="settings-section">
      <div class="settings-section-header">📅 Jahres-Verwaltung</div>
      <div class="card mb-2">
        ${(() => {
          const sy = getSelectedYear();
          const yd = getYearData();
          const status = yd.status || 'active';
          const statusBadge = {
            active:  '<span class="badge badge-green">Aktiv</span>',
            closed:  '<span class="badge badge-muted">🔒 Abgeschlossen</span>',
            planned: '<span class="badge badge-blue">Geplant</span>'
          }[status];
          let html = '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">' +
            '<strong style="font-size:15px">Aktuell ausgewähltes Jahr: ' + sy + '</strong>' +
            statusBadge + '</div>';
          html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;font-size:12px">' +
            '<div><div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase">Startguthaben</div>' +
              '<input type="number" step="0.01" value="' + (yd.startBalance||0) + '" ' +
              'onchange="updateYearField(\'startBalance\',+this.value)" style="width:100%;margin-top:4px" ' +
              (status === 'closed' && !state.yearEditUnlocked ? 'disabled' : '') + ' /></div>' +
            '<div><div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase">Status</div>' +
              '<div style="margin-top:4px;font-size:13px">' + (status === 'active' ? 'Bearbeitung erlaubt' : status === 'closed' ? 'Schreibgeschützt' : 'In Vorbereitung') + '</div></div>' +
            '</div>';
          if (status === 'closed' && yd.closedAt) {
            html += '<p style="font-size:11px;color:var(--muted);margin-bottom:10px">Abgeschlossen am ' + new Date(yd.closedAt).toLocaleDateString('de-DE') + '</p>';
          }
          html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
          if (status === 'active') {
            html += '<button class="btn btn-ghost btn-sm" onclick="closeYear()">🔒 Jahr abschließen</button>';
          }
          if (status === 'closed') {
            html += '<button class="btn btn-ghost btn-sm" onclick="reopenYear()">🔓 ' + (state.yearEditUnlocked ? 'Sperren' : 'Entsperren') + '</button>';
          }
          html += '<button class="btn btn-ghost btn-sm" onclick="createNewYear()">+ Neues Jahr</button>';
          if (listYears().length > 1) {
            html += '<button class="btn-danger-outline" onclick="deleteYear()" style="margin-left:auto">🗑 Jahr löschen</button>';
          }
          html += '</div>';
          // List all years
          const years = listYears();
          if (years.length > 1) {
            html += '<div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">' +
              '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:8px">Verfügbare Jahre</div>' +
              '<div style="display:flex;flex-wrap:wrap;gap:6px">';
            years.forEach(y => {
              const s = state.years[y]?.status || 'active';
              const icon = s === 'closed' ? '🔒' : s === 'planned' ? '📋' : '✏️';
              html += '<button class="btn ' + (y === sy ? 'btn-primary' : 'btn-ghost') + ' btn-sm" onclick="setSelectedYear(\'' + y + '\')">' + icon + ' ' + y + '</button>';
            });
            html += '</div></div>';
          }
          return html;
        })()}
      </div>
    </div>

    <!-- ── PAPIERKORB ───────────────────────────────────────────────── -->
    <div class="settings-section">
      <div class="settings-section-header">🗑️ Papierkorb</div>
      <div class="card mb-2">
        <p style="font-size:12px;color:var(--muted);margin-bottom:12px">Gelöschte Einträge bleiben 30 Tage wiederherstellbar.</p>
        ${(state.trash||[]).length ? `<div class="table-wrap" style="margin-bottom:12px"><table>
          <thead><tr><th>Typ</th><th>Beschreibung</th><th>Gelöscht am</th><th style="width:160px"></th></tr></thead>
          <tbody>` + (state.trash||[]).slice().reverse().map(t => {
            const d = t.data || {};
            const desc = d.store || d.desc || d.source || d.name || d.kunde || d.note || '–';
            const amt = d.amount !== undefined ? ' (' + fmtEur(d.amount) + ')' : '';
            const typeLabels = {einkaeufe:'🛒 Einkauf',ausgaben:'💸 Ausgabe',einnahmen:'💰 Einnahme',spesen:'✈️ Reise',sparen:'🏦 Sparen',zaehler:'⚡ Zähler',fixkosten:'📌 Fixkosten'};
            const yearBadge = t.year ? '<span class="badge badge-muted" style="font-size:10px;margin-left:6px">' + t.year + '</span>' : '';
            return '<tr>' +
              '<td>' + (typeLabels[t.originalType]||t.originalType) + yearBadge + '</td>' +
              '<td style="font-size:12px">' + desc + amt + '</td>' +
              '<td style="font-size:11px;color:var(--muted)">' + new Date(t.deletedAt).toLocaleDateString('de-DE') + '</td>' +
              '<td><button class="btn btn-ghost btn-sm" onclick="restoreFromTrash(\'' + t.id + '\')">↩ Wiederherstellen</button> ' +
              '<button class="btn-icon danger" onclick="deleteFromTrashForever(\'' + t.id + '\')" title="Endgültig löschen">×</button></td>' +
              '</tr>';
          }).join('') + `</tbody></table></div>
          <button class="btn btn-danger btn-sm" onclick="emptyTrash()">🗑 Papierkorb leeren</button>`
        : '<p style="font-size:12px;color:var(--muted)">Papierkorb ist leer.</p>'}
      </div>
    </div>

    <!-- ── GEFAHRENZONE ──────────────────────────────────────────────── -->
    <div class="settings-section">
      <div class="settings-section-header" style="opacity:.85">⚠️ Gefahrenzone</div>
      <div class="card">
        <p style="font-size:12px;color:var(--muted);margin-bottom:14px">Diese Aktionen können nicht rückgängig gemacht werden.</p>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:14px">
          ${[['einkaeufe','🛒 Einkäufe'],['ausgaben','💸 Ausgaben'],['einnahmen','💰 Einnahmen'],
             ['spesen','✈️ Spesen'],['sparen','🏦 Sparen'],['zaehler','⚡ Zähler']].map(([k,l])=>{
            return '<button class="btn-danger-outline" onclick="clearSingle(&quot;'+k+'&quot;)">🗑 '+l+'</button>';
          }).join('')}
        </div>
        <div style="border-top:1px solid var(--border);padding-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-danger-solid" onclick="clearAllData()">🗑 Alle Einträge löschen</button>
          <button class="btn-danger-solid" onclick="resetApp()">💀 App komplett zurücksetzen</button>
        </div>
      </div>
    </div>

  </div>`;
}

// ── CSS THEME & CONFIG ──────────────────────────────────────────────────────
function toggleConfig(key) {
  if (!state.config) state.config = {};
  state.config[key] = !state.config[key];
  try {
    saveData();
    if (currentPage === 'einstellungen') {
      const pc = document.getElementById('pageContent');
      const scrollTop = pc ? pc.scrollTop : 0;
      renderPage();
      if (pc) pc.scrollTop = scrollTop;
      showToast('Einstellungen gespeichert');
    }
  } catch (e) {
    console.error('toggleConfig:', e);
    showToast('Fehler beim Speichern', 'error');
  }
}

function updateConfig(key, val) {
  if (!state.config) state.config = {};
  state.config[key] = val;
  try {
    saveData();
    if (key === 'theme') {
      try { localStorage.setItem('fv_theme', JSON.stringify({ theme: val })); } catch(e) {}
    }
    // Show toast on settings page only (avoid noise elsewhere)
    if (currentPage === 'einstellungen') showToast('Einstellungen gespeichert');
  } catch (e) {
    console.error('updateConfig:', e);
    showToast('Fehler beim Speichern', 'error');
  }
}

const ACCENT_DARKS = {
  '#0f766e':'#0d6560','#2563eb':'#1d4ed8','#7c3aed':'#6d28d9',
  '#dc2626':'#b91c1c','#ea580c':'#c2410c','#16a34a':'#15803d',
};

function applyTheme(theme) {
  updateConfig('theme', theme);
  const root = document.documentElement;
  const body = document.body;
  root.classList.remove('theme-dark');
  body.classList.remove('theme-dark');
  if (theme === 'dark') {
    root.classList.add('theme-dark');
    body.classList.add('theme-dark');
  } else if (theme === 'system') {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) { root.classList.add('theme-dark'); body.classList.add('theme-dark'); }
    // Live system changes
    try {
      window.matchMedia('(prefers-color-scheme: dark)').onchange = (e) => {
        if ((state.config||{}).theme === 'system') {
          document.documentElement.classList.toggle('theme-dark', e.matches);
          document.body.classList.toggle('theme-dark', e.matches);
        }
      };
    } catch(e) {}
  }
  try { localStorage.setItem('fv_theme', JSON.stringify({ theme })); } catch(e) {}
  // Akzent an das Theme anpassen: Dark = Bernstein (CSS), Hell = konfigurierte Farbe.
  const root2 = document.documentElement;
  const nowDark = root2.classList.contains('theme-dark');
  if (nowDark) {
    ['--accent','--accent-dark','--accent-hover','--accent-light'].forEach(v => root2.style.removeProperty(v));
  } else if ((state.config||{}).accent) {
    root2.style.setProperty('--accent', state.config.accent);
    root2.style.setProperty('--accent-dark', (typeof ACCENT_DARKS!=='undefined' && ACCENT_DARKS[state.config.accent]) || state.config.accent);
    root2.style.setProperty('--accent-light', state.config.accent + '20');
  }
}
function applyAccent(color) {
  updateConfig('accent', color);
  const root = document.documentElement;
  root.style.setProperty('--accent', color);
  root.style.setProperty('--accent-dark', ACCENT_DARKS[color] || color);
  root.style.setProperty('--accent-hover', ACCENT_DARKS[color] || color);
  root.style.setProperty('--accent-light', color + '20');
  renderPage();
}

function applySettings() {
  const cfg = state.config || {};
  if (cfg.theme) applyTheme(cfg.theme);
  // Akzentfarbe: nur im Hell-Modus die konfigurierte Farbe erzwingen.
  // Im Dark-Mode gilt der Bernstein-Akzent aus dem CSS (nicht überschreiben).
  const isDark = document.documentElement.classList.contains('theme-dark');
  if (isDark) {
    // evtl. zuvor gesetzte Inline-Akzente entfernen, damit CSS (Bernstein) greift
    const root = document.documentElement;
    ['--accent','--accent-dark','--accent-hover','--accent-light'].forEach(v => root.style.removeProperty(v));
  } else if (cfg.accent) {
    applyAccent(cfg.accent);
  }
  document.body.classList.toggle('compact', !!cfg.compactMode);
  try { localStorage.setItem('fv_theme', JSON.stringify({ theme: cfg.theme||'light' })); } catch(e) {}
}

function addCustomCat() {
  // Legacy fallback - default to 'ausgabe' group
  addCustomCatByGroup('ausgabe');
}

function addCustomCatByGroup(group) {
  const inp = document.getElementById('new_cat_' + group);
  const val = (inp?.value||'').trim();
  if (!val) return;
  const existing = getCustomCats(group);
  if (existing.some(c => c.toLowerCase() === val.toLowerCase())) {
    showToast('Eintrag existiert bereits', 'info');
    if (inp) inp.value = '';
    return;
  }
  setCustomCats(group, [...existing, val]);
  saveData();
  showToast('Hinzugefügt: ' + val);
  renderPage();
}

function removeCustomCatByGroup(group, idx) {
  const list = getCustomCats(group);
  if (idx < 0 || idx >= list.length) return;
  const removed = list[idx];
  setCustomCats(group, list.filter((_,i) => i !== idx));
  saveData();
  showToast('Entfernt: ' + removed);
  renderPage();
}

function removeCustomCat(cat) {
  state.customCats = (state.customCats||[]).filter(c=>c!==cat);
  saveData(); renderPage();
}
function removeCustomCatByIndex(idx) {
  state.customCats = (state.customCats||[]).filter((_,i)=>i!==idx);
  saveData();
  showToast('Kategorie entfernt');
  renderPage();
}

async function clearSingle(key) {
  const labels = { einkaeufe:'Einkäufe', ausgaben:'Ausgaben', einnahmen:'Einnahmen', spesen:'Spesen', sparen:'Sparen & Depot', zaehler:'Zählerstände' };
  const icons  = { einkaeufe:'🛒', ausgaben:'💸', einnahmen:'💰', spesen:'✈️', sparen:'🏦', zaehler:'⚡' };
  const label = labels[key] || key;
  const count = (state[key]||[]).length;
  const ok = await uiConfirm({
    title: label + ' löschen?',
    icon: icons[key] || '🗑',
    danger: true,
    message: '<strong>' + count + ' Einträge</strong> in „' + label + '" (Jahr ' + getSelectedYear() + ') werden unwiderruflich gelöscht.',
    okLabel: 'Endgültig löschen',
    cancelLabel: 'Abbrechen',
  });
  if (!ok) return;
  state[key] = [];
  saveData(); renderPage();
  showToast(label + ' wurden gelöscht');
}

async function restartSetup() {
  if (!await uiConfirm({ message: 'Willkommensassistenten erneut starten? Deine Daten bleiben erhalten.', title: 'Setup erneut starten', icon: '🔄' })) return;
  state.meta.setupDone = false;
  saveData();
  showSetupScreen();
}

function openDataFolder() {
  if (window.EA && window.EA.openDataFolder) {
    window.EA.openDataFolder();
  } else {
    uiAlert('Speicherort:\n%APPDATA%\\finanzverwaltung-pro\\data.json');
  }
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); 
  a.href = url; 
  a.download = 'Finanzverwaltung_Backup_' + today() + '.json'; 
  a.click();
  URL.revokeObjectURL(url);
  updateConfig('lastBackup', new Date().toLocaleDateString('de-DE'));
  renderPage();
}

function exportCSV() {
  const month = currentMonth;
  const rows = [['Datum','Beschreibung','Betrag','Kategorie','Typ']];
  state.einkaeufe.filter(e=>e.month===month).forEach(e=>rows.push([e.date,e.store,e.amount,'Einkauf','Ausgabe']));
  state.ausgaben.filter(a=>a.month===month).forEach(a=>rows.push([a.date,a.desc,a.amount,a.category,'Ausgabe']));
  state.einnahmen.filter(e=>e.month===month).forEach(e=>rows.push([e.date,e.source,e.amount,e.type,'Einnahme']));
  const csv = rows.map(r=>r.map(v=>'"'+String(v||'').replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'Finanzverwaltung_'+month+'.csv'; a.click();
  URL.revokeObjectURL(url);
}

function exportJSON() {
  exportBackup();
}

async function importBackup() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json';
  inp.onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (!await uiConfirm({ message: 'Backup importieren? Alle aktuellen Daten werden überschrieben!', title: 'Backup importieren', icon: '⚠' })) return;
      Object.assign(state, data);
      saveData();
      location.reload();
    } catch { uiAlert('Fehler: Ungültige Backup-Datei.'); }
  };
  inp.click();
}

function updateSetting(key, val) {
  if (!state.meta) state.meta = {};
  state.meta[key] = val;
  if (key === 'startgeld') {
    const yd = getYearData(); if (yd) {
      yd.startBalance = +val || 0;
      const ks = getKonten();
      const sum = ks.reduce((s,k)=>s+(+k.start||0),0);
      const diff = (+val||0) - sum;
      if (Math.abs(diff) > 0.001 && ks.length) {
        const target = ks.find(k=>k.cashflow) || ks[0];
        target.start = Math.round(((+target.start||0) + diff) * 100) / 100;
      }
    }
  }
  if (key === 'userName') {
    const un = document.getElementById('userName');
    if (un) un.textContent = val;
  }
  try {
    saveData();
    if (key === 'waehrung') {
      const pc = document.getElementById('pageContent');
      const scrollTop = pc ? pc.scrollTop : 0;
      renderPage();
      if (pc) pc.scrollTop = scrollTop;
      showToast('Währung geändert: ' + val);
    } else {
      showToast('Einstellungen gespeichert');
    }
  } catch (e) {
    console.error('updateSetting:', e);
    showToast('Fehler beim Speichern: ' + e.message, 'error');
  }
}

async function clearAllData() {
  const ok = await uiConfirm({
    title: 'Alle Einträge löschen?',
    icon: '🗑',
    danger: true,
    message: 'Diese Aktion löscht <strong>alle Einträge im aktuell ausgewählten Jahr</strong> (' + getSelectedYear() + ').',
    details: [
      'Einkäufe, Ausgaben, Einnahmen',
      'Spesen, Sparen, Zähler',
      'Fixkosten, Finanzprodukte, Tabellen',
      'Papierkorb wird geleert',
    ],
    okLabel: 'Weiter',
    cancelLabel: 'Abbrechen',
  });
  if (!ok) return;
  const ok2 = await uiConfirm({
    title: 'Letzte Sicherheitsabfrage',
    icon: '⚠',
    danger: true,
    message: 'Diese Aktion kann nicht rückgängig gemacht werden. Wirklich alle Einträge löschen?',
    okLabel: 'Ja, jetzt löschen',
    cancelLabel: 'Abbrechen',
  });
  if (!ok2) return;
  // Clear all movement data
  state.transactions    = [];
  state.einkaeufe       = [];
  state.ausgaben        = [];
  state.einnahmen       = [];
  state.regelEinnahmen  = [];
  state.spesen          = [];
  state.sparen          = [];
  state.zaehler         = [];
  state.fixkosten       = [];
  state.tabellen        = [];
  state.finanzprodukte  = [];
  state.trash           = [];
  state.imports         = [];
  // KEEP: meta, config, customCats, etfKurse, incomeByMonth structure (but zero values)
  if (state.incomeByMonth) {
    Object.keys(state.incomeByMonth).forEach(k => {
      state.incomeByMonth[k] = { gehalt: 0, nebenjob: 0 };
    });
  }
  saveData();
  showToast('Alle Einträge gelöscht');
  navigate('dashboard');
}

async function resetApp() {
  const ok1 = await uiConfirm({
    title: 'App komplett zurücksetzen?',
    icon: '💀',
    danger: true,
    message: 'Diese Aktion löscht <strong>alle Daten und Einstellungen</strong> aus allen Jahren.',
    details: [
      'Profil, Name, Startguthaben',
      'Alle Einträge in allen Jahren',
      'Theme, Währung, Backup-Einstellungen',
      'Kategorien, Papierkorb, Import-Historie',
    ],
    okLabel: 'Weiter',
    cancelLabel: 'Abbrechen',
  });
  if (!ok1) return;
  const ok2 = await uiConfirm({
    title: 'Letzte Sicherheitsabfrage',
    icon: '⚠',
    danger: true,
    message: 'Wirklich alles löschen? Die Willkommensmaske erscheint beim nächsten Start wieder.',
    okLabel: 'Ja, komplett zurücksetzen',
    cancelLabel: 'Abbrechen',
  });
  if (!ok2) return;
  Object.assign(state, JSON.parse(JSON.stringify(DEFAULT_DATA)));
  saveData();
  // Clear saved data on disk too
  if (window.EA) window.EA.saveData('{}').catch(()=>{});
  else { try { localStorage.removeItem('fv_pro_data'); } catch {} }
  // Show setup screen immediately
  const un = document.getElementById('userName');
  if (un) un.textContent = '';
  showSetupScreen();
}

function finanzprodukte() {
  const items = [...(state.finanzprodukte||[])].sort((a,b)=>b.jahr-a.jahr||(b.datum||'').localeCompare(a.datum||''));
  
  // Group by product name
  const byName = {};
  items.forEach(fp => {
    if (!byName[fp.name]) byName[fp.name] = [];
    byName[fp.name].push(fp);
  });

  const totalWert = items.reduce((s,fp)=>s+(+fp.wert||0),0);
  const totalEingezahlt = items.reduce((s,fp)=>s+(+fp.eingezahlt||0),0);
  // Latest entry per product
  const latestPerProduct = {};
  items.forEach(fp => {
    if (!latestPerProduct[fp.name] || fp.jahr > latestPerProduct[fp.name].jahr) latestPerProduct[fp.name] = fp;
  });
  const latestWert = Object.values(latestPerProduct).reduce((s,fp)=>s+(+fp.wert||0),0);
  const latestEingezahlt = Object.values(latestPerProduct).reduce((s,fp)=>s+(+fp.eingezahlt||0),0);
  const gwl = latestWert - latestEingezahlt;

  const productSections = Object.entries(byName).map(([name, entries]) => {
    const latest = entries[0];
    const gwlProd = (+latest.wert||0) - (+latest.eingezahlt||0);
    const gwlPct = latest.eingezahlt ? (gwlProd / latest.eingezahlt * 100) : 0;
    const rows = entries.map(fp => {
      const g = (+fp.wert||0)-(+fp.eingezahlt||0);
      const pct = fp.eingezahlt ? (g/fp.eingezahlt*100) : 0;
      return '<tr>' +
        '<td>' + fp.jahr + '</td>' +
        '<td style="font-size:11px;color:var(--muted)">' + (fp.datum||'') + '</td>' +
        '<td><span class="badge badge-muted" style="font-size:10px">' + (fp.typ||'') + '</span></td>' +
        '<td>' + (fp.anbieter||'–') + '</td>' +
        '<td style="text-align:right">' + fmtEur(+fp.eingezahlt||0) + '</td>' +
        '<td style="text-align:right;font-weight:600">' + fmtEur(+fp.wert||0) + '</td>' +
        '<td style="text-align:right;color:' + (g>=0?'var(--green)':'var(--red)') + ';font-weight:600">' + (g>=0?'+':'') + fmtEur(g) + '</td>' +
        '<td style="text-align:right;color:' + (pct>=0?'var(--green)':'var(--red)') + '">' + (pct>=0?'+':'') + pct.toFixed(2) + '%</td>' +
        '<td style="font-size:11px;color:var(--muted)">' + (fp.notiz||'') + '</td>' +
        '<td><button class="btn-icon danger" onclick="deleteFinanzprodukt(' + fp.id + ')">×</button></td>' +
        '</tr>';
    }).join('');
    return '<div class="card mb-2">' +
      '<div class="card-header">' +
        '<div><h3>' + name + '</h3>' +
          '<div style="font-size:12px;color:var(--muted)">' + (latest.typ||'') + (latest.anbieter?' · '+latest.anbieter:'') + '</div></div>' +
        '<div class="actions">' +
          '<span class="badge ' + (gwlProd>=0?'badge-green':'badge-red') + '">' + (gwlPct>=0?'+':'') + gwlPct.toFixed(1) + '%</span>' +
          '<span class="badge badge-muted">Aktuell: ' + fmtEur(+latest.wert||0) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="table-wrap"><table>' +
        '<thead><tr><th>Jahr</th><th>Datum</th><th>Typ</th><th>Anbieter</th><th style="text-align:right">Eingezahlt</th><th style="text-align:right">Wert</th><th style="text-align:right">G/V</th><th style="text-align:right">G/V %</th><th>Notiz</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>' +
    '</div>';
  }).join('');

  return '<div>' +
    lockBanner() +
    '<div class="kpi-grid kpi-grid-3 mb-2">' +
      '<div class="kpi"><div class="kpi-label">Aktueller Gesamtwert</div><div class="kpi-value ' + (latestWert>=latestEingezahlt?'positive':'negative') + '">' + fmtEur(latestWert) + '</div></div>' +
      '<div class="kpi"><div class="kpi-label">Eingezahlt gesamt</div><div class="kpi-value">' + fmtEur(latestEingezahlt) + '</div></div>' +
      '<div class="kpi"><div class="kpi-label">Gewinn / Verlust</div><div class="kpi-value ' + (gwl>=0?'positive':'negative') + '">' + (gwl>=0?'+':'') + fmtEur(gwl) + '</div></div>' +
    '</div>' +
    '<div style="display:flex;justify-content:flex-end;margin-bottom:14px">' +
      '<button class="btn btn-primary" onclick="openFinanzproduktModal()" ${lockAttr()}>+ Neues Produkt</button>' +
    '</div>' +
    (items.length ? productSections : '<div class="empty-state"><div class="empty-icon">📋</div><p>Noch keine Finanzprodukte erfasst.<br>Klicke auf „+ Neues Produkt" um zu starten.</p></div>') +
  '</div>';
}

function onFpTypChange() {
  const typ = document.getElementById('fp_typ')?.value;
  const cl  = document.getElementById('fp_typ_custom_label');
  if (cl) cl.classList.toggle('hidden', typ !== 'Sonstiges');
}
function openFinanzproduktModal() {
  if (!requireUnlocked()) return;
  const modal = document.getElementById('finanzproduktModal');
  if (!modal) return;
  const yr = new Date().getFullYear();
  document.getElementById('fp_jahr').value = yr;
  document.getElementById('fp_datum').value = today();
  ['fp_name','fp_anbieter','fp_vertrag','fp_notiz','fp_typ_custom'].forEach(id => { const el2=document.getElementById(id); if(el2) el2.value=''; });
  ['fp_eingezahlt','fp_wert'].forEach(id => { const el2=document.getElementById(id); if(el2) el2.value=''; });
  document.getElementById('fp_typ').value = 'AVWL';
  document.getElementById('fp_typ_custom_label')?.classList.add('hidden');
  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('fp_name')?.focus(), 100);
}
function closeFinanzproduktModal() {
  document.getElementById('finanzproduktModal')?.classList.add('hidden');
}
function saveFinanzproduktModal() {
  if (!requireUnlocked()) return;
  const name = (document.getElementById('fp_name')?.value||'').trim();
  const typ  = document.getElementById('fp_typ')?.value || '';
  const typCustom = document.getElementById('fp_typ_custom')?.value || '';
  const jahr = +(document.getElementById('fp_jahr')?.value) || new Date().getFullYear();
  if (!name) { uiAlert('Bitte Produktname eingeben.'); return; }
  const fp = {
    id: uid(), jahr, datum: document.getElementById('fp_datum')?.value||today(),
    name, typ: typ==='Sonstiges'?typCustom||'Sonstiges':typ,
    anbieter: document.getElementById('fp_anbieter')?.value||'',
    vertrag: document.getElementById('fp_vertrag')?.value||'',
    eingezahlt: +(document.getElementById('fp_eingezahlt')?.value)||0,
    wert: +(document.getElementById('fp_wert')?.value)||0,
    notiz: document.getElementById('fp_notiz')?.value||'',
  };
  state.finanzprodukte = state.finanzprodukte || [];
  state.finanzprodukte.push(fp);
  saveData(); closeFinanzproduktModal(); renderPage();
  showToast('Finanzprodukt gespeichert');
}
async function deleteFinanzprodukt(id) {
  if (!requireUnlocked()) return;
  if (!await uiConfirm({ message: 'Eintrag löschen?', title: 'Löschen', icon: '🗑' })) return;
  state.finanzprodukte = (state.finanzprodukte||[]).filter(fp=>String(fp.id) !== String(id));
  saveData(); renderPage();
}

function zaehlerMonthlyBreakdown(entries) {
  // entries sorted by date; compute consumption distributed across months
  const monthly = {}; // { '2026-01': kWh }
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i-1], curr = entries[i];
    if (!prev.date || !curr.date) continue;
    const d1 = new Date(prev.date), d2 = new Date(curr.date);
    const totalDays = Math.max(1, Math.round((d2 - d1) / 86400000));
    const consumption = (curr.value||0) - (prev.value||0);
    const perDay = consumption / totalDays;
    // Walk through days and assign to months
    let cursor = new Date(d1);
    while (cursor < d2) {
      const mKey = cursor.toISOString().slice(0,7);
      monthly[mKey] = (monthly[mKey] || 0) + perDay;
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return monthly;
}

function zaehler() {
  const items = [...state.zaehler].sort((a,b)=>(a.date||'').localeCompare(b.date||''));

  // Group by type
  const byType = {};
  items.forEach(z => {
    const t = z.type || 'Strom';
    if (!byType[t]) byType[t] = [];
    byType[t].push(z);
  });

  const typeIcons = { Strom:'⚡', Warmwasser:'🔥', Kaltwasser:'💧', 'Wasser allgemein':'🌊', Sonstiges:'📊' };

  const typeHtml = Object.keys(byType).map(type => {
    const rows = byType[type];
    const rowsHtml = rows.map((z,i) => {
      const prev = rows[i-1];
      const diff = prev ? (z.value - prev.value) : null;
      const einheit = z.einheit || (type === 'Strom' ? 'kWh' : 'm³');
      const einheitOpts = ['kWh','Liter / L','m³','Sonstiges'].map(e =>
        '<option value="' + e + '"' + (e===einheit?' selected':'') + '>' + e + '</option>').join('');
      const typeOpts = ['Strom','Warmwasser','Kaltwasser','Wasser allgemein','Sonstiges'].map(t =>
        '<option value="' + t + '"' + (t===z.type?' selected':'') + '>' + t + '</option>').join('');
      return '<tr id="zaeh_' + z.id + '">' +
        '<td><input type="date" value="' + (z.date||'') + '" onchange="updateZaehler(' + z.id + ',\'date\',this.value)" style="width:145px"/></td>' +
        '<td><select onchange="updateZaehler(' + z.id + ',\'type\',this.value)" style="width:140px">' + typeOpts + '</select></td>' +
        '<td><input type="number" value="' + (z.value||0) + '" step="0.001" onchange="updateZaehler(' + z.id + ',\'value\',+this.value)" style="width:100px;text-align:right"/></td>' +
        '<td><select onchange="updateZaehlerEinheit(' + z.id + ',this.value)" style="width:90px">' + einheitOpts + '</select>' +
        (z.einheitCustom ? '<input type="text" value="' + z.einheitCustom + '" onchange="updateZaehler(' + z.id + ',\'einheitCustom\',this.value)" style="width:80px;margin-left:4px" placeholder="Einheit…"/>' : '') +
        '</td>' +
        '<td class="amount ' + (diff !== null ? (diff >= 0 ? 'positive' : 'negative') : '') + '">' +
        (diff !== null ? (diff >= 0 ? '+' : '') + fmt(diff) + ' ' + einheit : '–') + '</td>' +
        '<td><input type="text" value="' + (z.note||'') + '" onchange="updateZaehler(' + z.id + ',\'note\',this.value)" placeholder="Notiz…"/></td>' +
        '<td><button class="btn-icon danger" onclick="deleteZaehler(' + z.id + ')">×</button></td>' +
        '</tr>';
    }).join('');
    // Monatliche Aufschlüsselung
    const monthly = zaehlerMonthlyBreakdown(rows);
    const monthKeys = Object.keys(monthly).sort();
    const einheit0 = rows[0]?.einheit || (type === 'Strom' ? 'kWh' : 'm³');
    const monthlyHtml = monthKeys.length ? 
      '<div style="padding:10px 14px;background:var(--surface);border-top:1px solid var(--border)">' +
        '<p style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Verbrauch pro Monat (zeitanteilig)</p>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
        monthKeys.map(mk => '<span class="badge badge-muted" style="font-size:11px">' + monthLabel(mk) + ': <strong>' + fmt(monthly[mk]) + ' ' + einheit0 + '</strong></span>').join('') +
        '</div></div>' : '';
    return '<div class="card mb-2">' +
      '<div class="card-header"><h3>' + (typeIcons[type]||'📊') + ' ' + type + '</h3>' +
      '<span class="badge badge-muted">' + rows.length + ' Einträge</span></div>' +
      (rows.length >= 2 ? '<div style="padding:14px 14px 4px"><div style="height:160px;position:relative"><canvas id="zChart_' + type.replace(/[^a-zA-Z0-9]/g,'_') + '"></canvas></div></div>' : '') +
      '<div class="table-wrap"><table>' +
      '<thead><tr><th>Datum</th><th>Typ</th><th>Zählerstand</th><th>Einheit</th><th>Verbrauch</th><th>Notiz</th><th></th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table></div>' + monthlyHtml + '</div>';
  }).join('');

  return '<div>' +
    '<div style="display:flex;justify-content:flex-end;margin-bottom:14px">' +
    '<button class="btn btn-primary" onclick="openZaehlerModal()" ${lockAttr()}>+ Zählerstand</button></div>' +
    (Object.keys(byType).length ? typeHtml :
      '<div class="empty-state"><div class="empty-icon">⚡</div><p>Noch keine Zählerstände erfasst.</p></div>') +
    '</div>';
}

function updateZaehlerModalEinheit() {
  const EINH_MAP = {
    'Strom':            ['kWh','Wh','MWh'],
    'Warmwasser':       ['m³','Liter / L'],
    'Kaltwasser':       ['m³','Liter / L'],
    'Wasser allgemein': ['m³','Liter / L'],
    'Gas':              ['m³','kWh'],
    'Heizung / Wärme':  ['kWh','MWh'],
    'Sonstiges':        ['kWh','Wh','MWh','Liter / L','m³','ml','kg','g','Stück','Sonstiges'],
  };
  const DEF_MAP = {
    'Strom':'kWh','Warmwasser':'m³','Kaltwasser':'m³','Wasser allgemein':'m³',
    'Gas':'m³','Heizung / Wärme':'kWh','Sonstiges':'kWh'
  };
  const type = document.getElementById('zm_type')?.value || 'Strom';
  const einheitSel = document.getElementById('zm_einheit');
  const customLabel = document.getElementById('zm_type_custom_label');
  if (customLabel) customLabel.classList.toggle('hidden', type !== 'Sonstiges');
  if (!einheitSel) return;
  const einheiten = EINH_MAP[type] || EINH_MAP['Sonstiges'];
  const defaultE = DEF_MAP[type] || einheiten[0];
  einheitSel.innerHTML = einheiten.map(e => '<option value="' + e + '">' + e + '</option>').join('');
  einheitSel.value = defaultE;
  onZmEinheitChange();
}
function onZmEinheitChange() {
  const val = document.getElementById('zm_einheit')?.value;
  const cl  = document.getElementById('zm_einheit_custom_label');
  if (cl) cl.classList.toggle('hidden', val !== 'Sonstiges');
}
function openZaehlerModal() {
  if (!requireUnlocked()) return;
  const modal = document.getElementById('zaehlerModal');
  if (!modal) return;
  document.getElementById('zm_date').value  = today();
  document.getElementById('zm_type').value  = 'Strom';
  document.getElementById('zm_value').value = '';
  document.getElementById('zm_note').value  = '';
  updateZaehlerModalEinheit();
  ['zm_type_custom_label','zm_einheit_custom_label'].forEach(id => {
    const el2 = document.getElementById(id);
    if (el2) el2.classList.add('hidden');
  });
  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('zm_value').focus(), 100);
}
function closeZaehlerModal() {
  const modal = document.getElementById('zaehlerModal');
  if (modal) modal.classList.add('hidden');
}
function saveZaehlerModal() {
  if (!requireUnlocked()) return;
  const type    = document.getElementById('zm_type').value;
  const typeCustom = document.getElementById('zm_type_custom')?.value || '';
  const einheit = document.getElementById('zm_einheit').value;
  const einheitCustom = document.getElementById('zm_einheit_custom')?.value || '';
  const value   = +(document.getElementById('zm_value').value) || 0;
  const date    = document.getElementById('zm_date').value;
  const note    = document.getElementById('zm_note').value;
  if (!value) { uiAlert('Bitte Zählerstand eingeben.'); return; }
  state.zaehler.push({
    id: uid(), date, value, note,
    type:    type    === 'Sonstiges' ? typeCustom    || 'Sonstiges' : type,
    einheit: einheit === 'Sonstiges' ? einheitCustom || 'Sonstiges' : einheit,
  });
  saveData(); closeZaehlerModal(); renderPage();
}
function renderZaehlerCharts() {
  if (typeof Chart === 'undefined') return;
  const items = [...state.zaehler].sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const byType = {};
  items.forEach(z => { const t = z.type || 'Strom'; (byType[t] = byType[t] || []).push(z); });

  // Akzentfarbe aus dem Theme lesen (folgt dem blauen/hellen Design)
  const css = getComputedStyle(document.documentElement);
  const accent = (css.getPropertyValue('--accent') || '#0EA5E9').trim();
  const accent2 = (css.getPropertyValue('--accent2') || accent).trim();
  const textCol = (css.getPropertyValue('--muted') || '#94A3B8').trim();
  const gridCol = (css.getPropertyValue('--border') || '#334155').trim();

  Object.keys(byType).forEach(type => {
    const rows = byType[type];
    if (rows.length < 2) return;
    const id = 'zChart_' + type.replace(/[^a-zA-Z0-9]/g,'_');
    const ctx = document.getElementById(id);
    if (!ctx) return;
    const einheit = rows[0]?.einheit || '';
    const labels = rows.map(z => {
      const d = z.date || '';
      // kompaktes Datum TT.MM.JJ
      const p = d.split('-');
      return p.length === 3 ? (p[2] + '.' + p[1] + '.' + p[0].slice(2)) : d;
    });
    const data = rows.map(z => z.value || 0);
    try {
      chartInstances['z_' + id] = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Zählerstand' + (einheit ? ' (' + einheit + ')' : ''),
            data,
            borderColor: accent,
            backgroundColor: accent + '22',
            borderWidth: 2,
            pointBackgroundColor: accent2,
            pointRadius: 3,
            tension: 0.25,
            fill: true,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, labels: { color: textCol, font: { size: 11, family: 'Inter' }, boxWidth: 12 } },
            tooltip: {
              callbacks: {
                label: (c) => ' ' + fmt(c.parsed.y) + (einheit ? ' ' + einheit : '')
              }
            }
          },
          scales: {
            x: { ticks: { color: textCol, font: { size: 10 } }, grid: { color: gridCol + '55' } },
            y: { ticks: { color: textCol, font: { size: 10 } }, grid: { color: gridCol + '55' } }
          }
        }
      });
    } catch (e) { console.error('Zähler-Chart:', e); }
  });
}

function updateZaehlerEinheit(id, val) {
  const z = state.zaehler.find(x=>String(x.id) === String(id));
  if (z) { z.einheit = val; saveData(); renderPage(); }
}
function addZaehler(){
  if (!requireUnlocked()) return; openZaehlerModal(); }

function updateZaehler(id,f,v){
  if (!requireUnlocked()) return;const z=state.zaehler.find(x=>String(x.id) === String(id));if(z){z[f]=v;saveData();}}
function deleteZaehler(id){
  if (!requireUnlocked()) return; if(moveToTrash('zaehler', id, 'Zählerstand')) { renderPage(); showToast('In Papierkorb verschoben','info'); } }

// ── PAGE: PDF IMPORT ──────────────────────────────────────────────────────

let _toastTimer = null;
// ── CUSTOM CONFIRM MODAL ──────────────────────────────────────────────
// Replaces native confirm()/uiAlert() with theme-styled modals
let _modalResolvers = [];

function uiConfirm(opts) {
  return new Promise((resolve) => {
    const o = typeof opts === 'string' ? { message: opts } : (opts || {});
    const title    = o.title    || 'Bestätigung';
    const message  = o.message  || '';
    const details  = o.details  || [];  // array of strings to list
    const okLabel  = o.okLabel  || 'OK';
    const cancelLabel = o.cancelLabel || 'Abbrechen';
    const danger   = !!o.danger;
    const icon     = o.icon || (danger ? '⚠' : '?');

    let detailsHtml = '';
    if (details.length) {
      detailsHtml = '<ul style="margin:10px 0 0 0;padding:0 0 0 20px;font-size:13px;color:var(--text)">' +
        details.map(d => '<li style="margin-bottom:4px">' + d + '</li>').join('') + '</ul>';
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)';
    overlay.innerHTML =
      '<div style="background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:12px;padding:0;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.5);animation:fadeIn .15s ease-out">' +
        '<div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px">' +
          '<div style="font-size:28px;line-height:1">' + icon + '</div>' +
          '<h3 style="margin:0;font-size:16px;font-weight:600;color:var(--text)">' + title + '</h3>' +
        '</div>' +
        '<div style="padding:18px 22px;font-size:14px;line-height:1.5;color:var(--text)">' +
          message + detailsHtml +
        '</div>' +
        '<div style="padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;background:var(--surface-2);border-radius:0 0 12px 12px">' +
          '<button class="btn btn-ghost" data-ui-action="cancel">' + cancelLabel + '</button>' +
          '<button class="' + (danger ? 'btn-danger-solid' : 'btn btn-primary') + '" data-ui-action="ok">' + okLabel + '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    function cleanup(result) {
      overlay.removeEventListener('keydown', keyHandler);
      document.removeEventListener('keydown', keyHandler);
      overlay.remove();
      resolve(result);
    }
    function keyHandler(e) {
      if (e.key === 'Escape') { e.preventDefault(); cleanup(false); }
      else if (e.key === 'Enter') { e.preventDefault(); cleanup(true); }
    }
    overlay.querySelector('[data-ui-action="ok"]').addEventListener('click', () => cleanup(true));
    overlay.querySelector('[data-ui-action="cancel"]').addEventListener('click', () => cleanup(false));
    document.addEventListener('keydown', keyHandler);
    // Auto-focus OK button
    setTimeout(() => overlay.querySelector('[data-ui-action="ok"]')?.focus(), 50);
  });
}

function uiAlert(opts) {
  const o = typeof opts === 'string' ? { message: opts } : (opts || {});
  o.cancelLabel = '';  // no cancel
  return new Promise((resolve) => {
    const title   = o.title   || 'Hinweis';
    const message = o.message || '';
    const icon    = o.icon || 'ℹ';
    const okLabel = o.okLabel || 'OK';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal" style="max-width:440px;padding:0;animation:fadeIn .15s ease-out" onclick="event.stopPropagation()">' +
        '<div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px">' +
          '<div style="font-size:28px;line-height:1">' + icon + '</div>' +
          '<h3 style="margin:0;font-size:16px;font-weight:600;color:var(--text)">' + title + '</h3>' +
        '</div>' +
        '<div style="padding:18px 22px;font-size:14px;line-height:1.5;color:var(--text)">' + message + '</div>' +
        '<div style="padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;background:var(--surface);border-radius:0 0 14px 14px">' +
          '<button class="btn btn-primary" data-ui-action="ok">' + okLabel + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    function cleanup() { document.removeEventListener('keydown', kh); overlay.remove(); resolve(); }
    function kh(e) { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); cleanup(); } }
    overlay.querySelector('[data-ui-action="ok"]').addEventListener('click', cleanup);
    document.addEventListener('keydown', kh);
    setTimeout(() => overlay.querySelector('[data-ui-action="ok"]')?.focus(), 50);
  });
}

// ── UPDATE-MANAGER ──────────────────────────────────────────────────────────
let _updateProgressBound = false;
async function openUpdateManager() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = '_updateModal';
  overlay.innerHTML =
    '<div class="modal" style="max-width:460px;padding:0;animation:fadeIn .15s ease-out" onclick="event.stopPropagation()">' +
      '<div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px">' +
        '<div style="font-size:26px;line-height:1">🔄</div>' +
        '<h3 style="margin:0;font-size:16px;font-weight:600;color:var(--text)">Update-Manager</h3>' +
      '</div>' +
      '<div style="padding:20px 22px" id="_updateBody">' +
        '<div id="_updateStatus" style="font-size:14px;color:var(--text);margin-bottom:14px">Bereit, nach Updates zu suchen.</div>' +
        '<div id="_updateBarWrap" style="height:12px;border-radius:7px;background:var(--surface-2);overflow:hidden;display:none;margin-bottom:8px">' +
          '<div id="_updateBar" style="height:100%;width:0%;border-radius:7px;background:linear-gradient(90deg,var(--accent),var(--green));transition:width .3s ease"></div>' +
        '</div>' +
        '<div id="_updatePct" style="font-size:12px;color:var(--muted);text-align:right;display:none">0%</div>' +
      '</div>' +
      '<div style="padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;background:var(--surface);border-radius:0 0 14px 14px">' +
        '<button class="btn btn-ghost" id="_updateClose">Schließen</button>' +
        '<button class="btn btn-primary" id="_updateCheck">Nach Updates suchen</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  const statusEl = overlay.querySelector('#_updateStatus');
  const barWrap  = overlay.querySelector('#_updateBarWrap');
  const bar      = overlay.querySelector('#_updateBar');
  const pctEl    = overlay.querySelector('#_updatePct');
  const checkBtn = overlay.querySelector('#_updateCheck');

  function close() { overlay.remove(); }
  overlay.querySelector('#_updateClose').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // Fortschritts-Events aus dem Main-Prozess (nur einmal binden)
  if (window.EA && window.EA.onUpdateProgress && !_updateProgressBound) {
    _updateProgressBound = true;
    window.EA.onUpdateProgress((d) => {
      const wrap = document.getElementById('_updateBarWrap');
      const b = document.getElementById('_updateBar');
      const p = document.getElementById('_updatePct');
      const s = document.getElementById('_updateStatus');
      if (wrap) wrap.style.display = 'block';
      if (p) p.style.display = 'block';
      if (b) b.style.width = (d.percent||0) + '%';
      if (p) p.textContent = (d.percent||0) + '%';
      if (s) s.textContent = 'Update wird heruntergeladen…';
    });
  }
  if (window.EA && window.EA.onUpdateAvailable) {
    window.EA.onUpdateAvailable((d) => {
      const s = document.getElementById('_updateStatus');
      if (s) s.textContent = 'Neue Version ' + (d.version||'') + ' gefunden – wird geladen…';
    });
  }

  checkBtn.addEventListener('click', async () => {
    checkBtn.disabled = true;

    // Optional: Backup vor dem Update
    if (state.config && state.config.autoBackupBeforeUpdate) {
      statusEl.textContent = 'Erstelle Sicherung vor dem Update…';
      try {
        if (window.EA && window.EA.writeBackup && state.config.backupPath) {
          await window.EA.writeBackup(state.config.backupPath, JSON.stringify(state, null, 2));
          statusEl.textContent = '✓ Backup erstellt. Suche nach Updates…';
        } else {
          // Kein Backup-Ordner → als Datei-Download sichern
          exportBackup();
          statusEl.textContent = '✓ Backup heruntergeladen. Suche nach Updates…';
        }
      } catch (e) {
        statusEl.textContent = '⚠ Backup fehlgeschlagen, suche trotzdem…';
      }
    } else {
      statusEl.textContent = 'Suche nach Updates…';
    }

    // Update-Check über Main-Prozess
    if (!window.EA || !window.EA.checkForUpdates) {
      statusEl.textContent = 'Update-Funktion nur in der installierten App verfügbar (nicht im Entwicklungsmodus).';
      checkBtn.disabled = false;
      return;
    }
    try {
      const r = await window.EA.checkForUpdates();
      if (r && r.ok && r.version) {
        statusEl.textContent = 'Version ' + r.version + ' verfügbar – wird im Hintergrund geladen. Du wirst gefragt, sobald sie bereit ist.';
        barWrap.style.display = 'block';
        pctEl.style.display = 'block';
      } else if (r && r.reason === 'dev') {
        statusEl.textContent = 'Kein Update-Check im Entwicklungsmodus (npm start). In der installierten App aktiv.';
        checkBtn.disabled = false;
      } else {
        statusEl.textContent = '✓ Du hast bereits die neueste Version.';
        checkBtn.disabled = false;
      }
    } catch (e) {
      statusEl.textContent = 'Fehler bei der Update-Suche: ' + (e.message || e);
      checkBtn.disabled = false;
    }
  });

  setTimeout(() => checkBtn?.focus(), 50);
}

// Theme-styled prompt: gibt eingegebenen Text zurück, oder null bei Abbruch.
function uiPrompt(opts) {  const o = typeof opts === 'string' ? { message: opts } : (opts || {});
  return new Promise((resolve) => {
    const title    = o.title    || 'Eingabe';
    const message  = o.message  || '';
    const icon     = o.icon     || '✏️';
    const okLabel  = o.okLabel  || 'OK';
    const cancelLabel = o.cancelLabel || 'Abbrechen';
    const initial  = o.value != null ? String(o.value) : '';
    const placeholder = o.placeholder || '';
    const inputType = o.type || 'text';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal" style="max-width:440px;padding:0;animation:fadeIn .15s ease-out" onclick="event.stopPropagation()">' +
        '<div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px">' +
          '<div style="font-size:28px;line-height:1">' + icon + '</div>' +
          '<h3 style="margin:0;font-size:16px;font-weight:600;color:var(--text)">' + title + '</h3>' +
        '</div>' +
        '<div style="padding:18px 22px;font-size:14px;line-height:1.5;color:var(--text)">' +
          (message ? '<p style="margin:0 0 12px">' + message + '</p>' : '') +
          '<input type="' + inputType + '" id="_uiPromptInput" value="' + initial.replace(/"/g,'&quot;') + '" placeholder="' + placeholder.replace(/"/g,'&quot;') + '" style="width:100%;padding:9px 11px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);color:var(--text);font-size:14px" />' +
        '</div>' +
        '<div style="padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;background:var(--surface);border-radius:0 0 14px 14px">' +
          '<button class="btn btn-ghost" data-ui-action="cancel">' + cancelLabel + '</button>' +
          '<button class="btn btn-primary" data-ui-action="ok">' + okLabel + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#_uiPromptInput');
    function cleanup(val) { document.removeEventListener('keydown', kh); overlay.remove(); resolve(val); }
    function ok() { cleanup(input.value); }
    function cancel() { cleanup(null); }
    function kh(e) {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      else if (e.key === 'Enter') { e.preventDefault(); ok(); }
    }
    overlay.querySelector('[data-ui-action="ok"]').addEventListener('click', ok);
    overlay.querySelector('[data-ui-action="cancel"]').addEventListener('click', cancel);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cancel(); });
    document.addEventListener('keydown', kh);
    setTimeout(() => { input?.focus(); input?.select(); }, 50);
  });
}

function showToast(msg, type) {
  const toast = document.getElementById('appToast');
  if (!toast) return;
  // Only change text and color - no layout-affecting properties
  toast.textContent = (type !== 'error' && type !== 'info' ? '✓  ' : '') + msg;
  toast.style.background = type === 'error' ? '#dc2626' : type === 'info' ? '#334155' : '#0f766e';
  toast.style.color = '#fff';
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
  }, 2000);
}

function importPage() {
  const imports = (state.imports || []).sort((a,b) => (b.month||'').localeCompare(a.month||''));

  // Group by month
  const byMonth = {};
  imports.forEach(imp => {
    const m = imp.month || 'Unbekannt';
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(imp);
  });

  const monthsHtml = Object.keys(byMonth).sort((a,b) => b.localeCompare(a)).map(month => `
    <div style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span class="badge badge-blue">${monthLabel(month)}</span>
        <span style="font-size:12px;color:var(--muted)">${byMonth[month].length} Dokument${byMonth[month].length>1?'e':''}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${byMonth[month].map(imp => `
          <div style="display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:10px 14px">
            <span style="font-size:20px">📄</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${imp.filename}</div>
              <div style="font-size:11px;color:var(--muted)">Importiert am ${imp.date} · ${imp.count} Buchungen</div>
            </div>
            <button class="btn-icon danger" onclick="deleteImport('${imp.id}')" title="Import löschen">×</button>
          </div>`).join('')}
      </div>
    </div>`).join('');

  return `${lockBanner()}
    <div>
    <div class="card mb-2">
      <div class="card-header"><h3>Kontoauszug importieren</h3></div>
      <label class="field" style="max-width:340px;margin-bottom:12px">Zielkonto für diesen Import
        <select id="import_zielkonto">${getKonten().map(k => '<option value="'+k.id+'"'+(k.id===defaultKontoId()?' selected':'')+'>'+(k.name||'Konto')+(k.cashflow?' (Cashflow)':' (Reserve)')+'</option>').join('')}</select>
        <span style="font-size:11px;color:var(--muted)">Alle Buchungen aus dem importierten Auszug werden diesem Konto zugeordnet. Für ING und Trade also getrennt importieren.</span>
      </label>
      <div class="dropzone" id="importDrop" onclick="triggerImport()">
        <div class="drop-icon">📄</div>
        <h3>PDF, CSV oder TXT hier ablegen</h3>
        <p>ING, Sparkasse, Volksbank – textbasierte Kontoauszüge werden automatisch erkannt und dem richtigen Monat zugewiesen</p>
        <button class="btn btn-secondary" style="margin-top:14px" onclick="event.stopPropagation();triggerImport()">Dateien auswählen</button>
      </div>
      <div id="importLog" style="margin-top:12px;font-size:13px;color:var(--muted)"></div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Importierte Dokumente</h3>
        <span class="badge badge-muted">${imports.length} Gesamt</span>
      </div>
      ${imports.length ? monthsHtml : '<div class="empty-state"><div class="empty-icon">📂</div><p>Noch keine Dokumente importiert.</p></div>'}
    </div>
  </div>`;
}

async function deleteImport(id) {
  if (!await uiConfirm({ message: 'Diesen Import-Eintrag löschen? (Die importierten Buchungen bleiben erhalten)', title: 'Import-Eintrag löschen', icon: '🗑' })) return;
  state.imports = (state.imports||[]).filter(i => String(i.id) !== String(id));
  saveData();
  renderPage();
}

async function triggerImport() {
  if (!window.EA) return;
  const zielkonto = document.getElementById('import_zielkonto')?.value || defaultKontoId();
  const files = await window.EA.openFiles();
  if (!files || !files.length) return;
  if(el('importLog')) el('importLog').textContent = 'Lese Dateien…';
  let totalImported = 0;
  for (const f of files) {
    try {
      const res = await window.EA.readFile(f.path);
      let text = '';
      if (res.type === 'base64') {
        if (typeof pdfjsLib === 'undefined') { if(el('importLog')) el('importLog').textContent = 'PDF.js nicht geladen (Internetverbindung prüfen)'; continue; }
        const buf = Uint8Array.from(atob(res.data), c => c.charCodeAt(0));
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const ct = await page.getTextContent();
          text += ct.items.map(x => x.str).join(' ') + '\n';
        }
      } else { text = res.data; }
      const count = parseAndImport(text, zielkonto);
      totalImported += count;
      if(el('importLog')) el('importLog').textContent = `${f.name}: ${count} Buchungen importiert`;
    } catch(e) { if(el('importLog')) el('importLog').textContent = `Fehler bei ${f.name}: ${e.message}`; }
  }
  // Track this import
  if (!state.imports) state.imports = [];
  const _zk = kontoById(zielkonto);
  for (const f of files) {
    const detectedMonth = currentMonth;
    state.imports.push({
      id: uid(),
      filename: f.name,
      month: detectedMonth,
      date: today(),
      count: totalImported,
      size: f.size,
      kontoName: _zk ? _zk.name : ''
    });
  }
  if(el('importLog')) el('importLog').textContent = `✓ Fertig – ${totalImported} Buchungen importiert.`;
  saveData(); updateBadges(); renderPage();
}

function parseAndImport(text, zielkonto) {
  const kontoId = zielkonto || defaultKontoId();
  const lines = text.split('\n');
  let count = 0;
  const dateRe = /(\d{2})\.(\d{2})\.(\d{4})/;
  const amountRe = /([+-]?\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*$/;

  lines.forEach(line => {
    const dm = line.match(dateRe);
    const am = line.match(/(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*$/);
    if (!dm || !am) return;
    const date = `${dm[3]}-${dm[2]}-${dm[1]}`;
    const month = `${dm[3]}-${dm[2]}`;
    const amount = parseFloat(am[1].replace(/\./g,'').replace(',','.'));
    const desc = line.replace(dateRe,'').replace(am[0],'').trim().slice(0,80);
    if (!desc || Math.abs(amount) < 0.01) return;

    const cl = classify(desc, amount);
    if (!cl) return; // skip umbuchungen
    currentMonth = month;

    if (amount < 0 && ['Einkauf Lebensmittel','Einkauf Haushalt'].includes(cl.cat)) {
      state.einkaeufe.push({ id: uid(), month, date, store: desc, amount: Math.abs(amount) });
    } else if (amount < 0) {
      state.ausgaben.push({ id: uid(), month, date, desc, category: cl.cat, amount: Math.abs(amount), kontoId });
    } else if (cl.income) {
      const type = cl.cat === 'Gehalt' ? 'Gehalt' : cl.cat === 'Verkauf' ? 'Verkauf' : 'Sonstiges';
      state.einnahmen.push({ id: uid(), month, date, source: desc, type, amount, bar: false, kontoId });//MARKpdf
    }
    count++;
  });
  return count;
}

// ── QUICK ADD ─────────────────────────────────────────────────────────────
function openQuickAdd(forceTab) {
  if (!requireUnlocked()) return;
  const modal = el('quickAddModal');
  if (!modal) return;
  el('qa_date').value = today();
  el('qa_month').value = currentMonth;
  modal.classList.remove('hidden');
  // Auto-select tab based on current page
  const tabMap = {
    einkaeufe: 'einkauf',
    ausgaben: 'ausgabe',
    einnahmen: 'einnahme',
  };
  const autoTab = forceTab || tabMap[currentPage] || 'ausgabe';
  switchQuickTab(autoTab);
  setTimeout(() => { const a = el('qa_amount'); if(a) a.focus(); }, 100);
}

function closeQuickAdd() {
  const modal = el('quickAddModal');
  if (modal) { modal.classList.add('hidden'); }
}

function switchQuickTab(type) {
  quickAddType = type;
  // Remove supermarkt grid if switching away
  const oldGrid = document.getElementById('sm_grid');
  if (oldGrid) oldGrid.remove();
  // Reset category label column
  const catSel0 = el('qa_category');
  if (catSel0) {
    const catLabel0 = catSel0.closest('label') || catSel0.parentElement;
    if (catLabel0) catLabel0.style.gridColumn = '';
  }
  document.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', ['ausgabe','einkauf','einnahme','verkauf'][i] === type));

  const catSel = el('qa_category');
  if (type === 'ausgabe') {
    catSel.innerHTML = EXPENSE_CATS.map(c => `<option value="${c}">${c}</option>`).join('');
  } else if (type === 'einkauf') {
    catSel.innerHTML = EINKAUF_CATS.map(c => `<option value="${c}">${c}</option>`).join('');
  } else if (type === 'einnahme') {
    catSel.innerHTML = INCOME_TYPES.map(c => `<option value="${c}">${c}</option>`).join('');
  } else {
    const verkaufCats = ['Kleinanzeigen','eBay','Vinted','Sonstiges'];
    const seen = new Set(verkaufCats.map(c => c.toLowerCase()));
    getCustomCats('einnahme').forEach(c => { if (!seen.has(c.toLowerCase())) verkaufCats.push(c); });
    catSel.innerHTML = verkaufCats.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  el('qa_desc').placeholder = {
    ausgabe: 'Beschreibung…',
    einkauf: 'Optional: eigene Notiz zum Einkauf',
    einnahme: 'Quelle / Beschreibung…',
    verkauf: 'Was wurde verkauft?',
  }[type];
  // Show label change for einkauf
  const catLabel = document.querySelector('.field label, label.field');
  const catFieldEl = el('qa_category').closest('label') || el('qa_category').parentElement;
  if (type === 'einkauf') {
    const existing = document.getElementById('qa_cat_label');
    if (!existing && catFieldEl) {
      const span = document.createElement('span');
      span.textContent = 'SUPERMARKT / HÄNDLER';
    }
  }

  // Update category label for einkauf
  const catLabelEl = document.getElementById('qa_cat_label_text');
  if (catLabelEl) catLabelEl.textContent = type === 'einkauf' ? 'SUPERMARKT / HÄNDLER' : 'KATEGORIE';

  // Show/hide wiederkehrend option for einnahme
  const extraFields = el('qa_extra_fields');
  if (extraFields) {
    if (type === 'einnahme' || type === 'verkauf') {
      extraFields.innerHTML = '<label class="field" style="grid-column:1/-1">Häufigkeit' +
        '<select id="qa_freq" onchange="toggleWiederkehrendOptions()">' +
        '<option value="einmalig">💰 Einmalig – kommt nur einmal vor</option>' +
        '<option value="wiederkehrend">🔁 Wiederkehrend – kommt regelmäßig</option>' +
        '</select></label>' +
        '<div id="qa_wiederkehrend_opts" style="display:none;grid-column:1/-1">' +
        '<label class="field">Gültig ab <input type="month" id="qa_w_start" style="width:150px"/></label>' +
        '<label class="field">Gültig bis (leer = unbegrenzt) <input type="month" id="qa_w_end" placeholder="Kein Ende" /></label>' +
        '</div>';
      // Set default start month
      setTimeout(() => {
        const s = document.getElementById('qa_w_start');
        if (s) s.value = el('qa_month').value || currentMonth;
      }, 50);
    } else {
      extraFields.innerHTML = '';
    }
  }
}


// ── DUPLIKATERKENNUNG ───────────────────────────────────────────────────────
function checkDuplicate(collection, entry) {
  const arr = state[collection] || [];
  const descField = { einkaeufe:'store', ausgaben:'desc', einnahmen:'source', sparen:'note' }[collection];
  if (!descField) return null;
  return arr.find(x => {
    if (x.id === entry.id) return false;
    const sameAmount = Math.abs((+x.amount||0) - (+entry.amount||0)) < 0.005;
    const sameDate = (x.date||'') === (entry.date||'');
    const d1 = (x[descField]||'').toLowerCase().trim();
    const d2 = (entry[descField]||'').toLowerCase().trim();
    const sameDesc = d1 && d2 && d1 === d2;
    return sameAmount && sameDate && sameDesc;
  }) || null;
}

async function saveQuickAdd(andClose) {
  // Default to closing - safer behavior
  if (andClose === undefined) andClose = true;

  const saveBtn = document.getElementById('qa_save_btn');
  if (saveBtn && saveBtn.disabled) return; // prevent double-click
  if (saveBtn) saveBtn.disabled = true;

  try {
    const dateEl   = el('qa_date');
    const amountEl = el('qa_amount');
    const descEl   = el('qa_desc');
    const catEl    = el('qa_category');
    const monthEl  = el('qa_month');

    if (!dateEl || !amountEl || !descEl) {
      console.error('saveQuickAdd: required fields missing');
      uiAlert('Fehler: Formularfelder nicht gefunden.');
      return;
    }

    const date   = dateEl.value;
    const amount = Math.abs(parseFloat(amountEl.value) || 0);
    const desc   = (descEl.value || '').trim();
    const cat    = catEl ? catEl.value : '';
    const month  = monthEl ? monthEl.value : (date||'').slice(0,7);

    // Validation
    let valid = true;
    descEl.style.borderColor = '';
    amountEl.style.borderColor = '';
    dateEl.style.borderColor = '';
    if (!desc) { descEl.style.borderColor = 'var(--red)'; valid = false; }
    if (!amount) { amountEl.style.borderColor = 'var(--red)'; valid = false; }
    if (!date) { dateEl.style.borderColor = 'var(--red)'; valid = false; }
    if (!valid) {
      uiAlert('Bitte alle Pflichtfelder ausfüllen (Datum, Beschreibung, Betrag).');
      return;
    }

    const freq = document.getElementById('qa_freq');
    const isWiederkehrend = freq && freq.value === 'wiederkehrend';

    // Duplicate check
    const dupCollMap = { einkauf:'einkaeufe', ausgabe:'ausgaben', einnahme:'einnahmen', verkauf:'einnahmen' };
    const dupColl = dupCollMap[quickAddType];
    if (dupColl && !isWiederkehrend) {
      const descField = { einkaeufe:'store', ausgaben:'desc', einnahmen:'source' }[dupColl];
      const probe = { date, amount }; probe[descField] = desc;
      const dup = checkDuplicate(dupColl, probe);
      if (dup) {
        if (!await uiConfirm({ title: 'Möglicher Doppel-Eintrag', icon: '⚠',
          message: 'Möglicherweise ist dieser Eintrag bereits vorhanden:<br><br>' +
          (dup[descField]||'') + ' – ' + fmtEur(dup.amount) + ' am ' + (dup.date||'') +
          '<br><br>Trotzdem speichern?', okLabel: 'Trotzdem speichern', cancelLabel: 'Abbrechen' })) return;
      }
    }

    // Ensure collections exist
    state.einkaeufe = state.einkaeufe || [];
    state.ausgaben  = state.ausgaben  || [];
    state.einnahmen = state.einnahmen || [];
    state.regelEinnahmen = state.regelEinnahmen || [];

    // Save to correct collection
    let saved = null;
    if (quickAddType === 'einkauf') {
      saved = { id: uid(), month, date, store: desc, amount };
      state.einkaeufe.push(saved);
    } else if (quickAddType === 'ausgabe') {
      saved = { id: uid(), month, date, desc, category: cat || 'Sonstiges', amount, kontoId: defaultKontoId() };
      if (amount >= 100) { saved._kontoGefragt = true; _pendingAusgabeAsk = saved; }
      state.ausgaben.push(saved);
    } else if (quickAddType === 'einnahme' || quickAddType === 'verkauf') {
      if (isWiederkehrend) {
        const startM = (document.getElementById('qa_w_start') || {}).value || month;
        const endM   = (document.getElementById('qa_w_end')   || {}).value || '';
        saved = { id: uid(), source: desc, amount, type: cat||'Sonstiges', startMonth: startM, endMonth: endM, note: '' };
        state.regelEinnahmen.push(saved);
      } else {
        saved = { id: uid(), month, date, source: desc, type: quickAddType === 'verkauf' ? 'Verkauf' : (cat||'Sonstiges'), amount, bar: false, kontoId: defaultKontoId() };
        state.einnahmen.push(saved);
        _pendingBarAsk = saved;//MARKqa
      }
    } else {
      console.error('saveQuickAdd: unknown quickAddType', quickAddType);
      uiAlert('Fehler: Unbekannter Buchungstyp.');
      return;
    }

    if (month !== currentMonth) { currentMonth = month; buildMonthSelector(); }
    // Bar/Konto-Abfrage für gerade erstellte Einnahme (nach Render)
    if (_pendingBarAsk) { const _p = _pendingBarAsk; _pendingBarAsk = null; setTimeout(() => askEinnahmeKonto(_p), 50); }
    if (_pendingAusgabeAsk) { const _pa = _pendingAusgabeAsk; _pendingAusgabeAsk = null; setTimeout(() => askAusgabeKonto(_pa), 60); }
    saveData();
    updateBadges();
    renderPage();

    if (!andClose) {
      // Speichern & Weiter: keep modal open, clear fields
      amountEl.value = '';
      descEl.value = '';
      setTimeout(() => descEl.focus(), 50);
      showToast('Gespeichert · weiter geht\'s');
    } else {
      // Speichern: close modal
      closeQuickAdd();
      showToast('Eintrag gespeichert');
    }
  } catch(err) {
    console.error('saveQuickAdd error:', err);
    uiAlert('Eintrag konnte nicht gespeichert werden: ' + err.message);
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function saveQuickAddClose() { saveQuickAdd(true); } // legacy compat

// ── INIT ──────────────────────────────────────────────────────────────────
function buildJahresberichtHTML(year, userName, totals, rows) {
  const kpiBlock = [
    ['Gehalt gesamt', fmtEur(totals.gehalt), '#11845b'],
    ['Nebenjob gesamt', fmtEur(totals.nj), '#11845b'],
    ['Einnahmen gesamt', fmtEur(totals.gehalt + totals.nj), '#11845b'],
    ['Fixkosten gesamt', fmtEur(totals.fix), '#333'],
    ['Einkäufe gesamt', fmtEur(totals.eink), '#333'],
    ['Ausgaben gesamt', fmtEur(totals.ausg), '#b42318'],
    ['Cashflow gesamt', fmtEur(totals.cf), totals.cf >= 0 ? '#11845b' : '#b42318'],
  ].map(([label, val, color]) =>
    '<div class="kpi"><div class="kpi-label">' + label + '</div>' +
    '<div class="kpi-val" style="color:' + color + '">' + val + '</div></div>'
  ).join('');

  const rowsHtml = rows.map(function(item, i) {
    const m = item.m, f = item.f, inc = item.inc;
    const bg = i % 2 ? '#fafafa' : '#fff';
    return '<tr style="background:' + bg + '">' +
      '<td>' + monthLabel(m) + '</td>' +
      '<td>' + fmtEur(inc.gehalt || 0) + '</td>' +
      '<td>' + fmtEur(inc.nebenjob || 0) + '</td>' +
      '<td>' + fmtEur(f.fixTotal) + '</td>' +
      '<td>' + fmtEur(f.einkTotal) + '</td>' +
      '<td style="color:#b42318">' + fmtEur(f.ausgTotal) + '</td>' +
      '<td style="color:' + (f.cashflow >= 0 ? '#11845b' : '#b42318') + ';font-weight:600">' + fmtEur(f.cashflow) + '</td>' +
      '</tr>';
  }).join('');

  const totalRow = '<tr style="background:#f0f5f3;font-weight:700;border-top:2px solid #1a1916">' +
    '<td>Gesamt ' + year + '</td>' +
    '<td>' + fmtEur(totals.gehalt) + '</td>' +
    '<td>' + fmtEur(totals.nj) + '</td>' +
    '<td>' + fmtEur(totals.fix) + '</td>' +
    '<td>' + fmtEur(totals.eink) + '</td>' +
    '<td style="color:#b42318">' + fmtEur(totals.ausg) + '</td>' +
    '<td style="color:' + (totals.cf >= 0 ? '#11845b' : '#b42318') + '">' + fmtEur(totals.cf) + '</td>' +
    '</tr>';

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    '*{box-sizing:border-box;margin:0;padding:0}' +
    'body{font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#1a1916;padding:12mm}' +
    'h1{font-size:20px;font-weight:700;margin-bottom:4px}' +
    '.sub{color:#666;font-size:11px;margin-bottom:16px}' +
    '.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px}' +
    '.kpi{background:#f5f5f5;border-radius:6px;padding:12px 14px}' +
    '.kpi-label{font-size:9px;color:#666;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}' +
    '.kpi-val{font-size:18px;font-weight:700}' +
    'h2{font-size:13px;font-weight:700;margin:16px 0 8px;padding-bottom:4px;border-bottom:2px solid #1a1916}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{background:#1a1916;color:#fff;padding:6px 8px;text-align:right;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}' +
    'th:first-child{text-align:left}' +
    'td{padding:5px 8px;border-bottom:1px solid #eee;font-size:10px;text-align:right}' +
    'td:first-child{text-align:left}' +
    '.footer{margin-top:20px;padding-top:10px;border-top:1px solid #ddd;font-size:9px;color:#999;text-align:center}' +
    '</style></head><body>' +
    '<h1>Jahresbericht ' + year + '</h1>' +
    '<div class="sub">' + userName + ' &middot; Erstellt am ' + new Date().toLocaleDateString('de-DE') +
    ' &middot; Startgeld: ' + fmtEur(state.meta.startgeld || 0) + ' &euro;</div>' +
    '<div class="kpis">' + kpiBlock + '</div>' +
    '<h2>Monat&uuml;bersicht ' + year + '</h2>' +
    '<table><thead><tr>' +
    '<th>Monat</th><th>Gehalt</th><th>Nebenjob</th><th>Fixkosten</th><th>Eink&auml;ufe</th><th>Ausgaben</th><th>Cashflow</th>' +
    '</tr></thead><tbody>' + rowsHtml + totalRow + '</tbody></table>' +
    '<div class="footer">Finanzverwaltung Pro &middot; ' + userName + ' &middot; ' + year + '</div>' +
    '</body></html>';
}

async function archiveYear() {
  const year = getSelectedYear();
  if (!await uiConfirm({ message: `Jahr ${year} archivieren und als PDF speichern?`, title: 'Jahr archivieren', icon: '📦' })) return;

  // ── PDF Jahresbericht erstellen ────────────────────────────────────────
  const rows = allMonths2026.map(m => {
    const f = monthFinancials(m);
    const inc = state.incomeByMonth[m] || {};
    return { m, f, inc };
  });
  const totals = rows.reduce((acc,{f,inc}) => {
    acc.gehalt += inc.gehalt||0; acc.nj += inc.nebenjob||0;
    acc.fix += f.fixTotal; acc.eink += f.einkTotal;
    acc.ausg += f.ausgTotal; acc.cf += f.cashflow;
    return acc;
  }, {gehalt:0,nj:0,fix:0,eink:0,ausg:0,cf:0});

  // ── A4 PDF via Electron printToPDF ──────────────────────────────────
  const userName = state.meta.userName || 'Nutzer';
  const pdfHtml = buildJahresberichtHTML(year, userName, totals, rows);

    if (window.EA && window.EA.printToPdf) {
    await window.EA.printToPdf({ html: pdfHtml, filename: 'Jahresbericht_' + year + '.pdf' });
  }

  // ── JSON Backup ────────────────────────────────────────────────────────
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `Finanzverwaltung_${year}_Backup.json`; a.click();
  URL.revokeObjectURL(url);

  // ── Neues Jahr starten ─────────────────────────────────────────────────
  const newYear = year + 1;
  const lastCF = monthFinancials(`${year}-12`).cashflow;
  const newStart = Math.round(((state.meta.startgeld||0) + lastCF) * 100) / 100;
  if (await uiConfirm({ title: 'Jahr abschließen', icon: '📦', message: `Jahresbericht wird gedruckt + Backup gespeichert!<br><br>Jetzt ${newYear} starten?<br>Startgeld: ${fmtEur(newStart)}`, okLabel: `${newYear} starten`, cancelLabel: 'Abbrechen' })) {
    const fresh = JSON.parse(JSON.stringify(DEFAULT_DATA));
    fresh.meta = { ...state.meta, year: newYear, startgeld: newStart };
    const newIncome = {};
    Object.keys(fresh.incomeByMonth).forEach(k => {
      newIncome[k.replace('2026', String(newYear))] = fresh.incomeByMonth[k];
    });
    fresh.incomeByMonth = newIncome;
    fresh.fixkosten = DEFAULT_DATA.fixkosten.map(f => ({
      ...f,
      start: f.start.replace('2026', String(newYear)),
      end: f.end.replace('2026', String(newYear))
    }));
    Object.assign(state, fresh);
    state.einkaeufe = []; state.ausgaben = []; state.einnahmen = [];
    state.spesen = []; state.sparen = []; state.zaehler = [];
    allMonths2026.splice(0, allMonths2026.length, ...monthsBetween(`${newYear}-01`, `${newYear}-12`));
    currentMonth = `${newYear}-01`;
    saveData(); buildMonthSelector(); navigate('dashboard');
    uiAlert(`✓ Jahr ${newYear} gestartet! Viel Erfolg!`);
  }
}

// ── ONBOARDING: Nutzungsbedingungen + Spotlight-Tour ────────────────────────
// ▼▼▼ NUTZUNGSBEDINGUNGEN ▼▼▼
// Unterstützt: Absätze (Leerzeile trennt), Aufzählung (Zeile beginnt mit "- "),
// Überschrift (Zeile beginnt mit "# ").
// Wird die Version erhöht, muss der Nutzer die Bedingungen erneut bestätigen.
const NUTZUNGSBEDINGUNGEN_VERSION = 2;
const NUTZUNGSBEDINGUNGEN = `# Willkommen bei Finanzverwaltung Pro
Bitte lies die folgenden Hinweise sorgfältig durch, bevor du die App nutzt.

# Zweck der App
Finanzverwaltung Pro dient der privaten Verwaltung und Übersicht deiner Finanzen. Die App unterstützt dich dabei, Einnahmen, Ausgaben, Budgets, Kontostände und finanzielle Entwicklungen besser nachzuvollziehen. Sie dient ausschließlich der persönlichen Orientierung.

# Keine Anlage-, Steuer- oder Rechtsberatung
Finanzverwaltung Pro stellt keine Anlageberatung, Steuerberatung, Rechtsberatung oder sonstige verbindliche Beratung dar. Alle Auswertungen, Übersichten, Budgets, Prognosen und Berechnungen basieren auf den von dir eingegebenen Daten und dienen ausschließlich der privaten Information. Sie stellen keine Empfehlung dar, bestimmte Finanzprodukte zu kaufen oder zu verkaufen, Verträge abzuschließen oder konkrete finanzielle Entscheidungen zu treffen.

# Keine Gewähr
Alle Berechnungen und Auswertungen erfolgen nach bestem Wissen, jedoch ohne Gewähr auf Richtigkeit, Vollständigkeit oder Aktualität. Die Verantwortung für die eingegebenen Daten sowie deren Nutzung liegt vollständig bei dir.

# Datenschutz und lokale Speicherung
Deine Daten werden lokal auf deinem Gerät gespeichert. Es erfolgt keine automatische Übertragung deiner Finanzdaten an Dritte, keine Cloud-Synchronisierung und keine serverseitige Verarbeitung durch Finanzverwaltung Pro. Bitte beachte, dass du selbst für den Schutz deines Geräts und deiner gespeicherten Daten verantwortlich bist.

# Datensicherung und Geräteschutz
Da deine Daten lokal gespeichert werden, bist du selbst für regelmäßige Sicherungen verantwortlich. Bitte erstelle bei Bedarf Backups und stelle sicher, dass dein Gerät ausreichend geschützt ist, zum Beispiel durch ein sicheres Benutzerkonto, Passwort, Virenschutz und regelmäßige Systemupdates.

# Import und Export von Daten
Sofern du Daten importierst oder exportierst, bist du selbst dafür verantwortlich, die Richtigkeit der Daten zu prüfen und exportierte Dateien sicher aufzubewahren.

# Verfügbarkeit und Änderungen
Es wird keine Garantie übernommen, dass die App jederzeit fehlerfrei, vollständig oder dauerhaft verfügbar ist. Funktionen können im Rahmen von Updates geändert, erweitert oder entfernt werden.

# Nutzung auf eigenes Risiko
Die Nutzung von Finanzverwaltung Pro erfolgt auf eigenes Risiko. Für finanzielle Entscheidungen, fehlerhafte Eingaben, unvollständige Daten, Datenverluste oder sonstige Schäden, die durch die Nutzung der App entstehen, wird keine Haftung übernommen.

Mit der Nutzung der App bestätigst du, dass du diese Hinweise gelesen und verstanden hast.

Stand: Juli 2026`;
// ▲▲▲ ENDE NUTZUNGSBEDINGUNGEN ▲▲▲

function termsToHtml(txt) {
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const blocks = txt.split('\n');
  let html = '', inList = false;
  for (let line of blocks) {
    line = line.replace(/\r/g,'');
    const t = line.trim();
    if (/^-\s+/.test(t)) {
      if (!inList) { html += '<ul style="margin:6px 0 10px 18px;padding:0">'; inList = true; }
      html += '<li style="margin:4px 0">' + esc(t.replace(/^-\s+/,'')) + '</li>';
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    if (!t) continue;
    if (/^#\s/.test(t)) {
      html += '<div style="font-weight:700;font-size:15px;color:var(--text);margin:16px 0 6px">' + esc(t.replace(/^#\s/,'')) + '</div>';
    } else {
      html += '<p style="margin:6px 0;color:var(--muted-text);line-height:1.6">' + esc(t) + '</p>';
    }
  }
  if (inList) html += '</ul>';
  return html;
}

function showTermsModal(onAccept, viewOnly) {
  // viewOnly: nur ansehen (aus Einstellungen) – ändert den bestätigten Status NICHT.
  // Wird nichts übergeben, aber Bedingungen sind schon in aktueller Version akzeptiert,
  // automatisch als "nur ansehen" behandeln.
  if (viewOnly === undefined && typeof onAccept !== 'function') viewOnly = true;
  if (viewOnly === undefined && termsAcceptedCurrent() && typeof onAccept === 'function') {
    // aus Einstellungen mit leerem Callback -> ansehen
    viewOnly = true;
  }
  const overlay = document.createElement('div');
  overlay.id = 'termsOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:linear-gradient(135deg,var(--accent) 0%,#1a1916 100%);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';
  const footer = viewOnly
    ? `<div style="padding:16px 26px;border-top:1px solid var(--border);background:var(--surface);display:flex;justify-content:flex-end">
         <button class="btn btn-primary" onclick="document.getElementById('termsOverlay')?.remove()" style="padding:12px 24px">Schließen</button>
       </div>`
    : `<div style="padding:16px 26px;border-top:1px solid var(--border);background:var(--surface)">
        <label id="termsCheckWrap" style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--muted-text);opacity:.5;cursor:not-allowed;margin-bottom:12px">
          <input type="checkbox" id="termsCheck" disabled style="width:18px;height:18px;accent-color:var(--accent)" />
          <span id="termsCheckLabel">Bitte scrolle bis zum Ende, um zu bestätigen</span>
        </label>
        <button id="termsAcceptBtn" disabled onclick="_acceptTerms()"
          style="width:100%;padding:14px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:not-allowed;opacity:.5;font-family:inherit">
          Akzeptieren und fortfahren
        </button>
      </div>`;
  overlay.innerHTML = `
    <div style="background:var(--paper);border-radius:16px;width:min(560px,94vw);max-height:88vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.4);overflow:hidden">
      <div style="padding:20px 26px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px">
        <span style="font-size:26px">📋</span>
        <h2 style="margin:0;font-size:18px;font-weight:700;color:var(--text)">Nutzungsbedingungen</h2>
      </div>
      <div id="termsScroll" style="padding:20px 26px;overflow-y:auto;flex:1;font-size:13px">${termsToHtml(NUTZUNGSBEDINGUNGEN)}</div>
      ${footer}
    </div>`;
  document.body.appendChild(overlay);
  _termsAcceptCb = onAccept;
  if (viewOnly) return; // keine Scroll-/Checkbox-Logik nötig

  const scroll = overlay.querySelector('#termsScroll');
  const check = overlay.querySelector('#termsCheck');
  const wrap = overlay.querySelector('#termsCheckWrap');
  const label = overlay.querySelector('#termsCheckLabel');
  const btn = overlay.querySelector('#termsAcceptBtn');

  function enableCheckbox() {
    check.disabled = false;
    wrap.style.opacity = '1';
    wrap.style.cursor = 'pointer';
    label.textContent = 'Ich habe die Nutzungsbedingungen gelesen und akzeptiere sie';
  }
  // Scroll-Ende erkennen (oder wenn Text kurz genug ist, direkt freigeben)
  function checkScrolled() {
    if (scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 8) enableCheckbox();
  }
  scroll.addEventListener('scroll', checkScrolled);
  setTimeout(checkScrolled, 100); // falls kein Scrollbalken nötig

  check.addEventListener('change', () => {
    const on = check.checked;
    btn.disabled = !on;
    btn.style.cursor = on ? 'pointer' : 'not-allowed';
    btn.style.opacity = on ? '1' : '.5';
  });
}
let _termsAcceptCb = null;
function _acceptTerms() {
  state.meta = state.meta || {};
  state.meta.termsAccepted = true;
  state.meta.termsAcceptedAt = new Date().toISOString();
  state.meta.termsAcceptedVersion = NUTZUNGSBEDINGUNGEN_VERSION;
  saveData();
  const o = document.getElementById('termsOverlay');
  if (o) o.remove();
  const cb = _termsAcceptCb; _termsAcceptCb = null;
  if (typeof cb === 'function') cb();
}

// Sind die Bedingungen in der AKTUELLEN Version bestätigt?
function termsAcceptedCurrent() {
  return !!state.meta && state.meta.termsAccepted === true
    && (state.meta.termsAcceptedVersion || 1) >= NUTZUNGSBEDINGUNGEN_VERSION;
}

// ── SPOTLIGHT-TOUR ──────────────────────────────────────────────────────────
const TOUR_STEPS = [
  { sel: null, title: 'Willkommen! 👋', text: 'Ich zeige dir in wenigen Schritten, wo du was findest. Du kannst die Tour jederzeit über „Überspringen" beenden.' },
  { nav: 'dashboard', title: '📊 Dashboard', text: 'Dein Überblick: Cashflow pro Konto, Sparfortschritt und die wichtigsten Zahlen des Monats.' },
  { nav: 'einkaeufe', title: '🛒 Einkäufe & Ausgaben', text: 'Hier erfasst du alltägliche Ausgaben – schnell, kategorisiert und einem Konto zugeordnet.' },
  { nav: 'einnahmen', title: '💰 Einnahmen', text: 'Gehalt, Nebenjob und einmalige Einnahmen trägst du hier ein.' },
  { nav: 'fixkosten', title: '🔁 Fixkosten', text: 'Wiederkehrende Kosten mit Rhythmus (monatlich, quartalsweise …) und optionaler Sparplan-Verknüpfung.' },
  { nav: 'sparen', title: '🏦 Sparen & Depot', text: 'Sparpläne und dein Wertpapierdepot mit aktuellen Kursen.' },
  { nav: 'umbuchungen', title: '🔄 Umbuchungen', text: 'Verschiebe Geld zwischen deinen Konten, ohne dass es als Ausgabe zählt.' },
  { nav: 'suche', title: '🔍 Suche', text: 'Finde jede Buchung über alle Monate und Typen hinweg.' },
  { nav: 'einstellungen', title: '⚙️ Einstellungen', text: 'Konten, Sparziel, Erinnerungen, Backups und Updates – alles zentral hier. Die Tour kannst du hier später erneut starten.' },
  { sel: null, title: 'Fertig! 🎉', text: 'Das war der Rundgang. Leg einfach los – und wenn du etwas suchst, schau in die Einstellungen. Viel Erfolg!' },
];
let _tourIndex = 0;

function startTour() {
  _tourIndex = 0;
  renderTourStep();
}
function endTour() {
  document.getElementById('tourOverlay')?.remove();
  document.getElementById('tourSpot')?.remove();
  state.meta.tourDone = true;
  saveData();
}
function tourNext() { _tourIndex++; if (_tourIndex >= TOUR_STEPS.length) { endTour(); return; } renderTourStep(); }
function tourPrev() { if (_tourIndex > 0) { _tourIndex--; renderTourStep(); } }

function renderTourStep() {
  const step = TOUR_STEPS[_tourIndex];
  if (!step) { endTour(); return; }
  // Zielelement finden (robust: fehlt es, wird ohne Highlight zentriert gezeigt)
  let target = null;
  if (step.nav) {
    target = document.querySelector(`.nav-item[onclick*="navigate('${step.nav}')"]`);
    if (target) { try { navigate(step.nav); } catch {} }
  }
  // Overlay (abdunkeln)
  let overlay = document.getElementById('tourOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'tourOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10001;transition:.2s';
    document.body.appendChild(overlay);
  }
  let spot = document.getElementById('tourSpot');
  if (spot) spot.remove();

  // Sprechblase
  const total = TOUR_STEPS.length;
  const isFirst = _tourIndex === 0;
  const isLast = _tourIndex === total - 1;
  const bubble = document.createElement('div');
  bubble.id = 'tourSpot';
  bubble.style.cssText = 'position:fixed;z-index:10002;background:var(--paper);border-radius:14px;padding:18px 20px;width:min(340px,86vw);box-shadow:0 20px 50px rgba(0,0,0,.45)';

  bubble.innerHTML = `
    <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:6px">${step.title}</div>
    <div style="font-size:13px;color:var(--muted-text);line-height:1.55;margin-bottom:14px">${step.text}</div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
      <span style="font-size:12px;color:var(--muted-text)">${_tourIndex+1} / ${total}</span>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="endTour()">Überspringen</button>
        ${!isFirst ? '<button class="btn btn-ghost btn-sm" onclick="tourPrev()">Zurück</button>' : ''}
        <button class="btn btn-primary btn-sm" onclick="tourNext()">${isLast ? 'Fertig' : 'Weiter'}</button>
      </div>
    </div>`;
  document.body.appendChild(bubble);

  // Position: neben dem Zielelement, sonst zentriert
  if (target) {
    const r = target.getBoundingClientRect();
    // Highlight-Rahmen um das Element
    const hl = document.createElement('div');
    hl.id = 'tourHl';
    document.getElementById('tourHl')?.remove();
    hl.style.cssText = `position:fixed;z-index:10001;left:${r.left-4}px;top:${r.top-4}px;width:${r.width+8}px;height:${r.height+8}px;border:2px solid var(--accent);border-radius:8px;box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 30%,transparent);pointer-events:none;transition:.2s`;
    overlay.appendChild(hl);
    // Bubble rechts neben die Sidebar
    let left = r.right + 16;
    let top = Math.max(12, Math.min(r.top, window.innerHeight - 200));
    if (left + 340 > window.innerWidth) left = Math.max(12, r.left - 356);
    bubble.style.left = left + 'px';
    bubble.style.top = top + 'px';
  } else {
    bubble.style.left = '50%';
    bubble.style.top = '50%';
    bubble.style.transform = 'translate(-50%,-50%)';
  }
}

function showSetupScreen() {  const overlay = document.getElementById('setupOverlay');
  if (overlay) { overlay.style.display = 'flex'; return; }

  const div = document.createElement('div');
  div.id = 'setupOverlay';
  div.style.cssText = 'position:fixed;inset:0;background:linear-gradient(135deg,var(--accent) 0%,#1a1916 100%);z-index:9999;display:flex;align-items:center;justify-content:center;';
  div.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:40px;width:min(480px,90vw);box-shadow:0 24px 60px rgba(0,0,0,.35)">
      <div style="text-align:center;margin-bottom:28px">
        <div style="font-size:48px;margin-bottom:12px">💼</div>
        <h1 style="font-size:24px;font-weight:700;color:#1a1916;margin-bottom:6px">Willkommen!</h1>
        <p style="font-size:14px;color:#64716d">Richte deine persönliche Finanzverwaltung ein.</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px">
        <label style="display:flex;flex-direction:column;gap:6px;font-size:11px;font-weight:700;color:#64716d;text-transform:uppercase;letter-spacing:.08em">
          Dein Name
          <input id="setup_name" type="text" placeholder="Dein Name"
            style="padding:12px 14px;border:2px solid #dfe8e4;border-radius:8px;font-size:15px;font-family:inherit;outline:none;transition:border .15s"
            onfocus="this.style.borderColor='#0f766e'" onblur="this.style.borderColor='#dfe8e4'" />
        </label>
        <label style="display:flex;flex-direction:column;gap:6px;font-size:11px;font-weight:700;color:#64716d;text-transform:uppercase;letter-spacing:.08em">
          Aktuelles Jahr
          <select id="setup_year"
            style="padding:12px 14px;border:2px solid #dfe8e4;border-radius:8px;font-size:15px;font-family:inherit;outline:none;background:#fff">
            ${[2024,2025,2026,2027,2028].map(y => '<option value="'+y+'" '+(y===new Date().getFullYear()?'selected':'')+'>'+y+'</option>').join('')}
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:6px;font-size:11px;font-weight:700;color:#64716d;text-transform:uppercase;letter-spacing:.08em">
          Startgeld / Kontostand zu Jahresbeginn (${currencySymbol()})
          <input id="setup_startgeld" type="number" placeholder="0,00" step="0.01" value="0"
            style="padding:12px 14px;border:2px solid #dfe8e4;border-radius:8px;font-size:15px;font-family:inherit;outline:none;text-align:right"
            onfocus="this.style.borderColor='#0f766e'" onblur="this.style.borderColor='#dfe8e4'" />
        </label>
      </div>
      <button onclick="completeSetup()"
        style="margin-top:24px;width:100%;padding:14px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;transition:opacity .15s"
        onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
        Loslegen →
      </button>
    </div>`;
  document.body.appendChild(div);
  setTimeout(() => { const n = document.getElementById('setup_name'); if(n) n.focus(); }, 100);
}

function completeSetup() {
  const name = (document.getElementById('setup_name').value || '').trim();
  const year = +(document.getElementById('setup_year').value) || new Date().getFullYear();
  const startgeld = +(document.getElementById('setup_startgeld').value) || 0;

  if (!name) {
    const inp = document.getElementById('setup_name');
    inp.style.borderColor = '#b42318';
    inp.placeholder = 'Bitte Namen eingeben!';
    inp.focus();
    return;
  }

  state.meta.userName = name;
  state.meta.year = year;
  state.meta.startgeld = startgeld;
  state.meta.setupDone = true;

  // Update displayed name
  const un = document.getElementById('userName');
  if (un) un.textContent = name;

  // Update months for selected year
  const yr = String(year);
  if (yr !== '2026') {
    const newIncome = {};
    Object.keys(state.incomeByMonth).forEach(k => {
      newIncome[k.replace('2026', yr)] = state.incomeByMonth[k];
    });
    state.incomeByMonth = newIncome;
    state.fixkosten = state.fixkosten.map(f => ({
      ...f,
      start: f.start.replace('2026', yr),
      end: f.end.replace('2026', yr)
    }));
    allMonths2026.splice(0, allMonths2026.length, ...monthsBetween(yr+'-01', yr+'-12'));
    currentMonth = yr + '-01';
  }

  saveData();

  // Remove overlay
  const overlay = document.getElementById('setupOverlay');
  if (overlay) overlay.remove();

  buildMonthSelector();
  navigate('dashboard');
  // Nach dem Setup: Spotlight-Tour starten (nur wenn noch nicht gesehen).
  if (!state.meta.tourDone) {
    setTimeout(() => startTour(), 400);
  } else if (state.config?.showStartupModal !== false) {
    openQuickAdd();
  }
}

async function editUserName() {
  const current = state.meta.userName || 'Nutzer';
  const name = await uiPrompt({ title: 'Name ändern', message: 'Wie möchtest du angezeigt werden?', value: current, placeholder: 'Dein Name' });
  if (name && name.trim()) {
    state.meta.userName = name.trim();
    const el2 = document.getElementById('userName');
    if (el2) el2.textContent = name.trim();
    saveData();
  }
}

async function createDesktopShortcut() {
  if (!window.EA || !window.EA.createShortcut) { uiAlert('Nur in der Desktop-App verfügbar'); return; }
  const r = await window.EA.createShortcut();
  if (r.ok) uiAlert('✓ Verknüpfung wurde auf dem Desktop erstellt!\nDatei: ' + r.path);
  else uiAlert('Fehler: ' + r.error);
}


// QR Code für Einstellungen
// ── ETF LIVE DATEN ─────────────────────────────────────────────────────────
async function fetchEtfKurs(ticker) {
  if (!ticker) return { fehler: 'Kein Ticker angegeben' };
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker) + '?interval=1d&range=2d';
    // Try direct first (works in Electron), then proxy
    let data = null;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      data = await res.json();
    } catch {
      const proxy = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
      const res2 = await fetch(proxy, { signal: AbortSignal.timeout(8000) });
      data = await res2.json();
    }
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta || !meta.regularMarketPrice) return { fehler: 'ETF nicht gefunden (' + ticker + ')' };
    return {
      kurs:         +meta.regularMarketPrice.toFixed(4),
      vortag:       +(meta.chartPreviousClose || meta.previousClose || 0).toFixed(4),
      waehrung:     meta.currency || 'EUR',
      name:         meta.shortName || meta.longName || ticker,
      aktualisiert: new Date().toLocaleString('de-DE'),
      ticker:       ticker,
    };
  } catch(e) {
    if (e.name === 'AbortError' || e.name === 'TimeoutError') return { fehler: 'Zeitüberschreitung – keine Verbindung' };
    return { fehler: 'Fehler: ' + e.message };
  }
}

async function refreshEtfKurse() {
  const etfBtn = document.getElementById('etf_refresh_btn');
  if (etfBtn) { etfBtn.textContent = '⏳ Lädt…'; etfBtn.disabled = true; }
  if (!state.etfKurse) state.etfKurse = {};
  const tickers = [...new Set((state.sparen||[]).filter(s=>s.etf&&s.etf.ticker).map(s=>s.etf.ticker))];
  if (!tickers.length) { showToast('Kein ETF mit Ticker gefunden', 'info'); if(etfBtn){etfBtn.textContent='🔄 Kurse laden';etfBtn.disabled=false;} return; }
  let loaded = 0, errors = 0;
  for (const ticker of tickers) {
    const data = await fetchEtfKurs(ticker);
    if (data && !data.fehler) { state.etfKurse[ticker] = data; loaded++; }
    else { state.etfKurse[ticker] = data || { fehler: 'Unbekannter Fehler' }; errors++; }
  }
  saveData();
  renderPage();
  if (etfBtn) { etfBtn.textContent = '🔄 Kurse laden'; etfBtn.disabled = false; }
  if (errors === 0) showToast(loaded + ' ETF-Kurs' + (loaded>1?'e':'') + ' geladen');
  else showToast(loaded + ' geladen, ' + errors + ' Fehler', errors>0&&loaded===0?'error':'info');
}

function getEtfKursInfo(s) {
  if (!s.etf || !s.etf.ticker || !state.etfKurse) return null;
  return state.etfKurse[s.etf.ticker] || null;
}

// ── GLOBAL EXPORTS für onclick Handler in dynamisch gerenderten Tabellen ──
window.navigate          = navigate;
window.updateSuche       = updateSuche;
window.resetSuche        = resetSuche;
window.openQuickAdd      = openQuickAdd;
window.closeQuickAdd     = closeQuickAdd;
window.saveQuickAdd      = saveQuickAdd;
window.saveQuickAddClose = saveQuickAddClose;
window.switchQuickTab    = switchQuickTab;
window.onMonthChange     = onMonthChange;
window.showSetupScreen       = showSetupScreen;
window.completeSetup         = completeSetup;
window.editUserName          = editUserName;
window.updateSetting         = updateSetting;
window.addKonto          = addKonto;
window.setKontoIstStand  = setKontoIstStand;
window.zeigeSaldoDiagnose = zeigeSaldoDiagnose;
window.resetKontoKorrekturen = resetKontoKorrekturen;
window.updateKonto       = updateKonto;
window.deleteKonto       = deleteKonto;
window.clearAllData          = clearAllData;
window.resetApp              = resetApp;
window.updateConfig          = updateConfig;
window.toggleConfig          = toggleConfig;
window.updateSparzielSumme   = updateSparzielSumme;
window.openUpdateManager     = openUpdateManager;
window.addReminder           = addReminder;
window.updateReminder        = updateReminder;
window.deleteReminder        = deleteReminder;
window.reminderDone          = reminderDone;
window.reminderSnooze        = reminderSnooze;
window.openCalc              = openCalc;
window.calcPress             = calcPress;
window.calcApply             = calcApply;
window.closeCalc             = closeCalc;
window._acceptTerms          = _acceptTerms;
window.showTermsModal        = showTermsModal;
window.startTour             = startTour;
window.endTour               = endTour;
window.tourNext              = tourNext;
window.tourPrev              = tourPrev;
window.showWhatsNewModal     = showWhatsNewModal;
window.uiConfirm = uiConfirm;
window.uiAlert = uiAlert;
window.uiPrompt = uiPrompt;
window.showToast             = showToast;
window.applyTheme            = applyTheme;
window.applyAccent           = applyAccent;
window.addCustomCatByGroup    = addCustomCatByGroup;
window.removeCustomCatByGroup = removeCustomCatByGroup;
window.addCustomCat          = addCustomCat;
window.removeCustomCat          = removeCustomCat;
window.removeCustomCatByIndex   = removeCustomCatByIndex;
window.clearSingle           = clearSingle;
window.restoreFromTrash      = restoreFromTrash;
window.deleteFromTrashForever = deleteFromTrashForever;
window.emptyTrash            = emptyTrash;
window.onToggleAutoBackup    = onToggleAutoBackup;
window.selectBackupPath      = selectBackupPath;
window.openBackupFolder      = openBackupFolder;
window.doGlobalSearch        = doGlobalSearch;
window.restartSetup          = restartSetup;
window.openDataFolder        = openDataFolder;
window.exportBackup          = exportBackup;
window.exportCSV             = exportCSV;
window.exportJSON            = exportJSON;
window.importBackup          = importBackup;
window.createDesktopShortcut = createDesktopShortcut;
window.archiveYear       = archiveYear;

// Einkäufe
window.addEinkauf           = addEinkauf;
window.updateEinkaufStore   = updateEinkaufStore;
window.updateEinkauf     = updateEinkauf;
window.deleteEinkauf     = deleteEinkauf;
window.pickEinkaufKonto  = pickEinkaufKonto;

// Ausgaben
window.addAusgabe        = addAusgabe;
window.updateAusgabe     = updateAusgabe;
window.deleteAusgabe     = deleteAusgabe;
window.pickEinnahmeKonto = pickEinnahmeKonto;
window.pickFixkZielkonto = pickFixkZielkonto;
window.pickFixkKonto = pickFixkKonto;
window.pickRegelEinnahmeKonto = pickRegelEinnahmeKonto;
window.pickAusgabeKonto  = pickAusgabeKonto;

// Einnahmen
window.addEinnahme       = addEinnahme;
window.updateEinnahme    = updateEinnahme;
window.deleteEinnahme    = deleteEinnahme;
window.toggleEinnahmeBar     = toggleEinnahmeBar;
window.updateFixedIncome = updateFixedIncome;
window.updateIncomeKonto = updateIncomeKonto;

// Spesen
window.addSpese          = addSpese;
window.openSpeseModal    = openSpeseModal;
window.closeSpeseModal   = closeSpeseModal;
window.saveSpeseModal    = saveSpeseModal;
window.updateSpese       = updateSpese;
window.updateSpeseDate   = updateSpeseDate;
window.updateSpeseCountry= updateSpeseCountry;
window.deleteSpese       = deleteSpese;
window.pickSpeseKonto    = pickSpeseKonto;
window.recalcSpeseRow    = recalcSpeseRow;

// Fixkosten
window.addFixkosten         = addFixkosten;
window.setFixkostenFilter   = setFixkostenFilter;
window.openFixkostenModal   = openFixkostenModal;
window.closeFixkostenModal  = closeFixkostenModal;
window.saveFixkostenModal   = saveFixkostenModal;
window.updateFixk        = updateFixk;
window.deleteFixk        = deleteFixk;

// Sparen
window.addSparen                = addSparen;
window.editEtfTicker           = editEtfTicker;
window.openSparenModal          = openSparenModal;
window.closeSparenModal         = closeSparenModal;
window.saveSparenModal          = saveSparenModal;
window.onSparKatChange          = onSparKatChange;
window.onSparAnbieterChange     = onSparAnbieterChange;
window.onEtfChange              = onEtfChange;
window.refreshEtfKurse          = refreshEtfKurse;
window.updateSparen             = updateSparen;
window.deleteSpar               = deleteSpar;
window.umbuchungen              = umbuchungen;
window.addUmbuchung             = addUmbuchung;
window.updateUmbuchung          = updateUmbuchung;
window.deleteUmbuchung          = deleteUmbuchung;

// Zähler
window.addZaehler                = addZaehler;
window.openFinanzproduktModal   = openFinanzproduktModal;
window.closeFinanzproduktModal  = closeFinanzproduktModal;
window.saveFinanzproduktModal   = saveFinanzproduktModal;
window.onFpTypChange            = onFpTypChange;
window.deleteFinanzprodukt      = deleteFinanzprodukt;
window.openZaehlerModal          = openZaehlerModal;
window.closeZaehlerModal         = closeZaehlerModal;
window.saveZaehlerModal          = saveZaehlerModal;
window.updateZaehlerModalEinheit = updateZaehlerModalEinheit;
window.onZmEinheitChange         = onZmEinheitChange;
window.updateZaehlerEinheit      = updateZaehlerEinheit;
window.updateZaehler             = updateZaehler;
window.deleteZaehler             = deleteZaehler;

// Eigene Tabellen
window.addTab            = addTab;
window.deleteTab         = deleteTab;
window.updateTabName     = updateTabName;
window.addTabColumn      = addTabColumn;
window.deleteTabColumn   = deleteTabColumn;
window.updateColName     = updateColName;
window.updateColType     = updateColType;
window.addTabRow         = addTabRow;
window.deleteTabRow      = deleteTabRow;
window.updateTabCell     = updateTabCell;

// Import
window.triggerImport     = triggerImport;
window.deleteImport          = deleteImport;
window.toggleWiederkehrendOptions = toggleWiederkehrendOptions;
window.openRegelEinnahmeModal     = openRegelEinnahmeModal;
window.closeRegelEinnahmeModal    = closeRegelEinnahmeModal;
window.saveRegelEinnahmeModal     = saveRegelEinnahmeModal;
window.updateRegelEinnahme   = updateRegelEinnahme;
window.deleteRegelEinnahme   = deleteRegelEinnahme;

(async () => {
  await loadData();
  // Apply selected year's months to allMonths2026
  const yr = getSelectedYear();
  const newMonths = monthsBetween(yr + '-01', yr + '-12');
  allMonths2026 = newMonths;
  // Sync currentMonth to selected year
  currentMonth = yr + '-' + (new Date().getMonth()+1+'').padStart(2,'0');
  if (!allMonths2026.includes(currentMonth)) currentMonth = allMonths2026[0];
  if (window.EA) { try { const v = await window.EA.getVersion(); if(el('appVersion')) el('appVersion').textContent = 'v' + v; } catch {} }
  // Load saved username
  if (state.meta.userName) {
    const un = document.getElementById('userName');
    if (un) un.textContent = state.meta.userName;
  }
  currentMonth = thisMonth();

  applySettings();
  cleanOldTrash();
  checkAutoBackup();
  // Auto-create sparen entries from linked fixkosten (silent)
  setTimeout(() => runSparenAutoEintragung().catch(e => console.error('autoEintragung:', e)), 1000);
  // ── Erinnerungen: Tray-Betrieb + System-Benachrichtigungen ──────────────
  setTimeout(() => initReminders(), 1500);
  // ── "Was ist neu" nach einem Update anzeigen ────────────────────────────
  setTimeout(() => checkWhatsNew(), 2000);
  // ── Robustheit: Backup-Ordner an Hauptprozess melden (für Backup beim Beenden)
  if (window.EA && window.EA.setBackupDir && state.config && state.config.backupPath) {
    try { window.EA.setBackupDir(state.config.backupPath); } catch {}
  }
  // ── Robustheit: Hinweis, falls Daten aus einer Sicherung wiederhergestellt wurden
  if (window.EA && window.EA.onDataRecovered) {
    window.EA.onDataRecovered(() => {
      setTimeout(() => {
        uiAlert({ title: 'Daten wiederhergestellt', icon: '🛟',
          message: 'Die Hauptdatei war beschädigt und wurde automatisch aus der letzten gültigen Sicherung wiederhergestellt. Bitte prüfe kurz, ob alle Einträge vorhanden sind.' });
      }, 1500);
    });
  }
  // Tägliches Auto-Refresh der Wertpapier-Kurse beim App-Start
  setTimeout(() => maybeAutoRefreshKurse().catch(e => console.error('autoRefreshKurse:', e)), 2500);
  // ── Erststart-Erkennung ─────────────────────────────────────────────────
  if (!state.meta.setupDone || !state.meta.userName) {
    buildMonthSelector();
    // Erst Nutzungsbedingungen (falls noch nicht in aktueller Version akzeptiert), dann Willkommen.
    if (!termsAcceptedCurrent()) {
      showTermsModal(() => showSetupScreen());
    } else {
      showSetupScreen();
    }
    // Wire ESC and events even during setup
    document.addEventListener('click', e => {
    const sr = document.getElementById('searchResults');
    const gs = document.getElementById('globalSearch');
    if (sr && !sr.contains(e.target) && e.target !== gs) sr.classList.add('hidden');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.getElementById('searchResults')?.classList.add('hidden');
      closeQuickAdd();
      closeRegelEinnahmeModal();
      closeSpeseModal();
      closeZaehlerModal();
      closeSparenModal();
      closeFinanzproduktModal();
    }
  });
    setupEvents();
    return;
  }

  buildMonthSelector();
  updateBadges();
  // Bestehende Nutzer: falls neue Bedingungs-Version, erneut bestätigen lassen.
  if (!termsAcceptedCurrent()) {
    showTermsModal(() => {});
  }
  // Apply saved startPage from settings
  const validPages = ['dashboard','jahresuebersicht','buchungen','einkaeufe','ausgaben','einnahmen','spesen','fixkosten','sparen','zaehler','finanzprodukte','tabellen','einstellungen'];
  const savedStart = state.config?.startPage;
  const startPage = (savedStart && validPages.includes(savedStart)) ? savedStart : 'dashboard';
  navigate(startPage);

  // ESC closes modal
  document.addEventListener('click', e => {
    const sr = document.getElementById('searchResults');
    const gs = document.getElementById('globalSearch');
    if (sr && !sr.contains(e.target) && e.target !== gs) sr.classList.add('hidden');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.getElementById('searchResults')?.classList.add('hidden');
      closeQuickAdd();
      closeRegelEinnahmeModal();
      closeSpeseModal();
      closeZaehlerModal();
      closeSparenModal();
      closeFinanzproduktModal();
    }
  });
  // Populate supermarkt datalist
  const dl = document.getElementById('supermaerkte_list');
  if (dl) dl.innerHTML = SUPERMAERKTE.map(s => '<option value="' + s.name + '">' + s.emoji + ' ' + s.name + '</option>').join('');

  // Show quick-add on start (only if enabled in settings)
  if (state.config?.showStartupModal !== false) openQuickAdd();

  // Drag & drop for import page
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', async e => {
    e.preventDefault();
    if (currentPage !== 'import') return;
    const files = [...e.dataTransfer.files].filter(f => /\.(pdf|csv|txt)$/i.test(f.name));
    // browser drop not easily handled in Electron, navigate user
  });

  // Auto-save every 30s
  setInterval(saveData, 30000);
})();
// ── EINGEBAUTE WERTPAPIER-DATENBANK ───────────────────────────────────────
const WERTPAPIER_DB = [
  // === ETFs - S&P 500 ===
  { symbol: 'SXR8.DE',  name: 'iShares Core S&P 500 UCITS ETF USD (Acc)',  isin: 'IE00B5BMR087', wkn: 'A0YEDG', typ: 'etf', tags: ['S&P 500','sp500','usa','ishares'] },
  { symbol: 'VUAA.DE',  name: 'Vanguard S&P 500 UCITS ETF USD (Acc)',      isin: 'IE00BFMXXD54', wkn: 'A2PKXG', typ: 'etf', tags: ['S&P 500','sp500','usa','vanguard'] },
  { symbol: 'XDPP.DE',  name: 'Xtrackers S&P 500 UCITS ETF 1C',             isin: 'IE00BM67HT60', wkn: 'A1XEY2', typ: 'etf', tags: ['S&P 500','sp500','usa','xtrackers'] },
  { symbol: 'IUSA.DE',  name: 'iShares S&P 500 UCITS ETF (Dist)',           isin: 'IE0031442068', wkn: '622391', typ: 'etf', tags: ['S&P 500','sp500','usa','ishares'] },
  // === ETFs - MSCI World ===
  { symbol: 'EUNL.DE',  name: 'iShares Core MSCI World UCITS ETF USD (Acc)', isin: 'IE00B4L5Y983', wkn: 'A0RPWH', typ: 'etf', tags: ['MSCI World','world','global','ishares'] },
  { symbol: 'XDWD.DE',  name: 'Xtrackers MSCI World UCITS ETF 1C',           isin: 'IE00BJ0KDQ92', wkn: 'A1XB5U', typ: 'etf', tags: ['MSCI World','world','xtrackers'] },
  { symbol: 'IWDA.AS',  name: 'iShares Core MSCI World UCITS ETF',           isin: 'IE00B4L5Y983', wkn: 'A0RPWH', typ: 'etf', tags: ['MSCI World','world'] },
  // === ETFs - All-World ===
  { symbol: 'VWCE.DE',  name: 'Vanguard FTSE All-World UCITS ETF USD (Acc)', isin: 'IE00BK5BQT80', wkn: 'A2PKXG', typ: 'etf', tags: ['All-World','FTSE','vanguard','acwi'] },
  { symbol: 'VWRL.AS',  name: 'Vanguard FTSE All-World UCITS ETF (Dist)',    isin: 'IE00B3RBWM25', wkn: 'A1JX52', typ: 'etf', tags: ['All-World','FTSE','vanguard'] },
  { symbol: 'IS3R.DE',  name: 'iShares MSCI ACWI UCITS ETF (Acc)',           isin: 'IE00B6R52259', wkn: 'A1JMDF', typ: 'etf', tags: ['ACWI','world','ishares'] },
  // === ETFs - Nasdaq ===
  { symbol: 'EQQQ.DE',  name: 'Invesco EQQQ Nasdaq-100 UCITS ETF',           isin: 'IE0032077012', wkn: '801498', typ: 'etf', tags: ['Nasdaq','tech','invesco'] },
  { symbol: 'SXRV.DE',  name: 'iShares Nasdaq 100 UCITS ETF (Acc)',          isin: 'IE00B53SZB19', wkn: 'A0YEDL', typ: 'etf', tags: ['Nasdaq','tech','ishares'] },
  // === ETFs - Emerging Markets ===
  { symbol: 'IS3N.DE',  name: 'iShares Core MSCI EM IMI UCITS ETF',          isin: 'IE00BKM4GZ66', wkn: 'A111X9', typ: 'etf', tags: ['emerging','markets','EM','ishares'] },
  // === ETFs - Europa ===
  { symbol: 'EXS1.DE',  name: 'iShares Core DAX UCITS ETF (DE)',             isin: 'DE0005933931', wkn: '593393', typ: 'etf', tags: ['DAX','deutschland','ishares'] },
  { symbol: 'DBXD.DE',  name: 'Xtrackers DAX UCITS ETF 1C',                  isin: 'LU0274211480', wkn: 'DBX1DA', typ: 'etf', tags: ['DAX','deutschland','xtrackers'] },
  { symbol: 'EXW1.DE',  name: 'iShares EURO STOXX 50 UCITS ETF (DE)',        isin: 'DE0005933956', wkn: '593395', typ: 'etf', tags: ['STOXX','europa','eurozone'] },
  // === ETFs - Small Cap / Gold ===
  { symbol: 'IUSN.DE',  name: 'iShares MSCI World Small Cap UCITS ETF',      isin: 'IE00BF4RFH31', wkn: 'A2DWBY', typ: 'etf', tags: ['small cap','small','world'] },
  { symbol: '4GLD.DE',  name: 'Xetra-Gold',                                  isin: 'DE000A0S9GB0', wkn: 'A0S9GB', typ: 'etf', tags: ['gold','rohstoff','commodity'] },
  // === Aktien USA ===
  { symbol: 'AAPL',     name: 'Apple Inc.',                                  isin: 'US0378331005', wkn: '865985', typ: 'aktie', tags: ['apple','tech','usa'] },
  { symbol: 'MSFT',     name: 'Microsoft Corporation',                       isin: 'US5949181045', wkn: '870747', typ: 'aktie', tags: ['microsoft','tech','usa'] },
  { symbol: 'GOOGL',    name: 'Alphabet Inc. (Google) Class A',              isin: 'US02079K3059', wkn: 'A14Y6F', typ: 'aktie', tags: ['google','alphabet','tech'] },
  { symbol: 'AMZN',     name: 'Amazon.com Inc.',                             isin: 'US0231351067', wkn: '906866', typ: 'aktie', tags: ['amazon','tech','usa'] },
  { symbol: 'META',     name: 'Meta Platforms Inc. (Facebook)',              isin: 'US30303M1027', wkn: 'A1JWVX', typ: 'aktie', tags: ['meta','facebook','tech'] },
  { symbol: 'TSLA',     name: 'Tesla Inc.',                                  isin: 'US88160R1014', wkn: 'A1CX3T', typ: 'aktie', tags: ['tesla','auto','usa'] },
  { symbol: 'NVDA',     name: 'NVIDIA Corporation',                          isin: 'US67066G1040', wkn: '918422', typ: 'aktie', tags: ['nvidia','tech','chip'] },
  { symbol: 'NFLX',     name: 'Netflix Inc.',                                isin: 'US64110L1061', wkn: '552484', typ: 'aktie', tags: ['netflix','streaming'] },
  { symbol: 'BRK-B',    name: 'Berkshire Hathaway Inc. Class B',             isin: 'US0846707026', wkn: 'A0YJQ2', typ: 'aktie', tags: ['berkshire','buffett'] },
  { symbol: 'JPM',      name: 'JPMorgan Chase & Co.',                        isin: 'US46625H1005', wkn: '850628', typ: 'aktie', tags: ['jpmorgan','bank'] },
  { symbol: 'V',        name: 'Visa Inc.',                                   isin: 'US92826C8394', wkn: 'A0NC7B', typ: 'aktie', tags: ['visa','finanz','payment'] },
  { symbol: 'MA',       name: 'Mastercard Incorporated',                     isin: 'US57636Q1040', wkn: 'A0F602', typ: 'aktie', tags: ['mastercard','finanz','payment'] },
  { symbol: 'DIS',      name: 'The Walt Disney Company',                     isin: 'US2546871060', wkn: '855686', typ: 'aktie', tags: ['disney','medien'] },
  { symbol: 'KO',       name: 'The Coca-Cola Company',                       isin: 'US1912161007', wkn: '850663', typ: 'aktie', tags: ['cocacola','getränke'] },
  { symbol: 'MCD',      name: 'McDonald\'s Corporation',                     isin: 'US5801351017', wkn: '856958', typ: 'aktie', tags: ['mcdonalds','food'] },
  { symbol: 'JNJ',      name: 'Johnson & Johnson',                           isin: 'US4781601046', wkn: '853260', typ: 'aktie', tags: ['johnson','pharma'] },
  { symbol: 'PG',       name: 'Procter & Gamble Co.',                        isin: 'US7427181091', wkn: '852062', typ: 'aktie', tags: ['procter','gamble'] },
  { symbol: 'WMT',      name: 'Walmart Inc.',                                isin: 'US9311421039', wkn: '860853', typ: 'aktie', tags: ['walmart','retail'] },
  { symbol: 'XOM',      name: 'Exxon Mobil Corporation',                     isin: 'US30231G1022', wkn: '852549', typ: 'aktie', tags: ['exxon','oil','energie'] },
  { symbol: 'AMD',      name: 'Advanced Micro Devices Inc.',                 isin: 'US0079031078', wkn: '863186', typ: 'aktie', tags: ['amd','chip','tech'] },
  { symbol: 'INTC',     name: 'Intel Corporation',                           isin: 'US4581401001', wkn: '855681', typ: 'aktie', tags: ['intel','chip','tech'] },
  { symbol: 'PYPL',     name: 'PayPal Holdings Inc.',                        isin: 'US70450Y1038', wkn: 'A14R7U', typ: 'aktie', tags: ['paypal','fintech'] },
  { symbol: 'CRM',      name: 'Salesforce Inc.',                             isin: 'US79466L3024', wkn: 'A0B87V', typ: 'aktie', tags: ['salesforce','crm','tech'] },
  { symbol: 'BA',       name: 'The Boeing Company',                          isin: 'US0970231058', wkn: '850471', typ: 'aktie', tags: ['boeing','aviation'] },
  // === DAX 40 ===
  { symbol: 'SAP.DE',   name: 'SAP SE',                                      isin: 'DE0007164600', wkn: '716460', typ: 'aktie', tags: ['sap','software','dax'] },
  { symbol: 'SIE.DE',   name: 'Siemens AG',                                  isin: 'DE0007236101', wkn: '723610', typ: 'aktie', tags: ['siemens','dax'] },
  { symbol: 'ALV.DE',   name: 'Allianz SE',                                  isin: 'DE0008404005', wkn: '840400', typ: 'aktie', tags: ['allianz','versicherung','dax'] },
  { symbol: 'DTE.DE',   name: 'Deutsche Telekom AG',                         isin: 'DE0005557508', wkn: '555750', typ: 'aktie', tags: ['telekom','dax'] },
  { symbol: 'BAS.DE',   name: 'BASF SE',                                     isin: 'DE000BASF111', wkn: 'BASF11', typ: 'aktie', tags: ['basf','chemie','dax'] },
  { symbol: 'BMW.DE',   name: 'Bayerische Motoren Werke AG (BMW)',           isin: 'DE0005190003', wkn: '519000', typ: 'aktie', tags: ['bmw','auto','dax'] },
  { symbol: 'MBG.DE',   name: 'Mercedes-Benz Group AG',                      isin: 'DE0007100000', wkn: '710000', typ: 'aktie', tags: ['mercedes','auto','dax'] },
  { symbol: 'VOW3.DE',  name: 'Volkswagen AG VZ',                            isin: 'DE0007664039', wkn: '766403', typ: 'aktie', tags: ['volkswagen','vw','auto','dax'] },
  { symbol: 'DBK.DE',   name: 'Deutsche Bank AG',                            isin: 'DE0005140008', wkn: '514000', typ: 'aktie', tags: ['deutsche bank','bank','dax'] },
  { symbol: 'CBK.DE',   name: 'Commerzbank AG',                              isin: 'DE000CBK1001', wkn: 'CBK100', typ: 'aktie', tags: ['commerzbank','bank','dax'] },
  { symbol: 'BAY.DE',   name: 'Bayer AG',                                    isin: 'DE000BAY0017', wkn: 'BAY001', typ: 'aktie', tags: ['bayer','pharma','dax'] },
  { symbol: 'ADS.DE',   name: 'adidas AG',                                   isin: 'DE000A1EWWW0', wkn: 'A1EWWW', typ: 'aktie', tags: ['adidas','sport','dax'] },
  { symbol: 'PUM.DE',   name: 'PUMA SE',                                     isin: 'DE0006969603', wkn: '696960', typ: 'aktie', tags: ['puma','sport'] },
  { symbol: 'P911.DE',  name: 'Dr. Ing. h.c. F. Porsche AG',                 isin: 'DE000PAG9113', wkn: 'PAG911', typ: 'aktie', tags: ['porsche','auto','dax'] },
  { symbol: 'IFX.DE',   name: 'Infineon Technologies AG',                    isin: 'DE0006231004', wkn: '623100', typ: 'aktie', tags: ['infineon','chip','dax'] },
  { symbol: 'AIR.DE',   name: 'Airbus SE',                                   isin: 'NL0000235190', wkn: '938914', typ: 'aktie', tags: ['airbus','aviation','dax'] },
  { symbol: 'RWE.DE',   name: 'RWE AG',                                      isin: 'DE0007037129', wkn: '703712', typ: 'aktie', tags: ['rwe','energie','dax'] },
  { symbol: 'MUV2.DE',  name: 'Münchener Rückversicherungs-Gesellschaft AG', isin: 'DE0008430026', wkn: '843002', typ: 'aktie', tags: ['munich re','versicherung','dax'] },
  { symbol: 'EOAN.DE',  name: 'E.ON SE',                                     isin: 'DE000ENAG999', wkn: 'ENAG99', typ: 'aktie', tags: ['eon','energie','dax'] },
  // === Krypto ===
  { symbol: 'BTC-EUR',  name: 'Bitcoin / Euro',                              isin: '', wkn: '', typ: 'krypto', tags: ['bitcoin','btc','krypto'] },
  { symbol: 'ETH-EUR',  name: 'Ethereum / Euro',                             isin: '', wkn: '', typ: 'krypto', tags: ['ethereum','eth','krypto'] },
  { symbol: 'BTC-USD',  name: 'Bitcoin / US Dollar',                         isin: '', wkn: '', typ: 'krypto', tags: ['bitcoin','btc','krypto'] },
  { symbol: 'ETH-USD',  name: 'Ethereum / US Dollar',                        isin: '', wkn: '', typ: 'krypto', tags: ['ethereum','eth','krypto'] },
];

function searchWertpapierLocal(query) {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase().trim();
  const results = [];
  for (const wp of WERTPAPIER_DB) {
    let score = 0;
    if (wp.symbol.toLowerCase() === q) score += 100;
    else if (wp.symbol.toLowerCase().startsWith(q)) score += 50;
    else if (wp.symbol.toLowerCase().includes(q)) score += 30;
    if (wp.isin.toLowerCase() === q) score += 100;
    else if (wp.isin.toLowerCase().includes(q)) score += 40;
    if (wp.wkn.toLowerCase() === q) score += 80;
    else if (wp.wkn.toLowerCase().includes(q)) score += 30;
    if (wp.name.toLowerCase().includes(q)) score += 30;
    for (const tag of wp.tags) {
      const tl = tag.toLowerCase();
      if (tl === q) score += 50;
      else if (tl.includes(q)) score += 15;
    }
    if (score > 0) results.push({ wp, score });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 12).map(r => r.wp);
}

// ── WERTPAPIER-SUCHE (lokale DB + Yahoo Fallback) ────────────────────────
async function searchWertpapier(query, callback) {
  if (!query || query.length < 1) { callback([]); return; }
  // PRIMARY: lokale DB (offline-fähig)
  const localResults = searchWertpapierLocal(query).map(wp => ({
    symbol: wp.symbol,
    shortname: wp.name,
    longname: wp.name,
    quoteType: wp.typ === 'aktie' ? 'EQUITY' : wp.typ === 'etf' ? 'ETF' : wp.typ === 'fonds' ? 'MUTUALFUND' : wp.typ === 'krypto' ? 'CRYPTOCURRENCY' : 'EQUITY',
    isin: wp.isin,
    wkn:  wp.wkn,
    exchange: wp.symbol.includes('.') ? wp.symbol.split('.')[1] : 'NMS',
    _local: true,
  }));
  // Sofort lokale Treffer anzeigen
  callback(localResults);
  // SECONDARY: Yahoo via Electron Main (residential IP - geht meist durch)
  if (query.length >= 2 && window.EA?.fetchSearch) {
    try {
      const yahooQuotes = await window.EA.fetchSearch(query);
      if (yahooQuotes && yahooQuotes.length) {
        const seen = new Set(localResults.map(r => r.symbol));
        const merged = [...localResults, ...yahooQuotes.filter(q => !seen.has(q.symbol))];
        callback(merged);
      }
    } catch (e) { /* fallback to proxy */ }
  }
}

// Tries multiple sources to fetch a live price for a symbol
async function fetchWertpapierKurs(symbol) {
  if (!symbol) return null;
  const yahooUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol);

  // PRIMARY: Direkt via Electron Main Process (kein CORS, Browser-Headers)
  if (window.EA && window.EA.fetchUrl) {
    try {
      const result = await window.EA.fetchUrl(yahooUrl);
      if (result && result.ok && result.body) {
        const data = JSON.parse(result.body);
        const meta = data?.chart?.result?.[0]?.meta;
        if (meta && typeof meta.regularMarketPrice === 'number') {
          return {
            symbol: meta.symbol,
            kurs: meta.regularMarketPrice,
            vortag: meta.chartPreviousClose || meta.previousClose,
            waehrung: meta.currency,
            aktualisiert: new Date().toISOString(),
            name: meta.longName || meta.shortName || meta.symbol,
            _source: 'yahoo-direct',
          };
        }
      }
    } catch (e) { /* fall through to proxy attempts */ }
  }

  // SECONDARY: CORS-Proxies
  const proxies = [
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url=',
    'https://api.codetabs.com/v1/proxy?quest=',
  ];
  for (const proxy of proxies) {
    try {
      const fullUrl = proxy + encodeURIComponent(yahooUrl);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const resp = await fetch(fullUrl, { signal: ctrl.signal, headers: { 'Accept': 'application/json' } });
      clearTimeout(timer);
      if (!resp.ok) continue;
      const data = await resp.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta && typeof meta.regularMarketPrice === 'number') {
        return {
          symbol: meta.symbol,
          kurs: meta.regularMarketPrice,
          vortag: meta.chartPreviousClose || meta.previousClose,
          waehrung: meta.currency,
          aktualisiert: new Date().toISOString(),
          name: meta.longName || meta.shortName || meta.symbol,
          _source: 'yahoo-proxy',
        };
      }
    } catch (e) { /* try next */ }
  }

  // TERTIARY: Stooq als Alternative (für US-Aktien)
  if (window.EA && window.EA.fetchUrl) {
    try {
      // Stooq verwendet andere Symbol-Notation: AAPL → aapl.us, SAP.DE → sap.de
      let stooqSym = symbol.toLowerCase();
      if (!stooqSym.includes('.')) stooqSym += '.us';
      else stooqSym = stooqSym.replace('-', '.');
      const stooqUrl = 'https://stooq.com/q/l/?s=' + encodeURIComponent(stooqSym) + '&f=sd2t2ohlcv&h&e=csv';
      const result = await window.EA.fetchUrl(stooqUrl);
      if (result && result.ok && result.body) {
        // CSV: Symbol,Date,Time,Open,High,Low,Close,Volume
        const lines = result.body.trim().split('\n');
        if (lines.length >= 2) {
          const cols = lines[1].split(',');
          const close = parseFloat(cols[6]);
          const open = parseFloat(cols[3]);
          if (close && !isNaN(close)) {
            return {
              symbol: symbol,
              kurs: close,
              vortag: open || close,
              waehrung: 'USD',
              aktualisiert: new Date().toISOString(),
              name: symbol,
              _source: 'stooq',
            };
          }
        }
      }
    } catch (e) { /* fall through */ }
  }

  return null;
}

async function fetchWertpapierKursAtDate(symbol, dateStr) {
  if (!symbol || !dateStr) return null;
  // Try via Electron Main-Process first
  if (window.EA?.fetchQuoteAtDate) {
    try {
      const result = await window.EA.fetchQuoteAtDate(symbol, dateStr);
      if (typeof result === 'number' && result > 0) return result;
    } catch (e) { /* fall through */ }
  }
  try {
    const date = new Date(dateStr);
    const start = Math.floor(date.getTime() / 1000);
    const end = start + 86400 * 7;
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) +
                '?period1=' + start + '&period2=' + end + '&interval=1d';
    // Primary: direct via Electron
    if (window.EA && window.EA.fetchUrl) {
      const result = await window.EA.fetchUrl(url);
      if (result && result.ok && result.body) {
        try {
          const data = JSON.parse(result.body);
          const prices = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
          const found = prices?.find(p => p !== null && p !== undefined);
          if (found) return found;
        } catch {}
      }
    }
    // Fallback: proxy
    const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
    const resp = await fetch(proxyUrl);
    if (!resp.ok) return null;
    const data = await resp.json();
    const prices = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    return prices?.find(p => p !== null && p !== undefined) ?? null;
  } catch (e) {
    console.error('fetchWertpapierKursAtDate:', e);
    return null;
  }
}

async function refreshAllWertpapierKurse() {
  state.etfKurse = state.etfKurse || {};
  // Collect symbol + ISIN pairs (ISIN as fallback if symbol fails)
  const entries = new Map(); // symbol → isin
  (state.sparen||[]).forEach(s => {
    const sym = s.wertpapier?.symbol || s.etf?.ticker;
    const isin = s.wertpapier?.isin || s.etf?.isin || '';
    if (sym) {
      if (!entries.has(sym) || (!entries.get(sym) && isin)) entries.set(sym, isin);
    }
  });
  const symbols = entries;
  if (entries.size === 0) {
    showToast('Keine Wertpapiere zum Aktualisieren', 'info');
    return;
  }
  showToast('Aktualisiere ' + symbols.size + ' Kurs(e)…', 'info');
  let ok = 0;
  const failed = [];
  // Parallel mit Promise.all begrenzen auf 4 gleichzeitig (zu schnell hintereinander → Rate-Limit)
  const symArray = Array.from(symbols.entries()); // [[sym, isin], ...]
  const batchSize = 3;
  for (let i = 0; i < symArray.length; i += batchSize) {
    const batch = symArray.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(([sym, isin]) => fetchWertpapierKurs(sym, isin).catch(() => null).then(k => ({ sym, k }))));
    for (const { sym, k } of results) {
      if (k) { state.etfKurse[sym] = k; ok++; }
      else failed.push(sym);
    }
    if (i + batchSize < symArray.length) await new Promise(r => setTimeout(r, 300)); // small delay between batches
  }
  saveData();
  if (currentPage === 'sparen') renderPage();
  if (ok > 0 && failed.length === 0) {
    showToast(ok + ' Kurs(e) aktualisiert');
  } else if (ok > 0) {
    showToast(ok + ' aktualisiert · ' + failed.length + ' fehlgeschlagen', 'info');
    console.warn('Kurs-Fehler bei:', failed);
  } else {
    console.warn('Alle Kurs-Anfragen fehlgeschlagen für:', failed);
    await uiAlert({
      title: 'Kurse nicht abrufbar',
      icon: '🌐',
      message: 'Die Live-Kurs-API ist aktuell <strong>blockiert oder nicht erreichbar</strong>.<br><br>Yahoo Finance und alle Fallback-Proxies haben den Zugriff verweigert.<br><br>Du kannst Kurse manuell über den <strong>✎ Kurs</strong>-Button pro Position eintragen.',
    });
  }
}

window.searchWertpapier = searchWertpapier;
window.fetchWertpapierKurs = fetchWertpapierKurs;
window.fetchWertpapierKursAtDate = fetchWertpapierKursAtDate;
window.refreshAllWertpapierKurse = refreshAllWertpapierKurse;

// ── DAILY AUTO-REFRESH der Wertpapier-Kurse ───────────────────────────
async function maybeAutoRefreshKurse() {
  // Skip wenn keine Wertpapiere im Depot
  const hasWp = (state.sparen||[]).some(s => s.wertpapier?.symbol || s.etf?.ticker);
  if (!hasWp) return;
  // Nur einmal pro 8 Stunden (verhindert Spam bei häufigem Start)
  const last = state.meta?._lastKursRefresh || 0;
  const now = Date.now();
  if ((now - last) < 8 * 60 * 60 * 1000) {
    console.log('Auto-Refresh: skipped (last refresh <8h ago)');
    return;
  }
  state.meta = state.meta || {};
  state.meta._lastKursRefresh = now;
  saveData();
  // Silent refresh (kein Toast für leere Liste)
  await refreshAllWertpapierKurseSilent();
}

async function refreshAllWertpapierKurseSilent() {
  state.etfKurse = state.etfKurse || {};
  const entries = new Map();
  (state.sparen||[]).forEach(s => {
    const sym = s.wertpapier?.symbol || s.etf?.ticker;
    const isin = s.wertpapier?.isin || s.etf?.isin || '';
    if (sym && (!entries.has(sym) || (!entries.get(sym) && isin))) entries.set(sym, isin);
  });
  if (entries.size === 0) return;
  console.log('Auto-Refresh: Updating', entries.size, 'symbols...');
  let ok = 0;
  const symArray = Array.from(entries.entries());
  const batchSize = 3;
  for (let i = 0; i < symArray.length; i += batchSize) {
    const batch = symArray.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(([sym, isin]) =>
      fetchWertpapierKurs(sym, isin).catch(() => null).then(k => ({ sym, k }))
    ));
    for (const { sym, k } of results) {
      if (k) { state.etfKurse[sym] = k; ok++; }
    }
    if (i + batchSize < symArray.length) await new Promise(r => setTimeout(r, 300));
  }
  if (ok > 0) {
    saveData();
    if (currentPage === 'sparen') renderPage();
    console.log('Auto-Refresh: ' + ok + '/' + entries.size + ' Kurse aktualisiert');
  }
}

window.maybeAutoRefreshKurse = maybeAutoRefreshKurse;
window.refreshAllWertpapierKurseSilent = refreshAllWertpapierKurseSilent;

// Manuelles Setzen eines Kurses (falls Live-API blockiert)
async function setManualPrice(symbol, currentPriceCached) {
  const wp = WERTPAPIER_DB.find(w => w.symbol === symbol);
  const name = wp?.name || symbol;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML =
    '<div class="modal" style="max-width:420px;padding:0" onclick="event.stopPropagation()">' +
      '<div style="padding:18px 22px;border-bottom:1px solid var(--border)">' +
        '<h3 style="margin:0;font-size:16px;font-weight:600;color:var(--text)">📈 Aktueller Kurs</h3>' +
        '<div style="font-size:12px;color:var(--muted);margin-top:4px">' + name + ' (' + symbol + ')</div>' +
      '</div>' +
      '<div style="padding:18px 22px">' +
        '<label class="field" style="display:block">Kurs heute' +
          '<input type="number" step="0.0001" id="_manual_price_inp" value="' + (currentPriceCached||'') + '" autofocus />' +
        '</label>' +
        '<p style="font-size:11px;color:var(--muted);margin-top:8px">Wird zur Berechnung von G/V verwendet.</p>' +
      '</div>' +
      '<div style="padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;background:var(--surface);border-radius:0 0 14px 14px">' +
        '<button class="btn btn-ghost" data-action="cancel">Abbrechen</button>' +
        '<button class="btn btn-primary" data-action="ok">Speichern</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  return new Promise((resolve) => {
    function cleanup(price) {
      document.removeEventListener('keydown', kh);
      overlay.remove();
      resolve(price);
    }
    function kh(e) {
      if (e.key === 'Escape') { e.preventDefault(); cleanup(null); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const v = +document.getElementById('_manual_price_inp').value;
        cleanup(v > 0 ? v : null);
      }
    }
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => cleanup(null));
    overlay.querySelector('[data-action="ok"]').addEventListener('click', () => {
      const v = +document.getElementById('_manual_price_inp').value;
      cleanup(v > 0 ? v : null);
    });
    document.addEventListener('keydown', kh);
    setTimeout(() => document.getElementById('_manual_price_inp')?.focus(), 50);
  }).then(price => {
    if (price && price > 0) {
      state.etfKurse = state.etfKurse || {};
      state.etfKurse[symbol] = {
        symbol, kurs: price,
        vortag: state.etfKurse[symbol]?.vortag || price,
        waehrung: state.etfKurse[symbol]?.waehrung || 'EUR',
        aktualisiert: new Date().toISOString(),
        name: name,
        _manual: true,
      };
      saveData();
      renderPage();
      showToast('Kurs gespeichert: ' + fmtEur(price));
    }
  });
}

window.setManualPrice = setManualPrice;




