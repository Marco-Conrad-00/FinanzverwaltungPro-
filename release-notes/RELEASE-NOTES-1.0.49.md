# Finanzverwaltung Pro 1.0.49 – Positionen bei Spesen

## ✨ Neu
- **Unterpositionen bei Geschäftsreisen / Spesen.**
  Die aus Einkäufen und Ausgaben bekannte Aufteilung in Positionen gibt es
  jetzt auch in der Spesen-Tabelle – für **beide** Betragsspalten pro Reise:

  - **„Ausgaben" (Kosten für mich auf Reise, ±)** – z. B. Hotel, Parken,
    Verpflegung. Positionen dürfen auch **negativ** sein, um z. B. eine
    Gutschrift oder Erstattung direkt gegenzurechnen.
  - **„Auslagen"** – z. B. Tanken und Öl für den Firmenwagen getrennt erfasst.

  So kannst du pro Reise genau aufschlüsseln, woraus sich ein Betrag
  zusammensetzt, statt nur eine Gesamtsumme einzutragen.

### So funktioniert's
- In der jeweiligen Spalte auf das **⊞**-Symbol klicken → der bisherige
  Betrag wird die erste Position.
- Darunter öffnet sich ein Editor: pro Position **Beschreibung, Datum
  (optional) und Betrag**; mit **„+ Position"** weitere hinzufügen.
- Die Spalte zeigt dann die **Summe** und die Anzahl der Positionen und
  lässt sich über **▸ / ▾** ein- und ausklappen.
- **Saldo**, **„Zu überweisen"** sowie alle Monats- und Jahressummen werden
  automatisch aus der Positionssumme berechnet – es kann nichts auseinander
  laufen.
- **„Aufteilung entfernen"** macht aus den Positionen wieder einen einzelnen
  Betrag (die Summe bleibt erhalten). Wird die letzte Position gelöscht,
  steht das Feld wieder auf 0 und ist normal editierbar.

## 📝 Geänderte Dateien
- `src/app.js` – neue Spesen-Positionen-Logik (`speseSplitStart`,
  `speseAddPos`, `speseUpdatePos`, `speseDeletePos`, `speseRemoveSplit`,
  `speseTogglePos`, Hilfsfunktionen `spesePosSum`/`spesePosSync` und die
  Zellen-/Editor-Renderer), Einbindung in `speseRow` und die Spesen-Tabelle,
  CHANGELOG. Positionen liegen je Reise in `s.ausgabenPos` bzw. `s.auslagenPos`;
  solange sie gefüllt sind, ist das jeweilige Feld die gesperrte Summe.

## ✅ Geprüft
- `node --check src/app.js` – Syntax OK
- `check.js` – 0 Fehler, 0 Warnungen (ID-Quoting, Funktions-Exporte,
  keine Duplikate)
- Logiktest: Positionssumme (inkl. negativer Position) landet korrekt im
  Feld; Saldo und „Zu überweisen" werden daraus richtig berechnet;
  „Aufteilung entfernen" und Löschen der letzten Position funktionieren.
