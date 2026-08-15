import { formatAngleCandidate, summarizeLaidMarkers, type AngleCandidateDiag } from '@/features/tracking/utils/angleDiagnostics';

// DEV-Feld-Diagnostik: reine, PII-freie Formatierung. (Logging selbst ist __DEV__-gegatet.)

const base: AngleCandidateDiag = {
  accuracyM: 8, turnAngleDeg: 92, direction: 'rechts', legBeforeM: 6.2, legAfterM: 5.8,
  headingDeviationBefore: 4, headingDeviationAfter: 6, accepted: true, rejectReason: null,
  angleKind: 'rechts', distanceFromStartM: 12.4,
};

describe('formatAngleCandidate', () => {
  it('akzeptierter Kandidat: enthält Typ + Bogenlänge, keine Rohkoordinaten', () => {
    const s = formatAngleCandidate(base);
    expect(s).toContain('accepted:rechts@12.4m');
    expect(s).toContain('acc=8m');
    expect(s).not.toMatch(/lat|lng|latitude|longitude/i);
  });

  it('verworfen wegen Accuracy > 20 m wird belegt', () => {
    const s = formatAngleCandidate({ ...base, accuracyM: 24, accepted: false, rejectReason: 'accuracy>20', angleKind: null, distanceFromStartM: null });
    expect(s).toContain('acc=24m');
    expect(s).toContain('rejected:accuracy>20');
  });

  it('fehlende Accuracy → n/a', () => {
    expect(formatAngleCandidate({ ...base, accuracyM: null })).toContain('acc=n/a');
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
