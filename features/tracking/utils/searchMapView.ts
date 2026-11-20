// ──────────────────────────────────────────────────────────────────────────
// Reine Darstellungs-Mathematik für die Absuche-Karte (GitHub-Issue #33):
// Laufrichtung aus der gelegten Fährte, Fährten-Zoom, Kürzel-Platzierung und
// der Hinweis «Nächstes Ereignis». Bewusst OHNE React/Map/Native-Imports →
// vollständig testbar.
//
// STRIKTE ABGRENZUNG: dieses Modul LIEST bereits vorhandene Anzeigewerte
// (Soll-Linie, Fortschritt, kanonische Bogenlängen) und liefert ausschliesslich
// Kamera-/Marker-Positionen für die Anzeige. Es kennt weder Recorder,
// Winkelerkennung, Fortschrittsberechnung, Off-Track-Logik, Voice noch Haptik
// und schreibt nirgends zurück. Datenrichtung: Tracking-State → Karte.
// ──────────────────────────────────────────────────────────────────────────
import { buildArc, pointAtDistance, type LL } from '@/features/tracking/utils/searchGeometry';
import { cameraBearing } from '@/features/tracking/utils/smartCamera';

export const SEARCH_VIEW = {
  /** Länge des Fährtenstücks (m), aus dem die Blickrichtung gepeilt wird. */
  headingWindowM: 15,
  /** Die Karte dreht erst, wenn der Hundeführer so weit HINTER dem Winkel ist. */
  turnDelayM: 4,
  /** Mindestschritt (m) der Positionsfolge, wenn bei Off-Track auf GPS zurückgefallen wird. */
  offTrackMinStepM: 9,
  /** Sichtbare Kartenhöhe (m) in der Absuche. */
  spanM: 70,
  /** Sichtbare Kartenhöhe (m) kurz vor einem Winkel/Gegenstand (T-218: 50 → 30, damit man das Ereignis erkennt). */
  nearSpanM: 30,
  /** Unterhalb dieser Distanz (m) zum nächsten Ereignis wird näher gezoomt … */
  nearEnterM: 20,
  /** … und erst oberhalb dieser Distanz wieder zurück (Hysterese gegen Pumpen). */
  nearExitM: 25,
  /** Lage der eigenen Position im freien Kartenbereich (0 = oben, 1 = unten). */
  positionFraction: 0.78,
  maxLookAheadFraction: 0.35,
  /** Kürzel-Versatz vom Knick (m) — Untergrenze; siehe labelClearancePt. */
  labelOffsetM: 2.5,
  /** Mindestabstand Kürzelmitte ↔ Knick in Bildschirmpunkten (Badge + Punkt + Luft). */
  labelClearancePt: 25,
  /** Mindestabstand zweier Kürzelmitten in Bildschirmpunkten. */
  labelMinSepPt: 36,
  /** Abstand Winkel-/G-Kürzel, wenn sie nebeneinander stehen. */
  pairSepPt: 30,
  /** Winkel und Gegenstand näher als das (m) ⇒ Kürzel nebeneinander. */
  pairDistanceM: 5,
  /** Deckkraft bereits passierter Kürzel. */
  passedOpacity: 0.45,
  /** Ein Ereignis gilt als passiert, wenn der Hund so weit (m) darüber hinaus ist. */
  passedMarginM: 1,
  /** Unterhalb dieser Distanz (m) wird der Hinweis «Nächstes Ereignis» hervorgehoben. */
  nextEventHighlightM: 6,
} as const;

// ── Wählbare Zoom-Stufe (T-218) ────────────────────────────────────────────
// Die Karte führt in jeder Stufe weiter nach; die Stufe bestimmt nur die sichtbare
// Kartenhöhe. Vor einem Winkel/Gegenstand geht jede Stufe näher heran (Hysterese
// wie bisher). «normal» ist der bisherige Ausschnitt.
export type SearchZoomLevel = 'near' | 'normal' | 'far';
export const SEARCH_ZOOM_LEVELS: readonly SearchZoomLevel[] = ['near', 'normal', 'far'];
export const DEFAULT_SEARCH_ZOOM_LEVEL: SearchZoomLevel = 'normal';
export const SEARCH_ZOOM: Readonly<Record<SearchZoomLevel, { spanM: number; nearSpanM: number }>> = {
  near:   { spanM: 30, nearSpanM: 22 },
  normal: { spanM: SEARCH_VIEW.spanM, nearSpanM: SEARCH_VIEW.nearSpanM },
  far:    { spanM: 120, nearSpanM: 50 },
};
export function isSearchZoomLevel(v: unknown): v is SearchZoomLevel {
  return v === 'near' || v === 'normal' || v === 'far';
}
/** Nächste Stufe beim Antippen: normal → nah → weit → normal. */
export function nextSearchZoomLevel(level: SearchZoomLevel): SearchZoomLevel {
  return level === 'normal' ? 'near' : level === 'near' ? 'far' : 'normal';
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ── A. Laufrichtung aus der gelegten Fährte ───────────────────────────────

/**
 * Blickrichtung (Grad, 0 = Nord) der Soll-Fährte am Fortschritt `progressM`.
 *
 * Gepeilt wird über ein festes Fährtenstück (≈ 15 m) INNERHALB des aktuellen
 * Schenkels: das Stück überschreitet nie einen markierten Winkel. Der Schenkel
 * wechselt erst, wenn der Fortschritt `turnDelayM` hinter dem Winkel liegt —
 * die Karte dreht also einige Meter NACH dem Winkel, nicht davor. Unmarkierte
 * Bögen (Schlangenlinie) folgen weich über die Sehne.
 *
 * null ⇒ keine belastbare Richtung (zu kurze Linie) → Aufrufer fällt auf die
 * GPS-/Positionsfolge zurück.
 */
export function trackHeadingAtProgress(
  line: readonly LL[], cum: readonly number[], progressM: number, cornerArcsM: readonly number[] = [],
  opts: { windowM?: number; turnDelayM?: number } = {},
): number | null {
  const total = cum.length ? cum[cum.length - 1] : 0;
  if (line.length < 2 || !(total > 0) || !Number.isFinite(progressM)) return null;
  const windowM = opts.windowM ?? SEARCH_VIEW.headingWindowM;
  const turnDelayM = opts.turnDelayM ?? SEARCH_VIEW.turnDelayM;
  const p = clamp(progressM, 0, total);

  let legStart = 0, legEnd = total;
  const corners = cornerArcsM.filter(c => Number.isFinite(c) && c > 0 && c < total).sort((a, b) => a - b);
  for (const c of corners) {
    if (p >= c + turnDelayM) legStart = c;
    else { legEnd = c; break; }
  }
  // Sehr kurzer Schenkel (z. B. zwei Marker direkt hintereinander): nicht aus
  // Zentimetern peilen, sondern das Fenster ohne Schenkelgrenze nehmen.
  if (legEnd - legStart < 1) { legStart = 0; legEnd = total; }

  const len = Math.min(windowM, legEnd - legStart);
  const a = clamp(p, legStart, legEnd - len);
  const from = pointAtDistance(line as LL[], cum as number[], a);
  const to = pointAtDistance(line as LL[], cum as number[], a + len);
  if (!from || !to) return null;
  if (Math.abs(from.latitude - to.latitude) < 1e-9 && Math.abs(from.longitude - to.longitude) < 1e-9) return null;
  return cameraBearing({ lat: from.latitude, lng: from.longitude }, { lat: to.latitude, lng: to.longitude });
}

// ── B. Fährten-Zoom ───────────────────────────────────────────────────────

/** Vorwärtsdistanz (m) zum nächsten Ereignis ab `progressM`; null = keines mehr. */
export function distanceToNextEventM(eventArcsM: readonly number[], progressM: number): number | null {
  let best: number | null = null;
  for (const arc of eventArcsM) {
    if (!Number.isFinite(arc) || arc < progressM) continue;
    const d = arc - progressM;
    if (best == null || d < best) best = d;
  }
  return best;
}

/**
 * Zoomstufe als sichtbare Kartenhöhe (m): Standard ≈ 70 m, kurz vor einem
 * Winkel/Gegenstand ≈ 30 m, danach zurück; je nach gewählter Stufe (SEARCH_ZOOM). `prevSpanM` trägt die Hysterese.
 */
export function searchViewSpanM(prevSpanM: number | null, distanceToNextM: number | null, level: SearchZoomLevel = 'normal'): number {
  const { nearEnterM, nearExitM } = SEARCH_VIEW;
  const { spanM, nearSpanM } = SEARCH_ZOOM[level];
  if (distanceToNextM == null || !Number.isFinite(distanceToNextM)) return spanM;
  if (distanceToNextM < nearEnterM) return nearSpanM;
  if (prevSpanM === nearSpanM && distanceToNextM <= nearExitM) return nearSpanM;
  return spanM;
}

/** Vertikaler Öffnungswinkel der Apple-Maps-Kamera (MapKit: 30°). */
const APPLE_CAMERA_FOV_DEG = 30;

/** iOS/Apple Maps: Kamerahöhe (`camera.altitude`, m) für eine sichtbare Kartenhöhe. */
export function appleAltitudeForSpanM(spanM: number): number {
  return spanM / (2 * Math.tan((APPLE_CAMERA_FOV_DEG / 2) * Math.PI / 180));
}

/** Android/Google Maps: `camera.zoom` für eine sichtbare Kartenhöhe (Web-Mercator, 256-dp-Kacheln). */
export function googleZoomForSpanM(spanM: number, latitudeDeg: number, mapHeightPt: number): number | null {
  if (!(spanM > 0) || !(mapHeightPt > 0) || !Number.isFinite(latitudeDeg)) return null;
  const metersPerPt = spanM / mapHeightPt;
  const zoom = Math.log2((156543.03392 * Math.cos(latitudeDeg * Math.PI / 180)) / metersPerPt);
  return Number.isFinite(zoom) ? clamp(zoom, 3, 21) : null;
}

/**
 * Look-ahead als Anteil der Kartenhöhe, sodass die eigene Position im FREIEN
 * Bereich zwischen den oberen und unteren Info-Karten liegt (statt darunter).
 */
export function lookAheadFractionForInsets(mapHeightPt: number, topInsetPt: number, bottomInsetPt: number): number {
  if (!(mapHeightPt > 0)) return 0.22;
  const top = clamp(topInsetPt, 0, mapHeightPt), bottom = clamp(bottomInsetPt, 0, mapHeightPt - top);
  const positionY = top + SEARCH_VIEW.positionFraction * (mapHeightPt - top - bottom);
  return clamp(positionY / mapHeightPt - 0.5, 0, SEARCH_VIEW.maxLookAheadFraction);
}

/** Linienstil der gelegten Fährte in der Absuche: breiter, mit dunkler Kontur, weiterhin solide. */
export function searchLaidStroke(base: { strokeColor: string; strokeWidth: number }): {
  strokeColor: string; strokeWidth: number; outlineColor: string; outlineWidth: number;
} {
  const strokeWidth = base.strokeWidth + 2;
  return { strokeColor: base.strokeColor, strokeWidth, outlineColor: '#04110F', outlineWidth: strokeWidth + 3 };
}

// ── E. Hinweis «Nächstes Ereignis» ────────────────────────────────────────

export interface SearchEvent { id: string; arcM: number; label: string }
export interface NextSearchEvents {
  next: { id: string; label: string; distanceM: number };
  /** Folge-Ereignis mit Abstand (m) ZUM ersten — «danach G2 nach 8 m». */
  then: { id: string; label: string; gapM: number } | null;
  highlight: boolean;
}

/** Nächstes und übernächstes Ereignis vor der virtuellen Hundeposition. */
export function nextSearchEvents(events: readonly SearchEvent[], dogProgressM: number): NextSearchEvents | null {
  if (!Number.isFinite(dogProgressM)) return null;
  const ahead = events.filter(e => Number.isFinite(e.arcM) && e.arcM > dogProgressM).sort((a, b) => a.arcM - b.arcM);
  if (ahead.length === 0) return null;
  const [first, second] = ahead;
  const distanceM = first.arcM - dogProgressM;
  return {
    next: { id: first.id, label: first.label, distanceM },
    then: second ? { id: second.id, label: second.label, gapM: second.arcM - first.arcM } : null,
    highlight: distanceM < SEARCH_VIEW.nextEventHighlightM,
  };
}

/** Bereits passiert (→ blasses Kürzel)? Ohne Bogenlänge nie blass. */
export function isEventPassed(arcM: number | null | undefined, dogProgressM: number): boolean {
  return arcM != null && Number.isFinite(arcM) && Number.isFinite(dogProgressM)
    && arcM < dogProgressM - SEARCH_VIEW.passedMarginM;
}

// ── C. Kürzel-Platzierung ─────────────────────────────────────────────────

export interface LabelFeature {
  key: string;
  kind: 'angle' | 'object';
  lat: number; lng: number;
  /** Kanonische Bogenlänge auf der Soll-Linie; fehlt sie, wird projiziert. */
  arcM?: number | null;
}
export interface PlacedLabel {
  key: string;
  /** Der Knick bzw. Ablagepunkt (kleiner Punkt, Beginn des Verbindungsstrichs). */
  anchor: { lat: number; lng: number };
  /** Mittelpunkt des Kürzels. */
  label: { lat: number; lng: number };
  /** true, wenn ein G-Kürzel neben das Kürzel eines nahen Winkels gestellt wurde. */
  paired: boolean;
}

interface XY { x: number; y: number }
const M_PER_DEG = 111320;
const sub = (a: XY, b: XY): XY => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: XY, b: XY): XY => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: XY, k: number): XY => ({ x: a.x * k, y: a.y * k });
const dot = (a: XY, b: XY) => a.x * b.x + a.y * b.y;
const norm = (a: XY) => Math.hypot(a.x, a.y);
const unit = (a: XY): XY | null => { const n = norm(a); return n > 1e-6 ? { x: a.x / n, y: a.y / n } : null; };
/** 90° gegen den Uhrzeigersinn = links der Laufrichtung (x Ost, y Nord). */
const leftOf = (a: XY): XY => ({ x: -a.y, y: a.x });

function distToSegment(p: XY, a: XY, b: XY): { d: number; t: number } {
  const ab = sub(b, a), l2 = dot(ab, ab);
  const t = l2 > 0 ? clamp(dot(sub(p, a), ab) / l2, 0, 1) : 0;
  return { d: norm(sub(p, add(a, mul(ab, t)))), t };
}

/**
 * Platziert Winkel- und G-Kürzel NEBEN der Fährte, damit der Knick frei bleibt:
 *  • Winkelkürzel auf der Aussenseite des Knicks (Verlängerung der Winkelhalbierenden),
 *  • G-Kürzel quer zur Linie auf der dem nächsten Winkelkürzel abgewandten Seite,
 *  • Winkel und G näher als `pairDistanceM` ⇒ beide nebeneinander,
 *  • kein Kürzel näher als `labelMinSepPt` an einem bereits gesetzten und keines
 *    auf der Linie (Ausweichkandidaten: weiter aussen, Gegenseite).
 *
 * `metersPerPt` = Meter je Bildschirmpunkt beim Absuche-Zoom. Die Kürzel sind
 * feste Bildschirmgrössen; der Versatz in Metern ergibt sich daraus (bei 70 m
 * Kartenhöhe ≈ 2–3,5 m). Deterministisch: gleiche Eingabe → gleiche Positionen.
 */
export function placeSearchLabels(
  line: readonly LL[], features: readonly LabelFeature[], metersPerPt: number,
): Map<string, PlacedLabel> {
  const out = new Map<string, PlacedLabel>();
  const pts = line.filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
  if (features.length === 0) return out;
  const origin = pts[0] ?? { latitude: features[0].lat, longitude: features[0].lng };
  const cosLat = Math.cos(origin.latitude * Math.PI / 180) || 1;
  const toXY = (lat: number, lng: number): XY => ({ x: (lng - origin.longitude) * M_PER_DEG * cosLat, y: (lat - origin.latitude) * M_PER_DEG });
  const toLatLng = (p: XY) => ({ lat: origin.latitude + p.y / M_PER_DEG, lng: origin.longitude + p.x / (M_PER_DEG * cosLat) });

  const xy = pts.map(p => toXY(p.latitude, p.longitude));
  const { cum, total } = buildArc(pts as LL[]);
  const pointAt = (arc: number): XY | null => {
    const p = pointAtDistance(pts as LL[], cum, arc);
    return p ? toXY(p.latitude, p.longitude) : null;
  };
  const lineDistance = (p: XY): number => {
    let best = Infinity;
    for (let i = 1; i < xy.length; i++) {
      if (pts[i].breakBefore) continue;
      const { d } = distToSegment(p, xy[i - 1], xy[i]);
      if (d < best) best = d;
    }
    return best;
  };
  const projectArc = (p: XY): number => {
    let best = Infinity, arc = 0;
    for (let i = 1; i < xy.length; i++) {
      if (pts[i].breakBefore) continue;
      const { d, t } = distToSegment(p, xy[i - 1], xy[i]);
      if (d < best) { best = d; arc = cum[i - 1] + (cum[i] - cum[i - 1]) * t; }
    }
    return arc;
  };
  const direction = (fromArc: number, toArc: number): XY | null => {
    const a = pointAt(clamp(fromArc, 0, total)), b = pointAt(clamp(toArc, 0, total));
    return a && b ? unit(sub(b, a)) : null;
  };

  const mpp = metersPerPt > 0 && Number.isFinite(metersPerPt) ? metersPerPt : SEARCH_VIEW.spanM / 520;
  const offsetM = Math.max(SEARCH_VIEW.labelOffsetM, SEARCH_VIEW.labelClearancePt * mpp);
  const minSepM = SEARCH_VIEW.labelMinSepPt * mpp;
  const pairSepM = SEARCH_VIEW.pairSepPt * mpp;
  const lineClearM = offsetM * 0.55;

  const items = features
    .filter(f => Number.isFinite(f.lat) && Number.isFinite(f.lng))
    .map(f => {
      const anchor = toXY(f.lat, f.lng);
      const arc = f.arcM != null && Number.isFinite(f.arcM) ? f.arcM : projectArc(anchor);
      return { f, anchor, arc };
    });
  const placed: { key: string; pos: XY }[] = [];
  // `partner`: das Kürzel, NEBEN das gestellt wird — dort gilt der engere Paarabstand.
  const choose = (candidates: XY[], partner?: XY): XY => {
    const free = (c: XY) => placed.every(p => norm(sub(p.pos, c)) >= (p.pos === partner ? pairSepM : minSepM) - 1e-6);
    return candidates.find(c => free(c) && lineDistance(c) >= lineClearM)
      ?? candidates.find(free)
      ?? candidates[0];
  };

  // 1) Winkel zuerst (in Fährtenreihenfolge): Aussenseite des Knicks.
  const angles = items.filter(i => i.f.kind === 'angle').sort((a, b) => a.arc - b.arc || a.f.key.localeCompare(b.f.key));
  const angleInfo: { anchor: XY; pos: XY; outside: XY }[] = [];
  for (const it of angles) {
    const dOut = direction(it.arc, it.arc + 6) ?? direction(it.arc - 6, it.arc);
    const dIn = direction(it.arc - 6, it.arc) ?? dOut;
    const travel = dIn ?? { x: 0, y: 1 };
    // Innenseite liegt zwischen rückwärtigem und vorwärtigem Schenkel; aussen = Gegenrichtung.
    const bend = dIn && dOut ? sub(dIn, dOut) : { x: 0, y: 0 };
    const outside = (norm(bend) >= 0.2 ? unit(bend) : null) ?? leftOf(travel);
    const pos = choose([
      add(it.anchor, mul(outside, offsetM)),
      add(it.anchor, mul(outside, offsetM * 1.7)),
      add(it.anchor, mul(leftOf(outside), offsetM)),
      add(it.anchor, mul(leftOf(outside), -offsetM)),
      add(it.anchor, mul(outside, -offsetM)),
    ]);
    placed.push({ key: it.f.key, pos });
    angleInfo.push({ anchor: it.anchor, pos, outside });
    out.set(it.f.key, { key: it.f.key, anchor: toLatLng(it.anchor), label: toLatLng(pos), paired: false });
  }

  // 2) Gegenstände: quer zur Linie, dem nächsten Winkelkürzel abgewandt — oder,
  //    bei einem nahen Winkel, direkt NEBEN dessen Kürzel.
  const objects = items.filter(i => i.f.kind === 'object').sort((a, b) => a.arc - b.arc || a.f.key.localeCompare(b.f.key));
  for (const it of objects) {
    const tangent = direction(it.arc - 3, it.arc + 3) ?? { x: 0, y: 1 };
    const normal = leftOf(tangent);
    let nearest: (typeof angleInfo)[number] | null = null, nearestD = Infinity;
    for (const a of angleInfo) {
      const d = norm(sub(a.anchor, it.anchor));
      if (d < nearestD) { nearestD = d; nearest = a; }
    }
    // «Andere Seite der Linie»: weg vom Kürzel des nächsten Winkels.
    const side = nearest && dot(sub(nearest.pos, it.anchor), normal) > 0 ? -1 : 1;
    const candidates: XY[] = [];
    const pairable = nearest != null && nearestD < SEARCH_VIEW.pairDistanceM;
    if (pairable && nearest) {
      const across = leftOf(nearest.outside);
      const towards = dot(sub(it.anchor, nearest.anchor), across) >= 0 ? 1 : -1;
      candidates.push(add(nearest.pos, mul(across, towards * pairSepM)));
      candidates.push(add(nearest.pos, mul(across, -towards * pairSepM)));
    }
    const pairCount = candidates.length;
    candidates.push(
      add(it.anchor, mul(normal, side * offsetM)),
      add(it.anchor, mul(normal, -side * offsetM)),
      add(it.anchor, mul(normal, side * offsetM * 1.7)),
      add(it.anchor, mul(normal, -side * offsetM * 1.7)),
    );
    const pos = choose(candidates, pairable && nearest ? nearest.pos : undefined);
    placed.push({ key: it.f.key, pos });
    out.set(it.f.key, {
      key: it.f.key, anchor: toLatLng(it.anchor), label: toLatLng(pos),
      paired: candidates.indexOf(pos) > -1 && candidates.indexOf(pos) < pairCount,
    });
  }
  return out;
}
