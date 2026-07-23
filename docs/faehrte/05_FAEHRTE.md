# FÄHRTENMODUL

## Zweck

Dieses Dokument beschreibt die komplette Fährtenfunktion von ANYVO.

Alle Änderungen an der Fährtenfunktion müssen sich an diesem Dokument orientieren.

Es dürfen keine parallelen Architekturen entstehen.

---

# Grundprinzip

Eine Fährte gehört IMMER genau zu einem Hund.

Referenz:

dog_id

Es existiert niemals eine zweite Hundestruktur.

---

# Lebenszyklus

Eine Fährte besitzt folgende Zustände:

- geplant
- legen
- ruhend
- absuchen
- abgeschlossen

Nur eine aktive Fährte pro Hund.

Mehrere Hunde dürfen gleichzeitig je eine aktive Fährte besitzen.

---

# Track

Eine Fährte besteht aus:

Track

↓

TrackPoints

↓

TrackEvents

TrackPoints enthalten ausschließlich GPS-Punkte.

TrackEvents enthalten Ereignisse.

TrackPoints werden niemals für Gegenstände oder Winkel verwendet.

---

# TrackEvents

TrackEvents dürfen sein:

- Gegenstand
- Winkel
- Offener Winkel
- Bodenwinkel
- Teilstrecke

Später:

- Verleitung
- Untergrundwechsel
- Suchfeld

Neue Ereignisse werden ausschließlich über TrackEvents erweitert.

Nicht über neue Tabellen.

---

# GPS

GPS läuft nur während:

- Legen

oder

- Absuchen

Während der Liegezeit läuft GPS NICHT.

---

# Bodenwinkel

Ein Bodenwinkel:

- beendet niemals eine Fährte
- startet niemals eine Fährte
- pausiert GPS nicht
- ist nur ein Ereignis

Standard:

5 Sekunden

---

# Offener Winkel

OW bedeutet:

Der Fährtenleger läuft den Winkel ohne stehen zu bleiben.

Es erfolgt keine Unterbrechung.

---

# Teilstrecken

Eine Teilstrecke besitzt:

Typ

Länge

Start

Ende

Status
