-- NUR LESEN. Verändert nichts. Im Supabase-Dashboard (SQL Editor) ausführen,
-- vor und nach 20261111210000_connections_write_hardening.sql.
-- Die Ausgabe enthält keine Personendaten (nur Policies, Trigger und Zählwerte).

-- 1) Aktuelle Policies auf public.connections
select policyname, permissive, cmd, roles::text, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'connections'
order by cmd, policyname;

-- 2) Trigger auf public.connections
select tgname, pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.connections'::regclass and not tgisinternal;

-- 3) Zählwerte nach Art, Status und Ersteller. Zeilen mit created_by =
--    'connected' entstehen in keinem aktuellen App-Ablauf und sollten einzeln
--    angesehen werden, bevor man sie bewertet.
select connection_type, status, created_by, count(*) as anzahl
from public.connections
group by 1, 2, 3
order by 1, 2, 3;

-- 4) Angenommene Verbindungen ohne Berechtigungszeile (Hinweis auf Zeilen, die
--    nicht über die App-Abläufe für Trainer entstanden sind)
select c.connection_type, c.created_by, count(*) as anzahl
from public.connections c
left join public.connection_permissions p on p.connection_id = c.id
where c.status = 'accepted' and p.connection_id is null
group by 1, 2
order by 1, 2;
