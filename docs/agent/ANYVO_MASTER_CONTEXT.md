# ANYVO — Master-Kontext (Einstieg für jede Sitzung)

Stand: **2026-11-09** · Erstellt von Claude aus der ChatGPT-Projektübergabe, abgeglichen
mit Git, EAS und Supabase (nur lesend).

Dieses Dokument ist die **Einstiegsseite**. Es fasst zusammen und verweist auf die
Detaildokumente. Es ersetzt keine Regel aus `AGENTS.md` und `CLAUDE.md`.

**Kennzeichnung:**
- **[B]** bestätigt am angegebenen Datum aus Git, EAS oder Supabase
- **[N]** Nutzerentscheidung oder Nutzerangabe
- **[H]** historische Angabe (ChatGPT-Übergabe, alte Doku), nicht neu geprüft
- **[O]** offen oder widersprüchlich

**Vorrang bei Widerspruch:** frische Git-, EAS- und Supabase-Fakten > Nutzerentscheidungen >
kanonischer `ANYVO_MASTER_STATUS.md`/`ACTIVE_WORK.md` > dieses Dokument >
historische Übergaben > Annahmen.

## 0. Landkarte der Dokumente

| Thema | Dokument |
|---|---|
| Verbindliche Regeln (alle Agenten) | `AGENTS.md` |
| Claude-spezifische Regeln, Production-OTA-Pflichten | `CLAUDE.md` |
| Rollen, Nutzerentscheidungen vom 08.11. | [ANYVO_COLLABORATION_RULES.md](ANYVO_COLLABORATION_RULES.md) |
| Produkt, Module, Pläne | [ANYVO_PRODUCT_CONTEXT.md](ANYVO_PRODUCT_CONTEXT.md) |
| Architektur und kritische Bereiche | [ANYVO_ARCHITECTURE_AND_CRITICAL_AREAS.md](ANYVO_ARCHITECTURE_AND_CRITICAL_AREAS.md) |
| Builds, Runtimes, OTA-Herkunft | [ANYVO_RELEASE_HISTORY.md](ANYVO_RELEASE_HISTORY.md) |
| Production-Quellen und Sicherung | [PRODUCTION_SOURCE_AUDIT_2026-11-08.md](PRODUCTION_SOURCE_AUDIT_2026-11-08.md) |
| Worktrees und Repository-Zahlen | [REPOSITORY_INVENTORY.md](REPOSITORY_INVENTORY.md) |
| **Alle wichtigen Verzeichnisse mit absoluten Pfaden, Branch, Status und Änderungsrecht** | [ANYVO_DIRECTORY_MAP.md](ANYVO_DIRECTORY_MAP.md) |
| Claude-Werkzeuge (Skills, Hooks, Agents) | [CLAUDE_ENVIRONMENT.md](CLAUDE_ENVIRONMENT.md) |
| Koordinationsstand (kanonisch, im main-Worktree) | `ANYVO_MASTER_STATUS.md`, `ACTIVE_WORK.md` |
| Verständnisbericht und Widersprüche 09.11. | [audits/2026-11-09-verstaendnisbericht.md](audits/2026-11-09-verstaendnisbericht.md) |

## 1. Rollen [N]

- **Claude Code**: primärer Entwicklungsagent. Er analysiert, setzt um, testet,
  dokumentiert und bereitet Releases vor.
- **ChatGPT**: unabhängige Kontrolle (Reviews, Architektur, Sicherheit, Release-Koordination).
  ChatGPT bestätigt Claudes Aussagen nicht einfach, sondern prüft sie selbst.
- **Codex**: bekommt keine neuen Schreibaufträge. **OpenCode/DeepSeek** ist die
  Ausweichlösung und arbeitet nur auf ausdrücklichen Auftrag.
- **Nutzerin**: trifft Produktentscheidungen und **alle Freigaben**. Jeder Commit,
  Push, Merge, Build, jedes OTA, jeder Store-Upload, jede Migration und jede Änderung
  an Production-Daten braucht eine eigene, ausdrückliche Freigabe.

## 2. Produkt in einem Absatz [N][B]

ANYVO ist eine All-in-one-App für Hundehalter, keine reine Trainings- oder Fährten-App.
Sie umfasst:
- Hundeprofile
- Training (IGP/Fährte, IBGH, Mondioring, Obedience, Agility)
- GPS-Fährtenarbeit
- Trainer Connect
- Smart Coach/KI
- Kalender
- Gesundheit (Gewicht, Entwurmung, Läufigkeit, Akte)
- Journal und Medien
- Dokumente, Statistiken, Checklisten

Pläne laut Code [B]: **NEWBIE** (kostenlos, Monatsquote 1 Hund / 2 Trainings / **1 Fährte**
[N 08.11.]), **ACTIVE**, **FOUNDER_ACTIVE** (wie ACTIVE, begrenzte Plätze) und **TRAINER**
(ACTIVE plus Trainer-Hub). Details: Produktkontext Abschnitt 3.

## 3. Begriffe, die man nicht verwechseln darf

| Begriff | Bedeutung |
|---|---|
| **Build-Nummer** | iOS `buildNumber` bzw. Android `versionCode`. **Getrennt pro Plattform**: iOS 49 ≠ Android 49 |
| **App-Version** | Store-Version, z. B. 1.0.4. Mehrere Builds können dieselbe haben |
| **Runtime** | bestimmt, welche OTAs ein installierter Build annimmt. Ein OTA erreicht nur Builds mit **gleicher** Runtime |
| **OTA-Update** | JS-Bundle über EAS Update, Kanal `production` → Branch `production`. Ersetzt nichts Natives |
| **Quell-Commit** | `gitCommitHash` eines Builds oder OTAs. **Kein** Production-Quell-Commit liegt in `main` |

## 4. Referenz-Builds 49, 57, 60 (und 59) [B: EAS + Git, 09.11.]

**„Build 49“ ist zweideutig [O]:**
- **iOS Build 49**: 1.0.4, Runtime `1.0.4`, 06.10., Commit `3f7c2e74` (in `main`).
- **Android Build 49**: 1.0.5, Runtime `1.0.5-greeting-v1`, 22.10., Commit `f2ed8d78`.

Die Runtime `…-map49-…` und das Build-Profil `ios49-map-repair` meinen die
**iOS-49-Linie**. Diese Doku verwendet „Build 49“ = iOS 49, solange die Nutzerin nichts anderes sagt.

### Abstammung iOS

```
iOS 49  (3f7c2e74, 1.0.4, rt 1.0.4)
 ├─ iOS 50–55 (1.0.5, native Sensor-/Watch-/Motion-Linie, rt 1.0.5 / motion-v2..v4)
 │     → NICHT Vorfahr von 56/57 (Seitenlinie)
 └─ iOS 56 (e8a754f3, 1.0.4, rt 1.0.5-map49-v1)   „Map-Reparatur der 49er-Linie“
     └─ iOS 57 (17443616, 1.0.4, rt 1.0.6-map49-v1)   ← Kundenreferenz [N]
         ├─ iOS 59 (00376126, 1.0.7, SDK 58, rt sdk58-customer-ios-v1)  nur lokal + Bundle
         └─ iOS 60 (3858c0ff, 1.0.8, SDK 58, rt 1.0.8-sdk58-v1)   SDK-58-Migration auf 57
```

- 57 ist der Merge-Base von 59 und 60. Die **59er- und die 60er-Linie sind getrennt** und
  dürfen nicht ungeprüft zusammengeführt werden [B][N].
- iOS 58 (1.0.6, `6722b88f`) war ein reiner SDK-58-QA-Build auf Kanal `sdk58-test` [B].
- Die App-Version von 56/57 ist 1.0.4, also **gleich wie Build 49**. Das passt zur
  Reparatur der 49er-Linie. Die Angabe „1.0.6 veröffentlicht“ in alter Doku meint
  wahrscheinlich die Runtime [O].

### Abstammung Android

`3f7c2e74` → Android 49 (`f2ed8d78`, Runtime greeting-v1) → Android 50 (`c4649ad5`, Runtime
gnss-v1, Satelliten-Diagnose). Android 51 (1.0.6) ist ein reiner SDK-58-QA-Build.

## 5. Production-Situation [B: EAS, 09.11.]

**Wichtig: Nicht 5, sondern mindestens 16 Runtimes haben Production-OTAs.** Die Liste
„5 Runtimes“ vom 08.11. enthielt nur die zuletzt aktualisierten. Für die übrigen wurde
zuletzt am 29.10. oder früher ein OTA veröffentlicht. Geräte mit diesen Builds laufen weiter.

| Plattform | Runtime | Build(s) | letztes OTA (UTC) | Quelle | auf GitHub |
|---|---|---|---|---|---|
| iOS | `1.0.6-map49-v1` | 57 | 07.11. 16:29 | `d11fcb37` | ja |
| iOS | `1.0.8-sdk58-v1` | 60 | 07.11. 16:26 | `3bb78943` | ja |
| iOS | `sdk58-customer-ios-v1` | 59 | 04.11. | `bf0725d7` | **nein** (lokales Bundle) |
| iOS | `1.0.5-map49-v1` | 56 | 29.10. 03:14 | `17443616` | ja |
| iOS | `1.0.5-motion-v4` | 55 | 29.10. 08:07 | `0e16001d` | ja |
| iOS | `1.0.5-motion-v3` | 53 | 29.10. 02:54 | `a4eb7ffe` | ja |
| iOS | `1.0.5-motion-v2` | 52 | 29.10. 02:58 | `6c304948` | ja |
| iOS | `1.0.5` | 50, 51 | 29.10. 02:50 | `67895981` | ja |
| iOS | `1.0.4` | **49** | 29.10. 02:46 | `936131a1` | ja |
| iOS | `1.0.3` | 46–48 | 10.10. | `7a1bfbb4` | ja |
| Android | `1.0.5-gnss-v1` | 50 | 03.11. | `21c04eee` | ja |
| Android | `1.0.5-greeting-v1` | **49** | 03.11. | `da715fc7` | ja |
| Android | `1.0.5` | 47, 48 | 29.10. 03:06 | `e2957bd8` | ja |
| Android | `1.0.4` | 45 | 29.10. 03:01 | `e0198c71` | ja |
| Android | `1.0.3` | 42–44 | 10.10. | `2f513dbd` | ja |
| Android | `1.0.1` | ≤41 | 10.10. | `6070f02c` | ja |

Nicht bekannt [O]:
- wie viele Geräte auf welcher Runtime laufen (EAS-Insights);
- welche Builds im Store öffentlich sind und welche nur in TestFlight;
- ob OTAs auf den Geräten tatsächlich aktiv sind. Auf iOS 60 meldete ein Gerät am 07.11.
  `launch=embedded`.

**Folge:** Jede Änderung an Backend, Datenbank oder RLS muss mit **allen** diesen
Client-Ständen verträglich sein, nicht nur mit `main`.

## 6. Backend und Abos [B: Supabase, 09.11.]

- Production-Supabase `axkkhyqrjrtbkumaulta`, Staging `cbhrxkjclakzlvajyvfn`
  (Guard: `scripts/guard-prod-supabase.mjs`).
- Die Live-Apps schalten bezahlte Pläne **nur serverseitig** frei: über `subscription-sync`
  und die RevenueCat-Webhooks (iOS `revenuecat-webhook`, Android `revenuecat-webhook-google`).
- **Der deployte Code dieser drei Edge Functions (Stand 28.10.) liegt in keinem Git-Stand [O].**
  - Er arbeitet streng nach dem Prinzip „im Zweifel nicht freischalten“.
  - Am 04.11. lehnte der iOS-Webhook mehrere Ereignisse mit `INVALID_PROVIDER_DATE` ab.
  - Die zwei gemeldeten Kundinnen (Issue #7) sind seit dem 28.10. korrekt ACTIVE. Die
    Nutzerin hat bestätigt, dass es in der App funktioniert.
- Abo-Code nie auf den alten Client-Schreibpfad zurückbauen. Premium wird nur serverseitig vergeben.

## 7. Kritische Bereiche (Kurzfassung)

1. **Fährte und GPS**: die tatsächlich gelegte Fährte geht vor Kartenkosmetik. Rohdaten
   (GNSS, IMU) und Analyse bleiben getrennt. Keine Vereinfachung ohne Datenfluss-Analyse,
   Tests und Feldtest.
2. **Abos, Berechtigungen, RLS**: serverseitig. Kundendaten nie vermischen.
3. **Release**: OTA nur über den Wrapper mit `--environment production` und Preflight
   (`CLAUDE.md`). Ein Build ist keine Veröffentlichung, ein OTA ist kein nativer Build.
4. **SDK-Migration ≠ Funktionsentwicklung**: getrennte Aufgaben, Branches und Freigaben.

Details: Architektur-Dokument.

## 8. Repository und Arbeitsweise [B: 08.11.]

- GitHub `dogbossvibes/CarniFlow` ist **öffentlich**. Keine Secrets und keine
  personenbezogenen Daten committen.
- Rund 476 Worktrees, davon etwa 160 mit uncommitteten Änderungen. Fremde Worktrees nie
  verändern, nicht aufräumen, nicht löschen. Vollsicherung liegt lokal (siehe Audit).
- `main` (`92ec7340`) ist **nicht** der Kundenstand.
- Pro Aufgabe ein eigener Task-Worktree (`npm run agent:wt:create`). Vorher Branch, HEAD
  und Status prüfen. Startablauf: `/anyvo-start`.

## 9. Grundsatz vor Refactorings und Vereinheitlichung

Bevor Linien zusammengeführt oder grössere Umbauten begonnen werden:
1. Die Ziel-Runtimes und ihre Quell-Commits benennen.
2. Für jede betroffene Linie die Unterschiede dokumentieren (Funktionen, native Module, Backend-Vertrag).
3. Klären, welche installierten Builds weiter bedient werden müssen.
4. Entscheidung der Nutzerin einholen.

Ohne diese Schritte keine Vereinheitlichung.
