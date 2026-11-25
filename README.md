# Finanzverwaltung Pro

Windows-Desktop-App zur persönlichen Finanzverwaltung (Electron).

> **Datenschutz:** Alle Daten bleiben lokal auf deinem Rechner
> (`%APPDATA%\finanzverwaltung-pro\data.json`). Keine Cloud, kein Tracking.

## Installation

1. Unter [Releases](../../releases) die neueste `Finanzverwaltung-Pro-Setup-<Version>.exe` herunterladen.
2. Installer ausführen (ohne Code-Signatur zeigt Windows ggf. „Weitere Informationen → Trotzdem ausführen").
3. Updates werden danach automatisch über GitHub-Releases angeboten.

## Aus dem Quellcode starten

```bash
npm install
npm start
```

Build eines Installers: `npx electron-builder --win` (Ergebnis in `dist/`).

## Lizenz

Siehe [LICENSE](LICENSE).
