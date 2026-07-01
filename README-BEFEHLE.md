# FinanzverwaltungPro v1.01 — Befehle

Alle Befehle in der **Eingabeaufforderung (cmd)** ausführen, im Projektordner
(dort wo diese Datei und package.json liegen).

---

## 0. Voraussetzung: Node.js

Einmalig prüfen, ob Node.js installiert ist:
```
node -v
```
Kommt eine Versionsnummer (z.B. v20.x), ist alles gut.
Falls nicht: Node.js von https://nodejs.org (LTS-Version) installieren.

---

## 1. In den Projektordner wechseln

```
cd /d "%USERPROFILE%\Downloads\FinanzverwaltungPro_v1.01"
```
(Pfad anpassen, falls du den Ordner woanders hast.)

---

## 2. Abhängigkeiten installieren (einmalig)

```
npm install
```
Lädt Electron, electron-builder und electron-updater. Dauert beim ersten Mal
ein bis zwei Minuten.

---

## 3. App lokal testen (ohne EXE)

```
npm start
```
Startet die App direkt zum Ausprobieren. Zum Beenden das Fenster schließen.

Beim Entwickeln: Änderungen an `src\app.js`, `src\index.html`, `src\styles.css`
brauchen nur **Strg+R** im App-Fenster (kein Neustart).
Änderungen an `src\main.js` / `src\preload.js` brauchen einen echten Neustart
(Fenster schließen, `npm start` erneut).

---

## 4. EXE / Installer bauen

```
npm run build
```
Baut die fertige Windows-Installer-EXE. Ergebnis liegt danach im Ordner **dist\**:
- `Finanzverwaltung Pro Setup 1.0.1.exe`  ← der Installer zum Weitergeben/Installieren

Das Bauen braucht **kein** GitHub. Nur zum Testen der fertigen App reicht dieser Befehl.

---

## 5. (Später) Auf GitHub veröffentlichen für Auto-Updates

Erst wenn du die Version für Familie/Freunde ausrollen willst.
Voraussetzung: GitHub-Repo + Token sind eingerichtet (siehe AUTO-UPDATE-ANLEITUNG.md),
und in package.json ist bei `"owner"` dein GitHub-Name eingetragen.

```
set GH_TOKEN=dein_github_token
npm run publish
```

---

## Schnell-Referenz (Reihenfolge beim ersten Mal)

```
cd /d "%USERPROFILE%\Downloads\FinanzverwaltungPro_v1.01"
npm install
npm start
```
Wenn alles passt, EXE bauen:
```
npm run build
```

---

## Was ist in v1.01 neu (gegenüber der Vorversion)

- Globale Suche über alle Buchungen (Menüpunkt 🔍 Suche)
- Fixkosten-Rhythmus (monatlich / alle 2, 3, 6, 12 Monate)
- Fixkosten-Kategoriefilter
- Sparziel mit Fortschrittsbalken (in Einstellungen aktivierbar)
- Spesen-Bearbeitung repariert (Mahlzeiten-Abzug, Saldo-Persistenz)
- Konto-Saldo folgt dem gewählten Monat (nicht mehr bis Jahresende)
- Sparen-Konsistenz (auch Sparen ohne Sparplan-Link zählt korrekt)
- Alle Dialoge im App-Design (keine weißen Browser-Popups mehr)
- Update-Manager mit Fortschrittsbalken + optionalem Backup vor Update
- Auto-Update-Infrastruktur (electron-updater) vorbereitet

## Wichtige Hinweise

- Deine Daten liegen NICHT im Projektordner, sondern unter
  `%APPDATA%\finanzverwaltung-pro\data.json`. Ein Neu-Bauen löscht deine Daten also nicht.
- Beim ersten Start einer selbstgebauten EXE zeigt Windows ggf. eine SmartScreen-Warnung
  („Unbekannter Herausgeber") — das ist normal ohne Code-Signatur, einmal
  „Weitere Informationen" → „Trotzdem ausführen".
