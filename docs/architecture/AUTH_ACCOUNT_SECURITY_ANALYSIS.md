# ANYVO — Auth / Account Security — Analyse (nur Bericht, kein Code geändert)

**Rolle:** Analyse. **Erstellt:** 2026-07-29. **Branch:** feat/track-module-rewrite
**Keine Codeänderung, keine Migration, kein Commit/Push.** Basis: Repository-Stand (Supabase-Dashboard-Settings sind aus dem Repo NICHT sicher ableitbar → als „im Dashboard prüfen" markiert).

Priorität bei Widersprüchen: **Repository state > Git state > Handoff-Doku > Annahmen.**

## Auth-Inventar (verifiziert im Code)
- `lib/supabase.ts` — `createClient` mit `flowType: 'pkce'`, `persistSession`, `autoRefreshToken`, `storage: AsyncStorage` (nativ), `detectSessionInUrl: false`.
- `services/auth.ts` — `signIn` (`signInWithPassword`), `signUp`, `signOut`, `updatePassword` (`updateUser({password})`), `updateEmail` (`updateUser({email})`), `signInWithApple` (`signInWithIdToken`), `signInWithGoogle` (`signInWithOAuth` + PKCE + `WebBrowser.openAuthSessionAsync` + `exchangeCodeForSession`), `deleteAccount` (Edge Function).
- `app/(auth)/login.tsx` — Tabs „Anmelden/Registrieren", Google- + Apple-Button. **Kein** „Passwort vergessen?".
- `app/edit-profile.tsx` — Passwort ändern (nur `provider==='email'`); E-Mail **read-only**.
- `app/auth/callback.tsx` — OAuth-Callback; native Session-Warten, Web `exchangeCodeForSession`.
- `lib/session-context.tsx` — `onAuthStateChange`; **kein** `PASSWORD_RECOVERY`-Handling.
- `app.json` — `scheme: "anyvo"`, **kein** `ios.associatedDomains`, **keine** expliziten `android.intentFilters` (expo-router erzeugt Scheme-Filter). Plugin `expo-apple-authentication` vorhanden.

## Grep-Ergebnisse (verifiziert)
- `updateUser` → nur `password` / `email` / `data.full_name`.
- `resetPasswordForEmail` → **0 Treffer.** `verifyOtp` → **0.** `signInWithOtp` → **0.** Phone-Auth → **0.**
- `updateEmail` → im Service definiert, **in der UI nicht aufgerufen** (0 UI-Treffer).
- Telefonnummer im Datenmodell (`profiles`/Typen) → **keine** (nur GPS-„Telefon"-Kommentare).

---

## Antworten (A–M der Anfrage)

### A. Wie funktioniert „E-Mail ändern" aktuell genau?
Faktisch **gar nicht für Nutzer**. `services/auth.ts#updateEmail` → `supabase.auth.updateUser({ email })` existiert, wird aber **nirgends** aufgerufen. `edit-profile.tsx` zeigt die E-Mail **read-only** mit Hinweis „E-Mail-Änderung ist derzeit nicht verfügbar" (email-Konten) bzw. „wird über {Provider} verwaltet" (OAuth). → Funktion vorhanden, **UI fehlt**.

### B. Wird eine E-Mail-Bestätigung erwartet?
Ja. `updateUser({email})` löst serverseitig eine Bestätigung aus. Ob **nur die neue** oder **alte UND neue** Adresse bestätigt werden muss, hängt vom Dashboard-Setting **„Secure email change"** ab (im Repo nicht sichtbar → **Dashboard prüfen**). Zwingend: **konfigurierter E-Mail-Versand (SMTP)** — sonst geht keine Bestätigungsmail raus. (Bekannter Launch-Blocker: SMTP/Resend.)

### C. Wie funktioniert „Passwort ändern" aktuell?
`edit-profile.tsx` → `updatePassword(pw)` → `updateUser({ password })`, nur wenn `user.app_metadata.provider === 'email'`. Validierung: ≥ 8 Zeichen + Wiederholung. Nutzt die **aktive Session** (kein altes Passwort nötig). Für OAuth-Konten wird der Passwort-Block ausgeblendet (korrekt).

### D. Gibt es Reauthentication?
**Nein.** Weder vor Passwort- noch (mangels UI) vor E-Mail-Änderung. Falls im Dashboard **„Secure password change / reauthentication"** aktiv ist, würde `updateUser({password})` einen **nonce** verlangen und aktuell **fehlschlagen** → Dashboard-Setting prüfen.

### E. Gibt es „Passwort vergessen" per E-Mail?
**Nein.** Kein `resetPasswordForEmail`, kein Reset-Screen, kein Login-Link, kein `PASSWORD_RECOVERY`-Listener.

### F. Gibt es Recovery-Deep-Links?
**Nein** (nur OAuth-Callback `anyvo://auth/callback`). Kein Recovery-Route/-Handler. `detectSessionInUrl: false` + fehlender `PASSWORD_RECOVERY`-Handler ⇒ ein Recovery-Link würde aktuell **nicht** korrekt in einen Passwort-Setzen-Flow münden.

### G. Gibt es Phone Auth?
**Nein.**

### H. Gibt es verifizierte Telefonnummern?
**Nein** — keine Telefonnummer im Datenmodell/Auth.

### I. Ist SMS-Passwort-Recovery aktuell technisch möglich?
**Nein.** Es fehlen: aktivierter **Phone-Provider** (Supabase), **SMS-Provider** (Twilio/MessageBird/Vonage, kostenpflichtig), Enrollment/Verifizierung (`signInWithOtp`/`verifyOtp`), gespeicherte verifizierte Nummern. Eine Nummer aus einer normalen `profiles`-Spalte wäre **kein** vertrauenswürdiger Recovery-Faktor.

### J. Welche Änderungen wären nötig?
- **E-Mail-Recovery (empfohlen):** `resetPasswordForEmail(email, { redirectTo })` + Recovery-Route (`app/auth/recovery` o. ä.) + `PASSWORD_RECOVERY`-Handling im Session-Context + „Neues Passwort"-Screen (`updateUser({password})`). Dashboard: **SMTP**, **Redirect-URL-Allowlist** (`anyvo://…`), E-Mail-Template.
- **E-Mail-Änderung:** vorhandene `updateEmail` an eine UI anbinden (nur email-Konten), Zustände „pending Bestätigung/bestätigt/fehlgeschlagen" abbilden; SMTP nötig.
- **SMS-Recovery:** Phone-Provider + SMS-Provider + Verifizierungs-/OTP-Flow — nur über **Supabase Auth** (`verifyOtp`), **keine eigene OTP-Tabelle/Codes**.

### K. Verhalten bei Google-Konten
`provider==='google'`. In der Regel **keine Passwort-Identity** → „Passwort ändern" ist ausgeblendet (korrekt). E-Mail ist **Google-verwaltet**; `updateUser({email})` für ein OAuth-only-Konto ist nicht sinnvoll und sollte nicht angeboten werden. Mehrere Identities (`linkIdentity`) werden **nicht** genutzt. Recovery per ANYVO-E-Mail/SMS bringt Google-Nutzern nichts (kein ANYVO-Passwort).

### L. Verhalten bei Apple-Konten
`provider==='apple'` (nativ, `signInWithIdToken`). E-Mail **Apple-verwaltet**, ggf. **Private-Relay** (`…@privaterelay.appleid.com`). Wie Google: kein ANYVO-Passwort, E-Mail-/Passwortänderung nicht anbieten.

### M. Konkrete Empfehlung für ANYVO
1. **Zuerst E-Mail-basiertes „Passwort vergessen"** implementieren (Supabase-nativ, größter Nutzen, geringe Kosten) — inkl. Recovery-Deep-Link + `PASSWORD_RECOVERY`-Handling. Voraussetzung: **SMTP** (Resend) + Redirect-Allowlist.
2. **E-Mail-Änderung** UI anbinden (`updateEmail` existiert), **provider-aware**, mit Pending-Bestätigungs-Zustand.
3. **„Konto & Sicherheit"-Screen** einführen, der beides + Provider-Anzeige (Google/Apple) + Abmelden bündelt; provider-abhängig rendern (Muster existiert bereits in `edit-profile.tsx`).
4. **SMS-Recovery vorerst NICHT** — kein Datenbestand/Provider, Zusatzkosten, hilft OAuth-Nutzern nicht. Später optional über Supabase Phone Auth.
5. **Härtung:** generische Reset-Meldung (kein User-Enumeration), Supabase-Rate-Limits nutzen, Reauthentication für sicherheitskritische Änderungen erwägen, keine Tokens/OTPs loggen.

---

## Phase-12-Bericht (A–R)
- **A. Auth-Provider:** E-Mail/Passwort, Google (OAuth/PKCE), Apple (nativ). Alle via Supabase.
- **B. E-Mail ändern möglich?** Service ja, **UI nein** (read-only, „nicht verfügbar").
- **C. Passwort ändern möglich?** Ja (email-Konten, `edit-profile.tsx`), ohne Reauth.
- **D. Passwort vergessen per E-Mail?** **Nein.**
- **E. Recovery-Deep-Link korrekt?** **Nein** (nur OAuth-Callback; kein Recovery-Handler).
- **F. Telefonnummer vorhanden?** **Nein.**
- **G. Telefonnummer Auth-verifiziert?** **Nein.**
- **H. SMS-Provider konfiguriert?** Nicht im Repo; **Dashboard prüfen** — im App-Code keinerlei Phone-Auth.
- **I. SMS-Recovery sinnvoll?** Aktuell **nein** (kein Datenbestand, Kosten, kein Nutzen für Google/Apple).
- **J. Google-Verhalten:** kein Passwort-Login, E-Mail providerverwaltet; Passwort-UI korrekt ausgeblendet.
- **K. Apple-Verhalten:** wie Google; ggf. Private-Relay-Mail.
- **L. Nötige Codeänderungen:** Reset-Flow (Service + Route + Session-Handler + Screen), E-Mail-Änderung-UI, „Konto & Sicherheit"-Screen. (In diesem Lauf **nicht** umgesetzt.)
- **M. Nötige Supabase-Dashboard-Änderungen:** SMTP (custom/Resend) aktivieren; Redirect-URL-Allowlist (`anyvo://auth/callback`, Recovery-Pfad); E-Mail-Templates; „Secure email/password change"-Settings entscheiden; (für SMS) Phone- + SMS-Provider.
- **N. iOS-Konfiguration:** Recovery über bestehendes `anyvo://`-Scheme möglich; Universal Links optional (`ios.associatedDomains` fehlt). E-Mail-Template-Link muss zuverlässig ins App-Scheme führen.
- **O. Android-Konfiguration:** Scheme-Intent-Filter via expo-router vorhanden; Recovery-Route ergänzen. Ggf. explizite `intentFilters` für den Recovery-Pfad.
- **P. Sicherheitsrisiken:** fehlender Reset-Flow; keine Reauthentication; potenzielles User-Enumeration bei künftigen Meldungen; Redirect-Allowlist beachten (Deep-Link-Hijacking); SMTP-Ratenlimits; niemals Tokens/OTPs loggen.
- **Q. DB-Migration erforderlich?** **Nein** für E-Mail/Passwort-Recovery (alles Supabase-Auth-nativ). Telefonnummern gehören in **Supabase Auth** (verifiziert), **nicht** in eine `profiles`-Spalte.
- **R. Empfehlung:** E-Mail-Recovery + E-Mail-Änderung-UI + „Konto & Sicherheit" umsetzen; SMS zurückstellen. Details siehe M oben.

## Nächster Schritt
Der Nutzer entscheidet, ob (1) E-Mail-Änderung, (2) E-Mail-Recovery und/oder (3) SMS-Recovery implementiert werden. Bis dahin **keine** Codeänderung.
