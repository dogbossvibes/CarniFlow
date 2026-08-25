# E-Mail-Aktivierungsflow (Registrierung → Bestätigung → Login)

> Stand: 2026-08-13 · Task **T-54** · Branch `feat/track-module-rewrite`
> Kein Commit / Push / Build / Deployment im Rahmen dieser Änderung.

## Ist-Analyse (vor der Änderung)

- `services/auth.ts → signUp()` rief `supabase.auth.signUp({ email, password, options: { data } })`
  **ohne `emailRedirectTo`** auf. Supabase verwendet dann die projektweite **Site URL** als
  `redirect_to` der Bestätigungs-E-Mail → Nutzer landeten nach dem Klick auf der **Homepage
  `anyvo.app`** ohne klare Rückmeldung, ob das Konto aktiviert wurde.
- Die eigentliche E-Mail-Verifikation passiert **serverseitig** bei Supabase (`/auth/v1/verify`),
  BEVOR auf die Zielseite weitergeleitet wird. Es fehlte lediglich eine dedizierte Zielseite.
- Auth-Architektur: **PKCE** (`lib/supabase.ts → flowType: 'pkce'`, `detectSessionInUrl: false`).
  Bestehende dedizierte Routen: `app/auth/callback.tsx` (Google-OAuth) und `app/auth/recovery.tsx`
  (Passwort-Recovery via `anyvo://auth/recovery`). Für den **Signup-Confirm** gab es keine eigene
  App-/Web-Behandlung — er stützt sich rein auf Supabases Server-Verify + Redirect.
- Deep-Linking: nur **Custom Scheme** `anyvo://` (`app.json → "scheme": "anyvo"`). **Keine**
  Universal Links / `associatedDomains` für `anyvo.app`. Die Web-Seite kann die App daher
  ausschliesslich über `anyvo://` öffnen.
- Website: statisches `legal-web/` auf Vercel, `cleanUrls: true` → `/auth/confirmed` liefert
  `auth/confirmed.html` (gleiche Konvention wie `/datenschutz` → `datenschutz.html`).
- Post-Signup-UX in der App existierte bereits (`app/(auth)/login.tsx`: „Bitte E-Mail bestätigen"-
  Karte, Keys `auth.confirmInbox*`) → **unverändert gelassen** (Abschnitt 10).

## Neuer Flow

```
Registrierung (App)
  → supabase.auth.signUp({ …, options.emailRedirectTo: EMAIL_CONFIRM_REDIRECT_URL })
  → Supabase verschickt Bestätigungs-E-Mail
  → Nutzer klickt Aktivierungslink
  → Supabase /auth/v1/verify bestätigt die E-Mail SERVERSEITIG
  → Redirect auf https://anyvo.app/auth/confirmed
  → Statusseite wertet Redirect-Parameter aus und zeigt Erfolg/Fehler
  → „ANYVO öffnen" (anyvo://) → App startet auf Login → Anmeldung
```

Es wird **keine zweite Auth-Architektur** gebaut. Die Bestätigungsseite erzeugt **keine Session**
und tauscht **keinen Code** aus (das PKCE-`code_verifier` liegt nur auf dem Gerät). Standardflow
bleibt: Registrieren → bestätigen → App öffnen → anmelden.

## Geänderte / neue Dateien

| Datei | Zweck |
|---|---|
| `features/auth/accountSecurity.ts` | Neue zentrale Konstante `EMAIL_CONFIRM_REDIRECT_URL = 'https://anyvo.app/auth/confirmed'` (URL nicht mehrfach hart codiert). |
| `services/auth.ts` | `signUp()` übergibt `options.emailRedirectTo: EMAIL_CONFIRM_REDIRECT_URL`. |
| `legal-web/auth/confirmed.html` | Neue, dark-brand, mobile-first Bestätigungsseite mit 4 Statusansichten + „ANYVO öffnen"-Button + Store-Fallback. |
| `legal-web/assets/auth-confirm.js` | Reiner, testbarer Resolver (`resolveConfirmStatus`, `getOpenAppTarget`) + DOM-Verdrahtung (UMD: Browser + Node). |
| `legal-web/__tests__/authConfirmStatus.test.ts` | Jest-Tests der Statusauflösung + festes App-Ziel (kein Open-Redirect). |
| `services/__tests__/signup-redirect.test.ts` | Jest-Test: `signUp` übergibt `emailRedirectTo` (dedizierte Seite, nicht Homepage). |

## Statusauflösung (Sicherheit: Erfolg nicht vortäuschen)

`resolveConfirmStatus(search, hash)` parst Query **und** Fragment und liefert:

- **success** — kein Fehlerparameter UND einer von `code` (PKCE), `access_token` (Implicit),
  `token_hash`/`type` (Template) vorhanden → echter Callback-Kontext.
- **expired** — `error_code=otp_expired` bzw. `access_denied`/`expired_token`. Neutral formuliert,
  damit bereits bestätigte Nutzer nicht erschrecken.
- **error** — sonstiger `error`/`error_description` → generische Fehlermeldung (keine rohe Supabase-
  Fehlermeldung).
- **neutral** — **Direktaufruf ohne Parameter** → KEIN Erfolg behauptet; neutraler Hinweis auf den
  E-Mail-Link / mögliche bestehende Aktivierung.

Ein Fehler wird priorisiert, auch wenn zusätzlich ein `code` vorhanden ist.

## Fehlerfälle (UX)

| Fall | Anzeige |
|---|---|
| Erfolgreich | „Konto erfolgreich aktiviert" — E-Mail bestätigt, jetzt anmelden. |
| Abgelaufen / bereits verwendet | „Aktivierungslink nicht mehr gültig" — neutral, ggf. bereits aktiv / neue Mail anfordern. |
| Allgemeiner Fehler | „Aktivierung konnte nicht abgeschlossen werden" — erneut versuchen / App öffnen. |
| Direktaufruf | „E-Mail bestätigen" — Link aus der E-Mail öffnen; ggf. bereits aktiv. |

## Deep Link

- Button „ANYVO öffnen" → **`anyvo://`** (bestehendes Custom Scheme). Die App-Root
  (`app/index.tsx`) leitet ohne Session auf `/(auth)/login` → exakt der gewünschte Anmelde-Einstieg.
- **Sicher**, weil das Ziel eine feste Konstante ist und **niemals** aus URL-Parametern abgeleitet
  wird → kein Open-Redirect / kein beliebiges externes Ziel.
- **Fallback** (Desktop / App nicht installiert): sichtbare Store-Links (App Store / Google Play),
  identisch zu den bestehenden Website-Links.
- Universal Links auf `anyvo.app` sind bewusst **nicht** eingeführt (keine native Änderung nur für
  diesen Fix; Weblösung genügt).

## Manueller Supabase-Schritt (erforderlich)

Damit Supabase auf die neue Seite weiterleiten darf:

```
Supabase Dashboard
  → Authentication
  → URL Configuration
  → Redirect URLs
  → hinzufügen: https://anyvo.app/auth/confirmed
     (bei Bedarf zusätzlich die www-Variante: https://www.anyvo.app/auth/confirmed)
```

Wenn dort bereits eine bewusst gesetzte, sichere Wildcard (z. B. `https://anyvo.app/**`) existiert,
ist keine zusätzliche Freigabe nötig. Keine produktive Supabase-Konfiguration wurde im Rahmen
dieser Änderung angefasst.

## Sicherheit

- Keine Secrets / `service_role` im Web- oder Mobile-Client.
- Keine Speicherung von Tokens/Codes; keine Token in Logs; kein `exchangeCodeForSession` im Browser.
- `redirectTo` ist **nicht** frei manipulierbar: die Signup-Redirect-URL ist serverseitig
  (Supabase Allowlist) begrenzt, das App-Öffnen-Ziel ist clientseitig konstant.
- Seite `noindex,nofollow`; kein `innerHTML`/HTML-Injection aus URL-Parametern (nur Umschalten
  vorhandener statischer Sektionen).

## Tests

- `npx jest legal-web/__tests__/authConfirmStatus.test.ts services/__tests__/signup-redirect.test.ts services/__tests__/auth-security.test.ts` → **grün** (25 Tests).
- `npx tsc --noEmit` → 0 Errors. ESLint auf berührten Dateien → 0 Errors. `git diff --check` → sauber.

### Offene manuelle Testmatrix

- **A** neuer Nutzer: registrieren → Mail → Link → dedizierte Seite „Konto erfolgreich aktiviert" →
  App öffnen → Login.
- **B** Link erneut öffnen → neutrale „nicht mehr gültig"-Meldung (kein technischer Fehler).
- **C** manipulierter/ungültiger Link → Fehler-/expired-Ansicht statt Erfolg.
- **D** Mobile Safari: Darstellung + Button `anyvo://`.
- **E** Desktop: Darstellung + Store-Fallback sinnvoll.
