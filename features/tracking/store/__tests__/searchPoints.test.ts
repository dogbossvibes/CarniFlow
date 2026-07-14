jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { useTrackingStore, type TrackPointSample } from '@/features/tracking/store/trackingStore';

const tp = (lat: number, lng: number): TrackPointSample => ({ lat, lng, accuracy: 5, t: Date.now() });

describe('trackingStore — Absuche-Spur getrennt (P1)', () => {
  beforeEach(() => { useTrackingStore.getState().reset(); });
  afterEach(() => { useTrackingStore.getState().reset(); });

  it('10. Suchpunkt wird in den Store (searchTrackPoints) geschrieben', () => {
    useTrackingStore.getState().addSearchPoint(tp(47.0, 8.0));
    expect(useTrackingStore.getState().searchTrackPoints).toHaveLength(1);
    expect(useTrackingStore.getState().searchTrackPoints[0]).toMatchObject({ lat: 47.0, lng: 8.0 });
  });

  it('12. gelegte Punkte (trackPoints) bleiben beim Hinzufügen von Suchpunkten unverändert', () => {
    const st = useTrackingStore.getState();
    st.addTrackPoint(tp(47.1, 8.1));
    st.addTrackPoint(tp(47.2, 8.2));
    const laidBefore = useTrackingStore.getState().trackPoints;
    st.addSearchPoint(tp(47.0, 8.0));
    const laidAfter = useTrackingStore.getState().trackPoints;
    expect(laidAfter).toBe(laidBefore);            // Referenz unverändert
    expect(laidAfter).toHaveLength(2);
    expect(useTrackingStore.getState().searchTrackPoints).toHaveLength(1);
  });

  it('13. neue Absuche setzt NUR die Suchpunkte zurück (gelegte bleiben)', () => {
    const st = useTrackingStore.getState();
    st.addTrackPoint(tp(47.1, 8.1));
    st.addSearchPoint(tp(47.0, 8.0));
    st.addSearchPoint(tp(47.0, 8.001));
    expect(useTrackingStore.getState().searchTrackPoints).toHaveLength(2);

    st.resetSearchPoints();
    expect(useTrackingStore.getState().searchTrackPoints).toHaveLength(0);
    expect(useTrackingStore.getState().trackPoints).toHaveLength(1);   // gelegt unberührt
  });
});
