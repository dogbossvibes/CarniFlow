import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import { HeatOverviewCalendar } from '../HeatOverviewCalendar';
import type { HeatCycle } from '@/features/dogs/heatCycles';
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/i18n', () => ({ useT: () => ({ locale: 'de' }) }));
const cycle: HeatCycle = { id: 'c', dogId: 'dog', startDate: '2026-10-01', endDate: '2026-10-20', status: 'completed', notes: null, phase: null, createdAt: '' };
let node: ReactTestRenderer;
const open = jest.fn();
const buttons = () => (node.root as unknown as { findAllByType: (type: unknown) => { props: { accessibilityLabel: string; testID?: string; accessibilityState: { selected: boolean }; onPress: () => void } }[] }).findAllByType(TouchableOpacity);
const json = () => JSON.stringify((node as unknown as { toJSON: () => unknown }).toJSON());
const tap = (label: string) => act(() => buttons().find(b => b.props.accessibilityLabel === label)!.props.onPress());
function render(cycles: HeatCycle[] = [cycle]) { act(() => { node = TestRenderer.create(<HeatOverviewCalendar cycles={cycles} phases={[{ id: 'p', heatCycleId: 'c', phaseType: 'Östrus', startDate: '2026-10-10', endDate: '2026-10-15', notes: null, createdAt: '' }]} observations={[{ id: 'o', heatCycleId: 'c', date: '2026-10-11', type: 'Standreflex', value: 'Beobachtet', notes: null, createdAt: '' }]} onOpenCycle={open} />); }); }
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 25, 12)); open.mockReset(); });
afterEach(() => { if (node) act(() => node.unmount()); jest.useRealTimers(); });
it('renders the current month immediately, including an empty history', () => {
  render([]); expect(json()).toContain('Oktober 2026'); expect(buttons().filter(b => b.props.testID?.startsWith('heat-day-'))).toHaveLength(31); expect(json()).toContain('Keine Einträge an diesem Tag'); expect(open).not.toHaveBeenCalled();
});
it('distinguishes recorded dates and observations and opens only explicit cycle details', () => {
  render(); const day = buttons().find(b => b.props.testID === 'heat-day-2026-10-11')!;
  expect(day.props.accessibilityLabel).toContain('Erfasste Läufigkeit'); expect(day.props.accessibilityLabel).toContain('1 Beobachtungen');
  act(() => day.props.onPress()); expect(json()).toContain('Östrus'); expect(json()).toContain('Standreflex'); expect(open).not.toHaveBeenCalled();
  tap('Details und frühere Einträge'); expect(open).toHaveBeenCalledWith(cycle);
});
it('navigates across December/January and returns to today', () => {
  render(); tap('Nächster Monat'); tap('Nächster Monat'); tap('Nächster Monat'); expect(json()).toContain('Januar 2027');
  tap('Vorheriger Monat'); expect(json()).toContain('Dezember 2026'); tap('Heute'); expect(json()).toContain('Oktober 2026');
  expect(buttons().find(b => b.props.testID === 'heat-day-2026-10-25')!.props.accessibilityState.selected).toBe(true);
});
it('jumps to the predicted date and labels it as an estimate, never as a recorded cycle', () => {
  const before = JSON.stringify(cycle); render(); tap('Zum geschätzten Beginn');
  const estimated = buttons().find(b => b.props.testID === 'heat-day-2027-03-30')!;
  expect(estimated.props.accessibilityLabel).toContain('Geschätzter Beginn'); expect(estimated.props.accessibilityLabel).not.toContain('Erfasste Läufigkeit');
  expect(json()).toContain('Grobe Schätzung'); expect(JSON.stringify(cycle)).toBe(before); expect(open).not.toHaveBeenCalled();
});
it('does not forecast from future-only records', () => {
  render([{ ...cycle, startDate: '2027-01-01', endDate: null }]); expect(buttons().some(b => b.props.accessibilityLabel === 'Zum geschätzten Beginn')).toBe(false);
});
