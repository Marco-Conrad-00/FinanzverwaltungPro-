# Finanzverwaltung Pro 1.0.55 – Depotwerte in Euro (Währungsumrechnung)

## 🐛 Behoben / ✨ Neu
- **Fremdwährungs-Kurse werden jetzt in Euro umgerechnet.**
  Bisher hat die App den Börsenkurs direkt genommen – auch wenn er in einer
  Fremdwährung geliefert wurde. Dadurch wurden Positionen in **USD** (z. B.
  NVIDIA, Take-Two, SpaceX) oder **AUD** (z. B. 88 Energy) **zu hoch**
  angezeigt. Jetzt rechnet die App den Depotwert korrekt in **Euro** um.
  - Der **Wechselkurs wird live geholt** (EZB-Referenzkurs über frankfurter.app),
    mit Rückfall auf einen hinterlegten Standardkurs, falls offline.
  - In der Depot-Karte steht bei Fremdwährungs-Titeln ein kleines Kürzel
    (z. B. „USD") neben dem Kurs; der angezeigte Kurs ist der **Euro-Wert**.
  - **Euro-Positionen** (Mercedes, Rheinmetall, ebase-Fonds, Bitcoin/€, XRP/€ …)
    bleiben unverändert.

  Beispiel: NVIDIA wurde vorher mit dem USD-Kurs bewertet (~2.595 €); nach der
  Umrechnung sind es ~2.250 € – wie bei deinem Broker.

## 📝 Geänderte Dateien
- `src/app.js` – neue Helfer `fxToEur`, `kursEUR`, `refreshFxKurse`
  (Live-Wechselkurse + Fallback `FX_DEFAULT`); Depotbewertung überall auf
  `kursEUR` umgestellt (Depot-Übersicht, Depot-Karten inkl. Kursanzeige,
  Fondswert, Jahres-/Analyse-Übersicht, Jahreswechsel-Snapshot); FX-Abruf im
  Auto-Refresh (`maybeAutoRefreshKurse`); CHANGELOG.

## ✅ Geprüft
- `node --check src/app.js` – Syntax OK
- `check.js` – 0 Fehler, 0 Warnungen
- Anhand deiner Daten verifiziert: die Fremdwährungs-Positionen entsprechen nach
  Umrechnung deinen Broker-Werten (NVDA/Take-Two/SpaceX/88 Energy), Euro-Werte
  bleiben gleich.

*Hinweis:* Der Live-Wechselkurs wird im echten Electron-Prozess geholt – die
Umrechnungslogik ist getestet; beim ersten Start mit Internet lädt die App den
aktuellen Kurs, danach passt der Depotwert automatisch.
