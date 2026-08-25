import { formatAngleCandidate, summarizeLaidMarkers, type AngleCandidateDiag } from '@/features/tracking/utils/angleDiagnostics';

// DEV-Feld-Diagnostik: reine, PII-freie Formatierung. (Logging selbst ist __DEV__-gegatet.)

const base: AngleCandidateDiag = {
  timestampMs: Date.UTC(2026, 7, 18), positionArcM: 12.4,
  inputAccuracyM: 8, usedAccuracyM: 8, turnDeg: 92, direction: 'rechts',
  legBeforeM: 6.2, legAfterM: 5.8, straightBefore: 0.9, straightAfter: 0.8,
  confidence: 0.82, state: 'accept', reason: null, angleKind: 'rechts', markerId: 'angle-1',
};

describe('formatAngleCandidate', () => {
  it('akzeptierter Kandidat: enthält Typ + Bogenlänge, keine Rohkoordinaten', () => {
    const s = formatAngleCandidate(base);
    expect(s).toContain('arcM=12.4');
    expect(s).toContain('accIn=8m');
    expect(s).toContain('state=accept');
    expect(s).toContain('marker=angle-1');
    expect(s).not.toMatch(/lat|lng|latitude|longitude/i);
  });

  it('pending wegen niedriger Confidence wird belegt', () => {
    const s = formatAngleCandidate({ ...base, inputAccuracyM: 24, usedAccuracyM: 24, state: 'pending', reason: 'low_confidence', angleKind: null, markerId: null });
    expect(s).toContain('accIn=24m');
    expect(s).toContain('state=pending');
    expect(s).toContain('reason=low_confidence');
  });

  it('fehlende Accuracy → n/a', () => {
    expect(formatAngleCandidate({ ...base, inputAccuracyM: null, usedAccuracyM: null })).toContain('accIn=n/a');
  });
});

describe('summarizeLaidMarkers', () => {
  it('zählt Winkel/Gegenstände und listet angleKinds', () => {
    const s = summarizeLaidMarkers([
      { type: 'winkel', angleKind: 'rechts', distance_from_start: 8 },
      { type: 'winkel', angleKind: 'spitz_links', distance_from_start: 20 },
      { type: 'gegenstand', distance_from_start: 14 },
    ]);
    expect(s).toContain('total=3');
    expect(s).toContain('winkel=2');
    expect(s).toContain('rechts,spitz_links');
    expect(s).toContain('gegenstand=1');
  });

  it('keine Winkel → Platzhalter', () => {
    expect(summarizeLaidMarkers([{ type: 'gegenstand' }])).toContain('winkel=0 (—)');
  });
});
