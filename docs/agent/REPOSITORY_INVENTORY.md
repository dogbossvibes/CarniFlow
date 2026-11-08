# ANYVO — Verzeichnis- und Repository-Inventur (öffentliche Kurzfassung)

Erhoben am 2026-11-08 durch Claude (T-181), ausschliesslich lesend: `git` mit
`GIT_OPTIONAL_LOCKS=0`, `gh` (nur GET), `eas update:list|view` (nur lesend),
Dateisystem-Listings. Nichts verändert, gelöscht, verschoben oder committet.
Alle Werte sind Momentaufnahmen.

> **Warum Kurzfassung:** Das Repository `CarniFlow` ist öffentlich. Die vollständige
> Inventur (einzelne Worktree-Pfade, Ablageorte von Evidenz- und Backup-Dateien,
> andere lokale Projekte) liegt nur lokal ausserhalb des Repos beim Integrator
> (`~/ANYVO_BACKUPS/2026-11-08-claude-uebernahme/t181-lokal/`). Sie wird nicht
> committet. Für aktuelle Aussagen ohnehin frisch prüfen (`npm run agent:wt:list`).

**Zentrale Projektübergabe:**
- [Produktkontext](ANYVO_PRODUCT_CONTEXT.md)
- [Release-Geschichte](ANYVO_RELEASE_HISTORY.md)
- [Architektur und kritische Bereiche](ANYVO_ARCHITECTURE_AND_CRITICAL_AREAS.md)
- [Zusammenarbeit](ANYVO_COLLABORATION_RULES.md)
- [Production-Quellen-Audit](PRODUCTION_SOURCE_AUDIT_2026-11-08.md)

## Kurzantwort

- Lesend erreichbar sind alle lokal vorhandenen ANYVO-Quellen: das App-Repository mit
  allen registrierten Worktrees, eigenständige Klone und lokale Evidenzordner.
- **Nicht eingesehen:** Laufzeitzustände von Production- und Staging-Supabase
  (Datenbank, RLS, Storage, Edge-Function-Deployments), RevenueCat, App Store Connect,
  Google Play, Sentry und Vercel.
- `main` ist **nicht** der Production-Stand. Alle fünf live laufenden OTA-Runtimes
  stammen aus Release-Branches ausserhalb von `main`.
- Eine davon (iOS `sdk58-customer-ios-v1`, Quelle `bf0725d7`) existierte am Stichtag
  nur lokal, nicht auf GitHub.

## 1. Zahlen (2026-11-08)

| Kennzahl | Wert |
|---|---|
| Registrierte Worktrees des App-Repos | 476 (davon 331 in Codex-Projektordnern) |
| davon mit uncommitteten Änderungen | 160 |
| detached | 15 |
| mehr als 50 Commits hinter `origin/main` | 70 |
| Lokale Branches / auf GitHub | 552 / 253 |
| Lokale Branches ohne Spitze auf einem Remote | 94 |
| Commits, die auf keinem Remote liegen | 143 |
| GitHub-`main` = lokaler `origin/main` | `92ec7340` (2026-11-05) |

Keine fehlenden, gesperrten oder `prunable` Worktrees.
Die 143 lokalen Commits und die Änderungen der Worktrees sind seit 2026-11-08 in einer
lokalen, verifizierten Sicherung enthalten (Git-Bundle aller Refs plus Patches je
Worktree; nicht im Repo).

## 2. Production-Zuordnung (frisch aus EAS gelesen, 2026-11-08)

| Plattform | Runtime | veröffentlicht | Quell-Commit | in `main` | auf GitHub |
|---|---|---|---|---|---|
| iOS | `1.0.6-map49-v1` (Build 57) | 2026-11-07 | `d11fcb37` | nein | `fix/ios57-faehrten-label-20261107` |
| iOS | `1.0.8-sdk58-v1` (Build 60) | 2026-11-07 | `3bb78943` | nein | `fix/ios60-faehrten-label-20261107` |
| iOS | `sdk58-customer-ios-v1` (Build 59) | 2026-11-04 | `bf0725d7` | nein | **nein** (lokal gesichert) |
| Android | `1.0.5-gnss-v1` (50) | 2026-11-03 | `21c04eee` | nein | `release/source-21c04eee535a` |
| Android | `1.0.5-greeting-v1` (49) | 2026-11-03 | `da715fc7` | nein | `release/source-da715fc7c558` |

Details: [Production-Quellen-Audit](PRODUCTION_SOURCE_AUDIT_2026-11-08.md).
`ANYVO_MASTER_STATUS.md` (uncommittet im Integrator-Worktree) endet am 2026-11-01 und
bildet die Veröffentlichungen vom 03.–07.11. nicht ab.

## 3. Projektvollständigkeit (Stand `origin/main`)

| Bereich | Vorhanden | Umfang | Bemerkung |
|---|---|---|---|
| App (Expo Router) | ja | `app/` 145, `components/` 130, `features/` 523, `lib/` 31, `services/` 48, `hooks/` 34, `stores/` 7, `i18n/` 17, `types/` 14 Dateien | Expo ~54.0.36 auf main; SDK-58-Linien nur auf Release-/Upgrade-Branches |
| Native Erweiterungen | ja | `modules/` 31, `plugins/` 11 | `ios/` und `android/` nicht versioniert (Prebuild) |
| Supabase-Migrationen | ja | `supabase/migrations/` 36 | zusätzlich 43 historische `*_SETUP.sql` im Root |
| Edge Functions | ja | `supabase/functions/` 14 Funktionen | Deploy-Stand unbekannt |
| RLS-Testfälle | ja | `supabase/local/*.sql`, `supabase/__tests__`, `scripts/qa/*-staging-rls.mjs` | Remote-RLS-Zustand nicht geprüft |
| Website | teilweise | `legal-web/` (mit `vercel.json`); `anyvo-web` nur auf GitHub | welche Website live ist, ist offen |
| Tests | ja | 343 `*.test.*`-Dateien | |
| CI/CD | ja | `.github/workflows/anyvo-quality-gate.yml` | kein Build/Deploy in CI |
| Release-Konfiguration | ja | `eas.json`, `app.json`, `scripts/update-production.mjs`, Guards | |
| Agent-/BMAD-Werkzeuge | ja | `_bmad/` (v6.12.4), `.claude/`, `.agents/`, `.opencode/` | |

## 4. Offene Punkte (nicht geprüft)

1. `bf0725d7` (live, iOS `sdk58-customer-ios-v1`) auf GitHub sichern: separate
   Push-Freigabe nötig.
2. MASTER_STATUS um die Veröffentlichungen vom 03.–07.11. ergänzen (Integrator).
3. Remote-Zustand von Supabase (Migrationsstand, RLS, deployte Functions),
   RevenueCat, Stores, Sentry und Website-Hosting.
4. Inhaltliche Durchsicht der 160 Worktrees mit uncommitteten Änderungen; erfasst sind
   nur Anzahl und Zuordnung.
5. Das Repository ist **öffentlich**: vor jedem Commit von Belegen oder Pfaden prüfen.
