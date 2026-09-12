// QA-Export einer gelegten Fährte — anonymisiert, für Regressions-Fixtures.
//
// Zweck: die echten Punktfolgen eines Feldtests so aus dem Gerät holen, dass
// der UNVERÄNDERTE Detector sie später exakt reproduzieren kann — ohne dass
// ein einziger echter Standort den Weg in den Testbestand findet.
//
// Anonymisierung: der erste Punkt wird zum Ursprung, alles Weitere sind
// lokale x/y-Meter (x = Ost, y = Nord), Zeitstempel relativ zum ersten Punkt.
// Die Geometrie bleibt damit vollständig erhalten, der Ort geht vollständig
// verloren. Es gibt keine Rückrechnung ohne den Startpunkt — und der ist im
// Export nicht enthalten.
//
// Diese Datei verändert NICHTS an der Erkennung: keine Schwellen, keine
// Klassen, keine Fenster, keine Fusion. Sie liest nur.

import type {
  QaSessionCapture, QaCapturePoint, QaMarkerSource, QaDistanceScale, QaAutoDiagnostic,
  QaCandidateMotion,
} from '@/features/tracking/utils/qaSessionCapture';

const M_PER_DEG = 111320;

/** Rohpunkt, wie ihn `local_track_points` liefert. */
export interface RawLayPoint {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  /** ISO-String oder ms. */
  timestamp: string | number;
}

/** Rohmarker, wie ihn `local_track_markers` liefert. */
export interface RawTrackMarker {
  /** Lokale Marker-ID — verbindet den Marker mit seinem QA-Mitschnitt. */
  local_id?: string | null;
  marker_type: string;
  angle_kind?: string | null;
  material?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  distance_from_start?: number | null;
  created_at?: string | number | null;
}

export interface AnonPoint {
  /** Meter östlich des ersten Punkts. */
  x: number;
  /** Meter nördlich des ersten Punkts. */
  y: number;
  accuracy: number | null;
  /** Millisekunden seit dem ersten Punkt. */
  tMs: number;
}

export interface AnonMarker {
  type: string;
  angleKind: string | null;
  material: string | null;
  x: number | null;
  y: number | null;
  atM: number | null;
  tMs: number | null;
  /**
   * Woher der Marker stammt. Ohne diese Angabe ist `atM` nicht interpretierbar:
   * AUTO-Winkel und Stop-Flush zählen auf dem DETEKTOR-Pfad, BUILD40 und
   * manuelle Marker auf der aufgezeichneten LINIE — zwei verschiedene
   * Massstäbe in derselben Spalte. `unknown` = Session ohne QA-Mitschnitt.
   */
  source: QaMarkerSource;
  scale: QaDistanceScale;
  /** Index im Detektor-Puffer; verbindet den Marker mit seiner Diagnose. */
  apexIndex: number | null;
}

/** Schema v1 — historische Exporte bleiben lesbar. */
export interface QaTrackExportV1 {
  schemaVersion: 1;
  sessionId: string;
  pointType: 'lay';
  pointCount: number;
  durationMs: number;
  totalDistanceM: number;
  samplingIntervalMs: number | null;
  accuracy: { min: number | null; median: number | null; max: number | null };
  markerTypes: string[];
  points: AnonPoint[];
  markers: AnonMarker[];
}

export interface QaTrackExport {
  schemaVersion: 2;
  /**
   * QA-Nebenversion. 0/fehlend = v2.0 (ohne Motion), 1 = v2.1.
   * Bewusst getrennt von `schemaVersion`, damit bestehende v2.0-Leser
   * unverändert funktionieren.
   */
  schemaMinor?: 0 | 1;
  /** Gehashte Session-ID — nicht auf die echte zurückführbar. */
  sessionId: string;
  pointType: 'lay';
  pointCount: number;
  durationMs: number;
  /** Weiterhin die Länge der AUFGEZEICHNETEN LINIE — identisch zu v1. */
  totalDistanceM: number;
  /** Medianer zeitlicher Abstand aufeinanderfolgender Punkte (ms). */
  samplingIntervalMs: number | null;
  accuracy: { min: number | null; median: number | null; max: number | null };
  markerTypes: string[];
  /** Die persistierte Linie — unverändert gegenüber v1. */
  points: AnonPoint[];
  markers: AnonMarker[];

  // ── v2: alles, was zur Reproduktion eines Feldlaufs fehlte ──────────────
  /** false = Session ohne QA-Mitschnitt (QA-Modus war aus oder Altbestand). */
  qaCaptureAvailable: boolean;
  /**
   * Je Pipeline EINE benannte Zahl. Nie wieder „die Distanz":
   *   rawPathM       ungeglättet, alle eingegangenen Fixe
   *   detectorPathM  EMA 0,7 / Gate 0,5 m  ← Massstab der AUTO-Winkel
   *   recordedLineM  EMA 0,4 / Gate 2,0 m  ← entspricht totalDistanceM
   *   storeDistanceM was die App während der Aufnahme angezeigt hat
   */
  distances: {
    rawPathM: number | null;
    detectorPathM: number | null;
    recordedLineM: number | null;
    storeDistanceM: number | null;
  };
  counts: {
    rawFixes: number | null;
    acceptedFixes: number | null;
    rejectedFixes: number | null;
    detectorPoints: number | null;
    linePoints: number | null;
    /** Punkte, die tatsächlich in der Datenbank gelandet sind. */
    persistedPoints: number;
  };
  rawFixes: QaCapturePoint[];
  detectorPoints: QaCapturePoint[];
  linePoints: QaCapturePoint[];
  /**
   * FINISH RECONSTRUCTED — beim Stop neu berechnet, OHNE Motion. Nicht mit
   * der Live-Entscheidung verwechseln (siehe candidateMotionEvidence).
   */
  autoDiagnostics: QaAutoDiagnostic[];

  // ── QA v2.1 ─────────────────────────────────────────────────────────────
  /**
   * LIVE RECORDED + DERIVED. Was zum Zeitpunkt jedes bewerteten Kandidaten
   * tatsächlich an Motion-Evidenz vorlag — inklusive der Rohsamples, damit
   * jedes Auswertefenster nachrechenbar bleibt.
   *
   * Leeres Array = QA-Modus lief, aber Motion war nicht aktiv.
   * `undefined`  = Mitschnitt stammt aus v2.0, Motion wurde nie erfasst.
   * Beides ist NICHT dasselbe wie „Motion sah keine Drehung".
   */
  candidateMotionEvidence?: QaCandidateMotion[];
  /** true, wenn Core Motion während der Aufnahme überhaupt lief. */
  motionCaptureAvailable: boolean;
}

export function toMs(t: string | number | null | undefined): number {
  if (t == null) return 0;
  return typeof t === 'number' ? t : Date.parse(t);
}

/**
 * Kurzer, stabiler Hash — die echte Session-ID darf nicht in den Export.
 * Kein Krypto-Anspruch: es geht nur darum, zwei Exporte unterscheiden zu
 * können, ohne die Original-ID mitzugeben.
 */
export function hashSessionId(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `qa-${h.toString(16).padStart(8, '0')}`;
}

/**
 * Rohpunkte → anonymisierte lokale Meter. Der erste Punkt wird zum Ursprung;
 * Längengrade werden auf dessen Breitengrad skaliert (für Fährtendistanzen von
 * einigen Dutzend Metern exakt genug).
 */
export function anonymizePoints(raw: readonly RawLayPoint[]): AnonPoint[] {
  if (!raw.length) return [];
  const lat0 = raw[0].latitude, lng0 = raw[0].longitude;
  const t0 = toMs(raw[0].timestamp);
  const mPerLng = M_PER_DEG * Math.cos((lat0 * Math.PI) / 180);
  return raw.map(p => ({
    x: Math.round((p.longitude - lng0) * mPerLng * 1000) / 1000,
    y: Math.round((p.latitude - lat0) * M_PER_DEG * 1000) / 1000,
    accuracy: p.accuracy == null ? null : Math.round(p.accuracy * 100) / 100,
    tMs: toMs(p.timestamp) - t0,
  }));
}

/** Marker relativ zum selben Ursprung. */
export function anonymizeMarkers(
  raw: readonly RawTrackMarker[], first: RawLayPoint | undefined,
  meta?: readonly { markerId: string; source: QaMarkerSource; scale: QaDistanceScale; apexIndex: number | null }[],
): AnonMarker[] {
  if (!first) return [];
  const byId = new Map((meta ?? []).map(m => [m.markerId, m]));
  const lat0 = first.latitude, lng0 = first.longitude;
  const t0 = toMs(first.timestamp);
  const mPerLng = M_PER_DEG * Math.cos((lat0 * Math.PI) / 180);
  return raw.map(m => ({
    type: m.marker_type,
    angleKind: m.angle_kind ?? null,
    material: m.material ?? null,
    x: m.longitude == null ? null : Math.round((m.longitude - lng0) * mPerLng * 1000) / 1000,
    y: m.latitude == null ? null : Math.round((m.latitude - lat0) * M_PER_DEG * 1000) / 1000,
    atM: m.distance_from_start ?? null,
    tMs: m.created_at == null ? null : toMs(m.created_at) - t0,
    // Ohne Mitschnitt bleibt die Herkunft ehrlich `unknown` statt geraten.
    source: byId.get(m.local_id ?? '')?.source ?? 'unknown',
    scale: byId.get(m.local_id ?? '')?.scale ?? 'unknown',
    apexIndex: byId.get(m.local_id ?? '')?.apexIndex ?? null,
  }));
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Baut den vollständigen Export. `points` MÜSSEN bereits auf
 * `point_type='lay'` gefiltert sein — Such-/Run-Punkte gehören nicht hinein
 * (siehe getLayTrackPointsBySession).
 */
export function buildQaTrackExport(
  sessionLocalId: string,
  points: readonly RawLayPoint[],
  markers: readonly RawTrackMarker[],
  capture?: QaSessionCapture | null,
): QaTrackExport {
  const anon = anonymizePoints(points);
  let dist = 0;
  const gaps: number[] = [];
  for (let i = 1; i < anon.length; i++) {
    dist += Math.hypot(anon[i].x - anon[i - 1].x, anon[i].y - anon[i - 1].y);
    gaps.push(anon[i].tMs - anon[i - 1].tMs);
  }
  const accs = anon.map(p => p.accuracy).filter((a): a is number => a != null);
  const motion = capture?.candidateMotionEvidence;
  return {
    schemaVersion: 2,
    schemaMinor: capture?.captureVersion === 2 ? 1 : 0,
    sessionId: hashSessionId(sessionLocalId),
    pointType: 'lay',
    pointCount: anon.length,
    durationMs: anon.length ? anon[anon.length - 1].tMs : 0,
    totalDistanceM: Math.round(dist * 100) / 100,
    samplingIntervalMs: median(gaps),
    accuracy: {
      min: accs.length ? Math.min(...accs) : null,
      median: median(accs),
      max: accs.length ? Math.max(...accs) : null,
    },
    markerTypes: [...new Set(markers.map(m => m.marker_type))].sort(),
    points: anon,
    markers: anonymizeMarkers(markers, points[0], capture?.markers),

    qaCaptureAvailable: !!capture,
    distances: {
      rawPathM: capture?.distances.rawPathM ?? null,
      detectorPathM: capture?.distances.detectorPathM ?? null,
      // Ohne Mitschnitt ist die Linienlänge das Einzige, was bekannt ist.
      recordedLineM: capture?.distances.recordedLineM ?? Math.round(dist * 100) / 100,
      storeDistanceM: capture?.distances.storeDistanceM ?? null,
    },
    counts: {
      rawFixes: capture?.counts.rawFixes ?? null,
      acceptedFixes: capture?.counts.acceptedFixes ?? null,
      rejectedFixes: capture?.counts.rejectedFixes ?? null,
      detectorPoints: capture?.counts.detectorPoints ?? null,
      linePoints: capture?.counts.linePoints ?? null,
      persistedPoints: anon.length,
    },
    rawFixes: capture?.rawFixes ?? [],
    detectorPoints: capture?.detectorPoints ?? [],
    linePoints: capture?.linePoints ?? [],
    autoDiagnostics: capture?.autoDiagnostics ?? [],
    candidateMotionEvidence: motion,
    motionCaptureAvailable: !!motion && motion.length > 0,
  };
}

/** Dateiname für den Export. */
export function qaExportFileName(e: QaTrackExport): string {
  return `anyvo-track-qa-${e.sessionId}.json`;
}

export function serializeQaTrackExport(e: QaTrackExport): string {
  return JSON.stringify(e, null, 2);
}

/**
 * Sicherheitsnetz: prüft eine fertige Exportstruktur darauf, dass sie weder
 * Geokoordinaten noch absolute Zeitstempel enthält. Wird vor dem Teilen
 * aufgerufen — lieber gar kein Export als ein Standortleck.
 */
export function assertNoAbsoluteData(e: QaTrackExport): void {
  const json = JSON.stringify(e);
  for (const forbidden of ['latitude', 'longitude', 'lat"', 'lng"']) {
    if (json.includes(forbidden)) throw new Error(`QA-Export enthält unerlaubtes Feld: ${forbidden}`);
  }
  // Absolute Unix-Zeitstempel (ms) wären >= 1e12; relative Zeiten einer Fährte
  // bleiben weit darunter.
  for (const list of [e.points, e.rawFixes, e.detectorPoints, e.linePoints]) {
    for (const p of list) {
      if (Math.abs(p.tMs) >= 1e12) throw new Error('QA-Export enthält einen absoluten Zeitstempel.');
    }
  }
  for (const d of e.autoDiagnostics) {
    if (d.tMs != null && Math.abs(d.tMs) >= 1e12) throw new Error('QA-Export enthält einen absoluten Zeitstempel.');
  }
  // QA v2.1: alle Motion-Zeiten sind relativ — weder Kandidatenzeit noch
  // Sample-Zeit darf je absolut werden.
  for (const m of e.candidateMotionEvidence ?? []) {
    for (const v of [m.evaluatedAtMs, m.windowStartMs, m.windowEndMs, m.firstSampleAgeMs, m.lastSampleAgeMs]) {
      if (v != null && Math.abs(v) >= 1e12) throw new Error('QA-Export enthält einen absoluten Motion-Zeitstempel.');
    }
    for (const sm of m.samples) {
      if (Math.abs(sm.dtMs) >= 1e12) throw new Error('QA-Export enthält einen absoluten Motion-Zeitstempel.');
    }
  }
  for (const m of e.markers) {
    if (m.tMs != null && Math.abs(m.tMs) >= 1e12) throw new Error('QA-Export enthält einen absoluten Marker-Zeitstempel.');
  }
  // Der erste Punkt MUSS der Ursprung sein.
  if (e.points.length && (e.points[0].x !== 0 || e.points[0].y !== 0 || e.points[0].tMs !== 0)) {
    throw new Error('QA-Export ist nicht auf den ersten Punkt normiert.');
  }
}
