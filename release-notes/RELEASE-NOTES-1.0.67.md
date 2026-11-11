# Finanzverwaltung Pro 1.0.67 – Arbeitszeit: Zuschläge & sicherer Import

## ✨ Neu

- **Sonntags- und Feiertagszuschlag.**
  Auf der Arbeitszeit-Seite unter **„Stundenlohn"** gibt es zwei neue Felder:
  **Sonntagszuschlag (%)** und **Feiertagszuschlag (%)** (gesetzliche
  Feiertage Baden-Württemberg).
  - Beispiel: 15 €/h, Sonntag +50 % → 5:45 h am verkaufsoffenen Sonntag =
    129,38 € statt 86,25 €.
  - Die Tabelle markiert betroffene Tage mit „+50 % Zuschlag"; Lohn,
    Nebenjob-Einnahme und der Import-Vergleich rechnen ihn automatisch ein.
  - Fallen Sonntag und Feiertag zusammen, gilt der **höhere** Satz
    (nicht addiert). Maßgeblich ist der in der DATEV-Liste dokumentierte Tag.
  - Standard 0 % – an bestehenden Berechnungen ändert sich erst etwas, wenn
    du einen Zuschlag einträgst.

## 🐛 Behoben

- **Import: kein versehentliches Überschreiben mit 0 €.**
  Monate, für deren Lohnzeitraum noch kein Stundenlohn hinterlegt ist, sind in
  der Import-Vorschau nicht mehr vorab angehakt. Wird so ein Monat trotzdem
  angehakt und hat er einen bisherigen Wert, fragt die App vor dem Übernehmen
  nach.

## 📝 Geänderte Dateien
- `src/app.js` – `azZuschlagProzent` / `azZeilenBetrag` (nutzt
  `bwFeiertageSet`), Einstellungen `zuschlagSonntag` / `zuschlagFeiertag`
  in `arbeitszeitConfig`, Felder unter „Stundenlohn", Hinweis in der Tabelle;
  Import-Vorbelegung `uebernehmen` berücksichtigt fehlenden Stundenlohn,
  Rückfrage vor dem Übernehmen; CHANGELOG.

## ✅ Geprüft
- `node --check src/app.js`, `src/check.js` – 0 Fehler, 0 Warnungen
- Mit den echten Listen Juni–Oktober 2026, 15 €/h und 50 % Sonntag:
  September 500,00 €, Oktober 554,38 € (511,25 € + 43,13 € Zuschlag).
- Logiktests (Node): 38 + 17 Prüfungen, u.a. Sonntag/Samstag, Feiertag
  3.10./1.11., Sonntag+Feiertag → höherer Satz, Import ohne Stundenlohn
  → kein Haken.
- Oberfläche im Browser (Testdaten): Zuschlagsfelder, Sonntagszeile
  „+50 % Zuschlag" mit 129,38 €.
