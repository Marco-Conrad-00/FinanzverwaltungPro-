# Finanzverwaltung Pro 1.0.66 – Arbeitszeit: frühere Listen importieren

## ✨ Neu

- **Frühere Monate aus den Excel-Listen übernehmen.**
  Auf der Arbeitszeit-Seite unter „Export & Mail" gibt es den Knopf
  **„📥 Frühere Listen importieren"**. Du wählst eine oder mehrere bereits
  ausgefüllte DATEV-Listen (Mehrfachauswahl, startet im Zielordner).
  - Die Tage werden so übernommen, wie sie in den Listen **dokumentiert** sind
    (Beginn, Ende, Kürzel, Bemerkung, „aufgezeichnet am"). Ein erneuter Export
    ergibt dieselbe Liste.
  - Bereits in der App erfasste Tage bleiben unverändert; weichen sie von der
    Liste ab, zeigt die Vorschau beide Zeiten. Doppelter Import legt nichts
    doppelt an.
  - Funktioniert auch mit Listen, die in Excel nachbearbeitet wurden.

- **Vergleich mit den bisherigen Nebenjob-Werten.**
  Vor dem Übernehmen zeigt die Vorschau je **Lohnmonat**: Zeitraum, Stunden,
  Betrag aus Stunden × Stundenlohn, **bisheriger Wert in der App**, Differenz
  und den daraus folgenden Stundenlohn (hilft beim Nachtragen früherer Sätze).
  - Haken **„Berechnen"**: Der Monat wird künftig aus den Stunden berechnet.
  - Ohne Haken bleibt der bisherige Wert **fest** (Standard, wenn der
    Lohnzeitraum nur teilweise in den Listen steht – z.B. Juni, wenn die
    Mai-Liste fehlt).
  - Der **laufende Zeitraum** (z.B. 20.10.–heute) wird sofort berechnet und
    wächst mit jedem erfassten Tag.

- **Fester Nebenjob-Wert je Monat.**
  Unter **Einnahmen** lässt sich ein Monat mit „festen Wert eintragen" von der
  Berechnung ausnehmen und mit „aus Stunden berechnen" wieder zurückholen.

## 📝 Geänderte Dateien
- `src/arbeitszeit-xlsx.js` – `readMonth` / `readDateien`: ausgefüllte Listen
  lesen (Inline- und Shared-Strings, HHMM- und echte Excel-Uhrzeiten).
- `src/main.js` – IPC `arbeitszeit-import` (Mehrfachauswahl + Einlesen).
- `src/preload.js` – `arbeitszeitImport`.
- `src/app.js` – `azImportPlan` (Plan ohne Seiteneffekte), Vorschau-Dialog,
  `azImportAnwenden`; Flag `incomeByMonth[m].nebenjobFix` (von
  `azSyncEinnahmen` übersprungen) mit `azFixSetzen` / `azFixAufheben`;
  Hinweise im Bereich Einnahmen; CHANGELOG.

## ✅ Geprüft
- `node --check` für alle geänderten Dateien, `src/check.js` – 0 Fehler
- Einlesen der echten Listen Juni–Oktober 2026: alle fünf Dateien gelesen,
  erneutes Ausfüllen ergibt inhaltlich identische Listen.
- Import-Simulation (Node, 12 Prüfungen): neue Tage, identische Tage,
  Konflikt, unvollständiger Juni bleibt fest, Juli–Oktober berechnet,
  November aus 20.10.–heute, Re-Import ohne Duplikate, Fest/Berechnen
  umschalten; bisherige 38 Logiktests weiterhin grün.
- Oberfläche im Browser (Testdaten): Vorschau, Import per Klick,
  Einnahmen-Hinweis „fester Wert", Lohn-Kachel November.

⚠️ **Bitte kurz in der App testen**: Dateiauswahl-Dialog des Imports
(nur in Electron).
