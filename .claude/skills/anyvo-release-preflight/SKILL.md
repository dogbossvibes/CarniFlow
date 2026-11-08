---
name: anyvo-release-preflight
description: Bereitet einen ANYVO-Release (nativer Build, TestFlight, Android-Track, OTA, Store) lesend vor und dokumentiert den Preflight. Veröffentlicht nichts. Verwenden, wenn ein Release vorbereitet oder seine Freigabe geprüft werden soll.
---

# ANYVO Release-Preflight

Build, TestFlight, OTA und Store-Veröffentlichung sind getrennte Schritte; jeder
braucht eine eigene ausdrückliche Freigabe. Dieser Skill führt keinen davon aus.
Release-Befehle sind per Projekt-Guard gesperrt; freigegebene Veröffentlichungen
führt die Nutzerin selbst im eigenen Terminal aus.

## 1. Ziel festhalten
Plattform (ios/android, nie unbeabsichtigt beide) · Kanal · Release-Branch/HEAD ·
Basis = zuletzt veröffentlichter Commit (aus Auftrag oder frischem EAS-Stand,
nie aus Erinnerung oder MASTER_STATUS allein) · erwartete Version/Build-Nummer.

## 2. Lokale Prüfungen
```
node scripts/claude/release-preflight.mjs --base <basis> --platform <ios|android>
node scripts/claude/quality-check.mjs --base <basis> --full
```
- Worktree sauber, HEAD = gewünschter Release-Commit, Basis ist Vorfahre.
- Version, buildNumber/versionCode, runtimeVersion plausibel; app.json vs. package.json.
- Native Änderungen → kein OTA, sondern nativer Build.
- Migrationen im Diff → separate Production-DB-Freigabe; Kundendatenwirkung prüfen.
- Tracking-Änderungen → Feldtest-Beleg; RLS/Abo-Änderungen → Security-Review.

## 3. Pflichtpunkte aus CLAUDE.md (Production-OTA)
`--channel production --environment production --platform <x>` über den Wrapper
`scripts/update-production.mjs`; frischer EAS-Production-Stand mit
Ancestry-Prüfung direkt vor dem Publish; Nachkontrolle (Channel, Branch,
Environment, Platform, Runtime, Group-/Update-ID, gitCommitHash, Message).
`--dry-run` des Wrappers führt die Nutzerin aus oder gibt ihn ausdrücklich frei.

## 4. Dokumentation
Preflight-Tabelle, Blocker, Hinweise, Checks mit Ergebnis, offene Geräteabnahmen,
Rückfallplan (vorheriges Update/Build) im Task-Report unter
„Koordinationsnachweise → Veröffentlichung“ festhalten. Keine Secrets.

## Ausgabe
„Bereit zur Freigabe“ nur ohne Blocker und mit allen Belegen; sonst konkrete
Blocker und nächster Schritt. Nie „production-ready“ ohne Gerätenachweis.
