// Mantrailing-Modus – Datenmodell und reine Logik (Spec docs/specs/phase2/02-mantrailing.md, PR A).
//
// Grundsatz: IGP-Fährte bleibt unverändert. Mantrailing ist ein EIGENER Sitzungstyp
// (training_sessions.type = 'mantrail'). Alle bestehenden Abfragen mit type = 'track'
// (Historie, Statistik, Teilen, Kontingent, Wiederherstellung) sehen Mantrailing
// dadurch nicht. Angaben liegen in der bestehenden Spalte track_data.mantrail
// (lokal: payload_json.mantrail) – keine neue Tabelle, keine neue Spalte.

export const MANTRAIL_SESSION_TYPE = 'mantrail' as const;
export const MANTRAIL_CATEGORY = 'Mantrailing' as const;       // = Sparten-Label
export const MANTRAIL_TITLE = 'Mantrailing' as const;
export const MANTRAIL_DATA_VERSION = 1 as const;
/** Korridor «in der Nähe der Trailer-Spur» (Entscheid Nutzerin 2026-11-24: fest 25 m). */
export const MANTRAIL_CORRIDOR_M = 25;

export type ScentArticle = 'clothing' | 'sock' | 'cap' | 'gauze' | 'car_seat' | 'other';
export type TrailEnvironment = 'city' | 'residential' | 'forest' | 'field' | 'mixed' | 'building';
export type TrailResult = 'found' | 'not_found' | 'aborted' | 'negative_correct' | 'negative_false';
export type TrailSource = 'transfer' | 'self' | 'none';

export const SCENT_ARTICLES: readonly ScentArticle[] = ['clothing', 'sock', 'cap', 'gauze', 'car_seat', 'other'];
export const TRAIL_ENVIRONMENTS: readonly TrailEnvironment[] = ['city', 'residential', 'forest', 'field', 'mixed', 'building'];
export const TRAIL_RESULTS: readonly TrailResult[] = ['found', 'not_found', 'aborted', 'negative_correct', 'negative_false'];
export const TRAIL_SOURCES: readonly TrailSource[] = ['transfer', 'self', 'none'];

export interface TrailWind {
  /** Richtung, aus der der Wind kommt (Grad, 0 = Nord). */
  fromDeg: number | null;
  speedKmh: number | null;
  /** 'weather' = Wetterdienst, 'manual' = von Hand. */
  source: 'weather' | 'manual';
}

export interface MantrailData {
  version: typeof MANTRAIL_DATA_VERSION;
  trailAgeMinutes: number | null;
  /** true = Trail-Alter von Hand überschrieben. */
  trailAgeManual: boolean;
  windLay: TrailWind | null;
  windRun: TrailWind | null;
  scentArticle: ScentArticle | null;
  scentArticleLabel: string | null;          // bei 'other'
  scentContaminated: boolean;
  environment: TrailEnvironment | null;
  surface: string | null;
  negative: boolean;
  doubleBlind: boolean;
  result: TrailResult | null;
  indication: string | null;                 // frei, z. B. «Hinsetzen»
  revealedEarly: boolean;                    // Trailer-Spur vor «Ende» gezeigt (Doppelblind)
  trailSource: TrailSource;
}

const MAX_AGE_MIN = 60 * 24 * 14;            // 14 Tage: darüber ist es ein Eingabefehler
const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | null => (typeof v === 'string' && (list as readonly string[]).includes(v) ? v as T : null);
const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 10) / 10 : null;

function parseWind(raw: unknown): TrailWind | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const fromDeg = num(r.fromDeg, 0, 360);
  const speedKmh = num(r.speedKmh, 0, 250);
  if (fromDeg == null && speedKmh == null) return null;
  return { fromDeg, speedKmh, source: r.source === 'manual' ? 'manual' : 'weather' };
}

export function emptyMantrailData(): MantrailData {
  return {
    version: MANTRAIL_DATA_VERSION, trailAgeMinutes: null, trailAgeManual: false, windLay: null, windRun: null,
    scentArticle: null, scentArticleLabel: null, scentContaminated: false, environment: null, surface: null,
    negative: false, doubleBlind: false, result: null, indication: null, revealedEarly: false, trailSource: 'none',
  };
}

/** Liest Mantrailing-Angaben robust (auch Teilstände, künftige Felder werden ignoriert). */
export function parseMantrailData(raw: unknown): MantrailData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== MANTRAIL_DATA_VERSION) return null;
  const negative = r.negative === true;
  let result = oneOf(r.result, TRAIL_RESULTS);
  // Negativtrail kennt nur «korrekt negativ» / «falsch positiv» bzw. abgebrochen.
  if (negative && (result === 'found' || result === 'not_found')) result = null;
  if (!negative && (result === 'negative_correct' || result === 'negative_false')) result = null;
  return {
    version: MANTRAIL_DATA_VERSION,
    trailAgeMinutes: num(r.trailAgeMinutes, 0, MAX_AGE_MIN),
    trailAgeManual: r.trailAgeManual === true,
    windLay: parseWind(r.windLay),
    windRun: parseWind(r.windRun),
    scentArticle: oneOf(r.scentArticle, SCENT_ARTICLES),
    scentArticleLabel: text(r.scentArticleLabel, 60),
    scentContaminated: r.scentContaminated === true,
    environment: oneOf(r.environment, TRAIL_ENVIRONMENTS),
    surface: text(r.surface, 60),
    negative,
    doubleBlind: r.doubleBlind === true,
    result,
    indication: text(r.indication, 60),
    revealedEarly: r.revealedEarly === true,
    trailSource: oneOf(r.trailSource, TRAIL_SOURCES) ?? 'none',
  };
}

/** Trail-Alter in Minuten: Ende Trailer → Start Hund. Ohne beide Zeiten oder rückwärts: null. */
export function trailAgeMinutes(trailerEndMs: number | null | undefined, dogStartMs: number | null | undefined): number | null {
  if (trailerEndMs == null || dogStartMs == null || !Number.isFinite(trailerEndMs) || !Number.isFinite(dogStartMs)) return null;
  const minutes = (dogStartMs - trailerEndMs) / 60000;
  if (minutes < 0 || minutes > MAX_AGE_MIN) return null;
  return Math.round(minutes);
}

/** Ist diese Sitzung ein Mantrail (Server- oder lokale Zeile)? */
export function isMantrailSession(row: { type?: string | null } | null | undefined): boolean {
  return row?.type === MANTRAIL_SESSION_TYPE;
}

// ── Auswertung: Hundespur gegen Trailer-Spur ────────────────────────────────
export interface LatLng { lat: number; lng: number }

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Abstand Punkt → Strecke in Metern (lokale ebene Näherung, für Trail-Längen ausreichend). */
function pointToSegmentM(p: LatLng, a: LatLng, b: LatLng): number {
  const lat0 = rad(p.lat);
  const x = (q: LatLng) => rad(q.lng - p.lng) * Math.cos(lat0) * R;
  const y = (q: LatLng) => rad(q.lat - p.lat) * R;
  const ax = x(a), ay = y(a), bx = x(b), by = y(b);
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.sqrt(cx * cx + cy * cy);
}

export function distanceToPolylineM(p: LatLng, line: readonly LatLng[]): number | null {
  if (line.length === 0) return null;
  if (line.length === 1) return pointToSegmentM(p, line[0], line[0]);
  let best = Infinity;
  for (let i = 1; i < line.length; i++) best = Math.min(best, pointToSegmentM(p, line[i - 1], line[i]));
  return best;
}

export function pathLengthM(line: readonly LatLng[]): number {
  let sum = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    sum += 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return sum;
}

export interface CorridorStats {
  /** Anteil der Hundepunkte innerhalb des Korridors (0..1); null ohne Trailer-Spur. */
  nearShare: number | null;
  maxDeviationM: number | null;
  dogLengthM: number;
  trailerLengthM: number | null;
}

/**
 * Einfache Mantrailing-Auswertung mit festem Korridor (25 m). Bewusst unabhängig von
 * der IGP-Auswertung (keine Winkel, keine Gegenstände, kein Fussgenau-Massstab).
 */
export function corridorStats(dog: readonly LatLng[], trailer: readonly LatLng[] | null, corridorM = MANTRAIL_CORRIDOR_M): CorridorStats {
  const dogLengthM = Math.round(pathLengthM(dog));
  if (!trailer || trailer.length === 0 || dog.length === 0) {
    return { nearShare: null, maxDeviationM: null, dogLengthM, trailerLengthM: trailer?.length ? Math.round(pathLengthM(trailer)) : null };
  }
  let near = 0; let max = 0;
  for (const p of dog) {
    const d = distanceToPolylineM(p, trailer) ?? Infinity;
    if (d <= corridorM) near++;
    if (d > max) max = d;
  }
  return {
    nearShare: Math.round((near / dog.length) * 100) / 100,
    maxDeviationM: Math.round(max),
    dogLengthM,
    trailerLengthM: Math.round(pathLengthM(trailer)),
  };
}

// ── Statistik ───────────────────────────────────────────────────────────────
export interface MantrailStatsInput { data: MantrailData | null; lengthM: number | null; deleted?: boolean }

export interface MantrailStats {
  trails: number;
  /** Fundquote nur über Trails mit Person (ohne Negativtrails, ohne offene Ergebnisse). */
  foundRate: number | null;
  negativeCorrectRate: number | null;
  avgAgeMinutes: number | null;
  maxAgeMinutes: number | null;
  longestM: number | null;
  byEnvironment: Partial<Record<TrailEnvironment, number>>;
}

export function mantrailStats(items: readonly MantrailStatsInput[]): MantrailStats {
  const list = items.filter(i => !i.deleted);
  const positive = list.filter(i => i.data && !i.data.negative && (i.data.result === 'found' || i.data.result === 'not_found' || i.data.result === 'aborted'));
  const negatives = list.filter(i => i.data?.negative && (i.data.result === 'negative_correct' || i.data.result === 'negative_false'));
  const ages = list.map(i => i.data?.trailAgeMinutes).filter((a): a is number => typeof a === 'number');
  const lengths = list.map(i => i.lengthM).filter((l): l is number => typeof l === 'number' && l > 0);
  const byEnvironment: Partial<Record<TrailEnvironment, number>> = {};
  for (const i of list) if (i.data?.environment) byEnvironment[i.data.environment] = (byEnvironment[i.data.environment] ?? 0) + 1;
  const rate = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 100) / 100);
  return {
    trails: list.length,
    foundRate: rate(positive.filter(i => i.data!.result === 'found').length, positive.length),
    negativeCorrectRate: rate(negatives.filter(i => i.data!.result === 'negative_correct').length, negatives.length),
    avgAgeMinutes: ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null,
    maxAgeMinutes: ages.length ? Math.max(...ages) : null,
    longestM: lengths.length ? Math.round(Math.max(...lengths)) : null,
    byEnvironment,
  };
}
