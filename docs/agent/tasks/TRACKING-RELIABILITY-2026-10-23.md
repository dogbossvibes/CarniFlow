# Tracking gemeinsam absichern — 23.10.2026

Status R2: kleine Start-/Ansatz-Schutzkorrekturen lokal implementiert; gezielter
R2-Lauf bestanden, vollständige Abschlussbelege im gesonderten R2-Freeze.
Keine vollständige Feldabnahme, kein Abschluss der drei fehlenden Yam-Winkel.
Kein Commit, Push, Merge, OTA, nativer Build, Store- oder Datenbankeingriff
durch diesen Auftrag. Unabhängiger Review und Veröffentlichung separat bei 01.

## Basis und Zuständigkeit

- Direkter Auftrag in Chat 02: Winkel, GPS-Start, Ansatz und gespeicherte Spuren
  gemeinsam absichern; danach Live-Share-Abschluss mit 05.
- Eigener Worktree `anyvo-tracking-reliability-20261023`, Branch
  `fix/tracking-reliability-20261023`, anfänglich sauber.
- Basis und unveränderter HEAD `6328890822a842cb94cd6819e483cc5e86056ed7`:
  veröffentlichte iOS-55-OTA mit beiden gespeicherten Spuren.
- Kein fremder Worktree oder globale Statusdatei geändert. 02 ist einziger
  Trackingwriter; 01 bleibt unabhängiger Prüfer und Publisher; 05 Backendowner.
- App-Worktree-Werkzeug konnte den Projektspiegel keinem Repository zuordnen.
  Git-Worktree anschließend mit geprüfter Basis und genehmigter Dateisystem-
  Erweiterung angelegt. Bestehende Quellen und Arbeitsbereiche erhalten.

## Belegte Fehler und Änderung

1. **Warm-up und Start:** `beginRecording` prüfte nur die zuletzt gemeldete
   Genauigkeit, nicht das Alter der Messung. Ein spät aufgelöster Cache-Read
   konnte eine aktuell brauchbare Live-Position wieder überschreiben. Jetzt
   zählen vor dem Start nur gültige, frische und vorwärts geordnete Messungen.
   Eine Live-Messung hat Vorrang vor dem Cache. Der tatsächliche Start prüft
   die Frische nochmals; die sichtbare Startfreigabe verfällt ohne neuen Fix.
   Der erste brauchbare Fix gibt weiterhin sofort frei, ohne Mindestwartezeit.
   Negative/nicht endliche Genauigkeit ist keine Startbereitschaft.
2. **Ansatz:** Neue Objekte mit demselben Messzeitpunkt wurden wiederholt als
   unabhängige Bestätigung gezählt. Die Sprunggeschwindigkeit nutzte die
   Callbackzeit. Nun gilt der ursprüngliche Messzeitpunkt; frische verspätete
   Duplikate verändern weder Bestätigung noch Geschwindigkeitsanker. Stale,
   ungültige und eindeutig zukünftige Messungen nehmen die Freigabe zurück.
3. **Automatischer Suchstart:** Nach erreichtem Ansatz genügten zwei deutlich
   ungenauere Fixes für eine vermeintliche Abbewegung. Jetzt gelten weiterhin
   dieselbe Genauigkeitsobergrenze und Frische-/Geschwindigkeitsprüfung. Nach
   Ablauf der Messung muss der Ansatz erneut bestätigt werden. Zeitablauf
   erzeugt keinen Suchstart. Quellownership und aktive Absuche unverändert.
4. **Native Zeitauflösung:** Bruchteile innerhalb desselben abgeschnittenen
   JavaScript-Millisekundenintervalls bleiben zulässig, wie im bestehenden
   Lege-Ankerpfad. Echte zukünftige Zeitstempel bleiben ausgeschlossen.

Die fünf Sekunden für Messfrische, 15 m Lege-Startgenauigkeit, 12 m
Ansatzgenauigkeit, Anzahl der erreichten Fixes sowie räumliche Zonen bleiben
unverändert. Kein neuer GPS-Stream, keine Berechtigungs-/Backgroundänderung.
Der vorhandene GPS-Empfang kann dadurch nicht garantiert beschleunigt werden.

## Winkel, Messdaten und gespeicherte Spuren

Detektor, Fenster, Fusion, Motion-Zuordnung, Winkelklassen, Aufnahmegeometrie,
Distanz, Gegenstände, Enderkennung, Continuity, Persistenz und die veröffentlichte
Zweispur-Nachansicht wurden nicht verändert. Ein erneuter lokaler Vergleich
derselben zwei Originalexporte mit Basis und Arbeitsstand bestätigt gleiche
Winkelentscheidungen und vollständige 10/56 gespeicherte Legepunkte im
Kartenmodell. Das ist kein nativer Render- oder GPS-Empfangstest.

Quiron-FN1 ergibt im aufbewahrten GPS-/Motion-Kontext rechts → links. Yam ergibt
spitz links → rechts → spitz rechts. Der Yam-Motionkontext ist teilweise
abgeschnitten; die drei zusätzlich eingezeichneten unteren/oberen Winkel sind
damit weiterhin nicht sicher gelöst. Der frühere Dichte-/Fenster-Prototyp
erzeugte Fehlwinkel auf unveränderten Gegenproben und bleibt verworfen. Keine
erfundene Ecke, importierte Sollroute oder pauschale Schwellenlockerung.

## R1-Prüfungen (historischer, zurückgezogener Kandidat)

- Korrigierter Baseline-Lauf mit tatsächlichen Git-Quelldateien von 6328890:
  acht neue Assertions schlagen fachlich fehl, 46 Tests bestehen. Frühere
  Laufversuche mit unvollständigem Test-Mount/Resolver sind diagnostisch
  erhalten und kein gültiger Fehlernachweis.
- Abschließend betroffener Bestand: **16 Suiten / 277 Tests PASS**, kein Skip.
  Enthält real gerenderte Hooks, Start-/Background-/Sourceownership, Ansatz,
  Suchstart, Recovery und tatsächliche Detail-/Zweispurkomponenten.
- Breiter vorgelagerter Erkundungslauf: 322 Suiten, 3787 Tests PASS / zwei
  Assertions FAIL im bestehenden Sourceownership-Test. Diese verlangten zu
  Recht die sofortige Freigaberücknahme bei stale Fixes; Reihenfolge korrigiert
  und Originaltest unverändert im finalen 16-Suiten-Lauf bestanden. Dieser
  Zwischenlauf ist ausdrücklich kein kompletter finaler PASS. Zahlen überlappen.
- TypeScript PASS; gezielter ESLint 0 Fehler / fünf bestehende Warnungen;
  `git diff --check` PASS. Abschlusslogs und SHA-Bindungen im eigenen
  `outputs/tracking-reliability-02-20261023`-Ordner.
- Vorhandene exakt passende Abhängigkeiten nur über eigenen temporären Link
  genutzt; keine Installation und keine Dependency-/Lockfileänderung.

## Grenzen und nächste Schritte

01 prüft die genaue Quelle unabhängig, anschließend gegebenenfalls isolierte
Integration und plattformspezifischen OTA-Preflight; kein ungeprüfter Transfer
auf Android oder alte iOS-Runtimes. Keine neue native Funktion erforderlich.
Geräteanzeige, GPS-Start/Ansatz im Feld und drei fehlende Yam-Winkel bleiben
offen. Eine spätere zeitlich zugeordnete Feldmessung ist für deren positive
Abnahme erforderlich; Nutzer hat Geräteprüfungen derzeit zurückgestellt.

Danach 05: bestehende synthetische Live-Gruppe korrekt und idempotent schließen,
frische Server-/Rechte-/Aufräumprüfung und erst danach allgemeine Aktivierung.
Vorhandene Serverfreigabe gilt; eine gesperrte temporäre OAuth-Anmeldeänderung
oder persönliche Anmeldung wird nicht umgangen. Keine erneute Installation
der bereits geprüften Gruppen-/C1-/R4-Grundlage.

API-Referenz: Die öffentliche SDK-54-URL leitete beim Abruf auf die aktuelle
Dokumentation um. Daher zusätzlich die offizielle SDK-54-Quelle geprüft:
https://github.com/expo/expo/blob/sdk-54/docs/pages/versions/v54.0.0/sdk/location.mdx
und die tatsächlich installierten expo-location-19-Typen verwendet. Keine neue
API oder neue SDK-Version eingeführt.

## R2: unabhängiges P1-Finding und Aktionszeit

01 hat R1 unabhängig zurückgegeben. Nach zwei Ansatzfixes, sechs Sekunden
Zeitfortschritt OHNE Ausführen des JS-Timers und zwei entfernten Fixes wurde
erneut `departed_start` gesetzt. Der nächste Fix ersetzte den überfälligen Timer,
ohne die alte Bestätigung zu verwerfen. Ein weiterer lokaler Nachweis mit dem
wirklichen Hook und den tatsächlichen Suchstart-/Voice-Callbacks bestätigte:
Ein alter `armed`-Snapshot konnte auch manuell starten oder gesprochen werden.
R1-Freeze und Patch bleiben als historische Evidenz erhalten, nicht ausliefern.

R2 invalidiert die Bestätigungszähler vor der Verarbeitung des nächsten Fixes,
wenn die vorige Messung zu alt ist. Dies funktioniert unabhängig davon, ob JS
den Ablauf-Timer schon ausgeführt hat. Der Hook gibt den ursprünglichen letzten
Messzeitpunkt an den Suchscreen weiter. Manueller Start am Ansatz, automatischer
Start nach Abbewegung und die Gültigkeitsprüfung einer ausstehenden Ansage
prüfen unmittelbar bei der Aktion diesen Zeitpunkt. Der ausdrücklich bestätigte
manuelle Override bleibt erhalten; Recovery startet weiterhin separat.

Zusätzliche Randreproduktion: Auch ein bereits gesetzter, vom Aufrufer noch
nicht verbrauchter `departed_start` darf eine spätere Messlücke nicht überleben.
Nach einem weiteren fachlich roten Hooktest wird bei ungültiger/abgelaufener
Evidenz deshalb auch die aktuelle Phase auf `approaching` zurückgesetzt.
Historische Diagnosezeitpunkte bleiben erhalten. Keine neue Entfernungsschwelle.

Vier neue fachliche Assertions scheitern gegen R1. Nach R2 bestehen **4 Suiten /
37 Tests** einschließlich des unveränderten Sourceownership-Tests. Die neue
Suchscreen-Prüfung führt die tatsächlichen aus der TypeScript-Datei gelesenen
Callbacks aus; sie ersetzt nicht die Entscheidung durch eine Testnachbildung.
Frischer Start, gesperrter alter Start, expliziter Override und nachträglich
ungültige Voice werden geprüft. Der vollständige erneut ausgeführte Tracking-
Bestand sowie Typecheck/Lint/Diff und alle Quellhashes sind im abschließenden
`SOURCE-FREEZE-R2.json` gebunden. Testergebnisse aus R1/R2 überlappen.

Der breite R2-Zwischenlauf erkannte außerdem sieben Fehler im bestehenden
Transfer-Testharness: Dieser extrahiert echte Suchscreen-Callbacks und kannte
deren neue Frische-Abhängigkeit noch nicht. Er übernimmt jetzt zusätzlich den
tatsächlichen Frische-Callback mit echter Hilfsfunktion und frischem Messfix.
Die Konto-/Session-/Hund-/A→B→A-/Unmount-Assertions bleiben unverändert streng;
keine Produktkorrektur aus diesem Testadapter. Abschließender Gesamtlauf erst
nach dieser Anpassung; Zwischenläufe werden nicht als Gesamt-PASS umbenannt.

Neuester direkter Nutzerauftrag erlaubt nach erfolgreicher Prüfung die OTA für
iOS Build 55 und Android. 01 bleibt Integrations-/Releaseowner und prüft jede
tatsächlich aktuelle Plattformbasis/Runtime frisch; kein neuer nativer Build
und kein Storeauftrag aus dieser Freigabe. Der separate Android49-Storestand
wird durch dieses Trackingpaket nicht überschrieben.

Die konkrete temporäre Live-Share-Anmelde-Rückleitung ist vom Nutzer freigegeben.
Die persönliche Anmeldung ist jedoch ausdrücklich bis zur Verfügbarkeit am Mac
vertagt. Kein zeitgesteuerter Start, kein heutiges Anmeldefenster, kein Reminder.
05 hat bestätigt: Der bestehende Cookie-/Loopback-/Terminal-Ablauf benötigt den
Mac; das iPhone allein kann ihn nicht abschließen. Allgemeines Live-Share bleibt
bis zum vollständigen Close-/Serverpostflight und separatem Clientrelease aus.
