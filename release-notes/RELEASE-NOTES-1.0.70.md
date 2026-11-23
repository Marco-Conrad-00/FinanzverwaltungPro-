# Finanzverwaltung Pro 1.0.70 – Versicherungen ↔ Fixkosten gekoppelt, Kündigen mit Folgetarif

## ✨ Neu

- **Betragsänderungen gelten für beide Tabellen.**
  Ist eine Versicherung mit einer Fixkost verknüpft, wird eine Betragsänderung
  mit demselben „gilt ab"-Datum auf beiden Seiten eingetragen – egal, wo du sie
  machst:
  - in den Fixkosten über ✏️ oder „🔍 Verträge prüfen",
  - bei der Versicherung im Feld „Betrag aktuell" (die App fragt, ab wann der
    neue Betrag gilt),
  - im Jahreswechsel-Assistenten.
  Die App rechnet zwischen Zahlweise und Rhythmus um (z. B. 480 €/Jahr bei der
  Versicherung = 40 €/Monat in den Fixkosten). Frühere Monate behalten ihren
  alten Betrag.

- **„Geändert am" und „neu ab".** Unter dem Betrag steht jetzt z. B.
  „✏️ neu ab Jan 2027: 480,00 €, geändert am 23.11.2026". Die Versicherung zeigt
  den kompletten Beitragsverlauf. Weichen Versicherung und Fixkost voneinander
  ab, erscheint ein Hinweis mit „Fixkost angleichen".

- **Kündigen zum Datum – optional mit Folgetarif.**
  - 🚫 in der Fixkosten-Zeile bzw. „🚫 Kündigen zum …" bei der Versicherung.
  - Kündigungsdatum eintragen; die App zeigt die letzte Abbuchung (abhängig vom
    Fälligkeitstag) und beendet Versicherung und Fixkost gemeinsam – auch in
    einem bereits angelegten Folgejahr.
  - **„Durch neuen Tarif ersetzen"** (z. B. Stromwechsel): Name, neuer Anbieter,
    Betrag und Beginn eintragen. Kategorie, Konto, Rhythmus und Fälligkeitstag
    werden übernommen; bei Versicherungen wird eine neue Versicherung angelegt
    und mit der neuen Fixkost verknüpft. Alter und neuer Vertrag verweisen
    aufeinander („↪ Folgetarif").
  - Danach optional das Kündigungsschreiben – jetzt mit dem konkreten Datum.

## 🐛 Behoben

- **Verknüpfung ging beim Jahreswechsel verloren.** Die Versicherung merkte
  sich nur die ID der Fixkost des laufenden Jahres. Jetzt steht die Verknüpfung
  an der Fixkost (`versId`) und wird beim Jahreswechsel mitkopiert. Bestehende
  Verknüpfungen werden beim Start automatisch umgestellt.
- **Änderungen aus „Verträge prüfen" fehlten bei der Versicherung.** Beim
  ersten Start werden bereits eingetragene Änderungen einmalig auf die jeweils
  andere Seite übertragen.

## 📝 Geänderte Dateien
- `src/app.js` – Kopplung (`versFuerFix`, `versFixAlle`, `versBetrag`,
  `versBetragSetzen/-Loeschen`, `versZuFix`/`fixZuVers`, `versLinksMigrieren`);
  `fixkostBetragSetzen/-Loeschen` synchronisieren; Hinweise
  (`aenderungHinweis`, `versDetailHinweise`, `fixVertragsInfo`,
  `versAngleichen`); Kündigung (`vertragKuendigen`,
  `vertragKuendigungAnwenden`, `vkLetzterMonat`); Kündigungsschreiben mit
  Datum; Jahreswechsel überträgt geänderte Beträge; CHANGELOG.

## ✅ Geprüft
- `node --check src/app.js`, `src/check.js` – 0 Fehler, 0 Warnungen
- Logiktests (Node): Kopplung/Kündigung 22 Prüfungen (Umrechnung, Migration
  Altbestand, beide Richtungen, alle Jahre, Löschen, letzter Abbuchungsmonat,
  Strom mit Folgetarif ins Folgejahr, Versicherung mit Folgetarif, Ende in
  beiden Jahren), Jahreswechsel/Verträge 41, Arbeitszeit 14 + 38.
- Oberfläche im Browser (Testdaten): Versicherung mit Beitragsverlauf und
  Hinweis, Kündigen-Dialog mit Folgetarif, Übertrag Versicherung → Fixkost.

⚠️ **Bitte kurz in der App prüfen**: Bei deinen verknüpften Versicherungen
(Fixkosten → 🛡️-Hinweis unter dem Namen) einmal die Beträge ansehen. Erscheint
bei einer Versicherung der Hinweis „Fixkost angleichen", stimmen die beiden
Seiten noch nicht überein.
