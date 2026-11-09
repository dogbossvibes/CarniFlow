import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { DogCompactCard } from '../DogCompactCard';

jest.mock('@/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('../DogAvatar', () => ({ DogAvatar: 'Avatar' }));

const identity = { id: 'd1', name: 'Yam', breed: null, ageLabel: null, gender: null, photoUrl: null, discipline: null } as never;
let view: ReactTestRenderer;
const render = (props: Partial<React.ComponentProps<typeof DogCompactCard>> = {}) => act(() => {
  view = TestRenderer.create(<DogCompactCard identity={identity} lastTrainingLabel={null} onOpen={jest.fn()} onTraining={jest.fn()} onFaehrte={jest.fn()} onStats={jest.fn()} {...props} />);
});
const texts = () => view.root.findAllByType(Text).map(n => [n.props.children].flat().join(''));

describe('DogCompactCard – letztes Training (T-184 Etappe 2)', () => {
  test('zeigt Zeile und Hinweis ohne festen Präfix; Aktion „Weiter“ mit Hundename', () => {
    const onTraining = jest.fn();
    render({ lastTrainingLabel: 'Letztes Training: vor 3 Tagen · Unterordnung', openHintLabel: 'Offener Hinweis: Ruhig', onTraining });
    expect(texts()).toContain('Letztes Training: vor 3 Tagen · Unterordnung');
    expect(texts()).toContain('Offener Hinweis: Ruhig');
    expect(texts().join(' ')).not.toContain('Zuletzt:');
    const next = view.root.findAll(n => n.props.accessibilityLabel === 'continueTraining.next: Yam' && typeof n.props.onPress === 'function')[0];
    act(() => next.props.onPress());
    expect(onTraining).toHaveBeenCalledTimes(1);
  });

  test('ohne letztes Training: keine Zeile, Aktion heisst weiter „Training“', () => {
    render();
    expect(texts()).not.toContain('continueTraining.next');
    expect(texts()).toContain('Training');
  });
});
