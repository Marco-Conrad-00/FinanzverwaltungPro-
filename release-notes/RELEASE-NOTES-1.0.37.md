# Finanzverwaltung Pro – Projektübergabe

**Stand:** 24.07.2026 · **Version:** 1.0.37
**Für:** Fortsetzung in einem neuen Chat

---

## 1. Was ist das Projekt

Private Windows-Desktop-Anwendung zur Finanzverwaltung (Electron/Node.js).
Intern „Finanzverwaltung Pro", vermarktet als „Liquid". Einzelnutzer: Marco Conrad.

| | |
|---|---|
| **Repository** | `Marco-Conrad-00/FinanzverwaltungPro-` (öffentlich) |
| **Stack** | Electron, Node.js, Chart.js, pdf.js |
| **Daten** | `%APPDATA%\finanzverwaltung-pro\data.json` |
| **Feedback** | Marco.Conrad00@gmail.com |

---

## 2. Dateien in diesem Paket

| Datei | Zweck |
|---|---|
| `FinanzverwaltungPro-1.0.37-komplett.zip` | Vollständiger Quellcode |
| `data.json` | Bereinigte Nutzerdaten (5 Jahre) |
| `PROJEKT-UEBERGABE.md` | Dieses Dokument |

**Im ZIP enthalten:** `src/app.js` (10.408 Zeilen), `src/index.html`,
`src/styles.css`, `src/main.js`, `src/preload.js`, `src/check.js`,
`package.json`, `build/` (Installer-Grafiken), `spesen/index.json`.

---

## 3. Arbeitsweise – unbedingt beachten

### Verzeichnisstruktur
```
fp3/
├── package.json          ← Version steht hier
├── build/                ← Installer-Grafiken (BMP, 24-bit)
├── spesen/index.json     ← Muss ins Repo für den Spesen-Updater
└── src/
    ├── app.js            ← Fast der gesamte Code
    ├── index.html        ← Nur Grundgerüst + Sidebar + Modals
    ├── styles.css
    ├── main.js           ← Electron-Hauptprozess
    ├── preload.js        ← window.EA-Brücke
    └── check.js          ← Prüfskript
```

### Pflichtprüfung vor jeder Auslieferung
```bash
node --check app.js && node --check main.js && node --check preload.js
node check.js .
```
`check.js` prüft: doppelte Funktionen, ungequotete IDs in `onclick`,
verschachtelte `ipcMain.handle`, fehlende `window`-Exports.

### Reload-Regeln
- `app.js` / `index.html` / `styles.css` → **Ctrl+R** genügt
- `main.js` / `preload.js` / `package.json` → **kompletter Neustart**

### Release
`release_new_version.sh` entpackt das ZIP ins Repo, erhöht die Version um +0.0.1,
committet und pusht einen Tag. **Die Version im ZIP wird also nochmals erhöht.**

---

## 4. Kritische Architektur-Fakten

Diese Punkte haben mehrfach Fehler verursacht:

### loadData-Allowlist
```js
const fields = ['meta','config','customCats','trash','imports','etfKurse',
  'transactions','years','dataVersion','currentYear','selectedYear',
  'backupHistory','yearEditUnlocked','reminders','pv','pvConfig','spesenSaetze'];
```
**Jedes neue Top-Level-Feld muss hier eingetragen werden**, sonst verschwindet es
beim Neustart stillschweigend.

### YEAR_FIELDS – jahresgebundene Daten
```js
const YEAR_FIELDS = ['incomeByMonth','einkaeufe','ausgaben','einnahmen',
  'regelEinnahmen','spesen','fixkosten','sparen','zaehler','tabellen',
  'finanzprodukte','umbuchungen'];
```
Diese liegen unter `state.years[JAHR]`. Beim Jahreswechsel wird umgeschaltet.
`pv` und `pvConfig` liegen **bewusst außerhalb** (PV-Jahre sind unabhängig).

### window-Exports
Jede in `onclick` verwendete Funktion **muss** exportiert werden:
```js
window.meineFunktion = meineFunktion;
```
`check.js` prüft das. IDs in `onclick` müssen gequotet sein (`'${id}'`).

### Theme-Fallstrick
`theme-dark` liegt auf `<html>` **und** `<body>`. CSS-Variablen müssen auf
**beide** gesetzt werden, sonst gewinnt die Klasse auf `<body>`.

### window.EA (preload-Brücke)
`loadData`, `saveData`, `getVersion`, `fetchUrl` (liefert `{ok,status,body}` –
Inhalt in `.body`), `writeBackup`, `checkForUpdates`, `onUpdateAvailable/Progress`,
`setTrayEnabled`, `notify`, `setBackupDir`, `openExternal`, `onDataRecovered`,
`createShortcut`, `openFiles`, `readFile`, `printToPdf`.

### Automatisches Speichern
`setInterval(saveData, 30000)` – **beim Austauschen der `data.json` muss die App
vollständig beendet sein**, sonst überschreibt sie die Datei. Sie läuft auch im
Tray weiter.

---

## 5. Funktionsübersicht

### Seiten (Sidebar)
Dashboard · Jahresübersicht · Buchungen · Einkäufe · Ausgaben · Einnahmen ·
Spesen · Fixkosten · Sparen & Depot · Umbuchungen · Zählerstände ·
PV-Anlage* · Analyse* · Finanzprodukte · Eigene Tabellen* · Einstellungen

*optional, Aktivierung in Einstellungen → Funktionen

### Einstellungen (6 Reiter)
Profil · Konten & Jahre · Darstellung · Funktionen · Daten & Sicherheit · Über

### Besonderheiten
- **Farbsystem**: 10 Paletten + freie Farbwahl, getrennt für hell/dunkel,
  WCAG-Kontrastprüfung, 4 Grundtöne für Dark-Mode
- **Spesensätze**: BMF-Schreiben 05.12.2025, 216 Länder, Luxemburg-Regel für
  nicht gelistete Länder, nachladbar aus dem Repo
- **PDF-Import**: Kontoauszüge mit Vorschau vor Übernahme
- **Jahresbericht**: 3-seitiges PDF, Zwischenstand oder Abschluss
- **ISIN-Kursabruf**: Fallback über ING-API für nicht börsengehandelte Fonds

---

## 6. Behobene Fehler (Historie)

Diese Fehler wurden gefunden und behoben – als Warnung vor ähnlichen Mustern:

| Fehler | Muster |
|---|---|
| ETF-Auto-Refresh tat nichts | Einstellung gespeichert, aber nirgends ausgewertet |
| `skipCashflow` ignoriert | dito – Feld gesetzt, Logik fehlte |
| Wertpapierkäufe doppelt gezählt | Kauf minderte das Verrechnungskonto nicht |
| „Stand setzen" stapelte Korrekturen | alte Korrektur wurde nicht ersetzt |
| Desktop-Verknüpfung erzeugte `.bat`/`.vbs` | Entwicklungs-Code in der Auslieferung |
| Kontenauswahl brach ab | `ReferenceError` durch versehentliche Ersetzung |
| PDF-Import fand nur eine Buchung | PDF.js liefert keine Zeilenumbrüche |
| Saldo als Buchungsbetrag gelesen | Spaltenerkennung im Import |
| Farbwahl wirkte nicht im Dark-Mode | CSS-Variable nur auf `<html>` gesetzt |

**Wiederkehrendes Muster:** Felder werden gespeichert, aber nicht ausgewertet.
Bei neuen Einstellungen immer prüfen, ob sie tatsächlich gelesen werden.

---

## 7. Zustand der Nutzerdaten

### Jahre in `data.json`

| Jahr | Umfang | Einnahmen | Endsaldo |
|---|---|---|---|
| 2022 | Einkommen + Sparen, Ausgaben als Ausgleich | 25.040,65 € | 641,21 € |
| 2023 | dito | 39.214,44 € | 3.970,14 € |
| 2024 | vollständig (Excel-Import) | 41.375,78 € | 704,81 € |
| 2025 | vollständig (Excel-Import) | 41.453,42 € | 4.949,87 € |
| 2026 | laufend, Detailerfassung | 39.216,17 € | – |

Die Kontostand-Kette schließt lückenlos: Jeder Endsaldo entspricht dem
Startguthaben des Folgejahres.

### Konten 2026
| Konto | Startwert | App-Saldo | Echt (23.07.) |
|---|---|---|---|
| Girokonto ING | 655,21 € | 2.655,38 € | **1.754,41 €** |
| Tagesgeld ING | 0,00 € | 1.680,00 € | **1.690,00 €** |
| Trade Republic | 4.294,66 € | 5.183,86 € | **5.192,41 €** |

> **Offen:** Die Salden müssen einmalig über „Stand setzen" korrigiert werden.
> Die Girokonto-Differenz von 900,97 € entsteht durch unvollständig erfasste
> Juli-Ausgaben (431 € statt üblicher 1.050–1.280 €).

### Depot (15 Positionen, alle mit Kurs)
| Depot | investiert | Wert | Beleg |
|---|---|---|---|
| Trade Republic | 8.932,35 € | 11.331,83 € | 11.331,73 € |
| ebase 99150003185 | 6.677,13 € | 7.561,48 € | 7.561,48 € |

Rekonstruiert aus 684 Trade-Republic-Transaktionen (ab Nov. 2021) inklusive
Splits, Reverse-Splits und IPO-Zeichnung. Alle Stückzahlen gegen die
Broker-Anzeigen geprüft.

### Finanzprodukte
- **AVWL** (WWK): 628,67 €
- **Fondsgebundene Rentenversicherung** (NÜRNBERGER, 222004901070):
  8.600 € eingezahlt, 8.596,41 € Wert, verknüpft mit den Fixkosten (275,63 €/Mon
  ab August), zwei Fonds hinterlegt

---

## 8. Offene Punkte

1. **Kontostände korrigieren** – siehe oben, drei Konten
2. **`data.json` einspielen** – der Nutzer hat sie mehrfach nicht aktiviert
   bekommen; Ursache vermutlich laufende App beim Kopieren
3. **`spesen/index.json` ins Repo** – sonst findet der Spesen-Updater nichts
4. **CHANGELOG-Lücke** 1.0.14–1.0.16 ohne Einträge
5. **`contextIsolation: false`** – Härtung wäre sinnvoll, größerer Umbau
6. **Differenz 2024/2025** – je ~1.520 € zwischen Excel-Endsaldo und Startgeld
   des Folgejahres, als Ausgleichsbuchung eingetragen; Ursache ungeklärt

---

## 9. Arbeitsprinzipien in diesem Projekt

Was sich bewährt hat:

- **Gegen echte Belege prüfen**, nicht gegen Annahmen. Mehrfach haben
  Broker-Auszüge Rechenfehler aufgedeckt.
- **Keine Stubs im Test**, wo die echte Funktion verfügbar ist. Ein Stub für
  `escapeHtml` hat einen Absturz verdeckt; vereinfachte Konto-Stubs führten zu
  einer falschen Saldo-Aussage.
- **Vorher fragen bei Datenänderungen.** Bei mehrdeutigen Excel-Strukturen wurde
  eher nachgefragt als geraten.
- **Rendertest statt nur Syntaxprüfung.** `node --check` findet keine
  Laufzeitfehler in Template-Literalen.
- **Ehrlich bei Lücken.** Positionen ohne Kurs werden ausgewiesen, nicht als 0 €
  gerechnet.

---

## 10. Neu in 1.0.37

**Finanzprodukte bearbeitbar** – bisher nur anlegen/löschen möglich. Neuer Knopf
**„+ Stand"** erfasst einen weiteren Stichtag mit übernommenen Stammdaten; so
entsteht die Historie. Fonds und Beitragsverknüpfung bleiben beim Bearbeiten
erhalten.

**Jahresübersicht mit fünf umschaltbaren Diagrammen** – Cashflow, Einnahmen
gegen Ausgaben, Vermögensverlauf, Ausgaben nach Kategorie, Sparleistung.
Vorjahre lassen sich per Häkchen als Vergleichslinie einblenden.

`jahresMonatswerte(jahr, art)` liest andere Jahre direkt aus `state.years`, ohne
das aktive Jahr zu wechseln – geprüft gegen die Jahresbilanzen (2025:
41.453,42 € Einnahmen, 37.208,36 € Ausgaben – exakt).
