# Finanzverwaltung Pro 1.0.61 – Dynamik (automatische Erhöhung)

## ✨ Neu

- **Dynamik je Fixkost / Sparplan (⚡-Knopf).**
  In der Fixkosten-Tabelle hat jede Zeile jetzt einen **⚡-Knopf**. Damit legst
  du fest, dass sich der Betrag **ab einem Stichtag automatisch erhöht**:
  - Art: **Betrag (€)** oder **Prozent (%)**
  - **Ab Monat**, **Intervall** (einmalig / jährlich / alle 6 / 3 / monatlich)
    und optional ein **Ende**
  - Beispiel Renten-Sparplan: **+27,35 € ab nächstem Stichtag**.
  - Die Erhöhung wirkt **überall automatisch**: Abbuchung & Kontostand,
    automatischer Sparplan-Kauf (Stückzahl) und alle Summen/Prognosen.
  - Das Eingabefeld bleibt der **Grundbetrag**; der aktuell gültige Betrag
    steht als **⚡-Hinweis** daneben.

- **Aussetzen – komplett oder je Termin.**
  - Schalter **„Dynamik aktiv"** pausiert die gesamte Dynamik (= Grundbetrag).
  - In der **Terminliste** kannst du einzelne Erhöhungen **abhaken**
    (aussetzen) – praktisch, wenn du z.B. eine jährliche Versicherungs-Dynamik
    einmal nicht mitmachen willst.
  - **Vorschau** je Termin zeigt den dann gültigen Betrag. Prozent-Dynamik
    wirkt **zusammengesetzt** und wird je Schritt auf Cent gerundet.
  - Beim **Jahreswechsel** wird die Dynamik mit übernommen (eigene Kopie je Jahr).

## 📝 Geänderte Dateien
- `src/app.js` – neue Helfer `fixkostBetrag` / `dynamikTermine` /
  `fixkostBetragAktuell` / `hatAktiveDynamik`; der effektive Monatsbetrag
  (statt `f.amount`) in allen Berechnungen: `fixkostenTotal`, `kontoNetBis`
  (Fixkosten + Sparen-Transfer), `kontoCashflowMonat`, Jahres-Prognose,
  Analyse-Kontobaum, Finanzprodukt-Beitragssumme und der automatischen
  Sparplan-Eintragung (Betrag + Stückzahl). Neuer Dialog `openDynamikModal`
  (⚡-Knopf + Betrag-Badge in der Tabelle); Dynamik-Übernahme beim
  Jahreswechsel; CHANGELOG.

## ✅ Geprüft
- `node --check src/app.js` – Syntax OK
- `src/check.js` – 0 Fehler, 0 Warnungen
- Logiktests (Node): Betrags-Dynamik (+27,35 € ab Stichtag → 302,98 €,
  einmalig stabil); %-Dynamik zusammengesetzt (200 → 207 → 214,24 → 221,74);
  einzelner Termin ausgesetzt; komplett ausgesetzt = Grundbetrag; Ende begrenzt
  die Termine.
