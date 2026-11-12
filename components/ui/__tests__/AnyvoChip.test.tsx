import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import { AnyvoChip } from '../AnyvoChip';
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
describe('accessible choice chips', () => {
  it.each([true, false])('exposes its label, button role and selected=%s without changing press behavior', active => {
    const onPress = jest.fn(); let node!: ReactTestRenderer;
    act(() => { node = TestRenderer.create(<AnyvoChip label="Vaccinations" active={active} onPress={onPress} />); });
    const button = node.root.findByType(TouchableOpacity);
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('Vaccinations');
    expect(button.props.accessibilityState).toEqual({ selected: active });
    act(() => { button.props.onPress(); }); expect(onPress).toHaveBeenCalledTimes(1);
    act(() => { node.unmount(); });
  });
});
