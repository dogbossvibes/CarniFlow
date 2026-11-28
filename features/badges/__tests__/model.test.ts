import {
  BADGES, TOTAL_STAGES, activityFromFeedItem, computeBadges, isEarly, isTopExam, longestWeekStreak,
  mergeSeen, newlyEarned, pickNextGoal, placeKey, sanitizeSeen, seasonOf,
  type BadgeActivity, type BadgeExam,
} from '../model';
import type { FeedItem } from '@/services/trainingFeed';

const act = (date: string, over: Partial<BadgeActivity> = {}): BadgeActivity => ({
  date, dogId: 'd1', disciplines: ['Unterordnung'], startedAt: null, trackMeters: null, place: null, placeName: null, ...over,
});
const byId = (s: ReturnType<typeof computeBadges>, id: string) => s.badges.find(b => b.def.id === id)!;

describe('Abzeichen: Kennzahlen', () => {
  it('Wochenserie zählt Kalenderwochen in Folge, Ruhetage stören nicht', () => {
    // Mo 2026-11-02, So 2026-11-08 (gleiche Woche), Mi 11-11, Fr 11-20, Lücke, 12-07
    expect(longestWeekStreak(['2026-11-02', '2026-11-08', '2026-11-11', '2026-11-20', '2026-12-07'])).toBe(3);
    expect(longestWeekStreak([])).toBe(0);
    // Jahreswechsel: Mo 2026-12-28 und Mo 2027-01-04 sind aufeinanderfolgende Wochen
    expect(longestWeekStreak(['2026-12-28', '2027-01-04'])).toBe(2);
  });

  it('Jahreszeiten nach Monaten (Nordhalbkugel)', () => {
    expect(seasonOf('2026-03-01')).toBe('spring');
    expect(seasonOf('2026-08-31')).toBe('summer');
    expect(seasonOf('2026-11-28')).toBe('autumn');
    expect(seasonOf('2026-12-01')).toBe('winter');
    expect(seasonOf('2027-02-28')).toBe('winter');
  });

  it('früher Start nur zwischen 4 und 7 Uhr Ortszeit', () => {
    const at = (h: number) => new Date(2026, 5, 1, h, 30).toISOString();
    expect(isEarly(at(5))).toBe(true);
    expect(isEarly(at(7))).toBe(false);
    expect(isEarly(at(2))).toBe(false);
    expect(isEarly(null)).toBe(false);
    expect(isEarly('kaputt')).toBe(false);
  });

  it('Orte: nahe Punkte fallen zusammen, entfernte nicht, Ortsname als Ersatz', () => {
    const a = placeKey({ place: { lat: 47.3769, lng: 8.5417 }, placeName: null });
    const b = placeKey({ place: { lat: 47.3770, lng: 8.5418 }, placeName: null });
    const c = placeKey({ place: { lat: 47.4500, lng: 8.5417 }, placeName: null });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(placeKey({ place: null, placeName: '  Hundeplatz   Nord ' })).toBe(placeKey({ place: null, placeName: 'hundeplatz nord' }));
    expect(placeKey({ place: null, placeName: null })).toBeNull();
  });

  it('Vorzüglich über Punkte oder Bewertung, nie bei nicht bestanden', () => {
    const e = (o: Partial<BadgeExam>): BadgeExam => ({ dogId: 'd1', passed: true, totalPoints: null, maxPoints: null, rating: null, ...o });
    expect(isTopExam(e({ totalPoints: 290, maxPoints: 300 }))).toBe(true);
    expect(isTopExam(e({ totalPoints: 280, maxPoints: 300 }))).toBe(false);
    expect(isTopExam(e({ rating: 'Vorzüglich' }))).toBe(true);
    expect(isTopExam(e({ rating: 'V', passed: false }))).toBe(false);
  });
});

describe('Abzeichen: Berechnung', () => {
  it('leere Daten: keine Stufe, Ziel sind die ersten Trainingstage', () => {
    const s = computeBadges([], []);
    expect(s.earnedStages).toBe(0);
    expect(s.totalStages).toBe(TOTAL_STAGES);
    expect(s.badges).toHaveLength(BADGES.length);
    expect(s.nextGoal?.def.id).toBe('trainingDays');
  });

  it('Stufen, Sparten, Fährtenkilometer und Prüfungen', () => {
    const acts: BadgeActivity[] = [];
    for (let i = 1; i <= 12; i++) acts.push(act(`2026-04-${String(i).padStart(2, '0')}`));
    acts.push(act('2026-07-01', { disciplines: ['Fährte'], trackMeters: 2600, place: { lat: 47.1, lng: 8.1 } }));
    acts.push(act('2026-07-02', { disciplines: ['Fährte'], trackMeters: 2500, place: { lat: 47.3, lng: 8.3 } }));
    acts.push(act('2026-07-03', { disciplines: ['Fährte', 'Unterordnung'], place: null, placeName: 'Wald' }));
    const exams: BadgeExam[] = [
      { dogId: 'd1', passed: true, totalPoints: 97, maxPoints: 100, rating: null },
      { dogId: 'd1', passed: false, totalPoints: 50, maxPoints: 100, rating: null },
    ];
    const s = computeBadges(acts, exams);
    expect(byId(s, 'trainingDays')).toMatchObject({ value: 15, tier: 1, next: 50 });
    expect(byId(s, 'spring')).toMatchObject({ value: 12, tier: 2 });
    expect(byId(s, 'disciplines')).toMatchObject({ value: 2, tier: 1 });
    expect(byId(s, 'trackKm')).toMatchObject({ value: 5.1, tier: 1 });
    expect(byId(s, 'places')).toMatchObject({ value: 3, tier: 1 });
    expect(byId(s, 'focus')).toMatchObject({ value: 13, tier: 1, label: 'Unterordnung' });
    expect(byId(s, 'examsPassed')).toMatchObject({ value: 1, tier: 1 });
    expect(byId(s, 'examTop')).toMatchObject({ value: 1, tier: 1 });
    expect(byId(s, 'winter')).toMatchObject({ value: 0, tier: 0, next: 3, ratio: 0 });
    expect(s.earnedStages).toBe(s.badges.reduce((n, b) => n + b.tier, 0));
  });

  it('Hundefilter trennt Trainings und Prüfungen', () => {
    const acts = [act('2026-01-05', { dogId: 'a' }), act('2026-01-06', { dogId: 'b' }), act('2026-01-07', { dogId: 'b' })];
    const exams: BadgeExam[] = [{ dogId: 'a', passed: true, totalPoints: null, maxPoints: null, rating: null }];
    expect(byId(computeBadges(acts, exams, { dogId: 'b' }), 'trainingDays').value).toBe(2);
    expect(byId(computeBadges(acts, exams, { dogId: 'b' }), 'examsPassed').value).toBe(0);
    expect(byId(computeBadges(acts, exams, { dogId: 'a' }), 'examsPassed').value).toBe(1);
  });

  it('nächstes Ziel: das offene Abzeichen mit dem grössten Fortschritt', () => {
    const s = computeBadges([act('2026-03-02'), act('2026-03-03')], []);
    // Frühling 2 von 3 ist näher als Trainingstage 2 von 10
    expect(pickNextGoal(s.badges)?.def.id).toBe('spring');
  });
});

describe('Abzeichen: aus dem Feed', () => {
  const base = {
    id: 'x', owner_id: 'o', dog_id: 'd1', session_date: '2026-11-28', started_at: null, ended_at: null,
    duration_sec: null, rating: null, score: null, notes: null, photos: [], videos: [], audio_files: [],
    motivation: null, konzentration: null, praezision: null, ausdauer: null, trieblage: null, impulskontrolle: null,
    shared_with_trainer: false, status: 'completed', created_at: '2026-11-28T08:00:00Z',
  } as const;

  it('übernimmt Fährtenstrecke und Ort nur bei Fährten und gültigen Werten', () => {
    const track = { ...base, source: 'track', distance_meters: 800, place: { lat: 47, lng: 8 }, location_name: ' Feld ',
      exercises: [{ discipline: 'Fährte', exercise_name: 'GPS', rating: null, notes: null, duration_sec: null, seq_index: 0 }] } as unknown as FeedItem;
    expect(activityFromFeedItem(track)).toMatchObject({ trackMeters: 800, place: { lat: 47, lng: 8 }, placeName: 'Feld', disciplines: ['Fährte'] });
    const unit = { ...base, source: 'unit', distance_meters: 800, place: { lat: 0, lng: 0 } } as unknown as FeedItem;
    expect(activityFromFeedItem(unit)).toMatchObject({ trackMeters: null, place: null, disciplines: [] });
    expect(activityFromFeedItem({ ...base, session_date: '', source: 'unit' } as unknown as FeedItem)).toBeNull();
  });
});

describe('Abzeichen: «Neu» als lokale Anzeigehilfe', () => {
  it('meldet nur gestiegene Stufen und setzt gesehene Stufen nie herab', () => {
    const s = computeBadges(Array.from({ length: 10 }, (_, i) => act(`2026-05-${String(i + 1).padStart(2, '0')}`)), []);
    const earned = s.badges.filter(b => b.tier > 0).map(b => b.def.id);
    expect(newlyEarned(s.badges, null).map(b => b.def.id)).toEqual(earned);
    const seen = mergeSeen({ trainingDays: 3 }, s.badges);
    expect(seen.trainingDays).toBe(3);
    expect(newlyEarned(s.badges, seen)).toEqual([]);
  });
  it('bereinigt gespeicherte Werte robust', () => {
    expect(sanitizeSeen('x')).toBeNull();
    expect(sanitizeSeen({ trainingDays: 2, spring: 9, nope: 1, winter: 1.5 })).toEqual({ trainingDays: 2 });
  });
});
