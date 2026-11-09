# ANYVO — Master-Kontext (Einstieg für jede Sitzung)

Stand: **2026-11-09**. Erstellt von Claude aus der ChatGPT-Projektübergabe und abgeglichen
mit Git, EAS und Supabase, ausschliesslich lesend.

Dieses Dokument ist die **Einstiegsseite**. Es fasst zusammen und verweist auf die
Detaildokumente. Die Regeln in `AGENTS.md` und `CLAUDE.md` gelten weiter und gehen vor.

**Kennzeichnung:**
- **[B]** bestätigt am angegebenen Datum (Git, EAS, Supabase)
- **[N]** Nutzerentscheidung oder Nutzerangabe
- **[H]** historisch, nicht neu geprüft
- **[O]** offen oder widersprüchlich

**Vorrang bei Widerspruch:**
1. frische Git-, EAS- und Supabase-Fakten
2. Nutzerentscheidungen
3. kanonische `ANYVO_MASTER_STATUS.md` und `ACTIVE_WORK.md`
4. dieses Dokument
5. historische Übergaben
6. Annahmen

## 0. Landkarte der Dokumente

| Thema | Dokument |
|---|---|
| Verbindliche Regeln (alle Agenten) | `AGENTS.md` |
| Claude-Regeln, Pflichten bei Production-OTAs | `CLAUDE.md` |
| Rollen, Nutzerentscheidungen, wo was gepflegt wird | [ANYVO_COLLABORATION_RULES.md](ANYVO_COLLABORATION_RULES.md) |
| Produkt, Zielgruppe, Pläne, Rechte, Module, Ideen | [ANYVO_PRODUCT_CONTEXT.md](ANYVO_PRODUCT_CONTEXT.md) |
| Architektur und Datenflüsse aus dem Code | [ANYVO_ARCHITECTURE_AND_CRITICAL_AREAS.md](ANYVO_ARCHITECTURE_AND_CRITICAL_AREAS.md) |
| Builds, Runtimes, OTAs, Linien 59/60, Backend-Drift | [ANYVO_RELEASE_HISTORY.md](ANYVO_RELEASE_HISTORY.md) |
| Kundenprobleme und technische Fehler | [ANYVO_CUSTOMER_ISSUE_HISTORY.md](ANYVO_CUSTOMER_ISSUE_HISTORY.md) |
| Alle wichtigen Verzeichnisse mit Pfad, Branch, Status und Änderungsrecht | [ANYVO_DIRECTORY_MAP.md](ANYVO_DIRECTORY_MAP.md) |
| Production-Quellen und Sicherung | [PRODUCTION_SOURCE_AUDIT_2026-11-08.md](PRODUCTION_SOURCE_AUDIT_2026-11-08.md) |
| Repository-Zahlen | [REPOSITORY_INVENTORY.md](REPOSITORY_INVENTORY.md) |
| Claude-Werkzeuge (Skills, Hooks, Agents) | [CLAUDE_ENVIRONMENT.md](CLAUDE_ENVIRONMENT.md) |
| Koordinationsstand (kanonisch, im main-Worktree; einziger Writer und OTA-Publisher ist der Claude-MASTER) | `ANYVO_MASTER_STATUS.md`, `ACTIVE_WORK.md`; OTA-Übersicht im GitHub-Projekt „ANYVO – Produkt & Entwicklung“ (Release-Karten) |
| Verständnisbericht und Widersprüche | [audits/2026-11-09-verstaendnisbericht.md](audits/2026-11-09-verstaendnisbericht.md) |
| Abschlussbericht der Einrichtung | [audits/2026-11-09-einrichtung-abschlussbericht.md](audits/2026-11-09-einrichtung-abschlussbericht.md) |

## 1. Rollen [N]

- **Claude Code**: primärer Entwicklungsagent. Er analysiert, setzt um, testet,
  dokumentiert und bereitet Releases vor.
- **ChatGPT**: unabhängige Kontrolle (Reviews, Architektur, Sicherheit,
  Release-Koordination). Bestätigt Claude nicht einfach, sondern prüft selbst.
- **Codex**: keine neuen Schreibaufträge.
- **OpenCode/DeepSeek**: Ausweichlösung, nur auf ausdrücklichen Auftrag.
- **GitHub**: versionierte Codebasis.
- **EAS**: tatsächliche Build- und OTA-Stände.
- **Nutzerin**: Produktentscheidungen und **alle Freigaben**, jeweils einzeln. Das gilt für
  Commit, Push, Merge, Build, OTA, Store, Migration und Production-Daten.

## 2. Produkt und Ziele [N][B]

ANYVO ist eine All-in-one-App für den ganzen Hundealltag, nicht nur eine Trainings- oder
Fährten-App.

**Module:**
- Hundeprofile
- Training (IGP, IBGH, Mondioring, Obedience, Agility, Rally, Mantrailing)
- GPS-Fährte
- Trainer Connect
- Smart Coach/KI
- Kalender
- Gesundheit (Gewicht, Entwurmung, Läufigkeit, Akte)
- Journal und Medien
- Dokumente, Statistiken, Checklisten

**Sprachen:** Deutsch, Schweizerdeutsch, Französisch, Italienisch, Englisch.

**Pläne laut Code:**
- **NEWBIE**: kostenlos, Monatsquote 1 Hund, 2 Trainings und **1 Fährte**. Die Fährtenquote
  ist auf Production bestätigt [B 09.11.].
- **ACTIVE**
- **FOUNDER_ACTIVE**: begrenzt
- **TRAINER**: ACTIVE plus Trainer-Hub

**Ziele:**
- langfristig wartbares Produkt;
- Stabilität und Datenintegrität vor Tempo;
- neue Versionen bauen auf nachweislich funktionierenden Ständen auf.

## 3. Begriffe, die man nicht verwechseln darf

| Begriff | Bedeutung |
|---|---|
| **Build-Nummer** | iOS `buildNumber` bzw. Android `versionCode`, **getrennt je Plattform**: iOS 49 ≠ Android 49 |
| **App-Version** | Store-Version. Mehrere Builds können sie teilen (iOS 49, 56 und 57 sind alle 1.0.4) |
| **Runtime** | Ein OTA erreicht nur Builds mit **gleicher** Runtime |
| **OTA-Update** | JS-Bundle über EAS Update (`production`). Ersetzt keinen nativen Code |
| **Quell-Commit** | `gitCommitHash` eines Builds oder OTAs. **Keiner** der Production-Quell-Commits liegt in `main` |
| **Store-Veröffentlichung** | eigener Schritt. Für Claude nicht einsehbar |

## 4. Referenz-Builds [B: EAS + Git, 09.11.]

- **iOS 49** (1.0.4, Runtime `1.0.4`, `3f7c2e74`): Ausgangspunkt der Kundenlinie. Ein
  Kartenproblem beim Öffnen einer Fährte im Journal wurde mit 56/57 behoben.
- **iOS 57** (1.0.4, Runtime `1.0.6-map49-v1`, `17443616`): **Kundenreferenz**. Er stammt
  über 56 von 49 ab. Aktuelles OTA `d11fcb37` (07.11.).
- **iOS 60** (1.0.8, SDK 58, Runtime `1.0.8-sdk58-v1`, `3858c0ff`): SDK-58-Migration auf
  Basis von 57. Aktuelles OTA `3bb78943` mit Trainingsübersicht und Fährten-Label.
- **iOS 59** (1.0.7, SDK 58, `00376126` → OTA `bf0725d7`): zweite SDK-58-Linie mit
  Zusatzfunktionen. Ihr fehlen die letzten zwei 57-OTAs. Liegt **nicht auf GitHub**. Wird
  nicht ungeprüft mit 60 gemischt.
- **Android 49/50** (1.0.5, Runtimes `greeting-v1`/`gnss-v1`). Achtung bei „Build 49“:
  Damit ist meist iOS gemeint [O].

Details, Abstammungsbaum und Vergleich 59 und 60: [Release-Historie](ANYVO_RELEASE_HISTORY.md).

## 5. Production-Situation [B: EAS und Supabase, 09.11.]

- **Mindestens 16 Runtimes** haben Production-OTAs, 10 auf iOS und 6 auf Android. Fünf
  davon bekamen OTAs ab dem 03.11.
  - iOS 57: `1.0.6-map49-v1`
  - iOS 60: `1.0.8-sdk58-v1`
  - iOS 59: `sdk58-customer-ios-v1`
  - Android 50: `gnss-v1`
  - Android 49: `greeting-v1`
- Für die übrigen 11 stammt das letzte OTA vom 29.10. oder 10.10. Die Geräteverteilung ist
  unbekannt [O].
- **Ob die OTAs auf Geräten aktiv sind, ist nicht belegt.** iOS 60 meldete `launch=embedded` [O].
- Supabase Production `axkkhyqrjrtbkumaulta`, Staging `cbhrxkjclakzlvajyvfn`.
- RLS ist auf allen Tabellen in `public` aktiv.
- **Migrations-Drift [O]:** `20261008190000` liegt in allen Live-Clients, ist aber nicht
  angewendet. Zwei angewendete Migrationen liegen nur auf Seitenbranches.
- **Der deployte Abo-Code liegt in keinem Git-Stand** [B]. Betroffen sind
  `subscription-sync` v5 und die Webhooks v9/v8 (28.10.), dazu die DB-Funktionen
  `subscription_*_v1`.
- **Folge:** Jede Änderung an Backend, RLS oder Edge Functions muss mit **allen** diesen
  Client-Ständen funktionieren, nicht nur mit `main`.

## 6. Architektur in Kürze

- Expo/React Native (SDK 54, Linie 60: SDK 58), expo-router, TypeScript.
- Backend: Supabase (Postgres mit RLS, Edge Functions, Storage).
- Abos: RevenueCat.
- Tracking: eigenes natives Modul `modules/anyvo-precision-location` plus
  `features/tracking`.
- Premium vergibt **nur der Server**: RevenueCat → `subscription-sync` und Webhooks →
  `subscriptions`/`user_capabilities`/`profiles`. Die deployte Logik schaltet im Zweifel
  nicht frei.

Details zu GPS/IMU, RLS, Abo, Trainer Connect, Auth, Offline, Resume und Datenschutz:
[Architektur](ANYVO_ARCHITECTURE_AND_CRITICAL_AREAS.md).

## 7. Kritische Bereiche und Grundregeln

1. **Fährte und GPS**
   - Die gelegte Fährte geht vor Kartenkosmetik.
   - GNSS- und IMU-Rohdaten bleiben von der Analyse getrennt.
   - Keine Vereinfachung ohne Datenfluss-Analyse, Tests und Feldtest.
2. **Abos, Rechte, RLS**: serverseitig. Kundendaten nie vermischen. Der alte
   Client-Schreibpfad wird nicht reaktiviert.
3. **Release**
   - OTA nur über den Wrapper mit `--environment production` und Preflight.
   - Ein Build ist keine Veröffentlichung, ein OTA ist kein nativer Build.
4. **SDK-Migration ≠ Funktionsentwicklung.**
5. **Öffentliches Repo**: keine Secrets, keine Personendaten, keine absoluten lokalen Pfade.
6. **Fremde Worktrees**: nie verändern, aufräumen oder löschen.

## 8. Bekannte Kundenprobleme (Kurzfassung)

Vollständig mit Ursache, Fix, Teststatus und Risiko:
[Kundenprobleme](ANYVO_CUSTOMER_ISSUE_HISTORY.md).

- **ACTIVE-Freischaltung** (#7): Die zwei gemeldeten Kundinnen sind seit dem 28.10. ACTIVE
  und laut Nutzerin wieder in Ordnung [B/N]. Offen ist der Webhook-Fehler
  `INVALID_PROVIDER_DATE` vom 04.11. (betroffene Person unbekannt).
- **OTA nicht aktiv** auf iOS 60 (`launch=embedded`) [O].
- GPS-Abweichungen zwischen Geräten, Winkel- und Richtungswechsel,
  Kartenfehler/Absturz in der 49er-Linie, Trainer Connect: siehe Detaildokument.

## 9. Verzeichnisse und Arbeitsort

- Claude arbeitet im Worktree `~/canisflow-worktrees/anyvo-claude-dev-environment`.
- Für neue Aufgaben gibt es eigene Task-Worktrees (`npm run agent:wt:create`, Anlegen nur
  mit Freigabe).
- `~/canisflow/canisflow` ist nur das Git-Verzeichnis, kein Arbeitsordner.
- Alle Pfade: [Verzeichniskarte](ANYVO_DIRECTORY_MAP.md).

## 10. Offene Aufgaben und Prioritäten

Diese Liste ist eine Priorisierung, **keine Umsetzungsfreigabe**. Der Sitzungsstart-Hook
zeigt die P0-Punkte automatisch an.

- **P0** Offenen Sicherheitsbefund zu Schreibrechten auf Abo- und Berechtigungstabellen beheben (Details nur lokal bei der Nutzerin)
- **P0** Webhook-Fehler `INVALID_PROVIDER_DATE` (04.11.) klären: Ist eine zahlende Person nicht freigeschaltet?
- **P0** Deployten Abo-Code (Edge Functions und `subscription_*_v1`) in Git sichern
- **P0** Migrations-Drift Production gegenüber Git klären (`20261008190000` u. a.)
- **P0** Linie 59 (`bf0725d7`) auf GitHub sichern (separater Auftrag)
- **P0** Geräteverteilung je Runtime und Store-Stände klären (Production-Transparenz)
- **P0** Serverseitige Rechte und RLS gegen alle Live-Clients prüfen
- P1 GPS/IMU-Qualität, Winkel- und Richtungswechsel, Fährtendarstellung
- P1 Stabilität von Build 60 und OTA-Aktivierung (`launch=embedded`)
- P1 iOS- und Android-Regressionstests. Xcode fehlt lokal, Android-Emulatoren sind vorhanden
- P1 Trainer Connect: Rechte für ACTIVE prüfen
- P2 Smart Coach/KI, UX, weitere Module, Website und Marketing

## 11. Grundsatz vor Refactorings und Vereinheitlichung

Vor dem Zusammenführen von Linien oder grösseren Umbauten:
1. Die Ziel-Runtimes und ihre Quell-Commits benennen.
2. Für jede betroffene Linie die Unterschiede dokumentieren (Funktionen, native Module,
   Backend-Vertrag).
3. Klären, welche installierten Builds weiter bedient werden müssen.
4. Die Entscheidung der Nutzerin einholen.

Ohne diese Schritte gibt es keine Vereinheitlichung.
