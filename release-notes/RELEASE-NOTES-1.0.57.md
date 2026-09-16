# Finanzverwaltung Pro 1.0.57 – Fix: manuelle Versicherungs-Verknüpfung

## 🐛 Behoben
- **Manuelle Verknüpfung Versicherung ↔ Fixkost hielt nicht.**
  Wenn man eine Fixkost manuell aus der Liste auswählte, erschien kurz
  „verknüpft", die grüne Verknüpfung blieb aber nicht bestehen bzw. wurde nicht
  angezeigt. Ursache: die Fixkosten-ID kam aus dem Auswahldialog als Text an,
  während bestehende IDs teils Zahlen sind – der (strikte) Vergleich schlug
  fehl. Jetzt wird typрichtig verglichen; die Verknüpfung bleibt dauerhaft
  bestehen und wird grün angezeigt, genau wie bei automatischen Namens-Treffern.

## ℹ️ Hinweis (schon vorhanden)
- Deine **Absenderadresse** für das Kündigungsschreiben pflegst du unter
  **Einstellungen → Profil** (Felder „Straße & Nr.", „PLZ", „Ort"). Diese
  Felder gibt es seit 1.0.54.

## 📝 Geänderte Dateien
- `src/app.js` – `versFixLinked` und die manuelle Auswahl in `versLinkFixkost`
  vergleichen die Fixkosten-ID jetzt per `String(...)`; CHANGELOG.

## ✅ Geprüft
- `node --check src/app.js` – Syntax OK
- `check.js` – 0 Fehler, 0 Warnungen
