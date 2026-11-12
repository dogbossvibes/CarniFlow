-- Gruppentraining-Server: Baseline aus Production (Stand 2026-11-12)
--
-- Zweck: Der Gruppenserver (training_group_*_v1, training_private_*, training_live_*,
-- group_distraction_*/gd_*, anyvo_group_monitor_*) wurde direkt in Production angelegt
-- und war bisher nicht im Repo. Diese Datei bildet den Production-Stand nach, damit
-- Stufe 1 (Beitrittscodes, Rollen, ACTIVE-Prüfung) als nachvollziehbare Änderung
-- darauf aufbauen kann.
--
-- Quelle: read-only Exporte aus dem Production-SQL-Editor vom 2026-11-12
-- (pg_get_functiondef, Spalten/Constraints/Indizes, RLS, Rechte, Trigger, Cron).
-- Funktionsdefinitionen sind wörtlich übernommen; lokal per md5(pg_get_functiondef)
-- gegen die Production-Werte geprüft.
--
-- NICHT enthalten (bewusst):
--   * QA-Hilfen training_live_qa_20261021, group_distraction_qa_v1 und die Tabellen
--     training_live_qa_window_20261021, group_distraction_qa_window (enthalten
--     Testkonten-IDs; gehören nicht ins öffentliche Repo).
--   * Track-Transfer-Server (track_transfer_*), eigenes Thema.
--
-- Externe Abhängigkeiten, die NICHT in dieser Datei angelegt werden:
--   * public.subscription_verified_initiator_v1()  (Abo-Prüfung; über
--     tracking_private_active_initiator() genutzt)
--   * Schema anyvo_monitor_http (http-Extension) und vault  (nur Monitor-Ping)
--   * Erweiterung pg_cron (Cron-Jobs werden nur angelegt, wenn vorhanden)
--
-- Production: Alles existiert dort bereits. Die Datei ist idempotent geschrieben
-- (if not exists / create or replace / gleiche Rechte), muss in Production aber
-- NICHT ausgeführt werden. Einzige Abweichung bei einer Ausführung: Für Objekte,
-- deren Rechte nicht exportiert wurden (gd_*, group_distraction_*, anyvo_group_monitor_*),
-- setzt sie die sichere Vorgabe (kein Zugriff für anon/authenticated).

set check_function_bodies = off;

-- 1) Tabellen (Spalten, Constraints, RLS ohne Policies)
create table if not exists public.training_private_groups (
  id uuid not null,
  owner_id uuid not null,
  title text not null,
  create_request jsonb not null,
  created_at timestamp with time zone not null default clock_timestamp(),
  ended_at timestamp with time zone,
  constraint training_private_groups_pkey PRIMARY KEY (id),
  constraint training_private_groups_title_check CHECK (((length(title) >= 1) AND (length(title) <= 80))),
  constraint training_private_groups_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
alter table public.training_private_groups enable row level security;

create table if not exists public.training_private_members (
  group_id uuid not null,
  user_id uuid not null,
  epoch uuid not null,
  display_name text not null,
  joined_at timestamp with time zone not null default clock_timestamp(),
  left_at timestamp with time zone,
  constraint training_private_members_pkey PRIMARY KEY (group_id, user_id),
  constraint training_private_members_display_name_check CHECK (((length(display_name) >= 1) AND (length(display_name) <= 60))),
  constraint training_private_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.training_private_groups(id) ON DELETE CASCADE,
  constraint training_private_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
alter table public.training_private_members enable row level security;

create table if not exists public.training_private_invitations (
  id uuid not null,
  group_id uuid not null,
  inviter_id uuid not null,
  recipient_id uuid not null,
  request jsonb not null,
  expires_at timestamp with time zone not null,
  accepted_at timestamp with time zone,
  accepted_epoch uuid,
  accepted_name text,
  revoked_at timestamp with time zone,
  constraint training_private_invitations_pkey PRIMARY KEY (id),
  constraint training_private_invitations_check CHECK ((inviter_id <> recipient_id)),
  constraint training_private_invitations_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.training_private_groups(id) ON DELETE CASCADE,
  constraint training_private_invitations_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint training_private_invitations_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
alter table public.training_private_invitations enable row level security;

create table if not exists public.training_private_sessions (
  id uuid not null,
  group_id uuid not null,
  owner_id uuid not null,
  title text not null,
  request jsonb not null,
  expires_at timestamp with time zone not null,
  ended_at timestamp with time zone,
  created_at timestamp with time zone not null default clock_timestamp(),
  constraint training_private_sessions_pkey PRIMARY KEY (id),
  constraint training_private_sessions_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.training_private_groups(id) ON DELETE CASCADE,
  constraint training_private_sessions_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
alter table public.training_private_sessions enable row level security;

create table if not exists public.training_private_participants (
  session_id uuid not null,
  user_id uuid not null,
  dog_id uuid,
  dog_epoch uuid,
  member_epoch uuid,
  epoch uuid not null,
  left_at timestamp with time zone,
  constraint training_private_participants_pkey PRIMARY KEY (session_id, user_id, epoch),
  constraint training_private_participants_epoch_key UNIQUE (epoch),
  constraint training_private_participants_check CHECK (((left_at IS NOT NULL) OR ((dog_id IS NOT NULL) AND (dog_epoch IS NOT NULL) AND (member_epoch IS NOT NULL)))),
  constraint training_private_participants_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.training_private_sessions(id) ON DELETE CASCADE,
  constraint training_private_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
alter table public.training_private_participants enable row level security;

create table if not exists public.training_private_dog_epochs (
  dog_id uuid not null,
  epoch uuid not null,
  changed_at timestamp with time zone not null default clock_timestamp(),
  constraint training_private_dog_epochs_pkey PRIMARY KEY (dog_id)
);
alter table public.training_private_dog_epochs enable row level security;

create table if not exists public.training_live_grants (
  id uuid not null,
  session_id uuid not null,
  owner_id uuid not null,
  dog_id uuid,
  sender_epoch uuid,
  recipients jsonb not null default '{}'::jsonb,
  request jsonb,
  started_at timestamp with time zone,
  expires_at timestamp with time zone,
  revoked_at timestamp with time zone,
  last_sequence integer not null default 0,
  last_payload_hash bytea,
  last_observed_at timestamp with time zone,
  last_received_at timestamp with time zone,
  constraint training_live_grants_pkey PRIMARY KEY (id),
  constraint training_live_grants_check CHECK ((((started_at IS NULL) AND (revoked_at IS NOT NULL)) OR ((started_at IS NOT NULL) AND (expires_at > started_at) AND (dog_id IS NOT NULL) AND (sender_epoch IS NOT NULL)))),
  constraint training_live_grants_recipients_check CHECK ((jsonb_typeof(recipients) = 'object'::text)),
  constraint training_live_grants_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint training_live_grants_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.training_private_sessions(id) ON DELETE CASCADE
);
alter table public.training_live_grants enable row level security;

create table if not exists public.training_live_last_positions (
  share_id uuid not null,
  sequence integer not null,
  latitude numeric not null,
  longitude numeric not null,
  accuracy_m numeric not null,
  observed_at timestamp with time zone not null,
  received_at timestamp with time zone not null,
  purge_after timestamp with time zone not null,
  request jsonb not null,
  constraint training_live_last_positions_pkey PRIMARY KEY (share_id),
  constraint training_live_last_positions_accuracy_m_check CHECK (((accuracy_m >= (0)::numeric) AND (accuracy_m <= (10000)::numeric))),
  constraint training_live_last_positions_latitude_check CHECK (((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))),
  constraint training_live_last_positions_longitude_check CHECK (((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))),
  constraint training_live_last_positions_sequence_check CHECK ((sequence > 0)),
  constraint training_live_last_positions_share_id_fkey FOREIGN KEY (share_id) REFERENCES public.training_live_grants(id) ON DELETE CASCADE
);
alter table public.training_live_last_positions enable row level security;

create table if not exists public.training_live_maintenance_state (
  singleton boolean not null default true,
  last_success_at timestamp with time zone not null,
  last_deleted integer not null,
  total_deleted bigint not null,
  duration_ms bigint not null,
  due_remaining_lower_bound integer not null,
  oldest_due_at timestamp with time zone,
  constraint training_live_maintenance_state_pkey PRIMARY KEY (singleton),
  constraint training_live_maintenance_state_singleton_check CHECK (singleton)
);
alter table public.training_live_maintenance_state enable row level security;

create table if not exists public.group_distraction_tasks (
  id uuid not null,
  group_id uuid not null,
  creator_id uuid not null,
  recipient_id uuid not null,
  creator_epoch uuid not null,
  recipient_epoch uuid not null,
  source_id uuid not null,
  source_revision text not null,
  reference_digest text not null,
  request jsonb not null,
  reference jsonb,
  created_at timestamp with time zone not null default clock_timestamp(),
  expires_at timestamp with time zone not null,
  purge_at timestamp with time zone not null,
  accepted_at timestamp with time zone,
  revoked_at timestamp with time zone,
  constraint group_distraction_tasks_pkey PRIMARY KEY (id),
  constraint group_distraction_tasks_check CHECK ((creator_id <> recipient_id)),
  constraint group_distraction_tasks_check1 CHECK ((expires_at > created_at)),
  constraint group_distraction_tasks_check2 CHECK ((purge_at > expires_at)),
  constraint group_distraction_tasks_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint group_distraction_tasks_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.training_private_groups(id),
  constraint group_distraction_tasks_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
alter table public.group_distraction_tasks enable row level security;

create table if not exists public.group_distraction_submissions (
  id uuid not null,
  task_id uuid not null,
  author_id uuid not null,
  digest text not null,
  payload jsonb,
  created_at timestamp with time zone not null default clock_timestamp(),
  decision text,
  reviewed_at timestamp with time zone,
  constraint group_distraction_submissions_pkey PRIMARY KEY (id),
  constraint group_distraction_submissions_decision_check CHECK ((decision = ANY (ARRAY['accepted'::text, 'changes_requested'::text]))),
  constraint group_distraction_submissions_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint group_distraction_submissions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.group_distraction_tasks(id) ON DELETE CASCADE
);
alter table public.group_distraction_submissions enable row level security;

create table if not exists public.group_distraction_source_epochs (
  source_id uuid not null,
  epoch uuid not null default gen_random_uuid(),
  constraint group_distraction_source_epochs_pkey PRIMARY KEY (source_id)
);
alter table public.group_distraction_source_epochs enable row level security;

create table if not exists public.group_distraction_health (
  singleton boolean not null default true,
  last_success_at timestamp with time zone not null,
  due_remaining integer not null,
  constraint group_distraction_health_pkey PRIMARY KEY (singleton),
  constraint group_distraction_health_singleton_check CHECK (singleton)
);
alter table public.group_distraction_health enable row level security;

create table if not exists public.anyvo_group_monitor_targets (
  kind text not null,
  job_id bigint not null,
  secret_id uuid not null,
  last_run_id bigint,
  last_http_status integer,
  last_signal_at timestamp with time zone,
  last_signal text,
  enabled boolean not null default true,
  constraint anyvo_group_monitor_targets_pkey PRIMARY KEY (kind),
  constraint anyvo_group_monitor_targets_secret_id_key UNIQUE (secret_id),
  constraint anyvo_group_monitor_targets_kind_check CHECK ((kind = 'group_distraction'::text)),
  constraint anyvo_group_monitor_targets_last_signal_check CHECK ((last_signal = ANY (ARRAY['success'::text, 'fail'::text])))
);
alter table public.anyvo_group_monitor_targets enable row level security;

-- 2) Zusätzliche Indizes
create index if not exists training_private_invitee ON public.training_private_invitations USING btree (recipient_id);
create index if not exists training_private_session_group ON public.training_private_sessions USING btree (group_id);
create unique index if not exists training_private_one_active_participant ON public.training_private_participants USING btree (session_id, user_id) WHERE (left_at IS NULL);
create index if not exists training_live_session ON public.training_live_grants USING btree (session_id);
create index if not exists training_live_position_purge ON public.training_live_last_positions USING btree (purge_after);
create index if not exists group_distraction_purge ON public.group_distraction_tasks USING btree (purge_at) WHERE (reference IS NOT NULL);
create index if not exists group_distraction_scope ON public.group_distraction_tasks USING btree (group_id, creator_id, recipient_id);
create index if not exists group_distraction_submission_task ON public.group_distraction_submissions USING btree (task_id);

-- 3) Funktionen (unverändert aus pg_get_functiondef, Production 2026-11-12)

CREATE OR REPLACE FUNCTION public.anyvo_group_monitor_register(p_kind text, p_ping_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j bigint;s uuid;n text;
begin
 if p_kind is null or p_kind not in('group_distraction') or p_ping_url is null or p_ping_url !~ '^https://hc-ping[.]com/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'MONITOR_INVALID_REGISTRATION';end if;
 perform pg_advisory_xact_lock(hashtextextended('anyvo-group-monitor-register-v1',0));
 if exists(select 1 from public.anyvo_group_monitor_targets where kind=p_kind) then raise exception 'MONITOR_ALREADY_REGISTERED';end if;
 n:='anyvo-group-distraction-maintenance-v1';
 select jobid into j from cron.job where jobname=n and active and database=current_database() and username='postgres' and schedule='* * * * *';
 if j is null then raise exception 'MONITOR_JOB_MISSING';end if;
 if exists(select 1 from vault.decrypted_secrets where name='anyvo-monitor-'||p_kind||'-ping-v1') then raise exception 'MONITOR_SECRET_COLLISION';end if;
 select vault.create_secret(p_ping_url,'anyvo-monitor-'||p_kind||'-ping-v1','Restricted monitoring heartbeat, no customer payload') into s;
 insert into public.anyvo_group_monitor_targets(kind,job_id,secret_id) values(p_kind,j,s);
end$function$;

CREATE OR REPLACE FUNCTION public.anyvo_group_monitor_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '1s'
AS $function$
declare t public.anyvo_group_monitor_targets;j record;r record;h jsonb;url text;healthy boolean;signal text;response record;result jsonb:='[]'::jsonb;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('anyvo-group-monitor-tick-v1',0)) then return jsonb_build_object('skipped',true);end if;
 for t in select * from public.anyvo_group_monitor_targets where enabled order by kind for update loop
  h:=null;healthy:=false;
  select jobid,jobname,active,schedule,database,username,command into j from cron.job where jobid=t.job_id;
  select runid,status,end_time into r from cron.job_run_details where jobid=t.job_id and end_time is not null order by runid desc limit 1;
  begin
   select jsonb_build_object('healthy',coalesce((select last_success_at>clock_timestamp()-interval '3 minutes' and due_remaining=0 from public.group_distraction_health where singleton),false),'dueRemainingLowerBound',case when exists(select 1 from public.group_distraction_tasks where reference is not null and purge_at<=clock_timestamp()) then 1 else 0 end) into h;
   healthy:=coalesce((h->>'healthy')::boolean,false)
    and coalesce((h->>'dueRemainingLowerBound')::bigint=0,false)
    and j.jobid is not null and j.active and j.schedule='* * * * *' and j.database=current_database() and j.username='postgres'
    and j.jobname='anyvo-group-distraction-maintenance-v1'
    and j.command='set statement_timeout=''10s''; select public.group_distraction_maintenance();'
    and r.runid is not null and r.status='succeeded' and r.end_time>clock_timestamp()-interval '3 minutes';
  exception when others then healthy:=false;
  end;
  -- A cached healthy state must never keep a stopped job's heartbeat alive.
  if healthy and r.runid is not distinct from t.last_run_id then
   result:=result||jsonb_build_array(jsonb_build_object('target',t.kind,'signal','no_new_completed_run'));continue;
  end if;
  signal:=case when healthy then 'success' else 'fail' end;
  -- No repeated failure mail enqueue storm. Missing pings remain externally supervised.
  if signal='fail' and t.last_signal='fail' and t.last_signal_at>clock_timestamp()-interval '5 minutes' then
   result:=result||jsonb_build_array(jsonb_build_object('target',t.kind,'signal','failure_already_reported'));continue;
  end if;
  select decrypted_secret into url from vault.decrypted_secrets where id=t.secret_id;
  if url is null or url !~ '^https://hc-ping[.]com/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'MONITOR_SECRET_INVALID';end if;
  -- Synchronous, bounded delivery avoids a PUBLIC-readable request queue.
  begin
   perform anyvo_monitor_http.http_reset_curlopt();
   if not (anyvo_monitor_http.http_set_curlopt('CURLOPT_TIMEOUT_MS','5000')
    and anyvo_monitor_http.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','2000')
    and anyvo_monitor_http.http_set_curlopt('CURLOPT_SSL_VERIFYPEER','1')
    and anyvo_monitor_http.http_set_curlopt('CURLOPT_SSL_VERIFYHOST','2')) then
    raise exception 'MONITOR_TRANSPORT_CONFIGURATION_FAILED';
   end if;
   select status,content into response from anyvo_monitor_http.http_post(
    (url||case when healthy then '' else '/fail' end)::varchar,
    jsonb_build_object('service','ANYVO','target',t.kind,'status',signal)::text::varchar,
    'application/json'::varchar);
  exception when others then
   -- Curl errors may contain the secret URL. Never persist/rethrow raw errors.
   result:=result||jsonb_build_array(jsonb_build_object('target',t.kind,'signal','delivery_failed'));continue;
  end;
  if response.status<>200 or response.content is distinct from 'OK' then
   result:=result||jsonb_build_array(jsonb_build_object('target',t.kind,'signal','delivery_rejected'));continue;
  end if;
  update public.anyvo_group_monitor_targets set last_run_id=case when healthy then r.runid else last_run_id end,last_http_status=response.status,last_signal_at=clock_timestamp(),last_signal=signal where kind=t.kind;
  result:=result||jsonb_build_array(jsonb_build_object('target',t.kind,'signal',signal,'httpStatus',response.status));
 end loop;
 return jsonb_build_object('signals',result);
end$function$;

CREATE OR REPLACE FUNCTION public.gd_access(t group_distraction_tasks, u uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select u in(t.creator_id,t.recipient_id) and t.revoked_at is null and t.expires_at>clock_timestamp() and t.reference is not null and public.gd_origin_matches(t)
 and exists(select 1 from public.training_private_groups g where g.id=t.group_id and g.ended_at is null)
 and exists(select 1 from public.training_private_members m where m.group_id=t.group_id and m.user_id=t.creator_id and m.epoch=t.creator_epoch and m.left_at is null)
 and exists(select 1 from public.training_private_members m where m.group_id=t.group_id and m.user_id=t.recipient_id and m.epoch=t.recipient_epoch and m.left_at is null)
$function$;

CREATE OR REPLACE FUNCTION public.gd_active()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare ok boolean:=false;begin
 if to_regprocedure('public.tracking_private_active_initiator()') is not null then
 execute 'select public.tracking_private_active_initiator()' into ok;end if;
 if ok is distinct from true then raise exception using errcode='42501',message='TRACKING_ACTIVE_REQUIRED';end if;
end$function$;

CREATE OR REPLACE FUNCTION public.gd_contribution(v jsonb, task uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare p jsonb;w jsonb;start_t numeric;end_t numeric;prev_t numeric;tm numeric;prev jsonb;connected boolean:=false;begin
 perform public.gd_keys(v,array['version','id','parentSessionId','name','startedAtMs','finishedAtMs','points','weather']);
 if v->'version' is distinct from '1'::jsonb or public.gd_uuid(v->'parentSessionId')<>task or public.gd_uuid(v->'id')=task
 or jsonb_typeof(v->'name') is distinct from 'string' or length(btrim(v->>'name'))=0 or (select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0) from regexp_split_to_table(v->>'name','') ch where ch<>'')>60 or (v->>'name')~'[[:cntrl:]]' then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;
 start_t:=public.gd_num(v->'startedAtMs',1,8640000000000000,true);end_t:=public.gd_num(v->'finishedAtMs',start_t,8640000000000000,true);prev_t:=start_t-1;
 if jsonb_typeof(v->'points') is distinct from 'array' then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;
 if jsonb_array_length(v->'points') not between 2 and 20000 then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;
 for p in select value from jsonb_array_elements(v->'points') loop
  perform public.gd_keys(p,array['lat','lng','t','accuracy','breakBefore']);perform public.gd_num(p->'lat',-90,90);perform public.gd_num(p->'lng',-180,180);
  tm:=public.gd_num(p->'t',start_t,end_t,true);perform public.gd_num(p->'accuracy',0,100000,false,true);
  if tm<=prev_t or jsonb_typeof(p->'breakBefore') is distinct from 'boolean' then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;
  if prev is not null and p->'breakBefore'='false'::jsonb and (p->'lat'<>prev->'lat' or p->'lng'<>prev->'lng') then connected:=true;end if;
  prev:=p;prev_t:=tm;
 end loop;
 if not connected then raise exception using errcode='22023',message='GROUP_EMPTY_CONTRIBUTION';end if;
 w:=v->'weather';if w<>'null'::jsonb then
 perform public.gd_keys(w,array['recordedAtMs','temperature','windSpeed','humidity','weatherCode']);perform public.gd_num(w->'recordedAtMs',start_t,8640000000000000,true);
 perform public.gd_num(w->'temperature',-100,100,false,true);perform public.gd_num(w->'windSpeed',0,500,false,true);perform public.gd_num(w->'humidity',0,100,false,true);perform public.gd_num(w->'weatherCode',0,99,true,true);end if;
end$function$;

CREATE OR REPLACE FUNCTION public.gd_hash(v jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$select encode(sha256(convert_to(v::text,'UTF8')),'hex')$function$;

CREATE OR REPLACE FUNCTION public.gd_keys(v jsonb, k text[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$begin
 if jsonb_typeof(v) is distinct from 'object' or not(v ?& k) or (select count(*) from jsonb_object_keys(v))<>cardinality(k) then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;
end$function$;

CREATE OR REPLACE FUNCTION public.gd_meta(t group_distraction_tasks)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select jsonb_build_object(
 'taskId',t.id,'groupId',t.group_id,'creatorUserId',t.creator_id,'recipientUserId',t.recipient_id,
 'sourceTrainingId',t.source_id,'sourceRevision',t.source_revision,'referenceDigest',t.reference_digest,
 'createdAtMs',public.training_private_ms(t.created_at),'expiresAtMs',public.training_private_ms(t.expires_at),
 'acceptedAtMs',case when t.accepted_at is null then null else public.training_private_ms(t.accepted_at) end)$function$;

CREATE OR REPLACE FUNCTION public.gd_num(v jsonb, lo numeric, hi numeric, whole boolean DEFAULT false, nullable boolean DEFAULT false)
 RETURNS numeric
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$declare n numeric;begin
 if nullable and v='null'::jsonb then return null;end if;
 if jsonb_typeof(v) is distinct from 'number' then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;
 n:=v::text::numeric;if n<lo or n>hi or (whole and trunc(n)<>n) then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;return n;
end$function$;

CREATE OR REPLACE FUNCTION public.gd_origin_matches(t group_distraction_tasks)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare v jsonb;begin
 if to_regprocedure('public.group_distraction_source_v1(uuid,uuid)') is null then return false;end if;
 execute 'select public.group_distraction_source_v1($1,$2)' into v using t.source_id,t.creator_id;
 return coalesce(v->>'sourceRevision'=t.source_revision and public.gd_hash(v->'reference')=t.reference_digest,false);
 exception when sqlstate '42501' or sqlstate 'P0001' or sqlstate '22023' then return false;
end$function$;

CREATE OR REPLACE FUNCTION public.gd_source(id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare v jsonb;begin
 if to_regprocedure('public.group_distraction_source_v1(uuid,uuid)') is null then raise exception using errcode='P0001',message='GROUP_SOURCE_INCOMPLETE';end if;
 execute 'select public.group_distraction_source_v1($1,$2)' into v using id,auth.uid();
 perform public.gd_keys(v,array['sourceRevision','reference']);
 if jsonb_typeof(v->'sourceRevision') is distinct from 'string' or length(v->>'sourceRevision') not between 1 and 128 or jsonb_typeof(v->'reference') is distinct from 'object' then raise exception using errcode='P0001',message='GROUP_SOURCE_INCOMPLETE';end if;
 return v||jsonb_build_object('referenceDigest',public.gd_hash(v->'reference'),'sourceTrainingId',id);
end$function$;

CREATE OR REPLACE FUNCTION public.gd_source_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare sid uuid;begin
 if tg_op='TRUNCATE' then update public.group_distraction_source_epochs set epoch=gen_random_uuid();return null;end if;
 if tg_table_name='training_sessions' then
  sid:=old.id;
  if tg_op='UPDATE' and new.owner_id is not distinct from old.owner_id and new.dog_id is not distinct from old.dog_id and new.type is not distinct from old.type and new.status is not distinct from old.status and new.id=old.id and not(new.ended_at is null and old.ended_at is not null) then return null;end if;
 else sid:=old.session_id;end if;
 insert into public.group_distraction_source_epochs values(sid,gen_random_uuid()) on conflict(source_id) do update set epoch=excluded.epoch;
 return null;
end$function$;

CREATE OR REPLACE FUNCTION public.gd_uuid(v jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$begin
 if jsonb_typeof(v) is distinct from 'string' or (v#>>'{}')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;return (v#>>'{}')::uuid;
end$function$;

CREATE OR REPLACE FUNCTION public.group_distraction_maintenance()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '1s'
AS $function$declare n integer;begin
 -- Logical expiry independent of this job; payload only, tombstones retained.
 with due as(select id from public.group_distraction_tasks where reference is not null and purge_at<=clock_timestamp() order by purge_at limit 100 for update skip locked),gone as(update public.group_distraction_tasks t set reference=null from due where t.id=due.id returning t.id)
 update public.group_distraction_submissions s set payload=null where s.task_id in(select id from gone);get diagnostics n=row_count;
 insert into public.group_distraction_health values(true,clock_timestamp(),(select count(*) from (select 1 from public.group_distraction_tasks where reference is not null and purge_at<=clock_timestamp() limit 1001) q)) on conflict(singleton) do update set last_success_at=excluded.last_success_at,due_remaining=excluded.due_remaining;
 return jsonb_build_object('purgedSubmissions',n);
end$function$;

CREATE OR REPLACE FUNCTION public.group_distraction_source_v1(source uuid, actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'UTC'
AS $function$
declare s jsonb;pts jsonb;marks jsonb;outpts jsonb:='[]';outmarks jsonb:='[]';p jsonb;m jsonb;entry jsonb;entries jsonb;boundaries jsonb;boundary jsonb;ts timestamptz;prev_ts timestamptz;prev jsonb;br boolean;connected boolean:=false;key text;direction text;sharpness text;special_count integer;legacy boolean;ord integer:=0;matches integer;ref jsonb;revision text;src_epoch uuid;dog_epoch uuid;
begin
 if actor is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
 perform d.id from public.dogs d join public.training_sessions t on t.dog_id=d.id where t.id=source and t.owner_id=actor and d.owner_id=actor for share of d;
 perform id from public.training_sessions where id=source and owner_id=actor for share;
 -- One statement snapshot for header, points and markers. Bound BEFORE aggregation.
 select to_jsonb(x),
 (select jsonb_agg(to_jsonb(q) order by q.timestamp,q.id) from (select * from public.track_points where session_id=x.id and point_type='lay' order by timestamp,id limit 20001) q),
 (select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at,q.id),'[]'::jsonb) from (select * from public.track_markers where session_id=x.id and marker_type is distinct from 'sprachmarker' order by created_at,id limit 257) q)
 into s,pts,marks from public.training_sessions x join public.dogs d on d.id=x.dog_id and d.owner_id=actor
 where x.id=source and x.owner_id=actor and x.type='track' and x.status='completed' and x.ended_at is not null;
 if s is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
 if pts is null or jsonb_array_length(pts) not between 2 and 20000 or jsonb_array_length(marks)>256 then raise exception using errcode='P0001',message='GROUP_SOURCE_INCOMPLETE';end if;
 boundaries:=s->'track_data'->'layContinuity';
 if boundaries is null or boundaries='null'::jsonb then boundaries:='[]';
 else
  perform public.gd_keys(boundaries,array['version','breakBeforeTimestamps']);
  if boundaries->'version' is distinct from '1'::jsonb or jsonb_typeof(boundaries->'breakBeforeTimestamps') is distinct from 'array' then raise exception using errcode='P0001',message='GROUP_SOURCE_INCOMPLETE';end if;
  boundaries:=boundaries->'breakBeforeTimestamps';
 end if;
 for boundary in select value from jsonb_array_elements(boundaries) loop
  if jsonb_typeof(boundary) is distinct from 'string' then raise exception using errcode='P0001',message='GROUP_SOURCE_INCOMPLETE';end if;
  if not exists(select 1 from jsonb_array_elements(pts) z where (z->>'timestamp')::timestamptz=(boundary#>>'{}')::timestamptz) then raise exception using errcode='P0001',message='GROUP_SOURCE_INCOMPLETE';end if;
 end loop;
 for p in select value from jsonb_array_elements(pts) loop
  perform public.gd_num(p->'latitude',-90,90);perform public.gd_num(p->'longitude',-180,180);
  ts:=(p->>'timestamp')::timestamptz;
  if ts is null or not isfinite(ts) or (prev_ts is not null and ts<=prev_ts) then raise exception using errcode='P0001',message='GROUP_SOURCE_INCOMPLETE';end if;
  br:=exists(select 1 from jsonb_array_elements(boundaries) b where (b#>>'{}')::timestamptz=ts);
  -- Explicit continuity only: point thinning is not evidence of a recording gap.
  if prev is not null and not br and (p->'latitude'<>prev->'latitude' or p->'longitude'<>prev->'longitude') then connected:=true;end if;
  outpts:=outpts||jsonb_build_array(jsonb_build_object('lat',p->'latitude','lng',p->'longitude','breakBefore',br));prev:=p;prev_ts:=ts;
 end loop;
 if not connected then raise exception using errcode='P0001',message='GROUP_SOURCE_INCOMPLETE';end if;
 entries:=coalesce(s->'track_data'->'manualAngleGeometry','[]'::jsonb);
 if jsonb_typeof(entries) is distinct from 'array' then raise exception using errcode='P0001',message='GROUP_SOURCE_INCOMPLETE';end if;
 select count(*) into special_count from jsonb_array_elements(marks) z where z->>'angle_kind' in('bw','ow','gw','abriss');
 if jsonb_array_length(entries)<>special_count then raise exception using errcode='P0001',message='GROUP_SOURCE_INCOMPLETE';end if;
 -- Auto/manual de-duplication involves JS geometry. Mixed shapes require the reviewed portable projector.
 if special_count>0 and exists(select 1 from jsonb_array_elements(marks) z where z->>'angle_kind' in('links','rechts','spitz_links','spitz_rechts')) then raise exception using errcode='P0001',message='GROUP_SOURCE_INCOMPLETE';end if;
 legacy:=jsonb_array_length(entries)=special_count and not exists(select 1 from jsonb_array_elements(entries) e where e ? 'markerKey') and not exists(select 1 from jsonb_array_elements(marks) z where z->>'angle_kind'='abriss');
 for m in select value from jsonb_array_elements(marks) loop
  perform public.gd_num(m->'latitude',-90,90);perform public.gd_num(m->'longitude',-180,180);perform public.gd_num(m->'distance_from_start',0,1000000,false,true);
  if m->>'marker_type' is null or m->>'marker_type' not in('gegenstand','winkel','verleitung') or (m->>'angle_kind' is not null and m->>'angle_kind' not in('links','rechts','spitz_links','spitz_rechts','spitz','absatz','abriss','gw','ow','bw')) or (m->>'material' is not null and m->>'material' not in('stoff','filz','holz','duebel','leder','plastik','metall','teppich','diverses')) then raise exception using errcode='P0001',message='GROUP_SOURCE_INCOMPLETE';end if;
  direction:=null;sharpness:=null;
  if m->>'angle_kind' in('bw','ow','gw','abriss') then
   if legacy then entry:=entries->ord;
   else
    -- Exact-decimal subset only; never approximate JS Number.toFixed rounding.
    if m->'distance_from_start'='null'::jsonb or (m->>'latitude')::numeric<>trunc((m->>'latitude')::numeric,7) or (m->>'longitude')::numeric<>trunc((m->>'longitude')::numeric,7) or (m->>'distance_from_start')::numeric<>trunc((m->>'distance_from_start')::numeric,1) then raise exception using errcode='P0001',message='GROUP_SOURCE_INCOMPLETE';end if;
    key:=(m->>'angle_kind')||':'||to_char((m->>'latitude')::numeric,'FM990.0000000')||':'||to_char((m->>'longitude')::numeric,'FM990.0000000')||':'||to_char((m->>'distance_from_start')::numeric,'FM9999990.0');
    select count(*) into matches from jsonb_array_elements(entries) e where e->>'markerKey'=key;
    if matches<>1 or (select count(*) from jsonb_array_elements(marks) z where z->'angle_kind'=m->'angle_kind' and z->'latitude'=m->'latitude' and z->'longitude'=m->'longitude' and z->'distance_from_start'=m->'distance_from_start')<>1 then raise exception using errcode='P0001',message='GROUP_SOURCE_INCOMPLETE';end if;
    select e into entry from jsonb_array_elements(entries) e where e->>'markerKey'=key;
   end if;
   if entry->>'manualMarkerType' is distinct from m->>'angle_kind' or entry->>'geometryDirection' not in('links','rechts','unresolved') or entry->>'geometrySharpness' not in('normal','sharp','unresolved') or entry->>'geometryDirection' is null or entry->>'geometrySharpness' is null then raise exception using errcode='P0001',message='GROUP_SOURCE_INCOMPLETE';end if;
   direction:=entry->>'geometryDirection';sharpness:=entry->>'geometrySharpness';ord:=ord+1;
  end if;
  outmarks:=outmarks||jsonb_build_array(jsonb_build_object('id',m->>'id','type',m->>'marker_type','lat',m->'latitude','lng',m->'longitude','angleKind',m->'angle_kind','material',m->'material','distanceFromStart',m->'distance_from_start','geometryDirection',direction,'geometrySharpness',sharpness));
 end loop;
 perform public.gd_num(s->'distance_meters',0,1000000,false,true);
 if s->>'started_at' is not null and (not isfinite((s->>'started_at')::timestamptz) or extract(year from (s->>'started_at')::timestamptz) not between 1 and 9999) then raise exception using errcode='P0001',message='GROUP_SOURCE_INCOMPLETE';end if;
 insert into public.group_distraction_source_epochs(source_id) values(source) on conflict(source_id) do nothing;
 select epoch into src_epoch from public.group_distraction_source_epochs where source_id=source;
 dog_epoch:=public.training_private_dog_epoch((s->>'dog_id')::uuid);
 ref:=jsonb_build_object('version',1,'points',outpts,'markers',outmarks,'distanceM',s->'distance_meters','date',case when s->>'started_at' is null then null else to_char((s->>'started_at')::timestamptz,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end);
 revision:=public.gd_hash(jsonb_build_object('source',source,'owner',actor,'dogId',s->'dog_id','sourceEpoch',coalesce(src_epoch,'00000000-0000-0000-0000-000000000000'::uuid),'dogEpoch',dog_epoch,'reference',ref));
 return jsonb_build_object('sourceRevision',revision,'reference',ref);
end$function$;

CREATE OR REPLACE FUNCTION public.tracking_private_active_initiator()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select public.subscription_verified_initiator_v1()
$function$;

CREATE OR REPLACE FUNCTION public.training_group_distraction_v1(p_action text, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
 SET statement_timeout TO '15s'
AS $function$
declare u uuid:=auth.uid();g uuid;task_key uuid;rec uuid;ce uuid;re uuid;t public.group_distraction_tasks;s public.group_distraction_submissions;v jsonb;body jsonb;ttl integer;tm timestamptz;sid uuid;h text;begin
 if u is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
 if p_request is null or octet_length(p_request::text)>5000000 then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;
 case p_action
 when 'prepare' then perform public.gd_keys(p_request,array['sourceTrainingId']);
 when 'create' then perform public.gd_keys(p_request,array['taskId','groupId','sourceTrainingId','sourceRevision','referenceDigest','recipientUserId','ttlSeconds']);
 when 'list' then perform public.gd_keys(p_request,array['groupId']);
 when 'get','accept','revoke' then perform public.gd_keys(p_request,array['taskId']);
 when 'submit' then perform public.gd_keys(p_request,array['taskId','submissionId','referenceDigest','contribution']);
 when 'review' then perform public.gd_keys(p_request,array['taskId','submissionId','decision']);
 else raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end case;
 if p_action='prepare' then perform public.gd_active();body:=public.gd_source(public.gd_uuid(p_request->'sourceTrainingId'));
 else
  if p_action='create' then perform pg_advisory_xact_lock(hashtextextended(u::text,421));end if;
  if p_action in('create','list') then g:=public.gd_uuid(p_request->'groupId');
  else task_key:=public.gd_uuid(p_request->'taskId');select group_id into g from public.group_distraction_tasks where group_distraction_tasks.id=task_key;end if;
  perform public.training_private_lock_group(g);
  if not public.training_private_member(g,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  if p_action='list' then
   select jsonb_build_object('tasks',coalesce(jsonb_agg(public.gd_meta(x) order by x.created_at,x.id),'[]'::jsonb)) into body from public.group_distraction_tasks x where x.group_id=g and public.gd_access(x,u);
  else
   if p_action='create' then
    perform public.gd_active();task_key:=public.gd_uuid(p_request->'taskId');rec:=public.gd_uuid(p_request->'recipientUserId');
    if rec=u or not public.training_private_member(g,rec) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
    ttl:=public.gd_num(p_request->'ttlSeconds',60,604800,true);
   end if;
   select * into t from public.group_distraction_tasks x where x.id=task_key for update;
   if p_action='create' and not found then
    if (select count(*) from public.group_distraction_tasks where creator_id=u)>=500 or (select count(*) from public.group_distraction_tasks where group_id=g)>=1000 then raise exception using errcode='P0001',message='GROUP_LIMIT';end if;
    v:=public.gd_source(public.gd_uuid(p_request->'sourceTrainingId'));
    if p_request->'sourceRevision' is distinct from v->'sourceRevision' or p_request->'referenceDigest' is distinct from v->'referenceDigest' then raise exception using errcode='P0001',message='GROUP_REFERENCE_CHANGED';end if;
    select epoch into ce from public.training_private_members where group_id=g and user_id=u;
    select epoch into re from public.training_private_members where group_id=g and user_id=rec;tm:=clock_timestamp();
    insert into public.group_distraction_tasks(id,group_id,creator_id,recipient_id,creator_epoch,recipient_epoch,source_id,source_revision,reference_digest,request,reference,created_at,expires_at,purge_at)
    values(task_key,g,u,rec,ce,re,public.gd_uuid(p_request->'sourceTrainingId'),v->>'sourceRevision',v->>'referenceDigest',p_request,v->'reference',tm,tm+ttl*interval '1 second',tm+interval '30 days') returning * into t;
   end if;
   if t.id is null or t.group_id<>g or not public.gd_access(t,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
   if p_action='create' then
    if t.creator_id<>u then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
    if t.request<>p_request then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   elsif p_action='accept' then
    if t.recipient_id<>u then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
    update public.group_distraction_tasks set accepted_at=coalesce(accepted_at,clock_timestamp()) where group_distraction_tasks.id=task_key returning * into t;
   elsif p_action='submit' then
    if t.recipient_id<>u or t.accepted_at is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
    if p_request->'referenceDigest' is distinct from to_jsonb(t.reference_digest) then raise exception using errcode='P0001',message='GROUP_REFERENCE_CHANGED';end if;
    sid:=public.gd_uuid(p_request->'submissionId');perform public.gd_contribution(p_request->'contribution',task_key);h:=public.gd_hash(p_request->'contribution');
    select * into s from public.group_distraction_submissions where group_distraction_submissions.id=sid;
    if found then
     if s.task_id<>task_key or s.author_id<>u or s.digest<>h or s.payload is distinct from p_request->'contribution' then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
    else
     if (select count(*) from public.group_distraction_submissions where task_id=task_key)>=32 then raise exception using errcode='P0001',message='GROUP_LIMIT';end if;
     insert into public.group_distraction_submissions(id,task_id,author_id,digest,payload) values(sid,task_key,u,h,p_request->'contribution');
    end if;
   elsif p_action='review' then
    if t.creator_id<>u then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
    sid:=public.gd_uuid(p_request->'submissionId');
    if p_request->>'decision' not in('accepted','changes_requested') or jsonb_typeof(p_request->'decision') is distinct from 'string' then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;
    select * into s from public.group_distraction_submissions where group_distraction_submissions.id=sid and task_id=task_key;
    if not found then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
    if s.decision is not null and s.decision<>p_request->>'decision' then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
    update public.group_distraction_submissions set decision=p_request->>'decision',reviewed_at=coalesce(reviewed_at,clock_timestamp()) where group_distraction_submissions.id=sid;
   elsif p_action='revoke' then
    if t.creator_id<>u then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
    update public.group_distraction_tasks set revoked_at=clock_timestamp() where group_distraction_tasks.id=task_key;
    return jsonb_build_object('version',1,'serverNowMs',public.training_private_ms(clock_timestamp()),'taskId',task_key,'revoked',true);
   end if;
   body:=jsonb_build_object('task',public.gd_meta(t),'reference',case when u=t.creator_id or t.accepted_at is not null then t.reference else null end,
    'submissions',case when t.accepted_at is null then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('submissionId',x.id,'authorUserId',x.author_id,'contribution',x.payload,'decision',x.decision,'createdAtMs',public.training_private_ms(x.created_at),'reviewedAtMs',case when x.reviewed_at is null then null else public.training_private_ms(x.reviewed_at) end) order by x.created_at,x.id),'[]'::jsonb) from public.group_distraction_submissions x where x.task_id=task_key) end);
  end if;
 end if;
 return jsonb_build_object('version',1,'serverNowMs',public.training_private_ms(clock_timestamp()))||body;
exception when unique_violation then raise exception using errcode='P0001',message='GROUP_CONFLICT';
end$function$;

CREATE OR REPLACE FUNCTION public.training_group_live_v1(p_action text, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
declare u uuid:=auth.uid();g uuid;s uuid;sh uuid;d uuid;r uuid;ep uuid;ttl integer;seq integer;lat numeric;lng numeric;acc numeric;obs_ms numeric;obs timestamptz;at_time timestamptz;recips jsonb:='{}';normal jsonb;arr jsonb;item jsonb;body jsonb;l public.training_live_grants;
begin
 if p_action in('start','publish') and not public.tracking_private_active_initiator() then raise exception using errcode='42501',message='TRACKING_ACTIVE_REQUIRED';end if;
 case p_action
 when 'start' then perform public.training_private_request(p_request,array['sessionId','shareId','dogId','recipientUserIds','ttlSeconds']);
 when 'publish' then perform public.training_private_request(p_request,array['sessionId','shareId','sequence','latitude','longitude','accuracyM','observedAtServerMs']);
 when 'revoke' then perform public.training_private_request(p_request,array['sessionId','shareId']);
 when 'snapshot' then perform public.training_private_request(p_request,array['sessionId']);
 else raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';
 end case;
 s:=public.training_private_uuid(p_request,'sessionId');g:=public.training_private_lock_session(s);
 if p_action in('start','publish') and not exists(select 1 from public.training_live_maintenance_state where singleton and last_success_at>clock_timestamp()-interval '3 minutes' and due_remaining_lower_bound=0) then
  raise exception using errcode='P0001',message='GROUP_MAINTENANCE_UNAVAILABLE';
 end if;
 if p_action='snapshot' then
  if not public.training_private_participant(s,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  at_time:=clock_timestamp();
  select coalesce(jsonb_agg(jsonb_build_object('shareId',v.id,'userId',v.owner_id,'sessionId',v.session_id,'dogId',v.dog_id,'latitude',p.latitude,'longitude',p.longitude,'accuracyM',p.accuracy_m,'sequence',p.sequence,'observedAtMs',public.training_private_ms(p.observed_at),'receivedAtMs',public.training_private_ms(p.received_at),'expiresAtMs',public.training_private_ms(v.expires_at)) order by v.id),'[]') into arr from public.training_live_grants v join public.training_live_last_positions p on p.share_id=v.id where v.session_id=s and v.recipients ? u::text and public.training_private_live_active(v) and p.observed_at>=at_time-interval '10 seconds' and p.observed_at<=at_time+interval '2 seconds';
  return jsonb_build_object('version',1,'serverNowMs',public.training_private_ms(clock_timestamp()),'leaseMs',5000,'positions',arr);
 end if;
 sh:=public.training_private_uuid(p_request,'shareId');
 -- Global per-share lock binds absent-row tombstones across all sessions.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('training-live-share:'||sh::text,0));
 select * into l from public.training_live_grants where id=sh for update;
 if found and (l.owner_id<>u or l.session_id<>s) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
 if p_action='revoke' then
  -- Keep historical participant proof; regular logout does not revoke a still-valid JWT.
  if not exists(select 1 from public.training_private_participants where session_id=s and user_id=u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  if l.id is null then
   if (select count(*) from public.training_live_grants where session_id=s and owner_id=u)>=512 then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   insert into public.training_live_grants(id,session_id,owner_id,revoked_at) values(sh,s,u,clock_timestamp());
  else update public.training_live_grants set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=sh;end if;
  delete from public.training_live_last_positions where share_id=sh;
  body:=jsonb_build_object('shareId',sh,'revoked',true);
 elsif p_action='start' then
  if not public.training_private_participant(s,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  d:=public.training_private_uuid(p_request,'dogId');ttl:=public.training_private_number(p_request,'ttlSeconds',60,7200,true);
  select epoch into ep from public.training_private_participants where session_id=s and user_id=u and dog_id=d and left_at is null;
  if ep is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  perform 1 from public.dogs where id=d and owner_id=u for share;if not found then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  arr:=p_request->'recipientUserIds';
  if jsonb_typeof(arr) is distinct from 'array' then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;
  if jsonb_array_length(arr)<1 or jsonb_array_length(arr)>49 then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;
  for item in select value from jsonb_array_elements(arr) loop
   r:=public.training_private_uuid(jsonb_build_object('id',item),'id');
   if r=u or recips ? r::text then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;
   if not public.training_private_participant(s,r) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
   recips:=recips||jsonb_build_object(r::text,(select epoch::text from public.training_private_participants where session_id=s and user_id=r and left_at is null));
  end loop;
  normal:=(p_request-'recipientUserIds')||jsonb_build_object('recipientUserIds',(select jsonb_agg(key order by key) from jsonb_each(recips)));
  if l.id is not null then
   if l.revoked_at is not null then raise exception using errcode='P0001',message='GROUP_REVOKED';end if;
   if l.request<>normal then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   if not public.training_private_live_active(l) then raise exception using errcode='P0001',message='GROUP_EXPIRED';end if;
  else
   if (select count(*) from public.training_live_grants where session_id=s and owner_id=u)>=512 or exists(select 1 from public.training_live_grants v where v.session_id=s and v.owner_id=u and public.training_private_live_active(v)) then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   at_time:=clock_timestamp();
   insert into public.training_live_grants(id,session_id,owner_id,dog_id,sender_epoch,recipients,request,started_at,expires_at) values(sh,s,u,d,ep,recips,normal,at_time,least(at_time+make_interval(secs=>ttl),(select expires_at from public.training_private_sessions where id=s))) returning * into l;
  end if;
  body:=jsonb_build_object('shareId',sh,'userId',u,'sessionId',s,'dogId',l.dog_id,'expiresAtMs',public.training_private_ms(l.expires_at),'recipientUserIds',normal->'recipientUserIds');
 else
  if l.id is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  if l.revoked_at is not null then raise exception using errcode='P0001',message='GROUP_REVOKED';end if;
  if not public.training_private_live_active(l) then raise exception using errcode='P0001',message='GROUP_EXPIRED';end if;
  seq:=public.training_private_number(p_request,'sequence',1,2147483647,true);lat:=public.training_private_number(p_request,'latitude',-90,90,false);lng:=public.training_private_number(p_request,'longitude',-180,180,false);acc:=public.training_private_number(p_request,'accuracyM',0,10000,false);obs_ms:=public.training_private_number(p_request,'observedAtServerMs',0,8640000000000000,true);obs:=to_timestamp((obs_ms/1000)::double precision);
  if seq<=l.last_sequence then
   if seq<>l.last_sequence or l.last_payload_hash is distinct from sha256(convert_to(p_request::text,'UTF8')) then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   -- Idempotent delivery ACK never refreshes stale position/receive time.
   body:=jsonb_build_object('shareId',sh,'sequence',seq,'accepted',false,'expiresAtMs',public.training_private_ms(l.expires_at));
  else
   at_time:=clock_timestamp();
   if obs_ms<public.training_private_ms(l.started_at) or obs<at_time-interval '10 seconds' or obs>at_time+interval '2 seconds' then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;
   if l.last_sequence>0 and (at_time-l.last_received_at<interval '5 seconds' or obs<l.last_observed_at) then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   update public.training_live_grants set last_sequence=seq,last_payload_hash=sha256(convert_to(p_request::text,'UTF8')),last_observed_at=obs,last_received_at=at_time where id=sh;
   insert into public.training_live_last_positions(share_id,sequence,latitude,longitude,accuracy_m,observed_at,received_at,purge_after,request) values(sh,seq,lat,lng,acc,obs,at_time,least(at_time+interval '60 seconds',l.expires_at,(select expires_at from public.training_private_sessions where id=s)),p_request) on conflict(share_id) do update set sequence=excluded.sequence,latitude=excluded.latitude,longitude=excluded.longitude,accuracy_m=excluded.accuracy_m,observed_at=excluded.observed_at,received_at=excluded.received_at,purge_after=excluded.purge_after,request=excluded.request;
   body:=jsonb_build_object('shareId',sh,'sequence',seq,'accepted',true,'expiresAtMs',public.training_private_ms(l.expires_at));
  end if;
 end if;
 return jsonb_build_object('version',1,'serverNowMs',public.training_private_ms(clock_timestamp()))||body;
end $function$;

CREATE OR REPLACE FUNCTION public.training_group_session_v1(p_action text, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
declare u uuid:=auth.uid();g uuid;s uuid;d uuid;ep uuid;me uuid;ttl integer;t text;v public.training_private_sessions;part public.training_private_participants;body jsonb;
begin
 case p_action
 when 'list' then
  perform public.training_private_request(p_request,array['groupId']);g:=public.training_private_uuid(p_request,'groupId');perform public.training_private_lock_group(g);
  if not public.training_private_member(g,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  if (select count(*) from public.training_private_sessions where group_id=g)>100 then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
  body:=jsonb_build_object('sessions',coalesce((select jsonb_agg(public.training_private_session_json(id,false) order by created_at,id) from public.training_private_sessions where group_id=g),'[]'));
 when 'open' then
  perform public.training_private_request(p_request,array['groupId','sessionId','title','ttlSeconds','dogId']);g:=public.training_private_uuid(p_request,'groupId');s:=public.training_private_uuid(p_request,'sessionId');d:=public.training_private_uuid(p_request,'dogId');ttl:=public.training_private_number(p_request,'ttlSeconds',60,7200,true);t:=public.training_private_text(p_request,'title',80);
  perform public.training_private_lock_group(g);
  if not public.training_private_member(g,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  perform 1 from public.dogs where id=d and owner_id=u for share;
  if not found then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
  select * into v from public.training_private_sessions where id=s for update;
  if found then
   if v.owner_id<>u or v.group_id<>g then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
   if v.request<>p_request then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   if not public.training_private_participant(s,u) then raise exception using errcode='P0001',message='GROUP_REVOKED';end if;
  else
   if (select count(*) from public.training_private_sessions where group_id=g)>=100 then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   insert into public.training_private_sessions(id,group_id,owner_id,title,request,expires_at) values(s,g,u,t,p_request,clock_timestamp()+make_interval(secs=>ttl));
   select epoch into me from public.training_private_members where group_id=g and user_id=u;
   insert into public.training_private_participants(session_id,user_id,dog_id,dog_epoch,member_epoch,epoch) values(s,u,d,public.training_private_dog_epoch(d),me,s);
  end if;
  body:=jsonb_build_object('session',public.training_private_session_json(s,true));
 when 'join','get','leave','end' then
  if p_action='join' then perform public.training_private_request(p_request,array['sessionId','dogId','participationId']);
  elsif p_action='leave' then perform public.training_private_request(p_request,array['sessionId','participationId']);
  else perform public.training_private_request(p_request,array['sessionId']);end if;
  s:=public.training_private_uuid(p_request,'sessionId');g:=public.training_private_lock_session(s);select * into v from public.training_private_sessions where id=s;
  if p_action='leave' then
   ep:=public.training_private_uuid(p_request,'participationId');
   if not exists(select 1 from public.training_private_members where group_id=g and user_id=u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
   select * into part from public.training_private_participants where epoch=ep for update;
   if found and (part.session_id<>s or part.user_id<>u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
   if part.epoch is null then
    if (select count(*) from public.training_private_participants where session_id=s and user_id=u)>=512 then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
    insert into public.training_private_participants(session_id,user_id,epoch,left_at) values(s,u,ep,clock_timestamp());
   elsif part.left_at is null then perform public.training_private_invalidate(g,s,u);
   end if;
   body:=jsonb_build_object('sessionId',s,'left',true,'participationId',ep);
  elsif p_action='end' then
   if (v.owner_id<>u and not exists(select 1 from public.training_private_groups where id=g and owner_id=u)) or not public.training_private_member(g,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
   update public.training_private_sessions set ended_at=coalesce(ended_at,clock_timestamp()) where id=s;
   perform public.training_private_invalidate(g,s,null);body:=jsonb_build_object('sessionId',s,'ended',true);
  else
   if not public.training_private_member(g,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
   if v.ended_at is not null or v.expires_at<=clock_timestamp() then raise exception using errcode='P0001',message='GROUP_EXPIRED';end if;
   if p_action='join' then
    d:=public.training_private_uuid(p_request,'dogId');ep:=public.training_private_uuid(p_request,'participationId');
    perform 1 from public.dogs where id=d and owner_id=u for share;if not found then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
    select * into part from public.training_private_participants where epoch=ep for update;
    if found then
     if part.session_id<>s or part.user_id<>u then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
     if part.left_at is not null then raise exception using errcode='P0001',message='GROUP_REVOKED';end if;
     if part.dog_id<>d or not public.training_private_participant(s,u) then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
    else
     if exists(select 1 from public.training_private_participants where session_id=s and user_id=u and left_at is null) then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
     if (select count(*) from public.training_private_participants where session_id=s and user_id=u)>=512 then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
     select epoch into me from public.training_private_members where group_id=g and user_id=u;
     insert into public.training_private_participants(session_id,user_id,dog_id,dog_epoch,member_epoch,epoch) values(s,u,d,public.training_private_dog_epoch(d),me,ep);
    end if;
   elsif not public.training_private_participant(s,u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
   body:=jsonb_build_object('session',public.training_private_session_json(s,true));
  end if;
 else raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';
 end case;
 return jsonb_build_object('version',1,'serverNowMs',public.training_private_ms(clock_timestamp()))||body;
end $function$;

CREATE OR REPLACE FUNCTION public.training_group_v1(p_action text, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
declare u uuid:=auth.uid();g uuid;i uuid;target uuid;n text;t text;ttl integer;gv public.training_private_groups;iv public.training_private_invitations;ep uuid;body jsonb;cnt integer;
begin
 case p_action
 when 'list' then
  perform public.training_private_request(p_request,'{}');
  select count(*) into cnt from public.training_private_members m where m.user_id=u and public.training_private_member(m.group_id,u);
  if cnt>100 then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
  if (select count(*) from public.training_private_invitations v join public.training_private_groups g1 on g1.id=v.group_id where v.recipient_id=u and v.accepted_at is null and v.revoked_at is null and v.expires_at>clock_timestamp() and g1.ended_at is null)>100 then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
  body:=jsonb_build_object('groups',coalesce((select jsonb_agg(public.training_private_group_json(m.group_id) order by m.group_id) from public.training_private_members m where m.user_id=u and public.training_private_member(m.group_id,u)),'[]'),'invitations',coalesce((select jsonb_agg(public.training_private_invitation_json(v.id) order by v.id) from public.training_private_invitations v join public.training_private_groups g1 on g1.id=v.group_id where v.recipient_id=u and v.accepted_at is null and v.revoked_at is null and v.expires_at>clock_timestamp() and g1.ended_at is null and public.training_private_connected(v.inviter_id,u)),'[]'));
 when 'create' then
  perform public.training_private_request(p_request,array['groupId','title','displayName']); g:=public.training_private_uuid(p_request,'groupId');t:=public.training_private_text(p_request,'title',80);n:=public.training_private_text(p_request,'displayName',60);
  -- User-scoped creation lock serializes quota checks, including distinct UUIDs.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('training-group-user:'||u::text,0));
  select * into gv from public.training_private_groups where id=g for update;
  if found then
   if gv.owner_id<>u then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
   if gv.create_request<>p_request or gv.ended_at is not null then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
  else
   if (select count(*) from public.training_private_groups where owner_id=u)>=100 then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
   if (select count(*) from public.training_private_members m where m.user_id=u and public.training_private_member(m.group_id,u))>=100 then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   insert into public.training_private_groups(id,owner_id,title,create_request) values(g,u,t,p_request);
   insert into public.training_private_members(group_id,user_id,epoch,display_name) values(g,u,g,n);
  end if;
  body:=jsonb_build_object('group',public.training_private_group_json(g));
 when 'invite','revoke_invite' then
  if p_action='invite' then perform public.training_private_request(p_request,array['groupId','invitationId','recipientUserId','ttlSeconds']); else perform public.training_private_request(p_request,array['groupId','invitationId']); end if;
  g:=public.training_private_uuid(p_request,'groupId');i:=public.training_private_uuid(p_request,'invitationId');
  if p_action='invite' then
   target:=public.training_private_uuid(p_request,'recipientUserId');
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('training-group-user:'||target::text,0));
  end if;
  perform public.training_private_lock_group(g);
  select * into gv from public.training_private_groups where id=g;
  if gv.owner_id<>u or gv.ended_at is not null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  select * into iv from public.training_private_invitations where id=i for update;
  if found and (iv.group_id<>g or iv.inviter_id<>u) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  if p_action='revoke_invite' then
   if iv.id is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
   if iv.accepted_at is not null then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
   update public.training_private_invitations set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=i;body:=jsonb_build_object('invitationId',i,'revoked',true);
  else
   target:=public.training_private_uuid(p_request,'recipientUserId');ttl:=public.training_private_number(p_request,'ttlSeconds',60,604800,true);
   if target=u or not public.training_private_connected(u,target) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
   if iv.id is not null then
    if iv.request<>p_request then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
    if iv.revoked_at is not null then raise exception using errcode='P0001',message='GROUP_REVOKED'; end if;
    if iv.expires_at<=clock_timestamp() then raise exception using errcode='P0001',message='GROUP_EXPIRED'; end if;
   else
    if public.training_private_member(g,target) or (select count(*) from public.training_private_members where group_id=g and left_at is null)+(select count(*) from public.training_private_invitations where group_id=g and revoked_at is null and accepted_at is null and expires_at>clock_timestamp())>=50 then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
    if (select count(*) from public.training_private_invitations where group_id=g)>=512 or
       (select count(*) from public.training_private_invitations v join public.training_private_groups g1 on g1.id=v.group_id where v.recipient_id=target and v.accepted_at is null and v.revoked_at is null and v.expires_at>clock_timestamp() and g1.ended_at is null)>=100 then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
    insert into public.training_private_invitations(id,group_id,inviter_id,recipient_id,request,expires_at) values(i,g,u,target,p_request,clock_timestamp()+make_interval(secs=>ttl));
   end if;body:=jsonb_build_object('invitation',public.training_private_invitation_json(i));
  end if;
 when 'accept' then
  perform public.training_private_request(p_request,array['invitationId','displayName']); i:=public.training_private_uuid(p_request,'invitationId');n:=public.training_private_text(p_request,'displayName',60);
  select group_id into g from public.training_private_invitations where id=i and recipient_id=u;
  if g is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('training-group-user:'||u::text,0));
  perform public.training_private_lock_group(g);select * into iv from public.training_private_invitations where id=i for update;
  if not public.training_private_member(g,iv.inviter_id) or not public.training_private_connected(u,iv.inviter_id) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
  if iv.revoked_at is not null then raise exception using errcode='P0001',message='GROUP_REVOKED'; end if;
  if iv.accepted_at is not null then
   if iv.accepted_name<>n or not exists(select 1 from public.training_private_members where group_id=g and user_id=u and left_at is null and epoch=iv.accepted_epoch) then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
  else
   if iv.expires_at<=clock_timestamp() then raise exception using errcode='P0001',message='GROUP_EXPIRED'; end if;
   if public.training_private_member(g,u) or (select count(*) from public.training_private_members where group_id=g and left_at is null)>=50 then raise exception using errcode='P0001',message='GROUP_CONFLICT'; end if;
   if (select count(*) from public.training_private_members m where m.user_id=u and public.training_private_member(m.group_id,u))>=100 then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   ep:=i;
   insert into public.training_private_members(group_id,user_id,epoch,display_name) values(g,u,ep,n) on conflict(group_id,user_id) do update set epoch=excluded.epoch,display_name=excluded.display_name,joined_at=clock_timestamp(),left_at=null;
   update public.training_private_invitations set accepted_at=clock_timestamp(),accepted_epoch=ep,accepted_name=n where id=i;
  end if;body:=jsonb_build_object('group',public.training_private_group_json(g));
 when 'leave','remove_member','close' then
  if p_action='remove_member' then perform public.training_private_request(p_request,array['groupId','memberUserId','membershipId']);elsif p_action='leave' then perform public.training_private_request(p_request,array['groupId','membershipId']);else perform public.training_private_request(p_request,array['groupId']);end if;
  g:=public.training_private_uuid(p_request,'groupId');perform public.training_private_lock_group(g);select * into gv from public.training_private_groups where id=g;
  if p_action='close' then
   if gv.owner_id<>u then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
   update public.training_private_groups set ended_at=coalesce(ended_at,clock_timestamp()) where id=g;
   update public.training_private_sessions set ended_at=coalesce(ended_at,clock_timestamp()) where group_id=g;
   update public.training_private_invitations set revoked_at=coalesce(revoked_at,clock_timestamp()) where group_id=g and accepted_at is null;
   perform public.training_private_invalidate(g,null,null);body:=jsonb_build_object('groupId',g,'ended',true);
  else
   target:=case when p_action='leave' then u else public.training_private_uuid(p_request,'memberUserId') end;
   ep:=public.training_private_uuid(p_request,'membershipId');
   if p_action='remove_member' and (gv.owner_id<>u or gv.ended_at is not null) then raise exception using errcode='42501',message='GROUP_UNAVAILABLE';end if;
   if target=gv.owner_id then raise exception using errcode='P0001',message='GROUP_CONFLICT';end if;
   if exists(select 1 from public.training_private_members where group_id=g and user_id=target and epoch=ep) then
    update public.training_private_members set left_at=coalesce(left_at,clock_timestamp()) where group_id=g and user_id=target and epoch=ep;
    update public.training_private_invitations set revoked_at=coalesce(revoked_at,clock_timestamp()) where group_id=g and recipient_id=target and id=ep;
    perform public.training_private_invalidate(g,null,target);
   elsif exists(select 1 from public.training_private_invitations where id=ep and group_id=g and recipient_id=target) then
    -- Cancel a pending acceptance or acknowledge an already superseded membership.
    -- Never invalidate the newer membership/participants/grants.
    update public.training_private_invitations set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=ep and accepted_at is null;
   else raise exception using errcode='42501',message='GROUP_UNAVAILABLE';
   end if;
   body:=case when p_action='leave' then jsonb_build_object('groupId',g,'membershipId',ep,'left',true) else jsonb_build_object('groupId',g,'memberUserId',target,'membershipId',ep,'removed',true) end;
  end if;
 else raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';
 end case;
 return jsonb_build_object('version',1,'serverNowMs',public.training_private_ms(clock_timestamp()))||body;
end $function$;

CREATE OR REPLACE FUNCTION public.training_live_maintenance(p_batch_size integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '1s'
AS $function$
declare started timestamptz:=clock_timestamp(); n integer; remaining integer; oldest timestamptz;
begin
 if p_batch_size is null or p_batch_size<1 or p_batch_size>1000 then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST';end if;
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('training-live-maintenance',0)) then return jsonb_build_object('status','busy');end if;
 with candidates as (
  select p.share_id from public.training_live_last_positions p where p.purge_after<=started
  order by p.purge_after,p.share_id limit p_batch_size for update skip locked
 ), removed as (
  delete from public.training_live_last_positions p using candidates c where p.share_id=c.share_id returning p.share_id
 ) select count(*) into n from removed;
 select count(*) into remaining from (select 1 from public.training_live_last_positions where purge_after<=clock_timestamp() limit 1001) bounded;
 select min(purge_after) into oldest from (select purge_after from public.training_live_last_positions where purge_after<=clock_timestamp() order by purge_after limit 1) bounded;
 insert into public.training_live_maintenance_state(singleton,last_success_at,last_deleted,total_deleted,duration_ms,due_remaining_lower_bound,oldest_due_at)
 values(true,clock_timestamp(),n,n,public.training_private_ms(clock_timestamp())-public.training_private_ms(started),remaining,oldest)
 on conflict(singleton) do update set last_success_at=excluded.last_success_at,last_deleted=excluded.last_deleted,
 total_deleted=public.training_live_maintenance_state.total_deleted+n,duration_ms=excluded.duration_ms,
 due_remaining_lower_bound=excluded.due_remaining_lower_bound,oldest_due_at=excluded.oldest_due_at;
 return jsonb_build_object('status','ok','deleted',n,'dueRemainingLowerBound',remaining,'oldestDueAtMs',public.training_private_ms(oldest));
end $function$;

CREATE OR REPLACE FUNCTION public.training_live_maintenance_health()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('serverNowMs',public.training_private_ms(clock_timestamp()),
 'lastSuccessAtMs',public.training_private_ms(s.last_success_at),
 'healthy',coalesce(s.last_success_at>clock_timestamp()-interval '3 minutes' and s.due_remaining_lower_bound=0,true) and s.last_success_at is not null,
 'lastDeleted',s.last_deleted,'totalDeleted',s.total_deleted,'durationMs',s.duration_ms,
 'dueRemainingLowerBound',s.due_remaining_lower_bound,'oldestDueAtMs',public.training_private_ms(s.oldest_due_at))
 from (values(1)) one(x) left join public.training_live_maintenance_state s on s.singleton
$function$;

CREATE OR REPLACE FUNCTION public.training_private_connected(a uuid, b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.connections c where c.status='accepted' and ((c.owner_user_id=a and c.connected_user_id=b) or (c.owner_user_id=b and c.connected_user_id=a)))
$function$;

CREATE OR REPLACE FUNCTION public.training_private_dog_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if TG_OP='TRUNCATE' then
  insert into public.training_private_dog_epochs(dog_id,epoch)
  select d.dog_id,gen_random_uuid() from (
   select dog_id from public.training_private_participants where dog_id is not null
   union select dog_id from public.training_private_dog_epochs
  ) d
  on conflict(dog_id) do update set epoch=excluded.epoch,changed_at=clock_timestamp();
  return null;
 end if;
 if TG_OP='DELETE' or new.owner_id is distinct from old.owner_id or new.id is distinct from old.id then
  insert into public.training_private_dog_epochs(dog_id,epoch) values(old.id,gen_random_uuid())
  on conflict(dog_id) do update set epoch=excluded.epoch,changed_at=clock_timestamp();
  if TG_OP='UPDATE' and new.id is distinct from old.id then
   insert into public.training_private_dog_epochs(dog_id,epoch) values(new.id,gen_random_uuid())
   on conflict(dog_id) do update set epoch=excluded.epoch,changed_at=clock_timestamp();
  end if;
 end if;
 return null;
end $function$;

CREATE OR REPLACE FUNCTION public.training_private_dog_epoch(d uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce((select epoch from public.training_private_dog_epochs where dog_id=d),'00000000-0000-0000-0000-000000000000'::uuid)
$function$;

CREATE OR REPLACE FUNCTION public.training_private_group_json(g uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('groupId',v.id,'title',v.title,'ownerUserId',v.owner_id,'status',case when v.ended_at is null then 'active' else 'ended' end,'createdAtMs',public.training_private_ms(v.created_at),'members',coalesce((select jsonb_agg(jsonb_build_object('membershipId',m.epoch,'userId',m.user_id,'displayName',m.display_name,'role',case when m.user_id=v.owner_id then 'owner' else 'member' end,'joinedAtMs',public.training_private_ms(m.joined_at)) order by m.joined_at,m.user_id) from public.training_private_members m where m.group_id=g and m.left_at is null),'[]')) from public.training_private_groups v where v.id=g
$function$;

CREATE OR REPLACE FUNCTION public.training_private_invalidate(g uuid, s uuid, u uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 update public.training_private_participants p set left_at=coalesce(p.left_at,clock_timestamp()) where p.session_id in(select id from public.training_private_sessions where group_id=g and (s is null or id=s)) and (u is null or p.user_id=u);
 update public.training_live_grants l set revoked_at=coalesce(l.revoked_at,clock_timestamp()) where l.session_id in(select id from public.training_private_sessions where group_id=g and (s is null or id=s)) and (u is null or l.owner_id=u or l.recipients ? u::text);
 delete from public.training_live_last_positions p using public.training_live_grants l where p.share_id=l.id and l.revoked_at is not null and l.session_id in(select id from public.training_private_sessions where group_id=g and (s is null or id=s));
end $function$;

CREATE OR REPLACE FUNCTION public.training_private_invitation_json(i uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('invitationId',v.id,'groupId',v.group_id,'groupTitle',g.title,'inviterUserId',v.inviter_id,'recipientUserId',v.recipient_id,'status',case when v.revoked_at is not null or g.ended_at is not null then 'revoked' when v.accepted_at is not null then 'accepted' when v.expires_at<=clock_timestamp() then 'expired' else 'pending' end,'expiresAtMs',public.training_private_ms(v.expires_at)) from public.training_private_invitations v join public.training_private_groups g on g.id=v.group_id where v.id=i
$function$;

CREATE OR REPLACE FUNCTION public.training_private_live_active(l training_live_grants)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select l.revoked_at is null and l.started_at is not null and l.expires_at>clock_timestamp()
 and public.training_private_participant(l.session_id,l.owner_id)
 and exists(select 1 from public.training_private_participants p where p.session_id=l.session_id and p.user_id=l.owner_id and p.epoch=l.sender_epoch and p.dog_id=l.dog_id and p.left_at is null)
 and not exists(select 1 from jsonb_each_text(l.recipients) r where not public.training_private_participant(l.session_id,r.key::uuid) or not exists(select 1 from public.training_private_participants p where p.session_id=l.session_id and p.user_id=r.key::uuid and p.epoch=r.value::uuid and p.left_at is null))
$function$;

CREATE OR REPLACE FUNCTION public.training_private_lock_group(g uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform 1 from public.training_private_groups where id=g for update;
 if not found then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.training_private_lock_session(s uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g uuid;
begin
 select group_id into g from public.training_private_sessions where id=s;
 if g is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
 perform public.training_private_lock_group(g);
 perform 1 from public.training_private_sessions where id=s for update;
 if not found then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
 perform d.id from public.dogs d where d.id in(select dog_id from public.training_private_participants where session_id=s and left_at is null) order by d.id for share;
 -- Mark invalidated ownership generations permanently left before a fresh join.
 perform public.training_private_invalidate(g,s,p.user_id) from public.training_private_participants p
 where p.session_id=s and p.left_at is null and (p.dog_epoch is distinct from public.training_private_dog_epoch(p.dog_id)
 or not exists(select 1 from public.dogs d where d.id=p.dog_id and d.owner_id=p.user_id));
 return g;
end $function$;

CREATE OR REPLACE FUNCTION public.training_private_member(g uuid, u uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.training_private_members m join public.training_private_groups g1 on g1.id=m.group_id where m.group_id=g and m.user_id=u and m.left_at is null and g1.ended_at is null)
$function$;

CREATE OR REPLACE FUNCTION public.training_private_ms(t timestamp with time zone)
 RETURNS bigint
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$select floor(extract(epoch from t)*1000)::bigint$function$;

CREATE OR REPLACE FUNCTION public.training_private_number(r jsonb, k text, lo numeric, hi numeric, whole boolean)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare v numeric;
begin
 if jsonb_typeof(r->k) is distinct from 'number' then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
 v:=(r->>k)::numeric;
 if not(v between lo and hi) or (whole and v<>trunc(v)) then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if; return v;
end $function$;

CREATE OR REPLACE FUNCTION public.training_private_participant(s uuid, u uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.training_private_participants p join public.training_private_sessions s1 on s1.id=p.session_id join public.training_private_members m on m.group_id=s1.group_id and m.user_id=p.user_id and m.epoch=p.member_epoch join public.training_private_groups g on g.id=s1.group_id join public.dogs d on d.id=p.dog_id and d.owner_id=p.user_id where p.session_id=s and p.user_id=u and p.dog_epoch=public.training_private_dog_epoch(p.dog_id) and p.left_at is null and m.left_at is null and g.ended_at is null and s1.ended_at is null and s1.expires_at>clock_timestamp())
$function$;

CREATE OR REPLACE FUNCTION public.training_private_request(r jsonb, keys text[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null then raise exception using errcode='42501',message='GROUP_UNAVAILABLE'; end if;
 if r is null or jsonb_typeof(r)<>'object' or octet_length(r::text)>8192 then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
 if (select coalesce(array_agg(k order by k),'{}') from jsonb_object_keys(r) k) <> (select coalesce(array_agg(k order by k),'{}') from unnest(keys) k) then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.training_private_session_json(s uuid, details boolean)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('sessionId',v.id,'groupId',v.group_id,'ownerUserId',v.owner_id,'title',v.title,'status',case when v.ended_at is null and v.expires_at>clock_timestamp() then 'active' else 'ended' end,'expiresAtMs',public.training_private_ms(v.expires_at)) || case when details then jsonb_build_object('participants',coalesce((select jsonb_agg(jsonb_build_object('participationId',p.epoch,'userId',p.user_id,'displayName',m.display_name,'dogId',d.id,'dogName',d.name,'colorKey',d.track_overlay_color_key) order by p.user_id) from public.training_private_participants p join public.training_private_members m on m.group_id=v.group_id and m.user_id=p.user_id and m.epoch=p.member_epoch join public.dogs d on d.id=p.dog_id and d.owner_id=p.user_id where p.session_id=s and p.dog_epoch=public.training_private_dog_epoch(p.dog_id) and p.left_at is null and m.left_at is null),'[]')) else '{}'::jsonb end from public.training_private_sessions v where v.id=s
$function$;

CREATE OR REPLACE FUNCTION public.training_private_text(r jsonb, k text, maxlen integer)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare v text:=btrim(r->>k);
begin
 if jsonb_typeof(r->k) is distinct from 'string' or v is null or length(v)<1 or length(v)>maxlen then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if; return v;
end $function$;

CREATE OR REPLACE FUNCTION public.training_private_uuid(r jsonb, k text)
 RETURNS uuid
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare v uuid;
begin
 if jsonb_typeof(r->k) is distinct from 'string' then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if;
 begin v:=(r->>k)::uuid; exception when invalid_text_representation then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end;
 if v is null then raise exception using errcode='22023',message='GROUP_INVALID_REQUEST'; end if; return v;
end $function$;

-- 4) Rechte: Tabellen nur service_role; Funktionen wie in Production
revoke all on table public.training_private_groups from public, anon, authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.training_private_groups to service_role;
revoke all on table public.training_private_members from public, anon, authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.training_private_members to service_role;
revoke all on table public.training_private_invitations from public, anon, authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.training_private_invitations to service_role;
revoke all on table public.training_private_sessions from public, anon, authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.training_private_sessions to service_role;
revoke all on table public.training_private_participants from public, anon, authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.training_private_participants to service_role;
revoke all on table public.training_private_dog_epochs from public, anon, authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.training_private_dog_epochs to service_role;
revoke all on table public.training_live_grants from public, anon, authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.training_live_grants to service_role;
revoke all on table public.training_live_last_positions from public, anon, authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.training_live_last_positions to service_role;
revoke all on table public.training_live_maintenance_state from public, anon, authenticated;
grant select on table public.training_live_maintenance_state to service_role;
revoke all on table public.group_distraction_tasks from public, anon, authenticated;
grant all on table public.group_distraction_tasks to service_role;  -- Production-Recht nicht exportiert: sichere Vorgabe
revoke all on table public.group_distraction_submissions from public, anon, authenticated;
grant all on table public.group_distraction_submissions to service_role;  -- Production-Recht nicht exportiert: sichere Vorgabe
revoke all on table public.group_distraction_source_epochs from public, anon, authenticated;
grant all on table public.group_distraction_source_epochs to service_role;  -- Production-Recht nicht exportiert: sichere Vorgabe
revoke all on table public.group_distraction_health from public, anon, authenticated;
grant all on table public.group_distraction_health to service_role;  -- Production-Recht nicht exportiert: sichere Vorgabe
revoke all on table public.anyvo_group_monitor_targets from public, anon, authenticated;
grant all on table public.anyvo_group_monitor_targets to service_role;  -- Production-Recht nicht exportiert: sichere Vorgabe

revoke all on function public.anyvo_group_monitor_register(p_kind text, p_ping_url text) from public, anon, authenticated;
grant execute on function public.anyvo_group_monitor_register(p_kind text, p_ping_url text) to service_role;  -- Production-Recht nicht exportiert: nur service_role
revoke all on function public.anyvo_group_monitor_tick() from public, anon, authenticated;
grant execute on function public.anyvo_group_monitor_tick() to service_role;  -- Production-Recht nicht exportiert: nur service_role
revoke all on function public.gd_access(t group_distraction_tasks, u uuid) from public, anon, authenticated;
grant execute on function public.gd_access(t group_distraction_tasks, u uuid) to service_role;  -- Production-Recht nicht exportiert: nur service_role
revoke all on function public.gd_active() from public, anon, authenticated;
grant execute on function public.gd_active() to service_role;  -- Production-Recht nicht exportiert: nur service_role
revoke all on function public.gd_contribution(v jsonb, task uuid) from public, anon, authenticated;
grant execute on function public.gd_contribution(v jsonb, task uuid) to service_role;  -- Production-Recht nicht exportiert: nur service_role
revoke all on function public.gd_hash(v jsonb) from public, anon, authenticated;
grant execute on function public.gd_hash(v jsonb) to service_role;  -- Production-Recht nicht exportiert: nur service_role
revoke all on function public.gd_keys(v jsonb, k text[]) from public, anon, authenticated;
grant execute on function public.gd_keys(v jsonb, k text[]) to service_role;  -- Production-Recht nicht exportiert: nur service_role
revoke all on function public.gd_meta(t group_distraction_tasks) from public, anon, authenticated;
grant execute on function public.gd_meta(t group_distraction_tasks) to service_role;  -- Production-Recht nicht exportiert: nur service_role
revoke all on function public.gd_num(v jsonb, lo numeric, hi numeric, whole boolean, nullable boolean) from public, anon, authenticated;
grant execute on function public.gd_num(v jsonb, lo numeric, hi numeric, whole boolean, nullable boolean) to service_role;  -- Production-Recht nicht exportiert: nur service_role
revoke all on function public.gd_origin_matches(t group_distraction_tasks) from public, anon, authenticated;
grant execute on function public.gd_origin_matches(t group_distraction_tasks) to service_role;  -- Production-Recht nicht exportiert: nur service_role
revoke all on function public.gd_source(id uuid) from public, anon, authenticated;
grant execute on function public.gd_source(id uuid) to service_role;  -- Production-Recht nicht exportiert: nur service_role
revoke all on function public.gd_source_changed() from public, anon, authenticated;
grant execute on function public.gd_source_changed() to service_role;  -- Production-Recht nicht exportiert: nur service_role
revoke all on function public.gd_uuid(v jsonb) from public, anon, authenticated;
grant execute on function public.gd_uuid(v jsonb) to service_role;  -- Production-Recht nicht exportiert: nur service_role
revoke all on function public.group_distraction_maintenance() from public, anon, authenticated;
grant execute on function public.group_distraction_maintenance() to service_role;  -- Production-Recht nicht exportiert: nur service_role
revoke all on function public.group_distraction_source_v1(source uuid, actor uuid) from public, anon, authenticated;
grant execute on function public.group_distraction_source_v1(source uuid, actor uuid) to service_role;  -- Production-Recht nicht exportiert: nur service_role
revoke all on function public.tracking_private_active_initiator() from public, anon, authenticated;
grant execute on function public.tracking_private_active_initiator() to service_role;  -- Production-Recht nicht exportiert: nur service_role
revoke all on function public.training_group_distraction_v1(p_action text, p_request jsonb) from public, anon, authenticated;
grant execute on function public.training_group_distraction_v1(p_action text, p_request jsonb) to authenticated;
revoke all on function public.training_group_live_v1(p_action text, p_request jsonb) from public, anon, authenticated;
grant execute on function public.training_group_live_v1(p_action text, p_request jsonb) to authenticated;
grant execute on function public.training_group_live_v1(p_action text, p_request jsonb) to service_role;
revoke all on function public.training_group_session_v1(p_action text, p_request jsonb) from public, anon, authenticated;
grant execute on function public.training_group_session_v1(p_action text, p_request jsonb) to authenticated;
grant execute on function public.training_group_session_v1(p_action text, p_request jsonb) to service_role;
revoke all on function public.training_group_v1(p_action text, p_request jsonb) from public, anon, authenticated;
grant execute on function public.training_group_v1(p_action text, p_request jsonb) to authenticated;
grant execute on function public.training_group_v1(p_action text, p_request jsonb) to service_role;
revoke all on function public.training_live_maintenance(p_batch_size integer) from public, anon, authenticated;
grant execute on function public.training_live_maintenance(p_batch_size integer) to service_role;
revoke all on function public.training_live_maintenance_health() from public, anon, authenticated;
grant execute on function public.training_live_maintenance_health() to service_role;
revoke all on function public.training_private_connected(a uuid, b uuid) from public, anon, authenticated;
grant execute on function public.training_private_connected(a uuid, b uuid) to service_role;
revoke all on function public.training_private_dog_changed() from public, anon, authenticated;
grant execute on function public.training_private_dog_changed() to service_role;
revoke all on function public.training_private_dog_epoch(d uuid) from public, anon, authenticated;
grant execute on function public.training_private_dog_epoch(d uuid) to service_role;
revoke all on function public.training_private_group_json(g uuid) from public, anon, authenticated;
grant execute on function public.training_private_group_json(g uuid) to service_role;
revoke all on function public.training_private_invalidate(g uuid, s uuid, u uuid) from public, anon, authenticated;
grant execute on function public.training_private_invalidate(g uuid, s uuid, u uuid) to service_role;
revoke all on function public.training_private_invitation_json(i uuid) from public, anon, authenticated;
grant execute on function public.training_private_invitation_json(i uuid) to service_role;
revoke all on function public.training_private_live_active(l training_live_grants) from public, anon, authenticated;
grant execute on function public.training_private_live_active(l training_live_grants) to service_role;
revoke all on function public.training_private_lock_group(g uuid) from public, anon, authenticated;
grant execute on function public.training_private_lock_group(g uuid) to service_role;
revoke all on function public.training_private_lock_session(s uuid) from public, anon, authenticated;
grant execute on function public.training_private_lock_session(s uuid) to service_role;
revoke all on function public.training_private_member(g uuid, u uuid) from public, anon, authenticated;
grant execute on function public.training_private_member(g uuid, u uuid) to service_role;
revoke all on function public.training_private_ms(t timestamp with time zone) from public, anon, authenticated;
grant execute on function public.training_private_ms(t timestamp with time zone) to service_role;
revoke all on function public.training_private_number(r jsonb, k text, lo numeric, hi numeric, whole boolean) from public, anon, authenticated;
grant execute on function public.training_private_number(r jsonb, k text, lo numeric, hi numeric, whole boolean) to service_role;
revoke all on function public.training_private_participant(s uuid, u uuid) from public, anon, authenticated;
grant execute on function public.training_private_participant(s uuid, u uuid) to service_role;
revoke all on function public.training_private_request(r jsonb, keys text[]) from public, anon, authenticated;
grant execute on function public.training_private_request(r jsonb, keys text[]) to service_role;
revoke all on function public.training_private_session_json(s uuid, details boolean) from public, anon, authenticated;
grant execute on function public.training_private_session_json(s uuid, details boolean) to service_role;
revoke all on function public.training_private_text(r jsonb, k text, maxlen integer) from public, anon, authenticated;
grant execute on function public.training_private_text(r jsonb, k text, maxlen integer) to service_role;
revoke all on function public.training_private_uuid(r jsonb, k text) from public, anon, authenticated;
grant execute on function public.training_private_uuid(r jsonb, k text) to service_role;

-- 5) Trigger auf bestehenden Tabellen
create or replace trigger training_private_dog_changed after delete or update on public.dogs
  for each row execute function public.training_private_dog_changed();
create or replace trigger training_private_dogs_truncated after truncate on public.dogs
  for each statement execute function public.training_private_dog_changed();
create or replace trigger gd_dogs_truncated after truncate on public.dogs
  for each statement execute function public.gd_source_changed();
create or replace trigger gd_source_identity_changed after delete or update on public.training_sessions
  for each row execute function public.gd_source_changed();
create or replace trigger gd_sources_truncated after truncate on public.training_sessions
  for each statement execute function public.gd_source_changed();

-- 6) Cron-Jobs (nur mit pg_cron; bestehende Jobs bleiben unverändert)
do $cron$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron fehlt: Gruppen-Cron-Jobs nicht angelegt';
    return;
  end if;
  if not exists (select 1 from cron.job where jobname = 'anyvo-training-live-maintenance-v1') then
    perform cron.schedule('anyvo-training-live-maintenance-v1', '* * * * *', $job$set statement_timeout='10s';
with old_runs as (
 select r.runid from cron.job_run_details r join cron.job j on j.jobid=r.jobid
 where j.jobname='anyvo-training-live-maintenance-v1' and r.end_time<clock_timestamp()-interval '7 days'
 order by r.runid limit 1000
)
delete from cron.job_run_details r using old_runs o where r.runid=o.runid;
select public.training_live_maintenance(1000);$job$);
  end if;
  if not exists (select 1 from cron.job where jobname = 'anyvo-group-distraction-maintenance-v1') then
    perform cron.schedule('anyvo-group-distraction-maintenance-v1', '* * * * *',
      $job$set statement_timeout='10s'; select public.group_distraction_maintenance();$job$);
  end if;
  -- anyvo-group-monitor-v1 legt anyvo_group_monitor_register() an (braucht vault + Ping-URL);
  -- hier bewusst nicht automatisch.
end
$cron$;

reset check_function_bodies;
