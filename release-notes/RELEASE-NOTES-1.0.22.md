# Finanzverwaltung Pro 1.0.22

**Datum:** 2026-07-22

Enthält die neuen Dashboard-Diagramme sowie – falls noch nicht eingespielt – den
Dark-Mode-Farbfix und die Installer-Grafiken aus 1.0.21.

---

## Dashboard: Diagramm anklickbar

Ein Klick auf ein Tortenstück, einen Balken **oder einen Eintrag in der Legende**
klappt darunter alle Einzelbuchungen dieser Kategorie auf:

- Datum, Beschreibung und Betrag je Posten, absteigend sortiert
- Kopfzeile mit Anzahl der Posten und Gesamtsumme
- Erneutes Klicken schließt wieder, ebenso das ×
- Das gewählte Segment wird hervorgehoben, die übrigen treten zurück
- Bei vielen Posten scrollt die Liste, statt das Dashboard zu sprengen

## Fünf Diagramme statt einem

Umschaltbar über die Pfeile **‹ ›** in der Kartenüberschrift:

| Ansicht | Inhalt |
|---|---|
| Ausgaben nach Kategorie | wie bisher (Standard) |
| Ausgaben nach Konto | welches Konto wie stark belastet wird |
| Ausgaben im Jahresverlauf | Balken je Monat, Klick zeigt den Monat im Detail |
| Einnahmen vs. Ausgaben | direkter Vergleich des aktuellen Monats |
| Größte Einzelposten | die acht teuersten Buchungen |

Die Punkte unter dem Diagramm zeigen die Position und erlauben den direkten
Sprung. Die zuletzt gewählte Ansicht bleibt gespeichert.

> Bei „Einnahmen vs. Ausgaben" ist das Aufklappen für die Einnahmen-Seite
> deaktiviert, da sich Gehalt und sonstige Einnahmen nicht als Einzelposten
> derselben Art auflisten lassen.

## Nebenbei behoben

Die Diagrammfarben waren **fest kodiert** und haben deine eingestellte
Akzentfarbe ignoriert. Sie richten sich jetzt danach. Außerdem war die
Segment-Umrandung fest auf Weiß gesetzt, was im dunklen Modus störte – sie nutzt
nun die Kartenfarbe. Die Achsen- und Legendenbeschriftung war im dunklen Modus
schlecht lesbar und folgt jetzt der Textfarbe.

---

## Technische Details

### Geänderte Dateien
| Datei | Änderung |
|---|---|
| `src/app.js` | `DASH_CHARTS`, `dashDaten`, `dashDrilldownHtml`, `renderCharts` neu; Dashboard-Karte |
| `package.json` | 1.0.21 → 1.0.22 |

### Gespeicherter Zustand
```
state.config.dashChart = 0..4     // gewählte Ansicht
state.config.dashDrill = 'Kleidung' | null   // aufgeklappte Kategorie
```
Liegt in `config`, das bereits in der `loadData`-Allowlist steht.

### Neue Funktionen
`dashChartIdx`, `dashChartSetzen`, `dashChartWechseln`, `dashPosten`, `dashDaten`,
`summe`, `dashFarben`, `dashDrilldownHtml`, `dashDrillOeffnen`, `dashDrillSchliessen`

---

## Validierung

```
node --check app.js / main.js / preload.js   ✓
node check.js .                              ✓ Keine Fehler, 0 Warnungen
```

`check.js` hat unterwegs eine ungequotete ID in einem `onclick` bemängelt – korrigiert.

**Alle fünf Diagramme mit Testdaten durchgerechnet:**

| Ansicht | Ergebnis |
|---|---|
| Kategorie | Kleidung 89,90 · Lebensmittel 83,40 · Essen 64,50 · Abos 17,99 |
| Konto | Girokonto 160,19 (3) · Trade Republic 95,60 (2) |
| Jahresverlauf | Jun 30,00 · Jul 255,79 |
| Einnahmen/Ausgaben | 3.200,00 gegen 255,79 |
| Top-Posten | korrekt absteigend sortiert |

Alle Ansichten des aktuellen Monats summieren übereinstimmend auf **255,79**.

**Randfälle geprüft:**
- Korrektur-Buchungen (`_korrektur`) bleiben ausgeschlossen ✓
- Der Kategorie-Chart zeigt nur den laufenden Monat, nicht das Vormonats-Beispiel ✓
- Einkäufe ohne `desc` greifen auf den Shop-Namen zurück ✓
- Aufklappen erzeugt korrektes HTML mit Posten und Summe ✓
- Erneutes Klicken schließt ✓
- Blättern springt korrekt um (0 → zurück → 4 → vor → 0) ✓

---

## Nach dem Einspielen

**Reload:** nur Renderer-Dateien geändert → **Ctrl+R**.

**Versionierung:** `package.json` steht auf **1.0.22**; mit dem automatischen
Bump landest du auf **1.0.23**.
