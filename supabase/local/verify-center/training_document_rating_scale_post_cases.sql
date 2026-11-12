-- ============================================================================
-- ANYVO LOCAL VERIFY-CENTER ONLY — DO NOT APPLY TO STAGING OR PRODUCTION.
-- Suite training-doku-rating-scale, Phase POST (nach der Migration).
-- Setzt PRE voraus (gleiche Transaktion, Hilfsfunktionen in pg_temp).
-- ============================================================================
set local qa.phase = 'post';
select pg_temp.as_admin();

-- Schema
select pg_temp.ok('rating_scale: text, nullable, ohne Default', exists(
  select 1 from information_schema.columns where table_schema='public' and table_name='training_exercises'
   and column_name='rating_scale' and data_type='text' and is_nullable='YES' and column_default is null));
select pg_temp.ok('Check-Constraint vorhanden', exists(
  select 1 from pg_constraint where conname='training_exercises_rating_scale_check'
   and conrelid='public.training_exercises'::regclass and pg_get_constraintdef(oid) ~ 'lernstufe'));
select pg_temp.ok('alte Rating-Prüfung 1–5 unverändert', exists(
  select 1 from pg_constraint where conname='training_exercises_rating_check' and conrelid='public.training_exercises'::regclass));
select pg_temp.ok('RPC übernimmt rating_scale beim Update',
  pg_get_functiondef('public.training_document_v1(text,jsonb)'::regprocedure) ~ 'rating_scale=ex\.rating_scale');
select pg_temp.ok('RPC weiterhin SECURITY DEFINER mit leerem search_path', exists(
  select 1 from pg_proc where oid='public.training_document_v1(text,jsonb)'::regprocedure and prosecdef
   and proconfig @> array['search_path=""']));

-- Kundendatenerhalt
select pg_temp.ok('bestehende Daten unverändert (Prüfsumme aller Alt-Felder + Einheiten)',
  pg_temp.legacy_checksum() = pg_temp.got('checksum_pre')#>>'{}');
select pg_temp.ok('Zeilenanzahl unverändert', (select count(*) from public.training_exercises) = (pg_temp.got('rows_pre')#>>'{}')::bigint);
select pg_temp.ok('keine Umdeutung: alle bestehenden Zeilen rating_scale NULL',
  not exists(select 1 from public.training_exercises where rating_scale is not null));

-- Token
select pg_temp.as_user('a1000000-0000-4000-8000-000000000001');
select pg_temp.put('t1', to_jsonb(pg_temp.token('a1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-0000000000e1')));
select pg_temp.ok('Dokument-Token ändert sich einmalig (to_jsonb enthält neue Spalte)', pg_temp.got('t1') <> pg_temp.got('t0'));
select pg_temp.ok('neuer Token ist stabil', pg_temp.token('a1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-0000000000e1') = pg_temp.got('t1')#>>'{}');
select pg_temp.ok('Laden liefert rating_scale-Schlüssel (NULL) für Altzeilen',
  (select bool_and(x ? 'rating_scale' and x->'rating_scale' = 'null'::jsonb)
     from jsonb_array_elements(pg_temp.doc('a1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-0000000000e1')->'exercises') x));
select pg_temp.fails('offene Bearbeitung mit altem Token → CONFLICT', 'save', pg_temp.save_req(
  'a1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-0000000000e1', pg_temp.got('t0')#>>'{}', '{}'::jsonb,
  jsonb_build_array(jsonb_build_object('id','11000000-0000-4000-8000-000000000002','discipline','Unterordnung','exercise_name','Fuss','rating',5,'notes','neu','duration_sec',null,'seq_index',0))),
  'CONFLICT');
select pg_temp.ok('nach CONFLICT nichts verändert', pg_temp.token('a1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-0000000000e1') = pg_temp.got('t1')#>>'{}');

-- Alte App (sendet nie rating_scale) bearbeitet Sterne-Training weiter.
select pg_temp.rpc('save', pg_temp.save_req('a1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-0000000000e1', pg_temp.got('t1')#>>'{}', '{}'::jsonb,
  jsonb_build_array(
    jsonb_build_object('id','11000000-0000-4000-8000-000000000001','discipline','Fährte','exercise_name','Abgang','rating',3,'notes','nachgetragen','duration_sec',120,'seq_index',0),
    jsonb_build_object('id','11000000-0000-4000-8000-000000000002','discipline','Unterordnung','exercise_name','Fuss','rating',5,'notes','alt','duration_sec',null,'seq_index',1),
    jsonb_build_object('id','11000000-0000-4000-8000-000000000003','discipline','Unterordnung','exercise_name','Platz','rating',null,'notes',null,'duration_sec',null,'seq_index',2))));
select pg_temp.ok('alte App: Sterne-Training bearbeitbar, bleibt Sterne (NULL)',
  (select count(*) from public.training_exercises where unit_id='e1000000-0000-4000-8000-0000000000e1' and rating_scale is null) = 3
  and (select notes from public.training_exercises where id='11000000-0000-4000-8000-000000000001') = 'nachgetragen'
  and (select rating from public.training_exercises where id='11000000-0000-4000-8000-000000000001') = 3);

-- Neue App: Speichern mit Lernstufen (und gemischt mit Sternen).
select pg_temp.put('u3_save', pg_temp.rpc('save', pg_temp.save_req(
  'a1000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-0000000000e3', null,
  jsonb_build_object('dog_id','da000000-0000-4000-8000-0000000000a1','session_date','2026-11-09','status','completed','duration_sec',900),
  jsonb_build_array(
    jsonb_build_object('id','13000000-0000-4000-8000-000000000001','discipline','Unterordnung','exercise_name','Sitz','rating',4,'rating_scale','lernstufe','notes',null,'duration_sec',null,'seq_index',0),
    jsonb_build_object('id','13000000-0000-4000-8000-000000000002','discipline','Unterordnung','exercise_name','Steh','rating',1,'rating_scale','lernstufe','notes',null,'duration_sec',null,'seq_index',1),
    jsonb_build_object('id','13000000-0000-4000-8000-000000000003','discipline','Fährte','exercise_name','Winkel','rating',3,'rating_scale',null,'notes',null,'duration_sec',null,'seq_index',2),
    jsonb_build_object('id','13000000-0000-4000-8000-000000000004','discipline','Fährte','exercise_name','Gegenstand','rating',2,'notes',null,'duration_sec',null,'seq_index',3)))));
select pg_temp.ok('neue App: Lernstufen gespeichert', (select string_agg(coalesce(rating_scale,'-') || ':' || rating, ',' order by seq_index)
  from public.training_exercises where unit_id='e3000000-0000-4000-8000-0000000000e3') = 'lernstufe:4,lernstufe:1,-:3,-:2');
select pg_temp.ok('Laden liefert Lernstufen-Markierung zurück',
  (select string_agg(coalesce(x->>'rating_scale','-'), ',' order by (x->>'seq_index')::int)
     from jsonb_array_elements(pg_temp.doc('a1000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-0000000000e3')->'exercises') x)
  = 'lernstufe,lernstufe,-,-');

-- Neue App: Bearbeiten Lernstufe 4 → 2.
select pg_temp.put('t3', to_jsonb(pg_temp.token('a1000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-0000000000e3')));
select pg_temp.rpc('save', pg_temp.save_req('a1000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-0000000000e3', pg_temp.got('t3')#>>'{}', '{}'::jsonb,
  jsonb_build_array(
    jsonb_build_object('id','13000000-0000-4000-8000-000000000001','discipline','Unterordnung','exercise_name','Sitz','rating',2,'rating_scale','lernstufe','notes',null,'duration_sec',null,'seq_index',0),
    jsonb_build_object('id','13000000-0000-4000-8000-000000000002','discipline','Unterordnung','exercise_name','Steh','rating',1,'rating_scale','lernstufe','notes',null,'duration_sec',null,'seq_index',1),
    jsonb_build_object('id','13000000-0000-4000-8000-000000000003','discipline','Fährte','exercise_name','Winkel','rating',3,'rating_scale',null,'notes',null,'duration_sec',null,'seq_index',2),
    jsonb_build_object('id','13000000-0000-4000-8000-000000000004','discipline','Fährte','exercise_name','Gegenstand','rating',2,'notes',null,'duration_sec',null,'seq_index',3))));
select pg_temp.ok('neue App: Lernstufe bearbeitet (4→2), Markierung bleibt',
  (select rating_scale || ':' || rating from public.training_exercises where id='13000000-0000-4000-8000-000000000001') = 'lernstufe:2');

-- Ältere App bearbeitet Training mit Lernstufen (ohne rating_scale im Request).
create function pg_temp.old_app_u3(sitz_rating int, sitz_notes text) returns jsonb language sql as $$
  select pg_temp.save_req('a1000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-0000000000e3',
    pg_temp.token('a1000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-0000000000e3'), '{}'::jsonb,
    jsonb_build_array(
      jsonb_build_object('id','13000000-0000-4000-8000-000000000001','discipline','Unterordnung','exercise_name','Sitz','rating',sitz_rating,'notes',sitz_notes,'duration_sec',null,'seq_index',0),
      jsonb_build_object('id','13000000-0000-4000-8000-000000000002','discipline','Unterordnung','exercise_name','Steh','rating',1,'notes',null,'duration_sec',null,'seq_index',1),
      jsonb_build_object('id','13000000-0000-4000-8000-000000000003','discipline','Fährte','exercise_name','Winkel','rating',3,'notes',null,'duration_sec',null,'seq_index',2),
      jsonb_build_object('id','13000000-0000-4000-8000-000000000004','discipline','Fährte','exercise_name','Gegenstand','rating',2,'notes',null,'duration_sec',null,'seq_index',3)));
$$;
select pg_temp.rpc('save', pg_temp.old_app_u3(2, 'Notiz aus alter App'));
select pg_temp.ok('ältere App: Markierung bleibt bei Notizänderung',
  (select string_agg(coalesce(rating_scale,'-') || ':' || rating, ',' order by seq_index)
     from public.training_exercises where unit_id='e3000000-0000-4000-8000-0000000000e3') = 'lernstufe:2,lernstufe:1,-:3,-:2'
  and (select notes from public.training_exercises where id='13000000-0000-4000-8000-000000000001') = 'Notiz aus alter App');

select pg_temp.put('t3b', to_jsonb(pg_temp.token('a1000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-0000000000e3')));
select pg_temp.fails('ältere App: "3 Sterne" auf Lernstufen-Übung wird abgelehnt (check_violation)', 'save', pg_temp.old_app_u3(3, 'Notiz aus alter App'), '23514');
select pg_temp.ok('nach Ablehnung nichts teilweise geschrieben',
  pg_temp.token('a1000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-0000000000e3') = pg_temp.got('t3b')#>>'{}');
select pg_temp.info('OLD_APP_RATING_3_ON_LERNSTUFE',
  'Ältere App (Build 57) kann eine Lernstufen-Übung nicht mit 3 Sternen speichern: ganzer Save scheitert mit SQLSTATE 23514 statt eines App-Fehlercodes. Kein Datenverlust, aber Nutzer sieht Speicherfehler.');

select pg_temp.rpc('save', pg_temp.old_app_u3(5, 'Notiz aus alter App'));
select pg_temp.ok('ältere App: 5 Sterne auf Lernstufen-Übung → bleibt lernstufe:5',
  (select rating_scale || ':' || rating from public.training_exercises where id='13000000-0000-4000-8000-000000000001') = 'lernstufe:5');
select pg_temp.info('OLD_APP_STARS_REINTERPRETED',
  'Ältere App zeigt Lernstufen als Sterne an; speichert sie 1/2/4/5 Sterne, wird der Wert als Lernstufe weitergeführt (Markierung bleibt, Bedeutung verschiebt sich).');

-- Ungültige Werte (neue Übungen) – jeweils ganzer Save abgelehnt, nichts geschrieben.
create function pg_temp.new_unit_with(item jsonb) returns jsonb language sql as $$
  select pg_temp.save_req('a1000000-0000-4000-8000-000000000001', gen_random_uuid(), null,
    jsonb_build_object('dog_id','da000000-0000-4000-8000-0000000000a1','session_date','2026-11-09','status','completed'),
    jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'discipline','Unterordnung','exercise_name','X','notes',null,'duration_sec',null,'seq_index',0) || item));
$$;
select pg_temp.put('rows_before_invalid', to_jsonb((select count(*) from public.training_exercises)));
select pg_temp.fails('ungültig: rating_scale "sterne"', 'save', pg_temp.new_unit_with('{"rating":3,"rating_scale":"sterne"}'), '23514');
select pg_temp.fails('ungültig: Lernstufe 3', 'save', pg_temp.new_unit_with('{"rating":3,"rating_scale":"lernstufe"}'), '23514');
select pg_temp.fails('ungültig: leerer String', 'save', pg_temp.new_unit_with('{"rating":4,"rating_scale":""}'), '23514');
select pg_temp.fails('ungültig: Grossschreibung "Lernstufe"', 'save', pg_temp.new_unit_with('{"rating":4,"rating_scale":"Lernstufe"}'), '23514');
select pg_temp.fails('ungültig: Zahl als rating_scale', 'save', pg_temp.new_unit_with('{"rating":4,"rating_scale":1}'), '23514');
select pg_temp.fails('ungültig: rating 6', 'save', pg_temp.new_unit_with('{"rating":6,"rating_scale":"lernstufe"}'), '23514');
select pg_temp.fails('ungültig: unbekanntes Feld', 'save', pg_temp.new_unit_with('{"rating":4,"rating_scale":"lernstufe","rating_scale_v2":"x"}'), 'INVALID_REQUEST');
select pg_temp.ok('nach allen ungültigen Requests keine neue Zeile', (select count(*) from public.training_exercises) = (pg_temp.got('rows_before_invalid')#>>'{}')::bigint);
select pg_temp.sql_fails('Direktzugriff (RLS) mit Lernstufe 3 abgelehnt',
  $$update public.training_exercises set rating=3 where id='13000000-0000-4000-8000-000000000002'$$, '23514');
select pg_temp.put('null_rating', pg_temp.rpc('save', pg_temp.new_unit_with('{"rating":null,"rating_scale":"lernstufe"}')));
select pg_temp.ok('Lernstufe ohne Bewertung (rating NULL) wird angenommen', (pg_temp.got('null_rating')->>'duplicate') = 'false');
select pg_temp.info('LERNSTUFE_WITH_NULL_RATING',
  'Constraint erlaubt rating_scale=''lernstufe'' mit rating NULL (NULL in (1,2,4,5) ist nicht false). Bewusst so gewollt? Falls nicht: "rating is not null and" ergänzen.');

-- Fremder Nutzer
select pg_temp.as_user('b2000000-0000-4000-8000-000000000002');
select pg_temp.fails('fremder Nutzer: Laden → NOT_FOUND', 'get',
  jsonb_build_object('expectedOwnerId','b2000000-0000-4000-8000-000000000002','unitId','e3000000-0000-4000-8000-0000000000e3'), 'NOT_FOUND');
select pg_temp.fails('fremder Nutzer: Speichern → NOT_FOUND', 'save', pg_temp.save_req('b2000000-0000-4000-8000-000000000002',
  'e3000000-0000-4000-8000-0000000000e3', pg_temp.got('t3')#>>'{}', '{}'::jsonb, '[]'::jsonb), 'NOT_FOUND');
select pg_temp.rows('fremder Nutzer: Direktupdate rating_scale wirkt auf 0 Zeilen',
  $$update public.training_exercises set rating_scale=null where id='13000000-0000-4000-8000-000000000001'$$, 0);
select pg_temp.fails('falscher expectedOwnerId → CONTEXT_CHANGED', 'get',
  jsonb_build_object('expectedOwnerId','a1000000-0000-4000-8000-000000000001','unitId','e3000000-0000-4000-8000-0000000000e3'), 'CONTEXT_CHANGED');

-- Wiederholter Request (Offline-Retry)
select pg_temp.as_user('a1000000-0000-4000-8000-000000000001');
select pg_temp.put('retry_req', pg_temp.save_req('a1000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-0000000000e3',
  pg_temp.token('a1000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-0000000000e3'), '{}'::jsonb,
  jsonb_build_array(
    jsonb_build_object('id','13000000-0000-4000-8000-000000000001','discipline','Unterordnung','exercise_name','Sitz','rating',4,'rating_scale','lernstufe','notes',null,'duration_sec',null,'seq_index',0),
    jsonb_build_object('id','13000000-0000-4000-8000-000000000002','discipline','Unterordnung','exercise_name','Steh','rating',1,'rating_scale','lernstufe','notes',null,'duration_sec',null,'seq_index',1),
    jsonb_build_object('id','13000000-0000-4000-8000-000000000003','discipline','Fährte','exercise_name','Winkel','rating',3,'rating_scale',null,'notes',null,'duration_sec',null,'seq_index',2),
    jsonb_build_object('id','13000000-0000-4000-8000-000000000004','discipline','Fährte','exercise_name','Gegenstand','rating',2,'notes',null,'duration_sec',null,'seq_index',3))));
select pg_temp.rpc('save', pg_temp.got('retry_req'));
select pg_temp.ok('Retry desselben Requests → duplicate=true', (pg_temp.rpc('save', pg_temp.got('retry_req'))->>'duplicate') = 'true');
select pg_temp.fails('gleiche requestId mit anderem Inhalt → REQUEST_ID_REUSED', 'save',
  jsonb_set(pg_temp.got('retry_req'), '{exercises,0,rating}', '5'), 'REQUEST_ID_REUSED');

-- Neue App setzt Markierung ausdrücklich auf NULL
select pg_temp.rpc('save', jsonb_set(jsonb_set(pg_temp.got('retry_req'), '{requestId}', to_jsonb(gen_random_uuid())),
  '{expectedToken}', to_jsonb(pg_temp.token('a1000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-0000000000e3')))
  #- '{exercises,1,rating_scale}');
select pg_temp.ok('fehlender Schlüssel (alte Semantik) lässt Markierung stehen',
  (select rating_scale from public.training_exercises where id='13000000-0000-4000-8000-000000000002') = 'lernstufe');
select pg_temp.rpc('save', jsonb_set(jsonb_set(jsonb_set(pg_temp.got('retry_req'), '{requestId}', to_jsonb(gen_random_uuid())),
  '{expectedToken}', to_jsonb(pg_temp.token('a1000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-0000000000e3'))),
  '{exercises,1,rating_scale}', 'null'));
select pg_temp.ok('ausdrückliches NULL entfernt Markierung (Rückkehr zu Sternen)',
  (select rating_scale from public.training_exercises where id='13000000-0000-4000-8000-000000000002') is null);
select pg_temp.info('EXPLICIT_NULL_CLEARS_MARKER',
  'Sendet eine App rating_scale:null, wird die Lernstufen-Markierung entfernt. Neue App darf null nur bewusst senden.');

select pg_temp.as_admin();
select pg_temp.put('lernstufe_rows', to_jsonb((select count(*) from public.training_exercises where rating_scale='lernstufe')));
select 'RATING_SCALE_POST|PASS|assertions=' || count(*) from qa_assertions where phase = 'post';
select 'INFO|' || label || '|' || detail from qa_info where phase = 'post' order by label;
reset role;
