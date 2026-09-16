# Finanzverwaltung Pro – Was ist neu seit Version 1.0.45

Dein installierter Stand: **1.0.45**
Neuer Stand nach dem Update: **1.0.48**

In diesem Update stecken die Verbesserungen aus drei Versionen (1.0.46, 1.0.47
und 1.0.48) zusammengefasst. Der Schwerpunkt liegt auf **Versicherungen &
Verträgen** und darauf, dass du an auslaufende Verträge **nicht mehr selbst
denken musst**.

---

## 🛡️ Neuer Bereich „Versicherungen & Verträge"

Über die Seitenleiste (🛡️) erreichst du jetzt eine eigene Verwaltung für
Versicherungen und Verträge.

- Je Vertrag erfasst du **Name, Typ** (z. B. Privathaftpflicht,
  Zusatzversicherung), **Anbieter, Policennummer, Betrag, Zahlweise**
  (monatlich, vierteljährlich, halbjährlich, jährlich, einmalig) sowie
  **Beginn und Ende**.
- Zu jedem Vertrag kannst du ein **PDF-Dokument hinterlegen**. Rechts erscheint
  dann eine **Vorschau direkt in der App** (Split-Screen, ähnlich wie in der
  Cloud-Ansicht). Alternativ lässt sich das PDF mit „Extern öffnen" im
  Standardprogramm anzeigen.
- Die Dokumente bleiben **lokal auf deinem Gerät** – es wird nichts
  hochgeladen.

*Hinweis: Derzeit werden PDF-Dateien unterstützt. Bilder (JPG/PNG) sind bewusst
noch nicht dabei.*

### Verknüpfung mit Fixkosten

Beim „Verknüpfen" prüft die App automatisch, ob es **bereits eine Fixkost mit
dem gleichen Namen** gibt:

- Wenn ja → die Versicherung wird damit **verbunden**.
- Wenn nein → die App **fragt, ob sie die Fixkost direkt anlegen soll** (der
  Betrag wird dabei automatisch auf Monatsbasis umgerechnet).

---

## ⏰ Automatische Ablauf-Erinnerung für Verträge

Damit kein befristeter Vertrag unbemerkt ausläuft:

- Beim **Start der App** prüft Finanzverwaltung Pro, welche Versicherungen und
  befristeten Fixkosten bald enden, und legt **automatisch rechtzeitig eine
  Erinnerung** an – pro Vertrag nur eine, ohne Doppelmeldungen.
- Die **Vorwarnzeit** ist in den Einstellungen → Erinnerungen wählbar
  (**1 / 2 / 3 / 6 Monate**, Standard: 2 Monate).
- Die Meldung erscheint als **In-App-Banner** und – wenn aktiviert – als
  **Windows-Benachrichtigung** (nur solange die App läuft; es wird keine echte
  E-Mail versendet).
- Fixkosten, die schlicht „im Dezember enden", gelten als normale Jahresgrenze
  und lösen **bewusst keine** Erinnerung aus (sonst gäbe es im November viele
  Fehlalarme).

---

## 📅 Echtes Vertragsende bei Fixkosten (Finanzierungen & Co.)

Das ist die jüngste Neuerung und genau das, was du dir gewünscht hast:

- Fixkosten haben jetzt ein **eigenes, optionales Feld „Vertragsende / läuft
  aus"** – getrennt von der jährlichen Angabe „Gültig bis". Ideal z. B. für
  eine **Finanzierung über 2 oder 3 Jahre** oder einen befristeten Vertrag.
- Dieses echte Enddatum wird **beim Jahreswechsel automatisch übernommen**:
  - Läuft der Vertrag erst in 1–3 Jahren aus, wird er jedes Jahr wieder
    mitgenommen – das Enddatum bleibt gespeichert.
  - Im Ablaufjahr wird die Gültigkeit automatisch auf den **Ablaufmonat
    begrenzt**.
  - Ist das Ende bereits vorbei, wird der Vertrag beim Jahreswechsel **nicht
    mehr übernommen** – er läuft von allein aus.
- Die **Ablauf-Erinnerung** nutzt dieses echte Vertragsende, sodass du
  rechtzeitig gewarnt wirst.

**Du musst also nicht mehr selbst daran denken** – trägst du das Ende einmal
ein, kümmert sich die App um den Rest.

*Nebeneffekt / Fehlerbehebung:* Früher wurde beim Jahreswechsel jedes Enddatum
pauschal auf Dezember gesetzt – dadurch ging ein echtes Laufzeitende verloren.
Das ist mit dem getrennten Feld jetzt behoben.

---

## ✅ Geprüft

- Syntaxprüfung (`node --check`) und interne Validierung (`check.js`):
  0 Fehler, 0 Warnungen.
- Logiktests für Jahreswechsel über mehrere Jahre (Vertragsende bleibt
  erhalten, wird im Ablaufjahr begrenzt, abgelaufene Verträge fallen raus) und
  für die Ablauf-Erinnerung (greift zum echten Ende, unbefristete Verträge
  lösen keine Erinnerung aus).

---

### Kurzüberblick der Einzelversionen

- **1.0.46** – Automatische Ablauf-Erinnerung beim Start (Vorlaufzeit
  einstellbar, Dezember-Grenze ausgenommen).
- **1.0.47** – Neuer Bereich „Versicherungen & Verträge" mit PDF-Vorschau und
  Fixkosten-Verknüpfung.
- **1.0.48** – Eigenes Feld „Vertragsende" bei Fixkosten; wird beim
  Jahreswechsel übernommen und läuft automatisch aus.
