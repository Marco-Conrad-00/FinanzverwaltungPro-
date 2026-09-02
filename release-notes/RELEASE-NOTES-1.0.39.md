# Version 1.0.39

## Behoben

**Neue Zählerstände lassen sich wieder löschen und bearbeiten** – Beim Aufbau
der Zählerstand-Tabelle wurde die Eintrags-ID ohne Anführungszeichen in die
`onclick`/`onchange`-Handler geschrieben (`deleteZaehler(<uuid>)`). Da neue
Einträge eine UUID als ID erhalten, entstand ungültiges JavaScript, wodurch das
Löschen und Bearbeiten neuer Zählerstände wirkungslos blieb (ältere Einträge
mit reiner Zahlen-ID funktionierten weiter). Die IDs werden jetzt korrekt als
String übergeben – gelöschte Stände landen wie gewohnt im Papierkorb. Betrifft
Datum, Uhrzeit, Typ, Wert, Einheit, Notiz und das Löschen. (README §4.3)

## Neu

**Schnell-Eingabezeile am Ende jeder Zählerstand-Tabelle** – Unter dem letzten
Eintrag jeder Tabelle gibt es jetzt eine Zeile „Neuer Stand" mit Feldern für
Datum, Uhrzeit, Wert und Notiz sowie einem grünen **+**-Knopf. Datum und
Uhrzeit sind mit dem aktuellen Zeitpunkt vorbelegt; Zählertyp und Einheit
werden automatisch aus der jeweiligen Tabelle übernommen. Eingabe per **Enter**
oder Klick auf **+** – ohne zum „+ Zählerstand"-Button nach oben scrollen zu
müssen.

## Technisch

- Geänderte Dateien: `src/app.js`
- Neue Funktion `quickAddZaehler()` inkl. `window`-Export; onchange/onclick-IDs
  in der Zähler-Tabelle gequotet.
- `check.js` läuft fehler- und warnungsfrei (Syntax, keine doppelten
  Funktionen, alle onclick-IDs gequotet, alle onclick-Funktionen exportiert).
- Reload: `app.js` → Ctrl+R genügt, kein Neustart nötig.
