# Fährten-Simulator — Matrixbericht

704 simulierte Läufe durch die echte Lege- und Such-Verarbeitung der App. Gruppen: suche (96 Läufe, 301 s), suchvarianten (128 Läufe, 440 s), formen (144 Läufe, 478 s), unterbrechungen (112 Läufe, 283 s), ablauf (144 Läufe, 321 s), android (80 Läufe, 386 s).

Alle Zahlen sind Simulationsergebnisse mit angenommenen Fehlermodellen (siehe README.md), keine Feldmessungen.

Statistische Unsicherheit: bei 12 Läufen je Zelle schwankt ein Prozentwert zufällig um rund ±15 Punkte, bei 6 Läufen um ±20. Einzelne Zellen nicht überbewerten, auf Muster über mehrere Zellen achten.

## Absuche — Hundetyp × Gerät/Umgebung (Übungsfährte 120 m, 10-m-Leine)

Läufe je Zelle: 8. Die App sieht den Weg des Hundeführers (Handy), nicht die Hundenase. Gegenstands-Quoten ohne den Gegenstand am Fährtenende (eigene Ende-Logik der App, nicht simuliert) und ohne manuelles Antippen. Mittelwerte enthalten auch Läufe, in denen die Zuordnung zur Fährte abriss.

**Verwiesene Gegenstände: automatisch als gefunden erkannt · von der Analyse als «wahrscheinlicher Kontakt» gewertet**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | 88 % · 100 % | 38 % · 94 % | 31 % · 56 % | 25 % · 25 % |
| Eifriger, schneller Hund | 79 % · 100 % | 62 % · 100 % | 36 % · 50 % | 27 % · 53 % |
| Unsicherer, weit pendelnder Hund | 83 % · 100 % | 60 % · 100 % | 33 % · 92 % | 36 % · 36 % |

**NICHT verwiesene Gegenstände, die die App trotzdem als gefunden zählt (Anzahl Fälle in Klammern)**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | – (0) | – (0) | – (0) | – (0) |
| Eifriger, schneller Hund | 50 % (2) | 0 % (3) | 50 % (2) | 0 % (1) |
| Unsicherer, weit pendelnder Hund | 0 % (4) | 0 % (6) | 0 % (4) | 0 % (2) |

**Mittlere Abweichung (m): von der App gemeldet · wahr beim Hund · wahr beim Hundeführer**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | 2,1 · 0,2 · 0,9 | 4,9 · 0,2 · 0,9 | 8,7 · 0,2 · 0,9 | 17,8 · 0,2 · 0,9 |
| Eifriger, schneller Hund | 2,2 · 0,8 · 0,8 | 2,2 · 0,8 · 0,7 | 12,7 · 1,2 · 0,7 | 16,1 · 0,8 · 0,7 |
| Unsicherer, weit pendelnder Hund | 1,9 · 2,3 · 1,2 | 2,4 · 3,3 · 1,9 | 5,2 · 2,9 · 1,8 | 15,5 · 2,4 · 1,3 |

**Punktzahl im Recorder · Punktzahl der Analyse · Abweichungs-Ereignisse je Lauf · Abrisse je Lauf**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | 87 · 52 · 0,9 · 0,5 | 67 · 45 · 1,9 · 0,4 | 45 · 44 · 2,3 · 0,8 | 27 · 44 · 2,1 · 0,6 |
| Eifriger, schneller Hund | 87 · 61 · 1,0 · 0,4 | 82 · 56 · 1,0 · 0,4 | 50 · 54 · 1,4 · 0,6 | 38 · 55 · 1,6 · 1,1 |
| Unsicherer, weit pendelnder Hund | 86 · 56 · 0,9 · 0,3 | 80 · 50 · 1,9 · 0,4 | 58 · 39 · 2,8 · 1,1 | 35 · 40 · 2,5 · 1,1 |

**Abgang erkannt · Fährtenende erreicht (≥ 90 % Fortschritt) · Lagefehler der Gegenstände beim Legen (m)**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | 100 % · 100 % · 1,4 | 100 % · 88 % · 2,1 | 100 % · 38 % · 4,9 | 88 % · 25 % · 5,9 |
| Eifriger, schneller Hund | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 | 75 % · 50 % · 4,9 | 88 % · 50 % · 5,9 |
| Unsicherer, weit pendelnder Hund | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 | 100 % · 88 % · 4,9 | 88 % · 50 % · 5,9 |

**Führung (T-205):** gemessen am WAHREN Hund. «Rechtzeitig» = der Hund ist bei Sprechbeginn 3–15 m vor dem Punkt, «knapp» = 0–3 m, «zu spät» = schon vorbei, «zu früh» = mehr als 15 m. Die Pfote ist die Hundeposition der App.

**Ansage je Winkel/Gegenstand: rechtzeitig · knapp · zu spät · fehlt · zu früh**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | 88 % · 5 % · 0 % · 0 % · 8 % | 74 % · 10 % · 0 % · 13 % · 3 % | 33 % · 27 % · 13 % · 23 % · 3 % | 15 % · 15 % · 15 % · 52 % · 4 % |
| Eifriger, schneller Hund | 83 % · 8 % · 3 % · 0 % · 8 % | 90 % · 8 % · 0 % · 3 % · 0 % | 37 % · 23 % · 10 % · 30 % · 0 % | 11 % · 15 % · 30 % · 44 % · 0 % |
| Unsicherer, weit pendelnder Hund | 85 % · 0 % · 0 % · 0 % · 15 % | 87 % · 3 % · 0 % · 8 % · 3 % | 53 % · 23 % · 7 % · 10 % · 7 % | 22 % · 15 % · 19 % · 41 % · 4 % |

**Je Lauf: Ansagen abgebrochen · Ansagen verfallen · Punkte doppelt angesagt · Ansage eines Winkels, den es nicht gibt**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | 0,4 · 0,0 · 0,0 · 0,0 | 0,0 · 0,0 · 0,0 · 0,0 | 0,0 · 0,0 · 0,0 · 0,1 | 0,0 · 0,0 · 0,0 · 0,8 |
| Eifriger, schneller Hund | 0,6 · 0,0 · 0,0 · 0,0 | 0,6 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,4 | 0,4 · 0,0 · 0,0 · 1,1 |
| Unsicherer, weit pendelnder Hund | 0,0 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 | 0,0 · 0,0 · 0,0 · 0,4 | 0,0 · 0,0 · 0,0 · 1,0 |

**Pfote: mittlerer Fehler (m) · grösster Fehler (m) · Sprünge je Lauf · Zeitanteil auf falschem Schenkel · grösster Versatz (m)**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | 3,1 · 24 · 1,3 · 5 % · 24 | 6,9 · 75 · 2,6 · 14 % · 84 | 16,9 · 80 · 1,8 · 53 % · 89 | 19,1 · 92 · 2,3 · 55 % · 96 |
| Eifriger, schneller Hund | 3,6 · 24 · 1,6 · 6 % · 25 | 4,0 · 18 · 2,0 · 4 % · 18 | 7,3 · 46 · 1,6 · 27 % · 52 | 18,4 · 111 · 2,5 · 56 % · 118 |
| Unsicherer, weit pendelnder Hund | 3,8 · 15 · 1,3 · 1 % · 15 | 4,9 · 15 · 1,5 · 1 % · 11 | 8,7 · 46 · 2,5 · 35 % · 52 | 14,8 · 92 · 2,3 · 43 % · 96 |

**Hund liegt am Gegenstand: Pfote steht > 3 m davor (Zeitanteil) · Ansagen eines Punkts dahinter je Lauf**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | 0 % · 0,8 | 2 % · 0,1 | 13 % · 0,3 | 14 % · 0,0 |
| Eifriger, schneller Hund | 0 % · 0,5 | 0 % · 0,3 | 8 % · 0,0 | 8 % · 0,0 |
| Unsicherer, weit pendelnder Hund | 0 % · 0,4 | 0 % · 0,1 | 17 % · 0,1 | 35 % · 0,1 |

**Fährtenende: angesagt · dem Hund fehlten noch (m) · zu früh (> 5 m) · doppelt · Gegenstand am Ende als gefunden geführt**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | 38 % · 0,1 · 0 % · 0 % · 100 % | 13 % · 0,1 · 0 % · 0 % · 50 % | 0 % · – · 0 % · 0 % · 50 % | 0 % · – · 0 % · 0 % · 0 % |
| Eifriger, schneller Hund | 50 % · 0,1 · 0 % · 0 % · 75 % | 63 % · 0,1 · 0 % · 0 % · 63 % | 25 % · 0,1 · 0 % · 0 % · 13 % | 13 % · 0,0 · 0 % · 0 % · 25 % |
| Unsicherer, weit pendelnder Hund | 13 % · 0,1 · 0 % · 0 % · 88 % | 25 % · 0,0 · 0 % · 0 % · 63 % | 0 % · – · 0 % · 0 % · 0 % | 0 % · – · 0 % · 0 % · 0 % |

## Absuche — Varianten (ruhiger Sporthund, offenes Feld)

Läufe je Zelle: 8. Die App sieht den Weg des Hundeführers (Handy), nicht die Hundenase. Gegenstands-Quoten ohne den Gegenstand am Fährtenende (eigene Ende-Logik der App, nicht simuliert) und ohne manuelles Antippen. Mittelwerte enthalten auch Läufe, in denen die Zuordnung zur Fährte abriss.

**Verwiesene Gegenstände: automatisch als gefunden erkannt · von der Analyse als «wahrscheinlicher Kontakt» gewertet**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (10-m-Leine, App auf 10 m) | 88 % · 100 % | 38 % · 94 % |
| 5-m-Leine, App auf 5 m | 88 % · 100 % | 56 % · 100 % |
| 10-m-Leine, App fälschlich auf 5 m | 88 % · 100 % | 38 % · 94 % |
| Kurzer Halt am Gegenstand (3 s) | 94 % · 100 % | 69 % · 94 % |
| Gegenstand beim Legen mit 3 s Halt abgelegt | 94 % · 100 % | 81 % · 94 % |
| Handy bei der Absuche in der Hosentasche | 81 % · 100 % | 56 % · 100 % |
| Absuche ohne Bewegungssensor | 81 % · 19 % | 81 % · 38 % |
| Android, Absuche im Hintergrund gebündelt (30 s) | 88 % · 56 % | 69 % · 50 % |

**NICHT verwiesene Gegenstände, die die App trotzdem als gefunden zählt (Anzahl Fälle in Klammern)**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (10-m-Leine, App auf 10 m) | – (0) | – (0) |
| 5-m-Leine, App auf 5 m | – (0) | – (0) |
| 10-m-Leine, App fälschlich auf 5 m | – (0) | – (0) |
| Kurzer Halt am Gegenstand (3 s) | – (0) | – (0) |
| Gegenstand beim Legen mit 3 s Halt abgelegt | – (0) | – (0) |
| Handy bei der Absuche in der Hosentasche | – (0) | – (0) |
| Absuche ohne Bewegungssensor | – (0) | – (0) |
| Android, Absuche im Hintergrund gebündelt (30 s) | – (0) | – (0) |

**Mittlere Abweichung (m): von der App gemeldet · wahr beim Hund · wahr beim Hundeführer**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (10-m-Leine, App auf 10 m) | 2,1 · 0,2 · 0,9 | 4,9 · 0,2 · 0,9 |
| 5-m-Leine, App auf 5 m | 1,1 · 0,2 · 0,3 | 1,8 · 0,2 · 0,3 |
| 10-m-Leine, App fälschlich auf 5 m | 2,1 · 0,2 · 0,9 | 4,9 · 0,2 · 0,9 |
| Kurzer Halt am Gegenstand (3 s) | 2,3 · 0,3 · 0,9 | 2,8 · 0,2 · 0,9 |
| Gegenstand beim Legen mit 3 s Halt abgelegt | 1,9 · 0,2 · 0,9 | 3,4 · 0,3 · 0,9 |
| Handy bei der Absuche in der Hosentasche | 2,1 · 0,3 · 0,8 | 3,3 · 0,2 · 0,9 |
| Absuche ohne Bewegungssensor | 2,2 · 0,2 · 0,9 | 7,4 · 0,2 · 0,9 |
| Android, Absuche im Hintergrund gebündelt (30 s) | 2,5 · 0,3 · 0,9 | 9,9 · 0,2 · 0,9 |

**Punktzahl im Recorder · Punktzahl der Analyse · Abweichungs-Ereignisse je Lauf · Abrisse je Lauf**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (10-m-Leine, App auf 10 m) | 87 · 52 · 0,9 · 0,5 | 67 · 45 · 1,9 · 0,4 |
| 5-m-Leine, App auf 5 m | 89 · 70 · 0,1 · 0,0 | 81 · 59 · 1,1 · 0,0 |
| 10-m-Leine, App fälschlich auf 5 m | 87 · 52 · 0,9 · 0,5 | 67 · 45 · 1,9 · 0,4 |
| Kurzer Halt am Gegenstand (3 s) | 83 · 52 · 1,3 · 0,5 | 78 · 48 · 1,8 · 0,4 |
| Gegenstand beim Legen mit 3 s Halt abgelegt | 89 · 54 · 0,9 · 0,3 | 78 · 46 · 1,8 · 0,6 |
| Handy bei der Absuche in der Hosentasche | 87 · 51 · 1,4 · 0,5 | 77 · 44 · 2,0 · 0,5 |
| Absuche ohne Bewegungssensor | 85 · 48 · 1,6 · 0,3 | 72 · 48 · 1,5 · 0,6 |
| Android, Absuche im Hintergrund gebündelt (30 s) | 85 · 48 · 1,5 · 0,6 | 64 · 50 · 0,9 · 0,3 |

**Abgang erkannt · Fährtenende erreicht (≥ 90 % Fortschritt) · Lagefehler der Gegenstände beim Legen (m)**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (10-m-Leine, App auf 10 m) | 100 % · 100 % · 1,4 | 100 % · 88 % · 2,1 |
| 5-m-Leine, App auf 5 m | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 |
| 10-m-Leine, App fälschlich auf 5 m | 100 % · 100 % · 1,4 | 100 % · 88 % · 2,1 |
| Kurzer Halt am Gegenstand (3 s) | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 |
| Gegenstand beim Legen mit 3 s Halt abgelegt | 100 % · 100 % · 1,5 | 100 % · 88 % · 2,0 |
| Handy bei der Absuche in der Hosentasche | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 |
| Absuche ohne Bewegungssensor | 100 % · 100 % · 1,4 | 88 % · 88 % · 2,1 |
| Android, Absuche im Hintergrund gebündelt (30 s) | 100 % · 100 % · 2,0 | 75 % · 75 % · 2,3 |

**Führung (T-205):** gemessen am WAHREN Hund. «Rechtzeitig» = der Hund ist bei Sprechbeginn 3–15 m vor dem Punkt, «knapp» = 0–3 m, «zu spät» = schon vorbei, «zu früh» = mehr als 15 m. Die Pfote ist die Hundeposition der App.

**Ansage je Winkel/Gegenstand: rechtzeitig · knapp · zu spät · fehlt · zu früh**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (10-m-Leine, App auf 10 m) | 88 % · 5 % · 0 % · 0 % · 8 % | 74 % · 10 % · 0 % · 13 % · 3 % |
| 5-m-Leine, App auf 5 m | 100 % · 0 % · 0 % · 0 % · 0 % | 97 % · 3 % · 0 % · 0 % · 0 % |
| 10-m-Leine, App fälschlich auf 5 m | 68 % · 33 % · 0 % · 0 % · 0 % | 56 % · 28 % · 8 % · 8 % · 0 % |
| Kurzer Halt am Gegenstand (3 s) | 93 % · 0 % · 0 % · 0 % · 8 % | 82 % · 5 % · 0 % · 5 % · 8 % |
| Gegenstand beim Legen mit 3 s Halt abgelegt | 93 % · 0 % · 0 % · 0 % · 8 % | 78 % · 5 % · 5 % · 8 % · 5 % |
| Handy bei der Absuche in der Hosentasche | 83 % · 0 % · 0 % · 3 % · 15 % | 92 % · 3 % · 3 % · 0 % · 3 % |
| Absuche ohne Bewegungssensor | 88 % · 0 % · 3 % · 0 % · 10 % | 74 % · 0 % · 0 % · 15 % · 10 % |
| Android, Absuche im Hintergrund gebündelt (30 s) | 20 % · 40 % · 20 % · 3 % · 18 % | 23 % · 23 % · 23 % · 26 % · 5 % |

**Je Lauf: Ansagen abgebrochen · Ansagen verfallen · Punkte doppelt angesagt · Ansage eines Winkels, den es nicht gibt**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (10-m-Leine, App auf 10 m) | 0,4 · 0,0 · 0,0 · 0,0 | 0,0 · 0,0 · 0,0 · 0,0 |
| 5-m-Leine, App auf 5 m | 0,4 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |
| 10-m-Leine, App fälschlich auf 5 m | 0,4 · 0,0 · 0,0 · 0,0 | 0,0 · 0,0 · 0,0 · 0,0 |
| Kurzer Halt am Gegenstand (3 s) | 0,0 · 0,0 · 0,0 · 0,0 | 0,0 · 0,0 · 0,0 · 0,0 |
| Gegenstand beim Legen mit 3 s Halt abgelegt | 0,6 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |
| Handy bei der Absuche in der Hosentasche | 0,5 · 0,0 · 0,0 · 0,0 | 0,1 · 0,0 · 0,0 · 0,0 |
| Absuche ohne Bewegungssensor | 0,4 · 0,0 · 0,0 · 0,0 | 0,0 · 0,0 · 0,0 · 0,0 |
| Android, Absuche im Hintergrund gebündelt (30 s) | 1,5 · 0,0 · 0,0 · 0,0 | 1,1 · 0,0 · 0,0 · 0,0 |

**Pfote: mittlerer Fehler (m) · grösster Fehler (m) · Sprünge je Lauf · Zeitanteil auf falschem Schenkel · grösster Versatz (m)**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (10-m-Leine, App auf 10 m) | 3,1 · 24 · 1,3 · 5 % · 24 | 6,9 · 75 · 2,6 · 14 % · 84 |
| 5-m-Leine, App auf 5 m | 1,6 · 11 · 0,1 · 0 % · 11 | 2,5 · 13 · 0,5 · 1 % · 13 |
| 10-m-Leine, App fälschlich auf 5 m | 5,7 · 29 · 1,1 · 5 % · 24 | 9,2 · 80 · 1,9 · 14 % · 84 |
| Kurzer Halt am Gegenstand (3 s) | 3,2 · 23 · 1,6 · 7 % · 23 | 4,4 · 21 · 1,9 · 9 % · 21 |
| Gegenstand beim Legen mit 3 s Halt abgelegt | 2,5 · 20 · 1,5 · 4 % · 20 | 4,6 · 47 · 1,5 · 9 % · 46 |
| Handy bei der Absuche in der Hosentasche | 3,3 · 20 · 1,9 · 7 % · 21 | 4,5 · 28 · 2,4 · 10 % · 27 |
| Absuche ohne Bewegungssensor | 3,3 · 25 · 1,9 · 7 % · 26 | 3,3 · 20 · 1,5 · 6 % · 20 |
| Android, Absuche im Hintergrund gebündelt (30 s) | 4,5 · 25 · 3,1 · 8 % · 26 | 3,2 · 26 · 2,6 · 5 % · 30 |

**Hund liegt am Gegenstand: Pfote steht > 3 m davor (Zeitanteil) · Ansagen eines Punkts dahinter je Lauf**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (10-m-Leine, App auf 10 m) | 0 % · 0,8 | 2 % · 0,1 |
| 5-m-Leine, App auf 5 m | 0 % · 0,3 | 6 % · 0,0 |
| 10-m-Leine, App fälschlich auf 5 m | 0 % · 0,9 | 2 % · 0,4 |
| Kurzer Halt am Gegenstand (3 s) | 0 % · 0,6 | 2 % · 0,3 |
| Gegenstand beim Legen mit 3 s Halt abgelegt | 0 % · 0,6 | 2 % · 0,1 |
| Handy bei der Absuche in der Hosentasche | 0 % · 0,4 | 2 % · 0,4 |
| Absuche ohne Bewegungssensor | 1 % · 0,5 | 4 % · 0,3 |
| Android, Absuche im Hintergrund gebündelt (30 s) | 0 % · 0,3 | 10 % · 0,1 |

**Fährtenende: angesagt · dem Hund fehlten noch (m) · zu früh (> 5 m) · doppelt · Gegenstand am Ende als gefunden geführt**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (10-m-Leine, App auf 10 m) | 38 % · 0,1 · 0 % · 0 % · 100 % | 13 % · 0,1 · 0 % · 0 % · 50 % |
| 5-m-Leine, App auf 5 m | 38 % · 0,1 · 0 % · 0 % · 88 % | 25 % · 0,0 · 0 % · 0 % · 50 % |
| 10-m-Leine, App fälschlich auf 5 m | 38 % · 0,1 · 0 % · 0 % · 100 % | 13 % · 0,1 · 0 % · 0 % · 50 % |
| Kurzer Halt am Gegenstand (3 s) | 0 % · – · 0 % · 0 % · 0 % | 0 % · – · 0 % · 0 % · 0 % |
| Gegenstand beim Legen mit 3 s Halt abgelegt | 75 % · 0,1 · 0 % · 0 % · 88 % | 25 % · 0,0 · 0 % · 0 % · 75 % |
| Handy bei der Absuche in der Hosentasche | 63 % · 0,0 · 0 % · 0 % · 75 % | 38 % · 0,1 · 0 % · 0 % · 63 % |
| Absuche ohne Bewegungssensor | 38 % · 0,1 · 0 % · 0 % · 63 % | 13 % · 0,1 · 0 % · 0 % · 25 % |
| Android, Absuche im Hintergrund gebündelt (30 s) | 0 % · – · 0 % · 0 % · 63 % | 0 % · – · 0 % · 0 % · 50 % |

## Absuche — schwierige Fährtenformen × Hundetyp (Mittelklasse-Handy, offenes Feld, 10-m-Leine)

Läufe je Zelle: 8. Die App sieht den Weg des Hundeführers (Handy), nicht die Hundenase. Gegenstands-Quoten ohne den Gegenstand am Fährtenende (eigene Ende-Logik der App, nicht simuliert) und ohne manuelles Antippen. Mittelwerte enthalten auch Läufe, in denen die Zuordnung zur Fährte abriss.

**Verwiesene Gegenstände: automatisch als gefunden erkannt · von der Analyse als «wahrscheinlicher Kontakt» gewertet**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Übungsfährte (Basis) | 38 % · 94 % | 62 % · 100 % | 60 % · 100 % |
| Kreuzung | 88 % · 94 % | 93 % · 93 % | 55 % · 91 % |
| Parallele Schenkel 4 m | 81 % · 63 % | 71 % · 79 % | 33 % · 100 % |
| Parallele Schenkel 8 m | 44 % · 50 % | 64 % · 57 % | 40 % · 70 % |
| Spitzwinkel-Folge | 63 % · 69 % | 79 % · 93 % | 62 % · 92 % |
| Gegenstand im Winkel | 63 % · 100 % | 53 % · 93 % | 50 % · 92 % |

**NICHT verwiesene Gegenstände, die die App trotzdem als gefunden zählt (Anzahl Fälle in Klammern)**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Übungsfährte (Basis) | – (0) | 0 % (3) | 0 % (6) |
| Kreuzung | – (0) | 0 % (2) | 0 % (5) |
| Parallele Schenkel 4 m | – (0) | 50 % (2) | 29 % (7) |
| Parallele Schenkel 8 m | – (0) | 0 % (2) | 0 % (6) |
| Spitzwinkel-Folge | – (0) | 0 % (2) | 0 % (3) |
| Gegenstand im Winkel | – (0) | 0 % (1) | 50 % (4) |

**Mittlere Abweichung (m): von der App gemeldet · wahr beim Hund · wahr beim Hundeführer**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Übungsfährte (Basis) | 4,9 · 0,2 · 0,9 | 2,2 · 0,8 · 0,7 | 2,4 · 3,3 · 1,9 |
| Kreuzung | 4,0 · 0,2 · 1,1 | 3,4 · 1,4 · 0,8 | 3,8 · 2,5 · 1,6 |
| Parallele Schenkel 4 m | 9,8 · 0,3 · 0,6 | 6,3 · 1,2 · 0,6 | 3,5 · 2,4 · 1,2 |
| Parallele Schenkel 8 m | 12,5 · 0,3 · 0,9 | 10,3 · 0,9 · 0,8 | 6,3 · 2,8 · 1,4 |
| Spitzwinkel-Folge | 3,2 · 0,3 · 0,8 | 2,7 · 1,3 · 1,1 | 2,6 · 2,8 · 1,5 |
| Gegenstand im Winkel | 2,1 · 0,3 · 0,3 | 2,2 · 1,4 · 1,0 | 3,1 · 2,9 · 1,6 |

**Punktzahl im Recorder · Punktzahl der Analyse · Abweichungs-Ereignisse je Lauf · Abrisse je Lauf**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Übungsfährte (Basis) | 67 · 45 · 1,9 · 0,4 | 82 · 56 · 1,0 · 0,4 | 80 · 50 · 1,9 · 0,4 |
| Kreuzung | 74 · 48 · 1,9 · 0,5 | 77 · 60 · 1,0 · 0,4 | 70 · 54 · 1,3 · 0,5 |
| Parallele Schenkel 4 m | 32 · 65 · 1,0 · 0,9 | 57 · 61 · 1,0 · 0,5 | 69 · 54 · 1,6 · 0,4 |
| Parallele Schenkel 8 m | 12 · 61 · 1,3 · 1,0 | 32 · 62 · 1,1 · 0,8 | 51 · 55 · 1,1 · 0,3 |
| Spitzwinkel-Folge | 58 · 61 · 1,0 · 0,4 | 72 · 57 · 1,0 · 0,5 | 73 · 54 · 1,1 · 0,4 |
| Gegenstand im Winkel | 84 · 57 · 0,8 · 0,3 | 84 · 60 · 1,1 · 0,3 | 83 · 53 · 1,4 · 0,5 |

**Abgang erkannt · Fährtenende erreicht (≥ 90 % Fortschritt) · Lagefehler der Gegenstände beim Legen (m)**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Übungsfährte (Basis) | 100 % · 88 % · 2,1 | 100 % · 100 % · 2,1 | 100 % · 100 % · 2,1 |
| Kreuzung | 100 % · 88 % · 2,6 | 100 % · 88 % · 2,6 | 100 % · 88 % · 2,6 |
| Parallele Schenkel 4 m | 100 % · 25 % · 2,4 | 100 % · 63 % · 2,4 | 100 % · 88 % · 2,4 |
| Parallele Schenkel 8 m | 100 % · 0 % · 2,2 | 100 % · 25 % · 2,2 | 88 % · 63 % · 2,2 |
| Spitzwinkel-Folge | 100 % · 63 % · 1,6 | 100 % · 88 % · 1,6 | 100 % · 88 % · 1,6 |
| Gegenstand im Winkel | 100 % · 100 % · 2,6 | 100 % · 100 % · 2,6 | 100 % · 100 % · 2,6 |

**Führung (T-205):** gemessen am WAHREN Hund. «Rechtzeitig» = der Hund ist bei Sprechbeginn 3–15 m vor dem Punkt, «knapp» = 0–3 m, «zu spät» = schon vorbei, «zu früh» = mehr als 15 m. Die Pfote ist die Hundeposition der App.

**Ansage je Winkel/Gegenstand: rechtzeitig · knapp · zu spät · fehlt · zu früh**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Übungsfährte (Basis) | 74 % · 10 % · 0 % · 13 % · 3 % | 90 % · 8 % · 0 % · 3 % · 0 % | 87 % · 3 % · 0 % · 8 % · 3 % |
| Kreuzung | 71 % · 10 % · 2 % · 17 % · 0 % | 75 % · 10 % · 2 % · 13 % · 0 % | 71 % · 13 % · 0 % · 15 % · 2 % |
| Parallele Schenkel 4 m | 39 % · 9 % · 0 % · 41 % · 11 % | 50 % · 9 % · 9 % · 20 % · 11 % | 66 % · 5 % · 7 % · 7 % · 16 % |
| Parallele Schenkel 8 m | 35 % · 7 % · 0 % · 54 % · 4 % | 39 % · 9 % · 2 % · 39 % · 11 % | 59 % · 7 % · 2 % · 26 % · 7 % |
| Spitzwinkel-Folge | 30 % · 26 % · 26 % · 17 % · 0 % | 46 % · 24 % · 20 % · 11 % · 0 % | 63 % · 11 % · 2 % · 15 % · 9 % |
| Gegenstand im Winkel | 79 % · 10 % · 8 % · 0 % · 3 % | 79 % · 18 % · 3 % · 0 % · 0 % | 74 % · 26 % · 0 % · 0 % · 0 % |

**Je Lauf: Ansagen abgebrochen · Ansagen verfallen · Punkte doppelt angesagt · Ansage eines Winkels, den es nicht gibt**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Übungsfährte (Basis) | 0,0 · 0,0 · 0,0 · 0,0 | 0,6 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |
| Kreuzung | 0,1 · 0,0 · 0,0 · 0,1 | 0,6 · 0,0 · 0,0 · 0,1 | 0,3 · 0,0 · 0,0 · 0,1 |
| Parallele Schenkel 4 m | 0,0 · 0,0 · 0,0 · 0,0 | 0,0 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |
| Parallele Schenkel 8 m | 0,0 · 0,0 · 0,0 · 0,0 | 0,0 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |
| Spitzwinkel-Folge | 0,0 · 0,0 · 0,0 · 0,0 | 0,5 · 0,0 · 0,0 · 0,0 | 0,4 · 0,0 · 0,0 · 0,0 |
| Gegenstand im Winkel | 0,4 · 0,0 · 0,0 · 0,0 | 0,4 · 0,0 · 0,0 · 0,0 | 0,1 · 0,0 · 0,0 · 0,0 |

**Pfote: mittlerer Fehler (m) · grösster Fehler (m) · Sprünge je Lauf · Zeitanteil auf falschem Schenkel · grösster Versatz (m)**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Übungsfährte (Basis) | 6,9 · 75 · 2,6 · 14 % · 84 | 4,0 · 18 · 2,0 · 4 % · 18 | 4,9 · 15 · 1,5 · 1 % · 11 |
| Kreuzung | 8,0 · 90 · 1,6 · 16 % · 99 | 7,8 · 87 · 1,4 · 12 % · 96 | 8,8 · 92 · 1,4 · 14 % · 101 |
| Parallele Schenkel 4 m | 19,2 · 68 · 1,0 · 47 % · 77 | 12,0 · 68 · 1,5 · 31 % · 78 | 7,9 · 67 · 2,3 · 14 % · 76 |
| Parallele Schenkel 8 m | 26,0 · 72 · 0,6 · 56 % · 82 | 20,0 · 72 · 0,8 · 42 % · 81 | 9,9 · 73 · 1,4 · 14 % · 82 |
| Spitzwinkel-Folge | 10,3 · 33 · 2,4 · 42 % · 39 | 6,9 · 27 · 2,9 · 35 % · 36 | 6,4 · 27 · 2,0 · 9 % · 36 |
| Gegenstand im Winkel | 3,3 · 25 · 0,8 · 3 % · 19 | 3,9 · 19 · 1,3 · 5 % · 11 | 4,3 · 31 · 1,1 · 4 % · 24 |

**Hund liegt am Gegenstand: Pfote steht > 3 m davor (Zeitanteil) · Ansagen eines Punkts dahinter je Lauf**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Übungsfährte (Basis) | 2 % · 0,1 | 0 % · 0,3 | 0 % · 0,1 |
| Kreuzung | 4 % · 0,0 | 2 % · 0,0 | 0 % · 0,0 |
| Parallele Schenkel 4 m | 4 % · 0,1 | 0 % · 0,0 | 0 % · 0,0 |
| Parallele Schenkel 8 m | 0 % · 0,0 | 0 % · 0,0 | 0 % · 0,0 |
| Spitzwinkel-Folge | 0 % · 0,1 | 0 % · 0,0 | 0 % · 0,0 |
| Gegenstand im Winkel | 10 % · 0,0 | 32 % · 0,0 | 24 % · 0,0 |

**Fährtenende: angesagt · dem Hund fehlten noch (m) · zu früh (> 5 m) · doppelt · Gegenstand am Ende als gefunden geführt**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Übungsfährte (Basis) | 13 % · 0,1 · 0 % · 0 % · 50 % | 63 % · 0,1 · 0 % · 0 % · 63 % | 25 % · 0,0 · 0 % · 0 % · 63 % |
| Kreuzung | 25 % · 0,1 · 0 % · 0 % · 38 % | 13 % · 0,1 · 0 % · 0 % · 50 % | 25 % · 0,1 · 0 % · 0 % · 63 % |
| Parallele Schenkel 4 m | 0 % · – · 0 % · 0 % · 63 % | 25 % · 0,1 · 0 % · 0 % · 63 % | 25 % · 0,1 · 0 % · 0 % · 63 % |
| Parallele Schenkel 8 m | 0 % · – · 0 % · 0 % · 75 % | 0 % · – · 0 % · 0 % · 75 % | 25 % · 0,1 · 0 % · 0 % · 63 % |
| Spitzwinkel-Folge | 0 % · – · 0 % · 0 % · 63 % | 25 % · 0,0 · 0 % · 0 % · 63 % | 25 % · 0,0 · 0 % · 0 % · 75 % |
| Gegenstand im Winkel | 50 % · 0,1 · 0 % · 0 % · 50 % | 38 % · 0,1 · 0 % · 0 % · 75 % | 13 % · 0,1 · 0 % · 0 % · 63 % |

## Absuche — Unterbrechungen (ruhiger Sporthund, offenes Feld, iOS)

Läufe je Zelle: 8. Die App sieht den Weg des Hundeführers (Handy), nicht die Hundenase. Gegenstands-Quoten ohne den Gegenstand am Fährtenende (eigene Ende-Logik der App, nicht simuliert) und ohne manuelles Antippen. Mittelwerte enthalten auch Läufe, in denen die Zuordnung zur Fährte abriss.

**Verwiesene Gegenstände: automatisch als gefunden erkannt · von der Analyse als «wahrscheinlicher Kontakt» gewertet**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (keine Unterbrechung) | 88 % · 100 % | 38 % · 94 % |
| Bildschirm 20 s gesperrt | 88 % · 100 % | 38 % · 94 % |
| Bildschirm 60 s gesperrt | 88 % · 94 % | 44 % · 94 % |
| Anruf 45 s | 88 % · 100 % | 38 % · 94 % |
| Pause 20 s, Hund läuft weiter | 88 % · 100 % | 38 % · 100 % |
| App beendet, nach 30 s fortgesetzt | 88 % · 50 % | 38 % · 50 % |
| App beendet, nach 5 s fortgesetzt | 88 % · 38 % | 38 % · 44 % |

**NICHT verwiesene Gegenstände, die die App trotzdem als gefunden zählt (Anzahl Fälle in Klammern)**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (keine Unterbrechung) | – (0) | – (0) |
| Bildschirm 20 s gesperrt | – (0) | – (0) |
| Bildschirm 60 s gesperrt | – (0) | – (0) |
| Anruf 45 s | – (0) | – (0) |
| Pause 20 s, Hund läuft weiter | – (0) | – (0) |
| App beendet, nach 30 s fortgesetzt | – (0) | – (0) |
| App beendet, nach 5 s fortgesetzt | – (0) | – (0) |

**Mittlere Abweichung (m): von der App gemeldet · wahr beim Hund · wahr beim Hundeführer**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (keine Unterbrechung) | 2,1 · 0,2 · 0,9 | 4,9 · 0,2 · 0,9 |
| Bildschirm 20 s gesperrt | 2,1 · 0,2 · 0,9 | 4,9 · 0,2 · 0,9 |
| Bildschirm 60 s gesperrt | 2,1 · 0,2 · 0,9 | 4,8 · 0,2 · 0,9 |
| Anruf 45 s | 2,1 · 0,2 · 0,9 | 4,8 · 0,2 · 0,9 |
| Pause 20 s, Hund läuft weiter | 1,9 · 0,2 · 0,9 | 2,9 · 0,2 · 0,9 |
| App beendet, nach 30 s fortgesetzt | 1,9 · 0,2 · 0,9 | 2,8 · 0,2 · 0,9 |
| App beendet, nach 5 s fortgesetzt | 2,1 · 0,2 · 0,9 | 3,3 · 0,2 · 0,9 |

**Punktzahl im Recorder · Punktzahl der Analyse · Abweichungs-Ereignisse je Lauf · Abrisse je Lauf**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (keine Unterbrechung) | 87 · 52 · 0,9 · 0,5 | 67 · 45 · 1,9 · 0,4 |
| Bildschirm 20 s gesperrt | 87 · 52 · 0,9 · 0,5 | 67 · 45 · 1,9 · 0,4 |
| Bildschirm 60 s gesperrt | 88 · 53 · 0,9 · 0,5 | 68 · 44 · 1,9 · 0,4 |
| Anruf 45 s | 88 · 52 · 0,9 · 0,5 | 67 · 44 · 1,9 · 0,4 |
| Pause 20 s, Hund läuft weiter | 87 · 60 · 0,5 · 0,3 | 75 · 49 · 1,6 · 0,1 |
| App beendet, nach 30 s fortgesetzt | 87 · 61 · 0,4 · 0,3 | 73 · 55 · 0,6 · 0,1 |
| App beendet, nach 5 s fortgesetzt | 89 · 61 · 0,4 · 0,5 | 76 · 60 · 0,4 · 0,4 |

**Abgang erkannt · Fährtenende erreicht (≥ 90 % Fortschritt) · Lagefehler der Gegenstände beim Legen (m)**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (keine Unterbrechung) | 100 % · 100 % · 1,4 | 100 % · 88 % · 2,1 |
| Bildschirm 20 s gesperrt | 100 % · 100 % · 1,4 | 100 % · 88 % · 2,1 |
| Bildschirm 60 s gesperrt | 100 % · 100 % · 1,4 | 100 % · 88 % · 2,1 |
| Anruf 45 s | 100 % · 100 % · 1,4 | 100 % · 88 % · 2,1 |
| Pause 20 s, Hund läuft weiter | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 |
| App beendet, nach 30 s fortgesetzt | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 |
| App beendet, nach 5 s fortgesetzt | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 |

**Führung (T-205):** gemessen am WAHREN Hund. «Rechtzeitig» = der Hund ist bei Sprechbeginn 3–15 m vor dem Punkt, «knapp» = 0–3 m, «zu spät» = schon vorbei, «zu früh» = mehr als 15 m. Die Pfote ist die Hundeposition der App.

**Ansage je Winkel/Gegenstand: rechtzeitig · knapp · zu spät · fehlt · zu früh**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (keine Unterbrechung) | 88 % · 5 % · 0 % · 0 % · 8 % | 74 % · 10 % · 0 % · 13 % · 3 % |
| Bildschirm 20 s gesperrt | 88 % · 5 % · 0 % · 0 % · 8 % | 74 % · 10 % · 0 % · 13 % · 3 % |
| Bildschirm 60 s gesperrt | 88 % · 5 % · 0 % · 0 % · 8 % | 74 % · 10 % · 0 % · 13 % · 3 % |
| Anruf 45 s | 88 % · 5 % · 0 % · 0 % · 8 % | 74 % · 10 % · 0 % · 13 % · 3 % |
| Pause 20 s, Hund läuft weiter | 88 % · 5 % · 0 % · 0 % · 8 % | 77 % · 13 % · 0 % · 8 % · 3 % |
| App beendet, nach 30 s fortgesetzt | 68 % · 5 % · 15 % · 5 % · 8 % | 64 % · 15 % · 10 % · 8 % · 3 % |
| App beendet, nach 5 s fortgesetzt | 83 % · 5 % · 0 % · 5 % · 8 % | 74 % · 10 % · 0 % · 13 % · 3 % |

**Je Lauf: Ansagen abgebrochen · Ansagen verfallen · Punkte doppelt angesagt · Ansage eines Winkels, den es nicht gibt**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (keine Unterbrechung) | 0,4 · 0,0 · 0,0 · 0,0 | 0,0 · 0,0 · 0,0 · 0,0 |
| Bildschirm 20 s gesperrt | 0,4 · 0,0 · 0,0 · 0,0 | 0,0 · 0,0 · 0,0 · 0,0 |
| Bildschirm 60 s gesperrt | 0,4 · 0,0 · 0,0 · 0,0 | 0,0 · 0,0 · 0,0 · 0,0 |
| Anruf 45 s | 0,4 · 0,0 · 0,0 · 0,0 | 0,0 · 0,0 · 0,0 · 0,0 |
| Pause 20 s, Hund läuft weiter | 0,4 · 0,0 · 0,0 · 0,0 | 0,1 · 0,0 · 0,0 · 0,0 |
| App beendet, nach 30 s fortgesetzt | 0,4 · 0,0 · 0,0 · 0,0 | 0,1 · 0,0 · 0,0 · 0,0 |
| App beendet, nach 5 s fortgesetzt | 0,6 · 0,0 · 0,0 · 0,0 | 0,1 · 0,0 · 0,0 · 0,0 |

**Pfote: mittlerer Fehler (m) · grösster Fehler (m) · Sprünge je Lauf · Zeitanteil auf falschem Schenkel · grösster Versatz (m)**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (keine Unterbrechung) | 3,1 · 24 · 1,3 · 5 % · 24 | 6,9 · 75 · 2,6 · 14 % · 84 |
| Bildschirm 20 s gesperrt | 3,1 · 24 · 1,3 · 5 % · 24 | 6,9 · 75 · 2,6 · 14 % · 84 |
| Bildschirm 60 s gesperrt | 3,1 · 24 · 1,4 · 6 % · 24 | 7,0 · 75 · 2,8 · 14 % · 84 |
| Anruf 45 s | 3,1 · 24 · 1,4 · 6 % · 24 | 6,9 · 75 · 2,8 · 14 % · 84 |
| Pause 20 s, Hund läuft weiter | 3,6 · 23 · 1,8 · 10 % · 23 | 4,2 · 25 · 3,1 · 9 % · 25 |
| App beendet, nach 30 s fortgesetzt | 3,0 · 28 · 1,3 · 3 % · 23 | 3,6 · 48 · 2,9 · 4 % · 18 |
| App beendet, nach 5 s fortgesetzt | 3,2 · 24 · 1,9 · 6 % · 24 | 4,3 · 50 · 3,0 · 8 % · 34 |

**Hund liegt am Gegenstand: Pfote steht > 3 m davor (Zeitanteil) · Ansagen eines Punkts dahinter je Lauf**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (keine Unterbrechung) | 0 % · 0,8 | 2 % · 0,1 |
| Bildschirm 20 s gesperrt | 0 % · 0,8 | 2 % · 0,1 |
| Bildschirm 60 s gesperrt | 2 % · 0,8 | 3 % · 0,1 |
| Anruf 45 s | 2 % · 0,8 | 3 % · 0,1 |
| Pause 20 s, Hund läuft weiter | 0 % · 0,8 | 2 % · 0,1 |
| App beendet, nach 30 s fortgesetzt | 3 % · 0,6 | 2 % · 0,4 |
| App beendet, nach 5 s fortgesetzt | 0 % · 0,6 | 2 % · 0,1 |

**Fährtenende: angesagt · dem Hund fehlten noch (m) · zu früh (> 5 m) · doppelt · Gegenstand am Ende als gefunden geführt**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (keine Unterbrechung) | 38 % · 0,1 · 0 % · 0 % · 100 % | 13 % · 0,1 · 0 % · 0 % · 50 % |
| Bildschirm 20 s gesperrt | 38 % · 0,1 · 0 % · 0 % · 100 % | 13 % · 0,1 · 0 % · 0 % · 50 % |
| Bildschirm 60 s gesperrt | 38 % · 0,1 · 0 % · 0 % · 100 % | 13 % · 0,1 · 0 % · 0 % · 50 % |
| Anruf 45 s | 38 % · 0,1 · 0 % · 0 % · 100 % | 13 % · 0,1 · 0 % · 0 % · 50 % |
| Pause 20 s, Hund läuft weiter | 38 % · 0,1 · 0 % · 0 % · 100 % | 25 % · 0,1 · 0 % · 0 % · 50 % |
| App beendet, nach 30 s fortgesetzt | 38 % · 0,1 · 0 % · 0 % · 100 % | 25 % · 0,1 · 0 % · 0 % · 50 % |
| App beendet, nach 5 s fortgesetzt | 38 % · 0,1 · 0 % · 0 % · 100 % | 25 % · 0,1 · 0 % · 0 % · 50 % |

**Wiederaufnahme nach App-Abbruch (Summen über alle Läufe): Suchpunkte wiederhergestellt · Funde verloren · Winkel/Gegenstand erneut angesagt · «Gegenstand erkannt» erneut · Ende doppelt · Zwischenstand fehlte**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (keine Unterbrechung) | – | – |
| Bildschirm 20 s gesperrt | – | – |
| Bildschirm 60 s gesperrt | – | – |
| Anruf 45 s | – | – |
| Pause 20 s, Hund läuft weiter | – | – |
| App beendet, nach 30 s fortgesetzt | 97 % · 0 · 0 · 0 · 0 · 0 | 96 % · 0 · 0 · 0 · 0 · 0 |
| App beendet, nach 5 s fortgesetzt | 100 % · 0 · 0 · 0 · 0 · 0 | 100 % · 0 · 0 · 0 · 0 · 0 |

## Absuche — Ablauf: Antippen, Fährtenverlust, Fährtenende (Mittelklasse-Handy, offenes Feld)

Läufe je Zelle: 8. Die App sieht den Weg des Hundeführers (Handy), nicht die Hundenase. Gegenstands-Quoten ohne den Gegenstand am Fährtenende (eigene Ende-Logik der App, nicht simuliert) und ohne manuelles Antippen. Mittelwerte enthalten auch Läufe, in denen die Zuordnung zur Fährte abriss.

**Verwiesene Gegenstände: automatisch als gefunden erkannt · von der Analyse als «wahrscheinlicher Kontakt» gewertet**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Basis (nur automatische Erkennung) | 38 % · 94 % | 62 % · 100 % | 60 % · 100 % |
| Gegenstand angetippt, 2 s nach Ankunft beim Hund | 100 % · 94 % | 100 % · 100 % | 100 % · 100 % |
| Gegenstand angetippt, erst nach 7 s | 100 % · 94 % | 100 % · 100 % | 100 % · 100 % |
| Hund verliert die Fährte 1× (10 m seitlich) | 44 % · 94 % | 46 % · 100 % | 60 % · 100 % |
| Hund verliert die Fährte 2× (15 m seitlich) | 44 % · 88 % | 54 % · 100 % | 70 % · 100 % |
| Hund verliert die Fährte kurz (5 m seitlich) | 44 % · 94 % | 54 % · 100 % | 60 % · 100 % |

**NICHT verwiesene Gegenstände, die die App trotzdem als gefunden zählt (Anzahl Fälle in Klammern)**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Basis (nur automatische Erkennung) | – (0) | 0 % (3) | 0 % (6) |
| Gegenstand angetippt, 2 s nach Ankunft beim Hund | – (0) | 0 % (3) | 0 % (6) |
| Gegenstand angetippt, erst nach 7 s | – (0) | 0 % (3) | 17 % (6) |
| Hund verliert die Fährte 1× (10 m seitlich) | – (0) | 0 % (3) | 0 % (6) |
| Hund verliert die Fährte 2× (15 m seitlich) | – (0) | 0 % (3) | 0 % (6) |
| Hund verliert die Fährte kurz (5 m seitlich) | – (0) | 0 % (3) | 0 % (6) |

**Mittlere Abweichung (m): von der App gemeldet · wahr beim Hund · wahr beim Hundeführer**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Basis (nur automatische Erkennung) | 4,9 · 0,2 · 0,9 | 2,2 · 0,8 · 0,7 | 2,4 · 3,3 · 1,9 |
| Gegenstand angetippt, 2 s nach Ankunft beim Hund | 4,9 · 0,2 · 0,9 | 2,2 · 0,8 · 0,7 | 2,4 · 3,3 · 1,9 |
| Gegenstand angetippt, erst nach 7 s | 4,9 · 0,2 · 0,9 | 2,2 · 0,8 · 0,7 | 2,4 · 3,3 · 1,9 |
| Hund verliert die Fährte 1× (10 m seitlich) | 5,6 · 1,7 · 1,7 | 4,9 · 2,0 · 1,5 | 2,8 · 3,9 · 2,3 |
| Hund verliert die Fährte 2× (15 m seitlich) | 8,8 · 3,2 · 3,7 | 5,8 · 3,2 · 3,3 | 3,9 · 4,6 · 4,0 |
| Hund verliert die Fährte kurz (5 m seitlich) | 4,9 · 0,9 · 1,3 | 2,6 · 1,3 · 1,1 | 2,6 · 3,4 · 1,9 |

**Punktzahl im Recorder · Punktzahl der Analyse · Abweichungs-Ereignisse je Lauf · Abrisse je Lauf**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Basis (nur automatische Erkennung) | 67 · 45 · 1,9 · 0,4 | 82 · 56 · 1,0 · 0,4 | 80 · 50 · 1,9 · 0,4 |
| Gegenstand angetippt, 2 s nach Ankunft beim Hund | 80 · 45 · 1,9 · 0,4 | 89 · 56 · 1,0 · 0,4 | 85 · 50 · 1,9 · 0,4 |
| Gegenstand angetippt, erst nach 7 s | 80 · 45 · 1,9 · 0,4 | 89 · 56 · 1,0 · 0,4 | 86 · 50 · 1,9 · 0,4 |
| Hund verliert die Fährte 1× (10 m seitlich) | 63 · 41 · 2,4 · 0,9 | 71 · 53 · 1,4 · 0,6 | 75 · 50 · 1,9 · 0,5 |
| Hund verliert die Fährte 2× (15 m seitlich) | 56 · 44 · 2,4 · 1,5 | 69 · 53 · 1,8 · 1,0 | 72 · 46 · 2,1 · 1,4 |
| Hund verliert die Fährte kurz (5 m seitlich) | 65 · 43 · 2,3 · 0,6 | 79 · 56 · 1,0 · 0,5 | 76 · 48 · 1,8 · 0,4 |

**Abgang erkannt · Fährtenende erreicht (≥ 90 % Fortschritt) · Lagefehler der Gegenstände beim Legen (m)**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Basis (nur automatische Erkennung) | 100 % · 88 % · 2,1 | 100 % · 100 % · 2,1 | 100 % · 100 % · 2,1 |
| Gegenstand angetippt, 2 s nach Ankunft beim Hund | 100 % · 88 % · 2,1 | 100 % · 100 % · 2,1 | 100 % · 100 % · 2,1 |
| Gegenstand angetippt, erst nach 7 s | 100 % · 88 % · 2,1 | 100 % · 100 % · 2,1 | 100 % · 100 % · 2,1 |
| Hund verliert die Fährte 1× (10 m seitlich) | 100 % · 88 % · 2,1 | 100 % · 88 % · 2,1 | 100 % · 100 % · 2,1 |
| Hund verliert die Fährte 2× (15 m seitlich) | 100 % · 75 % · 2,1 | 100 % · 88 % · 2,1 | 100 % · 100 % · 2,1 |
| Hund verliert die Fährte kurz (5 m seitlich) | 100 % · 88 % · 2,1 | 100 % · 100 % · 2,1 | 100 % · 100 % · 2,1 |

**Führung (T-205):** gemessen am WAHREN Hund. «Rechtzeitig» = der Hund ist bei Sprechbeginn 3–15 m vor dem Punkt, «knapp» = 0–3 m, «zu spät» = schon vorbei, «zu früh» = mehr als 15 m. Die Pfote ist die Hundeposition der App.

**Ansage je Winkel/Gegenstand: rechtzeitig · knapp · zu spät · fehlt · zu früh**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Basis (nur automatische Erkennung) | 74 % · 10 % · 0 % · 13 % · 3 % | 90 % · 8 % · 0 % · 3 % · 0 % | 87 % · 3 % · 0 % · 8 % · 3 % |
| Gegenstand angetippt, 2 s nach Ankunft beim Hund | 79 % · 8 % · 0 % · 8 % · 5 % | 92 % · 5 % · 0 % · 3 % · 0 % | 90 % · 0 % · 0 % · 8 % · 3 % |
| Gegenstand angetippt, erst nach 7 s | 79 % · 8 % · 0 % · 10 % · 3 % | 92 % · 5 % · 0 % · 3 % · 0 % | 92 % · 0 % · 0 % · 5 % · 3 % |
| Hund verliert die Fährte 1× (10 m seitlich) | 64 % · 18 % · 0 % · 10 % · 8 % | 72 % · 13 % · 3 % · 10 % · 3 % | 72 % · 3 % · 0 % · 8 % · 18 % |
| Hund verliert die Fährte 2× (15 m seitlich) | 67 % · 8 % · 0 % · 15 % · 10 % | 72 % · 13 % · 0 % · 10 % · 5 % | 72 % · 5 % · 0 % · 8 % · 15 % |
| Hund verliert die Fährte kurz (5 m seitlich) | 72 % · 10 % · 0 % · 10 % · 8 % | 85 % · 5 % · 5 % · 5 % · 0 % | 85 % · 3 % · 0 % · 8 % · 5 % |

**Je Lauf: Ansagen abgebrochen · Ansagen verfallen · Punkte doppelt angesagt · Ansage eines Winkels, den es nicht gibt**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Basis (nur automatische Erkennung) | 0,0 · 0,0 · 0,0 · 0,0 | 0,6 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |
| Gegenstand angetippt, 2 s nach Ankunft beim Hund | 0,0 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 | 0,1 · 0,0 · 0,0 · 0,0 |
| Gegenstand angetippt, erst nach 7 s | 0,0 · 0,0 · 0,0 · 0,0 | 0,5 · 0,0 · 0,0 · 0,0 | 0,1 · 0,0 · 0,0 · 0,0 |
| Hund verliert die Fährte 1× (10 m seitlich) | 0,0 · 0,0 · 0,0 · 0,0 | 0,4 · 0,0 · 0,0 · 0,0 | 0,1 · 0,0 · 0,0 · 0,0 |
| Hund verliert die Fährte 2× (15 m seitlich) | 0,1 · 0,0 · 0,0 · 0,0 | 0,5 · 0,0 · 0,0 · 0,0 | 0,1 · 0,0 · 0,0 · 0,0 |
| Hund verliert die Fährte kurz (5 m seitlich) | 0,1 · 0,0 · 0,0 · 0,0 | 0,4 · 0,0 · 0,0 · 0,0 | 0,1 · 0,0 · 0,0 · 0,0 |

**Pfote: mittlerer Fehler (m) · grösster Fehler (m) · Sprünge je Lauf · Zeitanteil auf falschem Schenkel · grösster Versatz (m)**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Basis (nur automatische Erkennung) | 6,9 · 75 · 2,6 · 14 % · 84 | 4,0 · 18 · 2,0 · 4 % · 18 | 4,9 · 15 · 1,5 · 1 % · 11 |
| Gegenstand angetippt, 2 s nach Ankunft beim Hund | 6,5 · 75 · 1,4 · 14 % · 84 | 3,7 · 18 · 1,4 · 4 % · 18 | 4,8 · 15 · 1,0 · 1 % · 11 |
| Gegenstand angetippt, erst nach 7 s | 6,4 · 75 · 1,5 · 14 % · 84 | 3,6 · 18 · 1,4 · 4 % · 18 | 4,7 · 15 · 0,9 · 1 % · 11 |
| Hund verliert die Fährte 1× (10 m seitlich) | 7,7 · 75 · 2,6 · 25 % · 84 | 7,2 · 73 · 2,3 · 18 % · 82 | 5,4 · 18 · 1,5 · 1 % · 11 |
| Hund verliert die Fährte 2× (15 m seitlich) | 13,4 · 79 · 2,4 · 23 % · 88 | 9,4 · 76 · 2,4 · 16 % · 86 | 7,0 · 27 · 2,1 · 7 % · 28 |
| Hund verliert die Fährte kurz (5 m seitlich) | 7,2 · 75 · 2,5 · 21 % · 84 | 4,3 · 25 · 2,4 · 11 % · 25 | 4,9 · 15 · 1,5 · 1 % · 11 |

**Hund liegt am Gegenstand: Pfote steht > 3 m davor (Zeitanteil) · Ansagen eines Punkts dahinter je Lauf**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Basis (nur automatische Erkennung) | 2 % · 0,1 | 0 % · 0,3 | 0 % · 0,1 |
| Gegenstand angetippt, 2 s nach Ankunft beim Hund | 9 % · 0,5 | 7 % · 0,6 | 8 % · 0,3 |
| Gegenstand angetippt, erst nach 7 s | 5 % · 0,1 | 0 % · 0,3 | 3 % · 0,3 |
| Hund verliert die Fährte 1× (10 m seitlich) | 2 % · 0,3 | 2 % · 0,4 | 0 % · 0,3 |
| Hund verliert die Fährte 2× (15 m seitlich) | 0 % · 0,1 | 2 % · 0,4 | 0 % · 0,1 |
| Hund verliert die Fährte kurz (5 m seitlich) | 2 % · 0,1 | 2 % · 0,3 | 0 % · 0,3 |

**Fährtenende: angesagt · dem Hund fehlten noch (m) · zu früh (> 5 m) · doppelt · Gegenstand am Ende als gefunden geführt**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Basis (nur automatische Erkennung) | 13 % · 0,1 · 0 % · 0 % · 50 % | 63 % · 0,1 · 0 % · 0 % · 63 % | 25 % · 0,0 · 0 % · 0 % · 63 % |
| Gegenstand angetippt, 2 s nach Ankunft beim Hund | 13 % · 0,1 · 0 % · 0 % · 100 % | 63 % · 0,1 · 0 % · 0 % · 100 % | 25 % · 0,0 · 0 % · 0 % · 88 % |
| Gegenstand angetippt, erst nach 7 s | 13 % · 0,1 · 0 % · 0 % · 100 % | 63 % · 0,1 · 0 % · 0 % · 100 % | 25 % · 0,0 · 0 % · 0 % · 88 % |
| Hund verliert die Fährte 1× (10 m seitlich) | 0 % · – · 0 % · 0 % · 63 % | 63 % · 0,1 · 0 % · 0 % · 75 % | 13 % · 0,0 · 0 % · 0 % · 50 % |
| Hund verliert die Fährte 2× (15 m seitlich) | 13 % · 0,1 · 0 % · 0 % · 50 % | 38 % · 0,1 · 0 % · 0 % · 63 % | 0 % · – · 0 % · 0 % · 50 % |
| Hund verliert die Fährte kurz (5 m seitlich) | 25 % · 0,1 · 0 % · 0 % · 63 % | 63 % · 0,1 · 0 % · 0 % · 63 % | 13 % · 0,0 · 0 % · 0 % · 50 % |

**Manuell angetippt: richtiger Gegenstand gefunden · Fehlzuordnungen (Gegenstand ohne Antippen als «manuell gefunden»)**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Basis (nur automatische Erkennung) | – | – | – |
| Gegenstand angetippt, 2 s nach Ankunft beim Hund | 100 % · 0 | 100 % · 0 | 100 % · 0 |
| Gegenstand angetippt, erst nach 7 s | 100 % · 0 | 100 % · 0 | 100 % · 1 |
| Hund verliert die Fährte 1× (10 m seitlich) | – | – | – |
| Hund verliert die Fährte 2× (15 m seitlich) | – | – | – |
| Hund verliert die Fährte kurz (5 m seitlich) | – | – | – |

**Fährtenverlust des Hundes: als Abriss erkannt · Abrisse ausserhalb eines Verlusts je Lauf**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Basis (nur automatische Erkennung) | – · 0,4 | – · 0,4 | – · 0,4 |
| Gegenstand angetippt, 2 s nach Ankunft beim Hund | – · 0,4 | – · 0,4 | – · 0,4 |
| Gegenstand angetippt, erst nach 7 s | – · 0,4 | – · 0,4 | – · 0,4 |
| Hund verliert die Fährte 1× (10 m seitlich) | 50 % · 0,4 | 50 % · 0,1 | 25 % · 0,3 |
| Hund verliert die Fährte 2× (15 m seitlich) | 56 % · 0,4 | 50 % · 0,0 | 50 % · 0,4 |
| Hund verliert die Fährte kurz (5 m seitlich) | 38 % · 0,3 | 38 % · 0,1 | 13 % · 0,3 |

## Absuche — Android (ruhiger Sporthund, offenes Feld)

Läufe je Zelle: 8. Die App sieht den Weg des Hundeführers (Handy), nicht die Hundenase. Gegenstands-Quoten ohne den Gegenstand am Fährtenende (eigene Ende-Logik der App, nicht simuliert) und ohne manuelles Antippen. Mittelwerte enthalten auch Läufe, in denen die Zuordnung zur Fährte abriss.

**Verwiesene Gegenstände: automatisch als gefunden erkannt · von der Analyse als «wahrscheinlicher Kontakt» gewertet**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Android, Bildschirm an (live) | 94 % · 100 % | 81 % · 100 % |
| Android, gebündelt 30 s | 88 % · 56 % | 69 % · 50 % |
| Android, gebündelt 30 s, Hosentasche | 94 % · 50 % | 69 % · 81 % |
| Android, gebündelt 30 s, Spitzwinkel-Folge | 75 % · 31 % | 75 % · 50 % |
| Android live, Kreuzung | 81 % · 88 % | 63 % · 75 % |

**NICHT verwiesene Gegenstände, die die App trotzdem als gefunden zählt (Anzahl Fälle in Klammern)**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Android, Bildschirm an (live) | – (0) | – (0) |
| Android, gebündelt 30 s | – (0) | – (0) |
| Android, gebündelt 30 s, Hosentasche | – (0) | – (0) |
| Android, gebündelt 30 s, Spitzwinkel-Folge | – (0) | – (0) |
| Android live, Kreuzung | – (0) | – (0) |

**Mittlere Abweichung (m): von der App gemeldet · wahr beim Hund · wahr beim Hundeführer**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Android, Bildschirm an (live) | 2,2 · 0,3 · 0,8 | 2,0 · 0,2 · 0,9 |
| Android, gebündelt 30 s | 2,5 · 0,3 · 0,9 | 9,9 · 0,2 · 0,9 |
| Android, gebündelt 30 s, Hosentasche | 2,7 · 0,2 · 0,9 | 2,7 · 0,2 · 0,9 |
| Android, gebündelt 30 s, Spitzwinkel-Folge | 5,1 · 0,3 · 0,8 | 3,7 · 0,3 · 0,8 |
| Android live, Kreuzung | 3,4 · 0,2 · 1,1 | 8,8 · 0,3 · 1,1 |

**Punktzahl im Recorder · Punktzahl der Analyse · Abweichungs-Ereignisse je Lauf · Abrisse je Lauf**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Android, Bildschirm an (live) | 88 · 50 · 1,5 · 0,4 | 83 · 59 · 1,0 · 0,3 |
| Android, gebündelt 30 s | 85 · 48 · 1,5 · 0,6 | 64 · 50 · 0,9 · 0,3 |
| Android, gebündelt 30 s, Hosentasche | 82 · 47 · 1,8 · 1,0 | 77 · 51 · 1,4 · 0,3 |
| Android, gebündelt 30 s, Spitzwinkel-Folge | 49 · 59 · 0,8 · 0,5 | 61 · 56 · 1,0 · 0,4 |
| Android live, Kreuzung | 78 · 51 · 1,5 · 0,4 | 48 · 46 · 1,9 · 1,0 |

**Abgang erkannt · Fährtenende erreicht (≥ 90 % Fortschritt) · Lagefehler der Gegenstände beim Legen (m)**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Android, Bildschirm an (live) | 100 % · 100 % · 2,0 | 100 % · 100 % · 2,3 |
| Android, gebündelt 30 s | 100 % · 100 % · 2,0 | 75 % · 75 % · 2,3 |
| Android, gebündelt 30 s, Hosentasche | 100 % · 100 % · 2,0 | 100 % · 100 % · 2,3 |
| Android, gebündelt 30 s, Spitzwinkel-Folge | 88 % · 50 % · 2,1 | 100 % · 75 % · 2,6 |
| Android live, Kreuzung | 100 % · 88 % · 1,9 | 100 % · 50 % · 2,7 |

**Führung (T-205):** gemessen am WAHREN Hund. «Rechtzeitig» = der Hund ist bei Sprechbeginn 3–15 m vor dem Punkt, «knapp» = 0–3 m, «zu spät» = schon vorbei, «zu früh» = mehr als 15 m. Die Pfote ist die Hundeposition der App.

**Ansage je Winkel/Gegenstand: rechtzeitig · knapp · zu spät · fehlt · zu früh**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Android, Bildschirm an (live) | 83 % · 0 % · 3 % · 0 % · 15 % | 85 % · 3 % · 0 % · 3 % · 10 % |
| Android, gebündelt 30 s | 20 % · 40 % · 20 % · 3 % · 18 % | 23 % · 23 % · 23 % · 26 % · 5 % |
| Android, gebündelt 30 s, Hosentasche | 20 % · 48 % · 18 % · 0 % · 15 % | 38 % · 13 % · 38 % · 5 % · 5 % |
| Android, gebündelt 30 s, Spitzwinkel-Folge | 30 % · 11 % · 32 % · 28 % · 0 % | 35 % · 9 % · 41 % · 15 % · 0 % |
| Android live, Kreuzung | 83 % · 7 % · 2 % · 9 % · 0 % | 54 % · 8 % · 17 % · 21 % · 0 % |

**Je Lauf: Ansagen abgebrochen · Ansagen verfallen · Punkte doppelt angesagt · Ansage eines Winkels, den es nicht gibt**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Android, Bildschirm an (live) | 0,3 · 0,0 · 0,0 · 0,0 | 0,0 · 0,0 · 0,0 · 0,0 |
| Android, gebündelt 30 s | 1,5 · 0,0 · 0,0 · 0,0 | 1,1 · 0,0 · 0,0 · 0,0 |
| Android, gebündelt 30 s, Hosentasche | 1,8 · 0,0 · 0,0 · 0,0 | 1,8 · 0,0 · 0,0 · 0,0 |
| Android, gebündelt 30 s, Spitzwinkel-Folge | 1,8 · 0,0 · 0,0 · 0,0 | 2,1 · 0,0 · 0,0 · 0,1 |
| Android live, Kreuzung | 0,3 · 0,0 · 0,0 · 0,1 | 0,0 · 0,0 · 0,0 · 0,0 |

**Pfote: mittlerer Fehler (m) · grösster Fehler (m) · Sprünge je Lauf · Zeitanteil auf falschem Schenkel · grösster Versatz (m)**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Android, Bildschirm an (live) | 3,8 · 23 · 1,6 · 7 % · 23 | 3,3 · 21 · 1,9 · 4 % · 21 |
| Android, gebündelt 30 s | 4,5 · 25 · 3,1 · 8 % · 26 | 3,2 · 26 · 2,6 · 5 % · 30 |
| Android, gebündelt 30 s, Hosentasche | 4,7 · 25 · 3,5 · 10 % · 26 | 4,1 · 23 · 3,4 · 8 % · 24 |
| Android, gebündelt 30 s, Spitzwinkel-Folge | 8,0 · 30 · 3,0 · 35 % · 40 | 8,0 · 31 · 3,5 · 31 % · 41 |
| Android live, Kreuzung | 7,0 · 89 · 1,5 · 13 % · 98 | 13,9 · 88 · 1,3 · 34 % · 97 |

**Hund liegt am Gegenstand: Pfote steht > 3 m davor (Zeitanteil) · Ansagen eines Punkts dahinter je Lauf**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Android, Bildschirm an (live) | 0 % · 0,3 | 8 % · 0,4 |
| Android, gebündelt 30 s | 0 % · 0,3 | 10 % · 0,1 |
| Android, gebündelt 30 s, Hosentasche | 4 % · 0,0 | 12 % · 0,3 |
| Android, gebündelt 30 s, Spitzwinkel-Folge | 0 % · 0,1 | 4 % · 0,3 |
| Android live, Kreuzung | 2 % · 0,1 | 0 % · 0,0 |

**Fährtenende: angesagt · dem Hund fehlten noch (m) · zu früh (> 5 m) · doppelt · Gegenstand am Ende als gefunden geführt**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Android, Bildschirm an (live) | 25 % · 0,1 · 0 % · 0 % · 88 % | 0 % · – · 0 % · 0 % · 63 % |
| Android, gebündelt 30 s | 0 % · – · 0 % · 0 % · 63 % | 0 % · – · 0 % · 0 % · 50 % |
| Android, gebündelt 30 s, Hosentasche | 0 % · – · 0 % · 0 % · 25 % | 13 % · 0,0 · 0 % · 0 % · 13 % |
| Android, gebündelt 30 s, Spitzwinkel-Folge | 0 % · – · 0 % · 0 % · 38 % | 13 % · 0,0 · 0 % · 0 % · 50 % |
| Android live, Kreuzung | 25 % · 0,1 · 0 % · 0 % · 88 % | 0 % · – · 0 % · 0 % · 100 % |
