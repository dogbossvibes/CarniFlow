-- Read-only: Rechte der Gruppen-Objekte, deren Rechte beim Export 2026-11-12 fehlten.
-- Erwartung laut Baseline-Migration: anon/authenticated haben KEINEN Zugriff.
-- Jede Ergebniszeile ist ein Befund (Zugriff für anon/authenticated/PUBLIC).

select 'funktion' as art, p.oid::regprocedure::text as objekt, coalesce(a.grantee::regrole::text, 'PUBLIC') as rolle
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
where n.nspname = 'public'
  and (p.proname like 'gd%' or p.proname like 'group_distraction%' or p.proname like 'anyvo_group_monitor%' or p.proname = 'tracking_private_active_initiator')
  and (a.grantee = 0 or a.grantee::regrole::text in ('anon', 'authenticated'))
union all
select 'tabelle', c.relname, coalesce(a.grantee::regrole::text, 'PUBLIC') || ' ' || a.privilege_type
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
where n.nspname = 'public'
  and (c.relname like 'group_distraction%' or c.relname = 'anyvo_group_monitor_targets')
  and (a.grantee = 0 or a.grantee::regrole::text in ('anon', 'authenticated'))
order by 1, 2, 3;
