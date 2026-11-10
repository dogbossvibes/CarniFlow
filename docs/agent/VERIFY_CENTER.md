# ANYVO Prüfzentrum (`verify:center`)

Lokales Werkzeug, mit dem ein Agent eine Änderung **selbst und reproduzierbar**
prüft – ohne Staging, Production oder echte Kundendaten zu berühren.
Ein Befehl erzeugt einen Bericht mit eindeutigem PASS/FAIL je Ebene.

```bash
npm run verify:center -- --target ../anyvo-<slug> --base <task-basis> \
  --db-suite training-doku-rating-scale
```

Bericht: `~/canisflow-verify-reports/<zeit>-<branch>-<sha>/REPORT.md`
(+ `report.json`, `quality-evidence.json`, `evidence/`). Der Ordner liegt bewusst
**ausserhalb** jedes Repositories (Regel von `release-quality-evidence.mjs`, und
nichts davon landet im öffentlichen GitHub-Repo).

Exit-Code: `0` alle gewählten Ebenen PASS/SKIP · `1` mindestens eine FAIL · `2` Werkzeugfehler.

## Was es nie tut

- keine Verbindung zu Staging/Production: Kindprozesse laufen ohne `SUPABASE_*`,
  `DATABASE_URL`, `PG*`, `EXPO_PUBLIC_SUPABASE_*`, `EAS_*`, `EXPO_TOKEN`;
  SQL läuft nur per `docker exec … psql` über den Unix-Socket im Container
  (Testfälle prüfen zusätzlich `inet_server_addr() is null`);
- kein Commit, Push, Merge, Build, OTA, Store-Release; ändert keine Dateien im Ziel-Worktree;
- keine echten Kundendaten: nur synthetische Identitäten (`…@verify.local`), jede
  Suite läuft in einer Transaktion mit `ROLLBACK`, danach wird auf Rückstände geprüft.

## Optionen

| Option | Bedeutung |
|---|---|
| `--target <dir>` | zu prüfender Worktree (Standard: aktuelles Verzeichnis). Geprüft wird **der Commit `HEAD`**, nicht die Arbeitskopie; uncommittete Änderungen werden im Bericht gewarnt. |
| `--base <ref>` | Vergleichsbasis (Standard: `merge-base HEAD origin/main`). Für Task-Branches die registrierte Task-Basis angeben. |
| `--layers code,db,app` | Ebenen wählen (Standard alle). |
| `--db-suite <name>` | Migrations-Suite ausführen (wiederholbar). Bekannt: `training-doku-rating-scale`. |
| `--platform ios\|android --runtime <rv>` | trägt Ziel in `quality-evidence.json` ein (nötig für Release-Validierung). |
| `--app-web-export` | Expo-Web-Export als Bundling-Smoke-Test. |
| `--start-docker` | startet Colima, falls Docker nicht läuft. |
| `--keep-db` | Wegwerf-DB nach dem Lauf weiterlaufen lassen (Debugging). |
| `--out <dir>` | Berichtsordner (muss ausserhalb des Ziel-Repos liegen). |

## Ebene 1 – Code

HEAD und Basis werden je als isolierte Kopie erzeugt (`git clone --shared
--no-checkout`, Remote entfernt, detached Checkout im Temp-Verzeichnis). Das
Ziel-Repo wird dabei nur gelesen; Tests, die Git-Historie brauchen (`git show
<alter Commit>`), laufen wie im Worktree. `node_modules` wird aus einem Worktree
verlinkt, dessen `package-lock.json` **byte-gleich** ist (sonst FAIL mit Hinweis
`npm ci`; der Ziel-Worktree wird nie verändert).

| Prüfung | PASS-Regel |
|---|---|
| Typecheck `tsc --noEmit` | exit 0, oder keine Fehler, die nicht auch auf der Basis bestehen |
| ESLint `eslint -f json .` | keine **neuen** Fehler ggü. Basis (Multimenge Datei+Regel+erste Meldungszeile ohne Pfad). Hinweis: Der React Compiler meldet manchmal bestehenden Code neu, wenn eine Änderung eine frühere Analysesperre (z. B. `preserve-manual-memoization`) entfernt – das zählt korrekt als neu sichtbarer Fehler. |
| Jest betroffen | `--findRelatedTests` der geänderten Dateien ohne neue Fehlschläge |
| Jest gesamt | keine neuen Fehlschläge; fehlschlagende Dateien werden auf der Basis nachgeprüft. Neue Fehlschläge werden einmal **isoliert** wiederholt; bestehen sie dann, erscheinen sie als „instabil“ (sichtbar, aber kein Regressionsbeleg). |
| `git diff --check base..HEAD` | exit 0 |

`quality-evidence.json` folgt exakt dem Schema von `scripts/release-quality-evidence.mjs`
(schemaVersion 1, Commit+Tree, SHA-256 je Beleg). Er bleibt absichtlich **nicht
release-tauglich**, bis (a) `--platform/--runtime` gesetzt sind, (b) die Prüfungen
absolut fehlerfrei sind (Release verlangt 0 ESLint-Fehler, nicht nur 0 neue) und
(c) ein **unabhängiger** Reviewer `review` mit Status PASS und eigenem Beleg ergänzt.
Das Prüfzentrum ersetzt keine Release-Guards des Production-Wrappers.

## Ebene 2 – Datenbank

1. Frische Wegwerf-Supabase per Supabase-CLI in Docker (Colima): eigenes
   `project_id = anyvo-verify-center`, Ports 55420–55427, nur DB/Auth/Storage.
   Bestehende lokale Instanzen anderer Worktrees (`anyvo-digital-health-record`)
   werden nicht angefasst. Vor dem Schemaaufbau wird geprüft, dass die DB lokal und leer ist.
2. Schema aus dem geprüften Commit: `supabase/local/baseline.sql`, dann alle
   `supabase/migrations/*.sql` in Reihenfolge; nicht nummerierte Root-Setups an
   den dokumentierten Stellen (`SUBSCRIPTION_NEWBIE_QUOTAS_SETUP.sql`,
   `TRACK_*.sql`, `TRAININGPLAENE_SETUP.sql`). Plan: `scripts/verify-center/db-plan.mjs`.
   **Bekannte Lücken** (nicht versioniert → als ⚠️ gemeldet, kein FAIL):
   `public.trainer_profiles`, `public.is_trainer_module()`.
3. Regressionsfälle `supabase/local/*_cases.sql` / `*_rls_test.sql` (je Transaktion + ROLLBACK).
4. Suiten für Migrationen unter Test: Ausgangszustand = Production vor der Änderung,
   dann **PRE → Migration → Migration erneut (Idempotenz) → POST → Rückweg → ROLLBACK-Fälle**,
   alles in einer Transaktion mit `ROLLBACK`. Zusätzlich:
   - der Abbruchblock der Original-Migration muss greifen (nur lokal in einer Kopie entfernt),
   - **Negativkontrolle**: POST ohne Migration muss scheitern (Tests sind trennscharf),
   - nach dem Lauf keine Rückstände.
   Fachliche Auffälligkeiten erscheinen als `INFO` (Entscheidung nötig, kein FAIL).

### Rekonstruierte Production-Objekte

`supabase/local/verify-center/training_document_prereqs.reconstructed.sql` baut
lokal nach, was `training_document_v1` braucht, aber nicht versioniert ist
(`training_exercises`, Receipts/Epochs/Identities, `td_request`, `td_snapshot`,
`td_payload`, `td_discipline`). Grundlage: Production-Schema-Snapshot aa40c4e0
und das dokumentierte Review vom 2026-11-09 – **keine Live-Abfrage**. Identity-
und Fokus-RPCs sind absichtlich nicht nachgebaut (Aufruf → `NOT_RECONSTRUCTED_LOCALLY`).
Grenze: exakte Token-Werte und Fehlertexte von Production können abweichen.
Wer Production-Definitionen (`pg_get_functiondef`) beschafft, legt sie als
`supabase/drafts/<name>.production-<datum>.sql` ab und ersetzt die Rekonstruktion.

### Neue Suite anlegen

1. Falldateien unter `supabase/local/verify-center/<thema>_{pre,post,rollback}_cases.sql`
   (Muster: `training_document_rating_scale_*`; Hilfsfunktionen `pg_temp.ok/fails/info`,
   Ausgabe `MARKER|PASS|assertions=N`).
2. Eintrag in `SUITES` in `scripts/verify-center/db-plan.mjs` (setup, draft, guardPattern,
   pre, post, rollbackDefinition, rollback, markers).
3. `npm run test:verify-center` und einen realen Lauf mit `--layers db --db-suite <name>`.

## Ebene 3 – App (ohne Gerät)

Stand dieses Macs (2026-11-09): nur Command Line Tools (`xcode-select -p` =
`/Library/Developer/CommandLineTools`), kein `simctl`, kein `xcodebuild`, kein
Android-Emulator. Das Prüfzentrum erkennt das und meldet SKIP; es installiert nichts.

- **Expo Web** (`--app-web-export`): bündelt die App für das Web ohne Backend-Variablen
  (~12 s). Im Lauf vom 2026-11-10 gegen T-184 (`f765156e`): PASS. Scheitert der
  Export, wird die Basis gegengeprüft; scheitert sie auch, heisst das Ergebnis
  „nicht unterstützt (vorbestehend)“ statt FAIL. Taugt als Bundling-/Import-Smoke-Test (fehlende
  Module, Syntax, Router-Struktur). **Nicht** aussagekräftig für native Module
  (GPS/Hintergrund-Tracking, Live Activity, Karten, Kalender, SQLite-Offline,
  Kauf/Abo) und nicht für das Aussehen auf iOS. Für UI-Smoke-Tests einzelner
  Screens wäre zusätzlich ein lokaler Dev-Server (`expo start --web`) mit
  Mock-Backend nötig – bewusst nicht Teil dieses Werkzeugs (würde sonst
  `.env.local` mit echten Projekt-URLs laden).
- **Mit vollem Xcode + iOS Simulator** (von der Nutzerin installiert) ginge zusätzlich:
  lokaler Simulator-Dev-Build (`npx expo run:ios` bzw. das xcodebuild-Rezept aus
  der Projekt-Memory, ohne EAS), Start im Simulator und automatisierte Prüfung mit
  dem Claude-Simulator-Werkzeug (Screenshots, Tippen, Texteingabe, Deep Links,
  Hell/Dunkel). Damit liessen sich Erfassen-/Bearbeiten-Flows klicken, Layout
  und Texte prüfen und Abstürze beim Start erkennen. Voraussetzungen: Xcode-Lizenz
  akzeptiert, iOS-Plattform geladen, CocoaPods. Backend dafür nur die **lokale**
  Wegwerf-Supabase (eigene `.env` mit `http://127.0.0.1:55421`, nie Staging/Prod).
  Nicht ersetzbar bleiben: echte GPS-Bewegung, Hintergrund-Tracking, Push,
  Käufe, Live Activity auf Sperrbildschirm → Geräteabnahme laut Release-Karte.

## Tests des Werkzeugs

```bash
npm run test:verify-center
```

Offline (kein Docker): Delta-Logik, Env-Filter, Guard-Entfernung, Schemaplan,
Argumente, Beleg-Kompatibilität mit `validateQualityEvidence`.
