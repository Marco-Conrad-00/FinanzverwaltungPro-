# Finanzverwaltung Pro 1.0.26

**Datum:** 2026-07-22

---

## Fehler behoben: Reisen rechneten mit veralteten Spesensätzen

Deine Reise vom 07.07.2026 in die Schweiz zeigte **43,00 €** statt der ab 2026
gültigen **47,00 €**.

**Ursache:** Beim Anlegen einer Reise wurden die damals gültigen Sätze in der
Reise selbst gespeichert (`rateHalf` / `ratePerDay`) und danach nie wieder
angepasst. Die Berechnung las ausschließlich diese gespeicherten Werte – die
aktualisierte Ländertabelle wurde nur beim *Neuauswählen* des Landes wirksam.

**Meine Fehleinschätzung dazu:** In den Release Notes zu 1.0.24 hatte ich das als
gewolltes Verhalten beschrieben („Reisen aus 2025 sollen nach damaligem Recht
abgerechnet bleiben"). Für eine Reise mit Datum **2026** ist das schlicht falsch –
dort muss der 2026er-Satz gelten.

### Behebung
- Die Sätze werden jetzt aus **Land und Reisedatum** ermittelt, nicht aus dem
  Zeitpunkt der Erfassung
- Bestehende Reisen **ab 2026** werden beim nächsten Start einmalig neu berechnet
- Reisen aus **früheren Jahren bleiben unangetastet** – dort ist die ursprüngliche
  Logik tatsächlich richtig
- Ist ein Land nicht in der Tabelle (z. B. eigene Eingabe), bleiben die
  gespeicherten Werte erhalten

---

## Reiter in den Einstellungen überdecken nichts mehr

Die Tab-Leiste blieb beim Scrollen oben stehen, war aber nicht vollständig
deckend – Inhalt lief sichtbar dahinter durch.

Behoben durch einen deckenden Hintergrund, der auch die seitliche Polsterung des
Scrollbereichs abdeckt (20 px oben, 24 px seitlich – im Kompaktmodus entsprechend
weniger), plus einen weichen Schatten zur Abgrenzung.

---

## Technische Details

| Datei | Änderung |
|---|---|
| `src/app.js` | `spesenSaetzeFuerReise`, `calcSpesen` neu, Migration v4, `spesenNeuBerechnen` |
| `src/styles.css` | `.settings-tabs` deckend mit `::before`-Abdeckung |
| `package.json` | 1.0.25 → 1.0.26 |

**Migration v4:** Reisen mit `dateFrom >= 2026` werden markiert und beim Start
einmalig durch `calcSpesen` geschickt. `dataVersion` steigt von 3 auf 4.

---

## Validierung

```
node --check app.js / main.js / preload.js   ✓
node check.js .                              ✓ Keine Fehler, 0 Warnungen
```

**Der gemeldete Fall:**

| | |
|---|---|
| gespeichert | 43/64 (Stand 2025) |
| nach Neuberechnung | 47/70 |
| Anzeige | **47,00 €** ✓ |

**Weitere Prüfungen – alle bestanden:**

| Fall | Ergebnis | erwartet |
|---|---|---|
| Deutschland, 1 halber Tag | 14,00 € | 14,00 € |
| Deutschland, 2 halbe + 2 volle Tage | 84,00 € | 84,00 € |
| Schweiz / Bern, 1 ganzer Tag | 82,00 € | 82,00 € |
| Belgien, 2 halbe Tage | 80,00 € | 80,00 € |
| Afghanistan (nicht gelistet) → Luxemburg | 42,00 € | 42,00 € |
| Schweiz, 1 halber Tag + 1× Frühstück | 33,00 € | 33,00 € |

Die Mahlzeitenkürzung rechnet weiterhin korrekt mit dem *neuen* vollen Tagessatz
(20 % von 70 € = 14 €).

**Migration getestet:** Von fünf Testreisen wurden genau die zwei aus 2026
markiert; die Reise aus 2025 sowie Einträge ohne Datum oder Land blieben
unberührt.

---

## Nach dem Einspielen

**Reload:** `app.js` und `styles.css` sind Renderer-Dateien → **Ctrl+R**.

Beim ersten Start nach dem Update werden die betroffenen Reisen automatisch neu
berechnet. In der Entwicklerkonsole erscheint dazu eine Zeile
(`[Spesen] n Reise(n) auf aktuelle Sätze gebracht`).

**Versionierung:** `package.json` steht auf **1.0.26**; mit dem automatischen Bump
landest du auf **1.0.27**.
