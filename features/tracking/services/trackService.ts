import { supabase } from '@/lib/supabase';
import type { MarkerSample, TrackPointSample } from '@/features/tracking/store/trackingStore';

// Ergebnis-Typ: nie stille Fehler — error wird zurückgegeben UND geloggt.
export interface Result<T> { data: T | null; error: string | null; }

function fail<T>(scope: string, error: unknown): Result<T> {
  const msg = (error as { message?: string })?.message ?? String(error);
  console.error(`[trackService:${scope}]`, error);
  return { data: null, error: msg };
}

// ── Session anlegen ──────────────────────────────────────────
export interface NewTrackSessionInput {
  dogId:              string;
  surfaceTypes:       string[];
  terrainConditions:  string[];
  lyingTimeMinutes:   number;
  notes:              string | null;
  locationName:       string | null;
  temperature:        number | null;
  weatherCondition:   string | null;
  latitude:           number | null;
  longitude:          number | null;
  // Plan-Parameter (Fährte planen)
  plannedLengthSteps?: number;        // geplante Länge in Schritten
  corners?:            number;        // geplante Winkel
  articles?:           number;        // geplante Gegenstände
  distraction?:        boolean;       // Verleitung (Fremdfährte)
  humidity?:           number | null; // Luftfeuchte %
  windSpeed?:          number | null; // km/h
}

export async function createTrackSession(ownerId: string, input: NewTrackSessionInput): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await supabase
      .from('training_sessions')
      .insert({
        owner_id:           ownerId,
        dog_id:             input.dogId,
        type:               'track',           // Fährte (eigene SQL-Spalte)
        category:           'IGP',             // Fährte ist eine IGP-Disziplin (DB-CHECK)
        training_type:      'privat',
        status:             'active',
        title:              'Fährte',
        session_date:       new Date().toISOString().slice(0, 10),
        started_at:         new Date().toISOString(),
        surface_types:      input.surfaceTypes,
        terrain_conditions: input.terrainConditions,
        lying_time_minutes: input.lyingTimeMinutes,
        corners_total:      input.corners ?? null,
        articles_total:     input.articles ?? null,
        distractions_total: input.distraction ? 1 : 0,
        notes:              input.notes,
        ort:                input.locationName,
        wetter:             input.weatherCondition,
        location_name:      input.locationName,
        temperature:        input.temperature,
        humidity:           input.humidity ?? null,
        wind_speed:         input.windSpeed ?? null,
        weather_condition:  input.weatherCondition,
        latitude:           input.latitude,
        longitude:          input.longitude,
        // geplante Parameter zusätzlich strukturiert ablegen (für Vorschau/Live)
        track_data:         { plan: {
          length: input.plannedLengthSteps ?? null, angles: input.corners ?? 0,
          objects: input.articles ?? 0, age: input.lyingTimeMinutes,
          surface: input.surfaceTypes[0] ?? null, distraction: !!input.distraction,
        } },
      })
      .select('id')
      .single();
    if (error) return fail('createTrackSession', error);
    return { data: data as { id: string }, error: null };
  } catch (e) { return fail('createTrackSession', e); }
}

// ── Marker (sofort persistieren — Audio/Position nicht verlieren) ─────
export async function saveTrackMarker(sessionId: string, m: MarkerSample): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await supabase
      .from('track_markers')
      .insert({
        session_id:          sessionId,
        marker_type:         m.type,
        material:            m.material ?? null,
        angle_kind:          m.angleKind ?? null,
        latitude:            m.lat,
        longitude:           m.lng,
        accuracy:            m.accuracy,
        distance_from_start: m.distance_from_start,
        note:                m.note,
        audio_url:           m.audio_url,
        found:               m.found,
      })
      .select('id')
      .single();
    if (error) return fail('saveTrackMarker', error);
    return { data: data as { id: string }, error: null };
  } catch (e) { return fail('saveTrackMarker', e); }
}

export async function markArticleFound(markerId: string): Promise<Result<null>> {
  try {
    const { error } = await supabase.from('track_markers').update({ found: true }).eq('id', markerId);
    if (error) return fail('markArticleFound', error);
    return { data: null, error: null };
  } catch (e) { return fail('markArticleFound', e); }
}

// ── Aufnahme abschließen: Lay-Punkte bulk + Session-Summary ──
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export interface RecordingSummary {
  layingDurationSeconds: number;
  distanceMeters:        number;
  gpsQualityAverage:     number | null;
  articlesTotal:         number;
  cornersTotal:          number;
  distractionsTotal:     number;
}

export async function finishTrackRecording(
  sessionId: string, points: TrackPointSample[], summary: RecordingSummary,
): Promise<Result<null>> {
  try {
    for (const part of chunk(points, 500)) {
      const rows = part.map(p => ({
        session_id: sessionId,
        latitude:   p.lat,
        longitude:  p.lng,
        accuracy:   p.accuracy ?? null,
        altitude:   p.altitude ?? null,
        speed:      p.speed ?? null,
        heading:    p.heading ?? null,
        timestamp:  new Date(p.t).toISOString(),
        point_type: 'lay',
      }));
      const { error } = await supabase.from('track_points').insert(rows);
      if (error) return fail('finishTrackRecording.points', error);
    }
    const { error } = await supabase.from('training_sessions').update({
      laying_duration_seconds: summary.layingDurationSeconds,
      distance_meters:         Math.round(summary.distanceMeters * 10) / 10,
      gps_quality_average:     summary.gpsQualityAverage,
      articles_total:          summary.articlesTotal,
      corners_total:           summary.cornersTotal,
      distractions_total:      summary.distractionsTotal,
    }).eq('id', sessionId);
    if (error) return fail('finishTrackRecording.session', error);
    return { data: null, error: null };
  } catch (e) { return fail('finishTrackRecording', e); }
}

// ── Ablauf (Run) ─────────────────────────────────────────────
export async function startTrackRun(sessionId: string): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await supabase
      .from('track_runs')
      .insert({ session_id: sessionId, started_at: new Date().toISOString() })
      .select('id')
      .single();
    if (error) return fail('startTrackRun', error);
    return { data: data as { id: string }, error: null };
  } catch (e) { return fail('startTrackRun', e); }
}

// Crash-Sicherung: gelaufene Punkte zwischendurch (gedrosselt) persistieren.
export async function saveTrackRunPoints(runId: string, runPoints: TrackPointSample[]): Promise<Result<null>> {
  try {
    const { error } = await supabase.from('track_runs')
      .update({ run_points: runPoints.map(p => ({ lat: p.lat, lng: p.lng, t: p.t })) })
      .eq('id', runId);
    if (error) return fail('saveTrackRunPoints', error);
    return { data: null, error: null };
  } catch (e) { return fail('saveTrackRunPoints', e); }
}

export interface RunSummary {
  durationSeconds:        number;
  distanceMeters:         number;
  averageDeviationMeters: number | null;
  articlesFound:          number;
  runPoints:              { lat: number; lng: number; t: number }[];
}

export async function finishTrackRun(runId: string, sessionId: string, summary: RunSummary): Promise<Result<null>> {
  try {
    const { error: rErr } = await supabase.from('track_runs').update({
      ended_at:                 new Date().toISOString(),
      duration_seconds:         summary.durationSeconds,
      distance_meters:          Math.round(summary.distanceMeters * 10) / 10,
      average_deviation_meters: summary.averageDeviationMeters,
      articles_found:           summary.articlesFound,
      run_points:               summary.runPoints,
    }).eq('id', runId);
    if (rErr) return fail('finishTrackRun.run', rErr);

    const { error: sErr } = await supabase.from('training_sessions').update({
      status:                   'completed',
      ended_at:                 new Date().toISOString(),
      search_duration_seconds:  summary.durationSeconds,
      average_deviation_meters: summary.averageDeviationMeters,
      articles_found:           summary.articlesFound,
    }).eq('id', sessionId);
    if (sErr) return fail('finishTrackRun.session', sErr);
    return { data: null, error: null };
  } catch (e) { return fail('finishTrackRun', e); }
}

// Fährte verwerfen (Abbrechen): Session + Punkte/Marker/Runs (FK-Cascade) löschen.
export async function deleteTrackSession(id: string): Promise<Result<null>> {
  try {
    const { error } = await supabase.from('training_sessions').delete().eq('id', id);
    if (error) return fail('deleteTrackSession', error);
    return { data: null, error: null };
  } catch (e) { return fail('deleteTrackSession', e); }
}

// ── Auswertung speichern ─────────────────────────────────────
export interface EvaluationInput {
  legs:   { name: string; score: number; max: number }[];
  rating: number;                                   // 0–100 Gesamtscore
  notes:  string | null;
}

export async function saveTrackEvaluation(sessionId: string, input: EvaluationInput): Promise<Result<null>> {
  try {
    const { error } = await supabase.from('training_sessions').update({
      rating:     input.rating,
      notes:      input.notes,
      track_data: { legs: input.legs, score: input.rating, evaluated_at: new Date().toISOString() },
    }).eq('id', sessionId);
    if (error) return fail('saveTrackEvaluation', error);
    return { data: null, error: null };
  } catch (e) { return fail('saveTrackEvaluation', e); }
}

// Gemessene Liegezeit (Minuten) auf der Session speichern — beim Start der Ausarbeitung.
export async function setTrackLyingTime(sessionId: string, minutes: number): Promise<Result<null>> {
  try {
    const { error } = await supabase.from('training_sessions')
      .update({ lying_time_minutes: minutes }).eq('id', sessionId);
    if (error) return fail('setTrackLyingTime', error);
    return { data: null, error: null };
  } catch (e) { return fail('setTrackLyingTime', e); }
}

// Aggregat-Kennzahlen aus den aktiven Fährten (training_sessions type='track').
export async function getTrackStatsRows(ownerId: string): Promise<Result<{ distance_meters: number | null }[]>> {
  try {
    const { data, error } = await supabase
      .from('training_sessions').select('distance_meters')
      .eq('owner_id', ownerId).eq('type', 'track').eq('status', 'completed');
    if (error) return fail('getTrackStatsRows', error);
    return { data: (data ?? []) as { distance_meters: number | null }[], error: null };
  } catch (e) { return fail('getTrackStatsRows', e); }
}

// Leichter Lookup: nur Hundename (für Live-Overlays, ohne Punkte/Marker zu laden).
export async function getTrackSessionDogName(id: string): Promise<Result<string | null>> {
  try {
    const { data, error } = await supabase
      .from('training_sessions').select('dog:dogs(name)').eq('id', id).single();
    if (error) return fail('getTrackSessionDogName', error);
    return { data: (data as any)?.dog?.name ?? null, error: null };
  } catch (e) { return fail('getTrackSessionDogName', e); }
}

// ── Lesen ────────────────────────────────────────────────────
export async function getUserTrackSessions(ownerId: string): Promise<Result<any[]>> {
  try {
    const { data, error } = await supabase
      .from('training_sessions')
      .select('*, dog:dogs(name)')
      .eq('owner_id', ownerId)
      .eq('type', 'track')
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) return fail('getUserTrackSessions', error);
    return { data: data ?? [], error: null };
  } catch (e) { return fail('getUserTrackSessions', e); }
}

export async function getTrackSessionById(id: string): Promise<Result<any>> {
  try {
    const [{ data: session, error: sErr }, { data: points }, { data: markers }, { data: runs }] = await Promise.all([
      supabase.from('training_sessions').select('*, dog:dogs(name)').eq('id', id).single(),
      supabase.from('track_points').select('*').eq('session_id', id).order('timestamp'),
      supabase.from('track_markers').select('*').eq('session_id', id),
      supabase.from('track_runs').select('*').eq('session_id', id).order('created_at'),
    ]);
    if (sErr) return fail('getTrackSessionById', sErr);
    return { data: { ...session, points: points ?? [], markers: markers ?? [], runs: runs ?? [] }, error: null };
  } catch (e) { return fail('getTrackSessionById', e); }
}
