# Session 2026-07-03 · Resume-Punkt (hier weitermachen)

Zusammenfassung des Standes zum Weiterarbeiten. **Nutzer-Wunsch: Push + Build 28
noch NICHT ausführen — warten, aber die Aufgabe beibehalten.**

## Aktueller Stand (Git/Build)
- Branch: **`feat/track-module-rewrite`** (PR **#3** → `main`, offen)
- `app.json`: iOS `buildNumber 27` / Android `versionCode 27`
- **7 Commits lokal, noch NICHT gepusht** (ab `f1ba798`).
- **Build 28 ist noch NICHT gebaut** — das ist die pausierte Hauptaufgabe.
- Letzter tatsächlicher Store-Build: **Build 27** (iOS TestFlight + Android Google Play internal).

## ▶️ NÄCHSTER SCHRITT (wenn der Nutzer „los" sagt)
1. **Pushen** (`git push`) + **Build 28 (iOS + Android)** mit Auto-Submit:
   - Build-Nummer 27 → 28 in `app.json` (buildNumber + versionCode) bumpen, committen.
   - `npx eas build --profile production --platform all --auto-submit --non-interactive`.
   - Build 28 enthält die noch nicht ausgelieferten Fixes (Play-Foreground-Service-Deklaration,
     App-Sperre, positionSource/native GPS, Kalender-Fix, E-Mail-Änderung-Entfernung).

## Offene To-dos (Nutzer-Aktion / später)
- 💳 **Anthropic-Guthaben aufladen** (console.anthropic.com → Billing, ~5 $) — sonst liefert die
  KI-Analyse nur die freundliche Fehlermeldung. Function `ai-analysis` ist gefixt + auf Haiku deployed.
- 🤖 **Google-Play-Deklarationen** ausfüllen (Texte stehen im Chat dieser Session):
  - Foreground-Service (Standort) + Hintergrund-Standort-Deklaration + Demo-Video.
  - Nach Build 28 im generierten `AndroidManifest.xml` prüfen: `ACCESS_BACKGROUND_LOCATION`
    + `FOREGROUND_SERVICE_LOCATION` vorhanden, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` NICHT.
- 📧 **SMTP/Resend** im Supabase-Projekt konfigurieren → dann E-Mail-Änderung wieder aktivieren
  (`updateEmail` liegt dormant in `services/auth.ts`; UI in `edit-profile.tsx` wieder freischalten).
- ⚙️ **`eas.json` production `SENTRY_DISABLE_AUTO_UPLOAD`** steht auf `"false"` (aktiv) — prüfen/entscheiden.

## Optionale nächste Schritte (angeboten, offen)
- KI-Coach (`generate-coach-summary`) + Empfehlungen (`recommend`) auch auf günstigeres Modell (Haiku/Sonnet).
- Endnutzer-Fehlermeldung ist bei der Analyse schon freundlich; ggf. gleiches Muster für Coach/Empfehlungen.
- Rationale-Screen vor der Hintergrund-Standort-Abfrage (bessere Play-Freigabechance).
- `DEFAULT_SPARTEN`: Rally/Mondioring optional in die Standard-Sichtbarkeit.
- PrecisionDebugPanel: aktuell nur in Legen/Absuchen; ggf. an weitere Screens (nicht nötig).

## Was in dieser Session erledigt wurde (Commits)
Tracking/GPS:
- `2c0cb7c` Karten-Linie nicht doppelt glätten (Linie trifft Winkel)
- `c8ed6ef` GPS-Ausreißer im Absuch-Recorder verwerfen
- `af630d0` Display anlassen (keep-awake) + Haptik-Führung (1× Gegenstand, 2× Winkel)
- `95c890f` Skizze zeichnet echte Aufnahme + Schritt-Angabe
- `797be62` aktive Recorder auf zentrale `positionSource` (native bevorzugt, expo-Fallback)
- `7e1452b` PrecisionDebugPanel in Legen/Absuchen (nur `__DEV__`, read-only)

Android/Play:
- `a6de587` ACCESS_BACKGROUND_LOCATION entfernt → später wieder aktiviert
- `5bd975d` FG-Service-Permissions entfernt (auf Play-Ablehnung)
- `552643c` **Foreground-Service-Standort wieder aktiviert** (Aufnahme im Hintergrund) → in Play deklarieren

Profil/Security/Abo:
- `233229c` Profil bearbeiten (Name)
- `c56469e` E-Mail/Passwort ändern → `f1ba798` E-Mail-Änderung vorerst entfernt (SMTP-Blocker)
- `8840f4f` biometrische App-Sperre (Face ID / Touch ID / Fingerabdruck)
- `af5327e` „Pro" → „Active", Trial 30 → 7 Tage

Kalender:
- `fe18433` Termin in Apple/Google-Kalender übernehmen
- `895b383` Neuer Termin: native Datum/Zeit-Picker (CH) + Tastatur/Bestätigen-Fix

Web/Legal:
- `9da3050`/`e6cbb59`/`ac1222a` Konto-Löschen-Seite (In-App + `legal-web`), Startseite alle Sparten,
  Betreiber „dog.boss.vibes", „Daten löschen"-Link — **anyvo.app ist live deployed (Vercel)**.

KI:
- `00d6092` `ai-analysis`-Function korrigiert (Vertrag) + echten Fehler durchreichen
- `263e6c0` auf `claude-haiku-4-5` umgestellt (günstiger) — **deployed**
- `2c505d2` freundliche deutsche Fehlermeldung

Training/Disziplinen (früher am Tag):
- `5fb1382`/`e4423cd`/`319f371` Obedience/Agility/Rally/Mondioring-Disziplinen, Obedience opt-in

Sonstiges:
- `40d278d` Geburtsdatum-Zeitzonen-Fix

## Verwandte Doku
- `docs/session-log-2026-07-03-gps-precision.md` — Detail zur GPS-/positionSource-Umstellung.
