# Version 1.0.38

## Neu

**Uhrzeit bei Zählerständen** – Neben dem Datum lässt sich jetzt auch eine
Uhrzeit erfassen. Beim Anlegen eines neuen Zählerstands wird sie automatisch
mit der aktuellen Uhrzeit vorbelegt, kann aber überschrieben werden. In der
Zählerstand-Tabelle gibt es dafür eine neue Spalte „Uhrzeit", die sich wie das
Datum direkt bearbeiten lässt. Bestehende Einträge ohne Uhrzeit bleiben gültig
(leeres Feld).

**Taschenrechner bei Spesen-Ausgaben und -Auslagen** – Neben den Feldern
„Ausgaben" und „Auslagen" in der Spesen-Tabelle sowie beim Auslagen-Feld im
Reise-Dialog steht jetzt ein Rechner-Knopf (🧮). Er öffnet den bereits in der
App vorhandenen Taschenrechner, übernimmt den aktuellen Feldwert als Startwert
und schreibt das Ergebnis nach „Übernehmen" zurück – die Spesenzeile rechnet
sich dabei automatisch neu.

## Technisch

- Geänderte Dateien: `src/app.js`, `src/index.html`
- Der Taschenrechner nutzt die bestehende `openCalc()`-Funktion; es wurde kein
  zweiter Rechner eingeführt.
- `check.js` läuft fehler- und warnungsfrei (Syntax, keine doppelten
  Funktionen, alle onclick-IDs gequotet, alle onclick-Funktionen exportiert).
- Reload: `app.js` + `index.html` → Ctrl+R genügt, kein Neustart nötig.
