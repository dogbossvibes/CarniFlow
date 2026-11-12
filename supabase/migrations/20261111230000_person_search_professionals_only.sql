-- Personensuche: nur noch Fachprofile (Trainer:innen). Privatpersonen sind
-- über die Suche nicht mehr auffindbar; sie werden über Kontaktanfragen
-- (Code, Link, exakter Benutzername) verbunden.
--
-- ERST AUSFÜHREN, wenn die App-Version mit Kontaktanfragen bei den Nutzer:innen
-- angekommen ist. Ältere App-Versionen nutzen diese Suche in «Gesundheitsakte
-- teilen» und «Fährte übergeben», um Privatpersonen zu finden; das geht danach
-- nicht mehr. Die aktuelle App ruft die Funktion nicht mehr auf.

create or replace function public.search_anyvo_people(p_query text)
returns table(id uuid, full_name text, username text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.id, p.full_name, p.username
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and p.role = 'trainer'
    and length(trim(coalesce(p_query, ''))) >= 2
    and (
      p.username ilike '%' || trim(p_query) || '%'
      or p.full_name ilike '%' || trim(p_query) || '%'
    )
    and not public.contact_is_blocked(auth.uid(), p.id)
  order by
    (p.username ilike trim(p_query) || '%') desc,
    (p.full_name ilike trim(p_query) || '%') desc,
    p.username nulls last
  limit 20
$$;

revoke all on function public.search_anyvo_people(text) from public, anon;
grant execute on function public.search_anyvo_people(text) to authenticated;
