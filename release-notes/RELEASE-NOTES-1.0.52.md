# Finanzverwaltung Pro 1.0.52 – Lohn erst nach Bestätigung

## ✨ Neu
- **„Gehalt erhalten?" / „Nebenjob erhalten?"-Schalter.**
  Gehalt und Nebenjob zählen jetzt erst dann zum **Kontostand** und **Cashflow**,
  wenn du sie als erhalten markierst. Im Einnahmen-Bereich („Feste Einnahmen
  anpassen") gibt es dafür zwei Schalter für den laufenden Monat.
  - **Vergangene Monate** gelten automatisch als erhalten – nichts ändert sich
    rückwirkend.
  - Der **laufende Monat** zählt erst nach einem Klick auf „erhalten".
  - Besonders praktisch für den **Nebenjob**, der oft erst Anfang des
    Folgemonats kommt: einfach erst dann bestätigen.
  - Solange nicht bestätigt, zeigen die Kacheln „Gehalt/Nebenjob" den geplanten
    Betrag mit dem Hinweis „⏳ noch nicht erhalten".

## Warum das den Kontostand korrigiert
Bisher wurde das Gehalt des laufenden Monats sofort im Saldo mitgezählt, obwohl
es noch gar nicht auf dem Konto war – dadurch war das Girokonto zu hoch. Mit dem
Schalter steht das Geld erst im Saldo, wenn es wirklich da ist.

## 📝 Geänderte Dateien
- `src/app.js` – neue Funktion `incomeReceived(monat, feld)` steuert, ob
  Gehalt/Nebenjob zählen; eingebaut in Kontostand (`kontoNetBis`), Cashflow
  (`kontoCashflowMonat`, `monthFinancials`) und die Konto-Aufschlüsselung; neuer
  Schalter `toggleIncomeReceived` samt UI im Einnahmen-Bereich; CHANGELOG.

## ✅ Geprüft
- `node --check src/app.js` – Syntax OK
- `check.js` – 0 Fehler, 0 Warnungen
- Nachgerechnet an echten Daten: Ohne Bestätigung fällt das laufende
  Gehalt/Nebenjob korrekt aus dem Saldo; vergangene Monate bleiben unverändert.
