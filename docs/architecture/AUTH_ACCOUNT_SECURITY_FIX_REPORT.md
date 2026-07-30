# ANYVO — Auth / Account Security Fix Report

Stand: 2026-07-30
Branch: `feat/track-module-rewrite`

Keine DB-Migration, kein Commit, kein Push, kein EAS Build, kein Submit.

## A. Geänderte Dateien
- `services/auth.ts`
- `lib/session-context.tsx`
- `app/(auth)/login.tsx`
- `app/auth/forgot-password.tsx`
- `app/auth/recovery.tsx`
- `app/account-security.tsx`
- `app/account-security/change-email.tsx`
- `app/account-security/change-password.tsx`
- `app/(tabs)/profile.tsx`
- `app/edit-profile.tsx`
- `features/auth/accountSecurity.ts`
- `features/auth/__tests__/accountSecurity.test.ts`
- `features/auth/__tests__/authStaticIntegration.test.ts`
- `services/__tests__/auth-security.test.ts`
- `app/(auth)/__tests__/login-redesign.test.ts`
- `features/help/helpRegistry.ts`
- `docs/architecture/AUTH_SUPABASE_RELEASE_CHECKLIST.md`
- `docs/architecture/AUTH_ACCOUNT_SECURITY_FIX_REPORT.md`

## B. Passwort-Recovery
- Login zeigt `Passwort vergessen?`.
- Neuer Screen `app/auth/forgot-password.tsx` sendet Reset-Mails per `supabase.auth.resetPasswordForEmail`.
- Erfolgsmeldung ist generisch und vermeidet User Enumeration.
- Recovery Redirect ist `anyvo://auth/recovery`.

## C. Deep-Link-Architektur
- Bestehendes Scheme `anyvo` bleibt unverändert.
- Keine zweite Deep-Link-Architektur eingeführt.
- OAuth-Callback bleibt `anyvo://auth/callback`.
- Recovery nutzt `app/auth/recovery.tsx`.

## D. PASSWORD_RECOVERY Handling
- `lib/session-context.tsx` behandelt `PASSWORD_RECOVERY`.
- Recovery-Event führt gezielt nach `/auth/recovery`.
- Recovery-Link führt nicht mehr in einen normalen Home-Flow.

## E. E-Mail ändern
- Nur E-Mail/Passwort-Konten sehen E-Mail-Änderung.
- Umsetzung über vorhandenes `updateEmail` / `supabase.auth.updateUser({ email })`.
- Nach erfolgreichem Start wird Pending-/Bestätigungstext angezeigt.
- Text ist kompatibel mit Secure Email Change und behauptet nicht, dass die E-Mail sofort geändert wurde.

## F. Passwort ändern
- Passwortänderung ist in `Konto & Sicherheit` gebündelt.
- Nur E-Mail/Passwort-Konten sehen ANYVO-Passwortänderung.
- Neues Passwort verlangt mindestens 8 Zeichen und Wiederholung.
- Umsetzung über `supabase.auth.updateUser({ password })`.

## G. Reauthentication
- Installierte Supabase-Version: `@supabase/supabase-js` `^2.106.2`.
- Supabase Auth unterstützt `reauthenticate()` und `nonce` bei `updateUser`.
- Screen kann Sicherheitscode anfordern und als Nonce beim Passwortwechsel mitsenden.
- Ob der Nonce zwingend erforderlich ist, hängt vom Supabase-Dashboard-Setting `Secure Password Change` ab.

## H. Google-Verhalten
- Google Login bleibt via Supabase OAuth/PKCE.
- Bestehende uncommitted Änderung `prompt=select_account` wurde erhalten.
- Google-only-Konten sehen keine ANYVO-Passwortänderung.
- Google-only-Konten sehen keine ANYVO-E-Mail-Änderung.
- Kein Identity Linking eingeführt.

## I. Apple-Verhalten
- Apple Sign-In bleibt nativ via `signInWithIdToken`.
- Apple-only-Konten sehen keine ANYVO-Passwortänderung.
- Apple-only-Konten sehen keine ANYVO-E-Mail-Änderung.

## J. SMS eingebaut?
Nein. Kein SMS, kein Phone Auth, kein OTP per SMS.

## K. DB-Migration?
Nein. Passwort-Recovery und E-Mail-Änderung laufen Supabase-Auth-nativ.

## L. Supabase-Dashboard-To-dos
Siehe `docs/architecture/AUTH_SUPABASE_RELEASE_CHECKLIST.md`.

Wichtig:
- SMTP/Resend muss aktiv und getestet sein.
- Redirect-Allowlist muss `anyvo://auth/recovery` enthalten.
- Secure Email Change und Secure Password Change müssen bewusst geprüft werden.
- Rate Limits und E-Mail-Templates müssen geprüft werden.

## M. iOS
- `anyvo://auth/recovery` nutzt das vorhandene Custom Scheme.
- Kein Universal-Link-Setup eingeführt.
- `npx expo export --platform ios --output-dir dist-auth-ios` erfolgreich.
- Echter iOS-Deep-Link-Test mit realer Reset-Mail bleibt erforderlich.

## N. Android
- `anyvo://auth/recovery` nutzt das vorhandene Custom Scheme.
- Keine zusätzliche native Deep-Link-Architektur eingeführt.
- `npx expo export --platform android --output-dir dist-auth-android` erfolgreich.
- Echter Android-Deep-Link-Test mit realer Reset-Mail bleibt erforderlich.

## O. Tests
- `npx tsc --noEmit` erfolgreich.
- ESLint geänderte Auth/Login-Dateien: keine Fehler; bestehende Warnungen in `app/(tabs)/profile.tsx`, `app/auth/callback.tsx` und `components/AppLockGate.tsx`.
- Relevante Auth/Login/Localization-Tests: 49 Tests / 5 Suites erfolgreich.
- Gesamte Jest-Suite: 479 Tests / 50 Suites erfolgreich.
- iOS Export erfolgreich.
- Android Export erfolgreich.
- iOS Simulator-Smoke-Test: blockiert, weil Metro auf Port 8090 mit Node 24.15.0 in `ERR_SOCKET_BAD_PORT` endet.
- Android Emulator-Smoke-Test: blockiert, weil `adb devices` keinen Emulator meldet.

## P. Echter Gerätetest erforderlich?
Ja.

Erforderlich vor Release:
- Reset-Mail real aus Supabase senden.
- Link auf iOS öffnen und neues Passwort setzen.
- Link auf Android öffnen und neues Passwort setzen.
- Login/Register/Recovery/Account-Security visuell im iOS-Simulator prüfen, sobald Metro ohne `ERR_SOCKET_BAD_PORT` läuft.
- Login/Register/Recovery/Account-Security visuell im Android-Emulator prüfen, sobald ein Emulator per `adb devices` verfügbar ist.
- Google Login nach Änderung prüfen.
- Apple Login auf iOS-Gerät prüfen.
- E-Mail-Änderung mit realem SMTP und Dashboard-Settings prüfen.

## Q. Verbleibende Release-Blocker
- Supabase SMTP/Resend und Templates müssen real geprüft werden.
- Redirect-Allowlist muss `anyvo://auth/recovery` enthalten.
- Secure Email Change / Secure Password Change müssen bewusst entschieden und getestet werden.
- Realer Mail-Link-Test auf iOS und Android steht noch aus.
- Lokale Simulator-Visualisierung bleibt blockiert durch Node-24-/Expo-Metro-Portproblem und fehlenden Android-Emulator.
