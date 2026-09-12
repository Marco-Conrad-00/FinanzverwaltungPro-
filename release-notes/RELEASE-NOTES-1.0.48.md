# Finanzverwaltung Pro 1.0.48 – Vertragsende bei Fixkosten

## ✨ Neu
- **Eigenes Feld „Vertragsende / läuft aus" bei Fixkosten.**
  Fixkosten mit einem echten Laufzeitende (z. B. eine Finanzierung über
  2 oder 3 Jahre, ein befristeter Handyvertrag) haben jetzt ein separates,
  optionales Feld `Vertragsende`. Es ist bewusst getrennt von der
  jährlichen Angabe „Gültig bis", damit das echte Enddatum nicht mit der
  Jahresgrenze (Dezember) verwechselt wird.

- **Vertragsende wird beim Jahreswechsel automatisch übernommen.**
  Beim Jahreswechsel-Assistenten bleibt das Vertragsende erhalten und
  wird korrekt über die Jahre hinweg mitgeführt:
  - Läuft der Vertrag erst in 1–3 Jahren aus, wird er jedes Jahr wieder
    übernommen – das Vertragsende bleibt gespeichert.
  - Im Ablaufjahr wird die jährliche Gültigkeit automatisch auf den
    Ablaufmonat begrenzt (statt bis Dezember).
  - Ist der Vertrag vor dem neuen Jahr bereits abgelaufen, wird er beim
    Jahreswechsel **nicht mehr** übernommen.
  So muss man nicht mehr selbst daran denken – der Vertrag läuft von
  allein aus.

- **Ablauf-Erinnerung nutzt das echte Vertragsende.**
  Die automatische Ablauf-Erinnerung beim App-Start berücksichtigt jetzt
  zuerst das echte `Vertragsende`. Dadurch wird rechtzeitig (Standard:
  2 Monate Vorlauf) an das tatsächliche Auslaufen erinnert – unabhängig
  von der jährlichen „Gültig bis"-Grenze.

## 🐛 Behoben
- **Dezember-Überschreiben beim Jahreswechsel korrigiert.**
  Befristete Verträge verloren bisher beim Jahreswechsel ihr echtes
  Enddatum, weil die jährliche Gültigkeit pauschal auf Dezember gesetzt
  wurde. Mit dem getrennten Vertragsende bleibt das Datum jetzt erhalten.

## 📝 Geänderte Dateien
- `src/app.js` – neues Feld `laufzeitEnde` in Fixkosten-Modal-Logik
  (`openFixkostenModal`, `saveFixkostenModal`), neue Spalte „Vertragsende"
  in der Fixkosten-Tabelle, Jahreswechsel-Übernahme (`confirmNewYear`)
  mit Erhalt/Begrenzung des Vertragsendes, `checkAblaufReminders` nutzt
  das echte Ende, `versLinkFixkost` überträgt `laufzeitEnde`, CHANGELOG.
- `src/index.html` – neues Eingabefeld „Vertragsende / läuft aus
  (optional)" im Fixkosten-Modal.

## ✅ Geprüft
- `node --check src/app.js` – Syntax OK
- `check.js` – 0 Fehler, 0 Warnungen (ID-Quoting, Funktions-Exporte,
  keine Duplikate)
- Logiktest Jahreswechsel 2026→2027→2028: Vertragsende bleibt erhalten,
  wird im Ablaufjahr auf den Ablaufmonat begrenzt, abgelaufene Verträge
  werden nicht übernommen.
- Logiktest Ablauf-Erinnerung: Erinnerung greift zum echten Vertragsende
  (Vorlauf 2 Monate); unbefristete Fixkosten lösen keine Erinnerung aus.
