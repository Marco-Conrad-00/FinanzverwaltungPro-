# Finanzverwaltung Pro 1.0.58 – „Geld eingegangen"-Meldung + 2 Nachkommastellen

## ✨ Neu
- **„Geld ist eingegangen"-Meldung für wiederkehrende Einnahmen.**
  Ab dem hinterlegten **Stichtag** zeigt die App beim Start eine Meldung
  „Geld ist eingegangen" mit Quelle und Betrag – z. B. wenn die monatlichen
  5 € eingegangen sein sollten. Details:
  - Erscheint **einmal pro Monat je Einnahme** (kein wiederholtes Nerven bei
    jedem Start).
  - Zusätzlich optional als **Windows-Benachrichtigung** (nur bei laufender App).
  - Einnahmen ohne Stichtag gelten ab dem 1. des Monats.

- **Versicherungen: Betrag immer mit 2 Nachkommastellen.**
  Das Betragsfeld zeigt jetzt auch eine abschließende Null an (z. B. **79,90**
  statt 79,9).

## 📝 Geänderte Dateien
- `src/app.js` – neue Funktion `checkGeldEingang` (Stichtag-Prüfung +
  Meldung/Benachrichtigung, Dedupe via `_eingangNotified` pro Monat), Aufruf
  beim Start; Betragsfeld der Versicherung auf `toFixed(2)` + `step="0.01"`;
  CHANGELOG.

## ✅ Geprüft
- `node --check src/app.js` – Syntax OK
- `check.js` – 0 Fehler, 0 Warnungen
- Logiktest der Stichtag-Prüfung: nur bis heute fällige, aktive Einnahmen
  werden gemeldet; ausgelaufene, noch nicht fällige oder bereits gemeldete
  werden übersprungen.
