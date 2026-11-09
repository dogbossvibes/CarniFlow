# Verständnisbericht Claude — 2026-11-09

Zweck: ChatGPT und die Nutzerin sollen prüfen können, ob Claude die Builds 49, 57 und 60,
die Produktarchitektur und die tatsächliche Production-Situation richtig verstanden hat.

Grundlage: ChatGPT-Projektübergabe (09.11.), `AGENTS.md`, `CLAUDE.md`, die T-181-Dokumente
sowie frische Daten. Dazu gehören:
- EAS `build:list` und `update:list` (Production-Branch, 200 Updates);
- Git-Abstammung im lokalen Repository;
- Supabase Production (Edge Functions gelistet und heruntergeladen; zwei Kundenkonten per
  SELECT gelesen, mit Freigabe).

Alles nur lesend.

Kennzeichnung: **[B]** bestätigt am 09.11., **[N]** Nutzerangabe, **[H]** historisch,
nicht neu geprüft, **[O]** offen, **[V]** Vermutung.

---

## 1. Was ich verstanden habe

### 1.1 Produkt

- ANYVO ist eine All-in-one-App für den ganzen Hundealltag [N]. Training und Fährte sind
  wichtige Teile, aber nicht das ganze Produkt.
- Die **GPS-Fährte** ist das wichtigste Unterscheidungsmerkmal und der empfindlichste Code
  [N]. Dort gilt:
  - Die gelegte Fährte geht vor Kartenkosmetik.
  - GNSS- und IMU-Rohdaten bleiben von der Analyse getrennt.
  - Ohne Datenfluss-Analyse, Tests und Feldtest wird nichts vereinfacht.
- **Abos:** Pläne vergibt nur der Server. RevenueCat ist die Quelle, Supabase spiegelt sie
  in `subscriptions`, `user_capabilities` und `profiles` [B]. Der Client ist nie die Autorität.

### 1.2 Build 49 — zwei verschiedene Builds [B]

- **iOS 49:** 1.0.4, Runtime `1.0.4`, 06.10.2026, Commit `3f7c2e74`. Liegt in `main`.
- **Android 49:** 1.0.5, Runtime `1.0.5-greeting-v1`, 22.10.2026, Commit `f2ed8d78`.
  Ist heute eine der aktiven Production-Runtimes.

Wenn die Übergabe von „Build 49 mit Kartenfehler im Journal“ spricht, meint sie nach meinem
Verständnis **iOS 49**:
- Darauf folgten iOS 56 und 57 mit dem Build-Profil `ios49-map-repair`.
- Ihre Runtimes heißen `…-map49-…`.
- Ihre App-Version ist **wieder 1.0.4**, wie bei 49.
- Der Commit von 56 lautet „guard legacy map children“.

**Bitte bestätigen [O].**

Die iOS-Builds 50–55 (1.0.5, native Sensor-, Watch- und Motion-Linie) zweigen von 49 ab.
Sie sind **keine** Vorfahren von 56 und 57 [B]. Die Kundenlinie ging also von 49 direkt zur
Kartenreparatur und hat die 1.0.5-Sensorlinie ausgelassen. **Ob das gewollt war [O]**, weiß
ich nicht.

### 1.3 Build 57 [B]

- 1.0.4 (57), Runtime `1.0.6-map49-v1`, EAS-Build `442f7bc3`, Commit `17443616`, SDK 54.
- Er stammt von 49 und 56 ab.
- Er ist die gemeinsame Basis (Merge-Base) von 59 und 60.
- Aktueller OTA-Stand: `d11fcb37` vom 07.11. Das ist ein reiner i18n-Fix: „Fährten“-Label.
- Nach Nutzerangabe ist das die Kundenreferenz, die gut funktioniert [N].

### 1.4 Build 60 [B]

- 1.0.8 (60), Runtime `1.0.8-sdk58-v1`, EAS-Build `3b15fc9c`, Commit `3858c0ff`, SDK 58.
- Inhalt: Build 57 (+ OTA-Stand `3d21d664`), dazu die SDK-58-Migration `dbb23a7f` und der
  RevenueCat-Bump `3858c0ff`.
- Zwei OTAs am 07.11.:
  - die Trainingsübersicht (von der Nutzerin als gewollt bestätigt [N]);
  - das Fährten-Label (`3bb78943`).
- **Ob das OTA auf den Geräten aktiv ist, ist nicht belegt.** Ein Feldtest vom 07.11.
  meldete `launch=embedded`, `updateId=null` [B: Issue #15].

### 1.5 Build 59 (zweite SDK-58-Linie) [B]

- 1.0.7 (59), Runtime `sdk58-customer-ios-v1`, Commit `00376126`. Aktuelles OTA `bf0725d7`.
- Beide Commits liegen **nicht auf GitHub**, nur im lokalen Bundle.
- Die Linie zweigt ebenfalls von 57 ab und enthält zusätzliche Funktionsänderungen.
- Sie wird mit 60 nicht ungeprüft zusammengeführt [N].

### 1.6 Production-Situation [B]

- **Mindestens 16 Runtimes** haben Production-OTAs, 10 auf iOS und 6 auf Android (Tabelle
  im Master-Kontext, Abschnitt 5).
- 5 davon bekamen OTAs ab dem 03.11. Für die übrigen 11 stammt das letzte OTA vom 29.10.
  oder 10.10.
- Keiner der Production-Quell-Commits liegt in `main`. `main` (`92ec7340`) ist **nicht** der
  Kundenstand.

**Folge:** Jede Änderung an Backend, RLS oder Edge Functions muss mit allen diesen
Client-Ständen funktionieren.

## 2. Widersprüche und Korrekturen gegenüber der ChatGPT-Übergabe

| # | Übergabe sagt | Befund | Status |
|---|---|---|---|
| W1 | Fünf Production-Runtimes | Mindestens **16** Runtimes mit Production-OTAs. Die Inventur vom 08.11. listete nur die zuletzt aktualisierten | [B] korrigiert |
| W2 | „Build 49“ als ein Stand | iOS 49 und Android 49 sind verschiedene Builds | [O] Nutzerin bestätigt Bedeutung |
| W3 | OTA-Quelle Build 57: `3d21d664` vs. `d11fcb37` | Beides stimmt, aber zu verschiedenen Zeiten. `3d21d664` war das OTA vom 03.11., `d11fcb37` folgte am 07.11. als direkter Nachfolger (nur i18n) | [B] aufgelöst |
| W4 | Build 57 = App-Version 1.0.4 | Stimmt laut EAS. Die alte Doku nennt „1.0.6 veröffentlicht“, das ist vermutlich die Runtime `1.0.6-map49-v1` | [B] / [V] |
| W5 | NEWBIE: „keine Fährtenaufzeichnung“ | Nutzerentscheidung 08.11.: **1 Fährte pro Monat**, so auch im Code (Server-Quote) | [N][B] Übergabe veraltet |
| W6 | Drei Abostufen | Im Code vier Pläne: zusätzlich **FOUNDER_ACTIVE** (begrenzte Plätze) | [B] |
| W7 | Fünf App-Sprachen | Code hat Locale-Dateien de, gsw, en, fr, it plus `de-CH`/`de-DE`-Varianten. Ob de-DE als eigene Sprache gilt, ist Definitionssache | [B] / [O] |
| W8 | Abo-Fall Android: `plan = NULL`, Store falsch | Am 28.10. um 10:07 UTC korrigiert. Beide Kundinnen sind seitdem konsistent ACTIVE; laut Nutzerin funktioniert es in der App | [B] erledigt |
| W9 | „Fixes vom 07./08.11. vorbereitet“ (Sicherheit, Android-Webhook) | In keinem lokalen Worktree als Änderung auffindbar | [O] |
| W10 | Edge Functions „bestätigt deployed“ | Stimmt (v5/v9/v8, 28.10.). Der **deployte Code liegt aber in keinem Git-Stand** | [B] Risiko |
| W11 | iOS 15.1 als Mindestversion (Build 57) | Der Commit von 49 erwähnt iOS 15.1. Für SDK 58 (Build 60) habe ich das Deployment-Target nicht geprüft | [O] |
| W12 | Testzahlen 340 Suites / 4201 Tests | Am 09.11. im T-181-Worktree erneut bestanden | [B] |

## 3. Fehlende Informationen

1. Store-Stände: Welche Builds sind im App Store bzw. in Google Play öffentlich, welche nur
   in TestFlight oder interner Freigabe?
2. Verteilung der Geräte auf die Runtimes (EAS-Insights). Ohne sie ist unklar, welche alten
   Runtimes noch bedient werden müssen.
3. Ob die OTAs auf Geräten aktiv sind (iOS 60 `launch=embedded`).
4. Wen die Webhook-Fehler `INVALID_PROVIDER_DATE` vom 04.11. betreffen. Möglicherweise
   eine dritte zahlende Person. Dafür werden RevenueCat-Daten benötigt.
5. Der Quellcode der deployten Abo-Edge-Functions und der zugehörigen DB-Funktionen gehört
   gesichert und versioniert.
6. War der Wechsel 49 → 56/57 unter Auslassung der 1.0.5-Sensorlinie (50–55) eine bewusste
   Produktentscheidung? Was davon fehlt heute in 57/60?
7. Ist die Meldung „ACTIVE-Nutzer können keinen Trainer hinzufügen“ (Trainer Connect) noch
   aktuell? Nicht geprüft.

## 4. Was ich daraus für die Arbeit ableite

- Vor jeder Vereinheitlichung von Linien: Ziel-Runtimes nennen, Unterschiede je Linie
  dokumentieren, Entscheidung der Nutzerin einholen (Master-Kontext, Abschnitt 9).
- Backend-Änderungen gegen die ältesten noch bedienten Clients prüfen, nicht nur gegen `main`.
- Abo-Code: zuerst den deployten Stand in Git sichern, dann ändern.
