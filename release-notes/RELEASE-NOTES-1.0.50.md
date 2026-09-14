# Finanzverwaltung Pro 1.0.50 – Reise-Zusammenfassung & Arbeitstage

## ✨ Neu
- **Zusammenfassung in der Gesamt-Zeile der Spesen-Tabelle.**
  Die Gesamt-Zeile zeigt jetzt zusätzlich, **wie viele Reisen** erfasst sind
  und **wie viele Tage** du insgesamt unterwegs warst (Summe aus An-/Abreise-
  und Vor-Ort-Tagen). Die beiden Tagesspalten werden außerdem einzeln
  aufsummiert direkt in ihren Spalten angezeigt.

- **Neue Kennzahl „Unterwegs" mit Prozent der Arbeitstage.**
  Oben bei den Kennzahlen gibt es eine neue Kachel: Tage unterwegs, Anzahl der
  Reisen und **wie viel Prozent der Arbeitstage** das sind.
  - Die Arbeitstage werden für **Baden-Württemberg** berechnet: Montag–Freitag
    abzüglich der gesetzlichen BW-Feiertage (inkl. der beweglichen
    Oster-Feiertage wie Karfreitag, Ostermontag, Christi Himmelfahrt,
    Pfingstmontag und Fronleichnam). Für 2026 sind das z. B. **252 Arbeitstage**.
  - In der Monatsansicht bezieht sich der Wert auf den **Monat**, mit
    **„Alle anzeigen"** auf das **ganze Jahr**.

  *Hinweis:* „Tage unterwegs" ist eine Näherung – An-/Abreisetage sind
  spesenrechtlich halbe Tage, werden hier aber als ganze Tage gezählt. Als
  grobe Einordnung deiner Reiselast passt der Wert gut.

## 📝 Geänderte Dateien
- `src/app.js` – neue Helfer `osterSonntag`, `bwFeiertageSet`,
  `arbeitstageZeitraum`; in `spesen()` Anzahl Reisen, Tage unterwegs,
  Arbeitstage und Prozent berechnet; neue KPI-Kachel „Unterwegs" und
  erweiterte Gesamt-Zeile; CHANGELOG.

## ✅ Geprüft
- `node --check src/app.js` – Syntax OK
- `check.js` – 0 Fehler, 0 Warnungen
- Logiktest: Ostersonntag 2026 = 05.04.; alle 12 BW-Feiertage korrekt;
  252 Arbeitstage für BW 2026 (bekannte korrekte Zahl), September 2026 = 22.
