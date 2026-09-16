# Finanzverwaltung Pro 1.0.56 – Release-Nachzug + Wechselkurs-Anzeige

## Hintergrund
Beim Veröffentlichen von 1.0.55 wurde der Quellcode zwar auf GitHub aktualisiert
(main ist auf 1.0.55, die Euro-Umrechnung ist enthalten), aber der **Versions-Tag
`v1.0.55` wurde nicht gesetzt** – dadurch lief der automatische Release-/Build-
Prozess nicht an. Dieses Update (1.0.56) enthält eine echte kleine Änderung,
sodass beim Ausführen des Release-Scripts ein normaler Commit **mit Tag `v1.0.56`
und Release-Build** entsteht. Damit landet die Euro-Umrechnung aus 1.0.55 in
einem richtigen Release.

## ✨ Enthalten
- **Euro-Umrechnung der Depotwerte** (aus 1.0.55): US-/AUD-Kurse werden in Euro
  umgerechnet (Live-Wechselkurs, Fallback offline).
- **Neu 1.0.56:** In der Depot-Karte zeigt das Fremdwährungs-Kürzel jetzt als
  Tooltip den Originalkurs, den verwendeten Wechselkurs und dessen Stand-Datum.

## 📝 Geänderte Dateien
- `src/app.js` – Tooltip am Fremdwährungs-Kürzel (Kurs, Umrechnung, Stand);
  CHANGELOG.

## ✅ Geprüft
- `node --check src/app.js` – Syntax OK
- `check.js` – 0 Fehler, 0 Warnungen
