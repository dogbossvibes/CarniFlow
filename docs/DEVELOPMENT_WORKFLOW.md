# ANYVO — Entwicklungs- & Release-Workflow

Ziel: **möglichst wenige kostenpflichtige EAS-Cloud-Builds**. Alles Lokale (Dev-Client, Metro, lokale Builds, Preflight) ist kostenlos; Cloud-Builds nur, wenn sich **nativ** etwas ändert.

## 1. Täglicher Entwicklungsablauf
1. `npm run dev` (Metro + Dev-Client) — JS/TS/Style live neu laden, kein Build.
2. Vor jedem Push/Build: `npm run check` (Preflight, kostenlos).
3. Native Änderung? `npm run native:check` entscheidet (Ergebnis A/B).

## 2. Entwicklung mit Development Client
`expo-dev-client` ist installiert. Der Dev-Client ist ein **einmal** gebauter nativer Build, der beliebig viele JS-Änderungen über Metro lädt → **kein** neuer Build pro JS-Änderung.
- Start: `npm run dev` (bzw. `npm run dev:clear` mit geleertem Cache).

## 3. Testen auf iPhone
- Simulator: `npm run ios` (baut Dev-Client lokal, danach Metro-Reloads).
- Echtes iPhone (per Kabel): `npm run ios:device`.
- Für reine JS-Änderungen: nur `npm run dev` + App neu laden.

## 4. Testen auf Android
- Emulator: `npm run android`.
- Echtes Gerät: `npm run android:device`.
- Gesten- **und** 3-Tasten-Navigation testen (Safe-Area/FAB via `useFabBottom`).

## 5. Lokale Builds (kostenlos)
- `npm run build:local:ios:dev` / `npm run build:local:android:dev` (`eas build --local`, keine Cloud-Kosten). Benötigt Xcode bzw. Android SDK lokal.

## 6. Preview-Builds
- `eas build --profile preview --platform <ios|android>` (Channel `preview`, `distribution: internal`). Nur nutzen, wenn ein **produktionsnaher** Test **ohne** Metro nötig ist. Kein Auto-Submit.

## 7. Production-Builds
- `eas build --profile production --platform all` (Channel `production`, App-Bundle/Store). Vorher IMMER `npm run check`.
- Version bumpen (`buildNumber`/`versionCode` in `app.json`) — `autoIncrement:false`, also manuell/bewusst.
- Submit getrennt: `eas submit --platform ios|android` (iOS→TestFlight, Android→Play Internal).

## 8. EAS Updates (OTA)
`expo-updates` ist installiert (Runtime-Policy `appVersion`).
- `npm run update:development -- "msg"` / `update:preview -- "msg"`
- Production ausschliesslich über den Wrapper:
  `npm run update:production:ios -- --message "msg"` (bzw. `node scripts/update-production.mjs --platform ios --confirm --message "msg"`)
- Vorab alle Guards ohne Veröffentlichung: `npm run update:production:ios -- --message "msg" --dry-run`

**Race-Schutz des Production-Wrappers** (Vorfall 2026-10-04: eine OTA überschrieb einen parallel veröffentlichten Production-Fix):
1. Gemeinsamer Release-Lock `<git-common-dir>/anyvo-production-ota.lock` (atomar per `mkdir`, gilt für alle Worktrees dieses Repos). Zweite Session → HARD STOP. Ein Stale-Lock wird nie automatisch gelöscht; nur bewusst per `node scripts/update-production.mjs --clear-stale-lock` und nur, wenn der Halter-Prozess auf diesem Rechner nachweislich beendet ist.
2. EAS ist die einzige Quelle für den Live-Stand (nie `ANYVO_MASTER_STATUS.md`).
3. Ancestry-Guard: aktiver Production-gitCommitHash muss Vorfahre des Release-HEAD sein. Kein Auto-Rebase/-Merge.
4. Runtime (aus `app.json`, Erwartung = aktive Production-Runtime bzw. `--runtime`), Channel→Branch `production` (kein Rollout, nicht pausiert), explizite Plattform, sauberer Worktree.
5. Zweiter EAS-Check direkt vor `eas update`; geänderte Production → „Production changed during release preparation." → HARD STOP.
6. Nachkontrolle: neue Group, Plattform, Runtime, gitCommitHash = Release-HEAD. Abweichung → Exit 2, **kein** automatischer Rollback, **keine** zweite OTA.

**Grenze:** Der Lock serialisiert nur Releases aus Worktrees dieses lokalen Repositorys. Andere Rechner, CI oder manuelle `eas update`-Aufrufe erfasst er nicht; dafür bleibt der zweite EAS-Check Pflicht (Restfenster: Bundle-Export innerhalb von `eas update`). Vollständige Cross-Machine-Serialisierung bräuchte künftig einen zentralen Release-Runner/CI mit globaler Concurrency-Control.

## 9. Entscheidung: neuer Build oder Update?
`npm run native:check` →
- **Ergebnis A**: kein nativer Build → JS via Dev-Reload/Update.
- **Ergebnis B**: nativer Build nötig (betroffene Dateien/Plattform werden genannt). Siehe `BUILD_DECISION_MATRIX.md`.

## 10. Runtime-Versionen
- Aktuell: `runtimeVersion.policy = "appVersion"` (an `version` gekoppelt). Ohne `expo-updates` inaktiv.
- Empfehlung mit expo-updates: **`fingerprint`** (Runtime = Hash der nativen Abhängigkeiten) → Updates gehen nur an kompatible native Builds; neue native Abhängigkeit ⇒ neue Runtime ⇒ neuer Build. Alternativ bei `appVersion` bleiben (einfacher, aber Runtime = App-Version).
- Eine Runtime-Version muss erhöht werden, sobald sich native Module/Config ändern (sonst empfangen inkompatible Builds ein kaputtes Update).

## 11. Channels
`eas.json` trennt jetzt: `development` / `preview` / `production`. Ein Dev-Update kann Production nicht überschreiben (getrennte Kanäle + eigenes, bestätigungspflichtiges Prod-Skript).

## 12. Umgang mit nativen Änderungen
Native Änderung (Paket/Permission/Plugin/Icon/SDK/Info.plist/Manifest) → **immer neuer Build** für die betroffene Plattform. Vorher `npm run prebuild:check` (Config löst sauber auf) und `npm run check`.

## 13. Umgang mit ANYVO CONNECT
- Rein additiv, hinter `EXPO_PUBLIC_FEATURE_CONNECT_ENABLED` (Standard **aus**). In Production aus → kein Tab, keine Init, keine Abfragen. `npm run check` verifiziert das.
- CONNECT-Code ist JS → OTA-fähig. Die DB-Migration `CONNECT_SETUP.sql` ist **nicht** ausgeführt (erst im Staging).

## 14. Fehlerbehebung beim Splash-Screen
Frühere Hänger („Cannot find native module … / runtime not ready") kamen NICHT von einem hängenden Promise, sondern von einem **fatalen nativen Fehler** (fehlender `NSRemindersFullAccessUsageDescription` → expo-calendar `EXFatal` → Modul-Registry bricht ab). Regeln:
- Native Module defensiv laden (lazy `require` + try/catch) — Muster bereits in `i18n/config.ts` (expo-localization), `lib/haptics.ts`, tracking-utils.
- `SessionProvider` hat Bootstrap-Absicherung (catch + 8s-Timeout); `app/index.tsx` zeigt nach 10s einen sichtbaren Fallback statt Endlos-Spinner.
- Bei „runtime not ready: Cannot find native module X": auf dem Simulator einen **Release-Build ohne dev-client** ziehen und `xcrun simctl spawn <udid> log show --predicate 'process=="ANYVO"'` lesen — der ERSTE Fehler nennt die Wurzel.

## 15. Kostenvermeidung
- JS-Änderungen → Dev-Client/Metro, **kein** Build.
- `npm run native:check` vor jedem Build-Impuls.
- Lokale Builds (`--local`) statt Cloud, wenn möglich.
- `expo-updates` einrichten → JS-Fixes ohne Store-Build/Review.
- Nie „zur Sicherheit" bauen — die Matrix entscheidet.

## 16. Genaue Befehle (Übersicht)
```
npm run dev            # Metro + Dev-Client (JS live)
npm run ios            # Dev-Client iOS-Simulator (einmal bauen)
npm run ios:device     # echtes iPhone
npm run android        # Emulator
npm run android:device # echtes Android-Gerät
npm run typecheck      # tsc --noEmit
npm run lint           # expo lint
npm run doctor         # expo-doctor
npm run test           # jest
npm run check          # Preflight (alles Kostenlose gebündelt)
npm run native:check   # Build nötig? (Ergebnis A/B)
npm run prebuild:check # Config löst sauber auf
npm run build:local:ios:dev / :android:dev   # lokaler Dev-Build (gratis)
# Cloud (kostenpflichtig, bewusst, manuell):
eas build --profile preview|production --platform ios|android|all
eas submit --platform ios|android
```
