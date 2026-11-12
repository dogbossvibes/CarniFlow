/**
 * Auswertungs-Screen (app/track/[id].tsx, Header „AUSWERTUNG") — Konsistenz:
 *   • Score-Header: Bewertung genau EINMAL, nichts Langes im Ring
 *   • Warnhinweis und Analyse-Karte aus EINER Quelle (trackAnalysisAvailability)
 *   • Fährtenverlauf-Karte zeigt nur gespeicherte Marker (remote → lokaler Fallback)
 *   • Zähler „Winkel gelegt" = corners_total (Lay-Marker), nicht Analytics-Ecken
 * Statisches Quell-Muster wie analyse-section.test.ts (Screen ist ohne schweren
 * Render-Harness nicht renderbar); Datenpfade werden zusätzlich mit den reinen
 * Funktionen (buildTrackDetailDisplay / pickDetailMarkers) durchgespielt.
 */
import { readFileSync } from 'fs';
import { buildTrackDetailDisplay } from '@/features/tracking/utils/trackDetailDisplay';
import { pickDetailMarkers } from '@/features/tracking/utils/localTrackDetail';

const source = () => readFileSync('app/track/[id].tsx', 'utf8');
const jsxOnly = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');

describe('Score-Header', () => {
  it('Ring zeigt nur Zahl + /100 — kein Label, keine Notenstufe im Ring', () => {
    const src = jsxOnly(source());
    expect(src).toContain('<TrackScoreRing value={score} size={96} stroke={9} showMax />');
    expect(src).not.toMatch(/<TrackScoreRing[^>]*label=/);
    expect(src).not.toMatch(/<TrackScoreRing[^>]*sub=/);
  });
  it('Notenstufe genau EINMAL (Headline rechts); verdict.sub wird nicht mehr gerendert', () => {
    const src = jsxOnly(source());
    expect(src.match(/\{verdict\.headline\}/g)).toHaveLength(1);
    expect(src).not.toContain('verdict.sub');
  });
  it('„Manuelle Bewertung" steht als eigener Text unter dem Ring, ausserhalb der Kreisgrafik', () => {
    const src = jsxOnly(source());
    const ring = src.indexOf('<TrackScoreRing value={score}');
    const caption = src.indexOf("<Text style={s.heroRingCaption} numberOfLines={2}>{t('track.manualScoreLabel')}</Text>");
    const colEnd = src.indexOf('</View>', ring);
    expect(ring).toBeGreaterThan(-1);
    expect(caption).toBeGreaterThan(ring);
    expect(caption).toBeLessThan(colEnd);   // dieselbe Spalte (heroRingCol), nicht im Ring
  });
  it('Kleine Geräte: feste Ring-Spalte, rechte Spalte schrumpfbar, Headline skaliert statt zu überlappen', () => {
    const src = source();
    expect(src).toMatch(/heroRingCol:\s*\{[^}]*width: 110/);
    expect(src).toMatch(/heroBody:\s*\{[^}]*flex: 1, minWidth: 0/);
    expect(src).toContain('<Text style={s.heroHeadline} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{verdict.headline}</Text>');
    // Innenbreite bei 320 pt: 320 − 2×18 (content) − 2×18 (card) = 248 → rechts 248 − 110 − 14 = 124 pt ≥ 120.
    expect(src).toMatch(/hero:\s*\{[^}]*gap: 14, padding: 18/);
    expect(src).toMatch(/content:\s*\{[^}]*paddingHorizontal: 18/);
  });
});

describe('Analyse-Zustand — eine Quelle', () => {
  it('Warnhinweis und Analyse-Karte hängen beide an trackAnalysisAvailability', () => {
    const src = source();
    expect(src).toContain('const availability = useMemo(() => trackAnalysisAvailability(data), [data]);');
    expect(src).toContain('{availability.showNoSearchTrackWarning && (');
    expect(src).toContain('const analytics: TrackAnalytics | TrackAnalyticsV3 | null = availability.analytics as TrackAnalytics | TrackAnalyticsV3 | null;');
    expect(src).toContain('{analytics && (');
    // Keine zweite, unabhängige Geometrie-/Analytics-Prüfung mehr im Screen.
    expect(src).not.toContain('hasValidSearchGeometry');
    expect(src).not.toContain('distance_meters ?? 0) > 0');
    expect(src).not.toContain('data?.track_data?.run?.analytics');
  });
  it('Default der manuellen Abschnitte nutzt dasselbe Geometrie-Signal', () => {
    expect(source()).toContain('hasSearchGeometry(d)));');
  });
});

describe('Fährtenverlauf — Marker-Datenquelle', () => {
  it('Karte bekommt ausschliesslich gespeicherte Marker (data.markers → buildTrackDetailDisplay → TrackingMap)', () => {
    const src = source();
    expect(src).toContain('const detail = buildTrackDetailDisplay(data, displaySupplement, authenticatedSession?.user.id);');
    expect(src).toContain('const markers: MapMarker[] = detail.markers.map(m => ({');
    expect(src).toContain('layPoints={map.lay} runPoints={map.run} markers={map.markers}');
    // Keine Marker aus analytics.corners (nur atM, keine Koordinate, nicht gespeichert).
    expect(src).not.toMatch(/analytics\.corners[^\n]*lat/);
  });
  it('Remote 0 Marker → lokale Marker derselben Session (bestehender Fallback bleibt verdrahtet)', () => {
    const src = source();
    expect(src).toContain('if (d && !localOnly && !(d.markers?.length)) {');
    expect(src).toContain('const picked = pickDetailMarkers(d.markers ?? [], local?.markers ?? []);');
  });

  const R  = { id: 'r-1', marker_type: 'winkel', angle_kind: 'rechts',       latitude: 47.0001, longitude: 8.0001, distance_from_start: 5.9 };
  const SR = { id: 'r-2', marker_type: 'winkel', angle_kind: 'spitz_rechts', latitude: 47.0002, longitude: 8.0002, distance_from_start: 27.5 };
  const L1 = { id: 'mk_1', marker_type: 'winkel', angle_kind: 'rechts',       latitude: 47.0001, longitude: 8.0001, distance_from_start: 5.9 };
  const L2 = { id: 'mk_2', marker_type: 'winkel', angle_kind: 'spitz_rechts', latitude: 47.0002, longitude: 8.0002, distance_from_start: 27.5 };
  const points = [{ latitude: 47, longitude: 8, point_type: 'lay' }, { latitude: 47.0003, longitude: 8.0003, point_type: 'lay' }];

  it('Remote-Marker R + SR → beide Winkeltypen mit Koordinate an die Karte', () => {
    const map = buildTrackDetailDisplay({ points, markers: pickDetailMarkers([R, SR], []), runs: [] }, null);
    expect(map.hasLay).toBe(true);
    expect(map.markers.map(m => [m.type, m.angleKind, m.lat != null && m.lng != null])).toEqual([
      ['winkel', 'rechts', true], ['winkel', 'spitz_rechts', true],
    ]);
  });
  it('Remote 0 + lokal R + SR (Fall qa-0ec8c4ca) → lokale Marker sichtbar', () => {
    const map = buildTrackDetailDisplay({ points, markers: pickDetailMarkers([], [L1, L2]), runs: [] }, null);
    expect(map.markers.map(m => m.angleKind)).toEqual(['rechts', 'spitz_rechts']);
  });
  it('lokale Linienergänzung erhält Remote-Marker und übernimmt keine zusätzlichen lokalen oder Analytics-Winkel', () => {
    const identity = { id: 'track-1', owner_id: 'owner-1', dog_id: 'dog-1' };
    const remote = { ...identity, points: points.slice(0, 1), markers: [R, SR], runs: [],
      track_data: { run: { analytics: { corners: [{ side: 'links' }] } } } };
    const local = { ...identity, points, markers: [{ ...L1, angle_kind: 'links' }], runs: [] };
    const before = JSON.stringify({ remote, local });
    const map = buildTrackDetailDisplay(remote, local, 'owner-1');
    expect(map.lay).toHaveLength(2); // die lokale Ergänzung wurde tatsächlich benutzt
    expect(map.markers.map(m => [m.id, m.angleKind, m.lat, m.lng])).toEqual([
      [R.id, R.angle_kind, R.latitude, R.longitude],
      [SR.id, SR.angle_kind, SR.latitude, SR.longitude],
    ]);
    expect(JSON.stringify({ remote, local })).toBe(before);
  });
  it('lokaler Marker-Fallback wird auch bei aktiver Linienergänzung genau einmal dargestellt', () => {
    const identity = { id: 'track-1', owner_id: 'owner-1', dog_id: 'dog-1' };
    const local = { ...identity, points, markers: [L1, L2], runs: [] };
    const resolved = { ...identity, points: points.slice(0, 1), markers: pickDetailMarkers([], local.markers), runs: [] };
    const map = buildTrackDetailDisplay(resolved, local, 'owner-1');
    expect(map.lay).toHaveLength(2);
    expect(map.markers.map(m => m.id)).toEqual([L1.id, L2.id]);
    expect(map.markers.map(m => m.angleKind)).toEqual(['rechts', 'spitz_rechts']);
  });
  it('keine erfundenen Winkel: nur gespeicherte angle_kinds, nichts aus Ground Truth (L/SL fehlen)', () => {
    const map = buildTrackDetailDisplay({ points, markers: pickDetailMarkers([], [L1, L2]), runs: [] }, null);
    expect(map.markers).toHaveLength(2);
    expect(map.markers.map(m => m.angleKind)).not.toContain('links');
    expect(map.markers.map(m => m.angleKind)).not.toContain('spitz_links');
    // Analytics-Ecken (corners_total 3 / analytics.corners 2 in Production) sind KEINE Kartenmarker.
    const remoteOnly = buildTrackDetailDisplay({ points, markers: [], runs: [], track_data: { run: { analytics: { corners: [{ side: 'rechts' }, { side: 'links' }] } } } }, null);
    expect(remoteOnly.markers).toEqual([]);
  });
});

describe('Zähler „Winkel"', () => {
  it('Highlight nennt corners_total explizit als gelegte Winkel; Analytics-Ecken bleiben in der Analyse-Karte', () => {
    const src = source();
    expect(src).toContain("const corners = data.corners_total ?? 0;");
    expect(src).toContain("label: 'Winkel gelegt' }");
    expect(src).toContain('{analytics.corners.map((c, i) => (');
  });
});
