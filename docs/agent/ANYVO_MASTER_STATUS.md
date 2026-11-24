# ANYVO Master Status

## Stand nach OTA #269 und #274 (iOS 60 und Android 53/54) – 2026-11-24

Frisch aus EAS gelesen am 24.11.2026. Einzelheiten auf den Release-Karten #269 und #274 (beide «Live –
Nachkontrolle offen», Testweg «Vorher», Gerätetest offen).

**Production**
- **iOS 60** (Runtime `1.0.8-sdk58-v1`): Commit `702667f2ae224a2487f39b53ebcc5f4844244b21`,
  Update Group `daa8cf1f-c1d5-47dd-b334-9a2f0a942d3c`, Branch `release/ios60-abkuerzung-20261124`.
  Vorher: `de61d257` (#269), davor `893c4fd9` (#264).
- **Android 53/54** (Runtime `1.0.8-sdk58-android-v1`): Commit `e0ee6f3d47a3d9f16ce3a0d478a28dea1383bcc7`,
  Update Group `0331d385-8852-4f5e-b93e-60dedd280a3d`, Branch `release/android53-abkuerzung-20261124`.
  Vorher: `423a364a` (#269), davor `17f30ed1` (#264).
- Die nächste OTA muss `702667f2` (iOS) bzw. `e0ee6f3d` (Android) enthalten.

**Inhalt (beide Plattformen)**
- **#269 NEWBIE-Rückgabe:** PR #260 (abgebrochene, nie abgesuchte Fährte gibt das Monatskontingent zurück)
  und PR #266 (Lint-Fix `TrackResumeCta`, uhrzeitunabhängige Identitätstests). Vorher Production-Migration
  `20261123200000_newbie_track_claim_release.sql` angewendet (rein additiv, Funktion `release_newbie_quota`,
  SECURITY DEFINER, Rechte nur postgres/authenticated/service_role).
- **#274 Abkürzung:** PR #268 (T-222, Taste «Abgekürzt» während der Absuche, «Abkürzung gemeldet · bei X m»
  unter Details, Kennzeichnung «innerhalb der Messgenauigkeit»). Simulator mit abgespielter GPS-Route geprüft;
  auf Entscheid der Nutzerin ohne vorherigen Gerätetest veröffentlicht.
- Release-Linien bleiben Cherry-Picks auf dem aktiven Production-Stand.

**Auf main, nicht ausgeliefert:** Android weiterhin ohne PR #237, #244, #247, #250, #254, #256, #238, #239,
#241. Native Änderungen PR #196 und #200 nur per Build. Bereits verbrauchte NEWBIE-Buchungen (Kundenfall)
nicht rückwirkend zurückgegeben.

## Stand nach OTA #264 (iOS 60 und Android 53/54) – 2026-11-23

Frisch aus EAS gelesen am 23.11.2026. Einzelheiten auf Release-Karte #264 (Veröffentlicht, Gerätetest der Nutzerin bestanden).

**Production**
- **iOS 60** (Runtime `1.0.8-sdk58-v1`): Commit `893c4fd93c307c14d4ee4a45aae8e41d4b76a184`,
  Update Group `70846bfc-262b-4820-bc3c-0918fbb38861`, Branch `release/ios60-winkelbegriffe-20261123`.
  Vorher: `6280f74e` (#258).
- **Android 53/54** (Runtime `1.0.8-sdk58-android-v1`): Commit `17f30ed1305b4bb63ce5f335615f49c09f5d1fd6`,
  Update Group `c4726aa8-7364-4097-bd27-28f96e3669d4`, Branch `release/android53-winkelbegriffe-20261123`.
  Vorher: `12a9baf7` (#255).
- Die nächste OTA muss `893c4fd9` (iOS) bzw. `17f30ed1` (Android) enthalten.

**Inhalt #264 (beide Plattformen):** T-219 (PR #261, Richtung in der Ansage für OW/GW/BW/Abriss, keine
Spitz-Auswahl bei OW/GW/BW), PR #263 (Lint-Fix SpecialAnglePicker), T-220 (PR #262, alte spitze OW/GW/BW mit
«spitz» und Richtung). Release-Linien bleiben Cherry-Picks auf dem aktiven Production-Stand.

**Auf main, nicht ausgeliefert:** NEWBIE-Rückgabe (PR #260; Migration `release_newbie_quota` nur auf Staging,
Production-Migration und OTA brauchen Freigabe, Testweg «Vorher»). Android weiterhin ohne PR #237, #244, #247,
#250, #254, #256, #238, #239, #241. Native Änderungen PR #196 und #200 nur per Build.

## Stand nach OTA #255 und #258 (iOS 60) – 2026-11-23

Frisch aus EAS gelesen am 23.11.2026. Einzelheiten auf den Release-Karten #255 und #258.

**Production**
- **iOS 60** (Runtime `1.0.8-sdk58-v1`): Commit `6280f74e4bcc201b8bb08eb94fe0854bbacd3bae`,
  Update Group `461d502c-3559-4e43-bcdc-ad4a38aeeb8c`, Branch `release/ios60-rueckgaengig2-20261123`,
  Karte #258 (Veröffentlicht, Gerätetest der Nutzerin bestanden). Vorher: `e45defc0` (#255).
- **Android 53/54** (Runtime `1.0.8-sdk58-android-v1`): Commit
  `12a9baf7ae5d034339d18e6473dd8d441a1c53a8`, Update Group `ff93f5c5-cfb5-4d25-a742-a1dc97375150`,
  Karte #255. Vorher: `aa3e0546` (#251).
- Die nächste OTA muss `6280f74e` (iOS) bzw. `12a9baf7` (Android) enthalten.

**Inhalt**
- **#255 (iOS 60 + Android):** Regenmodus beim Fährte-Legen (PR #246, #253).
- **#258 (nur iOS 60):** «Erledigt · Rückgängig» statt Rückfrage (PR #237, #244, #247, #250, #254;
  vierte unabhängige Review PASS) und Fährten-Darstellung (PR #256: Suchspur gleich breit wie die
  gelegte Linie, Journal ohne Laufband/Blinken, leuchtende Ecke in der Absuche statt Kreis und Kürzel,
  Fährtenfarbe in der Absuche wieder sichtbar). OTA-Abdeckung mit Ausnahmen aus PR #248 und #257.
- Android hat #258 nicht. Release-Linien bleiben Cherry-Picks; OTA von `main` weiter STOP bis zum
  Beleg des Starts ohne natives Google-Modul (PR #196).

## Stand nach OTA #249 (iOS 60) und #251 (Android) – 2026-11-23

Frisch aus EAS gelesen am 23.11.2026. Einzelheiten auf den Release-Karten #249 und #251.

**Production**
- **iOS 60** (Runtime `1.0.8-sdk58-v1`): Commit `0bc41835fd0445d6f8c92fe661eeb14a9cdb035e`,
  Update Group `1e8106d6-2757-47bc-adf5-4f0ba974827c`, Branch
  `release/ios60-ohne-rueckgaengig-20261123`, Karte #249 (Veröffentlicht). Vorher: `1b3fd491` (#233).
- **Android 53/54** (Runtime `1.0.8-sdk58-android-v1`): Commit
  `aa3e0546392814f9cb8f05be217a11e1b5b870f6`, Update Group
  `90594e6e-1ba5-43ce-81c2-b45d0bf2a64c`, Branch `release/android53-nachzug-20261123`,
  Karte #251 (Live – Nachkontrolle offen). Vorher: `03ca16d1` (#216).
- Die nächste OTA muss `0bc41835` (iOS) bzw. `aa3e0546` (Android) enthalten.

**Inhalt**
- **#249 (nur iOS):** PR #238 (Schnellmenü), #239 (Tab-Tipp, Haptik), #241 (Mint `#00FFCC`), #242
  (Suchspur als Laufband statt Aufbau), #243 (Journal ohne rote Ecken), #245 (auf iOS ohne Wirkung).
  Cherry-Picks; Import-Zeile in `app/(tabs)/home.tsx` von Hand zusammengeführt;
  `features/tracking/native/searchKeepalive.ts` aus #241 weggelassen (gibt es auf der iOS-Linie nicht).
  Dieser Stand ist deshalb nicht zeilengleich mit `main`.
- **#251 (nur Android):** Nachzug von PR #219, #222, #227, #228, #231, #232, #242, #243, dazu #245
  (Android: Suchspur über der grauen Linie per `RUN_TRACE_Z`, Strichmuster mit Pixeldichte).
  Ohne Gerätetest (kein Android-Gerät; Emulator zeigt keine Karte). Freigabe der Nutzerin nach
  Abnahme von #249 auf dem iPhone.

**Bewusst nicht ausgeliefert: «Erledigt · Rückgängig»** (PR #237, #244, #247 auf `main`)
- Zweimal bei der unabhängigen Review durchgefallen: erst B1–B3 (Medien beim falschen Hund,
  Rückgängig während Speichern, Verlust beim Beenden), dann B4 (Sprachnotiz während Aufnahme).
  #244 und #247 sollen das beheben; die Korrektur aus #247 ist noch nicht unabhängig geprüft.
- Vor einer OTA oder einem Build mit diesen PRs: neue unabhängige Review.
- PR #250 (`fa7dcc5e`, Medien-Upload bei Hundewechsel, vorbestehender Fehler) liegt auf `main`,
  in keiner OTA, vom MASTER nicht durchgesehen.

**OTA-Abdeckung:** drei Meldungen als begründete Ausnahme eingetragen (PR #248, Entscheid der
Nutzerin): Trainingskarten deckend (4.11., 10.11.) und ohne rote Ecken (11.11.). Korrekturen im
Code weiter wirksam, Zeilen nur weiterbearbeitet (#238) bzw. verschoben (#243).

**Offen**
- PR #246 Regenmodus (Fährte legen): offen, Simulator-Test der Aufgaben-Sitzung läuft. Fährtenbereich,
  daher vor einer OTA am Gerät oder im Simulator prüfen. Vorschlag MASTER: versteckt im Testmodus ausliefern.
- Geräteprüfung: #251 (nur auf echtem Android-Gerät möglich), #216 auf Android, #197 und ältere Karten.

## Stand nach Geräteabnahme #204, #207, #217, #220 – 2026-11-23

Production unverändert, frisch aus EAS gelesen am 23.11.2026: iOS 60 `1b3fd491`
(Group `c4a59ad6-…`, Karte #233), Android 53/54 `03ca16d1` (#216). Keine neue OTA.

**Geräteabnahme durch die Nutzerin, Karten auf «Veröffentlicht»**
- **#220** Testmodus-Mitschrift (iOS 60) und **#217** Absuche-Beschriftungen (iOS 60): «passt».
- **#207** Zoom-Stufen und **#204** Abstand je Hund, Hundebereich, Dokument speichern: «passt».
  Beide Karten gelten für iOS 60 und Android 53. Abgenommen ist der iPhone-Teil; die Nutzerin
  hat kein Android-Gerät, der Android-Teil ist auf keinem echten Gerät geprüft.
- Zu allen vier liegen dem MASTER keine Bilder vor; die Einzelpunkte wurden nicht einzeln
  rückgemeldet. Der Vermerk steht jeweils als Kommentar auf der Karte.

**Android-Emulator-Test zu #207** (Samsung_Galaxy_S23, Entwicklungs-Build, JS-Stand `03ca16d1`, Staging)
- Bestätigt: Zoom-Knopf der Absuche schaltet normal → nah → weit → normal; die Stufe bleibt
  nach erneutem Öffnen gemerkt.
- Nicht prüfbar: Kartenbild, Zoom-Wirkung, Satellitenbild. Die Google-Karte bleibt im
  Entwicklungs-Build leer (Maps-Schlüssel für die Signatur dieses Builds nicht freigeschaltet).
- Der Emulator taugt nicht für GPS-Verhalten: Eine gesendete Strecke mit scharfem 90°-Winkel kam
  geglättet und verzögert an (Winkel über etwa 24 s verschmiert, seitliches Schwanken rund 1 m),
  die Erkennung meldete 0 Winkel. Mit exakten Positionen erkennt die Lege-Logik des
  Android-Stands denselben Winkel im Fährten-Simulator in 16 von 16 Varianten. Das native
  Android-Modul (`modules/anyvo-precision-location`) reicht die System-Positionen unverändert
  weiter; die Glättung stammt damit sehr wahrscheinlich vom Emulator. Auf einem echten
  Android-Gerät nicht geprüft.
- Im Staging-Testkonto ist womöglich noch eine Emulator-Testfährte aktiv (nur Testdaten).

**Auf `main`, in keiner OTA** (aus dem Ideen-Chat der Nutzerin, je eigene Aufgaben-Sitzung)
- PR #237 (`2985a1cf`): «Erledigt · Rückgängig» statt Rückfrage bei sechs gefahrlosen Aktionen.
- PR #238 (`8589d070`): einheitliches Schnellmenü bei langem Druck (Einheit, Hund, Fährte).
- Offen: PR #239 (Tab nochmals antippen scrollt nach oben, spürbare Rückmeldung); Konflikt mit
  #237 wird von der Aufgaben-Sitzung gelöst.
- Vom MASTER nicht durchgesehen. Für iOS/Android nur als Cherry-Pick auslieferbar; vor einer OTA
  ansehen und Freigabe der Nutzerin für die konkrete Charge einholen.

**Geräteprüfung weiter offen**
- #216 auf Android, #197 und die älteren Karten (#190, #187, #186, #180, #176, #163, #165, #167, #168).

## Stand nach Geräteabnahme #224, #229, #233 – 2026-11-22 (spät)

Production unverändert gegenüber dem Abschnitt «nach OTA #233» darunter: iOS 60 `1b3fd491`
(Group `c4a59ad6-…`, Karte #233), Android 53/54 `03ca16d1` (#216). Keine neue OTA.

**Geräteabnahme durch die Nutzerin (iPhone, iOS 60), Karten auf «Veröffentlicht»**
- **#224** Absuche-Linie dynamisch: «passt».
- **#229** gelegte Linie durch die Winkelpunkte: «passt», dazu Bildschirmfoto der Fährte vom 22.11.
- **#233** Suchspur hell, gleich breit, mit Aufbau: «passt».
- Zu #224 und #233 liegen dem MASTER keine Bilder vor; die Einzelpunkte der Karten wurden nicht
  einzeln rückgemeldet. Der Vermerk steht jeweils als Kommentar auf der Karte.

**Simulator-Studie zur Glättung der gelegten Linie (PR #235, Testcode, auf `main` `fd7e1ba3`)**
- Ergebnis: `LINE_GATE` bleibt unverändert. Weniger Glättung zieht die Linie zur Winkelmarke
  (0,72 m → 0,33 m), kaum zum wahren Winkel (3,11 m → 2,94 m), und verlängert die gespeicherte
  Linie (lichter Wald +53 % → +69 % gegenüber der wahren Länge). 216 Läufe je Variante,
  GPS-Annahmen aus der Literatur.
- Der frühere Vorbefund des MASTER (Abschnitt #233) mass nur diesen scheinbaren Gewinn.
- Befund, nicht geändert: `detectCorner()` läuft nur, wenn ein Linienpunkt gesetzt wird
  (`features/tracking/engine/layProcessingSession.ts`); ein kurz sichtbarer Winkel kann je nach
  Zeitpunkt der Linienpunkte verpasst werden.
- Befund, nicht geändert: Die gespeicherte Linie ist in der Simulation bei schlechtem GPS deutlich
  länger als die wahre Fährte (Feldrand +28 %, lichter Wald +53 %).
- PR #235 wurde gemergt, bevor der Prüflauf «ANYVO Quality Gate» fertig war (nur Testcode).

**Geräteprüfung weiter offen**
- #220 (Mitschrift im Testmodus), #217, #216 auf Android, #207, #204, #197 und die älteren Karten.

## Stand iOS 60 nach OTA #233 – 2026-11-22 (Nacht)

Frisch aus EAS gelesen am 22.11.2026. Einzelheiten stehen auf der Release-Karte #233.
Android ist unverändert (Abschnitt «nach OTA #216 und #217» weiter unten).

**Production**
- **iOS 60** (Runtime `1.0.8-sdk58-v1`): Commit `1b3fd4915c8199d0a097057f40e829a318d5f3e0`,
  Update Group `c4a59ad6-9edd-43a7-85c7-fa764a0b59f2`, Branch
  `release/ios60-suchspur-aufbau-20261122`, Karte #233. Vorher: `92527528` (#229).
- **Android 53/54**: unverändert `03ca16d1` (#216).
- Die nächste OTA muss `1b3fd491` (iOS) bzw. `03ca16d1` (Android) enthalten.

**Inhalt**
- **#233 (nur iOS):** PR #231 und PR #232 als Cherry-Picks. In der Vergleichsansicht der Fährte
  (Auswertung, Karte im Detail und im Vollbild) ist die gelaufene Absuche hell auf dunkel, gleich
  breit wie die gelegte Linie, und baut sich von Start bis Ende auf
  (`features/tracking/components/TrackComparisonLines.tsx`). Der Aufbau hält an, solange die Karte
  nicht sichtbar ist, und steht bei «Bewegung reduzieren» still. Reine Anzeige.
- Anlass: Die Suchspur war fest blau und 2 pt breit; bei blauer Fährtenfarbe eines Hundes war sie
  nicht von der gelegten Linie zu trennen. Die Nutzerin wählte aus Mockups die Variante «Aufbau».
- Bewusst unverändert: laufende Absuche, Replay-Bildschirm und PDF-Bericht (dort bleibt Blau).
- Android hat weder PR #219 noch PR #222, #227, #228, #231, #232.

**Bekannt zu #233** (nur Optik, am Gerät ungeprüft)
- Flackern und Akkuverbrauch des Aufbaus sind auf einem echten iPhone nicht gemessen
  (Simulator: kein Flackern gesehen).
- Beim Öffnen steht die helle Linie kurz in voller Länge; beim Schliessen des Vollbilds laufen
  kurz zwei Timer.
- Auf iOS (Apple Maps) wirkt `zIndex` bei Linien nicht; die Reihenfolge ist die Einfüge-Reihenfolge.

**In Arbeit (Aufgaben-Sitzung, kein Ergebnis)**
- Glättung der gelegten Linie im Simulator prüfen. Vorbefund des MASTER an zwei Feldaufnahmen:
  Nicht die Punktzahl, sondern die Glättung (`LINE_GATE.emaAlpha`) rundet die Ecken der
  gespeicherten Linie (Abstand Winkelpunkt zur Linie 0,85 m und 1,09 m; mit weniger Glättung 0,13 m
  und 0,27 m, dafür längere, unruhigere Linie). Greift in Aufzeichnung und Winkelerkennung ein;
  Entscheid erst nach der Matrix.

**Geräteprüfung**
- Offen: #233 (Suchspur hell und gleich breit, Aufbau ruhig, Vollbild, Rückkehr vom Replay).
  Karte auf «Live – Nachkontrolle offen».
- #229: Die Nutzerin hat am 22.11. ein Bildschirmfoto geschickt, die Ecken liegen an den
  Winkelmarken. Karte noch nicht auf «Veröffentlicht» gesetzt (keine ausdrückliche Abnahme).
- Weiter offen: #224, #220.

## Stand iOS 60 nach OTA #229 – 2026-11-22 (Abend)

Frisch aus EAS gelesen am 22.11.2026. Einzelheiten stehen auf der Release-Karte #229.
Android ist unverändert (Abschnitt «nach OTA #216 und #217» weiter unten).

**Production**
- **iOS 60** (Runtime `1.0.8-sdk58-v1`): Commit `92527528d6be89c9f2b6a09c4ea94c01e7214472`,
  Update Group `76b76398-d634-49b2-a939-922894671aa4`, Branch
  `release/ios60-ecken-anzeige-20261122`, Karte #229. Vorher: `e9b79f43` (#224).
- **Android 53/54**: unverändert `03ca16d1` (#216).
- Die nächste OTA muss `92527528` (iOS) bzw. `03ca16d1` (Android) enthalten.

**Inhalt**
- **#229 (nur iOS):** PR #227 und PR #228 als Cherry-Picks. Die gelegte Linie läuft in der Anzeige
  durch die erkannten Winkelpunkte (`features/tracking/utils/cornerDisplayLine.ts`): beim Legen,
  in der Absuche (auch Band, abgesuchtes und nächstes Stück), im Detail, im Vergleich und im Replay.
  Nur geometrische Winkel (links, rechts, spitz) gelten als Ecke, Grenze 2 m. Reine Anzeige;
  gespeicherte Punkte, Messung, Fortschritt und Wertung unverändert.
- Anlass: Feldaufnahmen vom 21.11. und 22.11. Die gespeicherte Linie ist ausgedünnt (etwa ein
  Punkt je 2 m) und schnitt Ecken ab; die Winkelmarke lag rund 1,1 m neben dem Knick.
- Android hat weder PR #219 noch PR #222, #227, #228.

**Bekannte Grenzen von #229** (nur Optik, am Gerät ungeprüft)
- Die Absuche misst weiter an der gespeicherten Linie; an einer Ecke kann die gezeichnete Linie
  bis etwa 1 m davon abweichen.
- Schenkel näher als 2 m oder sich kreuzende Fährten: Eine Marke kann den falschen Schenkel verbiegen.
- Nahe am Fährtenende kann ein Linienpunkt selten bis etwa 3,5 m wandern.
- Rechenzeit auf dem Gerät nicht gemessen. Simulator: App mit PR #227 lief fehlerfrei, sichtbare
  Wirkung dort nicht belegt (Staging-Fährte ohne Versatz).

**Befund aus der Testfährte vom 22.11.** (27 m, Schenkel 3 bis 7 m; nur Analyse)
- Alle drei Winkel richtig erkannt. Absuche im Mittel 0,5 m, höchstens 1,2 m neben der gelegten Linie.
- Offen, nicht geändert: Die blaue Suchspur hält während der Absuche nur etwa alle 3 s einen
  Punkt (10 Punkte auf 27 m) und schneidet Ecken ab. Dichter aufzeichnen greift in die
  Aufzeichnung der Absuche ein (Simulator- und Feldprüfung nötig).
- Nicht untersucht: Die App führt zwei Längen derselben Fährte (Linie 27,0 m, Zähler 21,3 m).

**Geräteprüfung**
- Offen: #229 (App startet; Fährte vom 22.11. zeigt Ecken an den Winkelmarken; Legen flüssig;
  Absuche; alte Fährte unverändert). Karte auf «Live – Nachkontrolle offen».
- Weiter offen: #224, #220.

## Stand iOS 60 nach OTA #224 – 2026-11-22

Frisch aus EAS gelesen am 22.11.2026. Einzelheiten stehen auf der Release-Karte #224.
Android ist unverändert (Abschnitt «nach OTA #216 und #217» darunter).

**Production**
- **iOS 60** (Runtime `1.0.8-sdk58-v1`): Commit `e9b79f43766881a98de7949b4726cacd1a0f74e0`,
  Update Group `4d60eefa-8385-4107-875d-ed12afd5880c`, Branch
  `release/ios60-absuche-linie-dynamisch-20261121`, Karte #224. Vorher: `3612a990` (#220).
- **Android 53/54**: unverändert `03ca16d1` (#216).
- Die nächste OTA muss `e9b79f43` (iOS) bzw. `03ca16d1` (Android) enthalten.

**Inhalt**
- **#224 (nur iOS):** PR #222 als Cherry-Pick. Die Absuche-Karte zeigt die gelegte Linie
  abhängig vom Fortschritt (abgesucht blass, Stück bis zum nächsten Ereignis betont); die Pfote
  als Punkt erscheint nur noch in der Blindsuche. Reine Anzeige; keine Änderung an Aufzeichnung,
  Erkennung, Bewertung oder gespeicherten Daten.
- Von der Nutzerin ohne vorherige Geräte- oder Simulatoransicht freigegeben (Testweg Nachher).
- Android hat weder PR #219 noch PR #222.

**Bekannte optische Risiken von #224** (aus der Review, am Bildschirm ungeprüft)
- Apple Maps hält die Reihenfolge von Linien nicht zuverlässig ein: Die graue Linie kann die
  blaue Suchspur zeitweise verdecken.
- Im abgesuchten Teil bleibt von farbigen Teilstrecken nur ein schmaler Rand sichtbar.

**Fährten-Simulator** (Testcode, keine OTA)
- PR #225 (`16f401e9` auf `main`): Wiedergabe von Feldaufnahmen. Ein QA-Export läuft durch die
  echte Lege-Verarbeitung, mit und ohne Bewegungssensor und mit Zusatzrauschen
  (`FAEHRTEN_FELD=<export.json>`, siehe README im Sim-Ordner).
- Testfährte vom 21.11. wiedergegeben: mit Sensor 3 von 3 Rechtswinkeln wie im Feld, ohne
  Sensor 2 (der dritte fehlt). Mit Zusatzrauschen bricht die Erkennung rasch ein; die Fährte ist
  mit knapp 19 m und Schenkeln von 4 bis 7 m sehr kurz, die Zahlen zeigen die Reserve, keine Feldquote.

**Geräteprüfung**
- Offen: #224 (App startet; Absuche mit 1 m ohne Pfote; Linie grau/betont; blaue Suchspur
  sichtbar; 5 m und 10 m; Blindsuche unverändert). Karte auf «Live – Nachkontrolle offen».
- Weiter offen: #220.

## Stand iOS 60 nach OTA #220 – 2026-11-21 (Abend)

Frisch aus EAS gelesen am 21.11.2026. Einzelheiten stehen auf der Release-Karte #220.
Android ist unverändert (Abschnitt «nach OTA #216 und #217» darunter).

**Production**
- **iOS 60** (Runtime `1.0.8-sdk58-v1`): Commit `3612a99079e278a023f5b4ff8222a43e4704daba`,
  Update Group `bf42efe0-de53-425a-a9f0-4ddae42f36eb`, Branch
  `release/ios60-qa-mitschrift-20261121`, Karte #220. Vorher: `666179ff` (#217).
- **Android 53/54**: unverändert `03ca16d1` (#216).
- Die nächste OTA muss `3612a990` (iOS) bzw. `03ca16d1` (Android) enthalten.

**Inhalt**
- **#220 (nur iOS):** PR #219 als Cherry-Pick. Die Zeile «AUTO …» der Kandidaten-Mitschrift in
  der Fährten-Diagnose (Testmodus) zeigt die Motion-Evidenz, mit der die Winkelerkennung
  gerechnet hat, auch aus einem benachbarten Zeitfenster. Rein lesend; keine Änderung an
  Erkennung, Bewertung, Markern oder gespeicherten Daten. Für Kundinnen nichts Sichtbares.
- Auf `main` ist PR #219 gemergt; Android hat die Änderung noch nicht (nur Testmodus).

**Auf `main`, in keiner OTA**
- PR #222 (`8776b69e`): Absuche-Karte zeigt die gelegte Linie abhängig vom Fortschritt
  (abgesucht blass, Stück bis zum nächsten Ereignis betont, Pfote als Punkt nur noch in der
  Blindsuche). Reine Anzeige. Nicht auf Gerät oder Simulator angesehen; vor einer OTA ansehen
  (Testweg Vorher). Für iOS/Android nur als Cherry-Pick möglich, solange `main` gestoppt ist.

**Befund aus der Testfährte vom 21.11.** (Start, drei Rechtswinkel, Ende; nur Analyse)
- Erkennung richtig: drei Rechtswinkel, kein falscher vierter. Der dritte Winkel wurde nur dank
  Motion-Zuschlag angenommen (0,565 + 0,12; Schwelle 0,62).
- Offen, nicht geändert: Winkelmarken sitzen bis 1,2 m neben der gespeicherten Linie. Die Marke
  nimmt den Detektor-Punkt, die ausgedünnte Linie schneidet die Ecke ab. Entscheid der Nutzerin
  ausstehend (Linie behält Eckpunkt oder Marke nur in der Anzeige auf die Linie), nach weiteren
  Testfährten.

**Geräteprüfung**
- Offen: #220 (App startet, Mitschrift im Testmodus). Karte auf «Live – Nachkontrolle offen».

## Stand iOS 60 und Android Build 53/54 nach OTA #216 und #217 – 2026-11-21

Frisch aus EAS gelesen am 21.11.2026. Einzelheiten stehen auf den Release-Karten #216 und #217.

**Production**
- **iOS 60** (Runtime `1.0.8-sdk58-v1`): Commit `666179ffc99be6c2a500e002e00ea679a330c04d`,
  Update Group `ff2fad44-2410-46a4-bd61-ec58e2adbf31`, Branch
  `release/ios60-absuche-beschriftungen-20261121`, Karte #217. Vorher: `49572cf0` (#216).
- **Android 53/54** (Runtime `1.0.8-sdk58-android-v1`): Commit
  `03ca16d14bdd83d485252e78c2893a8c52ca1f59`, Update Group
  `0e7866a6-327c-4e9c-a0d3-b1171c88f479`, Branch `release/android53-pr215-20261121`, Karte #216.
  Vorher: `dc8f756f` (#207).
- Die nächste OTA muss `666179ff` (iOS) bzw. `03ca16d1` (Android) enthalten.

**Inhalt**
- **#216 (iOS + Android):** PR #215, Startprüfung für OTAs korrigiert. Ursache des fehlenden
  Hinweises «ANYVO wird aktualisiert …»: expo-updates arbeitet seine Aufgaben nacheinander ab;
  die eigene Nachfrage beim Start wartete hinter dem Hintergrund-Download und lief in die
  Zeitgrenze von 1,5 s. Neu schaut die App dem Start-Download zu (`lib/otaStartCheck.ts`,
  `components/OtaStartGate.tsx`). Schutz bei laufender oder unterbrochener Fährte unverändert.
- **#217 (nur iOS):** Beschriftungen der Absuche übersetzbar (`94d9f5e1`) und GPS-Qualitätswort
  verkleinern statt abschneiden (`ce045f3c`). Auf Android seit Build 52/53 schon enthalten.

**Release-Linien weichen von `main` ab**
- #216 und #217 sind Cherry-Picks auf die Live-Commits, kein Merge von `main`. Auf `main`, aber
  in keiner OTA: PR #196 (nativer Google-Login), PR #200 (Startbild, `app.json`), PR #205,
  PR #208 (Release-Prüfskripte), Doku. iOS-Linie ohne T-209 (dort ohne Wirkung).
- Unverändert: STOP für OTAs von `main`, bis belegt ist, dass die App ohne das native
  Google-Modul startet und der Login unverändert läuft.

**Geräteprüfung**
- iPhone, 21.11.: Aktualisierungs-Bildschirm erscheint beim ersten Öffnen nach #217 (Nutzerin
  bestätigt; vermerkt auf #216, #217, #186).
- Offen: Aktualisierungs-Bildschirm auf Android (erst bei der nächsten Android-OTA sichtbar);
  #217 Beschriftungen in der laufenden Absuche ansehen. Alle Karten bleiben auf
  «Live – Nachkontrolle offen».

## Android-Linie auf main nachgezogen – 2026-11-20 (Nacht)

Kein neuer Production-Stand: Es gilt weiter der Abschnitt «nach OTA #207» darunter (iOS
`bf23cae0`, Android `dc8f756f`). Dieser Abschnitt hält fest, was sich auf `main` geändert hat.

**Befund** (Bericht `docs/agent/tasks/ota-abdeckung-main-20261120.md`, PR #210)
- Die OTA-Abdeckungsprüfung meldete für `main` 16 frühere OTAs als fehlend. Keine davon ist ein
  echter Verlust: gleiche Dateien wie live, nur später weiterentwickelt, oder Dateien ausserhalb
  der App (`.maestro/`, Skript-Einträge). Fehlalarm der Methode (Vergleich Zeile für Zeile).
- Echte Lücke ausserhalb der Meldungen: Drei Änderungen kamen mit dem nativen Android-Build
  52/53 und fehlten auf `main`. Die Prüfung sieht per Build gelieferte Änderungen nicht.

**Nachgezogen auf `main`** (Stand `029ff961`)
- PR #211: `3612e810` T-209 (Android-Absuche bei ausgeschaltetem Bildschirm wach halten),
  `8e55b3a2` (Beschriftungen der Absuche übersetzbar, `eas.json` `distribution: store`),
  `ec897e6b` (GPS-Qualitätswort verkleinern statt abschneiden).
- PR #212: zwei `eslint-disable`-Kommentarzeilen aus der Release-Linie.
- PR #213 (MASTER) enthielt dieselben drei Cherry-Picks wie #211 und blieb nach dessen Merge
  ohne zusätzliche Wirkung (leerer Unterschied). Doppelte Arbeit, kein Schaden.
- Gegenprobe am 20.11.: In den App-Ordnern hat Android-Production `dc8f756f` nichts mehr, was
  `main` fehlt; `main` ist nur neuer (nativer Google-Login, PR #196).

**Offen vor dem nächsten nativen Build** (keine Build-Freigabe, Nutzerin wartet)
- `app.json`: `versionCode` auf `main` 51, Android-Linie 53, Build 54 existiert. Wert für den
  nächsten Build festlegen.
- Checkliste Issue #195 (Google Cloud, Supabase-Provider, EAS-Variablen).
- Abdeckungsprüfung: Verbesserung gegen die Fehlalarme ist in Arbeit (Aufgaben-Sitzung, PR
  folgt). Bis dahin die 16 Meldungen für `main` anhand des Berichts einordnen, nicht pauschal
  ausnehmen.
- Per Build gelieferte Änderungen künftig sofort auch nach `main` bringen.

**Hinweis für die nächste OTA**
- `main` enthält jetzt in `app/track/run.tsx` die übersetzbaren Beschriftungen und das
  verkleinerte GPS-Wort auch für iOS (bisher nur Android live). Vor einer iOS-OTA ansehen.
- Unverändert: STOP für OTAs mit PR #196, bis belegt ist, dass die App ohne das native
  Google-Modul startet und der Login unverändert läuft.

## Stand iOS 60 und Android Build 53/54 nach OTA #207 – 2026-11-20 (Abend)

Aktueller Production-Stand laut Wrapper- und EAS-Nachkontrolle nach OTA #207, am 20.11. abends
erneut frisch aus EAS gelesen (neueste Group je Runtime: iOS `6e8e1d29`, Android `1afbcbc3`).
Ersetzt die Angaben «Aktiv» in den Abschnitten darunter. Karte #207 steht auf
«Live – Nachkontrolle offen».

**iOS 60** (1.0.8, Runtime `1.0.8-sdk58-v1`)
- **Aktiv:** Source `bf23cae0` (aktive Production `fabff601` plus main `9f69f9cb`), Group
  `6e8e1d29-a748-41bb-b68b-eecbc97da223`. Karte #207.
- **Release-Quelle:** `release/ios60-main-9f69f9cb-20261120`. Jede weitere iOS-60-OTA muss
  `bf23cae0` enthalten.

**Android Build 53/54** (1.0.8, Runtime `1.0.8-sdk58-android-v1`)
- **Aktiv:** Source `dc8f756f` (aktive Production `6c0b6dc0` plus main `9f69f9cb`), Group
  `1afbcbc3-92d5-4836-a8d8-d088cf6bb12e`. Karte #207.
- **Release-Quelle:** `release/android53-main-9f69f9cb-20261120`. Jede weitere OTA auf dieser
  Runtime muss `dc8f756f` enthalten.
- Android 1.0.5 (49) und iOS 57: unverändert.

**OTA-Chargen am 20.11. (Übersicht)**

| Karte | Inhalt | Ziele | Testweg / Board |
|---|---|---|---|
| #197 | Papierkorb in der Dokumentliste einzeln erreichbar (PR #194) | iOS 60 + Android | Nachher, Nachkontrolle offen |
| #204 | Absuche: Abstand je Hund (T-216, PR #201), Hundebereich als Band (T-217, PR #202); Dokument speichern (PR #198) | iOS 60 + Android | Nachher, Nachkontrolle offen |
| #207 | Absuche: Zoom-Stufen, stärkerer Zoom vor Winkel/Gegenstand (T-218, PR #203) | iOS 60 + Android | Nachher, Nachkontrolle offen |

Details, Platform Update IDs und Source-Commits stehen in den Karten.

**Prüfungen zu #207**
- Tests iOS 6914 / Android 6928 bestanden, Typecheck/ESLint/Diff sauber, OTA-Abdeckung
  vollständig, unabhängige Review PASS je Ziel (Recorder, Ansagen, Wertung, Persistenz nicht im
  Diff), Ancestry PASS.
- Quality Gate für `9f69f9cb` von GitHub abgebrochen (direkt folgender Merge), nicht rot; grün
  waren der Lauf auf PR #203 und der Lauf für `47519d41` (derselbe Code plus Doku).
- Nicht geprüft: echte Geräte, laufende Absuche, Android-Karte (Google Maps begrenzt bei Zoom 21).

**main enthält jetzt native Änderungen (wichtig für die nächste OTA)**
- Nach `9f69f9cb` gemergt: PR #200 (Start-Logo Android, `app.json`), PR #196 (nativer
  Google-Login: `app.json`, Abhängigkeiten, Config-Plugin, `services/auth.ts`), PR #205
  (Maestro-Tests), PR #206 (Doku), PR #208 (Release-Prüfskripte).
- PR #196 und #200 wirken erst mit einem neuen nativen Build. Die Nutzerin wartet mit dem Build
  (Aussage 2026-11-20); keine Build-Freigabe. Checkliste vor dem Build: Issue #195.
- Vor jeder weiteren OTA von main auf die Runtimes von iOS 60 und Android 53/54 ausdrücklich
  prüfen, dass die App ohne das native Google-Modul sauber startet und der bisherige Login
  unverändert läuft. Bis das belegt ist: STOP für OTAs, die PR #196 enthalten.

**Release-Ablauf** (PR #208)
- Pflichtprüfungen und Nachweis liegen im Repo: `npm run release:check`,
  `npm run release:receipt`, Ablauf in `docs/agent/RELEASE_CHECKS.md`. Noch keine OTA damit
  veröffentlicht.
- `ota-ledger.json` aufgefrischt (473 Einträge, Stand #207); EAS-Abfragen der
  Abdeckungsprüfung mit Zeitlimit 120 s.

**Offene Punkte**
- Gerätenachkontrolle #207, #204, #197, dazu #190, #187, #186, #180, #176, #163, #165, #167, #168.
- OTA-Abdeckung gegen `main`: am 20.11. 12 frühere OTAs als fehlend gemeldet (Release-Stände
  bestehen die Prüfung). Abgleich läuft als Aufgaben-Sitzung, nur lesend; vor dem nächsten
  nativen Build klären.
- Gesundheitsakte: Gewicht eintragen und speichern auf einem Gerät gegenprüfen (Maestro-Abläufe
  14–17 im Emulator fehlgeschlagen, Ursache nicht abschliessend belegt).
- Offene PRs: keine (Stand 20.11. abends).
- Folgeideen: Bewegungs-Refs beim Aufnahmestart zurücksetzen (#182); `reloadAsync`-Zeitlimit
  (#178); Jest nur einmal laufen lassen, wenn iOS- und Android-Stand gleich sind; Quality Gate
  bei aufeinanderfolgenden Merges nicht abbrechen.
- Build 54 weitergeben, Push prüfen, dann #141 schliessen. Issue #7 (P0, ACTIVE-Abo) offen.

## Stand iOS 60 und Android Build 53/54 nach OTA #197 und #204 – 2026-11-20

Aktueller Production-Stand laut Wrapper- und EAS-Nachkontrolle nach OTA #204, am 20.11. erneut
frisch aus EAS gelesen (neueste Group je Runtime: iOS `64143006`, Android `b48c0505`). Ersetzt die
Angaben «Aktiv» in den Abschnitten darunter. Karten #197 und #204 stehen auf «Live – Nachkontrolle offen».

**iOS 60** (1.0.8, Runtime `1.0.8-sdk58-v1`)
- **Aktiv:** Source `fabff601` (aktive Production `574b56b6` plus main `fa2766af`), Group
  `64143006-db3b-40c2-8959-9b9a1304a31e`. Karte #204.
- **Release-Quelle:** `release/ios60-main-fa2766af-20261120`. Jede weitere iOS-60-OTA muss
  `fabff601` enthalten.

**Android Build 53/54** (1.0.8, Runtime `1.0.8-sdk58-android-v1`)
- **Aktiv:** Source `6c0b6dc0` (aktive Production `ee05929b` plus main `fa2766af`), Group
  `b48c0505-4b16-4491-a2e4-ef29d5a4aa92`. Karte #204.
- **Release-Quelle:** `release/android53-main-fa2766af-20261120`. Jede weitere OTA auf dieser
  Runtime muss `6c0b6dc0` enthalten.
- Android 1.0.5 (49) und iOS 57: unverändert.

**OTA-Chargen am 20.11. (Übersicht)**

| Karte | Inhalt | Ziele | Testweg / Board |
|---|---|---|---|
| #197 | Papierkorb in der Dokumentliste einzeln erreichbar (PR #194) | iOS 60 + Android | Nachher, Nachkontrolle offen |
| #204 | Absuche: Abstand je Hund (T-216, PR #201), Hundebereich als Band (T-217, PR #202); Dokument speichern (PR #198) | iOS 60 + Android | Nachher, Nachkontrolle offen |

Details, Platform Update IDs und Source-Commits stehen in den Karten.

**Prüfungen**
- #197: Tests iOS 6884 / Android 6898 bestanden, Typecheck/ESLint/Diff sauber, OTA-Abdeckung
  vollständig, unabhängige Review PASS je Ziel, Ancestry PASS.
- #204: Quality Gate für `fa2766af` grün; Tests iOS 6909 / Android 6923 bestanden,
  Typecheck/ESLint/Diff sauber, OTA-Abdeckung vollständig, unabhängige Review PASS je Ziel
  (Recorder, Sync und Persistenz der Fährten nicht im Diff), Ancestry PASS.
- Vorher geprüft zu #204: PR #198 Gutfall (Dokument hochladen, wiederfinden, löschen) im
  Android-Emulator auf Staging bestanden; PR #202 Sichtprüfung im iOS-Simulator mit Testdaten.
  Nicht geprüft: echte Geräte, echte laufende Absuche, Fehlerfall von PR #198, iOS-Upload.

**Maestro-UI-Tests** (PR #192, #199; lokal, Staging, ohne Kosten)
- 19 Abläufe, `npm run test:e2e`, Anleitung `docs/agent/MAESTRO.md`.
- PR #193: Production-Stand der Dokument-Leseregel und der Trainingsdoku-Funktionen als
  Migration im Repo; auf Staging angewandt (Freigabe der Nutzerin 2026-11-19). Laut
  Aufgaben-Sitzung auf Staging zusätzlich direkt angeglichen: Testkonto auf ACTIVE, drei
  Quota-Funktionen textgleich mit Production. Production nur gelesen.
- Gesamtläufe am 20.11.: Android 15/19, iOS 15/19. Fehlschläge der Gesundheitsformulare
  (14–17) laut Aufgaben-Sitzung Testumgebung/Speichermangel, nicht abschliessend belegt;
  der App-Diff berührt diese Formulare nicht.
- Lehre: Emulator und Simulator nie von zwei Sitzungen gleichzeitig benutzen.

**Offene Punkte**
- Gerätenachkontrolle #204, #197, dazu #190, #187, #186, #180, #176, #163, #165, #167, #168.
  #186 (Hinweis «ANYVO wird aktualisiert …») lässt sich beim ersten Kaltstart nach #204 prüfen.
- Gesundheitsakte: Gewicht eintragen und speichern auf einem Gerät gegenprüfen (siehe Maestro).
- Offene PRs: #196 (nativer Google-Login, nächstes Build), #200 (Start-Logo Android),
  #203 (T-218, Zoom-Stufen Absuche), #205 (Maestro-Tests).
- Hinweise aus der Review zu #204: gespeicherter Abstand ist nur der zuletzt gewählte; Band auf
  Android (Google Maps) und Kopfzeile auf schmalen Geräten ansehen.
- Folgeideen: Bewegungs-Refs beim Aufnahmestart zurücksetzen (#182); `reloadAsync`-Zeitlimit (#178).
- Build 54 weitergeben, Push prüfen, dann #141 schliessen. Issue #7 (P0, ACTIVE-Abo) offen.
- `ota-ledger.json` vor dem nächsten nativen Build auffrischen.

## Stand iOS 60 und Android Build 53/54 nach OTA #190 – 2026-11-18 (Abend)

Aktueller Production-Stand laut Wrapper- und EAS-Nachkontrolle nach OTA #190, am 18.11. erneut
frisch aus EAS gelesen (neueste Group je Runtime: iOS `eb7308c6`, Android `9a4c1724`). Ersetzt die
Angaben «Aktiv» in den Abschnitten darunter. Karte #190 steht auf «Live – Nachkontrolle offen».

**iOS 60** (1.0.8, Runtime `1.0.8-sdk58-v1`)
- **Aktiv:** Source `8da2418c` (aktive Production `f899b16f` plus main `d88044ad`), Group
  `eb7308c6-2e43-4b78-89c3-46eb89320861`. Karte #190.
- **Release-Quelle:** `release/ios60-main-d88044ad-20261118`. Jede weitere iOS-60-OTA muss
  `8da2418c` enthalten.

**Android Build 53/54** (1.0.8, Runtime `1.0.8-sdk58-android-v1`)
- **Aktiv:** Source `ba6fe4d9` (aktive Production `d62a842c` plus main `d88044ad`), Group
  `9a4c1724-77d3-4f8e-8248-f38626a235cc`. Karte #190.
- **Release-Quelle:** `release/android53-main-d88044ad-20261118`. Jede weitere OTA auf dieser
  Runtime muss `ba6fe4d9` enthalten.
- Enthält jetzt auch PR #179/#182 (Winkelerkennung); laut Review auf Android inaktiv
  (Bewegungsmodul nur für Apple), es gilt die bisherige GPS-Logik.
- Android 1.0.5 (49) und iOS 57: unverändert.

**OTA-Chargen am 18.11. (Übersicht)**

| Karte | Inhalt | Ziele | Testweg / Board |
|---|---|---|---|
| #176 | Fährten-Übersicht aufgeräumt (PR #171) | iOS 60 + Android | Nachher, Nachkontrolle offen |
| #180 | Spitzwinkel-Hochstufung + «Fährtenverlust» (PR #175, #177) | iOS 60 + Android | Vorher, Nachkontrolle offen |
| #186 | OTA-Startprüfung beim Kaltstart (PR #178) | iOS 60 + Android | Nachher, Nachkontrolle offen |
| #187 | Winkelerkennung (PR #179 + #182) | nur iOS 60 | Nachher, Nachkontrolle offen |
| #190 | «Fährten gemeinsam» ins Gruppentraining (PR #188); Android + PR #179/#182 | iOS 60 + Android | Nachher, Simulator/Emulator bestanden, Gerät offen |

Details, Platform Update IDs und Source-Commits stehen in den Karten.

**Prüfungen zu #190**
- Vorher: Tests iOS 6881 / Android 6895 bestanden, Typecheck/ESLint/Diff sauber, OTA-Abdeckung
  vollständig, unabhängige Review PASS je Ziel. Wrapper-Dry-Run vom Release-Guard gesperrt;
  Preflight lief im echten Lauf (Ancestry PASS).
- Nachher: iOS-Simulator (lokaler Dev-Build `8da2418c`) und Android-Emulator, beide auf Staging:
  alle drei Punkte der Karte bestanden. Nicht geprüft: echte Geräte, Import einer echten Datei.

**Staging-Datenbank nachgezogen** (Freigabe der Nutzerin 2026-11-18)
- Staging stand auf Migration `20260929080000`; Gruppentraining zeigte deshalb «Diese Gruppe ist
  nicht mehr verfügbar». 28 Repo-Migrationen ausgeführt, 3 nur in der Historie eingetragen
  (`dog_registry`, `newbie_training_quota_two`, `track_markers_contract`; Endstand schon vorhanden).
  Staging steht jetzt auf `20261116233000`, alle `training_group_*`-Funktionen vorhanden.
- Production von der Nutzerin lesend geprüft: Gruppentraining-Funktionen vorhanden, nicht betroffen.

**Offene Punkte**
- Gerätenachkontrolle #190, #187, #186, #180, #176, dazu #163, #165, #167, #168.
- Maestro-Grundgerüst für lokale UI-Tests läuft als eigene Aufgaben-Sitzung (ohne Kosten, nur lokal).
- Folgeideen: Bewegungs-Refs beim Aufnahmestart zurücksetzen (#182); `reloadAsync`-Zeitlimit (#178).
- Build 54 weitergeben, Push prüfen, dann #141 schliessen. Issue #7 (P0, ACTIVE-Abo) offen.
- `ota-ledger.json` vor dem nächsten nativen Build auffrischen.

## Stand iOS 60 und Android Build 53/54 nach OTA #186 und #187 – 2026-11-18 (Nachmittag)

Aktueller Production-Stand laut Wrapper- und EAS-Nachkontrolle nach OTA #187, am 18.11. erneut
frisch aus EAS gelesen (neueste Group je Runtime: iOS `547ebf6d`, Android `e6ea4e30`). Ersetzt die
Angaben «Aktiv» in den Abschnitten darunter. Karten #186 und #187 stehen auf
«Live – Nachkontrolle offen».

**iOS 60** (1.0.8, Runtime `1.0.8-sdk58-v1`)
- **Aktiv:** Source `f899b16f` (Release-Quelle mit #186 `c862108b` plus main `ee2f2a1d`), Group
  `547ebf6d-6735-48d7-afb4-ce08eccfdf3d`. Karte #187.
- **Release-Quelle:** `release/ios60-main-ee2f2a1d-20261118`. Jede weitere iOS-60-OTA muss
  `f899b16f` enthalten.
- Die OTA-Startprüfung (PR #178) ist ab #186 enthalten; sie wirkt ab dem zweiten Start nach dieser OTA.

**Android Build 53/54** (1.0.8, Runtime `1.0.8-sdk58-android-v1`)
- **Aktiv:** Source `d62a842c` (`7b8681a8` plus PR #178), Group
  `e6ea4e30-1e66-4724-a0f8-91f3e16ec431`. Karte #186.
- **Release-Quelle:** `release/android53-pr178-922fd6d4-20261118`. Jede weitere OTA auf dieser
  Runtime muss `d62a842c` enthalten.
- PR #179 und #182 (Winkelerkennung) sind auf Android **nicht** ausgeliefert (Nutzerentscheid:
  Android nur, wenn ohnehin fällig).
- Android 1.0.5 (49) und iOS 57: unverändert.

**OTA-Chargen am Nachmittag**

| Karte | Inhalt | Ziele | Android Group | iOS Group | Testweg / Board |
|---|---|---|---|---|---|
| #186 | OTA-Startprüfung beim Kaltstart (PR #178) | iOS 60 + Android 53/54 | `e6ea4e30` | `e9d6ef25` | Nachher, Nachkontrolle offen |
| #187 | Fährten-Winkelerkennung (PR #179 T-214 + PR #182 T-215) | nur iOS 60 | – | `547ebf6d` | Nachher (Nutzerentscheid, kein Feldtest vorher), Nachkontrolle offen |

Details, Platform Update IDs und Source-Commits stehen in den Karten.

**Gemergt, nicht ausgeliefert**
- PR #188: «Fährten gemeinsam» aus der Fährten-Übersicht entfernt, «Empfangene Fährten-Datei öffnen»
  neu im Gruppentraining (main `6b7e2a80`). Eigene OTA nach Freigabe der Nutzerin; auf Android käme
  ab main auch PR #179/#182 mit, sofern nicht getrennt.

**Offene Punkte**
- Gerätenachkontrolle #186 und #187 (iPhone-Testliste der Nutzerin in #187), dazu weiterhin #176,
  #180, #163, #165, #167, #168.
- Folgeideen aus den Reviews: neue Bewegungs-Refs beim Aufnahmestart zurücksetzen (PR #182);
  optionales Zeitlimit für `reloadAsync` und Android-AppState beim ersten Rendern prüfen (PR #178).
- Offene PRs: #184 (Prüfskript `status:check`) und #185 (MASTER_STATUS-Archiv), Merge durch die
  Nutzerin. #183 ist überholt und wird geschlossen; die noch gültigen Punkte stehen hier.
- Build 54 weitergeben, Push prüfen, dann #141 schliessen. Issue #161 ist seit 17.11. geschlossen.
- Issue #7 (P0, ACTIVE-Abo) ist auf GitHub weiterhin offen; Stand klären.
- `ota-ledger.json` endet am 07.11.; vor dem nächsten nativen Build auffrischen
  (`npm run release:refresh:ota-ledger`).

## Stand iOS 60 und Android Build 53/54 nach OTA #176 und #180 – 2026-11-18

Aktueller Production-Stand laut Wrapper- und EAS-Nachkontrolle nach OTA #180. Ersetzt die Angaben
«Aktiv» in den Abschnitten darunter. Heute zwei Chargen auf beiden Plattformen live; Karten #176
und #180 stehen auf «Live – Nachkontrolle offen».

**iOS 60** (1.0.8, Runtime `1.0.8-sdk58-v1`)
- **Aktiv:** Source `e4ac8b76` (aktive Production `f555f15b` plus main `0fcad296`), Group
  `41021491-629f-4783-9662-00c7ecc4cfc6`. Karte #180.
- **App Store:** Build 60 (1.0.8) ist für Kunden verfügbar (Nutzerin sah am 18.11. die App-Store-Version).
  Nach Neuinstallation zeigt die App zuerst den eingebetteten Stand von Build 60; die aktuelle OTA
  greift erst beim zweiten Start. Abhilfe: PR #178 (OTA-Startprüfung), offen.
- **Release-Quelle:** `release/ios60-main-0fcad296-20261118`. Jede weitere iOS-60-OTA muss
  `e4ac8b76` enthalten.

**Android Build 53/54** (1.0.8, Runtime `1.0.8-sdk58-android-v1`)
- **Aktiv:** Source `7b8681a8` (aktive Production `9ecd8b66` plus main `0fcad296`), Group
  `78a7a39d-db9d-46e6-8508-b873b628f3be`. Karte #180.
- Build 53 in der Play-Produktion, Build 54 im internen Test-Track (unverändert seit 17.11.).
- **Release-Quelle:** `release/android53-main-0fcad296-20261118`. Jede weitere OTA auf dieser
  Runtime muss `7b8681a8` enthalten.
- Android 1.0.5 (49) und iOS 57: unverändert.

**OTA-Chargen heute, je beide Plattformen**

| Karte | Inhalt | Android Group | iOS Group | Testweg / Board |
|---|---|---|---|---|
| #176 | Fährten-Übersicht aufgeräumt (PR #171) | `eaef9f21` | `d8767895` | Nachher (Android-Emulator vorher), Nachkontrolle offen |
| #180 | Spitzwinkel-Hochstufung (PR #175, T-212) + Taste «Fährtenverlust» (PR #177, T-213) | `78a7a39d` | `41021491` | Vorher (Android-Emulator, Staging), Nachkontrolle offen |

Details, Platform Update IDs und Source-Commits stehen in den Karten.

**Datenbank**
- Production: `track_markers_angle_kind_check` erlaubt `spitz_links`/`spitz_rechts` (Nutzerin hat am
  18.11. lesend geprüft).
- Staging: Constraint war noch alt und lehnte Spitzwinkel beim Sync ab. Mit Freigabe der Nutzerin
  nur den angle_kind-Teil der Migration `20260913220000_track_markers_contract` angewendet (reine
  Erweiterung, keine Datenänderung). Der Material-Teil ist auf Staging nicht anwendbar: dort gibt es
  2 Gegenstände mit Material `filz`, das die Migrationsdatei nicht mehr zulässt.

**Offene Punkte**
- Gerätenachkontrolle #176 und #180 (Checklisten in den Karten), dazu weiterhin #163, #165, #167, #168.
- PR #179 (T-214, Geradeaus-Sperre, nur iOS wirksam) ist gemergt, aber bewusst nicht ausgeliefert:
  eigene Charge nach iOS-Feldtest (Handy in der Hand und in der Tasche).
- PR #178 (OTA-Startprüfung beim Kaltstart) offen; Merge entscheidet die Nutzerin, danach eigene OTA.
- Auswertung zeigt Abrisse (auch automatische) nicht mit Dauer an; vorbestehend, Folgeidee.
- Build 54 weitergeben, Push prüfen, dann #141 schliessen; Issue #161 kann geschlossen werden.
- Prüfskript-Hinweis: `check-ota-coverage.mjs` kann im Hintergrund hängen, wenn stdin offen bleibt;
  mit `< /dev/null` aufrufen.

## Stand iOS 60 und Android Build 53/54 nach OTA #163, #165, #167, #168, #170 – 2026-11-17 (Abend)

Aktueller Production-Stand laut Wrapper- und EAS-Nachkontrolle nach OTA #170. Ersetzt die Angaben
«Aktiv» in den Abschnitten darunter. Heute fünf weitere Chargen auf beiden Plattformen live;
Release-Karten #163, #165, #167, #168 stehen auf «Live – Nachkontrolle offen», #170 nach
Gerätetest der Nutzerin auf «Veröffentlicht».

**iOS 60** (1.0.8, Runtime `1.0.8-sdk58-v1`)
- **Aktiv:** Source `aa671f74` (aktive Production `0cd591e7` plus main `43485d20`), Group
  `54fba149-b328-46f3-b709-9b0d8db29d90`. Karte #170.
- **App Store:** Build 60 (1.0.8) weiterhin in Prüfung, Freigabe automatisch.
- **Release-Quelle:** `release/ios60-main-43485d20-20261117`. Jede weitere iOS-60-OTA muss
  `aa671f74` enthalten.

**Android Build 53/54** (1.0.8, Runtime `1.0.8-sdk58-android-v1`)
- **Aktiv:** Source `4a8751a1` (aktive Production `4068e2f5` plus main `43485d20`), Group
  `c2774223-cbd9-40c9-9083-0ebd5ce47871`. Karte #170.
- **Build 53** (versionCode 53) ist in der Play-Produktion; alle OTAs auf dieser Runtime erreichen Kunden.
- **Build 54** (versionCode 54, EAS-Build `83691722-41ec-455d-80fb-7e7b32e39dab`, Profil production,
  Source `58dd232e` = aktive Production `90ab2c70` plus PR #159 FCM): an den internen Test-Track
  übermittelt; die Nutzerin gibt ihn in der Play Console weiter. Gleiche Runtime wie Build 53,
  bekommt also dieselben OTAs. Push über FCM (#141) wirkt erst mit Build 54.
- **Release-Quelle:** `release/android53-main-43485d20-20261117`. Jede weitere OTA auf dieser
  Runtime muss `4a8751a1` enthalten.
- Android 1.0.5 (49) und iOS 57: unverändert.

**OTA-Chargen heute (nach #156), je beide Plattformen**

| Karte | Inhalt | Android Group | iOS Group | Testweg / Board |
|---|---|---|---|---|
| #163 | Kalender: Datum und Wochentag deckungsgleich (PR #157) | `966d4e69` | `54b38909` | Nachher, Nachkontrolle offen |
| #165 | «Standort teilen» beim ersten Einschalten (PR #162, Issue #142) | `14e14da7` | `5492df96` | Nachher, Nachkontrolle offen |
| #167 | Fremd gelegte Gruppenfährte nur mit Absuche weitergeben (PR #164, #166; JS-Teil von #159) | `ce5617a7` | `a44bb9bd` | Nachher, Nachkontrolle offen |
| #168 | Tagesdatum für Trainingseinheiten lokal statt UTC (PR #160) | `15c66ab8` | `b6f2e26a` | Nachher (ohne Test vorher, Entscheid Nutzerin), Nachkontrolle offen |
| #170 | Fährten-Tag, Wochenstatistik und Ansichten lokal statt UTC (PR #169) | `c2774223` | `54fba149` | Vorher (Android-Emulator, Staging), Gerätetest bestanden, Veröffentlicht |

Details, Platform Update IDs und Source-Commits stehen in den Karten.

**Datenbank:** keine neue Voraussetzung. #167 nutzt die bestehende Migration
`20261116200000_track_share_home_zone_copy` (laut Nutzerin am 16.11.2026 bestätigt).

**Offene Punkte**
- Gerätenachkontrolle #163, #165, #167, #168 (Checklisten in den Karten).
- Build 54 in der Play Console weitergeben; danach Push auf Android-Gerät prüfen, dann #141 schliessen.
- Issue #161 (Fährten-Tagesdatum) ist mit PR #169 / Karte #170 umgesetzt und kann geschlossen werden.
- Hinweis H2 aus #167 (Heimzone, fehlgeschlagener Nachtrag): Folgekorrektur empfohlen.
- Bestehende Einträge mit UTC-Vortag (Einheiten, Fährten) werden nicht automatisch korrigiert.
- PR #171 (Fährten-Übersicht aufräumen) offen, nicht Teil dieser Chargen.
- #143 Kartenstift-Farbe und #144 Einstiege zusammenführen (Mockup zuerst) unverändert offen.

## Stand iOS 60 und Android Build 53 nach OTA #154, #155, #156 – 2026-11-17

Aktueller Production-Stand, frisch aus EAS nachkontrolliert. Ersetzt die Angaben «Aktiv» in den
Abschnitten darunter. Alle Release-Karten bis #156 stehen nach Gerätetest der Nutzerin auf
«Veröffentlicht»; im Board ist keine Nachkontrolle offen.

**Wichtig: Android Build 53 ist in der Play-Produktion für Kunden** (laut Nutzerin, 17.11.2026,
von ihr selbst in der Play Console freigegeben). Damit erreichen alle Android-OTAs auf Runtime
`1.0.8-sdk58-android-v1` Kunden; die OTAs #145, #148 und #154 wurden irrtümlich als «nur
interner Test-Track» eingestuft. Testweg für Android-OTAs ab jetzt wie für Kunden wählen.

**iOS 60** (1.0.8, Runtime `1.0.8-sdk58-v1`)
- **Aktiv:** Source `53bca350` (aktive Production `fb127898` plus main `f15bc94c`), Group
  `c8205897-7829-4f9d-b1d2-649084758179`. Karte #156: eigene Fährte im Gruppentraining (PR #151).
- Davor: Karte #155, Source `fb127898`, Group `e1ab0893-b43e-4560-80bb-f5d00c672601`:
  Gruppentraining Stufe 4a erstmals auf iOS (PR #139), Heimzonen-Abfrage beim Teilen (#140),
  gelegte Linie nur bei selbst gelegter Fährte (#153, Issue #146 Variante B), Heimzonen-Text (#147).
- **App Store:** Build 60 (1.0.8) ist zur Prüfung eingereicht, **Freigabe automatisch**. Nach der
  Freigabe durch Apple erreicht der jeweils aktive OTA-Stand Kunden ab dem zweiten Start.
- **Release-Quelle:** `release/ios60-main-f15bc94c-20261117`. Jede weitere iOS-60-OTA muss
  `53bca350` enthalten.

**Android Build 53** (1.0.8, versionCode 53, Runtime `1.0.8-sdk58-android-v1`, Play-Produktion)
- **Aktiv:** Source `14a93bc6` (aktive Production `ae61b2eb` plus main `f15bc94c`), Group
  `baf968e5-cfde-4f4e-a830-d52c1229dec5`. Karte #156.
- Davor: Karte #154, Source `ae61b2eb`, Group `650aef16-dee3-49c2-842d-b7921dc132ec` (#153, #147).
- **Release-Quelle:** `release/android53-main-f15bc94c-20261117`. Jede weitere OTA auf dieser
  Runtime muss `14a93bc6` enthalten.
- Android-OTAs: kein npm-Kurzskript; Production-Wrapper direkt mit Plattform android aufrufen.
- Android 1.0.5 (49), Runtime `1.0.5-gnss-v1`, Group `6b52516b`: unverändert.

**Datenbank (laut Nutzerin in Production ausgeführt, vom MASTER nicht geprüft):** Gruppentraining
Stufe 2a, 2b, 3, 4a, `20261116230000_training_group_own_track` (#150),
`20261116233000_training_group_eval_laid_line` (#146).

**Offene Punkte**
- Android: Push ohne FCM (#141, neuer nativer Build nötig), «Standort teilen» erster Versuch (#142),
  Kartenstift-Farbe (#143). #141 und #142 betreffen jetzt Kunden.
- «Mit Trainer teilen», Export und «Fährten gemeinsam» geben eine übernommene Gruppenfährte samt
  gelegter Linie der Leger:in weiter (nicht Teil von #146; eigener Entscheid offen).
- Eigene Gruppenfährte: Ein-Hund-Fall und normal fortgesetzte eigene Fährte lassen einen Eintrag auf
  «wird gelegt» stehen (siehe Karte #156).
- Einstiege «Gruppentraining» / «Fährten gemeinsam» zusammenführen (#144).
- PR #152 (Variante A zu #146) ist auf Entscheid der Nutzerin zu schliessen; das Schliessen hat der
  Release-Guard dem MASTER gesperrt.

## Stand Android Build 53 nach OTA #145 und #148 – 2026-11-16 (Nacht)

Aktueller Production-Stand **Android Build 53** (1.0.8, versionCode 53, Runtime
`1.0.8-sdk58-android-v1`, interner Test-Track), frisch aus EAS nachkontrolliert. Ersetzt die
Android-Angaben in den Abschnitten darunter; iOS 60 unverändert wie dort (`60d72b82`, #137,
Gerätetest bestanden, Karte auf Veröffentlicht).
- **Aktiv:** Source `56c34b86` (aktive Production `0818effa` plus main `a5c3fc34`), Group
  `b308a14e-5420-484e-bf60-1ea1c58b25dd`. Release-Karte Issue #148: Gruppentraining Stufe 4a
  (PR #139) mit Heimzonen-Abfrage bei «Auswertung teilen» (PR #140). **Gerätetest offen.**
- Davor am selben Abend: Karte #145, Source `0818effa`, Group `3ff4fc77-e454-4000-86a2-d372bba2cbf1`:
  Gruppentraining Stufe 3 (PR #130) und Folgekorrekturen (PR #135). **Gerätetest offen.**
- **Release-Quelle:** `release/android53-main-a5c3fc34-20261116`. Jede weitere OTA auf dieser
  Runtime muss `56c34b86` enthalten.
- **Vorgeschichte #148:** Ein erster Kandidat mit Stufe 4a wurde vor der Veröffentlichung gestoppt
  (Review FAIL: «Auswertung teilen» sendete Koordinaten ohne Rücksicht auf die Heimzone). Korrektur
  PR #140 (nachfragen statt kürzen, wie bei der Übergabe), Nach-Review PASS.
- **Android-OTAs:** Es gibt kein npm-Kurzskript für Android (nur für iOS). Der Production-Wrapper
  wird direkt mit Plattform android und Bestätigung aufgerufen; Aufruf siehe Kopf des Wrappers.
- **Store/Production-OTA unverändert:** 1.0.5 (49), Runtime `1.0.5-gnss-v1`, Group `6b52516b`.
  Keine Play-Produktion für Build 53.

**Stufe 4a auf iOS 60:** nicht ausgeliefert. Laut Nutzerin erst nach bestandenem Android-Test als
eigene Charge mit eigener Freigabe (Basis `60d72b82` plus main). Empfehlung MASTER: vorher
Issue #146 entscheiden (gelegte Linie der Leger:in nur mit deren Zustimmung teilen), weil iOS 60
nach der Store-Freigabe von 1.0.8 Kunden erreicht.

**Offene Befunde als Issues:** #141 Push auf Android (FCM, neuer nativer Build), #142 «Standort
teilen» meldet beim ersten Einschalten einen Fehler, #143 Kartenstift-Farbe, #144 Einstiege
«Gruppentraining»/«Fährten gemeinsam» zusammenführen, #146 Zustimmung der Leger:in.

## Stand iOS 60 nach OTA #137 und App-Store-Einreichung – 2026-11-16 (spät)

Aktueller Production-Stand **iOS 60** (Runtime `1.0.8-sdk58-v1`), frisch aus EAS nachkontrolliert.
Ersetzt für iOS 60 die Angabe «Aktiv» im Abschnitt darunter; Android unverändert wie dort.
- **Aktiv:** Source `60d72b82` (aktive Production `c3fd9879` plus main `8fb4647c`, dazu zwei
  ESLint-Kommentarzeilen für Altbestand), Group `89a9042e-6994-4228-b3d3-5000c78ca615`.
  Release-Karte Issue #137: Folgekorrekturen Gruppentraining (PR #135). Testweg Nachher,
  **Gerätetest offen**.
- **Release-Quelle:** `release/ios60-main-8fb4647c-20261117` (Datum im Namen versehentlich 17.11.).
- **Jede weitere iOS-60-OTA muss `60d72b82` enthalten.** Vor der nächsten OTA aus main wieder
  eine Release-Quelle aus dem Live-Commit plus main bauen.
- **App Store:** Die Nutzerin hat Build 60 (1.0.8) am 16.11.2026 in App Store Connect zur Prüfung
  eingereicht (vom MASTER nicht nachprüfbar). Sobald 1.0.8 im Store freigegeben ist, erreicht jede
  Production-OTA dieser Runtime alle Store-Kunden, nicht mehr nur TestFlight: Testweg entsprechend
  streng wählen. Der eingebaute Stand von Build 60 ist von Anfang November (`3858c0ff`); der
  aktuelle Stand kommt per OTA ab dem zweiten Start. Build 57 (1.0.6) bleibt bis zur Freigabe
  der Kundenstand.
- **Android Build 53:** unverändert (Group `c0de00de`, Source `47b82b3a`). Gruppentraining Stufe 3
  und PR #135 sind dort nicht ausgeliefert; auf Wunsch der Nutzerin später als eigene Charge.

## Stand iOS 60 und Android Build 53 nach drei OTAs – 2026-11-16 (Nacht)

Aktueller Production-Stand, frisch aus EAS nachkontrolliert. Ersetzt die Angaben «Aktiv» im
Abschnitt darunter.

**iOS 60** (TestFlight 1.0.8, Runtime `1.0.8-sdk58-v1`)
- **Aktiv:** Source `c3fd9879` (aktive Production `e92533a0` plus main `723b8c31`, dazu drei
  ESLint-Kommentarzeilen), Group `98054619-13ee-4544-9b2c-e4a96c45aa6d`. Release-Karte Issue #132:
  Gruppentraining Stufe 3 (PR #130), Sync #128. Testweg Vorher, Gerätetest laut Nutzerin erfolgt;
  Migrationen Stufe 2a/2b/3 laut Nutzerin in Production ausgeführt.
- Davor am selben Abend: Karte #131, Source `e92533a0`, Group `f25de2a2-a003-48de-a3c2-edbcc320e457`:
  Training mit Fährte verknüpfen (#114, PR #125, Korrektur #129), «Neu in ANYVO» (#126, #127).
  Gerätetest laut Nutzerin am 16.11. bestanden (iOS und Android), Karte auf Veröffentlicht.
  Karte #123 (Heimzone) ist auf Veröffentlicht.
- **Release-Quelle:** `release/ios60-main-723b8c31-20261116`.
- **Jede weitere iOS-60-OTA muss `c3fd9879` enthalten.** `main` enthält seit #128 den Stand
  `072b3b07`, aber nicht die Release-Merges `dbb9179e`, `e92533a0`, `c3fd9879` (inhaltlich
  gleich bis auf die Kommentarzeilen). Vor der nächsten OTA aus main wieder eine Release-Quelle
  aus dem Live-Commit plus main bauen.
- **iOS 57** (App Store 1.0.6, Runtime `1.0.6-map49-v1`) unverändert.

**Android**
- **Build 53** (1.0.8, versionCode 53, Runtime `1.0.8-sdk58-android-v1`, interner Test-Track):
  erste OTA dieser Runtime live, Source `47b82b3a` (Build-53-Stand `4aac8786` plus main
  `422d5219`), Group `c0de00de-7786-45a3-a4f8-353a0eccf6ee`, Karte #131. Enthält erstmals
  Gruppentraining 2a/2b, Passwort min. 8, Heimzone, Trainer-Kopie, Training-Fährte-Verknüpfung.
  Gruppentraining Stufe 3 ist auf Android **nicht** ausgeliefert. Gerätetest bestanden.
  Release-Quelle `release/android53-main-422d5219-20261116`. Jede weitere OTA auf dieser
  Runtime muss `47b82b3a` enthalten.
- **Store/Production-OTA unverändert:** 1.0.5 (49), Runtime `1.0.5-gnss-v1`, Group `6b52516b`.
  Keine Play-Produktion für Build 53.

**In main, aber noch nicht ausgeliefert:** PR #135 (Live-Positionen im Gruppentraining nur bei
sichtbarem Bildschirm; Mitteilungskarte ohne setState im Effekt). Braucht eine eigene OTA-Freigabe
für iOS 60 und Android Build 53; damit entfällt die Kommentarzeile in `GroupNotifyCard.tsx`.

**Board:** keine Karte mehr auf «Live – Nachkontrolle offen» (#18, #19, #20, #108, #131 nach
Gerätetest der Nutzerin auf Veröffentlicht). Release-Ziel kennt neu «iOS 60 + Android 53».

**Abdeckungsprüfung iOS über alle Runtimes:** acht Oktober-OTAs alter Runtimes untersucht und
ausgenommen (PR #133). Abo-Wiederherstellung und Tagesbegrüssung sind auf Build 60 vorhanden;
Kartenebenen-Auswahl und Startlogo-Korrektur lagen nie in Build 57 und fehlen bewusst.

## Stand iOS 60 nach Heimzonen-OTA und Android Build 53 – 2026-11-16 (Abend)

Aktueller Production-Stand **iOS 60** (TestFlight 1.0.8, Runtime `1.0.8-sdk58-v1`), frisch aus EAS
nachkontrolliert. Ersetzt für iOS 60 die Angabe «Aktiv» im Abschnitt darunter.
- **Aktiv:** Source `dbb9179e` (main `6b0cd88e` gemergt in `072b3b07`, plus zwei Kommentarzeilen
  für ESLint-Altbestand), Group `dc8c8dce-2443-459a-9385-a2082c71e4fb`. Release-Karte Issue #123:
  Heimzone (#115, PR #120) und gekürzte Kopie für Trainer-Freigaben (#121, PR #122). Testweg
  Vorher, **Gerätetest offen** (Nutzerin hat die Veröffentlichung mit Test danach freigegeben);
  Migration `20261116200000_track_share_home_zone_copy` von der Nutzerin per Leseabfrage bestätigt.
- **Release-Quelle:** `release/ios60-main-6b0cd88e-20261116` (auf GitHub gesichert).
- **Jede weitere iOS-60-OTA muss `dbb9179e` enthalten.** `main` enthält `c903fded`, `45aaa951`,
  `0175fdc3`, `00f9b5f7`, `0ef9e943`, `072b3b07` und `dbb9179e` nicht; vor der nächsten OTA aus
  main wieder eine Release-Quelle aus main plus `dbb9179e` bauen oder den Release-Branch nach
  main bringen.
- **iOS 57** (App Store 1.0.6) unverändert.

**Android**
- **Store/Production-OTA unverändert:** 1.0.5 (49), Runtime `1.0.5-gnss-v1`, Group `6b52516b`.
- **Build 53** (1.0.8, versionCode 53, Runtime `1.0.8-sdk58-android-v1`, SDK 58): EAS
  `df982aba-7fcb-43dd-8d9d-9652d415890b`, Commit `4aac8786`, interner Test-Track. Quelle
  `release/android53-build-4aac8786-20261116`. Inhalt gegenüber Build 52: Startlogo auf Android
  kleiner (`imageWidth` 150), Schriftzug nicht mehr abgeschnitten; im Emulator nach Update über
  Play geprüft. Gruppentraining Stufe 2a/2b und Heimzone sind **nicht** enthalten. Keine
  Android-OTA, keine Play-Produktion.
- Build 52 (Startlogo abgeschnitten) ist durch Build 53 ersetzt; Details im Abschnitt darunter.

## Stand iOS 60 und Android Build 52 – 2026-11-16

Aktueller Production-Stand **iOS 60** (TestFlight 1.0.8, Runtime `1.0.8-sdk58-v1`), frisch aus EAS
nachkontrolliert. Ersetzt für iOS 60 die Angabe «Aktiv» im Abschnitt darunter.
- **Aktiv:** Source `072b3b07` (main `30917c77` gemergt in `0ef9e943`), Group
  `23e67edd-0da1-415d-8b8d-5cbe3ea3c94e`. Release-Karte Issue #118: Gruppentraining Stufe 2a/2b
  (#99, #113), Passwort min. 8 (#107), dazu #89, #91, #92, #93. Testweg Vorher, Gerätetest laut
  Nutzerin erledigt; DB-Voraussetzungen von der Nutzerin per Leseabfrage bestätigt.
- **Kette seit #87** (Details je Karte): #90 T-208 (`c903fded`), #102 Hund löschen/PR #76
  (`45aaa951`), #103 Uploads per XHR (`0175fdc3`), #106 Kalender-Export und Trainer-Seiten
  (`00f9b5f7`), #108 Fortsetzen beim Legen (`0ef9e943`), #118 (`072b3b07`). Alle auf
  «Veröffentlicht» ausser #108 (Gerätetest offen).
- **Release-Quelle:** `release/ios60-main-30917c77-20261116`.
- **Jede weitere iOS-60-OTA muss `072b3b07` enthalten.** `main` enthält `c903fded`, `45aaa951`,
  `0175fdc3`, `00f9b5f7`, `0ef9e943` und `072b3b07` nicht; vor der nächsten OTA aus main wieder
  eine Release-Quelle aus main plus `072b3b07` bauen oder den Release-Branch nach main bringen.
- **iOS 57** (App Store 1.0.6) unverändert.

**Android**
- **Store/Production-OTA unverändert:** 1.0.5 (49), Runtime `1.0.5-gnss-v1`, Group `6b52516b`.
- **Build 51** (1.0.8, versionCode 51, Runtime `1.0.8-sdk58-android-v1`, SDK 58): EAS
  `23c8cb59-dda3-45bb-a82a-99a37e6b8f13`, Commit `12357520`, interner Test-Track. Quelle
  `release/android51-build-12357520-20261115`. Im Emulator geprüft: Legen mit Winkelerkennung
  (90 R, SR), Absuche bei ausgeschaltetem Bildschirm (T-209) lückenlos.
- **Build 52** (versionCode 52): EAS `f06379df-a7a6-403f-b7c4-795ab24c9ff6`, Commit `ec897e6b`,
  in den internen Test-Track eingereicht. Quelle `release/android52-build-ec897e6b-20261116`.
  Inhalt gegenüber Build 51: Fortsetzen beim Legen (`0ef9e943`), Absuche-Beschriftungen
  übersetzbar, GPS-Qualitätswort nicht mehr abgeschnitten, `"distribution": "store"` im Profil
  `production` (Voraussetzung des Wrappers für eine erste OTA auf der Android-Runtime; auf
  Build 51 lehnt der Wrapper sie deshalb ab). Gruppentraining Stufe 2a/2b ist in Build 52
  **nicht** enthalten. Keine Android-OTA, keine Play-Produktion.
- **SDK-58-Laufzeitfallen** (Ursache von #103/#106): `expo/fetch` mit RN-FormData, `expo-calendar`
  ohne `/legacy`, `href: null` in expo-router 58.

## Stand iOS 60 nach OTA aus main – 2026-11-12 (Abend)

Aktueller Production-Stand **iOS 60** (TestFlight 1.0.8, Runtime `1.0.8-sdk58-v1`), frisch aus
EAS nachkontrolliert. Ersetzt für iOS 60 die Angabe «Aktiv» im Abschnitt darunter.
- **Aktiv:** Source `2e0e2d10` (main `d505250f` gemergt in `96e7f661` plus 7 Lint-Kommentarzeilen),
  Group `79a9f554-be6b-4964-99fc-53deb53c7b89`. Release-Karte Issue #87: Kontakte (#63),
  Gruppentraining Stufe 1 (#83), Einführung, aktiver Hund, Training-Tab, 90-Tage-Trend, PDF-Bericht.
  Gerätetest offen (Testweg Vorher).
- **Release-Quelle:** `release/ios60-production-2e0e2d10-20261112`.
- **Jede weitere iOS-60-OTA muss `2e0e2d10` enthalten.** `main` enthält ihn noch nicht
  (die Fährten-Fixes `e253a552`/`96e7f661` fehlen in main); vor der nächsten OTA aus main
  den Release-Branch nach main mergen oder wieder eine Release-Quelle aus main plus `2e0e2d10` bauen.
- **Board:** Feld «Ziel» durch Einzelauswahl «Release-Ziel» ersetzt (auch Kombi-Werte); alle OTA-Karten gesetzt.
- iOS 57 und Android unverändert.

## Stand iOS 60 nach drei OTAs – 2026-11-12

Aktueller Production-Stand **iOS 60** (TestFlight 1.0.8, Runtime `1.0.8-sdk58-v1`), frisch aus
EAS nachkontrolliert. Ersetzt für iOS 60 die Angaben in den Abschnitten darunter.
- **Aktiv:** Source `96e7f661`, Group `4c1e1629-e0b3-45ce-9856-285316f27b22`. Release-Karte
  Issue #81: T-207 richtiger Schenkel und Fährtenende (PR #78). Gerätetest offen.
- Darunter, am selben Tag: Karte #79 (Source `e253a552`, Group `d4f86f24-29d4-4d40-a996-064f9c29ae52`):
  T-203, T-204, T-205 (Testcode), T-206 (PR #69, #71, #73, #75), Gerätetest bestanden.
  Karte #77 (Source `a67cef9b`, Group `8e0044b6-49a4-4b8e-99c3-1c41b2998a3b`): T-184
  Speicher-Hinweis und «Allgemeines Training», Gerätetest bestanden.
- **Release-Quellen auf GitHub:** `release/ios60-production-a67cef9b-20261112`,
  `release/ios60-production-e253a552-20261112`, `release/ios60-production-96e7f661-20261112`
  (enthalten auch `2f7a1e7f`, `51d7d706`, `b6ef690f`, `b676b403`).
- **Jede weitere iOS-60-OTA muss `96e7f661` enthalten.** `release/ios60-greeting-sound-20261109`
  und `feat/training-doku-neu-etappe1` (auf GitHub zusätzlich mit PR #63 Kontaktanfragen, nicht
  live) enthalten den Live-Stand nicht.
- **iOS 57** unverändert (Karte #58, Source `91a17f97`). PR #68 (Lernstufen-Anzeige) ist in
  `release/ios57-greeting-sound-20261109` gemergt, aber nicht veröffentlicht.
- Android unverändert. Keine DB-, Native- oder Store-Änderung.
Publish jeweils nach Einzelfreigabe der Nutzerin durch den MASTER über den Production-Wrapper.
Karten #44, #49, #51, #58, #59, #61, #77, #79 auf „Veröffentlicht“.

## Abendstand: iOS 60 Fährten-Paket, iOS 57 Trainingskarten – 2026-11-11

Aktueller Production-Stand, frisch aus EAS nachkontrolliert. Ersetzt für iOS 57 und iOS 60
die Angaben in den Abschnitten darunter.
- **iOS 60** (TestFlight 1.0.8, Runtime `1.0.8-sdk58-v1`): Source `2f7a1e7f`,
  Group `fbb66083-011d-48db-a2e4-c9aafee37b51`. Release-Karte Issue #61 (2026-11-12): T-184
  Etappe 3b «Ein Ort pro Hund», nur Ansicht und Navigation. Baut auf `51d7d706` auf
  (Group `c67550fb-80f5-4751-9e1d-e3886bf01b21`). Dessen Release-Karte Issue #59: T-196, T-197, T-200,
  T-201 (Übergabe Issue #57), Absuche-Karte T-188 (PR #35), Trainingskarten ohne rote Ecken
  T-199 (PR #52), Simulator T-192 (nur Testcode). Baut auf `b6ef690f` (Karte #51) auf.
- **iOS 57** (App Store 1.0.6, Runtime `1.0.6-map49-v1`): Source `91a17f97`,
  Group `8e8e5d01-1eb5-4779-92ae-22cb8fa96d49`. Release-Karte Issue #58: T-198 (PR #53).
  Der Wrapper lief versehentlich zweimal; die erste, inhaltsgleiche Gruppe `337c0fa6` ist
  abgelöst (Nachtrag in der Karte).
Publish jeweils durch die Nutzerin über den Production-Wrapper. Gerätetests offen, beide
Karten „Live – Nachkontrolle offen“. Kein Android, kein Store-Release, keine DB-Änderung.

Die iOS-60-Release-Quellen `51d7d706` (Branch `release/ios60-absuche-swipe-20261111`) und
`2f7a1e7f` (Branch `feat/training-doku-neu-etappe1`) liegen nur lokal. Sie enthält gegenüber der iOS60-Linie `910f1432` zusätzlich die Trainingsdoku
(T-184) und Lint-Kennzeichnungen (nur Kommentare). Jede weitere iOS-60-OTA muss `2f7a1e7f`
als Vorfahren enthalten; die Linie `release/ios60-greeting-sound-20261109` allein tut das nicht.

## iOS 60: Trainingsdoku neu, Winkel-Rückfall, Hintergrund-Ortung veröffentlicht – 2026-11-11

Aktueller Production-Stand **iOS 60** (TestFlight 1.0.8, Runtime `1.0.8-sdk58-v1`):
Source `b6ef690f`, Group `1d1def65-2c26-4234-8997-a84ace05debf`. Zwei Chargen am selben Tag:
- Release-Karte Issue #49: T-190 (PR #39), T-191 (PR #40), T-195 (Lint-Kennzeichnung).
  Source `b676b403`, Group `ebc045db-170f-41cb-8876-8adb509bcba7`.
- Release-Karte Issue #51: T-184 Trainingsdoku neu (#31), baut auf `b676b403` auf.
  Source `b6ef690f`, Group `dc7979a1-5dbf-411f-9b49-61f5c6419af4`; der Wrapper lief versehentlich
  ein zweites Mal, die inhaltsgleiche Gruppe `1d1def65-2c26-4234-8997-a84ace05debf` ist jetzt aktiv
  (gleicher Commit, gleiches Bundle, Nachtrag in der Karte).
Alle IDs, Prüfungen und vorherigen Stände stehen in den Karten. Publish durch die Nutzerin
über den Production-Wrapper; MASTER-Nachkontrolle frisch aus EAS bestanden. Gerätetest auf
TestFlight offen (beide Karten „Live – Nachkontrolle offen“). Kein Android, kein Store-Release.
iOS 57 unverändert (Stand Issue #44).

**Production-DB:** Migration `rating_scale` (Spalte `training_exercises.rating_scale`,
Funktion `training_document_v1`) am 2026-11-11 von der Nutzerin im Supabase-Dashboard
ausgeführt. Vor-/Nachprüfung bestanden, 253 Zeilen vorher und nachher, Build 57 speichert normal.

Die Release-Quellen `b676b403` (Branch `release/ios60-t190-t191-20261111`) und `b6ef690f`
(Branch `feat/training-doku-neu-etappe1`) liegen nur lokal und sind nicht auf GitHub.
Jede weitere iOS-60-OTA muss `b6ef690f` als Vorfahren enthalten.
Dieser Abschnitt ersetzt für iOS 60 die Angabe im folgenden Abschnitt.

## OTA Begrüssungston + deckende Trainingskarten veröffentlicht – 2026-11-10

Release-Karte: Issue #44 (alle IDs, Prüfungen und vorheriger Stand dort). Kurzfassung:
- iOS 57 (App Store 1.0.6, Runtime `1.0.6-map49-v1`): Source `234da479`, Group `16afcfa2-dee5-4841-907e-fb997298b898`.
- iOS 60 (TestFlight 1.0.8, Runtime `1.0.8-sdk58-v1`): Source `b70e294d`, Group `0159b03c-cea1-42fa-8d95-210109c5f544`.
Publish durch die Nutzerin über den Production-Wrapper; MASTER-Nachkontrolle frisch aus EAS
bestanden (Channel/Branch/Runtime/IDs/Commit/Message). Testweg „Nachher“, Gerätetest offen.
Kein Android, keine DB-/Native-/Store-Änderung. Dieser Abschnitt ist der aktuelle
Production-Stand für iOS 57 und iOS 60 und ersetzt ältere widersprechende Angaben unten.

## Gewichtsjournal veröffentlicht – 2026-11-01

T163/T164/T165: drei Commits auf GitHub gesichert, drei OTAs durch01 einmalig
sequentiell veröffentlicht;07 unabhängiger Artifact-Postflight3/3PASS.
- iOS57 Source4a13945539c6bc60f623bb8888f3abc3dd95fdec,
  Update01a19630-adb8-77fb-b2e0-575d6c4c56c3, Runtime1.0.6-map49-v1.
- Android49 Source32510f7a03ca49eef6440b1d28f584b6dd09f446,
  Update01a19634-6948-752f-a92c-a42e332ab9e4, Runtime1.0.5-greeting-v1.
- Android50 Sourceb27f76192a9d24e85827a194f471af9a475c70e5,
  Update01a19637-7db8-71ce-a3b7-5fffb8d3552f, Runtime1.0.5-gnss-v1.
07 bestätigtes tatsächliches CDN-HBC und alle52 Asseteinträge je Ziel exakt zu
geprüften Exporten, inklusive Duplikaten; EAS/Environment/Channel/Source/Attempts
gebunden. Receipt outputs/weight-journal-release-01-20261101/
WEIGHT-JOURNAL-THREE-TARGET-RESULT-07.json SHA256
f95f9727b960d0b3fa3768d6b4938ea86ac25baaabf077cbc47cadf24d68973a.
MASTER dokumentiert Ownerberichte, kein eigener erneuter Liveabruf.
Bestehende Daten-/CRUD-/Tracking-/LiveShare-/Karten-/QA-TimeMarkmodule laut
Review-/Bundlebelegen erhalten. KeineDB-/Native-/Store-/T115Änderung.
Geräte-, Screenreader- und Sprachabnahme offen; keine Wiederveröffentlichung.
T115 StageA installiert/postcheckPASS; aktuelle begrenzte NormalJWT-QA weiterhin
wartend auf konkreteHumanfreigabe. StageB/Privacyclosure/OTA separat offen.
Dieser Abschnitt ersetzt ältere widersprechende Zwischenstände unten.

## Zeitmarkierungs-OTA abgeschlossen – 2026-11-01

01 bestätigt drei Veröffentlichungen,07 unabhängige Pre-/Postflights3/3PASS.
Je Ziel genau ein Publish/Wrapperexit0, frische Source-/Runtimeguards,
tatsächliches CDN-HBC und alle52 Asseteinträge hashgeprüft. GitHubremote3exakt.
- iOS57 Runtime1.0.6-map49-v1, Source2687e04ccb885131119ffb9bebf3af36e1f21cb3,
  Update01a195ea-4724-7be4-baa1-94ad9b795ca0.
- Android49 Runtime1.0.5-greeting-v1, Sourceb32254408ea88ec76277b58700a3eb0217a390a1,
  Update01a195ed-0a3a-7f03-b68e-02d9b121ae99.
- Android50 Runtime1.0.5-gnss-v1, Source0d4d3de622125b078d5f69a96d679c969cb65713,
  Update01a195ef-eac2-7f2e-b383-5af5fa33f2ac.
01Belege outputs/time-mark-release-preflight-01-20261101/FINAL-RELEASE-RESULT.json
und RELEASE-REPORT.md. Tests77/82/82,TS/Lint/DiffPASS lautOwner; Fullbundle0fehlend,
einQA-Modulneu/viererwartetgeändert,Assetsidentisch. MASTER kein neuerLiveabruf.
PersönlicheQA beimLegen: Sollwinkelmarkieren/Richtungwählen,Schema2.16 separate
ReferenceMarks. Tracking/Detector/T142/Linien/LiveShare/nativeerhaltenlautReviews.
Gerätetests offen. NeueReferenzen bisnormalemFinish imRAM,keineCrashRecoveryzusage;
automatischeWinkelerkennungnichtverbessert. KeineDB-/T115Änderung,keinRepublish.
T115heutigerTestplan unabhängigPASS, konkreteHumanQAfreigabe weiterhin ausstehend.
Dieser Abschnitt ersetzt ältere widersprechende Zwischenstände unten.

## Archiv

Alle Abschnitte bis 31.10.2026 stehen unverändert in
[ANYVO_MASTER_STATUS_ARCHIV_2026-10.md](ANYVO_MASTER_STATUS_ARCHIV_2026-10.md). Sie sind historische
Snapshots und nicht der aktuelle Stand. Verschoben am 18.11.2026, nichts gelöscht.
