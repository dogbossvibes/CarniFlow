import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DogsScreen from '@/app/(tabs)/dogs';
import { documentDraftKey } from '@/features/training/documentation/draft';

const mockPush = jest.fn();
const mockStart = jest.fn();
const mockCreate = jest.fn();
const mockDogs = [{ id: 'dog-yam', name: 'Yam' }, { id: 'dog-malu', name: 'Malu' }];
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useFocusEffect: jest.fn() }));
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => ({ dogs: mockDogs, loading: false, refresh: jest.fn() }) }));
jest.mock('@/hooks/useCapabilities', () => ({ useCapabilities: () => ({ isPro: true, loading: false }) }));
jest.mock('@/components/dogs/DogCompactCard', () => ({ DogCompactCard: 'DogCard' }));
jest.mock('@/components/dogs/types', () => ({ dogToIdentity: (dog: unknown) => dog }));
jest.mock('@/components/ui/AnimatedPressable', () => ({ AnimatedPressable: 'AnimatedPressable' }));
jest.mock('@/components/ui/DogIcon', () => ({ DogIcon: 'DogIcon' }));
jest.mock('@/stores/liveBarScroll', () => ({ reportScroll: jest.fn() }));
jest.mock('@/stores/activeTraining', () => ({ startUnit: (...args: unknown[]) => mockStart(...args) }));
jest.mock('@/services/trainingUnitService', () => ({ createTrainingUnit: (...args: unknown[]) => mockCreate(...args) }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'Gradient' }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

let node: ReactTestRenderer;
beforeEach(() => { jest.clearAllMocks(); act(() => { node = TestRenderer.create(<DogsScreen />); }); });
afterEach(() => { act(() => node.unmount()); });
const cards = () => node.root.findAll(n => typeof n.props.onTraining === 'function');

it.each(mockDogs.map((dog, index) => [dog.id, index] as const))('opens documentation with the exact clicked dog %s', (dogId, index) => {
  act(() => cards()[index].props.onTraining());
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/unit/document', params: { dogId } });
  expect(mockStart).not.toHaveBeenCalled();
  expect(mockCreate).not.toHaveBeenCalled();
});

it('leaves an existing timer and another dog documentation draft intact on navigation', async () => {
  const timerKey = 'active_training_v2:owner-1';
  const draftKey = documentDraftKey('owner-1', undefined, JSON.stringify(['dog-yam', null]));
  const timer = JSON.stringify({ ownerId: 'owner-1', dogId: 'dog-yam', running: true });
  const draft = JSON.stringify({ version: 1, value: { dogId: 'dog-yam', description: 'Unfinished notes' } });
  await AsyncStorage.setItem(timerKey, timer);
  await AsyncStorage.setItem(draftKey, draft);
  jest.clearAllMocks();
  act(() => cards()[1].props.onTraining());
  expect(await AsyncStorage.getItem(timerKey)).toBe(timer);
  expect(await AsyncStorage.getItem(draftKey)).toBe(draft);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  expect(mockStart).not.toHaveBeenCalled();
  expect(mockCreate).not.toHaveBeenCalled();
});

it('preserves the track and statistics routes for each dog', () => {
  cards().forEach((card, index) => {
    act(() => card.props.onFaehrte());
    expect(mockPush).toHaveBeenLastCalledWith(`/track/legen?dogId=${mockDogs[index].id}`);
    act(() => card.props.onStats());
    expect(mockPush).toHaveBeenLastCalledWith(`/dog/${mockDogs[index].id}`);
  });
});
