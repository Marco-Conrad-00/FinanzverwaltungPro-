# Finanzverwaltung Pro 1.0.69 – Vertragsbetrag ab Datum ändern, Verträge prüfen

## ✨ Neu

- **Betrag eines Vertrags ab einem Datum ändern (✏️).**
  In der Fixkosten-Tabelle hat jede Zeile einen ✏️-Knopf. Neuen Betrag und
  „gilt ab" (Monat) eintragen – der Vertrag läuft weiter, nur der Betrag
  ändert sich ab diesem Monat. Frühere Monate behalten den alten Betrag,
  Kontostand und Auswertungen der Vergangenheit bleiben richtig. Mehrere
  Änderungen sind möglich; der Verlauf steht im Dialog und lässt sich dort
  einzeln entfernen. Unter dem Betrag zeigt die Tabelle „✏️ … seit/ab …".
  Mit ⚡ Dynamik: Termine bis zur Änderung gelten als im neuen Betrag
  enthalten, ab dem nächsten Termin rechnet die Dynamik darauf auf.

- **„Verträge prüfen" jederzeit und automatisch.**
  Knopf „🔍 Verträge prüfen" auf der Fixkosten-Seite: alle laufenden Verträge
  mit aktuellem Betrag, Rhythmus und Hinweisen; neuen Betrag und „gilt ab"
  nur dort eintragen, wo sich etwas geändert hat. Im Dialog einstellbar:
  automatische Erinnerung nie / jeden Monat / alle 3 / 6 / 12 Monate
  (Abfrage beim Start, „Später" fragt am nächsten Tag wieder).

- **Jahreswechsel-Assistent:** Ein dort geänderter Betrag wird als
  Betragsänderung ab der ersten Fälligkeit im neuen Jahr gespeichert;
  bestehende Änderungen werden mit übernommen.

## 📝 Geänderte Dateien
- `src/app.js` – `fixkostAenderung`, `fixkostBetrag` berücksichtigt
  `f.betraege = [{ ab, amount }]`; `fixkostBetragSetzen/-Loeschen`,
  `openBetragModal`, `vertraegePruefen`, `vertragsCheckPruefung`
  (`state.config.vertragsCheck`); Jahreswechsel (`jwBetraege`); CHANGELOG.

## ✅ Geprüft
- `node --check src/app.js`, `src/check.js` – 0 Fehler, 0 Warnungen
- Logiktests (Node, 41 Prüfungen im Jahreswechsel-/Vertrags-Test): Betrag ab
  Monat, mehrere Stufen, Ersetzen/Entfernen, Zusammenspiel mit Dynamik,
  Übernahme beim Jahreswechsel, Erinnerungs-Intervall; übrige Tests grün.
- Oberfläche im Browser (Testdaten): „Verträge prüfen" gespeichert,
  Kontostand und Monats-Fixkosten ändern sich erst ab dem gewählten Monat,
  Dialog „Betrag ändern" öffnet.
