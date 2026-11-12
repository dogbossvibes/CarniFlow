# Kartenmaßstab bei laufender Nachführung — 2026-10-10

## Auftrag / isolierter Scope
Direkter Nutzerauftrag in02: „offene punkte weiterarbeiten“. Zuerst aktueller MASTER und abgeschlossener01-Releasebericht gelesen: drei Maßstab-Releasecommits vorbereitet, native SmartFollow-/Provider-Abnahme offen. Keine neue OTA. Daraus das konkrete Starvation-Risiko vor weiteren Produkt-Erweiterungen geprüft.

02 alleiniger Writer: `anyvo-tracking-scale-follow-refresh`, Branch `fix/tracking-scale-follow-refresh`, Basis/HEAD `bc748ab1a4fec463976e9d13831db95cbd736ce3`. Der vorherige18-Datei-Freeze und fremde Release-Worktrees bleiben unverändert. Nur3 Produktdateien,3 Testdateien und dieser Bericht.

## Reproduktion und Korrekturen
1. **Vorher synthetisch FAIL:** Zwei Sekunden kontinuierliche `onRegionChange`-Events ohne Complete lassen den Balken dauerhaft verschwinden. Das alte Invalidate/80ms-after-Complete-Verfahren konnte bei überlappenden Follow-Animationen nie messen. Die tatsächliche Kamera erlaubt etwa4–5Updates/s bei350msAnimation; keine Behauptung eines bereits beobachteten Gerätefehlers.
2. **Vorher synthetisch FAIL:** Reine Kartenverschiebung zwischen zwei Projektionsbatches wird als falscher Maßstab abgelehnt, weil alter Ursprung und neuer Endpunkt verglichen wurden. Die zweite Prüfung liest nun aktuellen Ursprung, volle Probebreite und gewählte Balkenbreite gemeinsam. Verhältnisprüfungen bleiben erhalten; Translation/Rotation sind keine Zoomänderung.
3. **07 unabhängiger P2-Befund:** Ein UI-Timeout allein beendet keine nativen Promises. Im ersten Folgekandidaten erzeugten acht Sekunden dauernder Ereignisse42 unbeantwortete native Calls. Korrigiert durch physische Sperre je MapView und `allSettled` je Batch; auch ein einzelner Reject gibt noch offene Geschwisteraufrufe nicht frei. Dieser Zwischenstand wird nicht ausgeliefert.

## Finales Verhalten
- Ereignisse werden zusammengefasst, aber schieben die nächste Messung nicht fortlaufend hinaus: maximal5Messstarts/s, Mindestverzögerung80ms. Kein Eingriff in `useSmartTrackCamera`, Recorder, Fusion oder GPS.
- Aktive Messungen bekommen300ms Anzeigedeadline. Während Bewegung ist ein angezeigter Wert höchstens500ms ab Messbeginn alt. Das ist eine begrenzte UI-Aktualisierungsfrist, keine GPS-Genauigkeitsgarantie. Bei stationärer Karte bleibt ein verifizierter Wert ohne Polling stehen.
- Nach Deadline keine alten Werte übernehmen. Physische Sperre bleibt bis tatsächlichem Abschluss aller nativen Calls. Maximal ein physisches Messvorhaben je MapView, darin höchstens3gleichzeitig offene Koordinatenaufrufe. Dauerhaft fehlende Native-Antwort bedeutet neutrale Anzeige, keine wachsende Warteschlange.
- Ein abmeldbarer Idle-Listener pro wartendem Hook erlaubt eine frische Messung nach tatsächlicher Rückkehr. Background, Layoutwechsel und Unmount invalidieren den Anzeigestand und entfernen Listener; die native Sperre wird dabei nicht umgangen. Sie bleibt für dieselbe MapView auch über Hook-Remount erhalten.
- Bei regulären Fehlern höchstens2zusätzliche Versuche ohne neue Kartenereignisse. Neue Ereignisse können später erneut anfragen, umgehen aber die physische Sperre nicht.
- Lebenszyklusprüfung vor und nach jedem Projektionsbatch verhindert nachträgliche zweite Batches nach Abbruch. Teilrejects werden vollständig abgewartet; keine unhandled Rejection als Retry-Abkürzung.

## Prüfungen / Grenzen
Vorherbeleg: zwei gezielte Tests FAIL. Nachher:6Suiten/103Tests PASS; zusätzlich überlappend Android4/70PASS. Vollständiger Typecheck PASS, ESLint0Fehler/1bereits belegte TrackingMap-Warnung, diff-checkPASS. Repro/Logs/Hashes und unabhängiger07-Recheck im Freeze-Beleg; Counts nicht addieren.

Tests: kontinuierliche Bewegung und Zoom ohne Complete, Translation/Rotation zwischen Batches, begrenzte Abtastung, alte/ausbleibende Antworten, Background/Resume/Unmount/Layout, achtsekündiger Ereignis-Sturm, Teilreject mit hängendem Geschwisteraufruf, wiederholter Resume/Remount mit identischer nativer MapView, frischer Retry nach echter Freigabe; bestehende Ticks/Continuity/Hundefarb-Overlays bleiben geprüft.

Offen bleibt die native Prüfung auf installierten MapKit-/GoogleMaps-Kandidaten, inklusive tatsächlicher Projektionslatenz, Pitch/SmartFollow, Lesbarkeit, Screenreader und Performance. Die3%-Breitenprüfung ist ein Darstellungscheck auf asynchronen nativen Einzelabfragen, keine atomare native Kamera-Snapshot-Garantie. Native APIs besitzen keine Cancel-Funktion für diese Calls. Die physische Sperre vermeidet Ressourcenwachstum; hängt der Provider dauerhaft, bleibt der Balken bis echter Antwort bzw. neuer nativer MapView unverfügbar.

## Übergabe / Release
Enges Delta auf dem vorbereiteten Maßstab-Paket. 01 einziger Integrator/Committer/Publisher; bestehende Releasecommits nicht mutiert. Vor Integration Patch-/Dateihashes prüfen, pro Runtime Tests/Typecheck/Lint/Bundle/Preflight und offene native Gates abnehmen. iOS103 benötigt weiterhin den separaten Maßstab-Grundlagentransfer; dieses Delta allein ist dort nicht anwendbar. C1/Kalibrierung und ihre SQLite-/API-/Feldgates bleiben separat.

Kein eigener Commit, Push, Merge, OTA, nativer Build, Store-Schritt oder DB-Write. Keine Kunden-/Testdaten geschrieben. Globale Statusdateien nicht geändert.

Quellen frisch gelesen: Expo54 https://docs.expo.dev/versions/v54.0.0/sdk/map-view/ sowie maps1.20.1 https://github.com/react-native-maps/react-native-maps/blob/v1.20.1/docs/mapview.md (onRegionChange/Complete, coordinateForPoint). Native Ausgabe muss weiter unabhängig geprüft werden.
