-- ANYVO Health Foundation: optional source links for calendar projections.
-- No automatic event creation or synchronization is performed here.

alter table public.calendar_events
  add column if not exists source_type text,
  add column if not exists source_id uuid;

alter table public.calendar_events
  drop constraint if exists calendar_events_source_type_check;

alter table public.calendar_events
  add constraint calendar_events_source_type_check
  check (source_type is null or source_type in (
    'health_vaccination',
    'health_parasite_treatment',
    'health_medication',
    'health_vet_visit',
    'health_check'
  ));

create index if not exists calendar_events_health_source_idx
  on public.calendar_events (source_type, source_id)
  where source_type is not null and source_id is not null;

create unique index if not exists calendar_events_owner_health_source_uidx
  on public.calendar_events (owner_id, source_type, source_id)
  where source_type is not null and source_id is not null;
