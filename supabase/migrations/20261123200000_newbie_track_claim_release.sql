-- ============================================================================
-- 20261123200000_newbie_track_claim_release.sql
-- NEWBIE-Fährte: Monatskontingent zurückgeben, wenn die Fährte nie abgesucht wurde.
--
-- Hintergrund: claim_newbie_quota('track', ref) bucht beim START des Legens. Wurde die
-- Aufnahme nie gestartet, oder wurde die gelegte Fährte vor der Absuche abgebrochen,
-- war die einzige kostenlose Fährte des Monats trotzdem verbraucht.
--
-- Rein additiv: neue Funktion public.release_newbie_quota(text, text).
-- Keine Tabellen-, Policy-, RLS- oder Datenänderung an Fährten/Trainings; bestehende
-- Funktionen bleiben unverändert. Entfernt höchstens EINE eigene Kontingentbuchung
-- (newbie_quota_claims), nur kind = 'track', nur im laufenden Monat (UTC):
--   A) Unter der ID gibt es KEINE Fährte (Aufnahme nie gestartet): nur wenn die
--      Buchung höchstens 24 Stunden alt ist.
--   B) Unter der ID gibt es die Fährte (der Client nutzt die Buchungs-ID als
--      Fährten-ID): nur wenn es die EIGENE Fährte ist (type 'track') und sie nie
--      abgesucht wurde (kein track_data.run, kein Suchlauf in track_runs, keine Punkte
--      ausser 'lay'). Die Fährte selbst bleibt unverändert erhalten.
-- Trainings ('training') werden nie zurückgegeben.
--
-- Bekannte Grenzen: Mit eigenen API-Aufrufen statt über die App lässt sich eine nicht
-- abgesuchte Fährte zurückgeben und später trotzdem absuchen; eine offline gelegte,
-- noch nicht synchronisierte Fährte erscheint dem Server wie Fall A. Das Fährten-Limit
-- wird serverseitig ohnehin nur über den Client-Claim erzwungen.
--
-- Anwendung: nur Staging ohne Freigabe; Production NUR mit ausdrücklicher Freigabe.
-- ============================================================================
create or replace function public.release_newbie_quota(p_kind text, p_ref text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_period text := to_char(timezone('utc', now()), 'YYYY-MM');
  v_count  int;
  v_ref    uuid;
begin
  if v_uid is null or p_kind is distinct from 'track' or p_ref is null or p_ref = '' then
    return false;
  end if;

  -- Gleiche Sperre wie claim_newbie_quota → kein Wettlauf zwischen Buchen und Freigeben.
  perform pg_advisory_xact_lock(hashtext(v_uid::text || ':' || p_kind));

  -- Fährten-IDs sind UUIDs; eine andere ID kann zu keiner Fährte gehören.
  begin v_ref := p_ref::uuid; exception when invalid_text_representation then v_ref := null; end;

  if v_ref is not null and exists (select 1 from training_sessions where id = v_ref) then
    -- Fall B: nur die eigene Fährte, die nie abgesucht wurde.
    if not exists (select 1 from training_sessions s
                    where s.id = v_ref and s.owner_id = v_uid and s.type = 'track'
                      and (s.track_data is null or s.track_data -> 'run' is null)) then
      return false;
    end if;
    if exists (select 1 from track_points p
                where p.session_id = v_ref and coalesce(p.point_type, 'lay') <> 'lay') then
      return false;
    end if;
    if exists (select 1 from track_runs r where r.session_id = v_ref) then
      return false;
    end if;
    delete from newbie_quota_claims
     where user_id = v_uid and kind = p_kind and ref_id = p_ref and period = v_period;
  else
    -- Fall A: Aufnahme nie gestartet, nur frische Buchung.
    delete from newbie_quota_claims
     where user_id = v_uid
       and kind = p_kind
       and ref_id = p_ref
       and period = v_period
       and created_at > now() - interval '24 hours';
  end if;
  get diagnostics v_count = row_count;
  return v_count > 0;
end; $$;

revoke all on function public.release_newbie_quota(text, text) from public;
revoke all on function public.release_newbie_quota(text, text) from anon;
grant execute on function public.release_newbie_quota(text, text) to authenticated;
