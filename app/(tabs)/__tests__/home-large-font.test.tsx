import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import HomeScreen from '../home';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useFocusEffect: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'Gradient' }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeArea' }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ user: { id: 'owner' } }) }));
jest.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: { id: 'owner', full_name: 'Example' }, loading: false }) }));
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => ({ dogs: [{ id: 'dog' }], loading: false, refresh: jest.fn() }) }));
jest.mock('@/hooks/useTrainingFeed', () => ({ useTrainingFeed: () => ({ feed: [], loading: false, refresh: jest.fn() }) }));
jest.mock('@/hooks/useFeedDelete', () => ({ useFeedDelete: () => ({ onDelete: jest.fn(), toast: null }) }));
jest.mock('@/stores/homeScreenConfig', () => ({ useHomeScreenConfig: () => ({}), visibleWidgets: () => [], backpackWidgetDogIds: () => [] }));
jest.mock('@/stores/liveBarScroll', () => ({ reportScroll: jest.fn() }));
jest.mock('@/components/home/HomeDayGreeting', () => ({ HomeDayGreeting: 'HomeDayGreeting' }));
jest.mock('@/components/dogs/DogCard', () => ({ DogCard: 'DogCard' }));
jest.mock('@/components/ui/AnimatedPressable', () => ({ AnimatedPressable: 'AnimatedPressable' }));
jest.mock('@/components/training/UnitListCard', () => ({ UnitListCard: 'UnitListCard' }));
jest.mock('@/components/training/SwipeableTrainingItem', () => ({ SwipeableTrainingItem: 'SwipeableTrainingItem' }));
jest.mock('@/components/subscription/ActiveTrialGate', () => ({ ActiveTrialGate: 'ActiveTrialGate' }));
jest.mock('@/components/home/QuickActionsWidget', () => ({ QuickActionsWidget: 'QuickActionsWidget' }));
jest.mock('@/components/home/DogBackpackWidget', () => ({ DogBackpackWidget: 'DogBackpackWidget' }));
jest.mock('@/components/help/HelpButton', () => ({ HelpButton: 'HelpButton' }));
jest.mock('@/components/calendar/HomeTimelineCard', () => ({ HomeTimelineCard: 'HomeTimelineCard' }));
jest.mock('@/features/ai/components/AiCoachCard', () => ({ AiCoachCard: 'AiCoachCard' }));
jest.mock('@/components/dogs/HomeHeatCard', () => ({ HomeHeatCard: 'HomeHeatCard' }));
jest.mock('@/features/sync/components/OfflineBanner', () => ({ OfflineBanner: 'OfflineBanner' }));
jest.mock('@/components/ui/Glass', () => ({ Glass: 'Glass', isGlass: false }));

let tree: ReactTestRenderer;
afterEach(() => { act(() => tree?.unmount()); });
it('keeps greeting, slogan and statistics in distinct growing flow blocks', () => {
  act(() => { tree = renderer.create(<HomeScreen />); });
  type Node = {
    type: string;
    props: { style?: StyleProp<ViewStyle>; allowFontScaling?: boolean; maxFontSizeMultiplier?: number; numberOfLines?: number };
    children: (Node | string)[] | null;
  };
  const children = (n: Node): Node[] => (n.children ?? []).filter((v): v is Node => typeof v !== 'string');
  const texts = (n: Node): string[] => (n.children ?? []).flatMap(v => typeof v === 'string' ? [v] : texts(v));
  const all = (n: Node): Node[] => [n, ...children(n).flatMap(all)];
  const nodes = all(tree.toJSON() as Node);
  const slogan = nodes.find(n => n.type === 'View' && texts(n).join('|') === 'TRAIN.|ANALYZE.|IMPROVE.')!;
  const stats = nodes.find(n => n.type === 'View' && texts(n).join('|') === '1|HUNDE|0|EINHEITEN|0|SERIE')!;
  const hero = nodes.find(n => children(n).includes(slogan) && children(n).includes(stats))!;
  const heroStyle = StyleSheet.flatten(hero.props.style);
  expect(heroStyle.height).toBeUndefined();
  expect(heroStyle.maxHeight).toBeUndefined();
  expect(StyleSheet.flatten(slogan.props.style).position).not.toBe('absolute');
  expect(StyleSheet.flatten(stats.props.style).position).not.toBe('absolute');
  const blocks = children(hero);
  expect(blocks.indexOf(slogan)).toBeLessThan(blocks.indexOf(stats));
  expect(blocks.findIndex(n => all(n).some(v => v.type === 'HomeDayGreeting'))).toBeLessThan(blocks.indexOf(slogan));
  for (const n of [...all(slogan), ...all(stats)].filter(n => n.type === 'Text')) {
    expect(n.props.allowFontScaling).not.toBe(false);
    expect(n.props.maxFontSizeMultiplier).toBeUndefined();
    expect(n.props.numberOfLines).toBeUndefined();
  }
  expect(texts(stats)).toEqual(['1', 'HUNDE', '0', 'EINHEITEN', '0', 'SERIE']);
});
