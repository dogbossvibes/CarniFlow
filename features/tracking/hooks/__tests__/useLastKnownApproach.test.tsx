// Feldfehler 26.11.: Anfahrt zeigt sofort den letzten bekannten Standort als «ungefähr».
// Nur Anzeige — sichtbar falsche Werte (alt, weit weg, grob) werden nicht gezeigt.
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { approximateApproach, useLastKnownApproach, LAST_KNOWN_LIMITS } from '@/features/tracking/hooks/useLastKnownApproach';

const mockGetLastKnown = jest.fn();
jest.mock('expo-location', () => ({
  getLastKnownPositionAsync: (opts: unknown) => mockGetLastKnown(opts),
}));

const START = { lat: 47.0, lng: 8.0 };
const NOW = 1_800_000_000_000;
// ~111 m nördlich des Ansatzes
const loc = (over: { lat?: number; acc?: number | null; ageMs?: number } = {}) => ({
  coords: { latitude: over.lat ?? 47.001, longitude: 8.0, accuracy: over.acc === undefined ? 20 : over.acc,
    altitude: null, altitudeAccuracy: null, heading: null, speed: null },
  timestamp: NOW - (over.ageMs ?? 60_000),
});

describe('approximateApproach', () => {
  it('liefert Position und ungefähre Distanz zum Ansatz', () => {
    const r = approximateApproach(loc() as any, START, NOW);
    expect(r).not.toBeNull();
    expect(r!.position).toEqual({ lat: 47.001, lng: 8.0 });
    expect(r!.distanceM).toBeGreaterThan(100);
    expect(r!.distanceM).toBeLessThan(125);
    expect(r!.accuracy).toBe(20);
  });
  it('verwirft zu alte Werte (> 60 min)', () => {
    expect(approximateApproach(loc({ ageMs: LAST_KNOWN_LIMITS.maxAgeMs + 1 }) as any, START, NOW)).toBeNull();
    expect(approximateApproach(loc({ ageMs: LAST_KNOWN_LIMITS.maxAgeMs }) as any, START, NOW)).not.toBeNull();
  });
  it('verwirft Werte weit weg vom Ansatz (> 2 km), z. B. ein ganz anderer Ort', () => {
    expect(approximateApproach(loc({ lat: 47.03 }) as any, START, NOW)).toBeNull();   // ~3.3 km
  });
  it('verwirft grobe Werte (> ±500 m), akzeptiert fehlende Genauigkeit', () => {
    expect(approximateApproach(loc({ acc: 800 }) as any, START, NOW)).toBeNull();
    expect(approximateApproach(loc({ acc: null }) as any, START, NOW)).not.toBeNull();
  });
  it('ohne Ansatz oder mit ungültigen Koordinaten: nichts anzeigen', () => {
    expect(approximateApproach(loc() as any, null, NOW)).toBeNull();
    expect(approximateApproach({ ...loc(), coords: { ...loc().coords, latitude: NaN } } as any, START, NOW)).toBeNull();
    expect(approximateApproach(null, START, NOW)).toBeNull();
  });
});

type Out = { current: ReturnType<typeof useLastKnownApproach> };
function Probe({ active, out }: { active: boolean; out: Out }) {
  const value = useLastKnownApproach(active, START);
  report(out, value);
  return null;
}
function report(out: Out, value: Out['current']) { out.current = value; }
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });

describe('useLastKnownApproach', () => {
  beforeEach(() => { mockGetLastKnown.mockReset(); jest.spyOn(Date, 'now').mockReturnValue(NOW); });
  afterEach(() => jest.restoreAllMocks());

  it('fragt nur während der Anfahrt, mit Alters- und Genauigkeitsgrenze', async () => {
    mockGetLastKnown.mockResolvedValue(loc());
    const out: Out = { current: null };
    let r!: ReactTestRenderer;
    await act(async () => { r = TestRenderer.create(<Probe active={false} out={out} />); });
    await flush();
    expect(mockGetLastKnown).not.toHaveBeenCalled();
    expect(out.current).toBeNull();
    await act(async () => { r.update(<Probe active out={out} />); });
    await flush();
    expect(out.current).not.toBeNull();
    expect(mockGetLastKnown).toHaveBeenCalledWith({ maxAge: LAST_KNOWN_LIMITS.maxAgeMs, requiredAccuracy: LAST_KNOWN_LIMITS.maxAccuracyM });
    await act(async () => { r.update(<Probe active={false} out={out} />); });
    expect(out.current).toBeNull();
    await act(async () => { r.unmount(); });
  });

  it('ohne Wert oder bei Fehler bleibt die Anzeige leer', async () => {
    for (const setup of [() => mockGetLastKnown.mockResolvedValueOnce(null), () => mockGetLastKnown.mockRejectedValueOnce(new Error('no permission'))]) {
      setup();
      const out: Out = { current: null };
      let r!: ReactTestRenderer;
      await act(async () => { r = TestRenderer.create(<Probe active out={out} />); });
      await flush();
      expect(out.current).toBeNull();
      await act(async () => { r.unmount(); });
    }
    expect(mockGetLastKnown).toHaveBeenCalledTimes(2);
  });
});
