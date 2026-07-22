# Finanzverwaltung Pro 1.0.25

**Datum:** 2026-07-22

---

## Fehler behoben: Die ETF-Automatik hat nie funktioniert

Beim Einbauen ist mir aufgefallen, dass **„Automatisch beim Start aktualisieren"
und das Intervall reine Attrappen waren**. Beide Einstellungen wurden gespeichert
und die Oberfläche zeigte „✓ Live-Daten aktiv" – aber im Code wurden sie nirgends
ausgewertet: kein `setInterval`, kein Abruf beim Start. Kurse kamen ausschließlich
per Knopfdruck.

Jetzt umgesetzt:

- **Start-Abruf**, wenn der Schalter aktiv ist
- **Timer** nach eingestelltem Intervall (15 / 30 / 60 Minuten)
- Läuft nur, wenn tatsächlich ein Depot mit Tickern existiert
- **Stört nicht beim Arbeiten**: Im Hintergrund wird nur dann neu gezeichnet, wenn
  die Depot-Seite gerade offen ist – sonst würde der Timer Eingaben unterbrechen
- **Kein Doppel-Laden**: Nach einem Neustart wird nicht erneut abgerufen, wenn die
  letzte Aktualisierung keine 10 Minuten her ist
- Zeitpunkt der letzten Aktualisierung und laufender Timer werden angezeigt

---

## Spesensätze nachladbar

Einstellungen → Funktionen → **Spesensätze** → „Nach Aktualisierung suchen".

### Warum kein direkter Abruf beim BMF
Das Bundesfinanzministerium veröffentlicht die Pauschbeträge **ausschließlich als
PDF** ohne maschinenlesbare Schnittstelle. Ein PDF-Parser in der App wäre fragil –
bei der Extraktion für 1.0.24 standen Ländername und Beträge oft in getrennten
Zeilen, es gab Überschriften ohne Werte und zweizeilige Namen; ein Eintrag ging
zunächst verloren. Ein *stiller* Parsing-Fehler bei steuerrelevanten Zahlen wäre
schlimmer als eine veraltete Tabelle.

Die App lädt deshalb eine **geprüfte JSON aus dem Projekt-Repository**.

### Ablauf
1. Knopfdruck (oder wöchentlich automatisch, falls aktiviert)
2. App lädt `spesen/index.json` von `raw.githubusercontent.com`
3. Datei wird auf Plausibilität geprüft, **bevor** irgendetwas übernommen wird
4. Bei Unterschieden: Übersicht der Änderungen mit Vorher/Nachher-Werten
5. Übernahme erst nach ausdrücklicher Bestätigung

### Sicherheitsnetze
Abgewiesen werden Dateien mit fehlerhaften Einträgen, negativen Beträgen, Text
statt Zahlen, einem halben Satz größer als dem vollen, leeren Ländernamen oder
weniger als 100 Ländern. In jedem Fehlerfall bleiben die bisherigen Sätze
unverändert.

Geladene Sätze lassen sich jederzeit auf die mitgelieferten zurücksetzen.
Bereits erfasste Reisen behalten immer ihre gespeicherten Werte.

---

## Was du im Repo ablegen musst

Im Paket liegt **`spesen/index.json`** (216 Länder, Stand 2026). Damit der
Updater etwas findet, muss die Datei im Repository unter genau diesem Pfad liegen:

```
Marco-Conrad-00/FinanzverwaltungPro-/spesen/index.json
```

Abgerufen wird sie über `raw.githubusercontent.com` vom `main`-Branch.

**Jährliche Pflege:** Wenn das BMF im Dezember das neue Schreiben veröffentlicht,
schickst du mir die PDF, ich extrahiere und prüfe sie wie zuletzt, du committest
die neue JSON mit erhöhter `version`. Danach bekommen alle Installationen sie
automatisch angeboten.

---

## Technische Details

| Datei | Änderung |
|---|---|
| `src/app.js` | ETF-Timer, Spesen-Updater, `uiConfirm` mit HTML-Block, Einstellungs-UI |
| `spesen/index.json` | **neu** – muss ins Repo |
| `package.json` | 1.0.24 → 1.0.25 |

Neue Zustände:
```
state.spesenSaetze          = { version, stand, quelle, geladenAm, laender[] }
state.config.spesenAutoUpdate, spesenLastCheck
state.config.etfLastRefresh
```

> **Allowlist:** `spesenSaetze` wurde in `loadData` → `const fields = [...]`
> eingetragen. Ohne diesen Schritt wären nachgeladene Sätze beim Neustart still
> verschwunden.

Nebenbei: `uiConfirm` unterstützt jetzt einen optionalen `html`-Block (für die
Änderungstabelle) und wird dann etwas breiter dargestellt.

---

## Validierung

```
node --check app.js / main.js / preload.js   ✓
node check.js .                              ✓ Keine Fehler, 0 Warnungen
```

**Update-Validierung durchgespielt:**

| Fall | Ergebnis |
|---|---|
| echte Datei | OK |
| kein JSON-Objekt | abgewiesen |
| `version` fehlt | abgewiesen |
| `laender` kein Array | abgewiesen |
| halber Satz > voller Satz | abgewiesen |
| negativer Betrag | abgewiesen |
| Text statt Zahl | abgewiesen |
| nur 50 Länder | abgewiesen |
| leerer Ländername | abgewiesen |

**Änderungserkennung:** Testdatei mit einem geänderten (Belgien 59/40 → 62/41),
einem neuen und einem entfallenen Land – alle drei korrekt erkannt.
Gleiche Version → kein Dialog.

**Rendertest der Einstellungen:** Spesen-Block, Update-Knopf, Wochen-Schalter,
Timer-Anzeige und Zeitpunkt der letzten Aktualisierung vorhanden; der
Zurücksetzen-Knopf erscheint korrekt nur dann, wenn nachgeladene Sätze aktiv sind.

---

## Nach dem Einspielen

**Reload:** nur Renderer-Dateien geändert → **Ctrl+R**. Der ETF-Timer wird beim
Neuladen automatisch neu aufgesetzt.

**Zum Ausprobieren:** Solange `spesen/index.json` noch nicht im Repo liegt, meldet
die Update-Prüfung einen Fehler – das ist das erwartete Verhalten, deine Sätze
bleiben unangetastet.

**Versionierung:** `package.json` steht auf **1.0.25**; mit dem automatischen Bump
landest du auf **1.0.26**.
