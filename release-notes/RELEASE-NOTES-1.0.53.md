# Finanzverwaltung Pro 1.0.53 – Versicherung manuell mit Fixkost verknüpfen

## ✨ Neu
- **Manuelle Verknüpfung Versicherung ↔ Fixkost.**
  Beim „Verknüpfen" einer Versicherung sucht die App weiterhin automatisch nach
  einer gleichnamigen Fixkost. Wird **keine** gefunden, öffnet sich jetzt ein
  Auswahl-Dialog:
  - Du siehst **alle bestehenden Fixkosten** (mit Betrag und Kategorie) und
    kannst per Klick eine davon **manuell verknüpfen** – auch wenn sie anders
    heißt als die Versicherung.
  - Alternativ **„➕ Neue Fixkost anlegen"** wie bisher (Betrag automatisch auf
    Monatsbasis).
  - Oder abbrechen.

  Damit lassen sich Versicherungen auch dann mit einer Fixkost verbinden, wenn
  die Namen nicht übereinstimmen.

## 📝 Geänderte Dateien
- `src/app.js` – neue Funktion `askFixkostWahl` (Auswahl-Dialog mit
  bestehenden Fixkosten + „neu anlegen"); `versLinkFixkost` nutzt sie im
  Nicht-Treffer-Fall statt nur „anlegen/abbrechen"; CHANGELOG.

## ✅ Geprüft
- `node --check src/app.js` – Syntax OK
- `check.js` – 0 Fehler, 0 Warnungen
