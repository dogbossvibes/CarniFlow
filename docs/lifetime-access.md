# Lifetime / manueller Zugriff (user_entitlements)

Gibt ausgewählten Usern dauerhaft (oder befristet) gratis **Premium/Trainer** —
**zusätzlich** zur Apple/Google-Abo-Logik. Kein Kauf nötig. Nur Admin/Service-Role
darf setzen; normale User können ihre Entitlements nur lesen (RLS).

## Einrichtung (einmalig)
`USER_ENTITLEMENTS_SETUP.sql` im **Supabase SQL-Editor** ausführen (idempotent).

## Wie es wirkt
- `getMyCapabilities()` ODER-verknüpft das Entitlement mit der bestehenden
  Abo-Prüfung → `useCapabilities()` (`isPro`/`isTrainerModule`) schaltet **alle**
  Gates automatisch frei (Premium-Screens, Feature-Locks, Trainer-Tools,
  Navigation, Fährten/Analyse, Limits).
- `getUserAccess()` / `useAccess()` liefern zusätzlich `isLifetime` + `source`
  für die Anzeige (Lifetime-Badge, Kauf-Buttons ausblenden).

## Einem User Lifetime-Zugriff geben (Supabase)
SQL-Editor (läuft als Service-Role, umgeht RLS):

```sql
-- Lifetime Premium (Active):
insert into public.user_entitlements (user_id, plan_type, source, is_lifetime, granted_reason)
values ('<AUTH_USER_UUID>', 'lifetime_active', 'admin', true, 'Founder/Tester');

-- Lifetime Trainer (impliziert Premium):
insert into public.user_entitlements (user_id, plan_type, source, is_lifetime, granted_reason)
values ('<AUTH_USER_UUID>', 'lifetime_trainer', 'admin', true, 'Partner-Trainer');

-- Befristet (z. B. 1 Jahr), kein Lifetime:
insert into public.user_entitlements (user_id, plan_type, source, is_lifetime, expires_at, granted_reason)
values ('<AUTH_USER_UUID>', 'active', 'manual', false, now() + interval '1 year', 'Aktion');
```

User-UUID findest du in **Authentication → Users** (oder `select id, email from auth.users`).

## Wieder entziehen
```sql
update public.user_entitlements set active = false, updated_at = now()
where user_id = '<AUTH_USER_UUID>';
```

## Feldreferenz
- `plan_type`: `free | active | trainer | lifetime_active | lifetime_trainer`
- `source`: `apple | google | manual | founder | admin`
- `is_lifetime`: true ⇒ UI zeigt „Lifetime Zugriff aktiv", keine Kauf-Buttons
- `active`: false ⇒ Entitlement deaktiviert
- `expires_at`: null = unbegrenzt; sonst muss `> now()` sein
- Premium gilt bei `plan_type ∈ {active, lifetime_active, trainer, lifetime_trainer}`,
  Trainer bei `{trainer, lifetime_trainer}` — jeweils `active=true` und nicht abgelaufen.

## Testen
1. Migration ausführen.
2. Für dein Test-Konto eine Zeile wie oben einfügen (`lifetime_active` oder `lifetime_trainer`).
3. In der App neu laden / Profil öffnen → Premium/Trainer ist freigeschaltet,
   im Profil/Abo steht „Lifetime (Trainer) Zugriff aktiv", `/premium` zeigt
   statt Kauf-Buttons „Du hast lebenslangen Zugriff auf diese Funktionen."
4. Gegentest: `active=false` setzen → Zugriff fällt auf den Abo-Status zurück.
