# Finanzverwaltung Pro 1.0.71 – Verträge mit Kündigungsfristen

## ✨ Neu

- **Seite „Verträge" mit Kategorien.**
  „Versicherungen" heißt jetzt „📄 Verträge" und verwaltet alle Verträge.
  Oben filterst du nach Art: 🛡️ Versicherungen · ⚡ Energie ·
  📱 Telefon & Internet · 🔁 Abos · 📄 Sonstige (mit Anzahl).
  Bestehende Einträge werden beim ersten Start automatisch eingeordnet
  (Strom/Gas → Energie, Handy/DSL → Telefon & Internet, Netflix/Spotify → Abo,
  sonst Versicherung) – umstellbar im Feld „Art". Die Fixkosten bleiben die
  Gesamtübersicht über alle Abbuchungen.

- **Laufzeit & Kündigung.**
  Neue Felder je Vertrag: *Laufzeit bis*, *danach* (verlängert sich um 1/3/6/12/24
  Monate oder jederzeit kündbar), *Kündigungsfrist* (Wochen/Monate),
  *Preisgarantie bis*, *Kundennummer*, bei Energie *Zählernummer*.
  - Die App rechnet aus, **bis wann gekündigt werden muss** (z. B. Laufzeit bis
    31.12., Frist 1 Monat → kündigen bis 30.11.). Ist die Frist verpasst, gilt
    automatisch das nächste Laufzeitende.
  - Anzeige in der Vertragsliste und in den Fixkosten („✂️ kündbar bis …",
    ab 90 Tagen vorher; ab 30 Tagen rot).
  - **Erinnerungen** vor Ablauf der Kündigungsfrist und vor dem Ende einer
    Preisgarantie (Vorlauf wie bei den Ablauf-Erinnerungen, Einstellungen).
  - „🚫 Kündigen zum …" schlägt das passende Vertragsende vor; das
    Kündigungsschreiben nennt Vertrags-/Versicherungs-, Kunden- und
    Zählernummer.

- **Vertrag aus Fixkost anlegen (📄).**
  In der Fixkosten-Zeile legt 📄 einen verknüpften Vertrag an: Name, Betrag,
  Zahlweise (aus dem Rhythmus), Beginn, Vertragsende und bisherige
  Betragsänderungen werden übernommen, die Art wird erkannt. Danach Anbieter,
  Nummer und Frist ergänzen.

## 📝 Geänderte Dateien
- `src/app.js` – Vertragsarten (`VT_ARTEN`, `vtArt`, `vtMigrieren`),
  Laufzeit/Frist (`vtFristInfo`, `vtDatumPlusMonate`, …), neue Seite
  `versicherungen()` mit Filter und Abschnitt „Laufzeit & Kündigung",
  `fixVertragAnlegen`, Erinnerungen in `checkAblaufReminders`, Kündigen-Vorschlag,
  Kündigungsschreiben; CHANGELOG.
- `src/index.html` – Menüpunkt „📄 Verträge".

## ✅ Geprüft
- `node --check src/app.js`, `src/check.js` – 0 Fehler, 0 Warnungen
- Logiktests (Node): Verträge 17 Prüfungen (Arten, Monatsende-Rechnung,
  Kündigen bis 30.11./31.12./31.03., verpasste Frist → nächstes Ende,
  jederzeit kündbar in Wochen, Erinnerungen ohne Doppelte, Vertrag aus Fixkost
  monatlich/jährlich); Kopplung 22, Jahreswechsel/Verträge 41, Arbeitszeit
  14 + 38 weiterhin grün.
- Oberfläche im Browser (Testdaten): Filter, Vertrag aus Fixkost, Frist- und
  Preisgarantie-Erinnerung, Kündigen-Vorschlag, ✂️-Hinweis in den Fixkosten.

⚠️ **Bitte kurz prüfen**: ob deine bestehenden Einträge der richtigen Art
zugeordnet wurden.
