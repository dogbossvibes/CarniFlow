import TestRenderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { CoachWeekCard } from '../CoachWeekCard';
import type { CoachWeek } from '@/features/ai/coachWeek';

const week: CoachWeek = {
  dogId: 'd1', weekStart: '2026-11-28', weekEnd: '2026-12-04', state: 'ok', notes: [{ key: 'coach.reason.heat' }],
  suggestions: [{
    key: 'coach:v1:d1:2026-11-28:corner:faehrte', rule: 'corner', discipline: 'faehrte', focus: 'corners', date: '2026-11-28',
    params: { corners: 2, steps: 600 }, priority: 75, hard: true,
    reasons: [{ key: 'coach.reason.corner', params: { corner: 2, avg: 5, n: 3 } }],
  }],
};
const byId = (r: ReactTestRenderer, id: string) => r.root.findAll((n: ReactTestInstance) => n.props.testID === id)[0];
const allText = (r: ReactTestRenderer) => r.root.findAll((n: ReactTestInstance) => typeof n.type === 'string' && n.type === 'Text')
  .map(n => ([] as unknown[]).concat(n.props.children ?? []).filter((c): c is string | number => typeof c === 'string' || typeof c === 'number').join('')).join('\n');
const noop = () => undefined;

describe('CoachWeekCard', () => {
  it('Premium: Vorschlag mit Tag, Eckdaten und Begründung mit Zahlen; «Nicht passend» meldet den Schlüssel', () => {
    const onDismiss = jest.fn();
    let r!: ReactTestRenderer;
    act(() => { r = TestRenderer.create(<CoachWeekCard week={week} isPro disabledCount={0} onDismiss={onDismiss} onDisableRule={noop} onEnableAll={noop} />); });
    const text = allText(r);
    expect(text).toContain('Tracking');
    expect(text).toContain('2 corners · 600 steps');
    expect(text).toContain('5 m');
    expect(text).toContain('Heat recorded');
    expect(byId(r, 'coach-week-preview')).toBeUndefined();
    act(() => { byId(r, 'coach-dismiss-corner-faehrte').props.onPress(); });
    expect(onDismiss).toHaveBeenCalledWith('coach:v1:d1:2026-11-28:corner:faehrte');
  });

  it('Menü: Regel aus, Regeln wieder ein, im Profil ausblenden', () => {
    const onDisableRule = jest.fn(), onEnableAll = jest.fn(), onHide = jest.fn();
    let r!: ReactTestRenderer;
    act(() => { r = TestRenderer.create(<CoachWeekCard week={week} isPro disabledCount={2} onDismiss={noop} onDisableRule={onDisableRule} onEnableAll={onEnableAll} onHideInProfile={onHide} />); });
    act(() => { byId(r, 'coach-week-menu').props.onPress(); });
    act(() => { byId(r, 'coach-rule-off-corner').props.onPress(); });
    expect(onDisableRule).toHaveBeenCalledWith('corner');
    act(() => { byId(r, 'coach-week-menu').props.onPress(); });
    act(() => { byId(r, 'coach-rules-on').props.onPress(); });
    act(() => { byId(r, 'coach-week-menu').props.onPress(); });
    act(() => { byId(r, 'coach-hide-profile').props.onPress(); });
    expect(onEnableAll).toHaveBeenCalled();
    expect(onHide).toHaveBeenCalled();
  });

  it('NEWBIE: Vorschau-Hinweis, kein Menü', () => {
    let r!: ReactTestRenderer;
    act(() => { r = TestRenderer.create(<CoachWeekCard week={week} isPro={false} disabledCount={0} onDismiss={noop} onDisableRule={noop} onEnableAll={noop} onUpgrade={noop} />); });
    expect(byId(r, 'coach-week-preview')).toBeDefined();
    expect(byId(r, 'coach-week-menu')).toBeUndefined();
  });

  it('keine Daten: Hinweis statt erfundener Vorschläge', () => {
    let r!: ReactTestRenderer;
    act(() => { r = TestRenderer.create(<CoachWeekCard week={{ ...week, state: 'no_data', suggestions: [], notes: [] }} isPro disabledCount={0} onDismiss={noop} onDisableRule={noop} onEnableAll={noop} />); });
    expect(allText(r)).toContain('Not enough data');
    expect(r.root.findAll((n: ReactTestInstance) => String(n.props.testID ?? '').startsWith('coach-suggestion-'))).toHaveLength(0);
  });
});
