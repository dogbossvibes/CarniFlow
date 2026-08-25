


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."tester_level" AS ENUM (
    'developer',
    'qa',
    'trainer',
    'admin'
);


ALTER TYPE "public"."tester_level" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view"("p_viewer" "uuid", "p_owner" "uuid", "p_perm" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.connections c
    join public.connection_permissions p on p.connection_id = c.id
    where c.owner_user_id = p_owner
      and c.connected_user_id = p_viewer
      and c.status = 'accepted'
      and case p_perm
        when 'view_trainings'     then p.view_trainings
        when 'view_statistics'    then p.view_statistics
        when 'view_videos'        then p.view_videos
        when 'view_dogs'          then p.view_dogs
        when 'view_appointments'  then p.view_appointments
        when 'view_health'        then p.view_health
        when 'view_private_notes' then p.view_private_notes
        else false
      end
  );
$$;


ALTER FUNCTION "public"."can_view"("p_viewer" "uuid", "p_owner" "uuid", "p_perm" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_founder_slot"("p_user_id" "uuid") RETURNS TABLE("success" boolean, "slots_used" integer, "slots_remaining" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_count int; v_existing int; v_limit int := founder_slot_limit();
begin
  -- Serialisiert konkurrierende Claims (verhindert Überbuchung bei Race Conditions).
  perform pg_advisory_xact_lock(770077);

  -- Bestehender Founder → behält seinen Slot, unabhängig vom aktuellen Limit.
  select count(*) into v_existing from founder_slots where user_id = p_user_id;
  if v_existing > 0 then
    select count(*) into v_count from founder_slots;
    return query select true, v_count, greatest(0, v_limit - v_count); return;
  end if;

  select count(*) into v_count from founder_slots;
  if v_count >= v_limit then
    return query select false, v_count, 0; return;
  end if;

  insert into founder_slots(user_id) values (p_user_id);
  v_count := v_count + 1;
  return query select true, v_count, greatest(0, v_limit - v_count);
end; $$;


ALTER FUNCTION "public"."claim_founder_slot"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."coach_link_exists"("client" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM coach_relationships r
    WHERE r.trainer_id = auth.uid()
      AND r.client_id  = client
      AND r.status IN ('pending','active')
  );
$$;


ALTER FUNCTION "public"."coach_link_exists"("client" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."founder_slot_limit"() RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$ select 11 $$;


ALTER FUNCTION "public"."founder_slot_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."founder_slots_status"() RETURNS TABLE("slots_used" integer, "slots_remaining" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select count(*)::int, greatest(0, founder_slot_limit() - count(*))::int from founder_slots;
$$;


ALTER FUNCTION "public"."founder_slots_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_profile_role"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF coalesce(auth.role(), '') <> 'service_role'
       AND NEW.role NOT IN ('user','trainer') THEN
      RAISE EXCEPTION 'Rolle "%" darf nicht selbst gesetzt werden', NEW.role
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_profile_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  desired text := coalesce(new.raw_user_meta_data->>'role', 'user');
BEGIN
  IF desired NOT IN ('user','trainer') THEN
    desired := 'user';   -- 'admin' (oder Unbekanntes) nie über Self-Signup
  END IF;

  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    desired
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_coach"("client" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM coach_relationships r
    WHERE r.trainer_id = auth.uid()
      AND r.client_id  = client
      AND r.status     = 'active'
  );
$$;


ALTER FUNCTION "public"."is_active_coach"("client" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_training_embeddings"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "filter_user_id" "uuid", "filter_dog_id" "uuid" DEFAULT NULL::"uuid", "filter_category" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "training_session_id" "uuid", "source_type" "text", "content" "text", "content_summary" "text", "metadata" "jsonb", "similarity" double precision)
    LANGUAGE "sql" STABLE
    AS $$
  select
    te.id,
    te.training_session_id,
    te.source_type,
    te.content,
    te.content_summary,
    te.metadata,
    1 - (te.embedding <=> query_embedding) as similarity
  from public.training_embeddings te
  where te.user_id = filter_user_id
    and te.embedding is not null
    and 1 - (te.embedding <=> query_embedding) > match_threshold
    and (filter_dog_id is null or te.metadata->>'dog_id' = filter_dog_id::text)
    and (filter_category is null or te.metadata->>'category' = filter_category)
  order by te.embedding <=> query_embedding
  limit match_count;
$$;


ALTER FUNCTION "public"."match_training_embeddings"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "filter_user_id" "uuid", "filter_dog_id" "uuid", "filter_category" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_internal_tester_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.role() is distinct from 'service_role' then
    new.is_internal_tester := old.is_internal_tester;
    new.tester_level       := old.tester_level;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."protect_internal_tester_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_connection_invite"("p_code" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_invite   public.connection_invites%rowtype;
  v_owner    uuid := auth.uid();
  v_conn_id  uuid;
begin
  if v_owner is null then
    raise exception 'not authenticated';
  end if;

  select * into v_invite from public.connection_invites
  where code = upper(trim(p_code))
  limit 1;

  if not found then
    raise exception 'invalid code';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'code expired';
  end if;
  if v_invite.max_uses is not null and v_invite.uses >= v_invite.max_uses then
    raise exception 'code exhausted';
  end if;
  if v_invite.trainer_id = v_owner then
    raise exception 'cannot connect to yourself';
  end if;

  -- Bestehende Connection wiederverwenden, sonst neu anlegen.
  select id into v_conn_id from public.connections
  where owner_user_id = v_owner and connected_user_id = v_invite.trainer_id
    and connection_type = 'trainer_client'
  limit 1;

  if v_conn_id is null then
    insert into public.connections (owner_user_id, connected_user_id, status, created_by, connection_type)
    values (v_owner, v_invite.trainer_id, 'accepted', 'owner', 'trainer_client')
    returning id into v_conn_id;

    insert into public.connection_permissions (connection_id) values (v_conn_id)
    on conflict (connection_id) do nothing;

    update public.connection_invites set uses = uses + 1 where id = v_invite.id;
  end if;

  return v_conn_id;
end;
$$;


ALTER FUNCTION "public"."redeem_connection_invite"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin new.updated_at = now(); return new; end; $$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ai_insights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "dog_id" "uuid",
    "insight_type" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb",
    "is_dismissed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone
);


ALTER TABLE "public"."ai_insights" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calendar_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "dog_id" "uuid",
    "trainer_id" "uuid",
    "type" "text" DEFAULT 'training'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "start_at" timestamp with time zone NOT NULL,
    "end_at" timestamp with time zone,
    "location" "text",
    "discipline" "text",
    "notes" "text",
    "status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "reminder_minutes" integer[] DEFAULT '{}'::integer[] NOT NULL,
    "repeat" "text" DEFAULT 'none'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "types" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "dog_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL
);


ALTER TABLE "public"."calendar_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_relationships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trainer_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coach_relationships_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."coach_relationships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."connection_chats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "connection_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."connection_chats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."connection_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "trainer_id" "uuid" NOT NULL,
    "expires_at" timestamp with time zone,
    "max_uses" integer,
    "uses" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."connection_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."connection_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "message_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "content" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "read_at" timestamp with time zone,
    "legacy_message_id" "uuid",
    CONSTRAINT "connection_messages_message_type_check" CHECK (("message_type" = ANY (ARRAY['text'::"text", 'voice'::"text", 'image'::"text", 'video'::"text"])))
);


ALTER TABLE "public"."connection_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."connection_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "connection_id" "uuid" NOT NULL,
    "view_trainings" boolean DEFAULT true NOT NULL,
    "view_statistics" boolean DEFAULT true NOT NULL,
    "view_videos" boolean DEFAULT true NOT NULL,
    "view_dogs" boolean DEFAULT true NOT NULL,
    "view_appointments" boolean DEFAULT true NOT NULL,
    "view_health" boolean DEFAULT false NOT NULL,
    "view_private_notes" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."connection_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "owner_user_id" "uuid" NOT NULL,
    "connected_user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_by" "text" DEFAULT 'owner'::"text" NOT NULL,
    "connection_type" "text" DEFAULT 'trainer_client'::"text" NOT NULL,
    "connection_name" "text",
    CONSTRAINT "connections_created_by_check" CHECK (("created_by" = ANY (ARRAY['owner'::"text", 'connected'::"text"]))),
    CONSTRAINT "connections_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."custom_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text" DEFAULT 'star'::"text" NOT NULL,
    "color" "text" DEFAULT '#A78BFA'::"text" NOT NULL,
    "exercises" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."custom_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dog_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "dog_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "title" "text",
    "file_url" "text",
    "issued_on" "date",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dog_documents_kind_check" CHECK (("kind" = ANY (ARRAY['impfpass'::"text", 'stammbaum'::"text", 'hd_ed'::"text", 'pruefung'::"text", 'sonstiges'::"text"])))
);


ALTER TABLE "public"."dog_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dog_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "dog_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "overall_pct" integer DEFAULT 0 NOT NULL,
    "parts" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dog_goals_overall_pct_check" CHECK ((("overall_pct" >= 0) AND ("overall_pct" <= 100)))
);


ALTER TABLE "public"."dog_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dog_health_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "dog_id" "uuid" NOT NULL,
    "entry_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "weight_kg" numeric(5,2),
    "load_level" "text",
    "is_rest_day" boolean DEFAULT false NOT NULL,
    "is_intense" boolean DEFAULT false NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dog_health_entries_load_level_check" CHECK (("load_level" = ANY (ARRAY['leicht'::"text", 'mittel'::"text", 'hoch'::"text"])))
);


ALTER TABLE "public"."dog_health_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dog_heat_cycles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "dog_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "phase" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dog_heat_cycles_phase_check" CHECK (("phase" = ANY (ARRAY['Proöstrus'::"text", 'Östrus'::"text", 'Diöstrus'::"text", 'Anöstrus'::"text"])))
);


ALTER TABLE "public"."dog_heat_cycles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dog_vet_appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "dog_id" "uuid" NOT NULL,
    "appointment_at" timestamp with time zone NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dog_vet_appointments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dogs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "name" "text" NOT NULL,
    "breed" "text",
    "age" integer,
    "owner_id" "uuid",
    "photo_url" "text",
    "gender" "text",
    "birth_date" "date",
    "weight_kg" numeric,
    "titles" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "sire" "text",
    "dam" "text",
    "kennel" "text",
    "is_favorite" boolean DEFAULT false NOT NULL,
    "color" "text",
    "discipline" "text",
    "level" "text",
    "best_score" "text",
    "microchip_number" "text",
    "tasso_registered" boolean DEFAULT false NOT NULL,
    "vet" "text",
    "vaccination" "text",
    "food" "text"
);


ALTER TABLE "public"."dogs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."dogs"."titles" IS 'Leistungsabzeichen / Titel, z. B. {"IGP 3","IBGH 3","Obedience"}';



COMMENT ON COLUMN "public"."dogs"."sire" IS 'Vater (Abstammung)';



COMMENT ON COLUMN "public"."dogs"."dam" IS 'Mutter (Abstammung)';



COMMENT ON COLUMN "public"."dogs"."kennel" IS 'Zuchtstätte (Abstammung)';



CREATE TABLE IF NOT EXISTS "public"."founder_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "claimed_at" timestamp with time zone DEFAULT "now"(),
    "subscription_id" "uuid"
);


ALTER TABLE "public"."founder_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "body" "text",
    "audio_url" "text",
    "video_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "read_at" timestamp with time zone
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "plan" "text" DEFAULT 'free'::"text",
    "plan_expires_at" timestamp with time zone,
    "trial_used" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "role" "text" DEFAULT 'user'::"text" NOT NULL,
    "share_trainings_default" boolean DEFAULT false NOT NULL,
    "push_token" "text",
    "is_trainer" boolean DEFAULT false,
    "trainer_since" timestamp with time zone,
    "trainer_name" "text",
    "aktive_sparten" "text"[] DEFAULT ARRAY['IGP'::"text", 'Unterordnung'::"text", 'Schutzdienst'::"text", 'Fährte'::"text", 'Obedience'::"text", 'Agility'::"text", 'Begleithund'::"text"],
    "locale" "text",
    "is_internal_tester" boolean DEFAULT false NOT NULL,
    "tester_level" "public"."tester_level",
    CONSTRAINT "profiles_locale_check" CHECK (("locale" = ANY (ARRAY['de-CH'::"text", 'de-DE'::"text", 'gsw-CH'::"text"]))),
    CONSTRAINT "profiles_plan_check" CHECK (("plan" = ANY (ARRAY['free'::"text", 'premium'::"text"]))),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'trainer'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."locale" IS 'Bevorzugte App-Sprache (i18n). NULL = App-Standard (de-CH).';



CREATE TABLE IF NOT EXISTS "public"."shared_trainings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "training_id" "uuid",
    "owner_id" "uuid",
    "token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(16), 'hex'::"text") NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '30 days'::interval) NOT NULL,
    "include_notes" boolean DEFAULT true,
    "include_video" boolean DEFAULT true,
    "include_audio" boolean DEFAULT true,
    "include_score" boolean DEFAULT true,
    "view_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."shared_trainings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tier" "text",
    "product_id" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "store" "text" DEFAULT 'app_store'::"text",
    "expires_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "plan" "text",
    "started_at" timestamp with time zone DEFAULT "now"(),
    "trial_ends_at" timestamp with time zone,
    "current_period_ends_at" timestamp with time zone,
    "provider" "text",
    "provider_product_id" "text",
    "provider_subscription_id" "text",
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    CONSTRAINT "subscriptions_plan_check" CHECK ((("plan" IS NULL) OR ("plan" = ANY (ARRAY['beginner_trial'::"text", 'founder_active'::"text", 'active'::"text", 'trainer'::"text"])))),
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['trialing'::"text", 'active'::"text", 'expired'::"text", 'cancelled'::"text", 'past_due'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."track_articles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "track_id" "uuid" NOT NULL,
    "lat" double precision,
    "lng" double precision,
    "gefunden" boolean DEFAULT false NOT NULL,
    "typ" "text" DEFAULT 'gegenstand'::"text" NOT NULL,
    "notiz" "text",
    "seq_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "track_articles_typ_check" CHECK (("typ" = ANY (ARRAY['gegenstand'::"text", 'verleitung'::"text"])))
);


ALTER TABLE "public"."track_articles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."track_engine_sessions" (
    "session_id" "uuid" NOT NULL,
    "engine" "text",
    "platform" "text",
    "raw_gnss_available" boolean,
    "average_accuracy" numeric(6,2),
    "best_accuracy" numeric(6,2),
    "worst_accuracy" numeric(6,2),
    "distance_raw_meters" numeric(9,1),
    "distance_filtered_meters" numeric(9,1),
    "rejection_rate" numeric(5,4),
    "gps_stats" "jsonb",
    "objects" "jsonb",
    "filtered_track_points" "jsonb",
    "raw_track_points" "jsonb",
    "rejected_points" "jsonb",
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."track_engine_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."track_markers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "marker_type" "text" NOT NULL,
    "latitude" double precision,
    "longitude" double precision,
    "accuracy" numeric(6,2),
    "distance_from_start" numeric(9,1),
    "note" "text",
    "audio_url" "text",
    "found" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "material" "text",
    "angle_kind" "text",
    CONSTRAINT "track_markers_angle_kind_check" CHECK (("angle_kind" = ANY (ARRAY['links'::"text", 'rechts'::"text", 'spitz'::"text", 'absatz'::"text"]))),
    CONSTRAINT "track_markers_marker_type_check" CHECK (("marker_type" = ANY (ARRAY['gegenstand'::"text", 'winkel'::"text", 'verleitung'::"text", 'sprachmarker'::"text"]))),
    CONSTRAINT "track_markers_material_check" CHECK (("material" = ANY (ARRAY['stoff'::"text", 'holz'::"text", 'leder'::"text", 'plastik'::"text", 'diverses'::"text"])))
);


ALTER TABLE "public"."track_markers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."track_points" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "accuracy" numeric(6,2),
    "altitude" numeric(8,2),
    "speed" numeric(6,2),
    "heading" numeric(6,2),
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "point_type" "text" DEFAULT 'lay'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."track_points" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."track_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "duration_seconds" integer,
    "distance_meters" numeric(9,1),
    "average_deviation_meters" numeric(6,2),
    "articles_found" integer,
    "run_points" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."track_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."track_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "dog_id" "uuid" NOT NULL,
    "session_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "surface_types" "text"[],
    "terrain_conditions" "text"[],
    "wetter" "text",
    "windrichtung" "text",
    "liegezeit_min" integer,
    "distanz_m" numeric(8,1),
    "dauer_sec" integer,
    "rating" smallint,
    "notizen" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "such_dauer_sec" integer,
    "such_distanz_m" integer,
    CONSTRAINT "track_sessions_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "track_sessions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."track_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trainer_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "bio" "text",
    "specialties" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "location" "text",
    "website" "text",
    "code" "text" NOT NULL,
    "is_verified" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."trainer_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trainer_umfragen" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trainer_id" "uuid",
    "trainer_name" "text" NOT NULL,
    "training_arten" "text"[] DEFAULT '{}'::"text"[],
    "notiz" "text",
    "status" "text" DEFAULT 'offen'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "trainer_umfragen_status_check" CHECK (("status" = ANY (ARRAY['offen'::"text", 'abgeschlossen'::"text"])))
);


ALTER TABLE "public"."trainer_umfragen" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_analysis" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "dog_id" "uuid" NOT NULL,
    "gesamtscore" numeric(5,2),
    "zusammenfassung" "text",
    "positives" "text"[] DEFAULT '{}'::"text"[],
    "schwaechen" "text"[] DEFAULT '{}'::"text"[],
    "empfehlungen" "text"[] DEFAULT '{}'::"text"[],
    "coach_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."training_analysis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "body" "text",
    "media_url" "text",
    "duration" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "training_comments_kind_check" CHECK (("kind" = ANY (ARRAY['text'::"text", 'voice'::"text", 'video'::"text"])))
);


ALTER TABLE "public"."training_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_embeddings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "training_session_id" "uuid",
    "source_type" "text" NOT NULL,
    "source_id" "uuid",
    "content" "text" NOT NULL,
    "content_summary" "text",
    "embedding" "public"."vector"(384),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "training_embeddings_source_type_check" CHECK (("source_type" = ANY (ARRAY['training_notes'::"text", 'exercise_notes'::"text", 'coach_feedback'::"text", 'voice_transcript'::"text", 'media_description'::"text", 'track_summary'::"text"])))
);


ALTER TABLE "public"."training_embeddings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "discipline" "text" NOT NULL,
    "exercise_name" "text" NOT NULL,
    "rating" smallint,
    "notes" "text",
    "duration_sec" integer,
    "seq_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "training_exercises_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."training_exercises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "training_id" "uuid",
    "type" "text",
    "file_url" "text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."training_media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trainer_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "discipline" "text",
    "notes" "text",
    "steps" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "shared_with" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."training_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_recommendations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "dog_id" "uuid" NOT NULL,
    "typ" "text" NOT NULL,
    "titel" "text" NOT NULL,
    "beschreibung" "text" NOT NULL,
    "prioritaet" smallint DEFAULT 1,
    "aktiv" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."training_recommendations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "dog_id" "uuid" NOT NULL,
    "title" "text",
    "category" "text" NOT NULL,
    "training_type" "text" DEFAULT 'privat'::"text" NOT NULL,
    "trainer_name" "text",
    "session_date" "date" NOT NULL,
    "duration_minutes" integer,
    "rating" integer,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "motivation" smallint,
    "konzentration" smallint,
    "praezision" smallint,
    "ausdauer" smallint,
    "trieblage" smallint,
    "impulskontrolle" smallint,
    "belastung" smallint,
    "ort" "text",
    "wetter" "text",
    "audio_urls" "text"[] DEFAULT '{}'::"text"[],
    "video_url" "text",
    "photo_urls" "text"[] DEFAULT '{}'::"text"[],
    "score" integer,
    "type" "text" DEFAULT 'privat'::"text",
    "status" "text" DEFAULT 'completed'::"text",
    "track_data" "jsonb",
    "surface_types" "text"[],
    "terrain_conditions" "text"[],
    "laying_duration_seconds" integer,
    "search_duration_seconds" integer,
    "lying_time_minutes" integer,
    "distance_meters" numeric(9,1),
    "average_deviation_meters" numeric(6,2),
    "gps_quality_average" numeric(6,2),
    "articles_total" integer,
    "articles_found" integer,
    "corners_total" integer,
    "distractions_total" integer,
    "location_name" "text",
    "latitude" double precision,
    "longitude" double precision,
    "temperature" numeric(5,1),
    "weather_condition" "text",
    "wind_speed" numeric(5,1),
    "humidity" integer,
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "duration_seconds" integer,
    CONSTRAINT "training_sessions_ausdauer_check" CHECK ((("ausdauer" >= 1) AND ("ausdauer" <= 5))),
    CONSTRAINT "training_sessions_belastung_check" CHECK ((("belastung" >= 1) AND ("belastung" <= 5))),
    CONSTRAINT "training_sessions_impulskontrolle_check" CHECK ((("impulskontrolle" >= 1) AND ("impulskontrolle" <= 5))),
    CONSTRAINT "training_sessions_konzentration_check" CHECK ((("konzentration" >= 1) AND ("konzentration" <= 5))),
    CONSTRAINT "training_sessions_motivation_check" CHECK ((("motivation" >= 1) AND ("motivation" <= 5))),
    CONSTRAINT "training_sessions_praezision_check" CHECK ((("praezision" >= 1) AND ("praezision" <= 5))),
    CONSTRAINT "training_sessions_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "training_sessions_trieblage_check" CHECK ((("trieblage" >= 1) AND ("trieblage" <= 5)))
);


ALTER TABLE "public"."training_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "dog_id" "uuid" NOT NULL,
    "session_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "duration_sec" integer,
    "rating" smallint,
    "notes" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "score" smallint,
    "photos" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "videos" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "audio_files" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "motivation" smallint,
    "konzentration" smallint,
    "praezision" smallint,
    "ausdauer" smallint,
    "trieblage" smallint,
    "impulskontrolle" smallint,
    "shared_with_trainer" boolean DEFAULT false NOT NULL,
    CONSTRAINT "training_units_ausdauer_check" CHECK ((("ausdauer" >= 1) AND ("ausdauer" <= 5))),
    CONSTRAINT "training_units_impulskontrolle_check" CHECK ((("impulskontrolle" >= 1) AND ("impulskontrolle" <= 5))),
    CONSTRAINT "training_units_konzentration_check" CHECK ((("konzentration" >= 1) AND ("konzentration" <= 5))),
    CONSTRAINT "training_units_motivation_check" CHECK ((("motivation" >= 1) AND ("motivation" <= 5))),
    CONSTRAINT "training_units_praezision_check" CHECK ((("praezision" >= 1) AND ("praezision" <= 5))),
    CONSTRAINT "training_units_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "training_units_score_check" CHECK ((("score" >= 1) AND ("score" <= 10))),
    CONSTRAINT "training_units_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text"]))),
    CONSTRAINT "training_units_trieblage_check" CHECK ((("trieblage" >= 1) AND ("trieblage" <= 5)))
);


ALTER TABLE "public"."training_units" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trainings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "title" "text",
    "training_date" timestamp without time zone,
    "type" "text",
    "trainer_name" "text",
    "notes" "text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "video_url" "text",
    "audio_urls" "text"[] DEFAULT '{}'::"text"[]
);


ALTER TABLE "public"."trainings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."umfrage_antworten" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "termin_id" "uuid",
    "umfrage_id" "uuid",
    "user_id" "uuid",
    "antwort" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "umfrage_antworten_antwort_check" CHECK (("antwort" = ANY (ARRAY['ja'::"text", 'evtl'::"text", 'nein'::"text"])))
);


ALTER TABLE "public"."umfrage_antworten" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."umfrage_einladungen" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "umfrage_id" "uuid",
    "user_id" "uuid",
    "gesehen" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."umfrage_einladungen" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."umfrage_termine" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "umfrage_id" "uuid",
    "datum" "date" NOT NULL,
    "uhrzeit_von" time without time zone NOT NULL,
    "uhrzeit_bis" time without time zone NOT NULL,
    "ort" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."umfrage_termine" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_capabilities" (
    "user_id" "uuid" NOT NULL,
    "pro_member" boolean DEFAULT false NOT NULL,
    "trainer_module" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_capabilities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."voice_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "training_session_id" "uuid",
    "training_unit_id" "uuid",
    "dog_id" "uuid",
    "marker_id" "uuid",
    "coach_feedback_id" "uuid",
    "context" "text" NOT NULL,
    "audio_url" "text" NOT NULL,
    "duration_seconds" integer,
    "transcript" "text",
    "transcript_status" "text" DEFAULT 'pending'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "voice_notes_context_check" CHECK (("context" = ANY (ARRAY['training_note'::"text", 'exercise_note'::"text", 'track_marker'::"text", 'coach_feedback'::"text", 'general_note'::"text"]))),
    CONSTRAINT "voice_notes_transcript_status_check" CHECK (("transcript_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."voice_notes" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ai_insights"
    ADD CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_relationships"
    ADD CONSTRAINT "coach_relationships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_relationships"
    ADD CONSTRAINT "coach_relationships_trainer_id_client_id_key" UNIQUE ("trainer_id", "client_id");



ALTER TABLE ONLY "public"."connection_chats"
    ADD CONSTRAINT "connection_chats_connection_id_key" UNIQUE ("connection_id");



ALTER TABLE ONLY "public"."connection_chats"
    ADD CONSTRAINT "connection_chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."connection_invites"
    ADD CONSTRAINT "connection_invites_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."connection_invites"
    ADD CONSTRAINT "connection_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."connection_messages"
    ADD CONSTRAINT "connection_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."connection_permissions"
    ADD CONSTRAINT "connection_permissions_connection_id_key" UNIQUE ("connection_id");



ALTER TABLE ONLY "public"."connection_permissions"
    ADD CONSTRAINT "connection_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."connections"
    ADD CONSTRAINT "connections_owner_user_id_connected_user_id_connection_type_key" UNIQUE ("owner_user_id", "connected_user_id", "connection_type");



ALTER TABLE ONLY "public"."connections"
    ADD CONSTRAINT "connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_categories"
    ADD CONSTRAINT "custom_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dog_documents"
    ADD CONSTRAINT "dog_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dog_goals"
    ADD CONSTRAINT "dog_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dog_health_entries"
    ADD CONSTRAINT "dog_health_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dog_heat_cycles"
    ADD CONSTRAINT "dog_heat_cycles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dog_vet_appointments"
    ADD CONSTRAINT "dog_vet_appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dogs"
    ADD CONSTRAINT "dogs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."founder_slots"
    ADD CONSTRAINT "founder_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."founder_slots"
    ADD CONSTRAINT "founder_slots_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shared_trainings"
    ADD CONSTRAINT "shared_trainings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shared_trainings"
    ADD CONSTRAINT "shared_trainings_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."track_articles"
    ADD CONSTRAINT "track_articles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."track_engine_sessions"
    ADD CONSTRAINT "track_engine_sessions_pkey" PRIMARY KEY ("session_id");



ALTER TABLE ONLY "public"."track_markers"
    ADD CONSTRAINT "track_markers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."track_points"
    ADD CONSTRAINT "track_points_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."track_runs"
    ADD CONSTRAINT "track_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."track_sessions"
    ADD CONSTRAINT "track_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trainer_profiles"
    ADD CONSTRAINT "trainer_profiles_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."trainer_profiles"
    ADD CONSTRAINT "trainer_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trainer_profiles"
    ADD CONSTRAINT "trainer_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."trainer_umfragen"
    ADD CONSTRAINT "trainer_umfragen_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_analysis"
    ADD CONSTRAINT "training_analysis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_comments"
    ADD CONSTRAINT "training_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_embeddings"
    ADD CONSTRAINT "training_embeddings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_exercises"
    ADD CONSTRAINT "training_exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_media"
    ADD CONSTRAINT "training_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_plans"
    ADD CONSTRAINT "training_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_recommendations"
    ADD CONSTRAINT "training_recommendations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_sessions"
    ADD CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_units"
    ADD CONSTRAINT "training_units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trainings"
    ADD CONSTRAINT "trainings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."umfrage_antworten"
    ADD CONSTRAINT "umfrage_antworten_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."umfrage_antworten"
    ADD CONSTRAINT "umfrage_antworten_termin_id_user_id_key" UNIQUE ("termin_id", "user_id");



ALTER TABLE ONLY "public"."umfrage_einladungen"
    ADD CONSTRAINT "umfrage_einladungen_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."umfrage_termine"
    ADD CONSTRAINT "umfrage_termine_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_capabilities"
    ADD CONSTRAINT "user_capabilities_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."voice_notes"
    ADD CONSTRAINT "voice_notes_pkey" PRIMARY KEY ("id");



CREATE INDEX "ai_insights_dog_idx" ON "public"."ai_insights" USING "btree" ("dog_id");



CREATE INDEX "ai_insights_user_idx" ON "public"."ai_insights" USING "btree" ("user_id");



CREATE INDEX "calendar_events_owner_start_idx" ON "public"."calendar_events" USING "btree" ("owner_id", "start_at");



CREATE INDEX "connection_invites_trainer_idx" ON "public"."connection_invites" USING "btree" ("trainer_id");



CREATE INDEX "connection_messages_chat_idx" ON "public"."connection_messages" USING "btree" ("chat_id", "created_at");



CREATE UNIQUE INDEX "connection_messages_legacy_idx" ON "public"."connection_messages" USING "btree" ("legacy_message_id") WHERE ("legacy_message_id" IS NOT NULL);



CREATE INDEX "connections_connected_idx" ON "public"."connections" USING "btree" ("connected_user_id");



CREATE INDEX "connections_owner_idx" ON "public"."connections" USING "btree" ("owner_user_id");



CREATE INDEX "dog_documents_dog_kind_idx" ON "public"."dog_documents" USING "btree" ("dog_id", "kind");



CREATE INDEX "dog_goals_dog_active_idx" ON "public"."dog_goals" USING "btree" ("dog_id", "is_active");



CREATE INDEX "dog_health_dog_date_idx" ON "public"."dog_health_entries" USING "btree" ("dog_id", "entry_date" DESC);



CREATE INDEX "dog_heat_dog_start_idx" ON "public"."dog_heat_cycles" USING "btree" ("dog_id", "start_date" DESC);



CREATE INDEX "dog_vet_dog_at_idx" ON "public"."dog_vet_appointments" USING "btree" ("dog_id", "appointment_at");



CREATE INDEX "dogs_owner_favorite_idx" ON "public"."dogs" USING "btree" ("owner_id", "is_favorite");



CREATE INDEX "idx_coach_rel_client" ON "public"."coach_relationships" USING "btree" ("client_id");



CREATE INDEX "idx_coach_rel_trainer" ON "public"."coach_relationships" USING "btree" ("trainer_id");



CREATE INDEX "idx_custom_categories_owner" ON "public"."custom_categories" USING "btree" ("owner_id");



CREATE INDEX "idx_track_articles_track" ON "public"."track_articles" USING "btree" ("track_id");



CREATE INDEX "idx_track_sessions_date" ON "public"."track_sessions" USING "btree" ("session_date" DESC);



CREATE INDEX "idx_track_sessions_dog" ON "public"."track_sessions" USING "btree" ("dog_id");



CREATE INDEX "idx_track_sessions_owner" ON "public"."track_sessions" USING "btree" ("owner_id");



CREATE INDEX "idx_trainer_profiles_code" ON "public"."trainer_profiles" USING "btree" ("code");



CREATE INDEX "idx_trainer_profiles_user" ON "public"."trainer_profiles" USING "btree" ("user_id");



CREATE INDEX "idx_training_analysis_dog" ON "public"."training_analysis" USING "btree" ("dog_id", "created_at" DESC);



CREATE INDEX "idx_training_comments_unit" ON "public"."training_comments" USING "btree" ("unit_id", "created_at");



CREATE INDEX "idx_training_exercises_unit" ON "public"."training_exercises" USING "btree" ("unit_id", "seq_index");



CREATE INDEX "idx_training_sessions_dog_date" ON "public"."training_sessions" USING "btree" ("dog_id", "session_date" DESC);



CREATE INDEX "idx_training_units_date" ON "public"."training_units" USING "btree" ("session_date" DESC);



CREATE INDEX "idx_training_units_dog" ON "public"."training_units" USING "btree" ("dog_id");



CREATE INDEX "idx_training_units_owner" ON "public"."training_units" USING "btree" ("owner_id");



CREATE INDEX "messages_pair_idx" ON "public"."messages" USING "btree" ("sender_id", "recipient_id", "created_at" DESC);



CREATE INDEX "messages_recipient_idx" ON "public"."messages" USING "btree" ("recipient_id", "created_at" DESC);



CREATE INDEX "track_markers_session_idx" ON "public"."track_markers" USING "btree" ("session_id");



CREATE INDEX "track_points_session_idx" ON "public"."track_points" USING "btree" ("session_id", "timestamp");



CREATE INDEX "track_runs_session_idx" ON "public"."track_runs" USING "btree" ("session_id");



CREATE INDEX "training_embeddings_embedding_idx" ON "public"."training_embeddings" USING "ivfflat" ("embedding" "public"."vector_cosine_ops") WITH ("lists"='100');



CREATE INDEX "training_embeddings_session_id_idx" ON "public"."training_embeddings" USING "btree" ("training_session_id");



CREATE INDEX "training_embeddings_source_type_idx" ON "public"."training_embeddings" USING "btree" ("source_type");



CREATE UNIQUE INDEX "training_embeddings_source_uidx" ON "public"."training_embeddings" USING "btree" ("user_id", "source_type", "source_id") WHERE ("source_id" IS NOT NULL);



CREATE INDEX "training_embeddings_user_id_idx" ON "public"."training_embeddings" USING "btree" ("user_id");



CREATE INDEX "training_plans_trainer_idx" ON "public"."training_plans" USING "btree" ("trainer_id");



CREATE INDEX "training_sessions_type_idx" ON "public"."training_sessions" USING "btree" ("type");



CREATE INDEX "voice_notes_session_idx" ON "public"."voice_notes" USING "btree" ("training_session_id");



CREATE INDEX "voice_notes_unit_idx" ON "public"."voice_notes" USING "btree" ("training_unit_id");



CREATE INDEX "voice_notes_user_idx" ON "public"."voice_notes" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "trg_guard_profile_role" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."guard_profile_role"();



CREATE OR REPLACE TRIGGER "trg_protect_internal_tester" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_internal_tester_fields"();



CREATE OR REPLACE TRIGGER "trg_training_embeddings_updated_at" BEFORE UPDATE ON "public"."training_embeddings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_voice_notes_updated_at" BEFORE UPDATE ON "public"."voice_notes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."ai_insights"
    ADD CONSTRAINT "ai_insights_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_insights"
    ADD CONSTRAINT "ai_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coach_relationships"
    ADD CONSTRAINT "coach_relationships_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_relationships"
    ADD CONSTRAINT "coach_relationships_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."connection_chats"
    ADD CONSTRAINT "connection_chats_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."connection_invites"
    ADD CONSTRAINT "connection_invites_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."connection_messages"
    ADD CONSTRAINT "connection_messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."connection_chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."connection_messages"
    ADD CONSTRAINT "connection_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."connection_permissions"
    ADD CONSTRAINT "connection_permissions_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."connections"
    ADD CONSTRAINT "connections_connected_user_id_fkey" FOREIGN KEY ("connected_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."connections"
    ADD CONSTRAINT "connections_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."custom_categories"
    ADD CONSTRAINT "custom_categories_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dog_documents"
    ADD CONSTRAINT "dog_documents_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dog_documents"
    ADD CONSTRAINT "dog_documents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dog_goals"
    ADD CONSTRAINT "dog_goals_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dog_goals"
    ADD CONSTRAINT "dog_goals_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dog_health_entries"
    ADD CONSTRAINT "dog_health_entries_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dog_health_entries"
    ADD CONSTRAINT "dog_health_entries_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dog_heat_cycles"
    ADD CONSTRAINT "dog_heat_cycles_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dog_heat_cycles"
    ADD CONSTRAINT "dog_heat_cycles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dog_vet_appointments"
    ADD CONSTRAINT "dog_vet_appointments_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dog_vet_appointments"
    ADD CONSTRAINT "dog_vet_appointments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dogs"
    ADD CONSTRAINT "dogs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."founder_slots"
    ADD CONSTRAINT "founder_slots_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."founder_slots"
    ADD CONSTRAINT "founder_slots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shared_trainings"
    ADD CONSTRAINT "shared_trainings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shared_trainings"
    ADD CONSTRAINT "shared_trainings_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "public"."trainings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."track_articles"
    ADD CONSTRAINT "track_articles_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."track_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."track_engine_sessions"
    ADD CONSTRAINT "track_engine_sessions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."training_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."track_markers"
    ADD CONSTRAINT "track_markers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."training_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."track_points"
    ADD CONSTRAINT "track_points_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."training_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."track_runs"
    ADD CONSTRAINT "track_runs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."training_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."track_sessions"
    ADD CONSTRAINT "track_sessions_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."track_sessions"
    ADD CONSTRAINT "track_sessions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trainer_profiles"
    ADD CONSTRAINT "trainer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trainer_umfragen"
    ADD CONSTRAINT "trainer_umfragen_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."training_analysis"
    ADD CONSTRAINT "training_analysis_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_analysis"
    ADD CONSTRAINT "training_analysis_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."training_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_analysis"
    ADD CONSTRAINT "training_analysis_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_comments"
    ADD CONSTRAINT "training_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_comments"
    ADD CONSTRAINT "training_comments_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."training_units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_embeddings"
    ADD CONSTRAINT "training_embeddings_training_session_id_fkey" FOREIGN KEY ("training_session_id") REFERENCES "public"."training_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_embeddings"
    ADD CONSTRAINT "training_embeddings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_exercises"
    ADD CONSTRAINT "training_exercises_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."training_units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_media"
    ADD CONSTRAINT "training_media_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "public"."trainings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_plans"
    ADD CONSTRAINT "training_plans_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_recommendations"
    ADD CONSTRAINT "training_recommendations_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_recommendations"
    ADD CONSTRAINT "training_recommendations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_sessions"
    ADD CONSTRAINT "training_sessions_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_sessions"
    ADD CONSTRAINT "training_sessions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_units"
    ADD CONSTRAINT "training_units_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_units"
    ADD CONSTRAINT "training_units_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."umfrage_antworten"
    ADD CONSTRAINT "umfrage_antworten_termin_id_fkey" FOREIGN KEY ("termin_id") REFERENCES "public"."umfrage_termine"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."umfrage_antworten"
    ADD CONSTRAINT "umfrage_antworten_umfrage_id_fkey" FOREIGN KEY ("umfrage_id") REFERENCES "public"."trainer_umfragen"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."umfrage_antworten"
    ADD CONSTRAINT "umfrage_antworten_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."umfrage_einladungen"
    ADD CONSTRAINT "umfrage_einladungen_umfrage_id_fkey" FOREIGN KEY ("umfrage_id") REFERENCES "public"."trainer_umfragen"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."umfrage_einladungen"
    ADD CONSTRAINT "umfrage_einladungen_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."umfrage_termine"
    ADD CONSTRAINT "umfrage_termine_umfrage_id_fkey" FOREIGN KEY ("umfrage_id") REFERENCES "public"."trainer_umfragen"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_capabilities"
    ADD CONSTRAINT "user_capabilities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."voice_notes"
    ADD CONSTRAINT "voice_notes_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "public"."dogs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."voice_notes"
    ADD CONSTRAINT "voice_notes_training_session_id_fkey" FOREIGN KEY ("training_session_id") REFERENCES "public"."training_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."voice_notes"
    ADD CONSTRAINT "voice_notes_training_unit_id_fkey" FOREIGN KEY ("training_unit_id") REFERENCES "public"."training_units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."voice_notes"
    ADD CONSTRAINT "voice_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "All manage termine" ON "public"."umfrage_termine" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "All see antworten" ON "public"."umfrage_antworten" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "All see einladungen" ON "public"."umfrage_einladungen" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow insert for authenticated users" ON "public"."dogs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Invited users see umfragen" ON "public"."trainer_umfragen" FOR SELECT TO "authenticated" USING (("id" IN ( SELECT "umfrage_einladungen"."umfrage_id"
   FROM "public"."umfrage_einladungen"
  WHERE ("umfrage_einladungen"."user_id" = "auth"."uid"()))));



CREATE POLICY "Owner manages shares" ON "public"."shared_trainings" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "Public can read by token" ON "public"."shared_trainings" FOR SELECT TO "anon" USING (("expires_at" > "now"()));



CREATE POLICY "Trainer manage own umfragen" ON "public"."trainer_umfragen" TO "authenticated" USING (("trainer_id" = "auth"."uid"())) WITH CHECK (("trainer_id" = "auth"."uid"()));



CREATE POLICY "Users can delete own dogs" ON "public"."dogs" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can delete own training sessions" ON "public"."training_sessions" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own dogs" ON "public"."dogs" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own training sessions" ON "public"."training_sessions" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can select own dogs" ON "public"."dogs" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can update own dogs" ON "public"."dogs" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can update own training sessions" ON "public"."training_sessions" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can view own training sessions" ON "public"."training_sessions" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users insert own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "Users manage own antworten" ON "public"."umfrage_antworten" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users read own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "Users update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."ai_insights" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "calendar_delete" ON "public"."calendar_events" FOR DELETE USING ((("owner_id" = "auth"."uid"()) OR ("created_by" = "auth"."uid"())));



ALTER TABLE "public"."calendar_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "calendar_insert" ON "public"."calendar_events" FOR INSERT WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "calendar_select" ON "public"."calendar_events" FOR SELECT USING ((("owner_id" = "auth"."uid"()) OR ("created_by" = "auth"."uid"()) OR ("trainer_id" = "auth"."uid"())));



CREATE POLICY "calendar_update" ON "public"."calendar_events" FOR UPDATE USING ((("owner_id" = "auth"."uid"()) OR ("created_by" = "auth"."uid"()) OR ("trainer_id" = "auth"."uid"())));



CREATE POLICY "clients read shared plans" ON "public"."training_plans" FOR SELECT TO "authenticated" USING (("auth"."uid"() = ANY ("shared_with")));



CREATE POLICY "coach_rel_delete" ON "public"."coach_relationships" FOR DELETE USING ((("trainer_id" = "auth"."uid"()) OR ("client_id" = "auth"."uid"())));



CREATE POLICY "coach_rel_insert" ON "public"."coach_relationships" FOR INSERT WITH CHECK (("client_id" = "auth"."uid"()));



CREATE POLICY "coach_rel_select" ON "public"."coach_relationships" FOR SELECT USING ((("trainer_id" = "auth"."uid"()) OR ("client_id" = "auth"."uid"())));



CREATE POLICY "coach_rel_update" ON "public"."coach_relationships" FOR UPDATE USING ((("trainer_id" = "auth"."uid"()) OR ("client_id" = "auth"."uid"()))) WITH CHECK ((("trainer_id" = "auth"."uid"()) OR ("client_id" = "auth"."uid"())));



ALTER TABLE "public"."coach_relationships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comments_delete" ON "public"."training_comments" FOR DELETE USING (("author_id" = "auth"."uid"()));



CREATE POLICY "comments_insert" ON "public"."training_comments" FOR INSERT WITH CHECK ((("author_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."training_units" "tu"
  WHERE (("tu"."id" = "training_comments"."unit_id") AND (("tu"."owner_id" = "auth"."uid"()) OR ("tu"."shared_with_trainer" AND "public"."is_active_coach"("tu"."owner_id"))))))));



CREATE POLICY "comments_select" ON "public"."training_comments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."training_units" "tu"
  WHERE (("tu"."id" = "training_comments"."unit_id") AND (("tu"."owner_id" = "auth"."uid"()) OR ("tu"."shared_with_trainer" AND "public"."is_active_coach"("tu"."owner_id")))))));



ALTER TABLE "public"."connection_chats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."connection_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."connection_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."connection_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."connections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "create connection" ON "public"."connections" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "owner_user_id") OR ("auth"."uid"() = "connected_user_id")));



CREATE POLICY "create connection chats" ON "public"."connection_chats" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."connections" "c"
  WHERE (("c"."id" = "connection_chats"."connection_id") AND (("auth"."uid"() = "c"."owner_user_id") OR ("auth"."uid"() = "c"."connected_user_id"))))));



ALTER TABLE "public"."custom_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delete own connection" ON "public"."connections" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "owner_user_id") OR ("auth"."uid"() = "connected_user_id")));



ALTER TABLE "public"."dog_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dog_documents_delete" ON "public"."dog_documents" FOR DELETE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "dog_documents_insert" ON "public"."dog_documents" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "dog_documents_select" ON "public"."dog_documents" FOR SELECT USING ((("owner_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."connections" "c"
  WHERE (("c"."owner_user_id" = "dog_documents"."owner_id") AND ("c"."connected_user_id" = "auth"."uid"()) AND ("c"."status" = 'accepted'::"text"))))));



CREATE POLICY "dog_documents_update" ON "public"."dog_documents" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."dog_goals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dog_goals_delete" ON "public"."dog_goals" FOR DELETE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "dog_goals_insert" ON "public"."dog_goals" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "dog_goals_select" ON "public"."dog_goals" FOR SELECT USING ((("owner_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."connections" "c"
  WHERE (("c"."owner_user_id" = "dog_goals"."owner_id") AND ("c"."connected_user_id" = "auth"."uid"()) AND ("c"."status" = 'accepted'::"text"))))));



CREATE POLICY "dog_goals_update" ON "public"."dog_goals" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."dog_health_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dog_health_entries_delete" ON "public"."dog_health_entries" FOR DELETE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "dog_health_entries_insert" ON "public"."dog_health_entries" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "dog_health_entries_select" ON "public"."dog_health_entries" FOR SELECT USING ((("owner_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."connections" "c"
  WHERE (("c"."owner_user_id" = "dog_health_entries"."owner_id") AND ("c"."connected_user_id" = "auth"."uid"()) AND ("c"."status" = 'accepted'::"text"))))));



CREATE POLICY "dog_health_entries_update" ON "public"."dog_health_entries" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."dog_heat_cycles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dog_heat_cycles_delete" ON "public"."dog_heat_cycles" FOR DELETE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "dog_heat_cycles_insert" ON "public"."dog_heat_cycles" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "dog_heat_cycles_select" ON "public"."dog_heat_cycles" FOR SELECT USING ((("owner_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."connections" "c"
  WHERE (("c"."owner_user_id" = "dog_heat_cycles"."owner_id") AND ("c"."connected_user_id" = "auth"."uid"()) AND ("c"."status" = 'accepted'::"text"))))));



CREATE POLICY "dog_heat_cycles_update" ON "public"."dog_heat_cycles" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."dog_vet_appointments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dog_vet_appointments_delete" ON "public"."dog_vet_appointments" FOR DELETE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "dog_vet_appointments_insert" ON "public"."dog_vet_appointments" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "dog_vet_appointments_select" ON "public"."dog_vet_appointments" FOR SELECT USING ((("owner_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."connections" "c"
  WHERE (("c"."owner_user_id" = "dog_vet_appointments"."owner_id") AND ("c"."connected_user_id" = "auth"."uid"()) AND ("c"."status" = 'accepted'::"text"))))));



CREATE POLICY "dog_vet_appointments_update" ON "public"."dog_vet_appointments" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."dogs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."founder_slots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mark connection messages read" ON "public"."connection_messages" FOR UPDATE TO "authenticated" USING ((("sender_id" <> "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."connection_chats" "ch"
     JOIN "public"."connections" "c" ON (("c"."id" = "ch"."connection_id")))
  WHERE (("ch"."id" = "connection_messages"."chat_id") AND (("auth"."uid"() = "c"."owner_user_id") OR ("auth"."uid"() = "c"."connected_user_id"))))))) WITH CHECK ((("sender_id" <> "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."connection_chats" "ch"
     JOIN "public"."connections" "c" ON (("c"."id" = "ch"."connection_id")))
  WHERE (("ch"."id" = "connection_messages"."chat_id") AND (("auth"."uid"() = "c"."owner_user_id") OR ("auth"."uid"() = "c"."connected_user_id")))))));



CREATE POLICY "mark read" ON "public"."messages" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "recipient_id")) WITH CHECK (("auth"."uid"() = "recipient_id"));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "own embeddings delete" ON "public"."training_embeddings" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "own embeddings insert" ON "public"."training_embeddings" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own embeddings select" ON "public"."training_embeddings" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "own embeddings update" ON "public"."training_embeddings" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own founder slot" ON "public"."founder_slots" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "own insights delete" ON "public"."ai_insights" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "own insights insert" ON "public"."ai_insights" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own insights select" ON "public"."ai_insights" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "own insights update" ON "public"."ai_insights" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own subscription" ON "public"."subscriptions" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own voice_notes delete" ON "public"."voice_notes" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "own voice_notes insert" ON "public"."voice_notes" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own voice_notes select" ON "public"."voice_notes" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "own voice_notes update" ON "public"."voice_notes" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "own_analysis" ON "public"."training_analysis" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "own_recommendations" ON "public"."training_recommendations" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "owner manages permissions" ON "public"."connection_permissions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."connections" "c"
  WHERE (("c"."id" = "connection_permissions"."connection_id") AND ("auth"."uid"() = "c"."owner_user_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."connections" "c"
  WHERE (("c"."id" = "connection_permissions"."connection_id") AND ("auth"."uid"() = "c"."owner_user_id")))));



CREATE POLICY "owner via session" ON "public"."track_engine_sessions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."training_sessions" "s"
  WHERE (("s"."id" = "track_engine_sessions"."session_id") AND ("s"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."training_sessions" "s"
  WHERE (("s"."id" = "track_engine_sessions"."session_id") AND ("s"."owner_id" = "auth"."uid"())))));



CREATE POLICY "owner via session" ON "public"."track_markers" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."training_sessions" "s"
  WHERE (("s"."id" = "track_markers"."session_id") AND ("s"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."training_sessions" "s"
  WHERE (("s"."id" = "track_markers"."session_id") AND ("s"."owner_id" = "auth"."uid"())))));



CREATE POLICY "owner via session" ON "public"."track_points" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."training_sessions" "s"
  WHERE (("s"."id" = "track_points"."session_id") AND ("s"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."training_sessions" "s"
  WHERE (("s"."id" = "track_points"."session_id") AND ("s"."owner_id" = "auth"."uid"())))));



CREATE POLICY "owner via session" ON "public"."track_runs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."training_sessions" "s"
  WHERE (("s"."id" = "track_runs"."session_id") AND ("s"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."training_sessions" "s"
  WHERE (("s"."id" = "track_runs"."session_id") AND ("s"."owner_id" = "auth"."uid"())))));



CREATE POLICY "owner_custom_categories" ON "public"."custom_categories" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "owner_track_articles" ON "public"."track_articles" USING ((EXISTS ( SELECT 1
   FROM "public"."track_sessions"
  WHERE (("track_sessions"."id" = "track_articles"."track_id") AND ("track_sessions"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."track_sessions"
  WHERE (("track_sessions"."id" = "track_articles"."track_id") AND ("track_sessions"."owner_id" = "auth"."uid"())))));



CREATE POLICY "owner_track_sessions" ON "public"."track_sessions" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "owner_training_exercises" ON "public"."training_exercises" USING ((EXISTS ( SELECT 1
   FROM "public"."training_units"
  WHERE (("training_units"."id" = "training_exercises"."unit_id") AND ("training_units"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."training_units"
  WHERE (("training_units"."id" = "training_exercises"."unit_id") AND ("training_units"."owner_id" = "auth"."uid"())))));



CREATE POLICY "owner_training_units" ON "public"."training_units" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read connection chats" ON "public"."connection_chats" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."connections" "c"
  WHERE (("c"."id" = "connection_chats"."connection_id") AND (("auth"."uid"() = "c"."owner_user_id") OR ("auth"."uid"() = "c"."connected_user_id"))))));



CREATE POLICY "read connection messages" ON "public"."connection_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."connection_chats" "ch"
     JOIN "public"."connections" "c" ON (("c"."id" = "ch"."connection_id")))
  WHERE (("ch"."id" = "connection_messages"."chat_id") AND (("auth"."uid"() = "c"."owner_user_id") OR ("auth"."uid"() = "c"."connected_user_id"))))));



CREATE POLICY "read connection permissions" ON "public"."connection_permissions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."connections" "c"
  WHERE (("c"."id" = "connection_permissions"."connection_id") AND (("auth"."uid"() = "c"."owner_user_id") OR ("auth"."uid"() = "c"."connected_user_id"))))));



CREATE POLICY "read own capabilities" ON "public"."user_capabilities" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "read own connections" ON "public"."connections" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "owner_user_id") OR ("auth"."uid"() = "connected_user_id")));



CREATE POLICY "read own messages" ON "public"."messages" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "recipient_id")));



CREATE POLICY "read_trainer_directory" ON "public"."profiles" FOR SELECT USING (("role" = 'trainer'::"text"));



CREATE POLICY "send connection messages" ON "public"."connection_messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."connection_chats" "ch"
     JOIN "public"."connections" "c" ON (("c"."id" = "ch"."connection_id")))
  WHERE (("ch"."id" = "connection_messages"."chat_id") AND (("auth"."uid"() = "c"."owner_user_id") OR ("auth"."uid"() = "c"."connected_user_id")))))));



CREATE POLICY "send messages" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "sender_id"));



ALTER TABLE "public"."shared_trainings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."track_articles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."track_engine_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."track_markers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."track_points" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."track_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."track_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trainer comments on client trainings" ON "public"."training_comments" FOR INSERT TO "authenticated" WITH CHECK ((("author_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."training_units" "u"
  WHERE (("u"."id" = "training_comments"."unit_id") AND "public"."can_view"("auth"."uid"(), "u"."owner_id", 'view_trainings'::"text"))))));



CREATE POLICY "trainer manage plans" ON "public"."training_plans" TO "authenticated" USING (("trainer_id" = "auth"."uid"())) WITH CHECK (("trainer_id" = "auth"."uid"()));



CREATE POLICY "trainer manages invites" ON "public"."connection_invites" TO "authenticated" USING (("trainer_id" = "auth"."uid"())) WITH CHECK (("trainer_id" = "auth"."uid"()));



CREATE POLICY "trainer views client appointments" ON "public"."calendar_events" FOR SELECT TO "authenticated" USING ("public"."can_view"("auth"."uid"(), "owner_id", 'view_appointments'::"text"));



CREATE POLICY "trainer views client comments" ON "public"."training_comments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."training_units" "u"
  WHERE (("u"."id" = "training_comments"."unit_id") AND "public"."can_view"("auth"."uid"(), "u"."owner_id", 'view_trainings'::"text")))));



CREATE POLICY "trainer views client dogs" ON "public"."dogs" FOR SELECT TO "authenticated" USING ("public"."can_view"("auth"."uid"(), "owner_id", 'view_dogs'::"text"));



CREATE POLICY "trainer views client embeddings" ON "public"."training_embeddings" FOR SELECT TO "authenticated" USING ("public"."can_view"("auth"."uid"(), "user_id", 'view_trainings'::"text"));



CREATE POLICY "trainer views client exercises" ON "public"."training_exercises" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."training_units" "u"
  WHERE (("u"."id" = "training_exercises"."unit_id") AND "public"."can_view"("auth"."uid"(), "u"."owner_id", 'view_trainings'::"text")))));



CREATE POLICY "trainer views client trainings" ON "public"."training_units" FOR SELECT TO "authenticated" USING ("public"."can_view"("auth"."uid"(), "owner_id", 'view_trainings'::"text"));



CREATE POLICY "trainer views client voice_notes" ON "public"."voice_notes" FOR SELECT TO "authenticated" USING ("public"."can_view"("auth"."uid"(), "user_id", 'view_trainings'::"text"));



ALTER TABLE "public"."trainer_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trainer_profiles_select" ON "public"."trainer_profiles" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "trainer_profiles_write" ON "public"."trainer_profiles" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "trainer_read_client_dogs" ON "public"."dogs" FOR SELECT USING ("public"."is_active_coach"("owner_id"));



CREATE POLICY "trainer_read_client_profile" ON "public"."profiles" FOR SELECT USING ("public"."coach_link_exists"("id"));



CREATE POLICY "trainer_read_shared_exercises" ON "public"."training_exercises" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."training_units" "tu"
  WHERE (("tu"."id" = "training_exercises"."unit_id") AND ("tu"."shared_with_trainer" = true) AND "public"."is_active_coach"("tu"."owner_id")))));



CREATE POLICY "trainer_read_shared_units" ON "public"."training_units" FOR SELECT USING ((("shared_with_trainer" = true) AND "public"."is_active_coach"("owner_id")));



ALTER TABLE "public"."trainer_umfragen" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_analysis" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_embeddings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_exercises" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_media" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_recommendations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_units" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trainings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."umfrage_antworten" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."umfrage_einladungen" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."umfrage_termine" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "update own capabilities" ON "public"."user_capabilities" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "update own connection" ON "public"."connections" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "owner_user_id") OR ("auth"."uid"() = "connected_user_id"))) WITH CHECK ((("auth"."uid"() = "owner_user_id") OR ("auth"."uid"() = "connected_user_id")));



CREATE POLICY "upsert own capabilities" ON "public"."user_capabilities" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_capabilities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."voice_notes" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view"("p_viewer" "uuid", "p_owner" "uuid", "p_perm" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view"("p_viewer" "uuid", "p_owner" "uuid", "p_perm" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view"("p_viewer" "uuid", "p_owner" "uuid", "p_perm" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_founder_slot"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_founder_slot"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_founder_slot"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."coach_link_exists"("client" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."coach_link_exists"("client" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."coach_link_exists"("client" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."founder_slot_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."founder_slot_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."founder_slot_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."founder_slots_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."founder_slots_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."founder_slots_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_profile_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_profile_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_profile_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_active_coach"("client" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_active_coach"("client" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_coach"("client" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."match_training_embeddings"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "filter_user_id" "uuid", "filter_dog_id" "uuid", "filter_category" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."match_training_embeddings"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "filter_user_id" "uuid", "filter_dog_id" "uuid", "filter_category" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_training_embeddings"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "filter_user_id" "uuid", "filter_dog_id" "uuid", "filter_category" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_internal_tester_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_internal_tester_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_internal_tester_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."redeem_connection_invite"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."redeem_connection_invite"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_connection_invite"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."ai_insights" TO "anon";
GRANT ALL ON TABLE "public"."ai_insights" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_insights" TO "service_role";



GRANT ALL ON TABLE "public"."calendar_events" TO "anon";
GRANT ALL ON TABLE "public"."calendar_events" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_events" TO "service_role";



GRANT ALL ON TABLE "public"."coach_relationships" TO "anon";
GRANT ALL ON TABLE "public"."coach_relationships" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_relationships" TO "service_role";



GRANT ALL ON TABLE "public"."connection_chats" TO "anon";
GRANT ALL ON TABLE "public"."connection_chats" TO "authenticated";
GRANT ALL ON TABLE "public"."connection_chats" TO "service_role";



GRANT ALL ON TABLE "public"."connection_invites" TO "anon";
GRANT ALL ON TABLE "public"."connection_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."connection_invites" TO "service_role";



GRANT ALL ON TABLE "public"."connection_messages" TO "anon";
GRANT ALL ON TABLE "public"."connection_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."connection_messages" TO "service_role";



GRANT ALL ON TABLE "public"."connection_permissions" TO "anon";
GRANT ALL ON TABLE "public"."connection_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."connection_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."connections" TO "anon";
GRANT ALL ON TABLE "public"."connections" TO "authenticated";
GRANT ALL ON TABLE "public"."connections" TO "service_role";



GRANT ALL ON TABLE "public"."custom_categories" TO "anon";
GRANT ALL ON TABLE "public"."custom_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_categories" TO "service_role";



GRANT ALL ON TABLE "public"."dog_documents" TO "anon";
GRANT ALL ON TABLE "public"."dog_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."dog_documents" TO "service_role";



GRANT ALL ON TABLE "public"."dog_goals" TO "anon";
GRANT ALL ON TABLE "public"."dog_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."dog_goals" TO "service_role";



GRANT ALL ON TABLE "public"."dog_health_entries" TO "anon";
GRANT ALL ON TABLE "public"."dog_health_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."dog_health_entries" TO "service_role";



GRANT ALL ON TABLE "public"."dog_heat_cycles" TO "anon";
GRANT ALL ON TABLE "public"."dog_heat_cycles" TO "authenticated";
GRANT ALL ON TABLE "public"."dog_heat_cycles" TO "service_role";



GRANT ALL ON TABLE "public"."dog_vet_appointments" TO "anon";
GRANT ALL ON TABLE "public"."dog_vet_appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."dog_vet_appointments" TO "service_role";



GRANT ALL ON TABLE "public"."dogs" TO "anon";
GRANT ALL ON TABLE "public"."dogs" TO "authenticated";
GRANT ALL ON TABLE "public"."dogs" TO "service_role";



GRANT ALL ON TABLE "public"."founder_slots" TO "anon";
GRANT ALL ON TABLE "public"."founder_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."founder_slots" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."shared_trainings" TO "anon";
GRANT ALL ON TABLE "public"."shared_trainings" TO "authenticated";
GRANT ALL ON TABLE "public"."shared_trainings" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."track_articles" TO "anon";
GRANT ALL ON TABLE "public"."track_articles" TO "authenticated";
GRANT ALL ON TABLE "public"."track_articles" TO "service_role";



GRANT ALL ON TABLE "public"."track_engine_sessions" TO "anon";
GRANT ALL ON TABLE "public"."track_engine_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."track_engine_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."track_markers" TO "anon";
GRANT ALL ON TABLE "public"."track_markers" TO "authenticated";
GRANT ALL ON TABLE "public"."track_markers" TO "service_role";



GRANT ALL ON TABLE "public"."track_points" TO "anon";
GRANT ALL ON TABLE "public"."track_points" TO "authenticated";
GRANT ALL ON TABLE "public"."track_points" TO "service_role";



GRANT ALL ON TABLE "public"."track_runs" TO "anon";
GRANT ALL ON TABLE "public"."track_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."track_runs" TO "service_role";



GRANT ALL ON TABLE "public"."track_sessions" TO "anon";
GRANT ALL ON TABLE "public"."track_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."track_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."trainer_profiles" TO "anon";
GRANT ALL ON TABLE "public"."trainer_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."trainer_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."trainer_umfragen" TO "anon";
GRANT ALL ON TABLE "public"."trainer_umfragen" TO "authenticated";
GRANT ALL ON TABLE "public"."trainer_umfragen" TO "service_role";



GRANT ALL ON TABLE "public"."training_analysis" TO "anon";
GRANT ALL ON TABLE "public"."training_analysis" TO "authenticated";
GRANT ALL ON TABLE "public"."training_analysis" TO "service_role";



GRANT ALL ON TABLE "public"."training_comments" TO "anon";
GRANT ALL ON TABLE "public"."training_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."training_comments" TO "service_role";



GRANT ALL ON TABLE "public"."training_embeddings" TO "anon";
GRANT ALL ON TABLE "public"."training_embeddings" TO "authenticated";
GRANT ALL ON TABLE "public"."training_embeddings" TO "service_role";



GRANT ALL ON TABLE "public"."training_exercises" TO "anon";
GRANT ALL ON TABLE "public"."training_exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."training_exercises" TO "service_role";



GRANT ALL ON TABLE "public"."training_media" TO "anon";
GRANT ALL ON TABLE "public"."training_media" TO "authenticated";
GRANT ALL ON TABLE "public"."training_media" TO "service_role";



GRANT ALL ON TABLE "public"."training_plans" TO "anon";
GRANT ALL ON TABLE "public"."training_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."training_plans" TO "service_role";



GRANT ALL ON TABLE "public"."training_recommendations" TO "anon";
GRANT ALL ON TABLE "public"."training_recommendations" TO "authenticated";
GRANT ALL ON TABLE "public"."training_recommendations" TO "service_role";



GRANT ALL ON TABLE "public"."training_sessions" TO "anon";
GRANT ALL ON TABLE "public"."training_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."training_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."training_units" TO "anon";
GRANT ALL ON TABLE "public"."training_units" TO "authenticated";
GRANT ALL ON TABLE "public"."training_units" TO "service_role";



GRANT ALL ON TABLE "public"."trainings" TO "anon";
GRANT ALL ON TABLE "public"."trainings" TO "authenticated";
GRANT ALL ON TABLE "public"."trainings" TO "service_role";



GRANT ALL ON TABLE "public"."umfrage_antworten" TO "anon";
GRANT ALL ON TABLE "public"."umfrage_antworten" TO "authenticated";
GRANT ALL ON TABLE "public"."umfrage_antworten" TO "service_role";



GRANT ALL ON TABLE "public"."umfrage_einladungen" TO "anon";
GRANT ALL ON TABLE "public"."umfrage_einladungen" TO "authenticated";
GRANT ALL ON TABLE "public"."umfrage_einladungen" TO "service_role";



GRANT ALL ON TABLE "public"."umfrage_termine" TO "anon";
GRANT ALL ON TABLE "public"."umfrage_termine" TO "authenticated";
GRANT ALL ON TABLE "public"."umfrage_termine" TO "service_role";



GRANT ALL ON TABLE "public"."user_capabilities" TO "anon";
GRANT ALL ON TABLE "public"."user_capabilities" TO "authenticated";
GRANT ALL ON TABLE "public"."user_capabilities" TO "service_role";



GRANT ALL ON TABLE "public"."voice_notes" TO "anon";
GRANT ALL ON TABLE "public"."voice_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."voice_notes" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







