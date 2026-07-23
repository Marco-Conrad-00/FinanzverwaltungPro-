# Finanzverwaltung Pro 1.0.27

**Datum:** 2026-07-23

---

## Reiter schneiden den Inhalt nicht mehr an

Auf deinen Screenshots war zu sehen, wie die Schaltflächen „Backup exportieren /
importieren / CSV / JSON" und der Backup-Ordner-Pfad **halb hinter der
Reiterleiste** verschwanden.

**Was ich in 1.0.26 falsch gemacht habe:** Ich hatte versucht, die Lücken um die
Leiste herum mit zusätzlichen Flächen (`::before` / `::after`) zuzudecken. Das
kaschiert das Problem nur an den Rändern – der Inhalt scrollte weiterhin bis
unmittelbar an die Leiste heran und wurde von ihr angeschnitten.

**Jetzt richtig gelöst:** Die Leiste zieht sich über die Polsterung des
Scrollbereichs hinaus (`margin:-20px -24px` bei gleich großer Innenpolsterung)
und deckt damit die **volle Breite** des Bereichs ab. Die eigentlichen Reiter
liegen in einem inneren Container, sodass die Optik unverändert bleibt. Ein
weicher Schatten grenzt sie vom Inhalt ab.

Der Kompaktmodus ist mit seinen kleineren Abständen (12px/16px) berücksichtigt.

---

## Speicherort wurde falsch angezeigt

Statt des Pfades erschien:

```
%APPDATA%⬆inanzverwaltung-prodata.json
```

**Ursache:** Der Pfad stand in einem Text-Baustein, in dem ein einzelner
Backslash eine Sonderbedeutung hat. Aus `\f` wurde ein unsichtbares
Steuerzeichen (das als Pfeil dargestellt wurde), `\d` verschwand ersatzlos –
deshalb fehlten beide Schrägstriche und die Teile klebten aneinander.

Korrigiert, angezeigt wird jetzt:

```
%APPDATA%\finanzverwaltung-pro\data.json
```

---

## Hinweis zu 1.0.26

Deine Screenshots zeigten Version **1.0.26** noch mit dem alten Verhalten. Das
passt dazu, dass die damalige Fassung das Problem nicht wirklich gelöst hatte –
sie hat nur die Ränder abgedeckt, nicht den durchscrollenden Inhalt.

---

## Technische Details

| Datei | Änderung |
|---|---|
| `src/styles.css` | `.settings-tabs` neu aufgebaut, `.settings-tabs-inner` ergänzt |
| `src/app.js` | inneren Container im Markup ergänzt, Pfad-Escaping korrigiert |
| `package.json` | → 1.0.27 |

---

## Validierung

```
node --check app.js / main.js / preload.js   ✓
node check.js .                              ✓ Keine Fehler, 0 Warnungen
```

**Markup geprüft:**

| Prüfung | Ergebnis |
|---|---|
| `settings-tabs` | 1× |
| `settings-tabs-inner` | 1× |
| div-Bilanz auf/zu | 2 / 2 ausgeglichen |
| Reiter | 6 |
| `undefined` im HTML | keins |

**Pfad-Ausgabe geprüft:** ergibt exakt
`%APPDATA%\finanzverwaltung-pro\data.json`.

**Paketinhalt gegengeprüft:** ZIP entpackt und bestätigt, dass das neue CSS, das
`settings-tabs-inner`-Markup und der korrigierte Pfad tatsächlich enthalten sind –
diesmal ausdrücklich, weil die Änderung aus 1.0.26 dich nicht erreicht hat.

---

## Nach dem Einspielen

**Reload:** `app.js` und `styles.css` sind Renderer-Dateien → **Ctrl+R**.

Falls die Leiste danach unverändert aussieht: Der Browser-Cache hält CSS
gelegentlich fest – dann hilft **Strg+Shift+R**.

**Versionierung:** `package.json` steht auf **1.0.27**; mit dem automatischen Bump
landest du auf **1.0.28**.
