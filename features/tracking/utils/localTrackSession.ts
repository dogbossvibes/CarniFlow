import type { NewLocalTrainingSession } from '@/features/training/repositories/localTrainingRepository';

// Reine, testbare Abbildung: Aufnahme-Kontext → vollständiger lokaler Session-Datensatz
// für eine gelegte Fährte. Alle remote-NOT-NULL-Pflichtfelder (owner_id via user_id,
// dog_id, category) sind gesetzt; keine erfundenen Dummy-Werte — Metadaten kommen aus
// dem Aufnahme-Screen. training_type/session_date werden erst beim Remote-Upsert
// synthetisiert (createRemoteTrainingSession), daher hier nicht nötig.

export interface LocalTrackSessionMeta {
  surfaceTypes?:      string[];
  terrainConditions?: string[];
  temperature?:       number | null;
  weatherCondition?:  string | null;
  windSpeed?:         number | null;
  humidity?:          number | null;
  latitude?:          number | null;
  longitude?:         number | null;
}

export function buildLocalTrackSessionInput(args: {
  localId:   string;          // führende clientUuid = spätere training_sessions.id
  ownerId:   string;          // = owner_id (auth.uid()), aus dem Session-Cache
  dogId:     string | null;   // NOT NULL remote → muss geführt werden
  startedAt: string;          // ISO
  meta?:     LocalTrackSessionMeta;
  /** Mantrailing (Spec 02): eigener Sitzungstyp. Fehlt er, bleibt alles wie bisher (IGP-Fährte). */
  kind?:     'mantrail';
}): NewLocalTrainingSession {
  const m = args.meta ?? {};
  const mantrail = args.kind === 'mantrail';
  return {
    local_id:           args.localId,
    user_id:            args.ownerId,
    dog_id:             args.dogId,
    category:           mantrail ? 'Mantrailing' : 'IGP',       // Fährte ist IGP-Disziplin (Remote-CHECK)
    type:               mantrail ? 'mantrail' : 'track',
    status:             'active',
    title:              mantrail ? 'Mantrailing' : 'Fährte',
    started_at:         args.startedAt,
    surface_types:      m.surfaceTypes ?? null,
    terrain_conditions: m.terrainConditions ?? null,
    temperature:        m.temperature ?? null,
    weather_condition:  m.weatherCondition ?? null,
    wind_speed:         m.windSpeed ?? null,
    humidity:           m.humidity ?? null,
    latitude:           m.latitude ?? null,
    longitude:          m.longitude ?? null,
  };
}
