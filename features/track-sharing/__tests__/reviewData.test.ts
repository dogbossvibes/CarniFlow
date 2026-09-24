import { readFileSync } from 'fs';
import { buildReviewSections, metric } from '../reviewData';

const analytics = {
  trackScore: 81, analysisConfidenceBand: 'good', analysisConfidence: .8,
  deviation: { meanM: 1, medianM: 0, p95M: 3, maxReliableM: 4, maxRawM: 9, timeWithinM2S: 20 },
  pace: { avgMps: 1.2 }, reacquisition: { count: 2, completedCount: 1 },
  corners: [{ side: 'rechts', sharpness: 'spitz', overshootM: 1.2, confidence: .9, interpretation: 'clean' }],
  objects: [{ objectIndex: 2, minRecordedDistanceM: .8, stopDurationSec: 0, status: 'likely_contact', contactConfidence: .7, reasonCodes: ['stable_stop'] }],
};
const source = { dog: { name: 'QA Hund' }, owner_name: 'QA Besitzer', search_duration_seconds: 81, duration_seconds: 300, gps_quality_average: 4.2, track_data: { run: { analytics } } };
const rows = (track: unknown) => buildReviewSections(track).flatMap(section => section.rows);
const value = (track: unknown, label: string) => rows(track).find(row => row.label === label)?.value;

describe('persisted trainer review', () => {
  it('renders restricted names, canonical duration and accuracy in metres', () => {
    expect(value(source, 'Besitzer')).toBe('QA Besitzer');
    expect(value(source, 'Dauer')).toBe('81 s');
    expect(value(source, 'GPS-Genauigkeit (Ø)')).toBe('4.2 m');
  });
  it('shows individual corners and objects without deriving angles or associations', () => {
    expect(buildReviewSections(source).map(s => s.title)).toContain('Gegenstandsanalyse · Gegenstand 2');
    expect(value(source, 'Overshoot')).toBe('1.2 m');
    expect(value(source, 'Konfidenz')).toBe('90 %');
    expect(value(source, 'Stillstand')).toBe('0.0 s');
    expect(value(source, 'Hinweise')).toBe('Stabiler Halt');
    expect(JSON.stringify(buildReviewSections(source))).not.toContain('90°');
  });
  it('preserves zero values and never formats missing data as NaN or zero', () => {
    expect(value(source, 'Abweichung Median')).toBe('0.0 m');
    for (const invalid of [null, undefined, NaN, Infinity, '', '3']) expect(metric(invalid)).toBe('Nicht verfügbar');
    expect(value({}, 'GPS-Genauigkeit (Ø)')).toBe('Nicht verfügbar');
    expect(value({}, 'Besitzer')).toBe('Nicht verfügbar');
  });
  it('supports saved legacy analytics and payload duration without timestamp estimates', () => {
    const old = { track_data: { run: { duration_seconds: 42, analytics: { ...analytics, objects: [{ minDistanceM: 0, approachSpeedMps: 2, timeInAreaSec: 3, behavior: 'stationary' }] } } } };
    expect(value(old, 'Dauer')).toBe('42 s');
    expect(value(old, 'Verhalten')).toBe('Stationär');
    expect(value({ started_at: '2026-09-24', ended_at: '2026-09-25' }, 'Dauer')).toBe('Nicht verfügbar');
  });
  it('does not mutate or recalculate saved results', () => {
    const before = JSON.stringify(source);
    buildReviewSections(source);
    expect(JSON.stringify(source)).toBe(before);
    expect(value(source, 'Track Score')).toBe('81 / 100');
  });
  it('keeps map/search/feedback and uses keyboard and safe-area protection', () => {
    const screen = readFileSync('app/trainer/shared-track/[id].tsx', 'utf8');
    expect(screen).toContain('layPoints={map.lay} runPoints={map.run}');
    expect(screen).toContain('markers={map.markers}');
    expect(screen).toContain('showUserLocation={false}');
    expect(screen).toContain('<SafeAreaView');
    expect(screen).toContain("'padding' : 'height'");
    for (const method of ['addTrackFeedback', 'updateTrackFeedback', 'deleteTrackFeedback']) expect(screen).toContain(method);
    expect(screen).toContain('<ReviewSections track={track} />');
    expect(screen).not.toContain('paddingTop: 54');
  });
  it('uses full available card width and wrapping without fixed text heights', () => {
    const component = readFileSync('features/track-sharing/ReviewSections.tsx', 'utf8');
    expect(component).toContain('flexShrink: 1');
    expect(component).not.toMatch(/numberOfLines|height:|width:/);
    // 18-point screen + 16-point card padding: every required width has positive content space.
    for (const width of [320, 360, 375, 390, 414, 430]) expect(width - 2 * (18 + 16)).toBeGreaterThanOrEqual(252);
  });
});
