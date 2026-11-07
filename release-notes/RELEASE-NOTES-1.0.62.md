# Finanzverwaltung Pro 1.0.62 – Arbeitszeit (Nebenjob)

## ✨ Neu

- **Arbeitszeit-Erfassung für den Nebenjob (⏱️).**
  Optional aktivierbar unter **Einstellungen → Arbeitszeit (Nebenjob)** – der
  Reiter erscheint (wie die PV-Anlage) erst nach dem Aktivieren. Beim ersten
  Aktivieren führt ein kurzer Dialog durch die Einrichtung: Empfänger, CC,
  Mailtext (Vorlage oder eigener Text), Stundenlohn, DATEV-Vorlage und
  Zielordner.
  - Je Arbeitstag **Datum, Von, Bis**, optional **Kürzel** (K/U/UU/F/SA/SU)
    und **Notiz**. Eine Zeile pro Tag, wie in der DATEV-Liste.
  - **Einnahme = Stunden × Stundenlohn** (netto, Minijob). Die Monatssumme
    ersetzt die feste Nebenjob-Zahl, sobald Einträge vorhanden sind, und
    wächst mit jedem Tag. Monate ohne Einträge behalten ihren bisherigen
    Wert. Der Schalter **„Nebenjob erhalten?"** bleibt unverändert.
  - **Stundenlohn mit Historie** („gültig ab").

- **6-Stunden-Regel automatisch.**
  Pro Tag werden höchstens 6 h dokumentiert; der Überhang wandert auf den
  **Vortag**:
  - freier Vortag → Ende **20:00**, Beginn = 20:00 − Überhang
    (Bemerkung „Mehrstunden von Samstag"),
  - Vortag mit eigenen Zeiten → Überhang wird **angehängt**, Ende nie nach
    20:00 (der Block rutscht ggf. nach vorne),
  - wird der Vortag dadurch länger als 6 h, wird die Zeile mit ⚠ markiert.
  Die Tabelle zeigt nebeneinander, was du erfasst hast und was für DATEV
  dokumentiert wird.

- **DATEV-Excel + Mail-Entwurf.**
  - Die App füllt **deine eigene DATEV-Vorlage** (nur Zellwerte – Formeln,
    Formatierung und Blattschutz bleiben unverändert) und speichert je Monat
    `Arbeitszeitdokumentation <Monat Jahr>.xlsx` im Zielordner.
  - **Am Stichtag automatisch** (wenn die App läuft): Vormonat komplett +
    laufender Monat, Ordner öffnet sich, Mail-Entwurf an Empfänger/CC mit
    Betreff und Text aus den Einstellungen (Platzhalter `{zeitraum}`,
    `{name}`, `{stunden}`, `{dateien}`). Stichtag wählbar: **am 20.** oder
    **Sonntag nach dem letzten Samstag vor dem 20.**
  - Jederzeit per Knopf **„Excel + Mail jetzt vorbereiten"** oder
    **„Nur <Monat> als Excel"**.
  - Die App **sendet nie selbst** – die Dateien ziehst du aus dem geöffneten
    Ordner in die Mail. Monate ohne Einträge werden übersprungen, damit
    vorhandene Dateien nicht leer überschrieben werden.

## 📝 Geänderte Dateien
- `src/app.js` – neuer Bereich Arbeitszeit (`azDokuZeilen` mit 6-h-Regel,
  `azLohnSatz`, `azMonatsSumme`, `azSyncEinnahmen` → `incomeByMonth.nebenjob`
  mit Flag `nebenjobAusAz`, Stichtag/Automatik `azAutoPruefung`, Mail
  `azMailtoUrl`, Einführungsdialog, Seite + Einstellungs-Karte); neue Felder
  `arbeitszeit` / `arbeitszeitConfig` in der `loadData`-Allowlist (außerhalb
  `YEAR_FIELDS`); Nebenjob-Feld in den Einnahmen schreibgeschützt, solange es
  aus der Arbeitszeit kommt; CHANGELOG.
- `src/arbeitszeit-xlsx.js` – neu: füllt die DATEV-Vorlage im Main-Process.
- `src/main.js` – IPC `select-file`, `arbeitszeit-export`, `path-exists`;
  `select-folder` mit optionalem Titel.
- `src/preload.js` – `selectFile`, `arbeitszeitExport`, `pathExists`.
- `src/index.html` – Menüpunkt „⏱️ Arbeitszeit" (ausgeblendet bis aktiviert).
- `package.json` – Abhängigkeit `jszip`.

## ✅ Geprüft
- `node --check` für `app.js`, `main.js`, `preload.js`, `arbeitszeit-xlsx.js`
- `src/check.js` – 0 Fehler, 0 Warnungen
- Excel (Node): Oktober 2026 mit der echten DATEV-Vorlage nachgebaut – alle
  Zellen (Beginn, Ende, aufgezeichnet am, Bemerkung, Monat) identisch mit der
  bisher von Hand erstellten Datei.
- Logiktests (Node, 24 Prüfungen): 6-h-Regel (leerer Vortag 17:00–20:00,
  Anhängen 15:00–20:00, Kappung bei 20:00 mit ⚠, Monatsgrenze, Kürzel-Tag),
  Lohnhistorie (Satzwechsel im Monat), Einnahmen-Sync inkl. Rücksetzen und
  archivierter Jahre, Stichtage (20. / Sonntag-Variante), Mail-Link.
- Oberfläche im Browser (ohne Electron): Aktivieren, Einführung, Erfassen per
  Klick, Tabelle/Summen, Einnahmen-Seite, Einstellungs-Karte, Daten nach
  Neuladen erhalten.

⚠️ **Bitte kurz in der App testen** (nur in Electron prüfbar): „Vorlage
wählen" / „Ordner wählen", Excel-Erzeugung im Zielordner, Öffnen des Ordners
und des Mail-Entwurfs, Windows-Benachrichtigung am Stichtag.
