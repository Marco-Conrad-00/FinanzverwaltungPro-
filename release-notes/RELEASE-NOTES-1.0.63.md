# Finanzverwaltung Pro 1.0.63 – Arbeitszeit: Lohn nach Abrechnungszeitraum

## ✨ Neu / geändert

- **Lohn je Abrechnungszeitraum statt je Kalendermonat.**
  Der Nebenjob-Lohn eines Monats umfasst jetzt die Arbeitstage vom
  **20. des Vormonats bis zum 19.** – Beispiel: Lohn **November** =
  **20.10.–19.11.** Dieser Betrag steht als Nebenjob-Einnahme im November
  (Kontostand, Cashflow, Analyse). Der Schalter „Nebenjob erhalten?" bleibt.
  - Ein Überhang nach der 6-h-Regel zählt dort, wo er dokumentiert ist:
    Samstag 20.06. mit 9 h → 6 h im Juli-Lohn, 3 h (Freitag 19.06.) im Juni-Lohn.
  - Auf der Arbeitszeit-Seite zeigt die Kachel **„Lohn <Monat>"** Zeitraum,
    Stunden und Betrag. In der Tabelle trennt eine gestrichelte Linie die
    Tage ab dem 20., die zum Lohn des Folgemonats gehören.
  - Im Bereich Einnahmen steht beim Nebenjob der Zeitraum dabei.
  - Die **DATEV-Listen** (Excel) bleiben wie bisher je **Kalendermonat**.

## 📝 Geänderte Dateien
- `src/app.js` – neue Helfer `azLohnMonat`, `azLohnZeitraum`, `azLohnSumme`
  (`AZ_LOHN_STICHTAG = 20`); `azSyncEinnahmen` ordnet nach Lohnzeitraum zu;
  Kachel, Trennzeile und Einnahmen-Hinweis angepasst; CHANGELOG.

## ✅ Geprüft
- `node --check src/app.js` – Syntax OK
- `src/check.js` – 0 Fehler, 0 Warnungen
- Logiktests (Node, 28 Prüfungen): Zuordnung 19./20., Jahreswechsel
  (20.12. → Januar-Lohn), Überhang über die Zeitraumgrenze, Einnahmen-Sync
  (24.10. → November, 21.11. inkl. Freitag 20.11. → Dezember), alle
  bisherigen Tests der 6-h-Regel, Stichtage und Mail weiterhin grün.
