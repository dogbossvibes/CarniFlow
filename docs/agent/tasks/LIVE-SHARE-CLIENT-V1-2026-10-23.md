# Live-Share-Client V1: isolierte Integration auf aktueller App-Basis

Owner Chat 02. Separater Humanauftrag: Live-Share für iOS 1.0.4 (49), iOS 1.0.5 (55) und Android vorbereiten, mit 05 abstimmen und nach Prüfung durch 01 ausliefern. Kein Bezug zur noch nicht veröffentlichten Qualitätskorrektur f115; deren Push-Bestätigung bleibt separat.

Bestehender sauberer eigener Worktree `anyvo-tracking-live-share-current` wurde von `00b38001` auf einem neuen Branch `feat/live-share-client-v1-20261023` auf die veröffentlichte Basis `aa09a64f7b11c08eb334dc4808d4bda2ee1d2ce1` gesetzt. Der alte Branch und der fremde WIP im anderen Gruppen-Worktree bleiben erhalten. Keine Änderungen an Trackingalgorithmen, Quellen, Datenbank, nativen Modulen oder Dependencies.

## Integration

- Audierte Lease-, Transport-, Journal-, Controller-, Hook- und UI-Bausteine aus 00b380 wurden gezielt unter `features/tracking-exchange/live/` eingebunden. Keine alte komplette App-/Gruppen-/Transferarchitektur zurückkopiert.
- RPC-Client, Parser und Sessionservice werden direkt aus den aktuellen `tracking-exchange/groups` wiederverwendet. Keine duplizierte Server-/Kontologik. Diese drei Dateien sind gegenüber der bekannten iOS-49-Basis 601edf bytegleich.
- Aktuelle Gruppenfährten erhalten einen Zugang „Gemeinsam trainieren“ zur neuen Route `/track/live`. Gruppen, Sitzung, eigener Hund, gewählte Empfänger und Dauer werden dort zugeordnet.
- Der globale kontogebundene Provider im bestehenden Root hält die Freigabe bei Navigation sichtbar und bietet Stoppen/Widerruf. Die vorhandenen Root-Polyfills werden weiterhin vor dem Provider geladen; der App-Lock bleibt außerhalb unverändert erhalten.
- Hintergrund, Offline-Zustand, Ablauf, Logout und Kontowechsel stoppen lokales Senden. Kein automatischer Neustart bei Resume. Nur der eigene Expo-Foreground-Watcher wird entfernt, nie der GPS-Aufnahme-/Background-Owner. Erste Stufe teilt Telefonpositionen, keine gemessene Hundeposition.
- Gruppen-/Sitzungsauswahl stoppt lokal synchron vor dem Wechsel. Vorhandene Nachrichten-/Session-/Dog-Identitäten und Serverentscheidungen bleiben bindend.
- Vor einem Start wird die Widerrufsabsicht dauerhaft gespeichert. Ausstehende Widerrufe werden separat angezeigt und beim passenden Konto wiederholt; Positionen werden nicht offline nachgesendet. Lokal gestoppt bedeutet erst nach Server-ACK serverseitig widerrufen.

## Ausstehende Gates

Der Client-Gate bleibt **false** bis zur unabhängigen Client-/Integrationsabnahme. Der Server-GRANT ist durch Receipt49 (8750c66b…) belegt; daraus folgt kein App-Client-PASS. 05 bestätigt die heutige Produktionsfunktion ed5fd1… mit serverseitigem start- UND publish-ACTIVE-Guard; gebundener Security-Handoff50/e77d016… enthält Helper-/Authority-Pins und 40 lokale PGlite-Negativtests. Das ist keine reale Geräte-/HTTP-Clientabnahme. Keine neue Serverinstallation beauftragt oder ausgeführt.

Nach 05-Vertragsbestätigung und unabhängiger 01-Review ist eine eng geprüfte Gate-Aktivierung samt unverändertem Negativtest bei Gate=false erforderlich. Danach muss 01 das Paket separat je aktueller iOS-/Android-Runtime integrieren und prüfen. Die dort neuesten Qualitäts-/Adapter-/Home-/Journal-/Android-Mute-Stände dürfen nicht aus dieser älteren Basis zurückgesetzt werden. Kein Commit, Push, OTA oder nativer Build durch 02.

## Tests / Grenzen

Owner-Ergebnisse und SHA-Bindungen unter `outputs/live-share-client-v1-02-20261023/`. iOS-/Android-Preset-Tests prüfen Lease, Transport, Offline/Resume, Konto A→B→A, Journal, Permission-Flow, Sessionauswahl und UI. Neue Screenprüfungen sichern aktuellen eigenen Hund, Sitzung und erlaubte Empfänger sowie synchronen Stopp beim Kontextwechsel. Breite Tests enthalten die 323 vorhandenen Tracking-Suiten plus Live-Clientfälle. Sie ersetzen keine Server-/Geräteabnahme.

Zusätzliche tatsächliche Zwei-Geräte-Nutzung, App-Wechsel, GPS und Kartenlayout bleiben offen. Keine Behauptung der installierten OTA oder einer vollständigen Live-Share-Freischaltung.

## V2: konkreter Wire-Vertragsfehler

Der wiederverwendete alte Transport addierte einen möglicherweise gebrochenen `performance.now()`-Zeitabstand direkt zu Servermillisekunden. Der installierte SQL-Parser verlangt für `observedAtServerMs` hingegen ganze Millisekunden. Ein neuer vertragsgetreuer Gegenversuch mit 100,125 / 5100,875 ms scheitert vor der Korrektur an GROUP_INVALID_REQUEST. V2 rundet ausschließlich beim RPC-Format konservativ ab (`Math.floor`), ohne Positionskoordinaten, Lease-Dauer oder Uhrquelle zu verändern. Der gleiche Gegenversuch besteht anschließend in iOS und Android. V1-Quellen-/Test-Freeze bleibt als Historie erhalten; nur V2 ist neuer Review-Kandidat. Keine Gateöffnung.

## V3: Sendepause nach bestätigtem Empfang

Das unabhängige V2-Review belegte einen P1: Eine reine 5-s-Pause ab Dispatch garantiert bei schrumpfender Netzlaufzeit keine 5 s zwischen zwei Server-Empfängen. Die installierte SQL-Schranke bleibt unverändert. V3 setzt nach einem erfolgreichen Publish-ACK den bestehenden lokalen Sendeanker auf die monotone Empfangszeit dieser Bestätigung. Nur die noch aktive Controller-Operation darf den Anker setzen; Stop, neue Freigabe und Ablauf invalidieren alte Bestätigungen. Frühe Fixes werden wie bisher ohne Sequenzverbrauch und ohne Backlog verworfen. Kein automatischer GPS-Retry und keine Verlängerung einer Lease.

Der originale unabhängige Gegenversuch von01 ist unverändert als eigener Test enthalten (vorher RED, nachher GREEN). Neue Tests prüfen 4.999,999/5.000 ms ab ACK, die nächste frische Position, alte ACKs nach Stop/Neustart und ACKs nach Lease-Ablauf. Die Serverregel, TTL, Uhrquelle, Positionsdaten und GPS-Ownership bleiben gleich. Das kann bei diskreten GPS-Callbacks zu größeren tatsächlichen Sendeabständen führen; abgelaufene Empfangspositionen werden weiterhin ehrlich ausgeblendet, nicht künstlich aufgefrischt. Gate bleibt false bis zum unabhängigen V3-Nachreview.
