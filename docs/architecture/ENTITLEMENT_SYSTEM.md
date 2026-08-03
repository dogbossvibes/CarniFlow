# Entitlement-System

## Zweck
Das Entitlement-System ergänzt die regulären Store-Abonnements um serverseitig
vergebene Sonderrechte für einzelne Benutzer. Der erste produktive Anwendungsfall
ist `lifetime`: lebenslanger ANYVO-Produktzugriff ohne Apple-, Google- oder
RevenueCat-Kauf.

## Subscription vs. Entitlement
Reguläre Kunden erhalten Zugriff weiter über `subscriptions`,
`user_capabilities`, RevenueCat und die bestehenden Pläne `newbie`,
`founder_active`, `active` und `trainer`. Entitlements liegen zusätzlich in
`public.user_entitlements` und erweitern die effektiven Rechte. Sie ersetzen kein
Store-Abo und erzeugen keine Fake-Transaktion.

## Aktives Entitlement
Ein Entitlement ist aktiv, wenn `revoked_at is null` und `expires_at is null`
oder `expires_at > now()`. Die App liest nur aktive eigene Entitlements.

## Lifetime
`lifetime` aktiviert alle regulären Produkt-Capabilities, die in
`features/subscription/plans.ts` als reguläre Produktfähigkeiten registriert
sind. Das umfasst Active-, Trainer- und Fährten-/IGP-Zugriff, soweit diese über
`pro_member`, `trainer_module` oder reguläre Capabilities gated werden.
`lifetime` gewährt keinen Admin-, Debug-, Support- oder Mitarbeiterzugriff und
hebt keine Mandanten- oder Datenschutzgrenzen auf.

## Sicherheitsmodell und RLS
`public.user_entitlements` hat RLS aktiviert. Authentifizierte Benutzer dürfen
nur eigene aktive Entitlements lesen. Es gibt keine Insert-, Update- oder
Delete-Policy für normale Benutzer. Vergabe, Ablaufänderung und Widerruf laufen
über Supabase SQL/API mit Service-Role oder einen späteren sicheren Adminpfad.
Service-Role-Schlüssel dürfen nie in der mobilen App landen.

Serverseitige NEWBIE-Quota-RPCs verwenden `is_pro_member(uuid)`. Diese Funktion
liest weiterhin den regulären `user_capabilities.pro_member`-Status und
berücksichtigt zusätzlich aktive `lifetime`-Entitlements. Die Entitlement-Tabelle
bleibt die alleinige Quelle für administrativ vergebene Sonderrechte; es gibt
keine Spiegelung nach `user_capabilities`. `is_pro_member` ist ein interner
SECURITY-DEFINER-Helfer: normale Clients erhalten keine direkte Ausführung und
nutzen ausschließlich die Quota-RPCs mit `auth.uid()`.

## Manuelle Vergabe und Prüfung

1. Migrationen kontrolliert über den Supabase-Migrationsworkflow anwenden. Die
   Quota-Basis muss zuerst vorhanden sein; danach
   `20260802100000_user_entitlements.sql` und
   `20260802110000_lifetime_quota_access.sql` anwenden. Keine Remote-Migration
   aus dieser Arbeitsumgebung und keine Ausführung aus der App.

2. Auth-UUID in Supabase unter Authentication > Users oder per Admin-SQL
   ermitteln:

```sql
select id, email from auth.users where email = '<USER_EMAIL>';
```

3. `lifetime` administrativ vergeben:

```sql
insert into public.user_entitlements (user_id, entitlement, notes)
values (
  '<AUTH_USER_UUID>',
  'lifetime',
  'Lebenslanger ANYVO-Vollzugriff'
);
```

Idempotente Variante für einen bereits bestehenden aktiven Datensatz:

```sql
insert into public.user_entitlements (user_id, entitlement, notes)
values (
  '<AUTH_USER_UUID>',
  'lifetime',
  'Lebenslanger ANYVO-Vollzugriff'
)
on conflict (user_id, entitlement) where revoked_at is null
do update set notes = excluded.notes, updated_at = now();
```

4. Aktiven Zugriff prüfen:
```sql
select user_id, entitlement, granted_at, expires_at, revoked_at
from public.user_entitlements
where user_id = '<AUTH_USER_UUID>'
  and entitlement = 'lifetime'
  and revoked_at is null
  and (expires_at is null or expires_at > now());
```

5. Zugriff widerrufen:
Soft-Revoke:

```sql
update public.user_entitlements
set revoked_at = now()
where user_id = '<AUTH_USER_UUID>'
  and entitlement = 'lifetime'
  and revoked_at is null;
```

Widerruf und Ablauf wirken auch auf die serverseitigen Quota-Prüfungen:
`is_pro_member` wertet nur `revoked_at is null` und ein fehlendes oder zukünftiges
`expires_at` als aktiv aus.

## RevenueCat
RevenueCat bleibt Quelle für normale Käufe und Restore. Subscription-Webhook und
Store-Receipt-Logik bleiben unverändert. Wenn ein Store-Abo abläuft, darf der
Webhook `subscriptions` und `user_capabilities` ändern; `lifetime` bleibt davon
unabhängig in `user_entitlements` erhalten und wird bei der effektiven
Capability-Auflösung erneut additiv berücksichtigt.

## Logout und Benutzerwechsel
Entitlements werden über React Query pro Benutzer-ID geladen
(`['capabilities', uid]`, `['userAccess', uid]`). Ohne Benutzer-ID sind die
Queries deaktiviert; ein Benutzerwechsel verwendet andere Query-Keys und kann
keine Entitlements des vorherigen Benutzers übernehmen.

## Späterer Adminbereich
Ein Adminbereich darf nur serverseitig mit verifizierter Adminrolle oder
Service-Role arbeiten. Keine mobile Client-Schreibpolicy, keine E-Mail-Ausnahme
und keine hart codierte UUID.
