# Finanzverwaltung Pro 1.0.68 – Jahreswechsel-Assistent, Erinnerung & Schnellerfassung

## ✨ Neu

- **Jahreswechsel-Assistent.**
  Ab dem **1. Januar** fragt die App beim Start, ob das neue Jahr angelegt
  werden soll („Später" fragt am nächsten Tag wieder). Der Assistent hat drei
  Schritte; erst **„Jahr anlegen"** ändert Daten:
  1. **Verträge prüfen** – alle Fixkosten und Sparpläne mit Rhythmus, Betrag
     „zuletzt" und „ab neuem Jahr" (inkl. ⚡ Dynamik), erster Fälligkeit und
     Vertragsende. Haken = übernehmen; der Grundbetrag ist direkt änderbar.
     Dazu wiederkehrende Einnahmen und Umbuchungen. Unten die Summe pro Monat
     (umgerechnet) alt/neu.
  2. **Kontostände, Depot & Zähler** – je Konto der Stand laut App und ein
     Feld für den **tatsächlichen Stand zum 31.12.** Die Differenz wird als
     Abgleich in den Dezember des Vorjahres gebucht (ersetzt eine vorhandene
     Korrektur, stapelt nie). Depot-Bestand mit Stück, eingesetztem Geld, Wert
     und Gewinn/Verlust, Knopf „Kurse aktualisieren" und Warnung bei fehlendem
     Kurs. Zählerstände, Gehalt pro Monat fürs neue Jahr.
  3. **Zusammenfassung des Vorjahres** – Einnahmen, Ausgaben, Überschuss,
     Konten Anfang → Ende, Depot, größte Ausgaben-Kategorien,
     Nebenjob-Stunden; optional als PDF.
  „+ Neues Jahr…" in der Jahresauswahl öffnet denselben Assistenten.

- **Startstände bleiben aktuell.** Ändert sich nachträglich etwas im Vorjahr,
  bietet die App beim Start an, die Startstände des neuen Jahres anzupassen.

- **Arbeitszeit: Erinnerung.** An den gewählten Wochentagen (Standard Samstag)
  ab der gewählten Uhrzeit (Standard 18:00) erinnert die App ans Eintragen –
  per Windows-Meldung und Dialog, auch beim nächsten Start, solange der Tag
  fehlt. „Nicht gearbeitet" beendet die Nachfrage für den Tag. Einstellbar in
  den Einstellungen der Arbeitszeit-Seite.

- **Arbeitszeit: Schnellerfassung.** Ein-Klick-Knöpfe „⚡ Heute 08:40–14:40"
  und für den letzten offenen Arbeitstag; die übliche Zeit ermittelt die App
  aus deinen bisherigen Einträgen. „Andere Zeit …" öffnet einen kleinen Dialog.

## 🐛 Behoben (Jahreswechsel)

- **Rhythmus verrutschte.** Vierteljährliche, halbjährliche und jährliche
  Verträge wurden im neuen Jahr auf Januar gesetzt (eine Jahresrechnung vom
  Juni war dann im Januar fällig). Jetzt bleibt der ursprüngliche Monat.
- **Beendetes wurde wiederbelebt.** Fixkosten mit „Gültig bis" mitten im
  Vorjahr sowie wiederkehrende Einnahmen und Umbuchungen mit Enddatum liefen
  im neuen Jahr unbefristet weiter. Sie werden jetzt nicht mehr übernommen
  (im Assistenten sichtbar und bei Bedarf anhakbar).
- **Fehlende Übernahmen.** Gehalt, Finanzprodukte, eigene Tabellen und offene
  Auslagen wurden nicht übernommen; Finanzprodukte verloren die Verknüpfung
  zum Vertrag. Jetzt bleibt beides erhalten.
- **Depot: Gewinn/Verlust ging verloren.** Der Bestand wurde zum Tageswert
  übernommen, das ursprünglich eingesetzte Geld war damit weg. Jetzt wird der
  Einstand mitgeführt (`einstand`), die Depot-Übersicht zeigt weiter den
  echten Gewinn/Verlust. Der Wert zum Jahreswechsel bleibt für alle Summen
  maßgeblich.

## 📝 Geänderte Dateien
- `src/app.js` – neuer Bereich „Jahreswechsel-Assistent" (`jwPlan`,
  `jwAnwenden`, `jwNaechsteFaelligkeit`, `jwKorrektur`, `jwZusammenfassung`,
  `jahreswechselAssistent`, `jwPruefung`, `jwStartstandPruefung`);
  `confirmNewYear` öffnet den Assistenten; `buildDepotSnapshot` mit `einstand`
  / `kursFehlt`, `sparenEinstand`; Arbeitszeit: `azOffenerTag`,
  `azErinnerungPruefung`, `azSchnell`, `azSchnellDialog`, `azStandardZeit`,
  Einstellungen `erinnerungAktiv/Tage/Zeit`; CHANGELOG.
- `src/index.html` – Dialog „Neues Jahr" vereinfacht (Optionen stehen im
  Assistenten).

## ✅ Geprüft
- `node --check src/app.js`, `src/check.js` – 0 Fehler, 0 Warnungen
- Logiktests (Node): Jahreswechsel 29 Prüfungen (Rhythmus, beendete Verträge,
  Dynamik, Kontokorrektur ersetzt statt stapelt, Finanzprodukt-Verknüpfung,
  Depot-Einstand über zwei Jahre), Erinnerung/Schnellerfassung 14 Prüfungen,
  bisherige 38 + 17 Prüfungen weiterhin grün.
- Oberfläche im Browser (Testdaten): Assistent Schritt 1–3 per Klick,
  angelegtes Jahr geprüft; Erinnerungs-Dialog und Schnell-Knöpfe.

⚠️ **Bitte kurz in der App testen**: Windows-Meldung der Erinnerung,
„Kurse aktualisieren" im Assistenten, PDF der Zusammenfassung (nur in
Electron). Den Assistenten kannst du vorab über „+ Neues Jahr…" ansehen –
„Abbrechen" ändert nichts.
