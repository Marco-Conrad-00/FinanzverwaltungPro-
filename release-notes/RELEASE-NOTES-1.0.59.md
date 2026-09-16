# Finanzverwaltung Pro 1.0.59 – Spesen-„erhalten", Auslagen voll abgebildet, Reiter anordnen

## ✨ Neu

- **Spesen: „erhalten"-Schalter je Reise (analog Gehalt).**
  In der Spesen-Tabelle gibt es pro Reise einen Schalter **✓ erhalten / ⏳ offen**.
  Erst wenn eine Reise als „erhalten" markiert ist, zählt ihr **Spesen-Saldo**
  (Pauschale − meine Kosten) zum ausgewählten Konto. Solange sie „offen" ist,
  beeinflusst sie den Kontostand nicht – der Saldo wird ausgegraut.
  - Standard: **vergangene Monate = erhalten**, **laufender/kommender Monat =
    erst nach Bestätigung**. So bleiben die Kontostände korrekt, obwohl die
    Spesen meist erst zum Monatsende ausgezahlt werden.

- **Auslagen & Erstattungen jetzt voll abgebildet (statt nur Info).**
  Verauslagtes Geld wirkt sich jetzt auf den Kontostand aus:
  - Die **Auslage** mindert ab ihrem **Datum** das zugeordnete Konto.
  - Sobald der Eintrag auf **🟢 erstattet** steht, kommt der Betrag am
    **Erstattungsdatum** wieder herein.
  - So ist die **Delle** im Kontostand sichtbar, bis dir das Geld zurückgezahlt
    wurde. Danach ist der Netto-Effekt wieder 0 (reiner Durchlauf mit Timing).
  - Neu: **pro Eintrag ein Konto wählbar** (🏦-Knopf in der Zeile).
  - **Hinweis:** Bereits erfasste **offene** Auslagen mindern damit rückwirkend
    den Kontostand. Für längst erledigte Posten einfach den Status auf
    „erstattet" mit Erstattungsdatum setzen – dann heben sie sich auf.

- **Reiter der Seitenleiste frei anordnen.**
  Unter **Einstellungen → Darstellung → „Reiter-Reihenfolge"** lassen sich die
  Menüpunkte je Gruppe (Übersicht / Monatsauswertung / Planung / Verwaltung)
  mit **▲/▼** in die Wunschreihenfolge bringen. Die Gruppen selbst bleiben in
  fester Reihenfolge. „Auf Standard zurücksetzen" stellt die ursprüngliche
  Reihenfolge wieder her.

## 📝 Geänderte Dateien
- `src/app.js` – `speseReceived`/`toggleSpeseReceived` + Gate in `kontoNetBis`,
  `kontoCashflowMonat`, `monthFinancials`; „erhalten"-Toggle in der Spesen-Zeile;
  Auslagen/Erstattungen mit `kontoId` + `pickErstattungKonto`, volle Konto-
  Wirkung in denselben Rechenstellen; Navigations-Reihenfolge
  (`NAV_DEF`, `applyNavOrder`, `moveNavItem`, `resetNavOrder`, `navOrderCard`)
  + Aufruf beim Start; CHANGELOG.
- `src/index.html` – `data-sec`-Kennzeichnung der Seitenleisten-Gruppen.

## ✅ Geprüft
- `node --check src/app.js` – Syntax OK
- `src/check.js` – 0 Fehler, 0 Warnungen
- Logiktests (Node):
  - Spesen: vergangene Reise zählt automatisch, laufende erst nach „erhalten";
    unbezahlte CH-Reise = 0 aufs Konto, nach „erhalten" = Pauschale − Kosten.
  - Auslagen: offen = −Betrag ab Datum; erstattet = netto 0 nach
    Erstattungsdatum; „erstattet" mit künftigem Datum bleibt vorerst −Betrag;
    tagesgenau im laufenden Monat.
  - Reiter-Reihenfolge: Verschieben, Grenzen (erste/letzte), Bereinigung
    unbekannter Schlüssel + Anhängen neuer Standard-Reiter.
