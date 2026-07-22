# Finanzverwaltung Pro 1.0.20

**Datum:** 2026-07-22

Dieses Paket enthält **vier** Versionssprünge gegenüber dem Repo-Stand (1.0.16):
Konto-Löschschutz (1.0.17), PV-Bereich (1.0.18), neu gegliederte Einstellungen
(1.0.19) und das Farbsystem (1.0.20).

---

## 1.0.20 – Farben frei anpassbar

Zu finden unter **Einstellungen → Darstellung → Farben**.

### Zwei Wege, wie gewünscht
- **Farbwelten**: zehn fertige Paletten (Türkis, Blau, Indigo, Violett, Beere,
  Rot, Bernstein, Grün, Oliv, Grafit) – ein Klick, fertig
- **Eigene Farben**: freier Farbwähler für Akzentfarbe, Zweitfarbe sowie die
  Farben positiver und negativer Beträge

### Hell und Dunkel getrennt
Dieselbe Farbe wirkt auf hellem und dunklem Grund unterschiedlich. Die App merkt
sich deshalb für beide Modi eigene Werte. Du bearbeitest immer den gerade aktiven
Modus – ein Hinweistext im Bereich sagt dir, welcher das ist.

> **Wichtige Reparatur:** Im dunklen Modus war die Akzentfarbe bisher **fest
> vorgegeben** – `applyTheme` hat die Inline-Styles dort bewusst entfernt, damit
> das Türkis/Blau aus dem CSS greift. Farbanpassung war im Dark-Mode also gar
> nicht möglich. Das ist jetzt behoben.

### Grundtöne (nur dunkler Modus)
Vier abgestimmte Hintergrundwelten: **Slate** (Standard), **Neutralgrau**,
**Marineblau**, **Anthrazit**. Alle geprüft auf ≥17:1 Textkontrast.

Die Hintergründe sind bewusst **nicht** frei wählbar – dort kippen Kontraste
sehr schnell ins Unlesbare. Fertige Grundtöne lösen dasselbe Bedürfnis sicher.

### Automatische Lesbarkeitsprüfung
Die Schriftfarbe auf Buttons wird nach WCAG-Leuchtdichte berechnet und auf
Schwarz oder Weiß gesetzt – je nachdem, was auf deiner Farbe besser lesbar ist.
Liegt der Kontrast unter 4,5:1, erscheint ein Hinweis mit dem konkreten Wert.

> Bisher stand im CSS fest `color: #0F172A` für Buttons im Dark-Mode. Bei einer
> dunklen Akzentfarbe wäre die Beschriftung damit unlesbar geworden. Die Regel
> nutzt jetzt `var(--accent-text)`.

### Komfort
- **Live-Vorschau** beim Ziehen im Farbwähler (ohne Speichern)
- **Vorschau-Leiste** mit Buttons, Kennzeichen und Beispielbeträgen
- **Zurücksetzen** auf die Standardfarben

---

## 1.0.19 – Einstellungen neu gegliedert
Sechs Reiter statt einer langen Seite: Profil · Konten & Jahre · Darstellung ·
Funktionen · Daten & Sicherheit · Über. „Jahr archivieren" sitzt jetzt bei der
Jahres-Verwaltung, „Backup vor Update" bei den Backup-Einstellungen. Gefahrenzone
sachlich ohne Symbole. Zuletzt geöffneter Reiter wird gemerkt.

## 1.0.18 – Bereich „PV-Anlage"
Optionaler Menüpunkt mit Produktion, Verbrauch, Netzbezug und Einspeisung je
Monat; Autarkie und Eigenverbrauchsquote mit Ampelfarben; drei Auswertungen.
Jahre unabhängig vom Finanzjahr.

## 1.0.17 – Konto-Löschschutz
Rückfrage mit Saldo vor jedem Konto-Löschen, optionaler PIN-Schutz (SHA-256).

---

## Technische Details

### Geänderte Dateien
| Datei | Änderung |
|---|---|
| `src/app.js` | Farbsystem, Settings-Tabs, PV-Modul, PIN-Schutz, Allowlist, Exports, CHANGELOG |
| `src/index.html` | Sidebar-Eintrag `#navPv` |
| `src/styles.css` | Tab-Leiste, dynamische Button-Schriftfarbe |
| `package.json` | 1.0.16 → 1.0.20 |

### Datenmodell Farben
```
state.config.farben = {
  light: { accent, accent2, green, red },
  dark:  { accent, accent2, green, red },
  grundton: 'slate' | 'neutral' | 'marine' | 'kohle'
}
```
Liegt in `config`, das bereits in der `loadData`-Allowlist steht. Eine vorhandene
alte `config.accent`-Einstellung wird automatisch als Hell-Akzent übernommen.

### Neue Funktionen
`farbCfg`, `farbenAnwenden`, `farbeSetzen`, `farbeVorschau`, `paletteAnwenden`,
`grundtonSetzen`, `farbenZuruecksetzen`, `aktivePaletteId`, `hexToRgb`, `rgbToHex`,
`farbeMischen`, `farbeDunkler`, `leuchtdichte`, `kontrast`, `lesbareSchrift`

---

## Validierung

```
node --check app.js / main.js / preload.js   ✓
node check.js .                              ✓ Keine Fehler, 0 Warnungen
```

**Farb-Berechnungen isoliert getestet:**

| Farbe | Schriftfarbe | Kontrast |
|---|---|---|
| `#0EA5E9` Standard-Blau | Dunkel | 6,44:1 |
| `#22D3EE` Türkis hell | Dunkel | 9,88:1 |
| `#0f766e` Türkis dunkel | Weiß | 5,47:1 |
| `#1a1a2e` sehr dunkel | Weiß | 17,06:1 |

- Alle **10 Paletten** mit gültigen Hex-Werten für hell *und* dunkel
- Alle **4 Grundtöne** mit 17,1–17,9:1 Textkontrast
- Alte `accent`-Einstellung wird korrekt migriert
- Ungültige gespeicherte Werte (`'kaputt'`, `null`, unbekannter Grundton) werden
  automatisch auf Standardwerte repariert

**Rendertest der Einstellungsseite:** 39.524 Zeichen HTML, genau ein sichtbarer
Reiter, kein `undefined` im Markup, 10 Paletten-Buttons, 4 Grundton-Buttons,
4 Farbwähler.

---

## Nach dem Einspielen

**Reload:** `app.js`, `index.html`, `styles.css` sind alle Renderer-Dateien →
**Ctrl+R** genügt. Kein App-Neustart nötig.

**Versionierung:** `package.json` steht auf **1.0.20**. Da `release_new_version.sh`
selbst um +0.0.1 erhöht, landest du bei unverändertem Lauf auf **1.0.21**.

**CHANGELOG-Lücke:** 1.0.14–1.0.16 haben weiterhin keine Einträge.
