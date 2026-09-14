# Finanzverwaltung Pro 1.0.51 – Vorlagen & CSV-Import + Versicherung aus PDF

## ✨ Neu

### 📄 Vorlagen & CSV-Import
Unter **Einstellungen → „Daten & Sicherheit"** gibt es jetzt den Bereich
**„Vorlagen & CSV-Import"** für **Fixkosten**, **Finanzprodukte** und
**Versicherungen**. Pro Bereich drei Knöpfe:

- **📄 Vorlage** – erzeugt eine leere CSV-Vorlage mit den richtigen Spalten
  (inkl. Beispielzeilen zum Überschreiben).
- **⬇ Export** – speichert deine aktuellen Daten als CSV, damit du sie in
  Excel bearbeiten und wieder einlesen kannst.
- **📥 Import…** – liest eine ausgefüllte CSV ein.

So kannst du z. B. viele Fixkosten oder Verträge bequem in Excel pflegen und
sauber in die App übernehmen.

Details:
- Format ist **CSV mit Semikolon** und **UTF-8 (mit BOM)** – so bleiben
  Umlaute im deutschen Excel korrekt. Beträge dürfen deutsch geschrieben sein
  (z. B. `1.234,56`).
- Beim Import werden **neue Einträge hinzugefügt** – vorhandene bleiben
  unverändert.
- Vor dem Übernehmen erscheint eine **Vorschau**; übersprungene oder leere
  Zeilen werden gemeldet. Nichts landet ungeprüft in deinen Daten.

### 🛡️ Versicherung aus PDF anlegen
Auf der Seite **„Versicherungen"** gibt es den Knopf **„📄 Aus PDF anlegen"**:
Du wählst das PDF, und die App liest daraus – **komplett lokal, ohne
Internet** – so viel wie möglich aus und füllt die Felder vor:

- Name, Typ, Anbieter, Policennummer, Beginn, Ende, Betrag und Zahlweise.
- Das gewählte Dokument wird **gleich als Anhang** verknüpft.
- Du prüfst und korrigierst nur noch – **manuelles Anlegen bleibt weiterhin
  möglich** (Knopf „+ Versicherung / Vertrag").

*Hinweis:* Es werden **textbasierte PDFs** gelesen. Eingescannte Dokumente
ohne Textebene können nicht ausgewertet werden – dann bitte manuell ausfüllen.

## 📝 Geänderte Dateien
- `src/app.js` – CSV-Modul (Vorlage/Export/Import mit Vorschau) für Fixkosten,
  Finanzprodukte, Versicherungen; PDF-Auslesen für Versicherungen
  (`extractPdfText`, `guessVersFromText`, `versAusPdf`); neue Einstellungen-
  Sektion und „Aus PDF anlegen"-Knopf; CHANGELOG.
- `src/main.js` – neuer `save-file`-Handler (Speichern-Dialog, schreibt UTF-8
  inkl. BOM), analog zum bestehenden PDF-Export.
- `src/preload.js` – `saveFile`-Methode in der EA-Bridge.

## ✅ Geprüft
- `node --check` für app.js, main.js, preload.js – Syntax OK
- `check.js` – 0 Fehler, 0 Warnungen (ID-Quoting, Funktions-Exporte,
  ipcMain.handle auf Top-Level, keine Duplikate)
- Logiktests: CSV-Roundtrip mit Umlauten, Semikolon/Anführungszeichen im Wert
  und negativen Beträgen; deutsche Zahlen (`1.234,56`); die Import-Mapper für
  alle drei Bereiche (u. a. Kauf mit Stückzahl×Kurs, Bestand ohne Cashflow,
  Verkauf negativ); PDF-Heuristik zieht Policennummer, Daten, Betrag,
  Zahlweise, Anbieter und Typ korrekt aus Beispieltexten.

*Hinweis:* Der Datei-Speichern-Dialog und das PDF-Auslesen laufen im echten
Electron-Prozess – die Kernlogik ist getestet, der Speichern-Dialog spiegelt
exakt den vorhandenen PDF-Export. Ein kurzer Praxistest (eine Vorlage
erzeugen, eine Versicherung aus PDF anlegen) ist trotzdem empfehlenswert.
