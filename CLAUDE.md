# CLAUDE.md – Finanzverwaltung Pro („Liquid")

Diese Datei liest Claude Code bei jedem Start automatisch. Sie ist die Übergabe
aus den bisherigen claude.ai-/Cowork-Sitzungen (Stand: v1.0.61, 2026-10-29).

> ⚠️ **Das Repo ist ÖFFENTLICH.** Niemals echte Finanzdaten, Kontostände,
> Policen-/Vertragsnummern, `data.json`, Backups oder Tokens committen –
> auch nicht in Release-Notes, Commit-Messages oder Testdaten.

---

## 1. Was ist die App?

Private Windows-Desktop-App zur persönlichen Finanzverwaltung (Electron).
Nutzer & Entwickler: Marco. UI-Sprache **Deutsch**, Antworten an Marco auf Deutsch.

Funktionsumfang (Auszug): Ausgaben/Einkäufe (mit Unterpositionen, Zusammenfassen,
Autocomplete), Einnahmen (Gehalt/Nebenjob mit „erhalten"-Gate), Fixkosten
(Rhythmus, Vertragsende, ⚡ Dynamik), Sparpläne ↔ Depot, Wertpapier-Depot
(Live-Kurse, Währungsumrechnung), Konten & Umbuchungen (wiederkehrend),
Spesen & Reisen (BMF-Sätze, Positionen, „erhalten"-Gate, Arbeitstage BW),
Auslagen & Erstattungen, Versicherungen & Verträge (PDF-Dokumente, Vorschau,
Ablauf-Erinnerungen, Kündigungsschreiben), PV-Anlage, Zählerstände, Analyse,
Jahreswechsel mit Übernahme-Optionen, PDF-Jahresbericht, CSV-Import/Export,
Themes (10 Paletten, Hell/Dunkel), Auto-Update über GitHub-Releases.

## 2. Stack & Struktur

```
package.json            Electron + electron-builder (NSIS, x64) + electron-updater
src/main.js             Main-Process: IPC-Handler, Kurs-Quellen, Persistenz, Dateidialoge
src/preload.js          Bridge → window.EA (openFiles, readFile, saveFile, printToPdf,
                        fetchUrl, openFolder, openExternal, notify …)
src/index.html          UI-Skelett + Modals
src/app.js              GESAMTE Logik (~12.400 Zeilen, ein Monolith, klassisches Script)
src/styles.css          Theme + Layout
src/check.js            Stabilitäts-Check (Gate vor jedem Release)
release-notes/          RELEASE-NOTES-<version>.md (deutsch)
spesen/                 Spesen-Sätze (JSON, von der App per GitHub geladen)
.github/workflows/      build.yml (Tag v* → Windows-Build + Release), cleanup-releases.yml
README.md               Ausführliche Entwickler-Doku (Datenmodell, kritische Regeln, Bug-Historie)
```

Befehle (im Repo-Root):

```bash
npm install            # einmalig
npm start              # App lokal starten
node src/check.js .    # Pflicht-Check – muss 0 Fehler liefern
node --check src/app.js
```

Echte Nutzerdaten liegen **nicht** im Repo, sondern unter
`%APPDATA%\finanzverwaltung-pro\data.json` (auto-save alle 30 s). Die Datei nur
ersetzen, wenn die App komplett beendet ist (inkl. System-Tray).

## 3. Kritische Regeln – niemals brechen

1. **`loadData`-Allowlist**: Jedes neue Top-Level-Feld in `state` muss in die
   `fields`-Liste in `loadData` (und in `DEFAULT_DATA_RAW` + Init-Guard),
   sonst verschwinden die Daten beim Neustart still.
2. **`YEAR_FIELDS`** bestimmt, was unter `state.years[YEAR]` liegt (Proxy-Pattern).
   Globale Sammlungen wie `pv`, `pvConfig`, `versicherungen` liegen bewusst AUSSERHALB.
   Neue Config-Objekte nach dem `pvConfig`-Muster außerhalb von `YEAR_FIELDS`.
3. **onclick → window-Export**: Jede Funktion, die in einem `onclick`-Attribut
   steht, braucht `window.fn = fn`. (Alternative: `addEventListener` + `data-*`.)
4. **UUIDs in onclick immer quoten**: `onclick="fn('${id}')"` – nie ungequotet.
5. **Keine doppelten Funktionsdefinitionen** (vor neuen Funktionen per grep prüfen;
   oft existiert schon ein Helfer, z. B. `openCalc()`, `uiPrompt`, `uiConfirm`, `uiAlert`).
6. **IPC-Handler** in `main.js` nur auf Top-Level registrieren. Änderungen an
   `main.js`/`preload.js` brauchen echten App-Neustart (nicht nur Strg+R).
7. **Dark-Theme**: `theme-dark` sitzt auf `<html>` UND `<body>` – CSS-Variablen auf
   beiden setzen, sonst gewinnt die body-Klasse.
8. **IDs können Zahl oder String sein** → Vergleiche als `String(a) === String(b)`.
9. **Wertpapierkäufe** müssen das Verrechnungskonto mindern (sonst Doppelzählung).
10. **„Stand setzen"** ersetzt bestehende `_korrektur`-Buchungen, stapelt sie nie.
11. **PDF.js** fügt keine Zeilenumbrüche zwischen Seiten ein – beim Parsen beachten.
12. **Dezember-Filter**: Fixkosten mit `end` auf `-12` sind die Jahresgrenze, KEIN
    echtes Vertragsende (echtes Ende = `laufzeitEnde`).
13. Yahoo Finance blockiert Server-IPs/CORS-Proxies → Multi-Source-Kurse (README §7.3).

## 4. Fachlogik, die man kennen muss

- **Kontostand**: zentral `kontoNetBis`, `kontoSaldo`, `kontoCashflowMonat`,
  `monthFinancials`. Jede Änderung, die Geld bewegt, muss an ALLEN diesen Stellen
  konsistent sein (+ Analyse-Kontobaum, Jahresprognose).
- **Einnahmen-Gate** (`incomeReceived(m, field)`): Gehalt/Nebenjob zählen erst,
  wenn als erhalten markiert. Explizites Flag gewinnt; vergangene Monate = erhalten,
  laufender/kommender Monat brauchen Bestätigung.
- **Spesen-Gate** (`speseReceived(s)`): Ausgaben auf der Reise zählen SOFORT,
  nur die Pauschale wartet auf „✓ erhalten". Positionen in `s.ausgabenPos/auslagenPos`.
- **Auslagen & Erstattungen**: mindern das Konto ab Datum, kommen bei
  `status='erstattet'` am `erstattetAm` zurück (netto 0).
- **Dynamik** (v1.0.61): `f.amount` bleibt Grundbetrag; effektiver Betrag immer
  über `fixkostBetrag(f, m)` – nie direkt `f.amount` in Monatsrechnungen.
- **Währungen**: `etfKurse` stehen in Handelswährung → Werte immer über
  `kursEUR(kInfo)` (FX live via frankfurter.app, Fallback `FX_DEFAULT`).
- **Sparplan ↔ Depot**: `f.sparenLink.zielDepot`, Auto-Buchungen über
  `runSparenAutoEintragung` (`autoFromFixkostenId`).
- **Jahreswechsel** (`confirmNewYear`): Übernahme von Konten, Zählern, Sparen
  (`buildDepotSnapshot`), wiederkehrenden Umbuchungen, Fixkosten
  (`laufzeitEnde`, Dynamik deep-copy).
- **Ablauf-Erinnerungen**: `checkAblaufReminders()` beim Start (Fixkosten +
  Versicherungen, Vorlauf `state.config.ablaufVorlauf`).
- **Auto-Einträge** tragen Flags (`autoWork`, `autoAblauf`, `autoFromFixkostenId`)
  zur Nachvollziehbarkeit.

## 5. Arbeitsweise

- Vor Änderungen relevante Stellen per `grep -n` finden; bestehende Helfer
  wiederverwenden. Nach jedem Edit prüfen, dass er genau einmal gelandet ist.
- Neue Logik mit kleinen Node-Tests verifizieren (Funktion isolieren, mit
  Beispieldaten durchrechnen). Was nur in echtem Electron testbar ist
  (Dialoge, PDF-Rendering, Live-Fetch), in den Release-Notes als
  „bitte kurz in der App testen" markieren.
- Bei unklaren fachlichen Entscheidungen Marco kurz mit Optionen fragen,
  bevor gebaut wird; bei klaren Aufträgen direkt umsetzen.
- Keine Kauf-/Verkaufsempfehlungen in der App (nur informativ).

## 6. Release & AUTO-PUSH (Standard)

**Jede fertige Änderung wird automatisch released**, außer Marco sagt
„nicht pushen" / „nur lokal".

Ablauf:

```bash
bash scripts/release.sh --next        # zeigt die nächste Version, z. B. 1.0.62
```

1. Code fertig, `node src/check.js .` = 0 Fehler, Logik getestet.
2. **CHANGELOG** in `src/app.js` (Array `CHANGELOG`, neueste Version ZUERST,
   Format `{ v, date: 'YYYY-MM-DD', changes: ['**Fett** …'] }`, deutsch,
   nutzerfreundlich) um einen Eintrag für die nächste Version ergänzen.
3. `release-notes/RELEASE-NOTES-<version>.md` anlegen (Stil wie die vorhandenen:
   ✨ Neu / 🐛 Behoben, 📝 Geänderte Dateien, ✅ Geprüft).
4. Release ausführen:

```bash
bash scripts/release.sh               # check → Version +0.0.1 → Commit → Tag → Push
bash scripts/release.sh --dry-run     # alles prüfen, nichts pushen
```

Das Skript bricht ab, wenn `check.js` Fehler meldet, der CHANGELOG-Eintrag oder
die Release-Notes fehlen, der Arbeitsbaum Fremdes enthält oder `main` nicht
aktuell ist. Der Tag `v<version>` startet GitHub Actions → Windows-Installer →
Release. Nach dem Push: Marco auf https://github.com/Marco-Conrad-00/FinanzverwaltungPro-/actions
bzw. `/releases` hinweisen (ggf. Entwurf freigeben).

Kleine Doku-/Infra-Commits ohne neue App-Version: normal committen und
`git push origin main` (ohne Tag = kein Build).

Authentifizierung: normales `git push` (Git Credential Manager). Fallback: das
Skript nutzt `gh_token.txt` (Repo-Root, Elternordner oder
`X:/Claude/Finanzverwaltung Pro/`). **Token-Datei nie ausgeben, nie committen.**

## 7. Offene Punkte / Backlog

- **Modularisierung** von `app.js` (geplant, noch NICHT starten ohne Marcos „go"):
  Variante A = ~20 klassische Script-Dateien nach Domäne, gemeinsamer globaler
  Scope, Laden in Reihenfolge über `index.html`, `check.js` auf Multi-File
  erweitern; schrittweise über 6–8 Releases.
- **Arbeitszeit-Einnahmen automatisch** (fester Plan + Stundensatz + Auszahltag,
  Einträge mit `autoWork: true`, Config nach `pvConfig`-Muster) – Rückfragen an
  Marco offen.
- Mehr Standard-Kategorien / „+ Neue Kategorie" direkt im Modal (optional).
- Sparplan über Trade-Verrechnungskonto tagesgenau (optional).
- Bilder (jpg/png) als Versicherungs-Dokumente – bräuchte `main.js`-Änderung.
- Spesen-Sätze bei BMF-Änderungen aktualisieren (`spesen/`).
- Nach Releases mit Electron-only-Teilen (PDF-Vorschau, Speichern-Dialog,
  FX-Abruf, mailto) Smoke-Test in der echten App.
