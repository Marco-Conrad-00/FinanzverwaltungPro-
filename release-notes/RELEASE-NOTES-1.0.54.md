# Finanzverwaltung Pro 1.0.54 – Sparplan↔Depot, Versicherung kündigen, Kontaktfelder

## ✨ Neu

### 🎯 Sparplan mit Depot verknüpfen
Wertpapier-Sparpläne (Fixkosten der Kategorie „Sparen") haben in der
Fixkosten-Tabelle jetzt einen **🎯-Knopf**, mit dem du ein **Ziel-Depot in
„Sparen & Depot"** zuordnest.

- Zum Fälligkeitstag (z. B. 16.) wird automatisch das Geld vom Konto abgebucht
  und der Sparbetrag (z. B. 50 € bzw. Summe X) landet in **genau diesem Depot** –
  statt in einem separaten „Auto (…)"-Eintrag.
- Beim Zuordnen werden **bestehende Auto-Einträge** dieses Sparplans ins
  gewählte Depot **umgehängt**, damit die Position sauber zusammenläuft.
- Für deine 4 Sparpläne à 50 € also einmal Depot zuordnen – dann läuft es
  automatisch.

### ✉️ Versicherung kündigen
Sind **Name, Anbieter und Policennummer** gepflegt, gibt es auf der
Versicherungs-Seite den Knopf **„✉️ Kündigen"**. Er erzeugt ein fertiges
Kündigungsschreiben (ordentliche Kündigung zum nächstmöglichen Zeitpunkt,
hilfsweise zum Vertragsende) mit deinen Vertragsdaten:

- als **PDF** (über den vorhandenen PDF-Export),
- zum **Kopieren** (für E-Mail/Word),
- oder direkt als **E-Mail** – wenn eine Kontakt-Mail hinterlegt ist, öffnet
  sich die Mail mit vorausgefülltem Betreff und Text.

Den Text kannst du vor dem Speichern/Senden noch anpassen.

### 📇 Kontaktfelder & Absender
- Versicherungen haben jetzt Felder für **Kontakt Telefon** und **Kontakt
  E-Mail**.
- Im **Profil** kannst du **Straße, PLZ und Ort** hinterlegen – diese werden als
  Absender im Kündigungsschreiben verwendet (fehlen sie, stehen Platzhalter im
  Text).

## 📝 Geänderte Dateien
- `src/app.js` – Ziel-Depot-Auswahl für Sparpläne (`askDepotWahl`,
  `linkSparplanDepot`, 🎯-Knopf in der Fixkosten-Tabelle,
  `runSparenAutoEintragung` nutzt `sparenLink.zielDepot`); Kündigung
  (`versKuendigen`, `versKuendigungText`, `kuendigungHtml`, Knopf in der
  Versicherungs-Detailmaske); Kontaktfelder (kontaktTel/kontaktMail) +
  Profil-Adressfelder (strasse/plz/ort); CHANGELOG.

## ✅ Geprüft
- `node --check src/app.js` – Syntax OK
- `check.js` – 0 Fehler, 0 Warnungen
- Logiktest: Kündigungstext mit/ohne Vertragsende und mit unvollständigem
  Absender (Platzhalter); Depot-Umhängen betrifft nur die Auto-Einträge des
  jeweiligen Sparplans; „Auto (…)"-Depots werden aus der Auswahlliste
  ausgefiltert.

*Hinweis:* PDF-Export, E-Mail-Öffnen und die tatsächliche Auto-Buchung laufen im
echten Electron-Prozess – die Logik ist getestet, ein kurzer Praxistest
(einmal kündigen + einem Sparplan ein Depot zuordnen) ist empfehlenswert.
