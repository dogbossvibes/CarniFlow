import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { HeatForecast } from '../HeatForecast';
import { DogHeatCard } from '../../DogHeatCard';
import { HealthHeatCard } from '../../HealthHeatSection';
import { heatUxCopy } from '@/features/dogs/heatUxCopy';
import type { HeatCycle } from '@/features/dogs/heatCycles';
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/i18n', () => ({ useT: () => ({ locale: 'de', t: (key: string) => key }) }));
const cycles: HeatCycle[] = [{ id: '1', dogId: 'd', startDate: '2026-06-30', endDate: '2026-07-20', status: 'completed', notes: null, phase: null, createdAt: '' }];
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 24, 12)); });
afterEach(() => jest.useRealTimers());
it.each(['forecast', 'dog', 'health'])('shows estimate/countdown in %s card, without changing cycle records', kind => {
  const before = JSON.stringify(cycles);
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(kind === 'forecast' ? <HeatForecast cycles={cycles} /> : kind === 'dog' ? <DogHeatCard cycles={cycles} prediction={null} onAdd={() => {}} onOpenOverview={() => {}} /> : <HealthHeatCard cycles={cycles} prediction={null} onAdd={() => {}} onPress={() => {}} />); });
  expect(JSON.stringify((node as unknown as { toJSON: () => unknown }).toJSON())).toContain('In etwa 64 Tagen');
  expect(JSON.stringify((node as unknown as { toJSON: () => unknown }).toJSON())).toContain('Grobe Schätzung'); expect(JSON.stringify(cycles)).toBe(before);
  act(() => node.unmount());
});
it.each(['de', 'en', 'fr', 'it', 'gsw'] as const)('provides forecast and breeding labels for %s', locale => {
  const copy = heatUxCopy(locale);
  for (const key of ['nextEstimate', 'remaining', 'expectedToday', 'expectedPast', 'breeding', 'discharge', 'phaseSequence', 'phaseCaution', 'manageEntry'] as const) expect(copy[key].length).toBeGreaterThan(5);
});
