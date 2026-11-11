# Fährten-Simulator — Matrixbericht (Legen)

1422 simulierte Legeläufe durch die echte Lege-Verarbeitung der App. Gruppen: winkel (702 Läufe, 855 s), geraet (288 Läufe, 564 s), varianten (384 Läufe, 841 s), pruefung (48 Läufe, 1299 s).

Alle Zahlen sind Simulationsergebnisse mit angenommenen Fehlermodellen (siehe README.md), keine Feldmessungen.

Statistische Unsicherheit: bei 12 Läufen je Zelle schwankt ein Prozentwert zufällig um rund ±15 Punkte, bei 6 Läufen um ±20. Einzelne Zellen nicht überbewerten, auf Muster über mehrere Zellen achten.

## Winkel × Schenkellänge — Neueres Handy (Zweifrequenz-GPS), offenes Feld, in der Hand

Läufe je Zelle: 12.

**Winkel gefunden UND richtig klassiert**

| | 10 m | 20 m | 40 m |
|---|---|---|---|
| Innenwinkel 150° (keine App-Klasse) | 0 % | 0 % | 0 % |
| Innenwinkel 135° (keine App-Klasse) | 0 % | 0 % | 0 % |
| Innenwinkel 120° (keine App-Klasse) | 17 % | 42 % | 8 % |
| Innenwinkel 105° (normal) | 83 % | 92 % | 50 % |
| Innenwinkel 90° (normal) | 92 % | 92 % | 75 % |
| Innenwinkel 75° (normal) | 100 % | 92 % | 83 % |
| Innenwinkel 60° (spitz) | 83 % | 92 % | 83 % |
| Innenwinkel 45° (spitz) | 25 % | 58 % | 67 % |
| Innenwinkel 30° (spitz) | 75 % | 75 % | 42 % |

**Winkel gefunden (egal welche Klasse) · falsche Zusatzwinkel je 100 m**

| | 10 m | 20 m | 40 m |
|---|---|---|---|
| Innenwinkel 150° (keine App-Klasse) | 8 % · 0,4 | 0 % · 0,0 | 0 % · 0,0 |
| Innenwinkel 135° (keine App-Klasse) | 8 % · 0,0 | 0 % · 0,0 | 8 % · 0,0 |
| Innenwinkel 120° (keine App-Klasse) | 17 % · 0,0 | 42 % · 0,0 | 8 % · 0,0 |
| Innenwinkel 105° (normal) | 83 % · 0,0 | 92 % · 0,0 | 50 % · 0,0 |
| Innenwinkel 90° (normal) | 92 % · 0,0 | 92 % · 0,0 | 75 % · 0,0 |
| Innenwinkel 75° (normal) | 100 % · 0,0 | 92 % · 0,2 | 83 % · 0,0 |
| Innenwinkel 60° (spitz) | 83 % · 0,0 | 92 % · 0,0 | 83 % · 0,0 |
| Innenwinkel 45° (spitz) | 67 % · 0,5 | 92 % · 0,0 | 100 % · 0,1 |
| Innenwinkel 30° (spitz) | 75 % · 0,5 | 75 % · 0,0 | 50 % · 0,0 |

**Lage des erkannten Winkels: Abstand zum wahren Winkelpunkt (m) · Richtung richtig**

| | 10 m | 20 m | 40 m |
|---|---|---|---|
| Innenwinkel 150° (keine App-Klasse) | 3,6 · 100 % | – · – | – · – |
| Innenwinkel 135° (keine App-Klasse) | 1,4 · 100 % | – · – | 1,8 · 100 % |
| Innenwinkel 120° (keine App-Klasse) | 3,1 · 100 % | 2,1 · 100 % | 1,2 · 100 % |
| Innenwinkel 105° (normal) | 1,3 · 100 % | 1,5 · 100 % | 1,6 · 100 % |
| Innenwinkel 90° (normal) | 1,8 · 100 % | 1,2 · 100 % | 1,3 · 100 % |
| Innenwinkel 75° (normal) | 1,6 · 100 % | 1,8 · 100 % | 1,4 · 100 % |
| Innenwinkel 60° (spitz) | 2,1 · 100 % | 1,7 · 100 % | 1,2 · 100 % |
| Innenwinkel 45° (spitz) | 1,3 · 100 % | 1,9 · 100 % | 1,7 · 100 % |
| Innenwinkel 30° (spitz) | 2,6 · 100 % | 2,1 · 100 % | 2,6 · 100 % |

**Linie: Formfehler (m) · Längenfehler (Betrag, %) · Startpunktfehler (m)**

| | 10 m | 20 m | 40 m |
|---|---|---|---|
| Innenwinkel 150° (keine App-Klasse) | 0,5 · 6,2 · 1,4 | 0,5 · 4,1 · 1,3 | 0,5 · 1,8 · 1,3 |
| Innenwinkel 135° (keine App-Klasse) | 0,6 · 8,6 · 1,6 | 0,7 · 3,1 · 1,7 | 0,6 · 2,2 · 1,4 |
| Innenwinkel 120° (keine App-Klasse) | 0,7 · 7,2 · 1,7 | 0,7 · 3,3 · 1,3 | 0,8 · 2,2 · 1,8 |
| Innenwinkel 105° (normal) | 0,6 · 9,4 · 1,2 | 0,7 · 3,9 · 1,5 | 0,8 · 2,5 · 1,8 |
| Innenwinkel 90° (normal) | 0,9 · 7,2 · 1,9 | 0,6 · 6,7 · 1,4 | 0,6 · 2,7 · 1,3 |
| Innenwinkel 75° (normal) | 0,7 · 12,9 · 1,6 | 0,8 · 5,2 · 1,6 | 0,6 · 2,8 · 1,2 |
| Innenwinkel 60° (spitz) | 0,7 · 15,6 · 1,6 | 0,7 · 6,9 · 1,6 | 0,7 · 3,5 · 1,3 |
| Innenwinkel 45° (spitz) | 0,6 · 16,0 · 1,5 | 0,7 · 8,4 · 1,5 | 0,7 · 3,6 · 1,8 |
| Innenwinkel 30° (spitz) | 0,6 · 24,4 · 1,6 | 0,5 · 9,1 · 1,3 | 0,7 · 6,5 · 1,8 |

**Längste Rechenzeit der Engine für eine einzelne GPS-Messung (ms, auf diesem Rechner)**

| | 10 m | 20 m | 40 m |
|---|---|---|---|
| Innenwinkel 150° (keine App-Klasse) | 86 | 259 | 665 |
| Innenwinkel 135° (keine App-Klasse) | 140 | 194 | 369 |
| Innenwinkel 120° (keine App-Klasse) | 79 | 157 | 612 |
| Innenwinkel 105° (normal) | 69 | 184 | 497 |
| Innenwinkel 90° (normal) | 77 | 107 | 218 |
| Innenwinkel 75° (normal) | 37 | 126 | 161 |
| Innenwinkel 60° (spitz) | 32 | 77 | 151 |
| Innenwinkel 45° (spitz) | 36 | 208 | 192 |
| Innenwinkel 30° (spitz) | 36 | 78 | 164 |

## Winkel × Schenkellänge — Mittelklasse (Einfrequenz-GPS), offenes Feld, in der Hand

Läufe je Zelle: 12.

**Winkel gefunden UND richtig klassiert**

| | 10 m | 20 m | 40 m |
|---|---|---|---|
| Innenwinkel 150° (keine App-Klasse) | 0 % | 0 % | 0 % |
| Innenwinkel 135° (keine App-Klasse) | 0 % | 0 % | 0 % |
| Innenwinkel 120° (keine App-Klasse) | 25 % | 42 % | 17 % |
| Innenwinkel 105° (normal) | 25 % | 33 % | 58 % |
| Innenwinkel 90° (normal) | 75 % | 75 % | 67 % |
| Innenwinkel 75° (normal) | 67 % | 50 % | 50 % |
| Innenwinkel 60° (spitz) | 92 % | 83 % | 75 % |
| Innenwinkel 45° (spitz) | 33 % | 33 % | 58 % |
| Innenwinkel 30° (spitz) | 25 % | 67 % | 33 % |

**Winkel gefunden (egal welche Klasse) · falsche Zusatzwinkel je 100 m**

| | 10 m | 20 m | 40 m |
|---|---|---|---|
| Innenwinkel 150° (keine App-Klasse) | 0 % · 0,0 | 0 % · 0,0 | 8 % · 0,1 |
| Innenwinkel 135° (keine App-Klasse) | 17 % · 0,0 | 17 % · 0,0 | 0 % · 0,0 |
| Innenwinkel 120° (keine App-Klasse) | 25 % · 0,0 | 42 % · 0,0 | 17 % · 0,0 |
| Innenwinkel 105° (normal) | 25 % · 0,0 | 33 % · 0,0 | 58 % · 0,0 |
| Innenwinkel 90° (normal) | 75 % · 0,0 | 75 % · 0,0 | 67 % · 0,1 |
| Innenwinkel 75° (normal) | 67 % · 0,0 | 58 % · 0,0 | 58 % · 0,1 |
| Innenwinkel 60° (spitz) | 92 % · 0,0 | 83 % · 0,0 | 75 % · 0,0 |
| Innenwinkel 45° (spitz) | 58 % · 0,0 | 67 % · 0,2 | 83 % · 0,0 |
| Innenwinkel 30° (spitz) | 67 % · 0,0 | 75 % · 0,0 | 50 % · 0,2 |

**Lage des erkannten Winkels: Abstand zum wahren Winkelpunkt (m) · Richtung richtig**

| | 10 m | 20 m | 40 m |
|---|---|---|---|
| Innenwinkel 150° (keine App-Klasse) | – · – | – · – | 1,3 · 100 % |
| Innenwinkel 135° (keine App-Klasse) | 2,5 · 100 % | 4,1 · 100 % | – · – |
| Innenwinkel 120° (keine App-Klasse) | 2,1 · 100 % | 2,4 · 100 % | 2,8 · 100 % |
| Innenwinkel 105° (normal) | 3,0 · 100 % | 2,5 · 100 % | 2,1 · 100 % |
| Innenwinkel 90° (normal) | 2,6 · 100 % | 3,1 · 100 % | 1,7 · 100 % |
| Innenwinkel 75° (normal) | 2,0 · 100 % | 2,4 · 100 % | 1,8 · 100 % |
| Innenwinkel 60° (spitz) | 2,6 · 100 % | 2,2 · 100 % | 2,5 · 100 % |
| Innenwinkel 45° (spitz) | 2,1 · 100 % | 1,7 · 100 % | 2,8 · 100 % |
| Innenwinkel 30° (spitz) | 2,1 · 100 % | 3,5 · 100 % | 3,3 · 100 % |

**Linie: Formfehler (m) · Längenfehler (Betrag, %) · Startpunktfehler (m)**

| | 10 m | 20 m | 40 m |
|---|---|---|---|
| Innenwinkel 150° (keine App-Klasse) | 0,8 · 8,7 · 2,4 | 0,8 · 5,4 · 2,6 | 1,1 · 2,6 · 2,4 |
| Innenwinkel 135° (keine App-Klasse) | 0,8 · 11,5 · 2,4 | 1,0 · 2,8 · 2,5 | 0,9 · 1,5 · 1,9 |
| Innenwinkel 120° (keine App-Klasse) | 1,2 · 9,6 · 2,6 | 1,2 · 3,0 · 2,4 | 1,2 · 1,3 · 2,7 |
| Innenwinkel 105° (normal) | 1,1 · 14,1 · 2,7 | 1,2 · 4,7 · 2,7 | 1,2 · 2,0 · 2,0 |
| Innenwinkel 90° (normal) | 1,2 · 10,2 · 2,2 | 1,4 · 5,6 · 3,0 | 1,0 · 2,1 · 1,8 |
| Innenwinkel 75° (normal) | 1,1 · 11,2 · 2,0 | 1,3 · 6,7 · 2,1 | 1,2 · 3,7 · 2,5 |
| Innenwinkel 60° (spitz) | 1,2 · 16,4 · 2,5 | 1,0 · 8,8 · 2,2 | 1,1 · 3,5 · 2,2 |
| Innenwinkel 45° (spitz) | 1,1 · 21,2 · 2,4 | 0,8 · 6,1 · 1,7 | 1,1 · 3,5 · 2,5 |
| Innenwinkel 30° (spitz) | 1,0 · 16,2 · 2,6 | 1,1 · 10,1 · 2,5 | 1,1 · 4,8 · 2,4 |

**Längste Rechenzeit der Engine für eine einzelne GPS-Messung (ms, auf diesem Rechner)**

| | 10 m | 20 m | 40 m |
|---|---|---|---|
| Innenwinkel 150° (keine App-Klasse) | 86 | 373 | 435 |
| Innenwinkel 135° (keine App-Klasse) | 93 | 178 | 385 |
| Innenwinkel 120° (keine App-Klasse) | 92 | 202 | 243 |
| Innenwinkel 105° (normal) | 96 | 352 | 202 |
| Innenwinkel 90° (normal) | 62 | 115 | 230 |
| Innenwinkel 75° (normal) | 45 | 69 | 153 |
| Innenwinkel 60° (spitz) | 43 | 86 | 171 |
| Innenwinkel 45° (spitz) | 36 | 85 | 147 |
| Innenwinkel 30° (spitz) | 24 | 74 | 155 |

## Kontrolle: fehlerfreies GPS

Läufe je Zelle: 2.

**Winkel gefunden UND richtig klassiert**

| | 10 m | 20 m | 40 m |
|---|---|---|---|
| Innenwinkel 150° (keine App-Klasse) | 0 % | 0 % | 0 % |
| Innenwinkel 135° (keine App-Klasse) | 0 % | 0 % | 0 % |
| Innenwinkel 120° (keine App-Klasse) | 0 % | 0 % | 0 % |
| Innenwinkel 105° (normal) | 100 % | 100 % | 100 % |
| Innenwinkel 90° (normal) | 100 % | 100 % | 100 % |
| Innenwinkel 75° (normal) | 100 % | 100 % | 100 % |
| Innenwinkel 60° (spitz) | 100 % | 100 % | 100 % |
| Innenwinkel 45° (spitz) | 100 % | 100 % | 100 % |
| Innenwinkel 30° (spitz) | 100 % | 100 % | 100 % |

**Winkel gefunden (egal welche Klasse) · falsche Zusatzwinkel je 100 m**

| | 10 m | 20 m | 40 m |
|---|---|---|---|
| Innenwinkel 150° (keine App-Klasse) | 0 % · 0,0 | 0 % · 0,0 | 0 % · 0,0 |
| Innenwinkel 135° (keine App-Klasse) | 0 % · 0,0 | 0 % · 0,0 | 0 % · 0,0 |
| Innenwinkel 120° (keine App-Klasse) | 0 % · 0,0 | 0 % · 0,0 | 0 % · 0,0 |
| Innenwinkel 105° (normal) | 100 % · 0,0 | 100 % · 0,0 | 100 % · 0,0 |
| Innenwinkel 90° (normal) | 100 % · 0,0 | 100 % · 0,0 | 100 % · 0,0 |
| Innenwinkel 75° (normal) | 100 % · 0,0 | 100 % · 0,0 | 100 % · 0,0 |
| Innenwinkel 60° (spitz) | 100 % · 0,0 | 100 % · 0,0 | 100 % · 0,0 |
| Innenwinkel 45° (spitz) | 100 % · 0,0 | 100 % · 0,0 | 100 % · 0,0 |
| Innenwinkel 30° (spitz) | 100 % · 0,0 | 100 % · 0,0 | 100 % · 0,0 |

**Lage des erkannten Winkels: Abstand zum wahren Winkelpunkt (m) · Richtung richtig**

| | 10 m | 20 m | 40 m |
|---|---|---|---|
| Innenwinkel 150° (keine App-Klasse) | – · – | – · – | – · – |
| Innenwinkel 135° (keine App-Klasse) | – · – | – · – | – · – |
| Innenwinkel 120° (keine App-Klasse) | – · – | – · – | – · – |
| Innenwinkel 105° (normal) | 0,3 · 100 % | 0,4 · 100 % | 0,3 · 100 % |
| Innenwinkel 90° (normal) | 0,5 · 100 % | 0,6 · 100 % | 0,5 · 100 % |
| Innenwinkel 75° (normal) | 0,7 · 100 % | 0,6 · 100 % | 0,6 · 100 % |
| Innenwinkel 60° (spitz) | 0,9 · 100 % | 0,9 · 100 % | 0,8 · 100 % |
| Innenwinkel 45° (spitz) | 1,2 · 100 % | 1,2 · 100 % | 1,2 · 100 % |
| Innenwinkel 30° (spitz) | 2,1 · 100 % | 1,9 · 100 % | 2,1 · 100 % |

**Linie: Formfehler (m) · Längenfehler (Betrag, %) · Startpunktfehler (m)**

| | 10 m | 20 m | 40 m |
|---|---|---|---|
| Innenwinkel 150° (keine App-Klasse) | 0,0 · 8,5 · 0,0 | 0,0 · 4,6 · 0,0 | 0,0 · 2,0 · 0,0 |
| Innenwinkel 135° (keine App-Klasse) | 0,1 · 7,6 · 0,0 | 0,1 · 4,7 · 0,0 | 0,0 · 1,4 · 0,0 |
| Innenwinkel 120° (keine App-Klasse) | 0,1 · 7,3 · 0,0 | 0,1 · 4,1 · 0,0 | 0,0 · 2,2 · 0,0 |
| Innenwinkel 105° (normal) | 0,0 · 7,1 · 0,0 | 0,1 · 4,3 · 0,0 | 0,0 · 3,3 · 0,0 |
| Innenwinkel 90° (normal) | 0,1 · 11,0 · 0,0 | 0,1 · 5,1 · 0,0 | 0,0 · 3,0 · 0,0 |
| Innenwinkel 75° (normal) | 0,1 · 16,1 · 0,0 | 0,1 · 5,8 · 0,0 | 0,0 · 2,6 · 0,0 |
| Innenwinkel 60° (spitz) | 0,1 · 15,5 · 0,0 | 0,1 · 5,8 · 0,0 | 0,0 · 4,6 · 0,0 |
| Innenwinkel 45° (spitz) | 0,1 · 16,6 · 0,0 | 0,0 · 11,1 · 0,0 | 0,0 · 4,0 · 0,0 |
| Innenwinkel 30° (spitz) | 0,1 · 14,0 · 0,0 | 0,1 · 10,8 · 0,0 | 0,0 · 3,8 · 0,0 |

**Längste Rechenzeit der Engine für eine einzelne GPS-Messung (ms, auf diesem Rechner)**

| | 10 m | 20 m | 40 m |
|---|---|---|---|
| Innenwinkel 150° (keine App-Klasse) | 86 | 179 | 302 |
| Innenwinkel 135° (keine App-Klasse) | 60 | 229 | 358 |
| Innenwinkel 120° (keine App-Klasse) | 85 | 142 | 423 |
| Innenwinkel 105° (normal) | 60 | 138 | 234 |
| Innenwinkel 90° (normal) | 39 | 120 | 222 |
| Innenwinkel 75° (normal) | 49 | 99 | 141 |
| Innenwinkel 60° (spitz) | 39 | 97 | 259 |
| Innenwinkel 45° (spitz) | 42 | 82 | 225 |
| Innenwinkel 30° (spitz) | 37 | 75 | 118 |

## Gerät × Umgebung — rechter Winkel (90°), 40-m-Schenkel

Läufe je Zelle: 12.

**Winkel gefunden UND richtig klassiert**

| | Offenes Feld | Feldrand/Baumreihe | Lichter Wald | Dichtes Laubdach |
|---|---|---|---|---|
| Neueres Handy (Zweifrequenz-GPS) | 75 % | 17 % | 50 % | 17 % |
| Mittelklasse (Einfrequenz-GPS) | 67 % | 33 % | 17 % | 8 % |
| Schwaches/älteres Handy | 33 % | 42 % | 8 % | 0 % |

**Winkel gefunden (egal welche Klasse) · falsche Zusatzwinkel je 100 m**

| | Offenes Feld | Feldrand/Baumreihe | Lichter Wald | Dichtes Laubdach |
|---|---|---|---|---|
| Neueres Handy (Zweifrequenz-GPS) | 75 % · 0,0 | 17 % · 0,1 | 50 % · 0,2 | 33 % · 0,6 |
| Mittelklasse (Einfrequenz-GPS) | 67 % · 0,1 | 33 % · 0,8 | 17 % · 1,5 | 17 % · 1,1 |
| Schwaches/älteres Handy | 33 % · 0,0 | 58 % · 0,9 | 8 % · 0,6 | 8 % · 0,6 |

**Lage des erkannten Winkels: Abstand zum wahren Winkelpunkt (m) · Richtung richtig**

| | Offenes Feld | Feldrand/Baumreihe | Lichter Wald | Dichtes Laubdach |
|---|---|---|---|---|
| Neueres Handy (Zweifrequenz-GPS) | 1,3 · 100 % | 4,8 · 100 % | 2,7 · 100 % | 5,2 · 50 % |
| Mittelklasse (Einfrequenz-GPS) | 1,7 · 100 % | 5,1 · 100 % | 4,5 · 100 % | 9,4 · 50 % |
| Schwaches/älteres Handy | 2,0 · 100 % | 6,5 · 71 % | 0,3 · 100 % | 12,0 · 100 % |

**Linie: Formfehler (m) · Längenfehler (Betrag, %) · Startpunktfehler (m)**

| | Offenes Feld | Feldrand/Baumreihe | Lichter Wald | Dichtes Laubdach |
|---|---|---|---|---|
| Neueres Handy (Zweifrequenz-GPS) | 0,6 · 2,7 · 1,3 | 1,8 · 9,9 · 3,4 | 2,6 · 17,0 · 5,2 | 5,5 · 83,8 · 8,7 |
| Mittelklasse (Einfrequenz-GPS) | 1,0 · 2,1 · 1,8 | 2,5 · 12,9 · 3,7 | 3,5 · 28,6 · 5,3 | 7,7 · 109,1 · 10,8 |
| Schwaches/älteres Handy | 1,7 · 2,0 · 2,9 | 3,5 · 19,5 · 6,4 | 7,6 · 48,6 · 6,9 | 8,4 · 80,0 · 11,3 |

**Längste Rechenzeit der Engine für eine einzelne GPS-Messung (ms, auf diesem Rechner)**

| | Offenes Feld | Feldrand/Baumreihe | Lichter Wald | Dichtes Laubdach |
|---|---|---|---|---|
| Neueres Handy (Zweifrequenz-GPS) | 627 | 451 | 328 | 233 |
| Mittelklasse (Einfrequenz-GPS) | 255 | 288 | 224 | 127 |
| Schwaches/älteres Handy | 224 | 138 | 103 | 59 |

## Gerät × Umgebung — Spitzwinkel (45°), 40-m-Schenkel

Läufe je Zelle: 12.

**Winkel gefunden UND richtig klassiert**

| | Offenes Feld | Feldrand/Baumreihe | Lichter Wald | Dichtes Laubdach |
|---|---|---|---|---|
| Neueres Handy (Zweifrequenz-GPS) | 67 % | 8 % | 0 % | 0 % |
| Mittelklasse (Einfrequenz-GPS) | 58 % | 0 % | 8 % | 0 % |
| Schwaches/älteres Handy | 25 % | 0 % | 8 % | 0 % |

**Winkel gefunden (egal welche Klasse) · falsche Zusatzwinkel je 100 m**

| | Offenes Feld | Feldrand/Baumreihe | Lichter Wald | Dichtes Laubdach |
|---|---|---|---|---|
| Neueres Handy (Zweifrequenz-GPS) | 100 % · 0,1 | 58 % · 0,3 | 50 % · 0,6 | 17 % · 1,5 |
| Mittelklasse (Einfrequenz-GPS) | 83 % · 0,0 | 42 % · 0,3 | 17 % · 1,2 | 25 % · 0,5 |
| Schwaches/älteres Handy | 67 % · 0,1 | 50 % · 1,4 | 33 % · 0,7 | 8 % · 0,4 |

**Lage des erkannten Winkels: Abstand zum wahren Winkelpunkt (m) · Richtung richtig**

| | Offenes Feld | Feldrand/Baumreihe | Lichter Wald | Dichtes Laubdach |
|---|---|---|---|---|
| Neueres Handy (Zweifrequenz-GPS) | 1,7 · 100 % | 3,0 · 100 % | 5,5 · 67 % | 3,6 · 0 % |
| Mittelklasse (Einfrequenz-GPS) | 2,8 · 100 % | 5,7 · 100 % | 7,3 · 100 % | 6,0 · 67 % |
| Schwaches/älteres Handy | 3,3 · 100 % | 7,8 · 83 % | 8,5 · 75 % | 6,6 · 0 % |

**Linie: Formfehler (m) · Längenfehler (Betrag, %) · Startpunktfehler (m)**

| | Offenes Feld | Feldrand/Baumreihe | Lichter Wald | Dichtes Laubdach |
|---|---|---|---|---|
| Neueres Handy (Zweifrequenz-GPS) | 0,7 · 3,6 · 1,8 | 1,7 · 8,1 · 3,0 | 2,7 · 14,7 · 4,7 | 6,1 · 68,1 · 8,9 |
| Mittelklasse (Einfrequenz-GPS) | 1,1 · 3,5 · 2,5 | 2,6 · 24,0 · 5,1 | 3,5 · 19,6 · 4,7 | 7,6 · 97,3 · 10,5 |
| Schwaches/älteres Handy | 1,5 · 3,3 · 3,2 | 3,3 · 27,2 · 5,6 | 6,0 · 28,5 · 10,1 | 10,3 · 85,0 · 18,8 |

**Längste Rechenzeit der Engine für eine einzelne GPS-Messung (ms, auf diesem Rechner)**

| | Offenes Feld | Feldrand/Baumreihe | Lichter Wald | Dichtes Laubdach |
|---|---|---|---|---|
| Neueres Handy (Zweifrequenz-GPS) | 465 | 186 | 185 | 347 |
| Mittelklasse (Einfrequenz-GPS) | 441 | 121 | 88 | 52 |
| Schwaches/älteres Handy | 188 | 119 | 86 | 164 |

## Varianten — Offenes Feld, Mittelklasse-Handy, 40-m-Schenkel

Läufe je Zelle: 12.

**Winkel gefunden UND richtig klassiert**

| | rechter Winkel | Spitzwinkel 45° |
|---|---|---|
| Basis (in der Hand, iPhone, 1,0 m/s) | 67 % | 58 % |
| Hosentasche | 58 % | 33 % |
| Android, im Hintergrund gebündelt (30 s) | 83 % | 33 % |
| Langsam gelegt (0,7 m/s) | 42 % | 25 % |
| Zügig gelegt (1,3 m/s) | 83 % | 42 % |
| Ohne Bewegungssensor (nur GPS) | 42 % | 17 % |
| Veraltete erste Position | 75 % | 25 % |
| 20 s Stehen am Abgang | 75 % | 25 % |

**Winkel gefunden (egal welche Klasse) · falsche Zusatzwinkel je 100 m**

| | rechter Winkel | Spitzwinkel 45° |
|---|---|---|
| Basis (in der Hand, iPhone, 1,0 m/s) | 67 % · 0,1 | 83 % · 0,0 |
| Hosentasche | 67 % · 0,0 | 92 % · 0,0 |
| Android, im Hintergrund gebündelt (30 s) | 83 % · 0,1 | 67 % · 0,1 |
| Langsam gelegt (0,7 m/s) | 42 % · 0,1 | 42 % · 0,1 |
| Zügig gelegt (1,3 m/s) | 83 % · 0,0 | 67 % · 0,0 |
| Ohne Bewegungssensor (nur GPS) | 42 % · 0,4 | 58 % · 0,1 |
| Veraltete erste Position | 75 % · 0,0 | 50 % · 0,0 |
| 20 s Stehen am Abgang | 75 % · 0,1 | 75 % · 0,0 |

**Lage des erkannten Winkels: Abstand zum wahren Winkelpunkt (m) · Richtung richtig**

| | rechter Winkel | Spitzwinkel 45° |
|---|---|---|
| Basis (in der Hand, iPhone, 1,0 m/s) | 1,7 · 100 % | 2,8 · 100 % |
| Hosentasche | 2,6 · 100 % | 4,1 · 100 % |
| Android, im Hintergrund gebündelt (30 s) | 2,7 · 100 % | 2,4 · 100 % |
| Langsam gelegt (0,7 m/s) | 2,2 · 100 % | 2,5 · 100 % |
| Zügig gelegt (1,3 m/s) | 2,3 · 100 % | 3,6 · 100 % |
| Ohne Bewegungssensor (nur GPS) | 2,3 · 100 % | 1,8 · 100 % |
| Veraltete erste Position | 2,2 · 100 % | 2,8 · 100 % |
| 20 s Stehen am Abgang | 1,9 · 100 % | 2,8 · 100 % |

**Linie: Formfehler (m) · Längenfehler (Betrag, %) · Startpunktfehler (m)**

| | rechter Winkel | Spitzwinkel 45° |
|---|---|---|
| Basis (in der Hand, iPhone, 1,0 m/s) | 1,0 · 2,1 · 1,8 | 1,1 · 3,5 · 2,5 |
| Hosentasche | 1,6 · 3,8 · 3,7 | 1,5 · 4,3 · 2,9 |
| Android, im Hintergrund gebündelt (30 s) | 1,4 · 1,7 · 3,3 | 1,0 · 2,7 · 2,1 |
| Langsam gelegt (0,7 m/s) | 1,1 · 2,7 · 2,5 | 1,1 · 3,5 · 2,4 |
| Zügig gelegt (1,3 m/s) | 1,3 · 3,0 · 2,6 | 1,1 · 5,7 · 2,6 |
| Ohne Bewegungssensor (nur GPS) | 1,2 · 3,2 · 2,8 | 1,1 · 3,7 · 2,1 |
| Veraltete erste Position | 1,4 · 3,4 · 5,5 | 1,2 · 4,3 · 4,4 |
| 20 s Stehen am Abgang | 1,0 · 2,4 · 1,8 | 1,0 · 3,5 · 2,5 |

**Längste Rechenzeit der Engine für eine einzelne GPS-Messung (ms, auf diesem Rechner)**

| | rechter Winkel | Spitzwinkel 45° |
|---|---|---|
| Basis (in der Hand, iPhone, 1,0 m/s) | 556 | 567 |
| Hosentasche | 426 | 221 |
| Android, im Hintergrund gebündelt (30 s) | 352 | 305 |
| Langsam gelegt (0,7 m/s) | 399 | 512 |
| Zügig gelegt (1,3 m/s) | 137 | 167 |
| Ohne Bewegungssensor (nur GPS) | 595 | 175 |
| Veraltete erste Position | 210 | 246 |
| 20 s Stehen am Abgang | 242 | 185 |

## Varianten — Feldrand/Baumreihe, Mittelklasse-Handy, 40-m-Schenkel

Läufe je Zelle: 12.

**Winkel gefunden UND richtig klassiert**

| | rechter Winkel | Spitzwinkel 45° |
|---|---|---|
| Basis (in der Hand, iPhone, 1,0 m/s) | 33 % | 0 % |
| Hosentasche | 17 % | 0 % |
| Android, im Hintergrund gebündelt (30 s) | 17 % | 8 % |
| Langsam gelegt (0,7 m/s) | 25 % | 8 % |
| Zügig gelegt (1,3 m/s) | 50 % | 8 % |
| Ohne Bewegungssensor (nur GPS) | 17 % | 0 % |
| Veraltete erste Position | 42 % | 0 % |
| 20 s Stehen am Abgang | 50 % | 17 % |

**Winkel gefunden (egal welche Klasse) · falsche Zusatzwinkel je 100 m**

| | rechter Winkel | Spitzwinkel 45° |
|---|---|---|
| Basis (in der Hand, iPhone, 1,0 m/s) | 33 % · 0,8 | 42 % · 0,3 |
| Hosentasche | 17 % · 0,8 | 8 % · 1,1 |
| Android, im Hintergrund gebündelt (30 s) | 25 % · 0,3 | 42 % · 0,6 |
| Langsam gelegt (0,7 m/s) | 25 % · 0,3 | 58 % · 0,3 |
| Zügig gelegt (1,3 m/s) | 50 % · 0,0 | 50 % · 0,4 |
| Ohne Bewegungssensor (nur GPS) | 25 % · 0,3 | 33 % · 0,8 |
| Veraltete erste Position | 50 % · 0,5 | 42 % · 0,2 |
| 20 s Stehen am Abgang | 50 % · 1,1 | 42 % · 0,7 |

**Lage des erkannten Winkels: Abstand zum wahren Winkelpunkt (m) · Richtung richtig**

| | rechter Winkel | Spitzwinkel 45° |
|---|---|---|
| Basis (in der Hand, iPhone, 1,0 m/s) | 5,1 · 100 % | 5,7 · 100 % |
| Hosentasche | 4,2 · 100 % | 3,5 · 100 % |
| Android, im Hintergrund gebündelt (30 s) | 3,5 · 100 % | 7,5 · 80 % |
| Langsam gelegt (0,7 m/s) | 6,4 · 100 % | 7,1 · 71 % |
| Zügig gelegt (1,3 m/s) | 4,4 · 100 % | 4,5 · 100 % |
| Ohne Bewegungssensor (nur GPS) | 6,6 · 100 % | 5,9 · 75 % |
| Veraltete erste Position | 6,7 · 83 % | 3,5 · 100 % |
| 20 s Stehen am Abgang | 2,7 · 100 % | 3,4 · 100 % |

**Linie: Formfehler (m) · Längenfehler (Betrag, %) · Startpunktfehler (m)**

| | rechter Winkel | Spitzwinkel 45° |
|---|---|---|
| Basis (in der Hand, iPhone, 1,0 m/s) | 2,5 · 12,9 · 3,7 | 2,6 · 24,0 · 5,1 |
| Hosentasche | 3,9 · 35,7 · 6,1 | 4,0 · 38,5 · 6,5 |
| Android, im Hintergrund gebündelt (30 s) | 2,5 · 15,8 · 4,0 | 2,5 · 11,2 · 4,9 |
| Langsam gelegt (0,7 m/s) | 2,6 · 23,2 · 3,4 | 3,5 · 34,5 · 4,6 |
| Zügig gelegt (1,3 m/s) | 3,0 · 15,9 · 5,0 | 2,4 · 6,0 · 3,6 |
| Ohne Bewegungssensor (nur GPS) | 2,9 · 17,4 · 3,9 | 3,1 · 19,2 · 4,4 |
| Veraltete erste Position | 3,0 · 15,9 · 6,5 | 2,7 · 16,5 · 6,4 |
| 20 s Stehen am Abgang | 2,6 · 15,1 · 3,7 | 2,8 · 30,4 · 5,1 |

**Längste Rechenzeit der Engine für eine einzelne GPS-Messung (ms, auf diesem Rechner)**

| | rechter Winkel | Spitzwinkel 45° |
|---|---|---|
| Basis (in der Hand, iPhone, 1,0 m/s) | 82 | 79 |
| Hosentasche | 76 | 72 |
| Android, im Hintergrund gebündelt (30 s) | 69 | 106 |
| Langsam gelegt (0,7 m/s) | 169 | 174 |
| Zügig gelegt (1,3 m/s) | 56 | 64 |
| Ohne Bewegungssensor (nur GPS) | 59 | 69 |
| Veraltete erste Position | 77 | 84 |
| 20 s Stehen am Abgang | 149 | 117 |

## Prüfungsfährten (ganze Fährte)

Läufe je Zelle: 4.

**Winkel gefunden UND richtig klassiert**

| | Neueres Handy, Offenes Feld | Mittelklasse, Offenes Feld | Mittelklasse, Feldrand/Baumreihe | Mittelklasse, Lichter Wald |
|---|---|---|---|---|
| IGP-1 | 100 % | 75 % | 25 % | 0 % |
| IGP-2 | 75 % | 63 % | 25 % | 38 % |
| IGP-3 | 88 % | 56 % | 31 % | 31 % |

**Winkel gefunden (egal welche Klasse) · falsche Zusatzwinkel je 100 m**

| | Neueres Handy, Offenes Feld | Mittelklasse, Offenes Feld | Mittelklasse, Feldrand/Baumreihe | Mittelklasse, Lichter Wald |
|---|---|---|---|---|
| IGP-1 | 100 % · 0,0 | 88 % · 0,1 | 38 % · 0,4 | 0 % · 0,6 |
| IGP-2 | 75 % · 0,0 | 63 % · 0,0 | 38 % · 0,8 | 50 % · 0,8 |
| IGP-3 | 88 % · 0,0 | 63 % · 0,1 | 31 % · 0,7 | 38 % · 1,4 |

**Lage des erkannten Winkels: Abstand zum wahren Winkelpunkt (m) · Richtung richtig**

| | Neueres Handy, Offenes Feld | Mittelklasse, Offenes Feld | Mittelklasse, Feldrand/Baumreihe | Mittelklasse, Lichter Wald |
|---|---|---|---|---|
| IGP-1 | 1,6 · 100 % | 2,7 · 100 % | 4,6 · 67 % | – · – |
| IGP-2 | 1,7 · 100 % | 1,8 · 100 % | 3,2 · 100 % | 7,4 · 75 % |
| IGP-3 | 1,9 · 100 % | 1,9 · 100 % | 5,1 · 100 % | 5,3 · 83 % |

**Linie: Formfehler (m) · Längenfehler (Betrag, %) · Startpunktfehler (m)**

| | Neueres Handy, Offenes Feld | Mittelklasse, Offenes Feld | Mittelklasse, Feldrand/Baumreihe | Mittelklasse, Lichter Wald |
|---|---|---|---|---|
| IGP-1 | 0,8 · 1,2 · 1,7 | 1,3 · 1,2 · 1,9 | 3,2 · 15,4 · 3,9 | 4,6 · 43,8 · 2,7 |
| IGP-2 | 0,7 · 0,8 · 1,9 | 1,0 · 1,2 · 2,6 | 2,7 · 10,8 · 5,1 | 4,1 · 31,5 · 4,7 |
| IGP-3 | 1,0 · 0,7 · 2,0 | 1,3 · 1,1 · 2,7 | 3,5 · 15,8 · 2,8 | 3,7 · 21,2 · 6,7 |

**Längste Rechenzeit der Engine für eine einzelne GPS-Messung (ms, auf diesem Rechner)**

| | Neueres Handy, Offenes Feld | Mittelklasse, Offenes Feld | Mittelklasse, Feldrand/Baumreihe | Mittelklasse, Lichter Wald |
|---|---|---|---|---|
| IGP-1 | 1131 | 832 | 507 | 299 |
| IGP-2 | 1190 | 728 | 352 | 258 |
| IGP-3 | 1036 | 734 | 413 | 258 |
