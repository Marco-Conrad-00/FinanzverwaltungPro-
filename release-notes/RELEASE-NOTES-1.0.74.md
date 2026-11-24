# Finanzverwaltung Pro 1.0.74 – Arbeitszeit: Pausenregel

## ✨ Neu

- **„Pausenregel ab"** in den Arbeitszeit-Einstellungen. Ab diesem Datum wird
  nichts mehr auf den Vortag verschoben. Dauert ein Arbeitstag länger als 6 h,
  kommen in der dokumentierten Liste 30 min Pause dazu
  (Beispiel: 09:00–15:30 → 09:00–16:00, Pause 0:30, Bemerkung „30 min Pause").
  Gezahlt bzw. in die Einnahmen übernommen wird weiterhin die echte Zeit.
  Tage davor bleiben unverändert (alte Regel).
- **Verschobene Stunden zusammenführen**: Beim Setzen des Datums sucht die App
  Paare aus „Vortag bis 20:00" + „genau 6 h am Tag" ab dem Stichtag und schlägt
  vor, sie zu einem Eintrag mit der echten Zeit zusammenzuführen (Vorschau mit
  Häkchen, auffällig lange Vortage sind zur Prüfung markiert). Auch später über
  den Link in den Einstellungen erreichbar.
- **Excel**: Die Pause landet in Spalte D („Pause") der DATEV-Liste; beim Import
  wird sie wieder abgezogen.

## 📝 Geänderte Dateien
- `src/app.js` – Pausenregel in `azDokuZeilen`, `azUeberhangPlan`/`-Anwenden`/
  `-Dialog`, Einstellung `pausenRegelAb`, Import, CHANGELOG.
- `src/arbeitszeit-xlsx.js` – Spalte D schreiben/lesen.

## ✅ Geprüft
- `node --check`, `src/check.js` – 0 Fehler, 0 Warnungen
- Node-Tests: Pausenregel (über/genau 6 h, Stichtag), Zusammenführen
  (Monatsstunden bleiben gleich), Import mit Pause, bestehende Testreihen
- Bitte kurz in der App testen: Excel-Export mit Pause-Spalte
