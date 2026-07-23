# Finanzverwaltung Pro 1.0.29

**Datum:** 2026-07-23
**Thema:** Jahresbericht als mehrseitiges PDF

---

## Was der Bericht vorher enthielt

Nur eine einzige Seite mit einer Monatstabelle (Gehalt, Nebenjob, Fixkosten,
Einkäufe, Ausgaben, Cashflow). **Zählerstände, Konten, Kategorien, Depot, PV und
Reisen fehlten vollständig.**

---

## Neue Abfrage vor dem Erstellen

Beim Klick auf „Jahr archivieren" kommt jetzt zuerst die Frage, was gewünscht ist:

**📄 Zwischenstand** – PDF mit dem heutigen Stand. Das Jahr bleibt offen, es wird
nichts verändert, kein Backup, kein Neues-Jahr-Dialog.

**📦 Jahr abschließen** – derselbe Bericht als Jahresabschluss, zusätzlich
JSON-Backup und anschließend die Option, das Folgejahr anzulegen.

In den Einstellungen unter **Konten & Jahre** stehen beide Schaltflächen direkt
nebeneinander.

---

## Der Bericht: drei Seiten

**Seite 1 – Überblick**
- Kopfzeile mit Name, Stichtag und Akzentlinie im App-Design
- Sechs Kennzahlen: Einnahmen, Ausgaben, Cashflow, Gehalt, Fixkosten, Einkäufe
- Monatsübersicht mit hervorgehobener Summenzeile

**Seite 2 – Vermögen & Struktur**
- Konten mit Art (Cashflow / Reserve), Startwert und aktuellem Saldo
- Ausgaben nach Kategorie, absteigend sortiert, mit Anteil in Prozent und Balken
- Sparen & Depot mit aktuellem Kurswert, sofern ETF-Daten vorliegen

**Seite 3 – Verbrauch & Reisen**
- Zählerstände nach Typ getrennt (Strom, Gas, …), je Ablesung der Verbrauch
  seit der vorherigen und der Gesamtverbrauch
- PV-Anlage im Jahresvergleich mit Produktion, Verbrauch, Bezug, Einspeisung und
  Ø Autarkie – nur wenn der Bereich aktiviert ist
- Geschäftsreisen mit Land, Kunde und Verpflegungspauschale

Seite 3 entfällt automatisch, wenn keine dieser Daten vorhanden sind.

**Ein Beispiel liegt bei:** `Beispiel-Zwischenstand.pdf` (mit Testdaten erzeugt).

---

## Technische Details

| Datei | Änderung |
|---|---|
| `src/app.js` | `buildJahresberichtHTML` neu, `berichtDatenSammeln`, `zwischenstandPdf`, `archiveYear` mit Auswahl |
| `package.json` | → 1.0.29 |

Das PDF nutzt eigene Farbkonstanten (`PDF_FARBEN`) statt der CSS-Variablen der
App – gedruckt wird auf Weiß, ein dunkler Hintergrund wäre dort unbrauchbar. Die
Akzentfarbe orientiert sich am App-Türkis.

Jeder Datenblock ist einzeln abgesichert: Fehlt eine Datenquelle oder wirft sie
einen Fehler, bleibt der Abschnitt leer, statt den ganzen Bericht scheitern zu
lassen.

---

## Validierung

```
node --check app.js / main.js / preload.js   ✓
node check.js .                              ✓ Keine Fehler, 0 Warnungen
```

**Bericht mit Testdaten erzeugt und tatsächlich als PDF gerendert** – alle drei
Seiten wurden zur Kontrolle als Bild geprüft:

| Prüfung | Ergebnis |
|---|---|
| Titel, Kennzahlen, Monatstabelle | vorhanden |
| Konten, Kategorien, Depot | vorhanden |
| Zähler (Strom + Gas getrennt) | vorhanden |
| PV-Anlage, Geschäftsreisen | vorhanden |
| Seitenumbrüche | 2 → genau 3 Seiten |
| `undefined` / `NaN` im Dokument | keins |

---

## Nach dem Einspielen

**Reload:** nur `app.js` geändert → **Ctrl+R**.

**Versionierung:** `package.json` steht auf **1.0.29**; mit dem automatischen Bump
landest du auf **1.0.30**.
