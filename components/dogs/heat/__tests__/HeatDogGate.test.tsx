import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { HeatDogGate } from '../HeatDogGate';
const mockDog = jest.fn(); const mockCycle = jest.fn(); let mockUser = 'owner';
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return { useRouter: () => ({ back: jest.fn() }), useFocusEffect: (fn: () => unknown) => React.useEffect(fn, [fn]) };
});
jest.mock('@/lib/session-context', () => ({ useSession: () => ({ user: { id: mockUser } }) }));
jest.mock('@/i18n', () => ({ useT: () => ({ locale: 'de' }) }));
jest.mock('@/services/dogs', () => ({ getDogById: (...args: unknown[]) => mockDog(...args) }));
jest.mock('@/features/dogs/heatCycles', () => ({ getHeatCycle: (...args: unknown[]) => mockCycle(...args) }));
jest.mock('@/components/ui/AnyvoButton', () => ({ AnyvoButton: 'AnyvoButton' }));
let node: ReactTestRenderer;
beforeEach(() => { mockUser = 'owner'; mockDog.mockReset(); mockCycle.mockReset().mockResolvedValue({ dogId: 'dog' }); });
afterEach(() => { if (node) act(() => node.unmount()); });
async function render(id = 'dog') { await act(async () => { node = TestRenderer.create(<HeatDogGate dogId={id}>{dog => <Text>{`CONTENT:${dog.name}`}</Text>}</HeatDogGate>); }); }
const content = () => JSON.stringify((node as unknown as { toJSON: () => unknown }).toJSON());
it('shows a verified female profile', async () => { mockDog.mockResolvedValue({ data: { id: 'dog', name: 'Luna', gender: 'female' }, error: null }); await render(); expect(content()).toContain('CONTENT:Luna'); });
it.each(['male', null, undefined, 'unknown'])('never mounts children for %s', async gender => { mockDog.mockResolvedValue({ data: { id: 'dog', name: 'Luna', gender }, error: null }); await render(); expect(content()).not.toContain('CONTENT:'); expect(content()).toContain('nur für Hündinnen'); });
it('shows retry instead of content on read error', async () => { mockDog.mockResolvedValue({ data: null, error: { message: 'offline' } }); await render(); expect(content()).not.toContain('CONTENT:'); expect(content()).toContain('Erneut versuchen'); });
it('ignores a late response from a previous dog', async () => {
  let finish!: (value: unknown) => void;
  mockDog.mockImplementation((id: string) => id === 'dog' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ data: { name: 'Rex', gender: 'male' }, error: null }));
  await render();
  await act(async () => { node.update(<HeatDogGate dogId="other">{dog => <Text>{`CONTENT:${dog.name}`}</Text>}</HeatDogGate>); });
  await act(async () => { finish({ data: { name: 'Luna', gender: 'female' }, error: null }); });
  expect(content()).not.toContain('CONTENT:');
});
it('resolves a cycle deep link to its actual dog before rendering', async () => {
  mockDog.mockResolvedValue({ data: { name: 'Luna', gender: 'female' }, error: null });
  await act(async () => { node = TestRenderer.create(<HeatDogGate cycleId="cycle">{dog => <Text>{`CONTENT:${dog.name}`}</Text>}</HeatDogGate>); });
  expect(mockCycle).toHaveBeenCalledWith('cycle'); expect(mockDog).toHaveBeenCalledWith('dog'); expect(content()).toContain('CONTENT:Luna');
});
