-- ============================================================================
-- ANYVO LOCAL VERIFY-CENTER ONLY — DO NOT APPLY TO STAGING OR PRODUCTION.
-- Suite training-doku-rating-scale, Phase ROLLBACK: dokumentierter Rückweg
-- (nur Funktion auf Ausgangsdefinition zurücksetzen, Spalte bleibt).
-- Der Runner hat vor dieser Datei die Ausgangsdefinition erneut angewendet.
-- ============================================================================
set local qa.phase = 'rollback';
select pg_temp.as_admin();
select pg_temp.ok('Funktion wieder auf Ausgangsdefinition',
  pg_get_functiondef('public.training_document_v1(text,jsonb)'::regprocedure) !~ 'rating_scale');
select pg_temp.ok('Spalte rating_scale bleibt erhalten', exists(
  select 1 from information_schema.columns where table_schema='public' and table_name='training_exercises' and column_name='rating_scale'));
select pg_temp.ok('Lernstufen-Markierungen bleiben erhalten',
  (select count(*) from public.training_exercises where rating_scale='lernstufe') = (pg_temp.got('lernstufe_rows')#>>'{}')::bigint);

select pg_temp.as_user('a1000000-0000-4000-8000-000000000001');
select pg_temp.rpc('save', pg_temp.old_app_u3(4, 'nach Rückweg'));
select pg_temp.ok('Rückweg: ältere App speichert, Markierung bleibt',
  (select rating_scale || ':' || rating from public.training_exercises where id='13000000-0000-4000-8000-000000000001') = 'lernstufe:4');
select pg_temp.fails('Rückweg: neue App mit rating_scale → INVALID_REQUEST (kein stiller Verlust)', 'save',
  pg_temp.save_req('a1000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-0000000000e3',
    pg_temp.token('a1000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-0000000000e3'), '{}'::jsonb,
    jsonb_build_array(jsonb_build_object('id','13000000-0000-4000-8000-000000000001','discipline','Unterordnung','exercise_name','Sitz','rating',4,'rating_scale','lernstufe','notes',null,'duration_sec',null,'seq_index',0))),
  'INVALID_REQUEST');

select pg_temp.as_admin();
select 'RATING_SCALE_ROLLBACK|PASS|assertions=' || count(*) from qa_assertions where phase = 'rollback';
reset role;
