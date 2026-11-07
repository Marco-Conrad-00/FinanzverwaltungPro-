# Finanzverwaltung Pro 1.0.64 – Arbeitszeit: Lohnzeitraum einstellbar

## ✨ Neu

- **Starttag des Lohnzeitraums selbst festlegen.**
  - In der **Einführung** (beim ersten Aktivieren) gibt es den neuen Schritt
    **„Lohnzeitraum – beginnt am Tag …"** mit Live-Vorschau, z.B.
    „Lohn November = 20.10.–19.11.".
  - Jederzeit änderbar in den **Einstellungen der Arbeitszeit-Seite**
    (Feld „Lohnzeitraum beginnt am Tag"). Die Nebenjob-Einnahmen werden
    sofort neu berechnet.
  - **Standard bleibt der 20.** – an bestehenden Daten ändert sich nichts.
    **1** = normaler Kalendermonat (1.–30./31.). Erlaubt sind 1–28, damit
    jeder Monat den Tag hat.
  - Der **Versand-Stichtag** (20. bzw. Sonntag davor) ist davon unabhängig
    und heißt jetzt zur Unterscheidung so.

## 📝 Geänderte Dateien
- `src/app.js` – Einstellung `arbeitszeitConfig.lohnStart` (Standard 20,
  geprüft 1–28) statt fester Konstante; `azLohnMonat` / `azLohnZeitraum`
  berücksichtigen Starttag 1 = Kalendermonat; neuer Helfer `azLohnBeispiel`;
  Feld in Einführung (Schritt 5) und Einstellungen; CHANGELOG.

## ✅ Geprüft
- `node --check src/app.js` – Syntax OK
- `src/check.js` – 0 Fehler, 0 Warnungen
- Logiktests (Node, 35 Prüfungen): Standard 20, Starttag 1 (Kalendermonat
  inkl. Februar-Ende), Starttag 15 inkl. Jahreswechsel, ungültige Werte
  → 20, Einnahmen-Sync je Starttag, alle bisherigen Tests weiterhin grün.
- Oberfläche im Browser (Testdaten): Starttag 15 in der Einführung → Vorschau
  „15.10.–14.11.", gespeichert, Lohn-Kachel, Trennlinie „ab 15." und
  Einnahmen-Hinweis passen.
