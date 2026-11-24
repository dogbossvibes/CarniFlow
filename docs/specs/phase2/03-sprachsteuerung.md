# Spec 3 · Sprachsteuerung beim Legen und Suchen

Stand: 2026-11-24 · Status: **Freigegeben von der Nutzerin am 2026-11-24** («Anzeige» statt «verbellt», Stufe 2 gleich mitgeplant)
Quelle: Marktanalyse & Roadmap vom 24.11.2026, Phase 2 (Q1–Q2 2027)
Testweg: **Vorher** (berührt die Fährten-Bedienung, Feldtest iOS und Android)

## Warum

Beim Legen hat man Fährtenstöcke, Gegenstände und Leine in der Hand; bei der
Absuche die Leine. Tippen auf dem Handy stört und kostet Genauigkeit. Mit
kurzen Sprachbefehlen bleiben Hände und Blick beim Hund.

## Was schon da ist (Code-Stand `origin/main` 7311c534)

- `features/voice/services/voiceCommandParser.ts`: erkennt schon «Winkel links/
  rechts», «Spitzwinkel links/rechts», «Gegenstand», «Verleitung», «Abriss»,
  «Absatz», «Pause», «Weiter», «Beenden», auch Mundart-Varianten.
- `features/voice/hooks/useVoiceCommands.ts` + `VoiceCommandButton.tsx`:
  Dauer-Zuhören mit `expo-speech-recognition`.
- `expo-speech-recognition` ist in `package.json` **und** als Plugin in
  `app.json` (Mikrofon- und Spracherkennungs-Erlaubnis) – also bereits in den
  nativen Builds. **Kein neues natives Modul für Version 1 nötig.**
- Sprachansagen (`features/tracking/utils/voiceEvents.ts`, `expo-speech`) mit
  Warteschlange; «Erledigt · Rückgängig» (`lib/undoToast.ts`).
- Siri-/Kurzbefehl-Routing (`features/appIntents`) und Schnell-Gegenstand
  (Lautstärketaste Android, Kurzbefehl iOS).
- **Lücke:** Die Sprachbefehle sind in `app/track/legen.tsx` und
  `app/track/run.tsx` **nirgends eingebaut**.

## Was die Funktion kann (Version 1, nur JavaScript/OTA-fähig)

1. **Schalter «Sprachsteuerung»** beim Legen und bei der Absuche (aus per
   Standard; Wahl wird pro Gerät gemerkt).
2. **Befehle beim Legen**: «Winkel links», «Winkel rechts», «Spitzwinkel
   links/rechts», «Gegenstand», «Verleitung», «Ende».
3. **Befehle bei der Absuche**: «Gegenstand gefunden», «Anzeige» mit Art
   («liegt», «sitzt», «steht»; Entscheid 2026-11-24, kein «verbellt», weil
   Verbellen beim Fährten nicht erlaubt ist), «Ende». Die Anzeigeart wird erst
   gespeichert, wenn die separate Aufgabe «Anzeigeart je Gegenstand» (laufende
   Sitzung anzeigeart-je-gegenstand) gemergt ist; bis dahin nur Bestätigung.
4. **Immer**: «Rückgängig» bzw. «Zurück» nimmt die letzte Sprachaktion zurück
   (gleiches Zeitfenster wie «Erledigt · Rückgängig»).
5. **Gleicher Weg wie die Taste**: Jeder Befehl ruft genau dieselbe Funktion
   auf wie die Taste auf dem Bildschirm. Dadurch entstehen identische Marker und
   Daten wie beim Tippen – keine zweite Speicherlogik.
6. **Akustische Bestätigung**: kurze Ansage («Winkel links gesetzt») über die
   bestehende Ansage-Warteschlange plus Vibration; zusätzlich der bekannte
   «Erledigt · Rückgängig»-Hinweis auf dem Bildschirm.
7. **«Ende» mit Sicherheitsabfrage**: «Ende» beendet nie sofort. Ansage «Ende?
   Sag ‹Ja› oder tippe» – nur «Ja» innert 5 s beendet; sonst nichts.
8. **Offline bevorzugt**: `requiresOnDeviceRecognition` wenn das Gerät es kann
   (iOS mit geladenem Deutsch-Sprachpaket, Android 13+); sonst Online-Erkennung
   mit Hinweis. Feste Befehlsliste als Erkennungshilfe (`contextualStrings`).
9. **Eigene Ansagen hören nicht mit**: Während ANYVO selbst spricht, ist das
   Zuhören kurz pausiert, damit Ansagen keine Befehle auslösen.
10. **Bildschirm an lassen**: Bei aktiver Sprachsteuerung bleibt der Bildschirm
    wach (falls nicht schon durch die Fährte), damit das Zuhören nicht stoppt.

## Hintergrund und gesperrter Bildschirm – ehrliche Grenze

- **Version 1 funktioniert nur, solange ANYVO im Vordergrund ist** (Bildschirm
  an, auch in der Tasche). Bei gesperrtem Bildschirm stoppt die Erkennung auf
  iOS und Android; die GPS-Aufzeichnung läuft wie heute weiter.
- **Stufe 2 (Entscheid 2026-11-24: gleich mitplanen; nur per neuem nativem
  Build, nicht OTA, Build nur mit Freigabe der Nutzerin):**

### Stufe 2 iOS – Siri-Befehle bei gesperrtem Bildschirm

- Neue App-Intents in `plugins/ios/app/AnyvoAppIntents.swift`:
  «Winkel links», «Winkel rechts», «Gegenstand», «Gegenstand gefunden», «Ende»,
  je mit `openAppWhenRun = false` (App kommt nicht nach vorne).
- Phrasen müssen den App-Namen enthalten («Hey Siri, Winkel links in ANYVO»);
  Apple erlaubt höchstens 10 App-Shortcuts – heute sind 3 belegt, also passen 5
  neue. Übersetzungen de/fr/it wie die bestehenden.
- Ablauf: Intent legt einen Befehl mit Zeitstempel in den gemeinsamen
  Speicher (gleiches Allowlist-Muster wie `pendingIntentRoute.ts`, nur feste
  Befehlswerte, verfällt nach 30 s). Die laufende Aufzeichnung übernimmt ihn
  beim nächsten GPS-Punkt im Hintergrund und setzt den Marker über **denselben**
  Pfad wie die Taste, mit der Position zum Zeitpunkt des Befehls.
- «Ende» per Siri beendet nie direkt: Siri fragt «Fährte wirklich beenden?».
- Siri antwortet kurz («Winkel links gesetzt»); kein Öffnen der App.
- Vorab-Spike im lokalen Simulator-/Geräte-Build (keine EAS-Kosten, nur nach
  Absprache wegen Speicher): Läuft die Übernahme im Hintergrund zuverlässig?

### Stufe 2 Android – Zuhören bei gesperrtem Bildschirm

- Bestehender Vordergrund-Dienst der Aufzeichnung um Typ «Mikrofon» ergänzen
  (`FOREGROUND_SERVICE_MICROPHONE`, Android 14+), Start nur, solange die App im
  Vordergrund ist (Systemregel), danach läuft er gesperrt weiter.
- Vorab-Spike: Ob `expo-speech-recognition` mit diesem Dienst bei gesperrtem
  Bildschirm weiterhört. Falls nicht: eigenes kleines natives Modul nötig
  (Aufwand und Risiko offen, eigener Entscheid).
- Play-Store: Mikrofon-Nutzung im Hintergrund muss in der Datenschutz-Erklärung
  und im Play-Formular stehen; Benachrichtigung zeigt «ANYVO hört zu».
- Fallback ohne Build: die bestehende Lautstärketaste (Schnell-Gegenstand)
  bleibt.

### Stufe 2 Ablauf

1. Version 1 im Feld testen (Feldbelege).
2. Spikes iOS/Android lokal; Ergebnis der Nutzerin melden.
3. Umsetzung als eigener PR mit `requiresNativeBuild: true`; ohne nativen
   Build bleiben die neuen Teile ohne Wirkung (OTA-sicher).
4. Nativer Build, TestFlight/interner Test, Store nur mit Freigabe.

## Nicht-Ziele

- Keine Apple Watch, keine Wear-OS-App.
- Keine freie Diktat-Notiz während der Fährte (gibt es als Sprachmemo).
- Kein Wake-Word («Hey ANYVO»).
- Keine Änderung an Winkel-Erkennung, Auswertung oder Ansagen-Inhalten.

## Datenmodell und Datenwirkung

- **Keine neue Tabelle, keine Spalte, keine Migration.** Marker entstehen über
  den bestehenden Tasten-Pfad.
- Gespeichert wird nur lokal die Einstellung (an/aus) im vorhandenen
  `voiceStore`.
- Erkannter Text wird **nicht** gespeichert, nicht hochgeladen und nicht geloggt;
  in der QA-Diagnose höchstens der erkannte **Befehlstyp** (ohne Wortlaut).
- Rückgängig entfernt nur den eben per Sprache gesetzten Marker über den
  bestehenden Rückgängig-Weg; nie ältere Daten.

## Rechte, Datenschutz

- Mikrofon- und Spracherkennungs-Erlaubnis werden erst beim Einschalten
  gefragt (Texte stehen schon in `app.json`).
- Online-Erkennung schickt Audio an Apple bzw. Google (Systemdienst). Das muss
  in `app/privacy.tsx` stehen → im PR prüfen und ergänzen.

## Mockup

```
┌────────── Fährte legen ──────────┐   ┌────────── Absuche ──────────────┐
│ 312 Schritte · 2 Winkel · 1 Ggst │   │ 214 m · Abweichung 1.2 m        │
│  ░░ Karte ░░░░░░░░░░░░░░░░░░░░   │   │  ░░ Karte ░░░░░░░░░░░░░░░░░░░   │
│ 🎙 Sprachsteuerung an · hört zu  │   │ 🎙 hört zu  «Gegenstand gefunden»│
│ ┌──────────────────────────────┐ │   │ ┌─────────────────────────────┐ │
│ │ ✓ Winkel links gesetzt       │ │   │ │ ✓ Gegenstand 2 gefunden     │ │
│ │              [ Rückgängig ]  │ │   │ │              [ Rückgängig ] │ │
│ └──────────────────────────────┘ │   │ └─────────────────────────────┘ │
│ [Winkel L] [Winkel R] [Gegenst.] │   │ [Gefunden] [Anzeige] [ Ende ]   │
└──────────────────────────────────┘   └─────────────────────────────────┘
 Ansage: «Winkel links gesetzt»          Ansage: «Gegenstand zwei»
```

## Umsetzung in PRs (nach Freigabe)

1. **PR A – Befehle und Logik**: Parser um «Ende/Ja», «Gegenstand gefunden»,
   «Anzeige», «Rückgängig» erweitern; Zuhören pausieren während Ansagen;
   On-Device-Option; reine Tests.
2. **PR B – Einbau Legen**: Schalter, Befehle → bestehende Tasten-Funktionen,
   Bestätigung, Rückgängig.
3. **PR C – Einbau Absuche**.
4. **PR D – Stufe 2 iOS** (Siri-Intents, nativer Build) und **PR E – Stufe 2
   Android** (Mikrofon-Dienst) – je nach Spike, nur mit Build-Freigabe.

## Testweg «Vorher» und Erfolgskriterium

- Jest: Parser (Hochdeutsch, Mundart, Fehl-Erkennungen wie «Winkel» ohne
  Richtung), «Ende» nur mit «Ja», Rückgängig-Fenster, Pause während Ansage,
  Befehl ruft dieselbe Funktion wie die Taste.
- Feldtest iOS und Android: im Wind, mit Handschuhen/Handy in der Jackentasche,
  Flugmodus (On-Device), Ansagen an; danach Fährte ohne Sprachsteuerung →
  unverändert.
- Fertig, wenn eine ganze Fährte ohne Tippen gelegt und abgesucht werden kann
  und die Marker gleich sind wie per Taste.

## Entscheide der Nutzerin (2026-11-24)

1. Kein «verbellt»: «Anzeige» mit Liegen/Sitzen/Stehen.
2. Stufe 2 (gesperrter Bildschirm) ist mitgeplant (siehe oben), Umsetzung nach
   Feldbelegen und Spikes, nativer Build nur mit gesonderter Freigabe.
