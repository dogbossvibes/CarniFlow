import { buildCoachWeek, suggestionKey, type CoachInput, type CoachSession, type CoachTrack } from '..';
import { assignDays } from '../planWeek';
import { addDays, balanceRule, cornerRule, examRule, lyingRule, pauseRule, ratingRule, type CoachCandidate } from '../rules';
import { deCH } from '@/i18n/de-CH';
import { gswCH } from '@/i18n/gsw-CH';
import { fr } from '@/i18n/locales/fr';
import { it as itDict } from '@/i18n/locales/it';
import { en } from '@/i18n/locales/en';

const TODAY = '2026-11-27';
const ago = (n: number) => addDays(TODAY, -n);
const base = (over: Partial<CoachInput> = {}): CoachInput => ({
  today: TODAY, dogId: 'dog-1', ageMonths: 36, inHeat: null,
  disciplines: ['faehrte', 'unterordnung', 'schutzdienst'], sessions: [], tracks: [], exams: [], ...over,
});
const s = (daysAgo: number, discipline: CoachSession['discipline'], rating: number | null = null): CoachSession =>
  ({ date: ago(daysAgo), discipline, rating, durationMinutes: 30 });
const t = (daysAgo: number, over: Partial<CoachTrack> = {}): CoachTrack => ({
  date: ago(daysAgo), lyingMinutes: 30, cornerDeviationsM: [1, 1], articlesFound: 3, articlesTotal: 3, lengthSteps: 600, ...over,
});

describe('Coach-Regeln', () => {
  it('Prüfung in 3 Wochen: IGP bevorzugt alle drei Sparten, mit Wochenzahl', () => {
    const out = examRule(base({ exams: [{ date: addDays(TODAY, 21), examType: 'igp', label: 'IGP 2' }] }));
    expect(out.map(c => c.discipline)).toEqual(['faehrte', 'unterordnung', 'schutzdienst']);
    expect(out[0].reasons[0]).toEqual({ key: 'coach.reason.examWeeks', params: { label: 'IGP 2', days: 21, weeks: 3 } });
  });

  it('Prüfung in der Vergangenheit, heute oder in über 8 Wochen zählt nicht', () => {
    for (const d of [-3, 0, 57]) {
      expect(examRule(base({ exams: [{ date: addDays(TODAY, d), examType: 'igp', label: 'IGP 1' }] }))).toEqual([]);
    }
  });

  it('Prüfung bald: Tage statt Wochen; nur aktive Sparten', () => {
    const out = examRule(base({ disciplines: ['faehrte'], exams: [{ date: addDays(TODAY, 5), examType: 'igp', label: 'IGP 1' }] }));
    expect(out).toHaveLength(1);
    expect(out[0].reasons[0].key).toBe('coach.reason.examDays');
    expect(out[0].reasons[0].params?.days).toBe(5);
  });

  it('Pause: Unterordnung nach 5 Tagen dran, mit echter Tageszahl; nie trainiert = keine Pause', () => {
    const out = pauseRule(base({ sessions: [s(8, 'unterordnung'), s(2, 'faehrte')] }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ discipline: 'unterordnung', reasons: [{ key: 'coach.reason.pause', params: { days: 8 } }] });
  });

  it('Pause: Fährten aus dem Fährtenmodul zählen als Fährtentraining', () => {
    expect(pauseRule(base({ disciplines: ['faehrte'], sessions: [s(20, 'faehrte')], tracks: [t(2)] }))).toEqual([]);
  });

  it('Winkel: grösste mittlere Abweichung ab 3 m, mit Zahlen', () => {
    const tracks = [t(2, { cornerDeviationsM: [1, 6, 2] }), t(6, { cornerDeviationsM: [2, 4, null] }), t(10, { cornerDeviationsM: [1, 5, 3] })];
    const [c] = cornerRule(base({ tracks }));
    expect(c.reasons[0]).toEqual({ key: 'coach.reason.corner', params: { corner: 2, avg: 5, n: 3 } });
    expect(c.params).toEqual({ corners: 2, steps: 600 });
  });

  it('Winkel: kleine Abweichungen oder nur eine Fährte ergeben nichts', () => {
    expect(cornerRule(base({ tracks: [t(1), t(3)] }))).toEqual([]);
    expect(cornerRule(base({ tracks: [t(1, { cornerDeviationsM: [9] })] }))).toEqual([]);
  });

  it('Liegezeit: 3× gleich und alles gefunden → +15 Min., höchstens 180', () => {
    const [c] = lyingRule(base({ tracks: [t(1), t(4), t(8)] }));
    expect(c.params.lyingMinutes).toBe(45);
    expect(c.reasons[0].params).toEqual({ from: 30, to: 45, n: 3 });
    expect(lyingRule(base({ tracks: [t(1, { lyingMinutes: 170 }), t(4, { lyingMinutes: 170 }), t(8, { lyingMinutes: 170 })] }))[0].params.lyingMinutes).toBe(180);
    expect(lyingRule(base({ tracks: [t(1, { lyingMinutes: 180 }), t(4, { lyingMinutes: 180 }), t(8, { lyingMinutes: 180 })] }))).toEqual([]);
  });

  it('Liegezeit: Gegenstand vergessen, ungleiche oder fehlende Liegezeit → keine Steigerung', () => {
    expect(lyingRule(base({ tracks: [t(1, { articlesFound: 2 }), t(4), t(8)] }))).toEqual([]);
    expect(lyingRule(base({ tracks: [t(1, { lyingMinutes: 40 }), t(4), t(8)] }))).toEqual([]);
    expect(lyingRule(base({ tracks: [t(1, { lyingMinutes: null }), t(4), t(8)] }))).toEqual([]);
  });

  it('Bewertung sinkt oder ist tief → Grundlagen', () => {
    const falling = ratingRule(base({ sessions: [s(20, 'unterordnung', 5), s(18, 'unterordnung', 5), s(16, 'unterordnung', 4), s(6, 'unterordnung', 4), s(4, 'unterordnung', 3), s(2, 'unterordnung', 4)] }));
    expect(falling[0]).toMatchObject({ focus: 'basics', reasons: [{ key: 'coach.reason.ratingFalling', params: { from: 4.7, to: 3.7 } }] });
    const low = ratingRule(base({ sessions: [s(6, 'faehrte', 2), s(4, 'faehrte', 3), s(2, 'faehrte', 2)] }));
    expect(low[0].reasons[0]).toEqual({ key: 'coach.reason.ratingLow', params: { avg: 2.3 } });
    expect(ratingRule(base({ sessions: [s(6, 'faehrte', 4), s(4, 'faehrte', 4), s(2, 'faehrte', 5)] }))).toEqual([]);
  });

  it('Ausgleich: aktive Sparte seit 30 Tagen nicht trainiert, früher schon', () => {
    const out = balanceRule(base({ sessions: [s(40, 'schutzdienst'), s(2, 'unterordnung'), s(4, 'unterordnung'), s(6, 'faehrte')] }));
    expect(out).toEqual([expect.objectContaining({ discipline: 'schutzdienst', reasons: [{ key: 'coach.reason.balance', params: { total: 3 } }] })]);
  });
});

describe('Wochenvorschlag', () => {
  const rich = (): CoachInput => base({
    sessions: [s(9, 'unterordnung', 4), s(12, 'schutzdienst', 4), s(40, 'faehrte')],
    tracks: [t(2, { cornerDeviationsM: [1, 6] }), t(5, { cornerDeviationsM: [1, 5] }), t(9, { cornerDeviationsM: [1, 4] })],
    exams: [{ date: addDays(TODAY, 30), examType: 'igp', label: 'IGP 1' }],
  });

  it('keine Daten → no_data, keine erfundenen Vorschläge', () => {
    expect(buildCoachWeek(base(), { isPro: true })).toMatchObject({ state: 'no_data', suggestions: [] });
    expect(buildCoachWeek(base({ disciplines: [], sessions: [s(1, 'faehrte')] }), { isPro: true }).state).toBe('no_data');
  });

  it('nur alte, unauffällige Daten → ok mit Pausenvorschlag', () => {
    const w = buildCoachWeek(base({ disciplines: ['unterordnung'], sessions: [s(200, 'unterordnung', 4)] }), { isPro: true });
    expect(w.state).toBe('ok');
    expect(w.suggestions.map(x => x.rule)).toEqual(['pause']);
    expect(w.suggestions[0].reasons[0].params?.days).toBe(200);
  });

  it('Premium: je Sparte ein Vorschlag, Gründe gebündelt, Woche ab morgen, sortiert', () => {
    const w = buildCoachWeek(rich(), { isPro: true });
    expect(w.weekStart).toBe('2026-11-28');
    expect(w.weekEnd).toBe('2026-12-04');
    expect(new Set(w.suggestions.map(x => x.discipline)).size).toBe(w.suggestions.length);
    expect(w.suggestions.length).toBeGreaterThanOrEqual(2);
    const dates = w.suggestions.map(x => x.date);
    expect([...dates].sort()).toEqual(dates);
    dates.forEach(d => { expect(d >= w.weekStart && d <= w.weekEnd).toBe(true); });
    const fahrte = w.suggestions.find(x => x.discipline === 'faehrte')!;
    expect(fahrte.reasons.map(r => r.key)).toEqual(expect.arrayContaining(['coach.reason.examWeeks', 'coach.reason.corner']));
  });

  it('nie zwei harte Einheiten an Folgetagen', () => {
    const w = buildCoachWeek(rich(), { isPro: true });
    const hard = w.suggestions.filter(x => x.hard).map(x => x.date).sort();
    for (let i = 1; i < hard.length; i++) {
      expect(Date.parse(hard[i]) - Date.parse(hard[i - 1])).toBeGreaterThan(86_400_000);
    }
    const four = (['faehrte', 'schutzdienst', 'mantrailing', 'faehrte'] as const).map(d => ({ discipline: d } as CoachCandidate));
    const days = assignDays(four).sort((a, b) => a - b);
    for (let i = 1; i < days.length; i++) expect(days[i] - days[i - 1]).toBeGreaterThan(1);
  });

  it('NEWBIE-Vorschau: genau ein Vorschlag, der wichtigste', () => {
    const pro = buildCoachWeek(rich(), { isPro: true });
    const preview = buildCoachWeek(rich(), { isPro: false });
    expect(preview.suggestions).toHaveLength(1);
    const top = [...pro.suggestions].sort((a, b) => b.priority - a.priority)[0];
    expect(preview.suggestions[0].key).toBe(top.key);
  });

  it('Läufigkeit: Schutzdienst fällt weg, mit Hinweis; unbekannt = keine Annahme', () => {
    const heat = buildCoachWeek({ ...rich(), inHeat: true }, { isPro: true });
    expect(heat.suggestions.some(x => x.discipline === 'schutzdienst')).toBe(false);
    expect(heat.notes).toContainEqual({ key: 'coach.reason.heat' });
    const unknown = buildCoachWeek(rich(), { isPro: true });
    expect(unknown.suggestions.some(x => x.discipline === 'schutzdienst')).toBe(true);
    expect(unknown.notes).not.toContainEqual({ key: 'coach.reason.heat' });
  });

  it('Junghund und Senior: höchstens 3 Einheiten', () => {
    const many = base({
      disciplines: ['faehrte', 'unterordnung', 'schutzdienst', 'obedience', 'mantrailing'],
      sessions: [s(30, 'faehrte'), s(30, 'unterordnung'), s(30, 'schutzdienst'), s(30, 'obedience'), s(30, 'mantrailing')],
    });
    expect(buildCoachWeek(many, { isPro: true }).suggestions).toHaveLength(5);
    expect(buildCoachWeek({ ...many, ageMonths: 8 }, { isPro: true }).suggestions).toHaveLength(3);
    expect(buildCoachWeek({ ...many, ageMonths: 130 }, { isPro: true }).suggestions).toHaveLength(3);
  });

  it('ausgeblendete Vorschläge und ausgeschaltete Regeln kommen nicht wieder', () => {
    const first = buildCoachWeek(rich(), { isPro: true });
    const hidden = first.suggestions[0].key;
    const again = buildCoachWeek({ ...rich(), dismissedKeys: [hidden] }, { isPro: true });
    expect(again.suggestions.map(x => x.key)).not.toContain(hidden);
    const noExam = buildCoachWeek({ ...rich(), disabledRules: ['exam'] }, { isPro: true });
    expect(noExam.suggestions.flatMap(x => x.reasons.map(r => r.key))).not.toContain('coach.reason.examWeeks');
  });

  it('Schlüssel ist stabil und gleich wie suggestionKey', () => {
    const a = buildCoachWeek(rich(), { isPro: true });
    const b = buildCoachWeek(rich(), { isPro: true });
    expect(a).toEqual(b);
    const x = a.suggestions[0];
    expect(x.key).toBe(suggestionKey('dog-1', a.weekStart, x.rule, x.discipline));
  });

  it('Daten in der Zukunft werden nicht als Training gezählt', () => {
    const w = buildCoachWeek(base({ disciplines: ['unterordnung'], sessions: [s(-2, 'unterordnung'), s(10, 'unterordnung')] }), { isPro: true });
    expect(w.suggestions[0].reasons[0].params?.days).toBe(10);
  });
});

describe('Coach-Texte', () => {
  const keys = Object.keys(deCH).filter(k => k.startsWith('coach.reason.') || k.startsWith('coach.focus.') || k.startsWith('coach.week.'));
  it('alle Begründungen und Schwerpunkte haben Texte in 5 Sprachen mit denselben Platzhaltern', () => {
    expect(keys.length).toBeGreaterThanOrEqual(17);
    const ph = (v: string) => (v.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const dict of [gswCH, fr, itDict, en] as Record<string, string | undefined>[]) {
      for (const k of keys) {
        expect(typeof dict[k]).toBe('string');
        expect(ph(dict[k] ?? '')).toBe(ph((deCH as Record<string, string>)[k]));
      }
    }
  });
  it('jeder von den Regeln benutzte Schlüssel existiert', () => {
    const used = ['examDays', 'examWeeks', 'pause', 'corner', 'lyingUp', 'ratingFalling', 'ratingLow', 'balance', 'heat', 'fewSignals']
      .map(k => `coach.reason.${k}`);
    used.forEach(k => { expect(keys).toContain(k); });
    (['corners', 'lying', 'basics', 'exam_run', 'maintain'] as const).forEach(f => { expect(keys).toContain(`coach.focus.${f}`); });
  });
});
