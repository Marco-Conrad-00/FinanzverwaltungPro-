# Finanzverwaltung Pro 1.0.35

**Datum:** 2026-07-23

Wartungs-Release mit mehreren Korrekturen an der Konto- und Depotlogik sowie
Verbesserungen der Übersicht unter „Sparen & Depot".

---

## Doppelzählung bei Umbuchungen und Wertpapierkäufen behoben

Wurde Geld von einem Konto auf ein anderes umgebucht und anschließend ein
Wertpapier gekauft, zählte der Betrag doppelt: Das Verrechnungskonto behielt den
Betrag rechnerisch, obwohl er längst investiert war.

**Beispiel** (1.000 € Start, 200 € Umbuchung, danach ETF-Kauf):

| | vorher | jetzt |
|---|---|---|
| Verrechnungskonto | 200,00 € | **0,00 €** |
| Depot | 200,00 € | 200,00 € |
| **Gesamt** | **1.200,00 €** | **1.000,00 €** |

Ursache war, dass die Kontostandsberechnung Wertpapierkäufe nicht als Abfluss vom
Verrechnungskonto berücksichtigt hat. Behoben – der investierte Betrag verlässt
das Konto jetzt korrekt.

---

## „Stand setzen" stapelte Korrekturen

Jeder Klick auf **„Stand setzen"** legte bisher eine *neue* Korrekturbuchung an,
ohne die vorherige zu entfernen. Bei mehrfacher Nutzung summierten sich die
Korrekturen auf und verfälschten den Saldo.

**Behoben:** Eine neue Korrektur ersetzt jetzt alle vorherigen desselben Kontos im
selben Monat. Der Zielwert bezieht sich auf den Saldo *ohne* die alten
Korrekturen. Stimmt der Saldo bereits, wird die überflüssige Korrektur entfernt.
„Stand setzen" kann damit bedenkenlos mehrfach verwendet werden.

---

## Fehler in der Kontenauswahl (Fixkosten) behoben

Beim Klick auf „Von Konto" oder „Zielkonto" brach die Auswahl mit einem
`ReferenceError` ab, bevor das Fenster erschien (ein Überbleibsel einer früheren
Dialog-Umstellung). Behoben und geprüft.

---

## Sparen & Depot übersichtlicher

Buchungen werden jetzt nach **Jahr → Monat** gruppiert und lassen sich
aufklappen. Standardmäßig ist nur der laufende Monat offen. „Alle auf/zu" klappt
alles gleichzeitig, und der Zustand bleibt beim Seitenwechsel erhalten.

---

## Umbuchungen: Wiederholung und Enddatum

Umbuchungen waren bisher reine Einzelbuchungen ohne Wiederholung. Neu:

- Schalter **1× / 🔁** für einmalige oder wiederkehrende Umbuchungen
- **Enddatum-Feld** wie bei den Fixkosten
- abgelaufene Einträge werden ausgegraut
- der Kontosaldo berücksichtigt wiederkehrende Umbuchungen für jeden aktiven Monat

---

## Bestände, Stückzahlen und Zuordnung

Fehlende Stückzahlen bei Sparraten (u. a. S&P 500 und ebase-Fondssparplänen)
wurden ergänzt und die Rundung geprüft. Die Anteile stimmen jetzt mit den
Broker-Werten überein; der maximale Rundungsfehler liegt bei 0,0003 % und ist
unkritisch. Sparraten ohne Wertpapier-Zuordnung landen nicht mehr fälschlich als
Einzelposition, sondern werden korrekt der jeweiligen Position zugeordnet.

---

## Validierung

`node --check` für `app.js`, `main.js` und `preload.js` fehlerfrei; interne
Prüfung ohne Fehler oder Warnungen. Getestet wurden u. a. das Umbuchungsszenario
(1.000 € bleiben 1.000 €), Kontosalden, Bestände × Kurse, Rundungsgenauigkeit und
der Anteilsabgleich gegen den Broker.

---

## Nach dem Update

Nach dem Einspielen einmal neu laden (**Ctrl+R**) und unter **Sparen & Depot →
Kurse aktualisieren** die Kurse frisch ziehen.
