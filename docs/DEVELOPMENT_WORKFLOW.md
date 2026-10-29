# ANYVO — Entwicklungs- & Release-Workflow

Ziel: **möglichst wenige kostenpflichtige EAS-Cloud-Builds**. Alles Lokale (Dev-Client, Metro, lokale Builds, Preflight) ist kostenlos; Cloud-Builds nur, wenn sich **nativ** etwas ändert.

## 1. Täglicher Entwicklungsablauf
1. `npm run dev` (Metro + Dev-Client) — JS/TS/Style live neu laden, kein Build.
2. Vor jedem Push/Build: `npm run check` (Preflight, kostenlos).
3. Native Änderung? `npm run native:check -- <geprüfte-Basis>` entscheidet (Ergebnis A/B).

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

## 8. Production-OTA: ein Kandidat, ein Preflight, eine Freigabe

Der bestehende `scripts/update-production.mjs` bleibt der einzige Production-Publisher.
`npm run check` prüft die lokale Entwicklung; sein PASS ist **keine** Production-Freigabe.
Die Runtime wird weiterhin plattformspezifisch aus der geprüften App-Konfiguration ermittelt.
Native Kompatibilität ist eine Voraussetzung für OTA; sie wird nicht durch eine Versionsnummer behauptet.
[Expo Runtime-Kompatibilität](https://docs.expo.dev/eas-update/runtime-versions/).

### Vorbereitung durch 01 nach Integration dieses Toolings

1. Ein sauberer, geprüfter Release-Commit mit bestätigter GitHub-Sicherung und bekannter nativer EAS-Build-Basis. Keine fremden Worktrees automatisch integrieren. Commit/Push/Merge erfordern ihre eigenen Aufträge.
2. Ein externer Plan pro Plattform beschreibt Änderungen, mögliche Regressionen, Testauswahl, unabhängigen Review sowie vorhandene Production-Export-/Bundle-/Assetnachweise. Ergebnisse stammen aus tatsächlich ausgeführten Prüfungen. Keine Belege erfinden.
3. Ein Aufruf führt den zentralen Preflight aus; er veröffentlicht nichts:

```sh
node scripts/update-production.mjs --platform ios --message "<Releaseumfang>" \
  --prepare --plan /private/tmp/anyvo-release/plan-ios.json \
  --candidate-dir /private/tmp/anyvo-release/kandidat-ios
```

Android: separater Plan und neues Ausgabeziel, `--platform android`. Nie `all`.
Das übergeordnete Ausgabeverzeichnis muss existieren, das Kandidatenverzeichnis neu sein und ausserhalb aller registrierten Worktrees und des gemeinsamen Git-Verzeichnisses liegen.
Der bestehende Initial-Runtime-Modus bleibt nur für eine nachgewiesene erste OTA dieser Plattform/Runtime zulässig; dafür dieselben Initial-Flags bei Vorbereitung und späterem Publish verwenden.

Der Preflight führt Typecheck, ESLint, Offline-Prozess-/Release-Tests, Jest und Diff-Prüfung aus. ESLint-Fehler blockieren. Die festgelegten Package-Skripte dürfen nicht durch Erfolgsmeldungen ersetzt sein.
`--quality-evidence <externer Beleg>` kann bereits ausgeführte, vollständige Prüfungen am **identischen Commit/Tree/Plattform/Runtime** wiederverwenden; die Dateien und ihre Hashes werden erneut geprüft. Dadurch keine unnötigen Testwiederholungen für unveränderte Quellen. Zeitabhängige Live-Prüfungen bleiben frisch.
Der Plan enthält `producer` und den unabhängigen `review`; dieselbe Person/Agentenidentität darf nicht beides bestätigen. Physische QA bleibt ein tatsächlicher Prüfvorgang.

Risikoregeln (Dateipfade können eine zu niedrige Einstufung automatisch erhöhen):

| Risiko | Zusätzliche Pflicht |
| --- | --- |
| Niedrig: Texte, kleine visuelle Korrekturen | Sinnvolle relevante Tests und explizite Begründung der Auswahl |
| Mittel: Navigation, Formulare, Kalender, Journal | Funktionaler Regressionsbeleg für den exakten Kandidaten |
| Hoch: Tracking, Auth, Abos, DB, Datenschutz, Permissions, Offline | Vollständige Jest-Suite, funktionaler Nachweis und echte Geräteabnahme aller betroffenen kritischen Bereiche am benannten nativen Build |

Keine Grundfunktion benötigt neue APIs, Migrationen oder Trackingänderungen. Fehlende Pflichtbelege ergeben `BLOCKED`.

### Externer Plan und Belege

Das folgende Schema beschreibt Felder; Platzhalter sind **keine gültigen Nachweise**:

```json
{
  "producer": "<Implementierungs-Owner>",
  "nativeBuildId": "<tatsächlich geprüfte EAS-Build-ID>",
  "changes": [{"description": "<konkrete Änderung>", "risk": "low", "areas": ["ui"]}],
  "regressions": ["<mögliche Regressionen oder begründete geringe Auswirkungen>"],
  "testRationale": "<warum diese Tests ausreichend sind>",
  "testPaths": ["<vorhandene relevante Datei.test.ts>"],
  "review": {"status": "PASS", "sourceCommit": "<40-stelliger Commit>", "reviewer": "<unabhängiger Reviewer>", "evidence": {"path": "<externe Reviewdatei>", "sha256": "<SHA256>"}},
  "sourceBackup": {"status": "PASS", "commit": "<derselbe Commit>", "repository": "dogbossvibes/CarniFlow", "ref": "<verifizierter GitHub-Ref>", "evidence": {"path": "<externer Sicherungsbeleg>", "sha256": "<SHA256>"}},
  "bundle": {"status": "PASS", "sourceCommit": "<derselbe Commit>", "platform": "ios", "runtime": "<geprüfte Runtime>", "environment": "production", "evidence": {"path": "<prüfbarer Production-Exportbeleg>", "sha256": "<SHA256>"}, "launchAsset": {"path": "<tatsächlich exportiertes Bundle>", "sha256": "<SHA256>"}, "assets": [{"path": "<tatsächlich exportiertes Asset>", "sha256": "<SHA256>"}]}
}
```

Alle Nachweise und Bundle-/Assetdateibelege sind externe reguläre Dateien mit SHA256, jeweils höchstens 32 MiB. `bundle.assets` darf bei einem tatsächlichen Export ohne Assets leer sein. Der unabhängige Exportbeleg muss Quelle, Production-Environment und passende Exportparameter nachvollziehbar machen; er wird nicht aus beliebigen Assets geraten. Der Wrapper erfindet weder Exportnachweise noch GitHub-Sicherungen und führt dafür keinen Push aus. Der frische Environment-Fingerprint wird im Kandidaten gebunden. Nur von EAS tatsächlich sichtbare Werte können gehasht werden; redigierte Secretwerte sind kein vollständiger serverseitiger Versionsnachweis. Entscheidend bleibt zusätzlich der geprüfte Export und der spätere Bytevergleich.

Bei mittlerem/hohem Risiko zusätzlich `functionalQA` mit `status: PASS`, `sourceCommit`, `platform`, `runtime`, nichtleeren `scenarios` (Textliste) und `evidence`.
Bei hohem Risiko zusätzlich `deviceQA` mit `status: PASS`, `kind: physical-device`, `sourceCommit`, `platform`, `runtime`, `nativeBuildId`, `deviceModel`, `osVersion`, `performedAt` (ISO-Zeit), `evidence` und `scenarios` als Liste von `{area, result: PASS, description}` für **jeden** betroffenen kritischen Bereich. Ein Simulatorbeleg genügt dafür nicht. `fullSuite: true` kann auch bei niedrigerem Risiko die vollständige Testsuite anfordern.

### Genau eine ausdrückliche Production-Freigabe

Der Wrapper schreibt `candidate.json` und `FREIGABE.txt` mit READY oder BLOCKED. Fehlgeschlagene frühe Vorbereitung hinterlässt `BLOCKED.txt`.
Nur bei READY erhält der Nutzer einen kompakten Bericht und eine abschliessende Freigabefrage. Beispiel: „Production-OTA für Kandidat <ID>, iOS, Runtime <R>, Commit <C> freigegeben.“
Soll iOS **und** Android gemeinsam freigegeben werden, müssen beide separaten Kandidaten READY sein und beide IDs im Bericht stehen. Eine eindeutige direkte Antwort wie „Beide geprüften OTA-Kandidaten freigeben“ auf diesen Bericht genügt; 01 bindet sie in zwei getrennten technischen Belegen an die beiden IDs. Der Nutzer muss weder JSON-Dateien anlegen noch lange IDs abtippen.

Nach der tatsächlichen menschlichen Nachricht wird pro Kandidat einmal ein externer Freigabebeleg festgehalten:

```json
{
  "schemaVersion": 1,
  "kind": "human-production-approval",
  "decision": "PUBLISH_PRODUCTION_ONCE",
  "scope": "production-ota-only",
  "candidateDigest": "<Digest aus candidate.json>",
  "commit": "<exakter Commit>",
  "platform": "ios",
  "runtime": "<exakte Runtime>",
  "humanMessageReference": "<nachprüfbare ID der direkten Nutzernachricht>",
  "explicitStatement": "<tatsächlicher ausdrücklicher Freigabetext>",
  "approvedAt": "<ISO-Zeit der Freigabe>"
}
```

Das ist ein lokaler, hashgebundener Nachvollziehbarkeitsbeleg, **keine kryptografische Authentifizierung** des Menschen. 01 muss die originale menschliche Nachricht prüfen. Ein Agent darf keine Zustimmung erfinden; `--confirm`, Agenten-Nachrichten oder ein JSON-Feld ersetzen diese Zustimmung nicht. Externe Tool-/Plattformablehnungen bleiben STOP; kein Umgehen oder Wiederholen auf einem anderen Pfad.
Für einen unveränderten Kandidaten keine weitere Nutzerfrage. Neue Quelle, Scope, relevante Production-Basis, Zielparameter oder Nachweise erfordern erneuten Preflight; wesentlich geänderte Kandidaten eine neue ausdrückliche Freigabe. Alte pauschale Freigaben gelten nicht als Freigabe dieses neuen Implementierungsauftrags.

Erst danach veröffentlicht 01 über denselben Wrapper:

```sh
node scripts/update-production.mjs --platform ios --confirm \
  --candidate /private/tmp/anyvo-release/kandidat-ios/candidate.json \
  --approval /private/tmp/anyvo-release/freigabe-ios.json
```

Die Message wird aus dem geprüften Kandidaten übernommen. `--dry-run` kann denselben Kandidaten und Freigabebeleg erneut prüfen, ohne zu veröffentlichen oder eine zweite Zustimmung zu verlangen. Ein alter Dry-Run ohne Kandidat ist nur eine Guard-Diagnose, kein READY.
Der bestehende npm-iOS-Alias setzt weiter Plattform und `--confirm`; er benötigt jetzt ebenfalls Kandidat und Freigabebeleg.

### Erhaltene Guards und automatische Nachkontrolle

- Pflicht-Environment `production`, bestehender Supabase-Guard, genau eine Plattform, exakte Runtime, sauberer Branch/HEAD/Tree, native EAS-Build-Kompatibilität und vollständiger Native-Diff.
- EAS ist die Live-Quelle. Ancestry verlangt, dass die aktive OTA derselben Plattform/Runtime im Release enthalten ist. Kein automatisches Rebase, Merge oder Rollback. Fehlende eindeutige Basis blockiert.
- Gemeinsamer Release-Lock `<git-common-dir>/anyvo-production-ota.lock`, frische Baseline vor und nach Vorbereitung, **zweiter** Check unmittelbar vor Publish. Veränderte Production → „Production changed during release preparation.“ → HARD STOP.
- Dauerhafte exklusive Versuchsmarke `<git-common-dir>/anyvo-ota-attempts/<Kandidaten-Digest>.json` direkt vor dem einzigen `eas update`. Sie startet als UNCONFIRMED. Abbruch, Prozessverlust oder unsicheres Ergebnis erlauben keine automatische zweite OTA. Die Marke bleibt erhalten; keine automatische Bereinigung.
- Frische EAS-Nachkontrolle: echte Group-/Update-IDs, Plattform, Runtime, Commit, Channel, aktive Ziel-Runtime und unveränderte andere Plattform.
- Zusätzlich read-only Manifest/CDN-Kontrolle nach dem [Expo-Updates-v1-Protokoll](https://docs.expo.dev/technical-specs/expo-updates-1/): exakte Update-ID/Runtime, Bundlebytes und **alle** Assetbytes gegen die vorab freigegebenen SHA256-Werte. Nur HTTPS auf unterstützten Expo-Hosts; kein Redirect auf fremde Hosts. Unbekannte Formate (z. B. Multipart), fehlende Erreichbarkeit oder abweichende Bytes ergeben UNCONFIRMED/Exit 2, niemals einen behaupteten Erfolg.
- Abschlussbericht im Journal: Status SUCCESS oder UNCONFIRMED, Plattform/Runtime/Channel/Environment/Commit, tatsächliche EAS-IDs, geprüfter Production-Stand oder null, CDN-Ergebnis und offene Geräteabnahme. SUCCESS bezeichnet den verifizierten Serverstand, nicht die schon erfolgte Installation auf jedem Kundengerät.

**Grenzen:** Der Lock und das Versuchsregister gelten für diesen gemeinsamen lokalen Git-Speicher. Andere Rechner, CI oder manuelle `eas update`-Aufrufe erfasst er nicht; sie sind kein erlaubter Alternativweg. Das Export-/Publish-Restfenster anderer Rechner bleibt bestehen. Eine globale CI-Release-Architektur wird in diesem Auftrag ausdrücklich nicht neu eingeführt. Bei unbestätigtem Ergebnis zuerst die tatsächlich entstandene EAS-Group untersuchen; keine zweite OTA zur „Reparatur“. Ein Stale-Lock wird nie automatisch gelöscht; bewusste lokale Prüfung bleibt über `--clear-stale-lock` möglich, das Versuchsregister wird dabei nicht gelöscht.

## 9. Entscheidung: neuer Build oder Update?
`npm run native:check -- <geprüfte-Basis>` →
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
