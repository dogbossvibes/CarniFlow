import {
  getTrackingStatusMeta, type TrackingDisplayStatus,
} from '@/features/tracking/components/TrackingStatusBadge';

describe('getTrackingStatusMeta', () => {
  it('liefert die geforderten Label-Keys', () => {
    const labels = (s: TrackingDisplayStatus) => getTrackingStatusMeta(s).labelKey;
    expect(labels('gps_warmup')).toBe('track.status.gpsWarmup');
    expect(labels('ready')).toBe('track.status.ready');
    expect(labels('recording')).toBe('track.status.recording');
    expect(labels('moving')).toBe('track.status.recording');
    expect(labels('slow_moving')).toBe('track.status.slowMoving');
    expect(labels('stationary')).toBe('track.status.stationary');
    expect(labels('drift')).toBe('track.status.drift');
    expect(labels('gps_poor')).toBe('track.status.gpsPoor');
    expect(labels('sharp_turn')).toBe('track.status.sharpTurn');
    expect(labels('object_placed')).toBe('track.status.objectPlaced');
  });

  it('liefert Farbe und Icon je Status', () => {
    const m = getTrackingStatusMeta('drift');
    expect(m.color).toBeTruthy();
    expect(m.icon).toBe('warning');
  });
});
