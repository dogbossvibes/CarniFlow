-- ============================================================================
-- 20261123200000_newbie_track_claim_release.sql
-- NEWBIE-Fährte: abgebrochener Start gibt das Monatskontingent zurück.
--
-- Hintergrund: claim_newbie_quota('track', ref) bucht beim START des Legens. Kam die
-- Aufnahme nie zustande (GPS nicht bereit, Bildschirm verlassen), war die einzige
-- kostenlose Fährte des Monats trotzdem verbraucht.
--
-- Rein additiv: neue Funktion public.release_newbie_quota(text, text).
-- Keine Tabellen-, Policy-, RLS- oder Datenänderung an Fährten/Trainings; bestehende
-- Funktionen bleiben unverändert. Entfernt höchstens EINE eigene Kontingentbuchung
-- (newbie_quota_claims) und nur, wenn alle Bedingungen gelten:
--   • angemeldeter Aufrufer, nur eigene Buchung, nur kind = 'track'
--   • Buchung im laufenden Monat (UTC) und höchstens 24 Stunden alt
--   • unter dieser ID gibt es KEINE Fährte in training_sessions (Client nutzt die
--     Buchungs-ID als Fährten-ID; gespeicherte Fährten zählen also weiter)
-- Trainings ('training') werden nie zurückgegeben.
--
-- Bekannte Grenze: Wer eine gespeicherte Fährte löscht und die Funktion danach
-- innerhalb von 24 Stunden selbst mit deren ID aufruft, erhält das Kontingent zurück.
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

  -- Gibt es die Fährte unter dieser ID, zählt die Buchung weiter (Primärschlüssel-Zugriff).
  if v_ref is not null and exists (select 1 from training_sessions where id = v_ref) then
    return false;
  end if;

  delete from newbie_quota_claims
   where user_id = v_uid
     and kind = p_kind
     and ref_id = p_ref
     and period = v_period
     and created_at > now() - interval '24 hours';
  get diagnostics v_count = row_count;
  return v_count > 0;
end; $$;

revoke all on function public.release_newbie_quota(text, text) from public;
revoke all on function public.release_newbie_quota(text, text) from anon;
grant execute on function public.release_newbie_quota(text, text) to authenticated;
