/**
 * Replay-Screen reicht volle + abgespielte Absuche-Route aus derselben
 * Replay-Geometrie an die Karte (keine zweite Datenquelle, keine
 * Eligibility-/Zeitlogik-Änderung).
 */
import { readFileSync } from 'fs';

const src = readFileSync('app/track/replay/[id].tsx', 'utf8');

describe('Replay-Screen Route-Verdrahtung', () => {
  it('volle Route = geometry.points, abgespielt = replayTraveledPoints(geometry, elapsedSec)', () => {
    expect(src).toContain('const fullRoutePoints = useMemo(() => replayData?.geometry.points ?? [], [replayData]);');
    expect(src).toContain('replayTraveledPoints(replayData.geometry, state.elapsedSec)');
    expect(src).toContain('runPoints={fullRoutePoints} playedPoints={playedRoutePoints}');
  });
  it('Puck/Zeit/Geschwindigkeit unverändert', () => {
    expect(src).toContain('replayPositionAt(replayData.geometry, state.elapsedSec)');
    expect(src).toContain('tickReplay(prev, dt, replayData.geometry)');
    expect(src).toContain('REPLAY_SPEEDS');
  });
  it('Marker weiterhin aus buildTrackDetailMap (Referenzpositionen), nicht aus Search-GPS', () => {
    expect(src).toContain('detailMap.markers.map(m => ({ id: m.id, type: m.type, lat: m.lat, lng: m.lng, angleKind: m.angleKind, material: m.material }))');
  });
  it('Legende in allen Locales vorhanden', () => {
    for (const f of ['i18n/de-CH.ts', 'i18n/gsw-CH.ts', 'i18n/locales/en.ts', 'i18n/locales/fr.ts', 'i18n/locales/it.ts']) {
      const t = readFileSync(f, 'utf8');
      expect(t).toContain('track.replay.legendReference');
      expect(t).toContain('track.replay.legendSearch');
    }
  });
});
