// ──────────────────────────────────────────────────────────────────────────
// Persistenter Recovery-Zustand EINES Absuche-Runs — REINE Typen/Helfer.
//
// Hintergrund (Audit „Legen → Absuche → Audio", P0-3): nach App-Kill startete
// die Absuche mit Cursor 0, vergessenen Ansagen, vergessenen Funden und neuem
// Ende-/Segment-/Off-Track-Zustand — also „eine neue Suche ungefähr am selben
// Ort" statt derselbe Run. Hier liegt die MINIMALE Menge, die Resume semantisch
// identisch zum Weiterlaufen macht. Alles andere (Cursor-Fenster, dogProgressM,
// Distanz, Off-Track-Streaks, Fusion, Analytics-Samples) ist rekonstruierbar
// oder reset-sicher — siehe Begründungen an den Feldern.
//
// Der Zustand gehört zu GENAU EINER searchRunId: startSearchSession() setzt ihn
// auf FRESH, restoreSearchSession() liest ihn legacy-sicher zurück.
// ──────────────────────────────────────────────────────────────────────────
import type { OffTrackState } from '@/features/tracking/utils/offTrack';

/** Abriss (strukturgleich zu useSearchRecorder.Break — kein Import-Zyklus in den Store). */
export interface SearchRunBreak {
  at: { latitude: number; longitude: number };
  t: number;
  recoveredAfterM?: number;
  startedAtSec: number;
  recoveredAtSec?: number;
  durationSec?: number;
}

export interface SearchSegmentAnnounced {
  announcedApproach: boolean;
  announcedStart: boolean;
  announcedEnd: boolean;
}

export interface SearchRunState {
  /** PERSIST (P0): monotoner Referenzfortschritt entlang laidPoints (= maxCursorMRef). Ohne handlerDistance. */
  maxCursorM: number;
  /** PERSIST: rohe Abweichungssumme/-zahl → deviationAvgM bleibt run-bezogen (Messwert, nicht Score). */
  devSumM: number;
  devCount: number;
  /** Accuracy-/Fusion-reliable score samples. Versioned so legacy recovery keeps its old score semantics. */
  scoreQualityVersion: 1 | 0;
  reliableDeviationExcessSumM: number;
  reliableDeviationCount: number;
  reliableCursorM: number;
  /** PERSIST: gefundene Gegenstände/Dübel als stabile Marker-IDs (foundRef). */
  foundObjectIds: string[];
  autoDwellObjectIds: string[];
  dismissedAutoDwellIds: string[];
  /** PERSIST: Voice-Guidance bereits angesagte Feature-IDs (stateRef announced/reached/passed). */
  voiceFiredIds: string[];
  /** PERSIST: Haptik bereits ausgelöste Feature-IDs (firedRef) — eigene Triggerdistanz, daher getrennt. */
  hapticFiredIds: string[];
  /** PERSIST: „Ende der Fährte erreicht" wurde bereits angesagt (useTrackEndGuidance reached/completed). */
  endFired: boolean;
  /** PERSIST: Teilstrecken-Ansagen (segmentAnnouncementRef), je Segment-ID. */
  segmentAnnouncements: Record<string, SearchSegmentAnnounced>;
  /** PERSIST: bestätigte Abrisse (breaksRef) — Ergebnisdaten, nicht rekonstruierbar. */
  breaks: SearchRunBreak[];
  /** PERSIST: diskreter Off-Track-State (nicht die Streaks) → keine falsche Übergangsansage nach Resume. */
  offTrackState: OffTrackState;
}

export function freshSearchRunState(): SearchRunState {
  return {
    maxCursorM: 0, devSumM: 0, devCount: 0, scoreQualityVersion: 1,
    reliableDeviationExcessSumM: 0, reliableDeviationCount: 0, reliableCursorM: 0,
    foundObjectIds: [], autoDwellObjectIds: [], dismissedAutoDwellIds: [], voiceFiredIds: [], hapticFiredIds: [],
    endFired: false, segmentAnnouncements: {}, breaks: [], offTrackState: 'on_track',
  };
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const OFF_STATES: readonly OffTrackState[] = ['on_track', 'warning', 'off_track'];

/**
 * Legacy-sicheres Zurücklesen aus einem PendingTrack. Fehlende/kaputte Felder →
 * FRESH-Defaults. Das ist eine dokumentierte LEGACY-DEGRADATION, kein
 * historischer Zustand: ein alter Puffer ohne diese Felder verhält sich wie
 * bisher (Fortschritt 0, keine Dedupe-Historie). Neue Runs unter diesem Code
 * schreiben alle Felder.
 */
export function sanitizeSearchRunState(raw: unknown): SearchRunState {
  const f = freshSearchRunState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return f;
  const r = raw as Record<string, unknown>;
  const seg: Record<string, SearchSegmentAnnounced> = {};
  if (r.segmentAnnouncements && typeof r.segmentAnnouncements === 'object') {
    for (const [k, v] of Object.entries(r.segmentAnnouncements as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue;
      const s = v as Record<string, unknown>;
      seg[k] = { announcedApproach: s.announcedApproach === true, announcedStart: s.announcedStart === true, announcedEnd: s.announcedEnd === true };
    }
  }
  const breaks: SearchRunBreak[] = Array.isArray(r.breaks)
    ? (r.breaks as unknown[]).flatMap(b => {
        if (!b || typeof b !== 'object') return [];
        const x = b as Record<string, unknown>;
        const at = x.at as Record<string, unknown> | undefined;
        if (!at || typeof at.latitude !== 'number' || typeof at.longitude !== 'number') return [];
        return [{
          at: { latitude: at.latitude, longitude: at.longitude },
          t: num(x.t, 0), startedAtSec: num(x.startedAtSec, 0),
          ...(typeof x.recoveredAfterM === 'number' ? { recoveredAfterM: x.recoveredAfterM } : {}),
          ...(typeof x.recoveredAtSec === 'number' ? { recoveredAtSec: x.recoveredAtSec } : {}),
          ...(typeof x.durationSec === 'number' ? { durationSec: x.durationSec } : {}),
        }];
      })
    : [];
  return {
    maxCursorM: Math.max(0, num(r.maxCursorM, 0)),
    devSumM: Math.max(0, num(r.devSumM, 0)),
    devCount: Math.max(0, Math.floor(num(r.devCount, 0))),
    scoreQualityVersion: r.scoreQualityVersion === 1 ? 1 : 0,
    reliableDeviationExcessSumM: Math.max(0, num(r.reliableDeviationExcessSumM, 0)),
    reliableDeviationCount: Math.max(0, Math.floor(num(r.reliableDeviationCount, 0))),
    reliableCursorM: Math.max(0, num(r.reliableCursorM, 0)),
    foundObjectIds: strList(r.foundObjectIds),
    autoDwellObjectIds: strList(r.autoDwellObjectIds),
    dismissedAutoDwellIds: strList(r.dismissedAutoDwellIds),
    voiceFiredIds: strList(r.voiceFiredIds),
    hapticFiredIds: strList(r.hapticFiredIds),
    endFired: r.endFired === true,
    segmentAnnouncements: seg,
    breaks,
    offTrackState: OFF_STATES.includes(r.offTrackState as OffTrackState) ? (r.offTrackState as OffTrackState) : 'on_track',
  };
}

/** Stabile Identität eines Suchobjekts: Marker-ID, sonst (nur ohne ID) der Index. */
export function searchObjectKey(obj: { id?: string | null }, index: number): string {
  return obj.id ?? `idx:${index}`;
}
