# Lifetime / manueller Zugriff

Diese Datei ist nur noch ein kurzer Einstieg. Die technische Quelle ist
`docs/architecture/ENTITLEMENT_SYSTEM.md`; das versionierte Schema liegt in
`supabase/migrations/20260802100000_user_entitlements.sql` und die serverseitige
Quota-Erweiterung in
`supabase/migrations/20260802110000_lifetime_quota_access.sql`.

Kurzfassung:
- Sonderrechte werden in `public.user_entitlements` vergeben.
- `lifetime` ist ein Produktzugriffsrecht, keine Adminrolle.
- Aktive Entitlements sind nicht widerrufen und nicht abgelaufen.
- Normale Benutzer dürfen nur eigene aktive Entitlements lesen.
- Vergabe und Widerruf erfolgen über Service-Role/Admin-SQL, nicht aus der App.
- NEWBIE-Quota-RPCs berücksichtigen aktives `lifetime` direkt aus
  `user_entitlements`; es wird nichts nach `user_capabilities` gespiegelt.
