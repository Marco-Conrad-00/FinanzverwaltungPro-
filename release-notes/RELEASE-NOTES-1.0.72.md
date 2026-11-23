# Finanzverwaltung Pro 1.0.72 – „Mein Anteil" bei Verträgen

## ✨ Neu

- **Mein Anteil (%).** Neues Feld beim Vertrag (Seite „Verträge"). Für Verträge,
  die du nur anteilig trägst, weil jemand anderes einen Teil erstattet:
  - Der Vertrag führt den **vollen Beitrag** laut Versicherer, die verknüpfte
    Fixkost **deinen Anteil**.
  - Betragsänderungen werden in beide Richtungen umgerechnet, z. B. 20,00 €
    voll bei 50 % = 10,00 € in den Fixkosten; 60,00 €/Jahr bei 50 % = 30,00 €
    jährlich.
  - Unter dem Feld steht „Dein Anteil: … / Zahlweise"; „≈ … / Monat" zeigt
    ebenfalls deinen Anteil.
  - Standard 100 % – bestehende Verträge ändern sich nicht.

## 📝 Geänderte Dateien
- `src/app.js` – `versAnteil`, Umrechnung `versZuFix`/`fixZuVers` und
  `versMonthly` berücksichtigen den Anteil; Feld „Mein Anteil (%)" im
  Vertrags-Detail; CHANGELOG.

## ✅ Geprüft
- `node --check src/app.js`, `src/check.js` – 0 Fehler, 0 Warnungen
- Logiktests (Node): Kopplung 27 Prüfungen (u. a. 50 % jährlich/monatlich,
  Änderung in beide Richtungen, ungültiger Anteil = 100 %), Verträge 17,
  Jahreswechsel 41, Arbeitszeit 14 + 38 weiterhin grün.
