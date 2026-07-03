import { medianLatLng } from '@/features/tracking/utils/gpsFilter';

describe('medianLatLng (Startanker)', () => {
  it('gibt null bei leerer Eingabe', () => {
    expect(medianLatLng([])).toBeNull();
  });

  it('nimmt bei ungerader Anzahl den mittleren Wert', () => {
    const m = medianLatLng([
      { lat: 47.0, lng: 8.0 },
      { lat: 47.2, lng: 8.2 },
      { lat: 47.1, lng: 8.1 },
    ]);
    expect(m).toEqual({ lat: 47.1, lng: 8.1 });
  });

  it('ist robust gegen einen einzelnen Drift-Ausreißer (Median statt Mittelwert)', () => {
    // Vier eng beieinander + ein grober Ausreißer → Median bleibt bei der Wolke.
    const m = medianLatLng([
      { lat: 47.100, lng: 8.100 },
      { lat: 47.101, lng: 8.101 },
      { lat: 47.102, lng: 8.102 },
      { lat: 47.103, lng: 8.103 },
      { lat: 47.500, lng: 8.500 },   // Drift-Sprung
    ]);
    // Median (mittlerer von 5) → 47.102/8.102, NICHT vom Ausreißer mitgezogen.
    expect(m!.lat).toBeCloseTo(47.102, 5);
    expect(m!.lng).toBeCloseTo(8.102, 5);
  });
});
