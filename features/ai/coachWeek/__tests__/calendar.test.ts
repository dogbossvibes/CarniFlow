import { coachEventDraft, eventTypeFor, isPlanned, localDay, localInstant, plannedKeys } from '../calendar';
import { parsePlanned } from '../storage';
import type { CoachSuggestion } from '../types';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const sg = (over: Partial<CoachSuggestion> = {}): CoachSuggestion => ({
  key: 'coach:v1:d1:2026-11-28:corner:faehrte', rule: 'corner', discipline: 'faehrte', focus: 'corners', date: '2026-11-28',
  params: { corners: 2 }, reasons: [], priority: 70, hard: true, ...over,
});
const ev = (over: Record<string, unknown> = {}) => ({
  id: 'e1', dog_id: 'd1', dog_ids: ['d1'], type: 'tracking' as const, types: ['tracking' as const],
  start_at: localInstant('2026-11-28', 18), status: 'confirmed' as const, ...over,
});

describe('Coach → Kalender', () => {
  it('Termintyp je Sparte', () => {
    expect(eventTypeFor('faehrte')).toBe('tracking');
    expect(eventTypeFor('schutzdienst')).toBe('sd');
    expect(eventTypeFor('unterordnung')).toBe('uo');
    expect(eventTypeFor('mantrailing')).toBe('training');
  });

  it('Entwurf ist ein normaler eigener Termin: ohne Herkunftsfeld, ohne Trainer, ohne Erinnerung, 18–19 Uhr lokal', () => {
    const d = coachEventDraft(sg(), 'd1', { title: 'Fährte · Winkel üben', notes: 'Warum: …' });
    expect(d).toMatchObject({ type: 'tracking', types: ['tracking'], dog_id: 'd1', dog_ids: ['d1'], trainer_id: null, reminder_minutes: [], repeat: 'none', title: 'Fährte · Winkel üben', notes: 'Warum: …' });
    expect(d).not.toHaveProperty('source_type');
    expect(d).not.toHaveProperty('source_id');
    expect(localDay(d.start_at)).toBe('2026-11-28');
    expect(new Date(d.start_at).getHours()).toBe(18);
    expect(new Date(d.end_at!).getTime() - new Date(d.start_at).getTime()).toBe(60 * 60_000);
  });

  it('schon geplant: gemerkte ID oder gleicher Hund · Tag · Typ', () => {
    expect(isPlanned(sg(), 'd1', [ev({ id: 'x', start_at: localInstant('2026-11-29', 18) })], { [sg().key]: 'x' })).toBe(true);
    expect(isPlanned(sg(), 'd1', [ev()], {})).toBe(true);
    expect(isPlanned(sg(), 'd1', [ev({ dog_id: null, dog_ids: ['d1', 'd2'] })], {})).toBe(true);
  });

  it('nicht geplant: anderer Hund, anderer Tag, anderer Typ, abgesagt oder gemerkter Termin gelöscht', () => {
    expect(isPlanned(sg(), 'd1', [ev({ dog_id: 'd2', dog_ids: ['d2'] })], {})).toBe(false);
    expect(isPlanned(sg(), 'd1', [ev({ start_at: localInstant('2026-11-29', 9) })], {})).toBe(false);
    expect(isPlanned(sg(), 'd1', [ev({ type: 'uo', types: ['uo'] })], {})).toBe(false);
    expect(isPlanned(sg(), 'd1', [ev({ status: 'cancelled' })], {})).toBe(false);
    expect(isPlanned(sg(), 'd1', [], { [sg().key]: 'geloescht' })).toBe(false);
  });

  it('plannedKeys liefert nur die geplanten Vorschläge', () => {
    const a = sg(), b = sg({ key: 'coach:v1:d1:2026-11-28:pause:unterordnung', discipline: 'unterordnung', date: '2026-11-30' });
    expect(plannedKeys([a, b], 'd1', [ev()], {})).toEqual([a.key]);
  });

  it('gemerkte Übernahmen: Kaputtes und Fremdes wird ignoriert', () => {
    expect(parsePlanned(null)).toEqual({});
    expect(parsePlanned('[1]')).toEqual({});
    expect(parsePlanned(JSON.stringify({ 'coach:v1:a': 'e1', fremd: 'e2', 'coach:v1:b': 3 }))).toEqual({ 'coach:v1:a': 'e1' });
  });
});
