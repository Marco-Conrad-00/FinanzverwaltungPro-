# Auto-Update einrichten (GitHub Releases)

Diese Anleitung richtet einmalig ein, dass deine App sich selbst aktualisiert.
Danach musst du für ein Update nur noch **eine neue Version veröffentlichen** — deine
Familie/Freunde bekommen sie automatisch angeboten.

---

## Was ich schon vorbereitet habe

- `package.json` → enthält `electron-updater` + GitHub-Publish-Konfiguration
- `main.js` → Auto-Updater-Code (prüft beim Start, lädt im Hintergrund, fragt per Dialog)
- `preload.js` → Brücke für manuellen Update-Check

**Wichtig:** In `package.json` musst du bei `"owner"` deinen echten GitHub-Namen eintragen
(steht aktuell `DEIN_GITHUB_NAME`).

---

## Schritt 1 — GitHub-Konto & Repository (einmalig)

1. Falls noch nicht vorhanden: kostenloses Konto auf https://github.com anlegen.
2. Neues Repository erstellen: Name **finanzverwaltung-pro**
   - Sichtbarkeit: **Private** ist völlig ok (Auto-Update funktioniert auch mit privaten Repos, solange die Nutzer den Token haben — für Familie einfacher: **Public**, dann braucht niemand einen Token zum Herunterladen).
   - Empfehlung für Familie/Freunde: **Public**.
3. In `package.json` bei `"owner"` deinen GitHub-Benutzernamen eintragen, z.B.:
   ```json
   "owner": "marco-mustermann",
   "repo": "finanzverwaltung-pro"
   ```

---

## Schritt 2 — GitHub Token (einmalig, nur zum Veröffentlichen)

Damit electron-builder Releases hochladen darf, braucht es einen Token.

1. GitHub → oben rechts auf dein Profilbild → **Settings**
2. Ganz unten links: **Developer settings**
3. **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**
4. Name: z.B. „electron-builder", Ablauf: nach Wunsch
5. Häkchen setzen bei **repo** (voller Zugriff aufs Repo)
6. **Generate token** → den Token **kopieren** (wird nur einmal angezeigt!)

Diesen Token setzt du beim Veröffentlichen als Umgebungsvariable (siehe Schritt 4).
**Nie in package.json oder ins Repo schreiben!**

---

## Schritt 3 — Abhängigkeiten installieren (einmalig)

Im Projektordner (wo package.json liegt) in der Kommandozeile:

```
npm install
```

Das installiert `electron-updater` neu mit.

---

## Schritt 4 — Erste Version veröffentlichen

1. Versionsnummer in `package.json` erhöhen (z.B. von `2.0.0` auf `2.0.1`).
   **Wichtig:** electron-updater erkennt Updates nur an einer höheren Versionsnummer.
2. Token als Umgebungsvariable setzen und veröffentlichen:

   **Windows (cmd):**
   ```
   set GH_TOKEN=dein_kopierter_token
   npm run publish
   ```

   **Windows (PowerShell):**
   ```
   $env:GH_TOKEN="dein_kopierter_token"
   npm run publish
   ```

3. electron-builder baut die App und lädt sie als **Release** auf GitHub hoch
   (inkl. der `latest.yml`, die der Updater zum Erkennen braucht).

---

## Schritt 5 — Fertig. So läuft ein Update ab

Ab jetzt ist der Ablauf für jede neue Version:

1. Du änderst Code (app.js, main.js, …)
2. Versionsnummer in package.json erhöhen (z.B. 2.0.1 → 2.0.2)
3. `npm run publish` (mit gesetztem GH_TOKEN)

Deine Familie/Freunde:
- Starten die App wie immer.
- Nach ein paar Sekunden prüft die App im Hintergrund auf Updates.
- Ist eine neuere Version da, wird sie heruntergeladen.
- Danach erscheint ein Dialog: **„Version X wurde heruntergeladen — jetzt neu starten?"**
- Ein Klick auf „Jetzt neu starten" installiert das Update.

**Kein manuelles Neu-Installieren mehr.**

---

## Optional: Manueller „Nach Updates suchen"-Button

Der Code stellt `window.EA.checkForUpdates()` bereit. Falls du in den Einstellungen
einen Button „Nach Updates suchen" möchtest, sag Bescheid — das ist ein kleiner Zusatz.

---

## Wichtige Hinweise

- **Im Entwicklungsmodus** (`npm start`) ist der Update-Check bewusst **deaktiviert** —
  er läuft nur in der installierten App. Du kannst also normal weiterentwickeln.
- **Signierung:** Für Windows ist eine Code-Signatur nicht zwingend, aber ohne sie zeigt
  Windows SmartScreen beim ersten Start eine Warnung („Unbekannter Herausgeber"). Für den
  Familienkreis ist das verschmerzbar (einmal „Trotzdem ausführen"). Ein Signatur-Zertifikat
  kostet Geld — für den Anfang nicht nötig.
- **Renderer-only-Änderungen** (nur app.js/styles.css) brauchen trotzdem eine neue Version +
  Release, damit sie bei anderen ankommen. Für dich lokal reicht weiterhin Strg+R.
