# Finanzverwaltung Pro 1.0.65 – Arbeitszeit: Mail passt sich jeden Monat an

## ✨ Neu

- **Neue Platzhalter für Betreff und Mailtext.**
  - `{monat}` = laufender Monat, z.B. „November 2026"
  - `{vormonat}` = Monat davor, z.B. „Oktober 2026"
  - wie bisher: `{zeitraum}` („Oktober und November 2026"), `{name}`,
    `{stunden}`, `{dateien}`
  Alle Platzhalter werden **bei jedem Versand neu** aus den exportierten
  Monaten berechnet – Betreff und Text passen sich also jeden Monat
  automatisch an, auch über den Jahreswechsel („Dezember 2026 und Januar 2027").
  Beispiel-Betreff: `Arbeitszeitdokumentation {monat}`.

- **Vorschau in den Einstellungen.**
  Unter dem Mailtext zeigt die Arbeitszeit-Seite, wie Betreff und Text beim
  **nächsten Versand** aussehen (nach dem Stichtag automatisch für den
  Folgemonat).

## 📝 Geänderte Dateien
- `src/app.js` – neuer Helfer `azMailWerte` (inkl. `{monat}` / `{vormonat}`),
  von `azMailtoUrl` und der Vorschau genutzt; Platzhalter-Hinweis in
  Einführung und Einstellungen; Vorschau-Block; CHANGELOG.

## ✅ Geprüft
- `node --check src/app.js` – Syntax OK
- `src/check.js` – 0 Fehler, 0 Warnungen
- Logiktests (Node, 38 Prüfungen): `{monat}` / `{vormonat}` / `{zeitraum}`
  für November- und Januar-Versand (Jahreswechsel), unbekannte Platzhalter
  bleiben stehen; alle bisherigen Tests weiterhin grün.
- Oberfläche im Browser (Testdaten): Vorschau zeigt
  „Betreff: Arbeitszeitdokumentation November 2026" und den ersetzten Text.
