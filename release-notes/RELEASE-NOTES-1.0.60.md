# Finanzverwaltung Pro 1.0.60 – Spesen-Schalter präzisiert

## 🔧 Geändert
- **Ausgaben zählen sofort, nur die Pauschale wartet auf „erhalten".**
  Der in 1.0.59 eingeführte „erhalten"-Schalter je Reise hielt bisher den
  **kompletten** Saldo (Pauschale − Ausgaben) zurück. Jetzt korrekt:
  - Deine **(privaten) Ausgaben** auf der Reise mindern das Konto **sofort** –
    unabhängig vom Schalter (du hast sie ja schon bezahlt).
  - Nur die **Spesen-Pauschale** kommt hinzu, sobald die Reise auf
    **✓ erhalten** steht.
  - Beispiel: Kontostand 1.427,58 € · Ausgaben 1,83 € → sofort **1.425,75 €**;
    nach Erhalt der Pauschale (47 €) → **1.472,75 €**.
  - Der Saldo in der Tabelle wird bis zum Erhalt ausgegraut (Tooltip erklärt,
    dass bis dahin nur die Ausgaben zählen).

## 📝 Geänderte Dateien
- `src/app.js` – Reise-Wirkung in `kontoNetBis`, `kontoCashflowMonat` und
  `monthFinancials` auf „Ausgaben sofort − Pauschale erst bei erhalten"
  umgestellt; Tooltips angepasst; CHANGELOG.

## ✅ Geprüft
- `node --check src/app.js` – Syntax OK
- `src/check.js` – 0 Fehler, 0 Warnungen
- Logiktest mit deinen Zahlen: offen → 1.425,75 € (nur −1,83); erhalten →
  1.472,75 € (+47 Pauschale); vergangene Reise zählt automatisch;
  ohne Ausgaben + offen → 0.
