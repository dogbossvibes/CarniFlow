import {
  getTrackingStatusMeta, type TrackingDisplayStatus,
} from '@/features/tracking/components/TrackingStatusBadge';

describe('getTrackingStatusMeta', () => {
  it('liefert die geforderten Labels', () => {
    const labels = (s: TrackingDisplayStatus) => getTrackingStatusMeta(s).label;
    expect(labels('gps_warmup')).toBe('GPS wird stabilisiert');
    expect(labels('ready')).toBe('Bereit');
    expect(labels('recording')).toBe('Aufnahme aktiv');
    expect(labels('moving')).toBe('Aufnahme aktiv');
    expect(labels('slow_moving')).toBe('Langsame Bewegung');
    expect(labels('stationary')).toBe('Stillstand erkannt');
    expect(labels('drift')).toBe('Drift erkannt');
    expect(labels('gps_poor')).toBe('GPS ungenau');
    expect(labels('sharp_turn')).toBe('Winkel erkannt');
    expect(labels('object_placed')).toBe('Gegenstand gesetzt');
  });

  it('liefert Farbe und Icon je Status', () => {
    const m = getTrackingStatusMeta('drift');
    expect(m.color).toBeTruthy();
    expect(m.icon).toBe('warning');
  });
});
