# Finanzverwaltung Pro 1.0.19

**Datum:** 2026-07-22

Dieses Paket enthält **drei** Versionssprünge gegenüber dem Repo-Stand (1.0.16):
Konto-Löschschutz (1.0.17), PV-Bereich (1.0.18) und die neu gegliederten
Einstellungen (1.0.19).

---

## 1.0.19 – Einstellungen neu gegliedert

Statt einer einzigen langen Seite mit 14 Abschnitten gibt es jetzt **sechs Reiter**:

| Reiter | Inhalt |
|---|---|
| 👤 **Profil** | Name, Startjahr, Währung, Startseite, Datumsformat, Startdialog, Willkommensassistent, App-Tour, Nutzungsbedingungen, Änderungsverlauf |
| 🏦 **Konten & Jahre** | Startguthaben, Konten inkl. Stand setzen / Diagnose / Korrekturen, Löschschutz-PIN, Jahres-Verwaltung, Jahr archivieren |
| 🎨 **Darstellung** | Theme, Akzentfarbe, Kompaktmodus |
| ⚙️ **Funktionen** | Sparziel, ETF & Depot (Live-Daten), PV-Anlage, Erinnerungen, Kategorien |
| 💾 **Daten & Sicherheit** | Backup, Auto-Backup, Updates, System, Papierkorb, Gefahrenzone |
| ℹ️ **Über** | Feedback, Entwicklung unterstützen, Version |

### Was dabei sinnvoll zusammengeführt wurde
- **„Jahr archivieren"** saß bisher unter *System*, während die Jahres-Verwaltung
  250 Zeilen weiter unten stand. Beides liegt jetzt zusammen im Reiter *Konten & Jahre*.
- **„Backup vor Update"** steht jetzt direkt neben den übrigen Backup- und
  Update-Einstellungen.
- Alle **aktivierbaren Funktionen** (Sparziel, ETF-Live-Daten, PV, Erinnerungen,
  Kategorien) liegen gebündelt an einem Ort.

### Gefahrenzone
Sachlich gestaltet, **ohne Symbole**: klare Überschrift „Unwiderrufliche Aktionen",
Hinweis auf ein vorheriges Backup, dezent rot abgesetzter Rahmen. Die Bereichs-Buttons
sind nach dem betroffenen Jahr beschriftet.

### Sonstiges
- Der zuletzt geöffnete Reiter wird gemerkt (`config.settingsTab`)
- Tab-Leiste bleibt beim Scrollen oben stehen
- Auf schmalen Fenstern brechen die Reiter automatisch um

---

## 1.0.18 – Bereich „PV-Anlage"

- Neuer Menüpunkt **☀️ PV-Anlage** unter PLANUNG, erscheint erst nach Aktivierung
- Erfassung je Monat: Produktion, Verbrauch, Netzbezug, Einspeisung
- **Autarkie** = (Verbrauch − Bezug) ÷ Verbrauch, mit Ampelfarben: ab 80 % grün, ab 50 % gelb, darunter rot
- **Eigenverbrauchsquote** = (Produktion − Einspeisung) ÷ Produktion
- Drei Auswertungen: Jahresproduktion (Balken), Ø Autarkie (Linie), Monatsvergleich mehrerer Jahre
- Jahre frei anlegbar, auch vor dem App-Startjahr; unabhängig vom Finanzjahr
- Ausblenden löscht keine Daten

## 1.0.17 – Konto-Löschschutz

- Rückfrage vor jedem Konto-Löschen mit Name, Saldo und Hinweis auf Umhängen der Buchungen
- Optionaler **PIN-Schutz**, 3 Versuche, nur als SHA-256-Prüfsumme gespeichert
- Bei aktivem Schutz zeigt der Löschen-Button 🔒 statt ×

---

## Technische Details

### Geänderte Dateien
| Datei | Änderung |
|---|---|
| `src/app.js` | Settings-Tabs, PV-Modul, PIN-Schutz, Routing, Allowlist, Exports, CHANGELOG |
| `src/index.html` | Sidebar-Eintrag `#navPv` (standardmäßig ausgeblendet) |
| `src/styles.css` | `.settings-tabs` / `.set-tab` Tab-Leiste |
| `package.json` | 1.0.16 → 1.0.19 |

### Datenmodell PV — bewusst entkoppelt
```
state.pv       = { '2024': [ {produktion, verbrauch, bezug, einspeisung} × 12 ], ... }
state.pvConfig = { jahre: [], chartJahre: [], vergleichAktiv: false }
state.config.pvAktiv      = true|false
state.config.settingsTab  = 'profil' | 'konten' | ...
```

PV liegt **außerhalb** von `YEAR_FIELDS`, damit PV-Jahre (ab Inbetriebnahme)
unabhängig von den Finanzjahren der App sind.

> **Allowlist:** `pv` und `pvConfig` wurden in `loadData` → `const fields = [...]`
> eingetragen. `settingsTab` und `pvAktiv` liegen in `config`, das bereits gelistet war.

---

## Validierung

```
node --check app.js / main.js / preload.js   ✓
node check.js .                              ✓ Keine Fehler, 0 Warnungen
```

**Vollständigkeitsprüfung des Umbaus** — alle `onclick`/`onchange`-Handler der alten
Einstellungsseite wurden gegen die neue Fassung abgeglichen:

```
Original : 50 Handler
Neu      : 51 Handler
Fehlend  : keine
Neu dazu : setSettingsTab
```

Zusätzlich wurde die Seite in einer simulierten Umgebung tatsächlich gerendert:
28.302 Zeichen HTML, genau **ein** sichtbarer Reiter, kein `undefined` im Markup,
keine doppelten Abschnitte, Gefahrenzone nachweislich emojifrei.

**PV-Autarkie, Randfälle** (alle bestanden):

| Fall | Ergebnis |
|---|---|
| V=818,4 / B=292,3 | 64,28 % — deckungsgleich mit dem Sheet |
| Bezug leer | `–` |
| Verbrauch 0 | `–` (keine Division durch Null) |
| Bezug 0 | 100 % |
| Bezug > Verbrauch | −28,57 % |

---

## Nach dem Einspielen

**Reload:** `app.js`, `index.html` und `styles.css` sind alle Renderer-Dateien →
**Ctrl+R** genügt. `main.js` / `preload.js` unverändert, kein Neustart nötig.

**Versionierung:** `package.json` steht auf **1.0.19**. Da `release_new_version.sh`
selbst um +0.0.1 erhöht, landest du bei unverändertem Lauf auf **1.0.20**.

**CHANGELOG-Lücke:** Die Versionen 1.0.14–1.0.16 haben weiterhin keine Einträge —
im Repo stand der CHANGELOG bei 1.0.13, während `package.json` bereits 1.0.16 war.
