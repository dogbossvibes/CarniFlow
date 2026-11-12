# Fährten-Simulator — Matrixbericht

224 simulierte Läufe durch die echte Lege- und Such-Verarbeitung der App. Gruppen: suche (96 Läufe, 255 s), suchvarianten (128 Läufe, 397 s).

Alle Zahlen sind Simulationsergebnisse mit angenommenen Fehlermodellen (siehe README.md), keine Feldmessungen.

Statistische Unsicherheit: bei 12 Läufen je Zelle schwankt ein Prozentwert zufällig um rund ±15 Punkte, bei 6 Läufen um ±20. Einzelne Zellen nicht überbewerten, auf Muster über mehrere Zellen achten.

## Absuche — Hundetyp × Gerät/Umgebung (Übungsfährte 120 m, 10-m-Leine)

Läufe je Zelle: 8. Die App sieht den Weg des Hundeführers (Handy), nicht die Hundenase. Gegenstands-Quoten ohne den Gegenstand am Fährtenende (eigene Ende-Logik der App, nicht simuliert) und ohne manuelles Antippen. Mittelwerte enthalten auch Läufe, in denen die Zuordnung zur Fährte abriss.

**Verwiesene Gegenstände: automatisch als gefunden erkannt · von der Analyse als «wahrscheinlicher Kontakt» gewertet**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | 50 % · 100 % | 25 % · 94 % | 25 % · 56 % | 13 % · 25 % |
| Eifriger, schneller Hund | 29 % · 100 % | 31 % · 100 % | 7 % · 50 % | 13 % · 53 % |
| Unsicherer, weit pendelnder Hund | 42 % · 100 % | 50 % · 100 % | 0 % · 92 % | 14 % · 36 % |

**NICHT verwiesene Gegenstände, die die App trotzdem als gefunden zählt (Anzahl Fälle in Klammern)**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | – (0) | – (0) | – (0) | – (0) |
| Eifriger, schneller Hund | 50 % (2) | 0 % (3) | 0 % (2) | 0 % (1) |
| Unsicherer, weit pendelnder Hund | 0 % (4) | 0 % (6) | 0 % (4) | 0 % (2) |

**Mittlere Abweichung (m): von der App gemeldet · wahr beim Hund · wahr beim Hundeführer**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | 2,1 · 0,2 · 0,9 | 4,9 · 0,2 · 0,9 | 8,7 · 0,2 · 0,9 | 17,8 · 0,2 · 0,9 |
| Eifriger, schneller Hund | 2,2 · 0,8 · 0,8 | 2,2 · 0,8 · 0,7 | 12,7 · 1,2 · 0,7 | 16,1 · 0,8 · 0,7 |
| Unsicherer, weit pendelnder Hund | 1,9 · 2,3 · 1,2 | 2,4 · 3,4 · 1,9 | 5,2 · 2,9 · 1,9 | 15,4 · 2,4 · 1,4 |

**Punktzahl im Recorder · Punktzahl der Analyse · Abweichungs-Ereignisse je Lauf · Abrisse je Lauf**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | 80 · 53 · 0,9 · 0,5 | 62 · 45 · 1,9 · 0,4 | 42 · 44 · 2,3 · 0,8 | 25 · 44 · 2,1 · 0,6 |
| Eifriger, schneller Hund | 79 · 61 · 1,0 · 0,4 | 76 · 57 · 1,0 · 0,4 | 44 · 55 · 1,4 · 0,6 | 34 · 55 · 1,6 · 1,1 |
| Unsicherer, weit pendelnder Hund | 78 · 56 · 0,9 · 0,3 | 74 · 49 · 1,8 · 0,4 | 53 · 39 · 2,8 · 1,1 | 31 · 41 · 2,4 · 1,1 |

**Abgang erkannt · Fährtenende erreicht (≥ 90 % Fortschritt) · Lagefehler der Gegenstände beim Legen (m)**

| | Neueres Handy, offenes Feld | Mittelklasse, offenes Feld | Mittelklasse, Feldrand | Mittelklasse, lichter Wald |
|---|---|---|---|---|
| Ruhiger Sporthund | 100 % · 100 % · 1,4 | 100 % · 88 % · 2,1 | 100 % · 38 % · 4,9 | 88 % · 25 % · 5,9 |
| Eifriger, schneller Hund | 100 % · 100 % · 1,4 | 100 % · 88 % · 2,1 | 75 % · 50 % · 4,9 | 88 % · 50 % · 5,9 |
| Unsicherer, weit pendelnder Hund | 100 % · 100 % · 1,4 | 100 % · 100 % · 2,1 | 100 % · 63 % · 4,9 | 88 % · 38 % · 5,9 |

## Absuche — Varianten (ruhiger Sporthund, offenes Feld)

Läufe je Zelle: 8. Die App sieht den Weg des Hundeführers (Handy), nicht die Hundenase. Gegenstands-Quoten ohne den Gegenstand am Fährtenende (eigene Ende-Logik der App, nicht simuliert) und ohne manuelles Antippen. Mittelwerte enthalten auch Läufe, in denen die Zuordnung zur Fährte abriss.

**Verwiesene Gegenstände: automatisch als gefunden erkannt · von der Analyse als «wahrscheinlicher Kontakt» gewertet**

| | Neueres Handy | Mittelklasse |
|---|---|---|
| Basis (10-m-Leine, App auf 10 m) | 50 % · 100 % | 25 % · 94 % |
| 5-m-Leine, App auf 5 m | 75 % · 100 % | 44 % · 100 % |
| 10-m-Leine, App fälschlich auf 5 m | 50 % · 100 % | 25 % · 94 % |
| Kurzer Halt am Gegenstand (3 s) | 56 % · 100 % | 38 % · 94 % |
| Gegenstand beim Legen mit 3 s Halt abgelegt | 69 % · 100 % | 56 % · 94 % |
| Handy bei der Absuche in der Hosentasche | 63 % · 100 % | 38 % · 100 % |
| Absuche ohne Bewegungssensor | 56 % · 19 % | 56 % · 38 % |
| Android, Absuche im Hintergrund gebündelt (30 s) | 75 % · 56 % | 56 % · 50 % |

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
| Basis (10-m-Leine, App auf 10 m) | 80 · 53 · 0,9 · 0,5 | 62 · 45 · 1,9 · 0,4 |
| 5-m-Leine, App auf 5 m | 85 · 70 · 0,1 · 0,0 | 75 · 60 · 1,1 · 0,0 |
| 10-m-Leine, App fälschlich auf 5 m | 80 · 53 · 0,9 · 0,5 | 62 · 45 · 1,9 · 0,4 |
| Kurzer Halt am Gegenstand (3 s) | 77 · 52 · 1,3 · 0,5 | 73 · 48 · 1,8 · 0,4 |
| Gegenstand beim Legen mit 3 s Halt abgelegt | 84 · 54 · 0,9 · 0,3 | 73 · 46 · 1,8 · 0,6 |
| Handy bei der Absuche in der Hosentasche | 82 · 51 · 1,4 · 0,5 | 74 · 45 · 2,0 · 0,5 |
| Absuche ohne Bewegungssensor | 80 · 49 · 1,6 · 0,3 | 66 · 48 · 1,5 · 0,6 |
| Android, Absuche im Hintergrund gebündelt (30 s) | 82 · 48 · 1,5 · 0,6 | 60 · 50 · 0,9 · 0,3 |

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
