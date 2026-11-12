-- NUR LESEN. Verändert nichts. Zeigt, welche Gruppen-/Live-Funktionen und
-- -Tabellen in dieser Datenbank tatsächlich installiert sind. Keine Personendaten.

-- 1) Funktionen (mit Prüfsumme der Definition zum Abgleich mit dem Repo)
select n.nspname as schema, p.proname as funktion,
       pg_get_function_identity_arguments(p.oid) as argumente,
       p.prosecdef as security_definer,
       md5(pg_get_functiondef(p.oid)) as md5_definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.proname ilike 'training_group%' or p.proname ilike '%live_share%' or p.proname ilike '%group_distraction%'
order by 1, 2;

-- 2) Tabellen mit RLS-Status und Zeilenschätzung
select n.nspname as schema, c.relname as tabelle, c.relrowsecurity as rls_aktiv,
       c.reltuples::bigint as zeilen_geschaetzt
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and (c.relname ilike 'training_group%' or c.relname ilike '%live_share%' or c.relname ilike '%group_distraction%')
order by 1, 2;

-- 3) Direkte Tabellenrechte für App-Rollen (sollte leer sein, wenn alles über Funktionen läuft)
select table_schema, table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as rechte
from information_schema.role_table_grants
where grantee in ('anon', 'authenticated')
  and (table_name ilike 'training_group%' or table_name ilike '%live_share%' or table_name ilike '%group_distraction%')
group by 1, 2, 3 order by 1, 2, 3;
