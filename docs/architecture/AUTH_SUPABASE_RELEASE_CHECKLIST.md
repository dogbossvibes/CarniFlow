# ANYVO — Supabase Auth Release Checklist

Stand: 2026-07-30
Erstellt für: Passwort-Recovery, E-Mail-Änderung, Secure Password Change im Produktivbetrieb.

> **Keine Secrets in diese Datei.** Client-IDs, Keys, SMTP-Passwörter etc. gehören
> ausschließlich ins Supabase-Dashboard bzw. in Umgebungsvariablen.
> Alle mit **[DASHBOARD]** markierten Punkte lassen sich **nicht** aus dem Repo
> verifizieren und müssen manuell in Supabase geprüft werden.
> Alle mit **[REPO ✓]** markierten Punkte sind im Code bereits so umgesetzt.

## Repo-abgeleitete Fakten (Quelle der Wahrheit für diese Liste)

| Fakt | Wert | Quelle |
|---|---|---|
| Auth-Flow | **PKCE** (`detectSessionInUrl: false`) | `lib/supabase.ts:20-21` |
| Public Project URL | `https://axkkhyqrjrtbkumaulta.supabase.co` (kein Secret) | `lib/supabase.ts:6` |
| Supabase OAuth-Callback (Provider-Seite) | `https://axkkhyqrjrtbkumaulta.supabase.co/auth/v1/callback` | Standard-Supabase |
| App-Scheme | `anyvo` | `app.json:8` |
| iOS Bundle ID / Android Package | `com.anyvo.app` | `app.json:15,49` |
| Recovery-Deep-Link | `anyvo://auth/recovery` | `features/auth/accountSecurity.ts:9`, `services/auth.ts:34-46` |
| OAuth-Callback-Deep-Link | `anyvo://auth/callback` | `services/auth.ts:103-107` |
| Passwort-Recovery-Versand | `supabase.auth.resetPasswordForEmail(email, { redirectTo })` | `services/auth.ts:42-46` |
| Passwort setzen (Recovery) | `exchangeCodeForSession(code)` → `updateUser({ password })` | `app/auth/recovery.tsx` |
| E-Mail-Änderung | `supabase.auth.updateUser({ email })` | `services/auth.ts:63-65` |
| Reauthentication | `supabase.auth.reauthenticate()` + `updateUser({ password, nonce })` | `services/auth.ts:48-58` |
| Apple-Login | `signInWithIdToken({ provider: 'apple' })` (nativ) | `services/auth.ts:70-89` |
| Google-Login | `signInWithOAuth({ provider: 'google' })` + PKCE-Exchange | `services/auth.ts:102-150` |

---

## 1. SMTP / Custom Mail Provider

Alle Auth-Mails (Recovery, E-Mail-Änderung, Bestätigung) hängen an einem funktionierenden Mailversand.

- [ ] **[DASHBOARD] Custom SMTP ist ERFORDERLICH für Produktion.** Der eingebaute
      Supabase-Mailversand ist stark rate-limitiert (nur wenige Mails/Stunde,
      nur an Team-Mitglieder zuverlässig) und **nicht release-tauglich**.
- [ ] **[DASHBOARD]** Auth → Emails/SMTP: Custom SMTP aktiviert (z. B. Resend, Postmark, SES).
- [ ] **[DASHBOARD]** Absenderadresse (`From`) auf ANYVO-Domain gesetzt, nicht auf Default.
- [ ] **[DASHBOARD]** Bei Resend/eigener Domain: **SPF, DKIM, DMARC** verifiziert
      (sonst landen Reset-Mails im Spam oder werden abgelehnt).
- [ ] **[DASHBOARD]** Bounce-/Complaint-Handling des Providers geprüft.
- [ ] **[DASHBOARD]** Sende-Rate des SMTP-Providers deckt die konfigurierten
      Supabase-Rate-Limits ab (siehe §6).

> Keine SMTP-Zugangsdaten in Repo/Doku ablegen — nur im Dashboard/Provider.

## 2. Redirect URLs (Allowlist)

Supabase weist Redirects ab, die nicht in der Allowlist stehen — betrifft **Recovery** und **OAuth**.

- [ ] **[DASHBOARD]** Auth → URL Configuration → Redirect URLs enthält **`anyvo://auth/recovery`** (Passwort-Recovery). **[REPO ✓]** wird als `redirectTo` gesendet.
- [ ] **[DASHBOARD]** Redirect URLs enthält **`anyvo://auth/callback`** (Google OAuth). **[REPO ✓]** bestehender Flow.
- [ ] **[DASHBOARD]** Falls Web-/Dev-Builds getestet werden: zusätzlich die jeweiligen
      `exp://`- bzw. `http://localhost`-Redirects temporär erlauben
      (Standalone-Build nutzt ausschließlich `anyvo://…`).
- [ ] **[DASHBOARD]** Site URL sinnvoll gesetzt (Fallback-Redirect); kein veralteter Wert.
- [ ] **[DASHBOARD]** Keine überflüssigen/fremden Redirects in der Allowlist (Angriffsfläche).

## 3. E-Mail Templates

- [ ] **[DASHBOARD]** Template **„Reset Password"**: nutzt `{{ .ConfirmationURL }}`.
      Bei PKForm-Flow enthält die ConfirmationURL nach der Verify-Weiterleitung den
      `code`-Parameter und leitet auf `anyvo://auth/recovery` weiter. **[REPO ✓]**
      `recovery.tsx` liest `code` und ruft `exchangeCodeForSession`.
- [ ] **[DASHBOARD]** Template **„Change Email Address"**: ConfirmationURL unverändert,
      leitet auf einen erlaubten Redirect. **[REPO ✓]** App zeigt Pending-Hinweis
      (`EMAIL_CHANGE_PENDING_MESSAGE`).
- [ ] **[DASHBOARD]** Template **„Confirm Signup"** (falls E-Mail-Bestätigung aktiv):
      ConfirmationURL korrekt.
- [ ] **[DASHBOARD]** Template **„Reauthentication"**: enthält `{{ .Token }}` (der Nonce/Code).
      **[REPO ✓]** `change-password.tsx` zeigt Nonce-Feld und übergibt ihn an `updatePassword`.
- [ ] **[DASHBOARD]** Kein Template verrät, ob eine Adresse registriert ist
      (die App zeigt bewusst eine neutrale Erfolgsmeldung, `PASSWORD_RESET_SUCCESS_MESSAGE`).
- [ ] **[DASHBOARD]** Templates sind auf Deutsch/CH-tauglich oder mind. neutral formuliert.

## 4. Secure Email Change

- **OFF:** Bestätigung geht **nur an die neue** Adresse. Ein kompromittiertes Konto
  könnte die E-Mail unbemerkt vom Alt-Postfach übernehmen.
- **ON (empfohlen):** Bestätigung geht an **alte UND neue** Adresse; **beide** Links
  müssen bestätigt werden, bevor die Änderung greift.

- [ ] **[DASHBOARD]** Auth → Secure email change: **ON empfohlen**.
- [ ] Erwartete UX bei ON: nach `updateEmail` bleibt die alte E-Mail aktiv, bis beide
      Bestätigungen erfolgt sind. **[REPO ✓]** Die App-Copy nennt genau diesen Fall
      („Abhängig von den Sicherheitseinstellungen kann auch eine Bestätigung über deine
      bisherige Adresse erforderlich sein.") → **kein Code-Widerspruch bei ON.**
- [ ] **[DASHBOARD]** Nach dem Setzen einmal live geprüft (siehe §10).

## 5. Secure Password Change / Reauthentication

- **OFF:** `updateUser({ password })` funktioniert direkt auf aktiver Session.
- **ON:** Passwortänderung auf aktiver Session erfordert vorher einen **Nonce** aus
  `reauthenticate()` (per E-Mail), der an `updateUser({ password, nonce })` übergeben wird.

- [ ] **[DASHBOARD]** Auth → Secure password change: bewusst auf ON **oder** OFF gesetzt.
- [ ] **[REPO ✓] Unser Flow ist mit BEIDEN Zuständen kompatibel:**
      `change-password.tsx` versucht zunächst ohne Nonce; bei
      `isReauthenticationError` blendet es das Nonce-Feld ein und fordert per
      `requestPasswordReauthentication()` einen Code an.
- [ ] **[REPO ✓] Recovery-Pfad braucht keinen Nonce:** in `recovery.tsx` erfolgt die
      Passwortsetzung innerhalb der Recovery-Session (`PASSWORD_RECOVERY`), die selbst
      als Reauth gilt — auch bei Secure password change = ON.
- [ ] **[DASHBOARD]** Falls ON: Reauthentication-Template (§3) ist gesetzt und versendbar.

## 6. Rate Limits (Produktion)

- [ ] **[DASHBOARD]** Auth → Rate Limits geprüft und produktionsgerecht:
  - [ ] **E-Mail-Versand** (Recovery + Change + Confirm): hoch genug für echte Nutzerlast,
        aber missbrauchssicher. Muss zur SMTP-Provider-Kapazität passen (§1).
  - [ ] **Passwort-Reset / OTP**: Standard belassen oder moderat anheben; zu niedrig
        blockiert legitime Nutzer, zu hoch lädt Missbrauch/Mail-Bombing ein.
  - [ ] **Token-Refresh / Verify**: Defaults i. d. R. ausreichend.
  - [ ] **Sign-in/Sign-up**: Brute-Force-sicher konfiguriert.
- [ ] **[DASHBOARD]** Recovery-Link-Ablaufzeit (OTP/Link expiry) geprüft
      (Default meist 1 h — für Recovery ausreichend, nicht unnötig lang).

## 7. Google Provider (unverändert korrekt)

- [ ] **[DASHBOARD]** Auth → Providers → Google: aktiviert, Client ID + Secret gesetzt.
- [ ] **[DASHBOARD]** In der Google Cloud Console ist als Authorized Redirect URI die
      Supabase-Callback-URL `https://axkkhyqrjrtbkumaulta.supabase.co/auth/v1/callback`
      hinterlegt (nicht der App-Deep-Link).
- [ ] **[REPO ✓]** App sendet `redirectTo = anyvo://auth/callback` und löst den PKCE-Code
      selbst ein — Allowlist-Eintrag aus §2 genügt app-seitig. **Nichts am Provider ändern**,
      nur Bestand verifizieren.

## 8. Apple Provider (unverändert korrekt)

- [ ] **[DASHBOARD]** Auth → Providers → Apple: aktiviert.
- [ ] **[DASHBOARD]** Da nativ per **`signInWithIdToken`** (kein Web-Redirect): die
      **Bundle-ID `com.anyvo.app`** muss in den **Authorized Client IDs** des Apple-Providers
      stehen (Supabase prüft die Token-Audience gegen diese Liste).
- [ ] **[DASHBOARD]** Apple Developer: Sign in with Apple für die App-ID aktiviert;
      Services ID / Key / Team ID im Supabase-Provider korrekt (falls zusätzlich Web genutzt).
- [ ] **[REPO ✓]** Kein Redirect-URL-Bedarf für Apple (token-basiert). **Nichts ändern**,
      nur Bestand verifizieren.

## 9. iOS / Android Deep Link

Es ist **keine neue App-Konfiguration** nötig — der vorhandene Custom-Scheme-Flow wird nur gespiegelt.

- [ ] **[REPO ✓]** Scheme `anyvo` ist in `app.json` gesetzt; OS öffnet `anyvo://…` in ANYVO.
- [ ] **[DASHBOARD]** Supabase-seitig genügen die **Redirect-Allowlist-Einträge** aus §2
      (`anyvo://auth/recovery`, `anyvo://auth/callback`). Supabase hat keine separate
      „Deep-Link"-Einstellung darüber hinaus.
- [ ] **Wichtige PKCE-Randbedingung [REPO ✓]:** Der Recovery-Link muss auf **demselben
      Gerät** geöffnet werden, auf dem der Reset angefordert wurde (der `code_verifier`
      liegt im AsyncStorage dieses Geräts). Öffnen auf einem anderen Gerät → „Link
      ungültig". → Im Support/Onboarding kommunizieren, nicht als Bug behandeln.
- [ ] Deep-Link-Test nur mit einem **Dev-/Standalone-Build** (nicht Expo Go, das den
      `anyvo://`-Scheme nicht beansprucht).

---

## 10. Testplan im Dashboard (Live-Tests)

Mit einem **echten Gerät** und einem **Dev-/Standalone-Build** durchführen, Testnutzer mit
erreichbarer E-Mail.

**A. Passwort-Recovery**
- [ ] In der App „Passwort vergessen?" → E-Mail eingeben → Erfolgsmeldung erscheint (neutral).
- [ ] **Reset-Mail kommt an** (Inbox, nicht Spam) über den Custom-SMTP-Absender.
- [ ] **Link öffnet ANYVO** auf `/auth/recovery` (nicht Browser/Fehlerseite).
- [ ] Neues Passwort setzen → Erfolg → automatischer Sign-out → Login-Screen.
- [ ] **Login mit neuem Passwort funktioniert**; altes Passwort wird abgelehnt.
- [ ] Gegentest: Link auf einem **anderen** Gerät öffnen → erwartete „Link ungültig"-Meldung.

**B. E-Mail-Änderung**
- [ ] In Kontosicherheit → E-Mail ändern (nur bei E-Mail-Konten sichtbar).
- [ ] Bei Secure email change = ON: **beide** Postfächer (alt + neu) erhalten eine Mail.
- [ ] Nach Bestätigung ist die neue Adresse aktiv; App zeigt/nutzt sie.
- [ ] Vor vollständiger Bestätigung bleibt die alte Adresse gültig.

**C. Secure Password Change / Reauth (nur wenn ON)**
- [ ] In Kontosicherheit → Passwort ändern → erster Versuch löst Reauth aus.
- [ ] **Reauth-Mail/Code kommt an**; Code im Nonce-Feld eingeben → Änderung greift.
- [ ] Falscher/abgelaufener Code → verständliche Fehlermeldung, kein Absturz.

**D. Provider-Gating**
- [ ] **Google-Konto:** Kontosicherheit zeigt E-Mail read-only + Provider-Hinweis;
      **Google-Login funktioniert** unverändert (Kontoauswahl erscheint).
- [ ] **Apple-Konto:** analog read-only; **Apple-Login funktioniert** unverändert (iOS).
- [ ] Für Google/Apple werden **keine** ANYVO-Passwort-/E-Mail-Änderungsoptionen angeboten.

**E. Regression**
- [ ] Normaler E-Mail/Passwort-Login unverändert funktionsfähig.
- [ ] Keine Tokens/OTPs/Recovery-Codes in App- oder Server-Logs sichtbar.

---

## Priorisierungs-Matrix

### MUSS VOR RELEASE
- Custom SMTP aktiv + Absenderdomain mit SPF/DKIM/DMARC (§1) — sonst kommen Mails nicht/als Spam an.
- Redirect-Allowlist enthält `anyvo://auth/recovery` **und** `anyvo://auth/callback` (§2).
- Reset-Password- & Change-Email-Templates mit korrekter ConfirmationURL (§3).
- Google- und Apple-Provider verifiziert (Client IDs / Bundle-ID) (§7, §8).
- Testplan A + D grün: Recovery end-to-end + Google/Apple weiterhin funktional (§10).

### SOLLTE VOR RELEASE
- Secure email change = ON (§4) — Code-Copy ist bereits darauf ausgelegt.
- Secure password change bewusst gesetzt + Reauthentication-Template, falls ON (§3, §5).
- Rate Limits produktionsgerecht + zur SMTP-Kapazität passend (§6).
- Testplan B + C + E grün (§10).
- PKCE-„gleiches Gerät"-Randbedingung im Support/Onboarding dokumentiert (§9).

### OPTIONAL SPÄTER
- SMS-Recovery / Phone Auth (bewusst zurückgestellt, kein Code vorhanden).
- Identity Linking (mehrere Provider pro Konto).
- Eigene, gebrandete/lokalisierte HTML-Mail-Templates statt Defaults.
- Verkürzte/verlängerte Recovery-Link-Ablaufzeit nach Nutzungsdaten justieren.

---

## Nicht Teil dieses Releases
- [ ] SMS-Recovery bewusst nicht aktiviert.
- [ ] Phone Auth bewusst nicht aktiviert.
- [ ] Identity Linking bewusst nicht aktiviert.
