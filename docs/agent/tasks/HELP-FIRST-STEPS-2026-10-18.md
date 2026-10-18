# Hilfe, ANYVO kennenlernen und Erste Schritte — 2026-10-18

Worktree: /Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-help-first-steps
Branch: feat/help-first-steps
Basis/HEAD: 7521d48609c3a5b246bc9e04cd20eade141bccbc
Status: lokal umgesetzt, uncommitted; keine Veröffentlichung beauftragt.

## Ist-Zustand und Umfang

Die bestehende Help-Registry bleibt die gemeinsame Quelle für kontextuelle Hilfe,
Hilfe-Center und den Rundgang. Alte Texte erklärten u.a. den neuen Winkel-Dialog
nicht und versprachen einen exakten GPS-Startpunkt. Der Rundgang hatte keine
Scrollbegrenzung. Ein verspäteter Help-State-Read konnte nach Konto-Wechsel den
falschen gesehen-Status einsetzen. Es wurden keine zweiten Editoren, Tour-Daten,
Trainings- oder Hundedatensätze eingeführt.

Umgesetzt:
- Drei Erste-Schritte-Einstiege (Hund, Dokumentieren, erste Fährte) öffnen reine
  Hilfe. Überblick umfasst auch Gesundheit, Dokumente, Termine und Trainer Connect.
- Sechsteiliger optionaler Rundgang mit Überspringen, Zurück/Weiter/Fertig,
  Neustart beim Wiederöffnen und Schliessen bei Konto-Wechsel.
- Kurze Zusammenfassungen, aufklappbare Details und Links zu denselben Registry-
  Themen; neue kontextuelle Hilfe im Fährten-Hub und in der Auswertung.
- Standortfreigaben, Start, manuelle Gegenstände, automatische/manuelle Winkel,
  Teilstrecken, Pause/Fortsetzen beim Legen, bewusstes Stoppen, Liegezeit,
  Absuche und Auswertung beschrieben. Keine Behauptung einer Pause-Schaltfläche
  bei der Absuche oder einer universellen Wiederaufnahme nach App-Neustart.
- Übergabe und eigene Empfängerkopie von Verleitungs-Dateiaufgaben getrennt;
  Kontakte, Einwilligung, Dateiweitergabe, ACTIVE für neue Dateifreigaben und
  versionsabhängige Verfügbarkeit erklärt. Gruppenhilfe liest das bestehende
  GROUP_DISTRACTION_RELEASE_READY; bei geschlossenem Gate kein Nutzungsversprechen.
- Android-Hinweis: Manche Versionen blockieren die Absuche übernommener Fährten
  mit Aufzeichnungslücken. Vorschau bedeutet keine verfügbare Absuche.
- GPS-Schätzung, Umgebung, Empfangstechnik und Trageposition ohne fixe Wartezeit,
  Geräte-Rangliste oder Genauigkeitsversprechen. Freieres Tragen ist ausdrücklich
  ein Vergleichsvorschlag, kein ANYVO-Leistungsnachweis.
- Gemeinsame sichere Scrollgrenzen für HelpSheet und Tour, grosse Schrift,
  gestapelte Aktionen auf schmalen Screens, beschriftete/expandierbare Aktionen.
- Hilfestatus bleibt ausschliesslich lokal/kontogebunden: verspätete Reads und
  alte Schliessen-/Reset-Callbacks werden verworfen. Schreibzugriffe werden pro
  Help-Key geordnet; erneutes Laden wartet auf ausstehende eigene Help-Schreibungen.
- 47 neue/überarbeitete Textkeys explizit in de, gsw, en, fr und it.

## Code-/Versionsbelege

Basis ist der frisch geprüfte Build52-UI-Kandidat, NICHT altes main als Live-Stand.
Die Quellgegenüberstellung in outputs/help-first-steps-07/basis-matrix.json umfasst
vorbereitete iOS104, Android104, iOS105 und iOS105-motion-v2-Kandidaten. Registry,
Tour, HelpSheet und Gruppengate stimmen in deren Basis überein. Tracking-Screens
sind ausdrücklich nicht vollständig identisch: Android104 hat u.a. keine gleiche
Cold-Lay-Recovery und blockiert Gap-Transfers; die anderen Run-Differenzen betreffen
u.a. Kontinuität/Diagnose. Neue Texte versprechen diese Unterschiede nicht weg.
Keine eigene frische EAS-/Live-API-/Zweiaccount-Abnahme für dieses Hilfe-Paket.

Nachvollzogene Quellpfade: app/track/legen.tsx (Winkelwahl, TS/GS, Long-Press-Pause
und Stop), app/track/liegen.tsx (Liegezeit), app/track/run.tsx (Ansatzbestätigung,
Auswerten), app/track/[id].tsx (Winkel/Gegenstandskorrekturen/Notizen),
features/tracking-exchange/ExchangeScreen.tsx und groups/releaseGate.ts,
features/tracking-transfer/TransferScreen.tsx und i18n.ts. Android-Sperre im
jeweiligen Release-Worktree: features/tracking-transfer/UnsupportedTransferView.tsx
und app/track/run.tsx, Fehler TRANSFER_GAPS_UNSUPPORTED.

## GPS-Quellen, am 18.10.2026 geprüft

- Apple Support, direkt gelesen: https://support.apple.com/de-de/102515
  Sichtbare Satelliten/Hindernisse und veränderliche Empfangsbedingungen.
- GPS.gov, offizielles Archiv, direkt gelesen:
  https://archive.gps.gov/systems/gps/performance/accuracy/
  Blockierung, Reflexionen, Umgebung und Empfängerdesign. Archivstand beachten;
  keine dortigen Zahlen als heutiger Handyvergleich verwendet. Aktueller Endpoint
  https://www.gps.gov/gps-accuracy-0 lieferte 403.
- ION, peer-reviewed Abstract (2026), direkt gelesen:
  https://www.ion.org/publications/abstract.cfm?articleID=20779
  Körpernähe kann Signale und Antennenantwort beeinflussen. Studie untersuchte
  brustnah getragenes Xiaomi14TPro und Pixel7Pro; kein allgemeiner Hosentaschen-
  Vergleich, keine ANYVO-Feldvalidierung. Volltext nicht geprüft, keine Prozente
  oder Leistungsgewinne übernommen.
- Technische Primärveröffentlichung, Abstract direkt gelesen:
  https://www.tdcommons.org/dpubs_series/3182/
  Behandelt unterschiedliche Tragepositionen, liefert keinen ANYVO-Feldnachweis
  und keine generell optimale Handyhaltung.
- Apple API-Dokumentation: offizielle Suchindexdefinition horizontalAccuracy als
  Unsicherheitsradius bestätigt. Die JS-Seite lieferte nur eine Hülle; der separate
  JSON-Abruf war über das Webwerkzeug nicht zugänglich.
  https://developer.apple.com/documentation/corelocation/cllocation/horizontalaccuracy
- Android API-Dokumentation, direkt gelesen: geschätzter horizontaler Radius:
  https://developer.android.com/reference/android/location/Location#getAccuracy()

Keine Behauptung, Stoff allein verursache Fehler. Kein IMU-/Kompass-Versprechen
für GPS-Positionen und keine pauschale Entschuldigung für alle auffälligen Spuren.
Maschinenlesbare Quellen/Beleggrenzen: outputs/help-first-steps-07/sources.json.

## Prüfungen und Restabnahme

8 Suites mit initial42 Tests bestanden. Nach Ergänzung des belegten Android-
Versionshinweises die8 betroffenen Inhalts-/Sprachtests erneut bestanden; nach
Absicherung des erneuten Konto-Ladens die4 Kontotests bestanden. Insgesamt43
unterschiedliche Tests über gezielte Läufe; kein behaupteter einzelner43er-Lauf.
Der Race-Test wartet explizit auf tatsächlich gestartete asynchrone Reads.
Projektweiter finaler Typecheck bestanden. Lint aller22 neuen/geänderten TS-Dateien
ohne Fehler/Warnungen; relevante letzte Änderungen erneut ohne Befunde. Diff-Check
bestanden. Abdeckung: First Use, Skip, Reopen, Accountwechsel/Spätantworten,
serielles Schreiben/Reset, lokale Help-Key-Isolation, Routes ohne Trainingsstart,
Gruppengate, explizite5Sprachen/Placeholder-Parität, Modal-Back und kleine/grössere
Schrift/Safe-Area-Grenzen. Simulierte React-Native-Renderprüfung, keine Geräteabnahme.

Offen: echte iOS-/Android-Geräte mit grosser Schrift, VoiceOver/TalkBack, tatsächliche
Scroll-/Tastatur-/Schliessen-Bedienung sowie sprachliche Abnahme. Keine Tests an
Kundendatensätzen oder echten Trackingaufnahmen.

## Übergabe und Grenze

An Werkstatt zur Sichtung. Keine Integration, kein Commit/Push/Merge, OTA, Build,
Store-Release, Live-DB-Zugriff oder Änderung der laufenden Release-Worktrees.
Bestehende Quellen unter sources bleiben unangetastet. Lokales Hilfepaket darf
nicht aufgrund alter OTA-Freigaben automatisch veröffentlicht werden.
Bei späterer Integration nur den begrenzten Patch/47Key-i18n-Delta anwenden;
keine ganzen sprach-/plattformabhängigen Dateien über andere Releases kopieren.
Erforderliche spätere Integration auf aktuellem Zielstand neu prüfen.
