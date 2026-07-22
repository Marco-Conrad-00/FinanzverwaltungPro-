# Finanzverwaltung Pro 1.0.18

**Datum:** 2026-07-22

Dieses Paket enthält **zwei** Versionssprünge: den Konto-Löschschutz (1.0.17)
und den neuen PV-Bereich (1.0.18).

---

## 1.0.18 – Neuer Bereich „PV-Anlage"

- **Neuer Menüpunkt „☀️ PV-Anlage"** unter PLANUNG, direkt unter „Zählerstände"
- Erfassung je Monat: **Produktion, Verbrauch, Netzbezug, Einspeisung** (alle kWh)
- **Autarkie** = (Verbrauch − Bezug) ÷ Verbrauch, automatisch berechnet und mit Ampelfarben bewertet: ab 80 % grün, ab 50 % gelb, darunter rot
- **Eigenverbrauchsquote** = (Produktion − Einspeisung) ÷ Produktion, je Monat und im Jahresschnitt
- **Drei Auswertungen**:
  - Jahresproduktion als Balkendiagramm
  - Ø Autarkie im Jahresverlauf als Linie (0–100 %)
  - Monatsvergleich mehrerer Jahre übereinander (frei per Checkbox wählbar)
- Summenzeile je Jahr mit Σ Produktion/Verbrauch/Bezug/Einspeisung und Ø Autarkie
- Der Menüpunkt **erscheint erst nach Aktivierung** in den Einstellungen
- **Ausblenden löscht keine Daten**

### Aktivierung
Einstellungen → Profil & Konto → Block **☀️ PV-Anlage** → „Aktivieren".
Danach erscheint der Menüpunkt in der Seitenleiste.

---

## 1.0.17 – Konto-Löschschutz

- Vor dem Löschen eines Kontos erscheint **immer** eine Rückfrage mit Kontoname, aktuellem Saldo und Hinweis, dass Buchungen umgehängt werden
- **Optionaler PIN-Schutz** (Einstellungen → „Konto-Löschschutz"), 3 Versuche
- PIN wird nur als SHA-256-Prüfsumme gespeichert, **nie im Klartext**
- Bei aktivem Schutz zeigt der Löschen-Button ein 🔒 statt des roten ×
- PIN jederzeit änder- oder entfernbar (nur mit Kenntnis der aktuellen PIN)

---

## Technische Details

### Geänderte Dateien
| Datei | Änderung |
|---|---|
| `src/app.js` | PV-Modul, PIN-Schutz, Routing, Allowlist, Exports, CHANGELOG |
| `src/index.html` | Sidebar-Eintrag `#navPv` (standardmäßig `display:none`) |
| `package.json` | Version 1.0.16 → 1.0.18 |

### Datenmodell PV — bewusst entkoppelt

```
state.pv       = { '2024': [ {produktion, verbrauch, bezug, einspeisung} × 12 ], ... }
state.pvConfig = { jahre: [], chartJahre: [], vergleichAktiv: false }
state.config.pvAktiv = true|false
```

PV liegt **außerhalb** von `YEAR_FIELDS` und damit außerhalb der Jahresstruktur.
Das war Absicht: PV-Jahre (ab Inbetriebnahme, z.B. 2024) sind unabhängig von den
Finanzjahren der App. Der Jahres-Umschalter oben beeinflusst die PV-Seite nicht,
und Jahre vor dem App-Startjahr lassen sich problemlos anlegen.

> **Allowlist:** `pv` und `pvConfig` wurden in `loadData` → `const fields = [...]`
> eingetragen. Ohne diesen Schritt wären die Daten beim Neustart still verschwunden
> (das war seinerzeit die Ursache des Reminders-Bugs).

### Löschverhalten
- `clearAllData` (Jahr leeren) rührt PV **nicht** an — korrekt, da PV jahresunabhängig ist
- `resetApp` (Werksreset) setzt `pv` und `pvConfig` explizit zurück

### Neue Funktionen
`pvAktiv`, `pvStore`, `pvCfg`, `pvJahrDaten`, `pvJahre`, `pvAutarkie`,
`pvEigenverbrauch`, `pvJahresSumme`, `pvAmpel`, `pvAktivieren`, `pvDeaktivieren`,
`pvNavSichtbarkeit`, `pvJahrHinzufuegen`, `pvJahrEntfernen`, `pvUpdate`,
`pvToggleChartJahr`, `pv` (Seite), `renderPvCharts`
sowie `hashPin`, `deletePinIsSet`, `verifyDeletePin`, `setDeletePin`,
`changeDeletePin`, `removeDeletePin`.

---

## Validierung

```
node --check app.js      ✓
node --check main.js     ✓
node --check preload.js  ✓
node check.js .          ✓ Keine Fehler, 0 Warnungen
```

Zusätzlich isoliert getestet:

**PIN:** Hash deterministisch, unterschiedliche PINs → unterschiedliche Hashes, 64 Hex-Zeichen.

**Autarkie-Randfälle** (alle bestanden):

| Fall | Ergebnis |
|---|---|
| V=818,4 / B=292,3 | 64,28 % (gelb) — deckungsgleich mit dem Sheet |
| Bezug leer | `–` (keine Falschrechnung) |
| Verbrauch 0 | `–` (keine Division durch Null) |
| Bezug 0 | 100 % (grün) |
| Bezug = Verbrauch | 0 % (rot) |
| Bezug > Verbrauch | −28,57 % (rot) |

**Ampelgrenzen:** 0,85 grün · 0,80 grün · 0,79 gelb · 0,50 gelb · 0,49 rot

---

## Nach dem Einspielen

**Reload:** `app.js` **und** `index.html` geändert → beides Renderer-Dateien,
**Ctrl+R** genügt. `main.js` / `preload.js` sind unverändert, kein App-Neustart nötig.

**Versionierung:** `package.json` steht bereits auf **1.0.18**. Da
`release_new_version.sh` selbst um +0.0.1 erhöht, landest du bei unverändertem
Lauf auf **1.0.19**.

**Hinweis zum CHANGELOG:** Die Versionen 1.0.14–1.0.16 haben keine Einträge —
im Repo stand der CHANGELOG noch bei 1.0.13, während `package.json` bereits auf
1.0.16 war. Die Lücke besteht weiterhin, falls du sie nachtragen willst.
