-- ============================================================================
-- 20261126120000_training_group_plans.sql
-- Vereins- und Hundeplatzmodus (Spec docs/specs/phase2/04-vereinsmodus.md, PR A):
-- Trainingstag planen, Startliste, Zusagen. Verein = bestehende Gruppe.
--
-- Muster wie alle training_private_*-Tabellen: für die App gesperrt (RLS ohne Policies,
-- keine Rechte für anon/authenticated); Zugriff NUR über die geprüfte Funktion
-- public.training_group_plan_v1(action, request) (security definer, search_path '').
--
-- Rechte (Entscheide der Nutzerin 2026-11-24):
--   * Planen (anlegen, ändern, veröffentlichen, absagen, Startliste, starten, beenden):
--     Inhaber:in oder Organisator:in einer aktiven Gruppe (training_private_manager);
--     anlegen/ändern/Startliste zusätzlich mit ACTIVE (gd_active, wie «Gruppe erstellen»).
--   * Mitglied: veröffentlichte Pläne der eigenen Gruppe sehen, eigene Zeile zu-/absagen,
--     EIGENEN Hund wählen/entfernen, als Leger:in bestätigen. Entwürfe sieht nur, wer plant.
--   * Ehemalige Mitglieder und Nicht-Mitglieder: nichts (training_private_member).
-- Fremde Hunde: Name/Rasse erscheinen nur, wenn die Besitzerin/der Besitzer den Hund selbst
-- gesetzt hat, ihn noch besitzt, die Hunde-Epoche passt und sie/er noch Mitglied ist.
-- Keine Hundeprofile, keine Gesundheitsdaten, keine privaten Trainings.
--
-- Datenwirkung: nur zwei neue Tabellen und neue Funktionen. Keine bestehende Tabelle,
-- Policy oder Funktion wird geändert; nichts wird gelöscht. Absagen/Entfernen setzt
-- Status bzw. removed_at, Pläne bleiben als Verlauf erhalten.
-- Konto-Löschung: eigene Zeilen als Hundeführer:in verschwinden (on delete cascade);
-- als Leger:in bzw. Planer:in wird der Bezug geleert (on delete set null), damit die
-- Pläne der übrigen Mitglieder erhalten bleiben. Gelöschter Hund → dog_id null.
-- Gruppe gelöscht → Pläne mit (on delete cascade, wie bei Trainings).
--
-- Anwendung: zuerst Staging; Production NUR mit ausdrücklicher Freigabe.
-- ============================================================================

set check_function_bodies = off;

-- 1) Tabellen
create table if not exists public.training_private_plans (
  id uuid not null,
  group_id uuid not null,
  created_by uuid,
  title text not null,
  starts_at timestamp with time zone not null,
  meeting_point text,
  meeting_lat numeric,
  meeting_lng numeric,
  notes text,
  status text not null default 'draft',
  session_id uuid,
  request jsonb not null,
  created_at timestamp with time zone not null default clock_timestamp(),
  updated_at timestamp with time zone not null default clock_timestamp(),
  constraint training_private_plans_pkey primary key (id),
  constraint training_private_plans_title_check check (length(title) between 1 and 80),
  constraint training_private_plans_meeting_check check (meeting_point is null or length(meeting_point) between 1 and 120),
  constraint training_private_plans_notes_check check (notes is null or length(notes) between 1 and 1000),
  constraint training_private_plans_geo_check check ((meeting_lat is null) = (meeting_lng is null)
    and (meeting_lat is null or (meeting_lat between -90 and 90 and meeting_lng between -180 and 180))),
  constraint training_private_plans_status_check check (status in ('draft', 'published', 'started', 'done', 'cancelled')),
  constraint training_private_plans_group_id_fkey foreign key (group_id) references public.training_private_groups(id) on delete cascade,
  constraint training_private_plans_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null,
  constraint training_private_plans_session_id_fkey foreign key (session_id) references public.training_private_sessions(id) on delete set null
);
create index if not exists training_private_plans_group on public.training_private_plans using btree (group_id, starts_at desc);
alter table public.training_private_plans enable row level security;

create table if not exists public.training_private_plan_entries (
  id uuid not null,
  plan_id uuid not null,
  position integer not null,
  handler_id uuid not null,
  layer_id uuid,
  dog_id uuid,
  dog_epoch uuid,
  planned_lying_minutes integer,
  track_kind text not null default 'free',
  field_note text,
  blind boolean not null default false,
  handler_response text not null default 'open',
  layer_response text not null default 'open',
  track_id uuid,
  removed_at timestamp with time zone,
  created_at timestamp with time zone not null default clock_timestamp(),
  updated_at timestamp with time zone not null default clock_timestamp(),
  constraint training_private_plan_entries_pkey primary key (id),
  constraint training_private_plan_entries_position_check check (position between 1 and 40),
  constraint training_private_plan_entries_lying_check check (planned_lying_minutes is null or planned_lying_minutes between 0 and 600),
  constraint training_private_plan_entries_kind_check check (track_kind in ('free', 'igp1', 'igp2', 'igp3', 'ifh1', 'ifh2', 'igpfh', 'fh', 'mantrail')),
  constraint training_private_plan_entries_note_check check (field_note is null or length(field_note) between 1 and 120),
  constraint training_private_plan_entries_handler_response_check check (handler_response in ('open', 'yes', 'no')),
  constraint training_private_plan_entries_layer_response_check check (layer_response in ('open', 'yes', 'no')),
  -- Hund nur zusammen mit seiner Epoche; nie bei Absage.
  constraint training_private_plan_entries_dog_check check ((dog_id is null) = (dog_epoch is null) and (dog_id is null or handler_response = 'yes')),
  -- Eigene Fährte (Leger:in = Hundeführer:in) nie blind (wie Gruppentraining #150).
  constraint training_private_plan_entries_blind_check check (not (blind and layer_id = handler_id)),
  constraint training_private_plan_entries_plan_id_fkey foreign key (plan_id) references public.training_private_plans(id) on delete cascade,
  constraint training_private_plan_entries_handler_id_fkey foreign key (handler_id) references auth.users(id) on delete cascade,
  constraint training_private_plan_entries_layer_id_fkey foreign key (layer_id) references auth.users(id) on delete set null,
  constraint training_private_plan_entries_dog_id_fkey foreign key (dog_id) references public.dogs(id) on delete set null,
  constraint training_private_plan_entries_track_id_fkey foreign key (track_id) references public.training_private_tracks(id) on delete set null
);
create index if not exists training_private_plan_entries_plan on public.training_private_plan_entries using btree (plan_id, position);
alter table public.training_private_plan_entries enable row level security;

revoke all on table public.training_private_plans, public.training_private_plan_entries from public, anon, authenticated;
grant all on table public.training_private_plans, public.training_private_plan_entries to service_role;

-- Ein gelöschter Hund darf nie mit leerer Epoche, aber gesetzter Zusage stehen bleiben:
-- on delete set null leert dog_id, die Epoche wird hier mitgeleert.
create or replace function public.training_private_plan_entry_dog_gone()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
 if new.dog_id is null and new.dog_epoch is not null then new.dog_epoch := null; end if;
 return new;
end $function$;
drop trigger if exists training_private_plan_entry_dog_gone on public.training_private_plan_entries;
create trigger training_private_plan_entry_dog_gone before update of dog_id on public.training_private_plan_entries
 for each row execute function public.training_private_plan_entry_dog_gone();

-- 2) Ausgabe (JSON) – nur, was die betrachtende Person sehen darf
create or replace function public.training_private_plan_entry_json(e public.training_private_plan_entries, g uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
 select jsonb_build_object(
   'entryId', e.id, 'position', e.position,
   'handlerUserId', e.handler_id,
   -- Anzeigename nur, solange die Person Mitglied ist; sonst null («Ehemaliges Mitglied»).
   'handlerName', (select m.display_name from public.training_private_members m where m.group_id=g and m.user_id=e.handler_id and m.left_at is null),
   'layerUserId', e.layer_id,
   'layerName', (select m.display_name from public.training_private_members m where m.group_id=g and m.user_id=e.layer_id and m.left_at is null),
   -- Hund nur, wenn der Besitzer ihn selbst gesetzt hat und alles noch gilt.
   'dog', (select jsonb_build_object('dogId', d.id, 'name', d.name, 'breed', d.breed)
           from public.dogs d
           where d.id=e.dog_id and d.owner_id=e.handler_id and e.handler_response='yes'
             and e.dog_epoch=public.training_private_dog_epoch(d.id)
             and public.training_private_member(g, e.handler_id)),
   'plannedLyingMinutes', e.planned_lying_minutes, 'trackKind', e.track_kind, 'fieldNote', e.field_note, 'blind', e.blind,
   'handlerResponse', e.handler_response, 'layerResponse', e.layer_response, 'trackId', e.track_id,
   'updatedAtMs', public.training_private_ms(e.updated_at))
$function$;

create or replace function public.training_private_plan_json(p uuid, with_entries boolean)
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
 select jsonb_build_object(
   'planId', v.id, 'groupId', v.group_id, 'createdByUserId', v.created_by, 'title', v.title,
   'startsAtMs', public.training_private_ms(v.starts_at), 'meetingPoint', v.meeting_point,
   'meetingLat', v.meeting_lat, 'meetingLng', v.meeting_lng, 'notes', v.notes, 'status', v.status,
   'sessionId', v.session_id, 'createdAtMs', public.training_private_ms(v.created_at), 'updatedAtMs', public.training_private_ms(v.updated_at))
  || case when with_entries then jsonb_build_object('entries', coalesce((select jsonb_agg(public.training_private_plan_entry_json(e, v.group_id) order by e.position, e.id)
        from public.training_private_plan_entries e where e.plan_id=v.id and e.removed_at is null), '[]'::jsonb)) else '{}'::jsonb end
 from public.training_private_plans v where v.id=p
$function$;

-- 3) Eingaben
create or replace function public.training_private_plan_fields(r jsonb,
  out title text, out starts timestamptz, out mp text, out lat numeric, out lng numeric, out notes text)
 language plpgsql
 stable
 set search_path to ''
as $function$
begin
 title := public.training_private_text(r, 'title', 80);
 starts := to_timestamp(public.training_private_number(r, 'startsAtMs', 946684800000, 4102444800000, true) / 1000.0);
 mp := case when r->'meetingPoint' is null or r->'meetingPoint'='null'::jsonb then null else public.training_private_text(r, 'meetingPoint', 120) end;
 if (r->'meetingLat' is null or r->'meetingLat'='null'::jsonb) <> (r->'meetingLng' is null or r->'meetingLng'='null'::jsonb) then
  raise exception using errcode='22023', message='GROUP_INVALID_REQUEST'; end if;
 lat := case when r->'meetingLat' is null or r->'meetingLat'='null'::jsonb then null else public.training_private_number(r, 'meetingLat', -90, 90, false) end;
 lng := case when r->'meetingLng' is null or r->'meetingLng'='null'::jsonb then null else public.training_private_number(r, 'meetingLng', -180, 180, false) end;
 notes := case when r->'notes' is null or r->'notes'='null'::jsonb then null else public.training_private_text(r, 'notes', 1000) end;
end $function$;

-- Schlüssel prüfen: Pflichtschlüssel genau, optionale erlaubt (training_private_request kennt nur genaue Listen).
create or replace function public.training_private_plan_keys(r jsonb, required text[], optional text[])
 returns void
 language plpgsql
 stable
 set search_path to ''
as $function$
begin
 if auth.uid() is null then raise exception using errcode='42501', message='GROUP_UNAVAILABLE'; end if;
 if r is null or jsonb_typeof(r)<>'object' or octet_length(r::text)>8192
    or exists(select 1 from unnest(required) k where not (r ? k))
    or exists(select 1 from jsonb_object_keys(r) k where not (k = any(required) or k = any(optional))) then
  raise exception using errcode='22023', message='GROUP_INVALID_REQUEST'; end if;
end $function$;

-- 4) Die eine Schnittstelle
create or replace function public.training_group_plan_v1(p_action text, p_request jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
 set lock_timeout to '3s'
as $function$
declare
  u uuid := auth.uid(); g uuid; p uuid; e uuid; d uuid; s uuid; t uuid; body jsonb;
  v public.training_private_plans; en public.training_private_plan_entries; f record;
  handler uuid; layer uuid; pos integer; lying integer; kind text; note text; bl boolean; resp text; ids uuid[];
begin
 if u is null then raise exception using errcode='42501', message='GROUP_UNAVAILABLE'; end if;
 case p_action

 when 'list' then
  perform public.training_private_plan_keys(p_request, array['groupId'], array[]::text[]);
  g := public.training_private_uuid(p_request, 'groupId');
  if not public.training_private_member(g, u) then raise exception using errcode='42501', message='GROUP_UNAVAILABLE'; end if;
  body := jsonb_build_object('groupId', g, 'canPlan', public.training_private_manager(g, u),
   'plans', coalesce((select jsonb_agg(public.training_private_plan_json(x.id, false) order by x.starts_at desc, x.id)
     from (select id, starts_at from public.training_private_plans
           where group_id=g and (status<>'draft' or public.training_private_manager(g, u))
           order by starts_at desc limit 100) x), '[]'::jsonb));

 when 'get' then
  perform public.training_private_plan_keys(p_request, array['planId'], array[]::text[]);
  p := public.training_private_uuid(p_request, 'planId');
  select * into v from public.training_private_plans where id=p;
  if not found or not public.training_private_member(v.group_id, u)
     or (v.status='draft' and not public.training_private_manager(v.group_id, u)) then
   raise exception using errcode='42501', message='GROUP_UNAVAILABLE'; end if;
  body := jsonb_build_object('plan', public.training_private_plan_json(p, true), 'canPlan', public.training_private_manager(v.group_id, u));

 when 'create' then
  perform public.training_private_plan_keys(p_request, array['groupId','planId','title','startsAtMs'], array['meetingPoint','meetingLat','meetingLng','notes']);
  g := public.training_private_uuid(p_request, 'groupId'); p := public.training_private_uuid(p_request, 'planId');
  select * into f from public.training_private_plan_fields(p_request);
  perform public.training_private_lock_group(g);
  select * into v from public.training_private_plans where id=p for update;
  if found then   -- gleiche Anfrage erneut gesendet
   if v.created_by is distinct from u or v.group_id<>g then raise exception using errcode='42501', message='GROUP_UNAVAILABLE'; end if;
   if v.request<>p_request then raise exception using errcode='P0001', message='GROUP_CONFLICT'; end if;
  else
   if not public.training_private_manager(g, u) then raise exception using errcode='42501', message='GROUP_UNAVAILABLE'; end if;
   perform public.gd_active();
   if (select count(*) from public.training_private_plans where group_id=g)>=500
      or (select count(*) from public.training_private_plans where group_id=g and status in ('draft','published','started'))>=30 then
    raise exception using errcode='P0001', message='GROUP_LIMIT'; end if;
   insert into public.training_private_plans(id, group_id, created_by, title, starts_at, meeting_point, meeting_lat, meeting_lng, notes, request)
    values (p, g, u, f.title, f.starts, f.mp, f.lat, f.lng, f.notes, p_request);
  end if;
  body := jsonb_build_object('plan', public.training_private_plan_json(p, true));

 when 'update', 'publish', 'cancel', 'finish', 'link_session' then
  if p_action='update' then perform public.training_private_plan_keys(p_request, array['planId','title','startsAtMs'], array['meetingPoint','meetingLat','meetingLng','notes']);
  elsif p_action='link_session' then perform public.training_private_plan_keys(p_request, array['planId','sessionId'], array[]::text[]);
  else perform public.training_private_plan_keys(p_request, array['planId'], array[]::text[]); end if;
  p := public.training_private_uuid(p_request, 'planId');
  select group_id into g from public.training_private_plans where id=p;
  if g is null or not public.training_private_manager(g, u) then raise exception using errcode='42501', message='GROUP_UNAVAILABLE'; end if;
  perform public.training_private_lock_group(g);
  select * into v from public.training_private_plans where id=p for update;
  if p_action='update' then
   perform public.gd_active();
   if v.status not in ('draft','published') then raise exception using errcode='P0001', message='GROUP_CONFLICT'; end if;
   select * into f from public.training_private_plan_fields(p_request);
   update public.training_private_plans set title=f.title, starts_at=f.starts, meeting_point=f.mp, meeting_lat=f.lat, meeting_lng=f.lng,
     notes=f.notes, updated_at=clock_timestamp() where id=p;
  elsif p_action='publish' then
   if v.status='draft' then update public.training_private_plans set status='published', updated_at=clock_timestamp() where id=p;
   elsif v.status<>'published' then raise exception using errcode='P0001', message='GROUP_CONFLICT'; end if;
  elsif p_action='cancel' then
   if v.status in ('draft','published','started') then update public.training_private_plans set status='cancelled', updated_at=clock_timestamp() where id=p;
   elsif v.status<>'cancelled' then raise exception using errcode='P0001', message='GROUP_CONFLICT'; end if;
  elsif p_action='finish' then
   if v.status='started' then update public.training_private_plans set status='done', updated_at=clock_timestamp() where id=p;
   elsif v.status<>'done' then raise exception using errcode='P0001', message='GROUP_CONFLICT'; end if;
  else   -- link_session: «Tag starten» verknüpft das bestehende Gruppentraining derselben Gruppe
   s := public.training_private_uuid(p_request, 'sessionId');
   if not exists(select 1 from public.training_private_sessions x where x.id=s and x.group_id=g and x.ended_at is null and x.expires_at>clock_timestamp()) then
    raise exception using errcode='42501', message='GROUP_UNAVAILABLE'; end if;
   if v.status='published' then update public.training_private_plans set status='started', session_id=s, updated_at=clock_timestamp() where id=p;
   elsif not (v.status='started' and v.session_id=s) then raise exception using errcode='P0001', message='GROUP_CONFLICT'; end if;
  end if;
  body := jsonb_build_object('plan', public.training_private_plan_json(p, true));

 when 'set_entry' then
  -- Startliste: Organisator:in trägt Personen ein (Hund wählt jede Person selbst).
  perform public.training_private_plan_keys(p_request, array['planId','entryId','position','handlerUserId','trackKind','blind'],
    array['layerUserId','plannedLyingMinutes','fieldNote']);
  p := public.training_private_uuid(p_request, 'planId'); e := public.training_private_uuid(p_request, 'entryId');
  handler := public.training_private_uuid(p_request, 'handlerUserId');
  layer := case when p_request->'layerUserId' is null or p_request->'layerUserId'='null'::jsonb then null else public.training_private_uuid(p_request, 'layerUserId') end;
  pos := public.training_private_number(p_request, 'position', 1, 40, true)::integer;
  lying := case when p_request->'plannedLyingMinutes' is null or p_request->'plannedLyingMinutes'='null'::jsonb then null
           else public.training_private_number(p_request, 'plannedLyingMinutes', 0, 600, true)::integer end;
  kind := public.training_private_text(p_request, 'trackKind', 12);
  if kind not in ('free','igp1','igp2','igp3','ifh1','ifh2','igpfh','fh','mantrail') then raise exception using errcode='22023', message='GROUP_INVALID_REQUEST'; end if;
  note := case when p_request->'fieldNote' is null or p_request->'fieldNote'='null'::jsonb then null else public.training_private_text(p_request, 'fieldNote', 120) end;
  if jsonb_typeof(p_request->'blind') is distinct from 'boolean' then raise exception using errcode='22023', message='GROUP_INVALID_REQUEST'; end if;
  bl := (p_request->>'blind')::boolean;
  if bl and layer = handler then raise exception using errcode='22023', message='GROUP_INVALID_REQUEST'; end if;
  select group_id into g from public.training_private_plans where id=p;
  if g is null or not public.training_private_manager(g, u) then raise exception using errcode='42501', message='GROUP_UNAVAILABLE'; end if;
  perform public.gd_active();
  perform public.training_private_lock_group(g);
  select * into v from public.training_private_plans where id=p for update;
  if v.status not in ('draft','published','started') then raise exception using errcode='P0001', message='GROUP_CONFLICT'; end if;
  if not public.training_private_member(g, handler) or (layer is not null and not public.training_private_member(g, layer)) then
   raise exception using errcode='42501', message='GROUP_UNAVAILABLE'; end if;
  select * into en from public.training_private_plan_entries where id=e for update;
  if found then
   if en.plan_id<>p or en.removed_at is not null then raise exception using errcode='42501', message='GROUP_UNAVAILABLE'; end if;
   -- Andere Person = andere Zusage: Hund und Antworten zurücksetzen.
   update public.training_private_plan_entries set position=pos, handler_id=handler, layer_id=layer, planned_lying_minutes=lying,
     track_kind=kind, field_note=note, blind=bl,
     handler_response=case when handler_id=handler then handler_response else 'open' end,
     dog_id=case when handler_id=handler then dog_id else null end,
     dog_epoch=case when handler_id=handler then dog_epoch else null end,
     layer_response=case when layer_id is not distinct from layer then layer_response else 'open' end,
     updated_at=clock_timestamp() where id=e;
  else
   if (select count(*) from public.training_private_plan_entries where plan_id=p and removed_at is null)>=40 then
    raise exception using errcode='P0001', message='GROUP_LIMIT'; end if;
   insert into public.training_private_plan_entries(id, plan_id, position, handler_id, layer_id, planned_lying_minutes, track_kind, field_note, blind)
    values (e, p, pos, handler, layer, lying, kind, note, bl);
  end if;
  update public.training_private_plans set updated_at=clock_timestamp() where id=p;
  body := jsonb_build_object('plan', public.training_private_plan_json(p, true));

 when 'remove_entry', 'reorder' then
  if p_action='remove_entry' then perform public.training_private_plan_keys(p_request, array['planId','entryId'], array[]::text[]);
  else perform public.training_private_plan_keys(p_request, array['planId','entryIds'], array[]::text[]); end if;
  p := public.training_private_uuid(p_request, 'planId');
  select group_id into g from public.training_private_plans where id=p;
  if g is null or not public.training_private_manager(g, u) then raise exception using errcode='42501', message='GROUP_UNAVAILABLE'; end if;
  perform public.training_private_lock_group(g);
  select * into v from public.training_private_plans where id=p for update;
  if v.status not in ('draft','published','started') then raise exception using errcode='P0001', message='GROUP_CONFLICT'; end if;
  if p_action='remove_entry' then
   e := public.training_private_uuid(p_request, 'entryId');
   update public.training_private_plan_entries set removed_at=coalesce(removed_at, clock_timestamp()), updated_at=clock_timestamp()
    where id=e and plan_id=p;
   if not found then raise exception using errcode='42501', message='GROUP_UNAVAILABLE'; end if;
  else
   if jsonb_typeof(p_request->'entryIds') is distinct from 'array' or jsonb_array_length(p_request->'entryIds')>40 then
    raise exception using errcode='22023', message='GROUP_INVALID_REQUEST'; end if;
   begin select array_agg(x::uuid order by o) into ids from jsonb_array_elements_text(p_request->'entryIds') with ordinality j(x, o);
   exception when invalid_text_representation then raise exception using errcode='22023', message='GROUP_INVALID_REQUEST'; end;
   -- Genau die aktiven Zeilen dieses Plans, jede einmal.
   if coalesce(array_length(ids, 1), 0) <> (select count(*) from public.training_private_plan_entries where plan_id=p and removed_at is null)
      or (select count(distinct x) from unnest(ids) x) <> coalesce(array_length(ids, 1), 0)
      or exists(select 1 from unnest(ids) x where not exists(select 1 from public.training_private_plan_entries en2 where en2.id=x and en2.plan_id=p and en2.removed_at is null)) then
    raise exception using errcode='P0001', message='GROUP_CONFLICT'; end if;
   update public.training_private_plan_entries en3 set position=o.n, updated_at=clock_timestamp()
    from unnest(ids) with ordinality o(x, n) where en3.id=o.x and en3.position<>o.n;
  end if;
  update public.training_private_plans set updated_at=clock_timestamp() where id=p;
  body := jsonb_build_object('plan', public.training_private_plan_json(p, true));

 when 'respond', 'layer_respond' then
  -- Jede Person nur für sich selbst; Hund nur der eigene.
  if p_action='respond' then perform public.training_private_plan_keys(p_request, array['planId','entryId','response'], array['dogId']);
  else perform public.training_private_plan_keys(p_request, array['planId','entryId','response'], array[]::text[]); end if;
  p := public.training_private_uuid(p_request, 'planId'); e := public.training_private_uuid(p_request, 'entryId');
  resp := public.training_private_text(p_request, 'response', 3);
  if resp not in ('yes','no') then raise exception using errcode='22023', message='GROUP_INVALID_REQUEST'; end if;
  select group_id into g from public.training_private_plans where id=p;
  if g is null or not public.training_private_member(g, u) then raise exception using errcode='42501', message='GROUP_UNAVAILABLE'; end if;
  perform public.training_private_lock_group(g);
  select * into v from public.training_private_plans where id=p for update;
  select * into en from public.training_private_plan_entries where id=e and plan_id=p and removed_at is null for update;
  if not found or (p_action='respond' and en.handler_id<>u) or (p_action='layer_respond' and en.layer_id is distinct from u) then
   raise exception using errcode='42501', message='GROUP_UNAVAILABLE'; end if;
  if v.status not in ('published','started') then raise exception using errcode='P0001', message='GROUP_CONFLICT'; end if;
  if p_action='layer_respond' then
   update public.training_private_plan_entries set layer_response=resp, updated_at=clock_timestamp() where id=e;
  else
   d := case when resp='yes' and p_request ? 'dogId' and p_request->'dogId'<>'null'::jsonb then public.training_private_uuid(p_request, 'dogId') else null end;
   if resp='no' and p_request ? 'dogId' and p_request->'dogId'<>'null'::jsonb then raise exception using errcode='22023', message='GROUP_INVALID_REQUEST'; end if;
   if d is not null and not exists(select 1 from public.dogs x where x.id=d and x.owner_id=u) then
    raise exception using errcode='42501', message='GROUP_UNAVAILABLE'; end if;   -- nie ein fremder Hund
   update public.training_private_plan_entries set handler_response=resp,
     dog_id=d, dog_epoch=case when d is null then null else public.training_private_dog_epoch(d) end,
     updated_at=clock_timestamp() where id=e;
  end if;
  body := jsonb_build_object('plan', public.training_private_plan_json(p, true));

 when 'link_track' then
  -- Am Tag: Zeile mit der echten Gruppenfährte verbinden (Leger:in der Fährte oder wer plant).
  perform public.training_private_plan_keys(p_request, array['planId','entryId','trackId'], array[]::text[]);
  p := public.training_private_uuid(p_request, 'planId'); e := public.training_private_uuid(p_request, 'entryId');
  t := public.training_private_uuid(p_request, 'trackId');
  select group_id into g from public.training_private_plans where id=p;
  if g is null or not public.training_private_member(g, u) then raise exception using errcode='42501', message='GROUP_UNAVAILABLE'; end if;
  perform public.training_private_lock_group(g);
  select * into v from public.training_private_plans where id=p for update;
  select * into en from public.training_private_plan_entries where id=e and plan_id=p and removed_at is null for update;
  if not found or v.status<>'started' or v.session_id is null then raise exception using errcode='P0001', message='GROUP_CONFLICT'; end if;
  if not exists(select 1 from public.training_private_tracks x where x.id=t and x.session_id=v.session_id and x.handler_id=en.handler_id
     and (x.layer_id=u or public.training_private_manager(g, u))) then
   raise exception using errcode='42501', message='GROUP_UNAVAILABLE'; end if;
  if en.track_id is null then update public.training_private_plan_entries set track_id=t, updated_at=clock_timestamp() where id=e;
  elsif en.track_id<>t then raise exception using errcode='P0001', message='GROUP_CONFLICT'; end if;
  body := jsonb_build_object('plan', public.training_private_plan_json(p, true));

 else raise exception using errcode='22023', message='GROUP_INVALID_REQUEST';
 end case;
 return jsonb_build_object('version', 1, 'serverNowMs', public.training_private_ms(clock_timestamp())) || body;
end $function$;

reset check_function_bodies;

-- 5) Rechte: Hilfsfunktionen nur intern, die Schnittstelle nur für angemeldete Personen.
revoke all on function public.training_private_plan_entry_dog_gone() from public, anon, authenticated;
revoke all on function public.training_private_plan_entry_json(public.training_private_plan_entries, uuid) from public, anon, authenticated;
grant execute on function public.training_private_plan_entry_json(public.training_private_plan_entries, uuid) to service_role;
revoke all on function public.training_private_plan_json(uuid, boolean) from public, anon, authenticated;
grant execute on function public.training_private_plan_json(uuid, boolean) to service_role;
revoke all on function public.training_private_plan_fields(jsonb) from public, anon, authenticated;
grant execute on function public.training_private_plan_fields(jsonb) to service_role;
revoke all on function public.training_private_plan_keys(jsonb, text[], text[]) from public, anon, authenticated;
grant execute on function public.training_private_plan_keys(jsonb, text[], text[]) to service_role;
revoke all on function public.training_group_plan_v1(text, jsonb) from public, anon, authenticated;
grant execute on function public.training_group_plan_v1(text, jsonb) to authenticated;
