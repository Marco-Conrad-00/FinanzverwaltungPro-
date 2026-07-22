# Finanzverwaltung Pro 1.0.21

**Datum:** 2026-07-22

Enthält den Fix für den gemeldeten Dark-Mode-Fehler, die frei wählbare
Hintergrundfarbe und die angepassten Installer-Grafiken.

---

## Fehlerbehebung: Farben wirkten im dunklen Modus nicht

**Ursache gefunden.** Die Klasse `theme-dark` wird auf **beide** Elemente gesetzt –
auf `<html>` *und* auf `<body>`. Die Farbvariablen wurden aber nur auf `<html>`
geschrieben. Da `<body>` näher am Inhalt liegt, gewann in der CSS-Kaskade immer
die Klasse auf `<body>` und hat die Einstellung sofort wieder überschrieben.

Gespeichert wurde also korrekt – sichtbar wurde nur nichts. Die Variablen werden
jetzt auf beide Elemente gesetzt.

---

## Neu: Hintergrundfarbe frei wählbar

Unter **Einstellungen → Darstellung → Farben → Hintergrund**.

- Aus der gewählten Farbe werden **Karten, Seitenleiste, Rahmen und Eingabefelder
  automatisch abgestuft**, damit alles zueinander passt
- Die **Textfarbe wird automatisch angepasst** (nach WCAG-Leuchtdichte), damit der
  Inhalt lesbar bleibt
- **Warnung bei zu wenig Kontrast**: Mittelhelle Grautöne wie `#7a7a7a` erreichen
  physikalisch nur ~4,3:1 – egal welche Textfarbe. Statt das stillschweigend
  hinzunehmen, weist die App mit dem konkreten Wert darauf hin
- Einzeln auf Standard zurücksetzbar, ohne die übrigen Farben zu verlieren

Der Grundton-Bereich zeigt einen Hinweis, wenn er von einem eigenen Hintergrund
überschrieben wird.

---

## Installer angepasst

Die blaue Standardgrafik im Setup kam von NSIS (electron-builder), **nicht** von
Windows – sie erschien nur, weil keine eigene hinterlegt war. Jetzt enthalten:

| Datei | Größe | Zweck |
|---|---|---|
| `build/installerSidebar.bmp` | 164 × 314 | Seitengrafik Willkommen-/Abschlussseite |
| `build/uninstallerSidebar.bmp` | 164 × 314 | dasselbe für die Deinstallation |
| `build/installerHeader.bmp` | 150 × 57 | Kopfbereich der Zwischenseiten |
| `build/license_de.txt` | – | Lizenzseite mit deinen Nutzungsbedingungen |

Gestaltung: dein Logo auf einem Verlauf von Slate nach Türkis, passend zum
Dark-Mode der App.

**Format geprüft:** alle drei sind echte 24-bit-BMPs ohne Kompression. Das ist
wichtig – ein PNG mit umbenannter Endung lässt den NSIS-Build stillschweigend
fehlschlagen.

**Was NSIS *nicht* zulässt:** Fensterlayout, Anordnung der Schaltflächen und den
Fensterrahmen. Das gibt der Installer vor.

### Nebenbei aufgeräumt
`files` stand auf `build/**/*`, wodurch die Installer-Grafiken (~330 KB) unnötig
mit **in die App** gepackt worden wären. Jetzt werden nur noch die tatsächlich zur
Laufzeit benötigten Icons eingebunden.

---

## Validierung

```
node --check app.js / main.js / preload.js   ✓
node check.js .                              ✓ Keine Fehler, 0 Warnungen
package.json                                 ✓ gültiges JSON
```

**Dark-Mode-Fix nachgewiesen** – Variablen landen auf beiden Elementen:

| Variable | html | body |
|---|---|---|
| `--accent` | `#EC4899` | `#EC4899` |
| `--bg` | `#1a0f2e` | `#1a0f2e` |
| `--sidebar` | `#110a1e` | `#110a1e` |

**Hintergrund-Ableitung** aus `#1a0f2e`: Karten `#281d3b`, abgesetzte Flächen
`#332945`, Seitenleiste `#110a1e`, Rahmen `#413852` – stimmige Abstufung.

**Textkontrast auf eigenen Hintergründen:**

| Hintergrund | Kontrast | Bewertung |
|---|---|---|
| `#1a0f2e` Dunkelviolett | 18,2:1 | sehr gut |
| `#000000` Schwarz | 20,1:1 | sehr gut |
| `#5a2d0c` Dunkelbraun | 11,1:1 | sehr gut |
| `#7a7a7a` Mittelgrau | 4,3:1 | **Warnung erscheint** |

**Fallback geprüft:** Ohne eigenen Hintergrund greift wieder der Grundton;
bei „Slate" werden keine Inline-Werte gesetzt, sodass das CSS gilt.

---

## Nach dem Einspielen

**Reload:** `app.js`, `index.html`, `styles.css` sind Renderer-Dateien → **Ctrl+R**.

**Installer-Grafiken** werden erst beim nächsten GitHub-Actions-Build sichtbar,
da der Installer dort entsteht.

**Versionierung:** `package.json` steht auf **1.0.21**; mit dem automatischen
Bump aus `release_new_version.sh` landest du auf **1.0.22**.
