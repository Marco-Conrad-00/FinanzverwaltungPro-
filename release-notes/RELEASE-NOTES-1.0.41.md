# Version 1.0.41

## Neu

**Auslagen & Erstattungen** – In „Spesen & Reisen" gibt es jetzt einen eigenen
Bereich für verauslagtes Geld, das dir erstattet wird (z.B. Öl oder Tanken für
den Firmenwagen). Pro Eintrag lassen sich Datum, Beschreibung, Kategorie und
Betrag erfassen und der Status auf **offen** oder **erstattet** (mit
Erstattungsdatum) setzen. Erfassung wie bei den Zählerständen direkt über eine
Eingabezeile am Ende der Liste.

**Kennzahl „Offene Erstattungen"** – zeigt auf einen Blick, wie viel Geld dir
noch erstattet werden muss, plus eine Summe „bereits erstattet".

## Hinweis zur Verrechnung

Diese Auslagen sind bewusst **von den normalen Einnahmen/Ausgaben getrennt**:
Es sind reine Durchlaufposten (du zahlst und bekommst es zurück), daher zählen
sie nicht ins Einnahmen-/Ausgaben-Ergebnis und verfälschen deine Zahlen nicht.

## Technisch

- Geänderte Dateien: `src/app.js`
- Neue Jahres-Sammlung `erstattungen` (in `YEAR_FIELDS`, Default-Jahr, Reset,
  Papierkorb integriert); neue Funktionen `erstattungenCard`,
  `quickAddErstattung`, `updateErstattung`, `setErstattungStatus`,
  `deleteErstattung` inkl. `window`-Export.
- `check.js` fehler- und warnungsfrei; Render- und Persistenzpfad getestet.
