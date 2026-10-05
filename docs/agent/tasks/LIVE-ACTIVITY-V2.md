# LIVE-ACTIVITY-V2 — Liegezeit-Live-Activity V2 (Hundename, echte Liegezeit, Multi-Dog, Dynamic Island)

| Feld | Wert |
|---|---|
| **Task-ID** | `LIVE-ACTIVITY-V2` |
| **Ziel** | Liegezeit-Live-Activity zeigt echten Hundenamen + native laufende Liegezeit, je offener Fährte (dogId + sessionId), mit Dynamic Island und exaktem Deep-Link |
| **Worktree** | `../anyvo-live-activity-v2-1.0.3` |
| **Branch** | `feat/live-activity-v2-1.0.3` |
| **Basis (base)** | `e4b7ed5b7b268d3a4869f02014c57d985681fb62` (iOS Production, DEVICE/FIELD PASS) |
| **Status** | `DONE(committed)` — lokal, kein Push/Merge/Build/OTA |
| **Native Build erforderlich** | **JA** (neues lokales Expo-Modul + Widget-SwiftUI + Config-Plugin) |

## Audit Ist-Zustand V1 (vor Änderung)

- **Paket:** `expo-live-activity` 0.4.2. Das Config-Plugin erzeugt das Widget-Target `LiveActivity`
  (Deployment Target 16.2), kopiert nur die Paketdateien aus `ios-files/`, `ios/` ist nicht versioniert (CNG).
- **Schema V1:** `LiveActivityAttributes` mit `name`, Farben, `deepLinkUrl`, `timerType` sowie Padding- und
  Bildfeldern. `ContentState` enthält `title`, `subtitle`, `timerEndDateInMilliseconds`, `progress` und
  Bildfelder. Es gibt weder `dogId` noch `sessionId`.
- **Native API V1:** `startActivity`, `updateActivity` und `stopActivity(id)`. Das Paket kann Activities nicht
  auflisten.
- **JS V1 (`liegezeitLiveActivity.ts`):**
  - Singleton `activityId` im **ANYVO-Wrapper**: Ein zweiter Hund bekommt keine Activity, und ein Ende beendet
    die einzige.
  - Das Paket selbst kann mehrere Activities gleichzeitig: `startActivity` ruft jedes Mal
    `Activity.request` auf und liefert eine eigene ID; `stopActivity(id)` beendet genau diese ID. Es kann sie
    aber **nicht auflisten**.
  - Titel `Liegezeit – ${dogName}`, Untertitel fest „Fährte reift …“.
  - Deep-Link nur `/track/liegen?id=`.
  - **Kein Timer**, weil `timerEndDateInMilliseconds` nie gesetzt wird. Das V1-Widget kann ohnehin nur
    herunterzählen.
- **Ursache „Liegezeit – Hund“:**
  - `liegen.tsx` startet mit `dogName = 'Hund'`.
  - `getTrackSessionDogName(id)` liest `training_sessions` aus Supabase. Eine lokal angelegte Fährte
    (clientUuid) hat dort noch keine Zeile, also bleibt es bei `'Hund'`.
  - Die Activity startet sofort und ist idempotent. Sie wird nie aktualisiert und behält deshalb „Hund“.
- **Start, Update und Ende:**
  - Gestartet wird nur im Liegezeit-Screen bei `sessionStatus === 'resting'`.
  - Ein Update gibt es auf iOS nicht.
  - Das Ende kommt von Absuche-Start, endgültigem Abbruch, `run.tsx` (beim Betreten) und von
    `completeTrackWithoutApp`. Dabei werden die Activities nicht nach Hund oder Session unterschieden.
- **App-Kill:** Die `activityId` lebt nur im JS-Speicher. Nach einem Neustart oder einer OTA bleiben verwaiste
  Activities stehen, die JS nicht mehr beenden kann.
- **Benachrichtigungen:** Auf Android und als iOS-Fallback gibt es eine laufende Notification ohne `dogId`
  (`data.sessionId`). Ein Tap führt zu `/track/liegen?id=`.

## Umsetzung V2

- **Lokales Expo-Modul `modules/anyvo-resting-activity`:**
  - `AnyvoRestingActivityAttributes` ist ein **neuer** Typ. V1 bleibt unverändert, damit gibt es kein
    Dekodier-Risiko.
  - Statische Attribute: `dogId`, `sessionId`, `dogName`, `lyingStartedAt`, `lyingLabel`, `sinceLabel`,
    `deepLinkUrl`. `ContentState` ist leer.
  - Der Controller arbeitet je exakter `dogId` + `sessionId` (start idempotent, end, list) und ermittelt
    `relevanceScore` aus `lyingStartedAt`.
  - V1-Liegezeit-Activities (`deepLinkUrl` beginnt mit `/track/liegen`) werden beendet und nie umgehängt. Die
    V1-Lege-Activity bleibt.
- **Widget `AnyvoRestingActivityWidget`:**
  - Der Timer läuft nativ über `Text(timerInterval:countsDown:false, showsHours:true)` ab `lyingStartedAt`.
  - Sperrbildschirm: „Name · Liegezeit“, Timer, „seit HH:MM“.
  - Dynamic Island: Symbol, kompakter Timer, minimal = Symbol, expanded mit Name, Label, Timer und Startzeit.
  - Mint-Akzent, `widgetURL` je Fährte.
- **Config-Plugin `plugins/withAnyvoRestingLiveActivity.js`:**
  - Kopiert Schema und Widget in das Target `LiveActivity`, trägt beide explizit in dessen Sources-Phase ein und
    registriert das Widget im Bundle.
  - Steht in `app.json` **vor** `expo-live-activity`, weil Xcode-Mods in umgekehrter Reihenfolge laufen.
  - Per `expo prebuild` in einer temporären Kopie verifiziert: die Dateien sind im Widget-Target und nicht in der
    App, und ein zweiter Prebuild ändert nichts.
- **JS:**
  - Start und Ende laufen je Identität. Die Zeitbasis ist `startMs` des Screens (Registry `layStartedAt` bzw.
    Puffer).
  - Der Hundename wird über die `dogId` aufgelöst (`getDogById`, 4 s Timeout). Ist er nicht auflösbar, erscheint
    eine neutrale i18n-Beschriftung.
  - Die Rehydration (`RestingLiveActivitySync`, Fälle A–E) folgt der Registry.
  - **Altes Binary ohne V2-Modul (z. B. bei einer OTA auf 1.0.3-Binaries ohne V2):** Es greift ein
    V1-Fallback. **Er bietet keine Multi-Dog-Garantie.**
    - Innerhalb eines App-Prozesses merkt sich JS die V1-ID je `dogId` + `sessionId`. Ein Ende trifft deshalb
      nur genau diese ID, und Hund A und Hund B werden nie vertauscht.
    - Nach einem App-Neustart ist dieses Wissen weg, und V1 kann nicht auflisten. Ein Ende beendet dann
      **nichts**, die alte Activity bleibt verwaist, so wie bisher in V1 (das System beendet sie spätestens
      nach 8 h). Es wird nicht geraten und kein „latest“ verwendet.
    - Auf altem Binary gibt es keine Rehydration.
  - **Neues Binary mit V2:** Die echte Multi-Dog-Zuordnung läuft über
    `Activity<AnyvoRestingActivityAttributes>.activities` mit `dogId` + `sessionId`, inklusive Rehydration.
  - **Runtime-Hinweis:** `runtimeVersion.policy = appVersion`. Behält der V2-Build die Version 1.0.3, laufen
    spätere OTAs mit diesem JS auch auf alten 1.0.3-Binaries im Fallback. Das ist sicher, aber ohne V2-Darstellung.
    Ob die App-Version erhöht wird, ist eine Release-Entscheidung.

## Pre-Build-Review

- **Zeitbasis:** `layStartedAt` ist das **Lege-Ende**, nicht der Aufnahmestart.
  - `useTrackRecorder.finish()` ruft `setLayFinishedAt(Date.now())` auf, das setzt
    `layStartedAt = layFinishedAt = Lege-Ende`.
  - `legen.finishTrack()` schreibt `upsert(resting, layStartedAt: Date.now())`.
  - Der Aufnahmestart steht separat in `startedAt`.
  - Test: 10:00 Start, 10:10 Lege-Ende, 10:20 → Screen und Activity zeigen 10:00 min.
- **Kompakter Timer:** Die Breite von `Text(timerInterval:)` wurde mit dem SF-Font gemessen (CoreText,
  semibold, Monospace-Ziffern).

  | Darstellung | Breite | Hinweis |
  |---|---|---|
  | „7:59:59“ bei 12 pt | 47,3 pt | |
  | `caption`, xxxLarge | 57,4 pt | dynamisch |
  | `caption`, AX2 | 81,1 pt | dynamisch |

  - Laut HIG ist die gesamte Pille 230 bzw. 250 pt breit, inklusive Kamerabereich (≈ 126 pt), also etwa
    50 pt je Seite.
  - → Die vorherigen 56 pt mit Dynamic Type waren nicht robust.
  - Jetzt gilt: feste 12 pt semibold mit Monospace-Ziffern in einer 48-pt-Box. Der Timer im aufgeklappten
    Zustand ist bei Dynamic Type auf xxLarge begrenzt (93,4 pt ≤ 96 pt).
  - Eine SwiftUI-Wiedergabe (macOS, `ImageRenderer`, gleiche Views und Schrift) zeigte für 00:05:00, 00:59:59,
    01:05:00 und 07:59:59 kein Abschneiden, keine Ellipse und keine Überlappung.
  - Bestätigung auf dem Gerät steht noch aus.

## Offene Punkte

- Device-Test nach nativem Build. Zu prüfen: Sperrbildschirm, Dynamic Island (Breite des kompakten Timers),
  VoiceOver, Deep-Link-Tap aus dem gesperrten Zustand.
- Die Android-Benachrichtigung bleibt unverändert: ein Slot, Texte nicht lokalisiert (außerhalb des Scopes).
