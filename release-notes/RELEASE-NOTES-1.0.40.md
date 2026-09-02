# Version 1.0.40

## Behoben

**„Was ist neu"-Dialog zeigt wieder die richtige Version** – Der In-App-
Änderungsverlauf (`CHANGELOG`) wird von Hand gepflegt und war seit 1.0.37 nicht
mehr ergänzt worden, während die App-Version (package.json/Installer)
automatisch weiterlief. Dadurch zeigte der Dialog „Du nutzt jetzt Version
1.0.37", obwohl bereits 1.0.38/1.0.39 lief. Die fehlenden Einträge für **1.0.38**
und **1.0.39** wurden nachgetragen; der Dialog zeigt jetzt die tatsächliche
Version und den vollständigen Verlauf.

## Technisch

- Geänderte Dateien: `src/app.js` (nur `CHANGELOG`-Einträge ergänzt)
- Der In-App-Änderungsverlauf wird ab jetzt bei jedem Release mitgepflegt,
  passend zu den Release Notes.
- `check.js` läuft fehler- und warnungsfrei.
