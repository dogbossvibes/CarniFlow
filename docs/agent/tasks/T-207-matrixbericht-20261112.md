# Fährten-Simulator — Matrixbericht

720 simulierte Läufe durch die echte Lege- und Such-Verarbeitung der App. Gruppen: suche (96 Läufe, 812 s), suchvarianten (128 Läufe, 1302 s), formen (144 Läufe, 1246 s), unterbrechungen (112 Läufe, 713 s), ablauf (144 Läufe, 744 s), android (96 Läufe, 1162 s).

Alle Zahlen sind Simulationsergebnisse mit angenommenen Fehlermodellen (siehe README.md), keine Feldmessungen.

Statistische Unsicherheit: bei 12 Läufen je Zelle schwankt ein Prozentwert zufällig um rund ±15 Punkte, bei 6 Läufen um ±20. Einzelne Zellen nicht überbewerten, auf Muster über mehrere Zellen achten.

## Absuche — Hundetyp × Gerät/Umgebung (Übungsfährte 120 m, 10-m-Leine)

Läufe je Zelle: 8. Die App sieht den Weg des Hundeführers (Handy), nicht die Hundenase. Gegenstands-Quoten ohne den Gegenstand am Fährtenende (eigene Ende-Logik der App, nicht simuliert) und ohne manuelles Antippen. Mittelwerte enthalten auch Läufe, in denen die Zuordnung zur Fährte abriss.

**Verwiesene Gegenstände: automatisch als gefunden erkannt · von der Analyse als «wahrscheinlicher Kontakt» gewertet**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | 88 % · 100 % | 38 % · 100 % | 31 % · 75 % | 25 % · 56 % |
| Eifriger, schneller Hund | 79 % · 100 % | 62 % · 100 % | 36 % · 57 % | 33 % · 67 % |
| Unsicherer, weit pendelnder Hund | 83 % · 100 % | 60 % · 100 % | 33 % · 92 % | 36 % · 57 % |

**NICHT verwiesene Gegenstände, die die App trotzdem als gefunden zählt (Anzahl Fälle in Klammern)**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | – (0) | – (0) | – (0) | – (0) |
| Eifriger, schneller Hund | 50 % (2) | 0 % (3) | 50 % (2) | 0 % (1) |
| Unsicherer, weit pendelnder Hund | 0 % (4) | 0 % (6) | 0 % (4) | 0 % (2) |

**Mittlere Abweichung (m): von der App gemeldet · wahr beim Hund · wahr beim Hundeführer**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | 1,8 · 0,2 · 0,9 | 3,0 · 0,2 · 0,9 | 4,6 · 0,2 · 0,9 | 10,5 · 0,2 · 0,9 |
| Eifriger, schneller Hund | 2,0 · 0,8 · 0,8 | 2,1 · 0,8 · 0,7 | 11,8 · 1,2 · 0,7 | 10,6 · 0,8 · 0,7 |
| Unsicherer, weit pendelnder Hund | 1,9 · 2,3 · 1,2 | 2,4 · 3,3 · 1,9 | 4,9 · 2,9 · 1,8 | 10,1 · 2,4 · 1,3 |

**Punktzahl im Recorder · Punktzahl der Analyse · Abweichungs-Ereignisse je Lauf · Abrisse je Lauf**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | 88 · 52 · 0,9 · 0,1 | 76 · 45 · 1,9 · 0,3 | 70 · 44 · 2,4 · 0,4 | 54 · 40 · 2,8 · 0,8 |
| Eifriger, schneller Hund | 88 · 61 · 0,9 · 0,0 | 83 · 56 · 1,0 · 0,0 | 59 · 55 · 1,4 · 0,3 | 62 · 46 · 1,9 · 0,8 |
| Unsicherer, weit pendelnder Hund | 86 · 56 · 0,9 · 0,1 | 80 · 50 · 1,9 · 0,4 | 65 · 40 · 2,8 · 0,8 | 58 · 43 · 2,6 · 0,6 |

**Abgang erkannt · Fährtenende erreicht (≥ 90 % Fortschritt) · Lagefehler der Gegenstände beim Legen (m)**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 | 100 % · 63 % · 4,9 | 88 % · 75 % · 5,9 |
| Eifriger, schneller Hund | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 | 75 % · 75 % · 4,9 | 88 % · 88 % · 5,9 |
| Unsicherer, weit pendelnder Hund | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 | 100 % · 100 % · 4,9 | 88 % · 88 % · 5,9 |

**Führung (T-205):** gemessen am WAHREN Hund. «Rechtzeitig» = der Hund ist bei Sprechbeginn 3–15 m vor dem Punkt, «knapp» = 0–3 m, «zu spät» = schon vorbei, «zu früh» = mehr als 15 m. Die Pfote ist die Hundeposition der App.

**Ansage je Winkel/Gegenstand: rechtzeitig · knapp · zu spät · fehlt · zu früh**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | 90 % · 3 % · 0 % · 0 % · 8 % | 82 % · 8 % · 0 % · 8 % · 3 % | 33 % · 37 % · 17 % · 7 % · 7 % | 33 % · 22 % · 15 % · 26 % · 4 % |
| Eifriger, schneller Hund | 85 % · 8 % · 0 % · 0 % · 8 % | 90 % · 8 % · 0 % · 3 % · 0 % | 37 % · 27 % · 7 % · 27 % · 3 % | 26 % · 30 % · 22 % · 22 % · 0 % |
| Unsicherer, weit pendelnder Hund | 85 % · 0 % · 0 % · 0 % · 15 % | 87 % · 3 % · 0 % · 8 % · 3 % | 53 % · 30 % · 7 % · 3 % · 7 % | 26 % · 30 % · 19 % · 19 % · 7 % |

**Je Lauf: Ansagen abgebrochen · Ansagen verfallen · Punkte doppelt angesagt · Ansage eines Winkels, den es nicht gibt**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | 0,6 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 | 0,5 · 0,0 · 0,0 · 0,4 | 0,0 · 0,0 · 0,0 · 1,0 |
| Eifriger, schneller Hund | 0,9 · 0,0 · 0,0 · 0,0 | 0,5 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,4 | 0,5 · 0,0 · 0,0 · 1,5 |
| Unsicherer, weit pendelnder Hund | 0,6 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,4 | 0,1 · 0,0 · 0,0 · 1,1 |

**Pfote: mittlerer Fehler (m) · grösster Fehler (m) · Sprünge je Lauf · Zeitanteil auf falschem Schenkel · grösster Versatz (m)**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | 2,7 · 16 · 1,3 · 3 % · 16 | 3,7 · 17 · 3,0 · 5 % · 17 | 9,4 · 42 · 2,1 · 42 % · 48 | 6,6 · 32 · 3,1 · 33 % · 31 |
| Eifriger, schneller Hund | 3,3 · 19 · 1,6 · 5 % · 18 | 3,9 · 17 · 2,0 · 4 % · 16 | 5,1 · 39 · 1,8 · 22 % · 36 | 7,4 · 30 · 3,0 · 41 % · 23 |
| Unsicherer, weit pendelnder Hund | 3,7 · 14 · 1,3 · 1 % · 12 | 4,9 · 15 · 1,5 · 1 % · 11 | 8,0 · 46 · 2,6 · 34 % · 45 | 6,8 · 42 · 2,9 · 29 % · 42 |

**Hund liegt am Gegenstand: Pfote steht > 3 m davor (Zeitanteil) · Ansagen eines Punkts dahinter je Lauf**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | 0 % · 0,6 | 2 % · 0,1 | 13 % · 0,3 | 32 % · 0,0 |
| Eifriger, schneller Hund | 0 % · 0,5 | 0 % · 0,3 | 8 % · 0,0 | 25 % · 0,1 |
| Unsicherer, weit pendelnder Hund | 0 % · 0,4 | 0 % · 0,1 | 17 % · 0,1 | 53 % · 0,1 |

**Fährtenende: angesagt · dem Hund fehlten noch (m) · zu früh (> 5 m) · doppelt · Gegenstand am Ende als gefunden geführt**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | 100 % · 0,1 · 0 % · 0 % · 100 % | 63 % · 0,1 · 0 % · 0 % · 50 % | 63 % · 1,2 · 13 % · 0 % · 50 % | 25 % · 0,1 · 0 % · 0 % · 0 % |
| Eifriger, schneller Hund | 100 % · 0,1 · 0 % · 0 % · 75 % | 63 % · 0,1 · 0 % · 0 % · 63 % | 25 % · 0,1 · 0 % · 0 % · 13 % | 38 % · 0,1 · 0 % · 0 % · 38 % |
| Unsicherer, weit pendelnder Hund | 100 % · 0,0 · 0 % · 0 % · 88 % | 75 % · 0,0 · 0 % · 0 % · 63 % | 25 % · 0,1 · 0 % · 0 % · 0 % | 38 % · 0,1 · 0 % · 0 % · 0 % |

## Absuche — Varianten (ruhiger Sporthund, offenes Feld)

Läufe je Zelle: 8. Die App sieht den Weg des Hundeführers (Handy), nicht die Hundenase. Gegenstands-Quoten ohne den Gegenstand am Fährtenende (eigene Ende-Logik der App, nicht simuliert) und ohne manuelles Antippen. Mittelwerte enthalten auch Läufe, in denen die Zuordnung zur Fährte abriss.

**Verwiesene Gegenstände: automatisch als gefunden erkannt · von der Analyse als «wahrscheinlicher Kontakt» gewertet**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (10-m-Leine, App auf 10 m) | 88 % · 100 % | 38 % · 100 % |
| 5-m-Leine, App auf 5 m | 88 % · 100 % | 56 % · 100 % |
| 10-m-Leine, App fälschlich auf 5 m | 88 % · 100 % | 38 % · 100 % |
| Kurzer Halt am Gegenstand (3 s) | 94 % · 100 % | 69 % · 94 % |
| Gegenstand beim Legen mit 3 s Halt abgelegt | 94 % · 100 % | 81 % · 100 % |
| Handy bei der Absuche in der Hosentasche | 81 % · 100 % | 56 % · 100 % |
| Absuche ohne Bewegungssensor | 81 % · 19 % | 81 % · 38 % |
| Android, Bildschirm 60 s aus | 94 % · 94 % | 63 % · 69 % |

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
| Android, Bildschirm 60 s aus | – (0) | – (0) |

**Mittlere Abweichung (m): von der App gemeldet · wahr beim Hund · wahr beim Hundeführer**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (10-m-Leine, App auf 10 m) | 1,8 · 0,2 · 0,9 | 3,0 · 0,2 · 0,9 |
| 5-m-Leine, App auf 5 m | 1,1 · 0,2 · 0,3 | 1,8 · 0,2 · 0,3 |
| 10-m-Leine, App fälschlich auf 5 m | 1,8 · 0,2 · 0,9 | 3,0 · 0,2 · 0,9 |
| Kurzer Halt am Gegenstand (3 s) | 2,0 · 0,3 · 0,9 | 2,6 · 0,2 · 0,9 |
| Gegenstand beim Legen mit 3 s Halt abgelegt | 1,7 · 0,2 · 0,9 | 2,4 · 0,3 · 0,9 |
| Handy bei der Absuche in der Hosentasche | 1,9 · 0,3 · 0,8 | 3,1 · 0,2 · 0,9 |
| Absuche ohne Bewegungssensor | 2,0 · 0,2 · 0,9 | 7,2 · 0,2 · 0,9 |
| Android, Bildschirm 60 s aus | 2,0 · 0,3 · 0,8 | 1,8 · 0,2 · 0,9 |

**Punktzahl im Recorder · Punktzahl der Analyse · Abweichungs-Ereignisse je Lauf · Abrisse je Lauf**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (10-m-Leine, App auf 10 m) | 88 · 52 · 0,9 · 0,1 | 76 · 45 · 1,9 · 0,3 |
| 5-m-Leine, App auf 5 m | 89 · 70 · 0,1 · 0,0 | 81 · 59 · 1,1 · 0,0 |
| 10-m-Leine, App fälschlich auf 5 m | 88 · 52 · 0,9 · 0,1 | 76 · 45 · 1,9 · 0,3 |
| Kurzer Halt am Gegenstand (3 s) | 85 · 52 · 1,3 · 0,0 | 79 · 48 · 1,8 · 0,1 |
| Gegenstand beim Legen mit 3 s Halt abgelegt | 89 · 54 · 0,9 · 0,1 | 86 · 46 · 1,8 · 0,3 |
| Handy bei der Absuche in der Hosentasche | 89 · 51 · 1,4 · 0,0 | 78 · 44 · 2,0 · 0,0 |
| Absuche ohne Bewegungssensor | 86 · 49 · 1,5 · 0,0 | 76 · 48 · 1,5 · 0,0 |
| Android, Bildschirm 60 s aus | 85 · 53 · 1,0 · 0,0 | 80 · 60 · 0,8 · 0,0 |

**Abgang erkannt · Fährtenende erreicht (≥ 90 % Fortschritt) · Lagefehler der Gegenstände beim Legen (m)**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (10-m-Leine, App auf 10 m) | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 |
| 5-m-Leine, App auf 5 m | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 |
| 10-m-Leine, App fälschlich auf 5 m | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 |
| Kurzer Halt am Gegenstand (3 s) | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 |
| Gegenstand beim Legen mit 3 s Halt abgelegt | 100 % · 100 % · 1,5 | 100 % · 100 % · 2,0 |
| Handy bei der Absuche in der Hosentasche | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 |
| Absuche ohne Bewegungssensor | 100 % · 100 % · 1,4 | 88 % · 88 % · 2,1 |
| Android, Bildschirm 60 s aus | 100 % · 100 % · 2,0 | 100 % · 100 % · 2,3 |

**Führung (T-205):** gemessen am WAHREN Hund. «Rechtzeitig» = der Hund ist bei Sprechbeginn 3–15 m vor dem Punkt, «knapp» = 0–3 m, «zu spät» = schon vorbei, «zu früh» = mehr als 15 m. Die Pfote ist die Hundeposition der App.

**Ansage je Winkel/Gegenstand: rechtzeitig · knapp · zu spät · fehlt · zu früh**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (10-m-Leine, App auf 10 m) | 90 % · 3 % · 0 % · 0 % · 8 % | 82 % · 8 % · 0 % · 8 % · 3 % |
| 5-m-Leine, App auf 5 m | 100 % · 0 % · 0 % · 0 % · 0 % | 97 % · 3 % · 0 % · 0 % · 0 % |
| 10-m-Leine, App fälschlich auf 5 m | 70 % · 30 % · 0 % · 0 % · 0 % | 62 % · 28 % · 10 % · 0 % · 0 % |
| Kurzer Halt am Gegenstand (3 s) | 93 % · 0 % · 0 % · 0 % · 8 % | 85 % · 3 % · 0 % · 5 % · 8 % |
| Gegenstand beim Legen mit 3 s Halt abgelegt | 93 % · 0 % · 0 % · 0 % · 8 % | 88 % · 0 % · 3 % · 5 % · 5 % |
| Handy bei der Absuche in der Hosentasche | 83 % · 0 % · 0 % · 3 % · 15 % | 97 % · 0 % · 0 % · 0 % · 3 % |
| Absuche ohne Bewegungssensor | 90 % · 0 % · 0 % · 0 % · 10 % | 74 % · 0 % · 0 % · 15 % · 10 % |
| Android, Bildschirm 60 s aus | 48 % · 3 % · 28 % · 8 % · 15 % | 49 % · 0 % · 8 % · 33 % · 10 % |

**Je Lauf: Ansagen abgebrochen · Ansagen verfallen · Punkte doppelt angesagt · Ansage eines Winkels, den es nicht gibt**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (10-m-Leine, App auf 10 m) | 0,6 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |
| 5-m-Leine, App auf 5 m | 0,6 · 0,0 · 0,0 · 0,0 | 0,4 · 0,0 · 0,0 · 0,0 |
| 10-m-Leine, App fälschlich auf 5 m | 0,6 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |
| Kurzer Halt am Gegenstand (3 s) | 0,0 · 0,0 · 0,0 · 0,0 | 0,0 · 0,0 · 0,0 · 0,0 |
| Gegenstand beim Legen mit 3 s Halt abgelegt | 0,3 · 0,0 · 0,0 · 0,0 | 0,5 · 0,0 · 0,0 · 0,0 |
| Handy bei der Absuche in der Hosentasche | 0,6 · 0,0 · 0,0 · 0,0 | 0,4 · 0,0 · 0,0 · 0,0 |
| Absuche ohne Bewegungssensor | 0,6 · 0,0 · 0,0 · 0,0 | 0,1 · 0,0 · 0,0 · 0,0 |
| Android, Bildschirm 60 s aus | 0,8 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |

**Pfote: mittlerer Fehler (m) · grösster Fehler (m) · Sprünge je Lauf · Zeitanteil auf falschem Schenkel · grösster Versatz (m)**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (10-m-Leine, App auf 10 m) | 2,7 · 16 · 1,3 · 3 % · 16 | 3,7 · 17 · 3,0 · 5 % · 17 |
| 5-m-Leine, App auf 5 m | 1,6 · 11 · 0,1 · 0 % · 11 | 2,5 · 13 · 0,5 · 1 % · 13 |
| 10-m-Leine, App fälschlich auf 5 m | 5,3 · 20 · 1,1 · 3 % · 16 | 5,8 · 22 · 2,1 · 5 % · 17 |
| Kurzer Halt am Gegenstand (3 s) | 2,9 · 15 · 1,6 · 5 % · 15 | 4,2 · 20 · 1,9 · 8 % · 20 |
| Gegenstand beim Legen mit 3 s Halt abgelegt | 2,4 · 14 · 1,5 · 3 % · 15 | 3,3 · 29 · 1,6 · 4 % · 19 |
| Handy bei der Absuche in der Hosentasche | 3,0 · 18 · 1,9 · 5 % · 16 | 4,1 · 28 · 2,4 · 7 % · 21 |
| Absuche ohne Bewegungssensor | 3,0 · 20 · 1,9 · 5 % · 17 | 3,0 · 16 · 1,5 · 4 % · 17 |
| Android, Bildschirm 60 s aus | 3,8 · 19 · 1,1 · 7 % · 17 | 3,5 · 19 · 2,1 · 2 % · 13 |

**Hund liegt am Gegenstand: Pfote steht > 3 m davor (Zeitanteil) · Ansagen eines Punkts dahinter je Lauf**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (10-m-Leine, App auf 10 m) | 0 % · 0,6 | 2 % · 0,1 |
| 5-m-Leine, App auf 5 m | 0 % · 0,3 | 6 % · 0,0 |
| 10-m-Leine, App fälschlich auf 5 m | 0 % · 0,9 | 2 % · 0,4 |
| Kurzer Halt am Gegenstand (3 s) | 0 % · 0,6 | 2 % · 0,3 |
| Gegenstand beim Legen mit 3 s Halt abgelegt | 0 % · 0,6 | 2 % · 0,0 |
| Handy bei der Absuche in der Hosentasche | 0 % · 0,4 | 2 % · 0,3 |
| Absuche ohne Bewegungssensor | 1 % · 0,5 | 4 % · 0,3 |
| Android, Bildschirm 60 s aus | 0 % · 0,0 | 0 % · 0,0 |

**Fährtenende: angesagt · dem Hund fehlten noch (m) · zu früh (> 5 m) · doppelt · Gegenstand am Ende als gefunden geführt**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (10-m-Leine, App auf 10 m) | 100 % · 0,1 · 0 % · 0 % · 100 % | 63 % · 0,1 · 0 % · 0 % · 50 % |
| 5-m-Leine, App auf 5 m | 100 % · 0,1 · 0 % · 0 % · 88 % | 75 % · 0,3 · 0 % · 0 % · 50 % |
| 10-m-Leine, App fälschlich auf 5 m | 100 % · 0,1 · 0 % · 0 % · 100 % | 63 % · 0,1 · 0 % · 0 % · 50 % |
| Kurzer Halt am Gegenstand (3 s) | 13 % · 0,1 · 0 % · 0 % · 0 % | 25 % · 0,0 · 0 % · 0 % · 0 % |
| Gegenstand beim Legen mit 3 s Halt abgelegt | 88 % · 0,1 · 0 % · 0 % · 88 % | 75 % · 0,1 · 0 % · 0 % · 75 % |
| Handy bei der Absuche in der Hosentasche | 88 % · 0,1 · 0 % · 0 % · 75 % | 63 % · 0,1 · 0 % · 0 % · 63 % |
| Absuche ohne Bewegungssensor | 63 % · 0,1 · 0 % · 0 % · 63 % | 25 % · 0,0 · 0 % · 0 % · 25 % |
| Android, Bildschirm 60 s aus | 88 % · 0,0 · 0 % · 0 % · 88 % | 88 % · 0,1 · 0 % · 0 % · 63 % |

## Absuche — schwierige Fährtenformen × Hundetyp (Mittelklasse-Handy, offenes Feld, 10-m-Leine)

Läufe je Zelle: 8. Die App sieht den Weg des Hundeführers (Handy), nicht die Hundenase. Gegenstands-Quoten ohne den Gegenstand am Fährtenende (eigene Ende-Logik der App, nicht simuliert) und ohne manuelles Antippen. Mittelwerte enthalten auch Läufe, in denen die Zuordnung zur Fährte abriss.

**Verwiesene Gegenstände: automatisch als gefunden erkannt · von der Analyse als «wahrscheinlicher Kontakt» gewertet**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Übungsfährte (Basis) | 38 % · 100 % | 62 % · 100 % | 60 % · 100 % |
| Kreuzung | 88 % · 100 % | 93 % · 100 % | 55 % · 100 % |
| Parallele Schenkel 4 m | 81 % · 75 % | 71 % · 86 % | 33 % · 100 % |
| Parallele Schenkel 8 m | 44 % · 88 % | 64 % · 100 % | 40 % · 80 % |
| Spitzwinkel-Folge | 63 % · 75 % | 79 % · 100 % | 62 % · 100 % |
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
| Übungsfährte (Basis) | 3,0 · 0,2 · 0,9 | 2,1 · 0,8 · 0,7 | 2,4 · 3,3 · 1,9 |
| Kreuzung | 2,5 · 0,2 · 1,1 | 1,9 · 1,4 · 0,8 | 2,4 · 2,5 · 1,6 |
| Parallele Schenkel 4 m | 2,4 · 0,3 · 0,6 | 2,3 · 1,2 · 0,6 | 2,5 · 2,4 · 1,2 |
| Parallele Schenkel 8 m | 2,4 · 0,3 · 0,9 | 2,3 · 0,9 · 0,8 | 3,4 · 2,8 · 1,4 |
| Spitzwinkel-Folge | 2,0 · 0,3 · 0,8 | 2,3 · 1,3 · 1,1 | 2,2 · 2,8 · 1,5 |
| Gegenstand im Winkel | 2,0 · 0,3 · 0,3 | 2,2 · 1,4 · 1,0 | 3,0 · 2,9 · 1,6 |

**Punktzahl im Recorder · Punktzahl der Analyse · Abweichungs-Ereignisse je Lauf · Abrisse je Lauf**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Übungsfährte (Basis) | 76 · 45 · 1,9 · 0,3 | 83 · 56 · 1,0 · 0,0 | 80 · 50 · 1,9 · 0,4 |
| Kreuzung | 82 · 46 · 1,9 · 0,1 | 87 · 60 · 0,8 · 0,0 | 78 · 50 · 1,5 · 0,3 |
| Parallele Schenkel 4 m | 78 · 61 · 0,6 · 0,0 | 80 · 62 · 0,8 · 0,1 | 78 · 55 · 1,5 · 0,1 |
| Parallele Schenkel 8 m | 78 · 49 · 1,5 · 0,0 | 85 · 55 · 1,6 · 0,0 | 69 · 56 · 1,0 · 0,0 |
| Spitzwinkel-Folge | 66 · 62 · 0,6 · 0,0 | 79 · 60 · 0,8 · 0,1 | 79 · 57 · 1,0 · 0,3 |
| Gegenstand im Winkel | 85 · 59 · 0,6 · 0,0 | 84 · 60 · 1,1 · 0,3 | 83 · 53 · 1,4 · 0,5 |

**Abgang erkannt · Fährtenende erreicht (≥ 90 % Fortschritt) · Lagefehler der Gegenstände beim Legen (m)**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Übungsfährte (Basis) | 100 % · 100 % · 2,1 | 100 % · 100 % · 2,1 | 100 % · 100 % · 2,1 |
| Kreuzung | 100 % · 100 % · 2,6 | 100 % · 100 % · 2,6 | 100 % · 100 % · 2,6 |
| Parallele Schenkel 4 m | 100 % · 100 % · 2,4 | 100 % · 100 % · 2,4 | 100 % · 100 % · 2,4 |
| Parallele Schenkel 8 m | 100 % · 100 % · 2,2 | 100 % · 100 % · 2,2 | 88 % · 88 % · 2,2 |
| Spitzwinkel-Folge | 100 % · 100 % · 1,6 | 100 % · 100 % · 1,6 | 100 % · 100 % · 1,6 |
| Gegenstand im Winkel | 100 % · 100 % · 2,6 | 100 % · 100 % · 2,6 | 100 % · 100 % · 2,6 |

**Führung (T-205):** gemessen am WAHREN Hund. «Rechtzeitig» = der Hund ist bei Sprechbeginn 3–15 m vor dem Punkt, «knapp» = 0–3 m, «zu spät» = schon vorbei, «zu früh» = mehr als 15 m. Die Pfote ist die Hundeposition der App.

**Ansage je Winkel/Gegenstand: rechtzeitig · knapp · zu spät · fehlt · zu früh**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Übungsfährte (Basis) | 82 % · 8 % · 0 % · 8 % · 3 % | 90 % · 8 % · 0 % · 3 % · 0 % | 87 % · 3 % · 0 % · 8 % · 3 % |
| Kreuzung | 83 % · 8 % · 2 % · 4 % · 2 % | 85 % · 6 % · 2 % · 4 % · 2 % | 75 % · 13 % · 0 % · 10 % · 2 % |
| Parallele Schenkel 4 m | 66 % · 9 % · 5 % · 11 % · 9 % | 61 % · 7 % · 9 % · 7 % · 16 % | 70 % · 5 % · 7 % · 2 % · 16 % |
| Parallele Schenkel 8 m | 70 % · 7 % · 15 % · 4 % · 4 % | 61 % · 13 % · 15 % · 0 % · 11 % | 67 % · 9 % · 4 % · 13 % · 7 % |
| Spitzwinkel-Folge | 33 % · 30 % · 33 % · 4 % · 0 % | 46 % · 24 % · 22 % · 7 % · 2 % | 65 % · 11 % · 4 % · 11 % · 9 % |
| Gegenstand im Winkel | 79 % · 10 % · 8 % · 0 % · 3 % | 79 % · 18 % · 3 % · 0 % · 0 % | 74 % · 26 % · 0 % · 0 % · 0 % |

**Je Lauf: Ansagen abgebrochen · Ansagen verfallen · Punkte doppelt angesagt · Ansage eines Winkels, den es nicht gibt**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Übungsfährte (Basis) | 0,3 · 0,0 · 0,0 · 0,0 | 0,5 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |
| Kreuzung | 0,4 · 0,0 · 0,0 · 0,1 | 0,6 · 0,0 · 0,0 · 0,1 | 0,4 · 0,0 · 0,0 · 0,1 |
| Parallele Schenkel 4 m | 0,5 · 0,0 · 0,0 · 0,0 | 0,5 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |
| Parallele Schenkel 8 m | 0,9 · 0,0 · 0,0 · 0,1 | 0,6 · 0,0 · 0,0 · 0,0 | 0,5 · 0,0 · 0,0 · 0,0 |
| Spitzwinkel-Folge | 0,5 · 0,0 · 0,0 · 0,0 | 0,5 · 0,0 · 0,0 · 0,0 | 0,6 · 0,0 · 0,0 · 0,0 |
| Gegenstand im Winkel | 0,3 · 0,0 · 0,0 · 0,0 | 0,5 · 0,0 · 0,0 · 0,0 | 0,1 · 0,0 · 0,0 · 0,0 |

**Pfote: mittlerer Fehler (m) · grösster Fehler (m) · Sprünge je Lauf · Zeitanteil auf falschem Schenkel · grösster Versatz (m)**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Übungsfährte (Basis) | 3,7 · 17 · 3,0 · 5 % · 17 | 3,9 · 17 · 2,0 · 4 % · 16 | 4,9 · 15 · 1,5 · 1 % · 11 |
| Kreuzung | 3,8 · 23 · 1,8 · 7 % · 17 | 4,2 · 15 · 1,5 · 3 % · 15 | 5,0 · 22 · 1,9 · 8 % · 22 |
| Parallele Schenkel 4 m | 6,1 · 36 · 2,0 · 20 % · 36 | 5,5 · 34 · 1,9 · 18 % · 35 | 5,4 · 34 · 2,4 · 9 % · 35 |
| Parallele Schenkel 8 m | 6,3 · 36 · 2,6 · 16 % · 36 | 5,0 · 28 · 2,4 · 9 % · 35 | 4,5 · 24 · 1,9 · 3 % · 27 |
| Spitzwinkel-Folge | 8,9 · 33 · 3,0 · 36 % · 29 | 5,9 · 27 · 3,0 · 26 % · 28 | 6,0 · 18 · 2,1 · 6 % · 23 |
| Gegenstand im Winkel | 3,1 · 20 · 0,8 · 2 % · 14 | 3,9 · 19 · 1,3 · 5 % · 11 | 4,2 · 19 · 1,0 · 4 % · 13 |

**Hund liegt am Gegenstand: Pfote steht > 3 m davor (Zeitanteil) · Ansagen eines Punkts dahinter je Lauf**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Übungsfährte (Basis) | 2 % · 0,1 | 0 % · 0,3 | 0 % · 0,1 |
| Kreuzung | 4 % · 0,0 | 2 % · 0,0 | 0 % · 0,0 |
| Parallele Schenkel 4 m | 4 % · 0,1 | 2 % · 0,0 | 0 % · 0,0 |
| Parallele Schenkel 8 m | 0 % · 0,0 | 0 % · 0,0 | 0 % · 0,0 |
| Spitzwinkel-Folge | 0 % · 0,3 | 0 % · 0,1 | 0 % · 0,3 |
| Gegenstand im Winkel | 10 % · 0,0 | 32 % · 0,0 | 24 % · 0,0 |

**Fährtenende: angesagt · dem Hund fehlten noch (m) · zu früh (> 5 m) · doppelt · Gegenstand am Ende als gefunden geführt**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Übungsfährte (Basis) | 63 % · 0,1 · 0 % · 0 % · 50 % | 63 % · 0,1 · 0 % · 0 % · 63 % | 75 % · 0,0 · 0 % · 0 % · 63 % |
| Kreuzung | 75 % · 0,1 · 0 % · 0 % · 38 % | 63 % · 0,1 · 0 % · 0 % · 50 % | 63 % · 0,1 · 0 % · 0 % · 63 % |
| Parallele Schenkel 4 m | 63 % · 0,1 · 0 % · 0 % · 63 % | 63 % · 0,1 · 0 % · 0 % · 63 % | 88 % · 0,1 · 0 % · 0 % · 63 % |
| Parallele Schenkel 8 m | 75 % · 0,0 · 0 % · 0 % · 75 % | 88 % · 0,1 · 0 % · 0 % · 75 % | 63 % · 0,1 · 0 % · 0 % · 63 % |
| Spitzwinkel-Folge | 75 % · 0,0 · 0 % · 0 % · 63 % | 75 % · 0,0 · 0 % · 0 % · 63 % | 63 % · 0,0 · 0 % · 0 % · 75 % |
| Gegenstand im Winkel | 63 % · 0,1 · 0 % · 0 % · 50 % | 88 % · 0,1 · 0 % · 0 % · 75 % | 63 % · 0,1 · 0 % · 0 % · 63 % |

## Absuche — Unterbrechungen (ruhiger Sporthund, offenes Feld, iOS)

Läufe je Zelle: 8. Die App sieht den Weg des Hundeführers (Handy), nicht die Hundenase. Gegenstands-Quoten ohne den Gegenstand am Fährtenende (eigene Ende-Logik der App, nicht simuliert) und ohne manuelles Antippen. Mittelwerte enthalten auch Läufe, in denen die Zuordnung zur Fährte abriss.

**Verwiesene Gegenstände: automatisch als gefunden erkannt · von der Analyse als «wahrscheinlicher Kontakt» gewertet**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (keine Unterbrechung) | 88 % · 100 % | 38 % · 100 % |
| Bildschirm 20 s gesperrt | 88 % · 100 % | 38 % · 100 % |
| Bildschirm 60 s gesperrt | 88 % · 94 % | 44 % · 100 % |
| Anruf 45 s | 88 % · 100 % | 38 % · 100 % |
| Pause 20 s, Hund läuft weiter | 88 % · 100 % | 38 % · 100 % |
| App beendet, nach 30 s fortgesetzt | 88 % · 50 % | 38 % · 50 % |
| App beendet, nach 5 s fortgesetzt | 88 % · 31 % | 38 % · 44 % |

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
| Basis (keine Unterbrechung) | 1,8 · 0,2 · 0,9 | 3,0 · 0,2 · 0,9 |
| Bildschirm 20 s gesperrt | 1,8 · 0,2 · 0,9 | 3,0 · 0,2 · 0,9 |
| Bildschirm 60 s gesperrt | 1,8 · 0,2 · 0,9 | 3,0 · 0,2 · 0,9 |
| Anruf 45 s | 1,8 · 0,2 · 0,9 | 3,0 · 0,2 · 0,9 |
| Pause 20 s, Hund läuft weiter | 1,7 · 0,2 · 0,9 | 2,8 · 0,2 · 0,9 |
| App beendet, nach 30 s fortgesetzt | 1,8 · 0,2 · 0,9 | 2,8 · 0,2 · 0,9 |
| App beendet, nach 5 s fortgesetzt | 1,8 · 0,2 · 0,9 | 2,9 · 0,2 · 0,9 |

**Punktzahl im Recorder · Punktzahl der Analyse · Abweichungs-Ereignisse je Lauf · Abrisse je Lauf**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (keine Unterbrechung) | 88 · 52 · 0,9 · 0,1 | 76 · 45 · 1,9 · 0,3 |
| Bildschirm 20 s gesperrt | 88 · 52 · 0,9 · 0,1 | 76 · 45 · 1,9 · 0,3 |
| Bildschirm 60 s gesperrt | 88 · 53 · 0,9 · 0,1 | 77 · 45 · 1,9 · 0,3 |
| Anruf 45 s | 88 · 52 · 0,9 · 0,1 | 76 · 45 · 1,9 · 0,3 |
| Pause 20 s, Hund läuft weiter | 87 · 60 · 0,5 · 0,0 | 75 · 49 · 1,6 · 0,1 |
| App beendet, nach 30 s fortgesetzt | 86 · 61 · 0,4 · 0,1 | 73 · 55 · 0,6 · 0,1 |
| App beendet, nach 5 s fortgesetzt | 89 · 61 · 0,4 · 0,0 | 77 · 60 · 0,4 · 0,3 |

**Abgang erkannt · Fährtenende erreicht (≥ 90 % Fortschritt) · Lagefehler der Gegenstände beim Legen (m)**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (keine Unterbrechung) | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 |
| Bildschirm 20 s gesperrt | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 |
| Bildschirm 60 s gesperrt | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 |
| Anruf 45 s | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 |
| Pause 20 s, Hund läuft weiter | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 |
| App beendet, nach 30 s fortgesetzt | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 |
| App beendet, nach 5 s fortgesetzt | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 |

**Führung (T-205):** gemessen am WAHREN Hund. «Rechtzeitig» = der Hund ist bei Sprechbeginn 3–15 m vor dem Punkt, «knapp» = 0–3 m, «zu spät» = schon vorbei, «zu früh» = mehr als 15 m. Die Pfote ist die Hundeposition der App.

**Ansage je Winkel/Gegenstand: rechtzeitig · knapp · zu spät · fehlt · zu früh**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (keine Unterbrechung) | 90 % · 3 % · 0 % · 0 % · 8 % | 82 % · 8 % · 0 % · 8 % · 3 % |
| Bildschirm 20 s gesperrt | 90 % · 3 % · 0 % · 0 % · 8 % | 82 % · 8 % · 0 % · 8 % · 3 % |
| Bildschirm 60 s gesperrt | 90 % · 3 % · 0 % · 0 % · 8 % | 82 % · 8 % · 0 % · 8 % · 3 % |
| Anruf 45 s | 90 % · 3 % · 0 % · 0 % · 8 % | 82 % · 8 % · 0 % · 8 % · 3 % |
| Pause 20 s, Hund läuft weiter | 88 % · 5 % · 0 % · 0 % · 8 % | 77 % · 13 % · 0 % · 8 % · 3 % |
| App beendet, nach 30 s fortgesetzt | 68 % · 5 % · 15 % · 5 % · 8 % | 64 % · 15 % · 10 % · 8 % · 3 % |
| App beendet, nach 5 s fortgesetzt | 85 % · 3 % · 0 % · 5 % · 8 % | 79 % · 8 % · 0 % · 10 % · 3 % |

**Je Lauf: Ansagen abgebrochen · Ansagen verfallen · Punkte doppelt angesagt · Ansage eines Winkels, den es nicht gibt**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (keine Unterbrechung) | 0,6 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |
| Bildschirm 20 s gesperrt | 0,6 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |
| Bildschirm 60 s gesperrt | 0,6 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |
| Anruf 45 s | 0,6 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |
| Pause 20 s, Hund läuft weiter | 0,6 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |
| App beendet, nach 30 s fortgesetzt | 0,6 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |
| App beendet, nach 5 s fortgesetzt | 0,9 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |

**Pfote: mittlerer Fehler (m) · grösster Fehler (m) · Sprünge je Lauf · Zeitanteil auf falschem Schenkel · grösster Versatz (m)**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (keine Unterbrechung) | 2,7 · 16 · 1,3 · 3 % · 16 | 3,7 · 17 · 3,0 · 5 % · 17 |
| Bildschirm 20 s gesperrt | 2,7 · 16 · 1,3 · 3 % · 16 | 3,7 · 17 · 3,0 · 5 % · 17 |
| Bildschirm 60 s gesperrt | 2,8 · 16 · 1,4 · 3 % · 16 | 3,8 · 17 · 3,0 · 5 % · 18 |
| Anruf 45 s | 2,8 · 16 · 1,4 · 3 % · 16 | 3,7 · 17 · 3,0 · 5 % · 17 |
| Pause 20 s, Hund läuft weiter | 3,4 · 23 · 1,8 · 9 % · 23 | 4,0 · 25 · 3,3 · 7 % · 25 |
| App beendet, nach 30 s fortgesetzt | 2,9 · 28 · 1,3 · 2 % · 14 | 3,5 · 48 · 2,9 · 3 % · 17 |
| App beendet, nach 5 s fortgesetzt | 2,8 · 16 · 1,9 · 3 % · 16 | 3,9 · 50 · 3,1 · 5 % · 17 |

**Hund liegt am Gegenstand: Pfote steht > 3 m davor (Zeitanteil) · Ansagen eines Punkts dahinter je Lauf**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (keine Unterbrechung) | 0 % · 0,6 | 2 % · 0,1 |
| Bildschirm 20 s gesperrt | 0 % · 0,6 | 2 % · 0,1 |
| Bildschirm 60 s gesperrt | 2 % · 0,6 | 4 % · 0,1 |
| Anruf 45 s | 2 % · 0,6 | 3 % · 0,1 |
| Pause 20 s, Hund läuft weiter | 0 % · 0,8 | 2 % · 0,1 |
| App beendet, nach 30 s fortgesetzt | 3 % · 0,6 | 2 % · 0,4 |
| App beendet, nach 5 s fortgesetzt | 0 % · 0,5 | 2 % · 0,1 |

**Fährtenende: angesagt · dem Hund fehlten noch (m) · zu früh (> 5 m) · doppelt · Gegenstand am Ende als gefunden geführt**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (keine Unterbrechung) | 100 % · 0,1 · 0 % · 0 % · 100 % | 63 % · 0,1 · 0 % · 0 % · 50 % |
| Bildschirm 20 s gesperrt | 100 % · 0,1 · 0 % · 0 % · 100 % | 63 % · 0,1 · 0 % · 0 % · 50 % |
| Bildschirm 60 s gesperrt | 100 % · 0,1 · 0 % · 0 % · 100 % | 63 % · 0,1 · 0 % · 0 % · 50 % |
| Anruf 45 s | 100 % · 0,1 · 0 % · 0 % · 100 % | 63 % · 0,1 · 0 % · 0 % · 50 % |
| Pause 20 s, Hund läuft weiter | 100 % · 0,1 · 0 % · 0 % · 100 % | 63 % · 0,1 · 0 % · 0 % · 50 % |
| App beendet, nach 30 s fortgesetzt | 100 % · 0,1 · 0 % · 0 % · 100 % | 63 % · 0,1 · 0 % · 0 % · 50 % |
| App beendet, nach 5 s fortgesetzt | 100 % · 0,1 · 0 % · 0 % · 100 % | 63 % · 0,1 · 0 % · 0 % · 50 % |

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
| Basis (nur automatische Erkennung) | 38 % · 100 % | 62 % · 100 % | 60 % · 100 % |
| Gegenstand angetippt, 2 s nach Ankunft beim Hund | 100 % · 100 % | 100 % · 100 % | 100 % · 100 % |
| Gegenstand angetippt, erst nach 7 s | 100 % · 100 % | 100 % · 100 % | 100 % · 100 % |
| Hund verliert die Fährte 1× (10 m seitlich) | 44 % · 100 % | 46 % · 100 % | 60 % · 100 % |
| Hund verliert die Fährte 2× (15 m seitlich) | 44 % · 100 % | 54 % · 100 % | 70 % · 100 % |
| Hund verliert die Fährte kurz (5 m seitlich) | 44 % · 100 % | 54 % · 100 % | 60 % · 100 % |

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
| Basis (nur automatische Erkennung) | 3,0 · 0,2 · 0,9 | 2,1 · 0,8 · 0,7 | 2,4 · 3,3 · 1,9 |
| Gegenstand angetippt, 2 s nach Ankunft beim Hund | 3,0 · 0,2 · 0,9 | 2,1 · 0,8 · 0,7 | 2,4 · 3,3 · 1,9 |
| Gegenstand angetippt, erst nach 7 s | 3,0 · 0,2 · 0,9 | 2,1 · 0,8 · 0,7 | 2,4 · 3,3 · 1,9 |
| Hund verliert die Fährte 1× (10 m seitlich) | 3,4 · 1,7 · 1,7 | 2,7 · 2,0 · 1,5 | 2,8 · 3,9 · 2,3 |
| Hund verliert die Fährte 2× (15 m seitlich) | 4,3 · 3,2 · 3,7 | 3,5 · 3,2 · 3,3 | 3,6 · 4,6 · 4,0 |
| Hund verliert die Fährte kurz (5 m seitlich) | 3,1 · 0,9 · 1,3 | 2,3 · 1,3 · 1,1 | 2,6 · 3,4 · 1,9 |

**Punktzahl im Recorder · Punktzahl der Analyse · Abweichungs-Ereignisse je Lauf · Abrisse je Lauf**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Basis (nur automatische Erkennung) | 76 · 45 · 1,9 · 0,3 | 83 · 56 · 1,0 · 0,0 | 80 · 50 · 1,9 · 0,4 |
| Gegenstand angetippt, 2 s nach Ankunft beim Hund | 89 · 45 · 1,9 · 0,3 | 90 · 56 · 1,0 · 0,0 | 85 · 50 · 1,9 · 0,4 |
| Gegenstand angetippt, erst nach 7 s | 89 · 45 · 1,9 · 0,3 | 90 · 56 · 1,0 · 0,0 | 86 · 50 · 1,9 · 0,4 |
| Hund verliert die Fährte 1× (10 m seitlich) | 70 · 42 · 2,4 · 0,3 | 79 · 51 · 1,4 · 0,3 | 75 · 50 · 1,9 · 0,5 |
| Hund verliert die Fährte 2× (15 m seitlich) | 63 · 41 · 2,6 · 1,6 | 78 · 51 · 1,9 · 0,9 | 71 · 47 · 2,1 · 1,1 |
| Hund verliert die Fährte kurz (5 m seitlich) | 71 · 43 · 2,3 · 0,3 | 80 · 56 · 1,0 · 0,0 | 76 · 48 · 1,8 · 0,4 |

**Abgang erkannt · Fährtenende erreicht (≥ 90 % Fortschritt) · Lagefehler der Gegenstände beim Legen (m)**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Basis (nur automatische Erkennung) | 100 % · 100 % · 2,1 | 100 % · 100 % · 2,1 | 100 % · 100 % · 2,1 |
| Gegenstand angetippt, 2 s nach Ankunft beim Hund | 100 % · 100 % · 2,1 | 100 % · 100 % · 2,1 | 100 % · 100 % · 2,1 |
| Gegenstand angetippt, erst nach 7 s | 100 % · 100 % · 2,1 | 100 % · 100 % · 2,1 | 100 % · 100 % · 2,1 |
| Hund verliert die Fährte 1× (10 m seitlich) | 100 % · 100 % · 2,1 | 100 % · 100 % · 2,1 | 100 % · 100 % · 2,1 |
| Hund verliert die Fährte 2× (15 m seitlich) | 100 % · 100 % · 2,1 | 100 % · 100 % · 2,1 | 100 % · 100 % · 2,1 |
| Hund verliert die Fährte kurz (5 m seitlich) | 100 % · 100 % · 2,1 | 100 % · 100 % · 2,1 | 100 % · 100 % · 2,1 |

**Führung (T-205):** gemessen am WAHREN Hund. «Rechtzeitig» = der Hund ist bei Sprechbeginn 3–15 m vor dem Punkt, «knapp» = 0–3 m, «zu spät» = schon vorbei, «zu früh» = mehr als 15 m. Die Pfote ist die Hundeposition der App.

**Ansage je Winkel/Gegenstand: rechtzeitig · knapp · zu spät · fehlt · zu früh**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Basis (nur automatische Erkennung) | 82 % · 8 % · 0 % · 8 % · 3 % | 90 % · 8 % · 0 % · 3 % · 0 % | 87 % · 3 % · 0 % · 8 % · 3 % |
| Gegenstand angetippt, 2 s nach Ankunft beim Hund | 90 % · 5 % · 0 % · 0 % · 5 % | 92 % · 5 % · 0 % · 3 % · 0 % | 90 % · 0 % · 0 % · 8 % · 3 % |
| Gegenstand angetippt, erst nach 7 s | 90 % · 5 % · 0 % · 3 % · 3 % | 92 % · 5 % · 0 % · 3 % · 0 % | 92 % · 0 % · 0 % · 5 % · 3 % |
| Hund verliert die Fährte 1× (10 m seitlich) | 74 % · 8 % · 0 % · 5 % · 13 % | 79 % · 5 % · 3 % · 5 % · 8 % | 72 % · 3 % · 0 % · 8 % · 18 % |
| Hund verliert die Fährte 2× (15 m seitlich) | 74 % · 5 % · 0 % · 3 % · 18 % | 85 % · 5 % · 0 % · 5 % · 5 % | 74 % · 3 % · 0 % · 8 % · 15 % |
| Hund verliert die Fährte kurz (5 m seitlich) | 74 % · 8 % · 0 % · 5 % · 13 % | 87 % · 5 % · 3 % · 5 % · 0 % | 85 % · 3 % · 0 % · 8 % · 5 % |

**Je Lauf: Ansagen abgebrochen · Ansagen verfallen · Punkte doppelt angesagt · Ansage eines Winkels, den es nicht gibt**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Basis (nur automatische Erkennung) | 0,3 · 0,0 · 0,0 · 0,0 | 0,5 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |
| Gegenstand angetippt, 2 s nach Ankunft beim Hund | 0,0 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 | 0,1 · 0,0 · 0,0 · 0,0 |
| Gegenstand angetippt, erst nach 7 s | 0,1 · 0,0 · 0,0 · 0,0 | 0,5 · 0,0 · 0,0 · 0,0 | 0,1 · 0,0 · 0,0 · 0,0 |
| Hund verliert die Fährte 1× (10 m seitlich) | 0,5 · 0,0 · 0,0 · 0,0 | 0,1 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |
| Hund verliert die Fährte 2× (15 m seitlich) | 0,5 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 | 0,4 · 0,0 · 0,0 · 0,0 |
| Hund verliert die Fährte kurz (5 m seitlich) | 0,4 · 0,0 · 0,0 · 0,0 | 0,4 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |

**Pfote: mittlerer Fehler (m) · grösster Fehler (m) · Sprünge je Lauf · Zeitanteil auf falschem Schenkel · grösster Versatz (m)**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Basis (nur automatische Erkennung) | 3,7 · 17 · 3,0 · 5 % · 17 | 3,9 · 17 · 2,0 · 4 % · 16 | 4,9 · 15 · 1,5 · 1 % · 11 |
| Gegenstand angetippt, 2 s nach Ankunft beim Hund | 3,3 · 17 · 1,6 · 5 % · 17 | 3,6 · 16 · 1,4 · 4 % · 16 | 4,8 · 15 · 1,0 · 1 % · 11 |
| Gegenstand angetippt, erst nach 7 s | 3,2 · 17 · 1,8 · 5 % · 17 | 3,4 · 16 · 1,4 · 4 % · 16 | 4,7 · 15 · 0,9 · 1 % · 11 |
| Hund verliert die Fährte 1× (10 m seitlich) | 5,0 · 19 · 2,9 · 9 % · 20 | 4,4 · 18 · 2,5 · 7 % · 18 | 5,4 · 18 · 1,5 · 1 % · 11 |
| Hund verliert die Fährte 2× (15 m seitlich) | 7,0 · 32 · 2,9 · 9 % · 22 | 5,8 · 22 · 2,5 · 7 % · 24 | 7,0 · 29 · 2,1 · 6 % · 22 |
| Hund verliert die Fährte kurz (5 m seitlich) | 4,4 · 20 · 2,8 · 10 % · 20 | 4,1 · 17 · 2,4 · 7 % · 16 | 4,9 · 15 · 1,5 · 1 % · 11 |

**Hund liegt am Gegenstand: Pfote steht > 3 m davor (Zeitanteil) · Ansagen eines Punkts dahinter je Lauf**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Basis (nur automatische Erkennung) | 2 % · 0,1 | 0 % · 0,3 | 0 % · 0,1 |
| Gegenstand angetippt, 2 s nach Ankunft beim Hund | 10 % · 0,6 | 7 % · 0,6 | 8 % · 0,3 |
| Gegenstand angetippt, erst nach 7 s | 5 % · 0,1 | 0 % · 0,3 | 3 % · 0,3 |
| Hund verliert die Fährte 1× (10 m seitlich) | 2 % · 0,0 | 2 % · 0,3 | 0 % · 0,3 |
| Hund verliert die Fährte 2× (15 m seitlich) | 0 % · 0,1 | 2 % · 0,3 | 0 % · 0,0 |
| Hund verliert die Fährte kurz (5 m seitlich) | 2 % · 0,1 | 2 % · 0,3 | 0 % · 0,3 |

**Fährtenende: angesagt · dem Hund fehlten noch (m) · zu früh (> 5 m) · doppelt · Gegenstand am Ende als gefunden geführt**

| | Ruhiger Sporthund | Eifriger, schneller Hund | Unsicherer, weit pendelnder Hund |
|---|---|---|---|
| Basis (nur automatische Erkennung) | 63 % · 0,1 · 0 % · 0 % · 50 % | 63 % · 0,1 · 0 % · 0 % · 63 % | 75 % · 0,0 · 0 % · 0 % · 63 % |
| Gegenstand angetippt, 2 s nach Ankunft beim Hund | 75 % · 0,1 · 0 % · 0 % · 100 % | 63 % · 0,1 · 0 % · 0 % · 100 % | 88 % · 0,1 · 0 % · 0 % · 88 % |
| Gegenstand angetippt, erst nach 7 s | 63 % · 0,1 · 0 % · 0 % · 100 % | 63 % · 0,1 · 0 % · 0 % · 100 % | 75 % · 0,0 · 0 % · 0 % · 88 % |
| Hund verliert die Fährte 1× (10 m seitlich) | 75 % · 0,1 · 0 % · 0 % · 63 % | 63 % · 0,1 · 0 % · 0 % · 75 % | 38 % · 0,0 · 0 % · 0 % · 50 % |
| Hund verliert die Fährte 2× (15 m seitlich) | 50 % · 0,1 · 0 % · 0 % · 50 % | 63 % · 0,1 · 0 % · 0 % · 63 % | 50 % · 0,1 · 0 % · 0 % · 50 % |
| Hund verliert die Fährte kurz (5 m seitlich) | 75 % · 0,1 · 0 % · 0 % · 63 % | 63 % · 0,1 · 0 % · 0 % · 63 % | 50 % · 0,0 · 0 % · 0 % · 50 % |

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
| Basis (nur automatische Erkennung) | – · 0,3 | – · 0,0 | – · 0,4 |
| Gegenstand angetippt, 2 s nach Ankunft beim Hund | – · 0,3 | – · 0,0 | – · 0,4 |
| Gegenstand angetippt, erst nach 7 s | – · 0,3 | – · 0,0 | – · 0,4 |
| Hund verliert die Fährte 1× (10 m seitlich) | 13 % · 0,1 | 25 % · 0,0 | 25 % · 0,3 |
| Hund verliert die Fährte 2× (15 m seitlich) | 69 % · 0,3 | 44 % · 0,0 | 44 % · 0,3 |
| Hund verliert die Fährte kurz (5 m seitlich) | 13 % · 0,1 | 0 % · 0,0 | 13 % · 0,3 |

## Absuche — Android (ruhiger Sporthund, offenes Feld)

Läufe je Zelle: 8. Die App sieht den Weg des Hundeführers (Handy), nicht die Hundenase. Gegenstands-Quoten ohne den Gegenstand am Fährtenende (eigene Ende-Logik der App, nicht simuliert) und ohne manuelles Antippen. Mittelwerte enthalten auch Läufe, in denen die Zuordnung zur Fährte abriss.

**Verwiesene Gegenstände: automatisch als gefunden erkannt · von der Analyse als «wahrscheinlicher Kontakt» gewertet**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Android, Bildschirm an | 94 % · 100 % | 81 % · 100 % |
| Android, Bildschirm 20 s aus | 94 % · 100 % | 81 % · 100 % |
| Android, Bildschirm 60 s aus | 94 % · 94 % | 63 % · 69 % |
| Android, Hosentasche (Bildschirm an) | 88 % · 100 % | 44 % · 100 % |
| Android, Spitzwinkel-Folge | 94 % · 100 % | 88 % · 100 % |
| Android, Kreuzung | 81 % · 94 % | 63 % · 100 % |

**NICHT verwiesene Gegenstände, die die App trotzdem als gefunden zählt (Anzahl Fälle in Klammern)**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Android, Bildschirm an | – (0) | – (0) |
| Android, Bildschirm 20 s aus | – (0) | – (0) |
| Android, Bildschirm 60 s aus | – (0) | – (0) |
| Android, Hosentasche (Bildschirm an) | – (0) | – (0) |
| Android, Spitzwinkel-Folge | – (0) | – (0) |
| Android, Kreuzung | – (0) | – (0) |

**Mittlere Abweichung (m): von der App gemeldet · wahr beim Hund · wahr beim Hundeführer**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Android, Bildschirm an | 2,0 · 0,3 · 0,8 | 1,9 · 0,2 · 0,9 |
| Android, Bildschirm 20 s aus | 1,9 · 0,3 · 0,8 | 1,8 · 0,2 · 0,9 |
| Android, Bildschirm 60 s aus | 2,0 · 0,3 · 0,8 | 1,8 · 0,2 · 0,9 |
| Android, Hosentasche (Bildschirm an) | 2,1 · 0,2 · 0,9 | 2,7 · 0,2 · 0,9 |
| Android, Spitzwinkel-Folge | 2,0 · 0,3 · 0,7 | 2,1 · 0,3 · 0,8 |
| Android, Kreuzung | 2,0 · 0,2 · 1,1 | 3,3 · 0,3 · 1,1 |

**Punktzahl im Recorder · Punktzahl der Analyse · Abweichungs-Ereignisse je Lauf · Abrisse je Lauf**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Android, Bildschirm an | 90 · 51 · 1,5 · 0,0 | 84 · 59 · 1,0 · 0,0 |
| Android, Bildschirm 20 s aus | 88 · 53 · 1,0 · 0,0 | 83 · 59 · 0,8 · 0,0 |
| Android, Bildschirm 60 s aus | 85 · 53 · 1,0 · 0,0 | 80 · 60 · 0,8 · 0,0 |
| Android, Hosentasche (Bildschirm an) | 90 · 53 · 1,4 · 0,0 | 81 · 51 · 1,6 · 0,0 |
| Android, Spitzwinkel-Folge | 84 · 58 · 0,6 · 0,0 | 81 · 59 · 0,9 · 0,0 |
| Android, Kreuzung | 88 · 49 · 1,4 · 0,1 | 78 · 45 · 2,0 · 0,9 |

**Abgang erkannt · Fährtenende erreicht (≥ 90 % Fortschritt) · Lagefehler der Gegenstände beim Legen (m)**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Android, Bildschirm an | 100 % · 100 % · 2,0 | 100 % · 100 % · 2,3 |
| Android, Bildschirm 20 s aus | 100 % · 100 % · 2,0 | 100 % · 100 % · 2,3 |
| Android, Bildschirm 60 s aus | 100 % · 100 % · 2,0 | 100 % · 100 % · 2,3 |
| Android, Hosentasche (Bildschirm an) | 100 % · 100 % · 2,0 | 100 % · 100 % · 2,3 |
| Android, Spitzwinkel-Folge | 100 % · 100 % · 2,1 | 100 % · 100 % · 2,6 |
| Android, Kreuzung | 100 % · 100 % · 1,9 | 100 % · 100 % · 2,7 |

**Führung (T-205):** gemessen am WAHREN Hund. «Rechtzeitig» = der Hund ist bei Sprechbeginn 3–15 m vor dem Punkt, «knapp» = 0–3 m, «zu spät» = schon vorbei, «zu früh» = mehr als 15 m. Die Pfote ist die Hundeposition der App.

**Ansage je Winkel/Gegenstand: rechtzeitig · knapp · zu spät · fehlt · zu früh**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Android, Bildschirm an | 83 % · 0 % · 3 % · 0 % · 15 % | 87 % · 0 % · 0 % · 3 % · 10 % |
| Android, Bildschirm 20 s aus | 83 % · 0 % · 3 % · 0 % · 15 % | 79 % · 8 % · 0 % · 3 % · 10 % |
| Android, Bildschirm 60 s aus | 48 % · 3 % · 28 % · 8 % · 15 % | 49 % · 0 % · 8 % · 33 % · 10 % |
| Android, Hosentasche (Bildschirm an) | 80 % · 0 % · 3 % · 0 % · 18 % | 82 % · 5 % · 0 % · 8 % · 5 % |
| Android, Spitzwinkel-Folge | 55 % · 11 % · 30 % · 4 % · 0 % | 48 % · 17 % · 30 % · 4 % · 0 % |
| Android, Kreuzung | 89 % · 9 % · 2 % · 0 % · 0 % | 65 % · 13 % · 17 % · 4 % · 2 % |

**Je Lauf: Ansagen abgebrochen · Ansagen verfallen · Punkte doppelt angesagt · Ansage eines Winkels, den es nicht gibt**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Android, Bildschirm an | 0,6 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |
| Android, Bildschirm 20 s aus | 0,6 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |
| Android, Bildschirm 60 s aus | 0,8 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,0 |
| Android, Hosentasche (Bildschirm an) | 0,5 · 0,0 · 0,0 · 0,0 | 0,5 · 0,0 · 0,0 · 0,0 |
| Android, Spitzwinkel-Folge | 0,8 · 0,0 · 0,0 · 0,0 | 0,3 · 0,0 · 0,0 · 0,1 |
| Android, Kreuzung | 0,9 · 0,0 · 0,0 · 0,1 | 0,4 · 0,0 · 0,0 · 0,0 |

**Pfote: mittlerer Fehler (m) · grösster Fehler (m) · Sprünge je Lauf · Zeitanteil auf falschem Schenkel · grösster Versatz (m)**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Android, Bildschirm an | 3,5 · 16 · 1,6 · 5 % · 16 | 3,3 · 19 · 1,9 · 3 % · 19 |
| Android, Bildschirm 20 s aus | 3,3 · 16 · 1,3 · 3 % · 17 | 3,1 · 15 · 1,6 · 1 % · 13 |
| Android, Bildschirm 60 s aus | 3,8 · 19 · 1,1 · 7 % · 17 | 3,5 · 19 · 2,1 · 2 % · 13 |
| Android, Hosentasche (Bildschirm an) | 3,0 · 24 · 1,8 · 4 % · 16 | 4,1 · 31 · 2,6 · 4 % · 22 |
| Android, Spitzwinkel-Folge | 6,3 · 28 · 2,9 · 25 % · 26 | 7,0 · 33 · 3,1 · 28 % · 29 |
| Android, Kreuzung | 3,1 · 17 · 1,9 · 5 % · 18 | 4,7 · 21 · 2,5 · 8 % · 21 |

**Hund liegt am Gegenstand: Pfote steht > 3 m davor (Zeitanteil) · Ansagen eines Punkts dahinter je Lauf**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Android, Bildschirm an | 0 % · 0,3 | 8 % · 0,4 |
| Android, Bildschirm 20 s aus | 0 % · 0,3 | 8 % · 0,3 |
| Android, Bildschirm 60 s aus | 0 % · 0,0 | 0 % · 0,0 |
| Android, Hosentasche (Bildschirm an) | 0 % · 0,3 | 13 % · 0,0 |
| Android, Spitzwinkel-Folge | 0 % · 0,5 | 0 % · 0,6 |
| Android, Kreuzung | 5 % · 0,3 | 3 % · 0,1 |

**Fährtenende: angesagt · dem Hund fehlten noch (m) · zu früh (> 5 m) · doppelt · Gegenstand am Ende als gefunden geführt**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Android, Bildschirm an | 88 % · 0,0 · 0 % · 0 % · 88 % | 88 % · 0,1 · 0 % · 0 % · 63 % |
| Android, Bildschirm 20 s aus | 88 % · 0,0 · 0 % · 0 % · 88 % | 88 % · 0,1 · 0 % · 0 % · 63 % |
| Android, Bildschirm 60 s aus | 88 % · 0,0 · 0 % · 0 % · 88 % | 88 % · 0,1 · 0 % · 0 % · 63 % |
| Android, Hosentasche (Bildschirm an) | 75 % · 0,0 · 0 % · 0 % · 88 % | 63 % · 0,1 · 0 % · 0 % · 63 % |
| Android, Spitzwinkel-Folge | 88 % · 0,0 · 0 % · 0 % · 75 % | 75 % · 0,0 · 0 % · 0 % · 50 % |
| Android, Kreuzung | 100 % · 0,1 · 0 % · 0 % · 88 % | 88 % · 0,0 · 0 % · 0 % · 100 % |
