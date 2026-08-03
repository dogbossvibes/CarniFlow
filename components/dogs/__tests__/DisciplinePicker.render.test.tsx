import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { DisciplinePicker } from '@/components/dogs/DisciplinePicker';
import { DOG_CUSTOM_DISCIPLINE, DOG_DISCIPLINES } from '@/components/dogs/ChipSelect';

const mockLabels: Record<string, string> = {
  'dog.discipline': 'SPARTE',
  'dog.customDiscipline': 'Eigene Sparte',
  'dog.customDisciplinePlaceholder': 'z.B. Hoopers, Rally Obedience, Flyball, Frisbee, Mantrailing …',
};

jest.mock('@/i18n', () => ({
  useT: () => ({ t: (key: string) => mockLabels[key] ?? key }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

function render(props: Parameters<typeof DisciplinePicker>[0]): ReactTestRenderer {
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(<DisciplinePicker {...props} />); });
  return node;
}

function allText(node: ReactTestRenderer): string {
  const nodes = (node.root as unknown as { findAllByType: (t: unknown) => { props: { children: unknown } }[] }).findAllByType(Text);
  return nodes
    .flatMap((t) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((x): x is string => typeof x === 'string')
    .join(' | ');
}

function chips(node: ReactTestRenderer): { label: string; onPress: () => void }[] {
  const buttons = (node.root as unknown as { findAllByType: (t: unknown) => { props: { children: unknown; onPress: () => void } }[] }).findAllByType(TouchableOpacity);
  return buttons.map((b) => {
    const texts = (Array.isArray(b.props.children) ? b.props.children : [b.props.children])
      .filter((x): x is { props: { children: unknown } } => typeof x === 'object' && x !== null && 'props' in x)
      .flatMap((t) => t.props.children);
    return { label: String(texts), onPress: b.props.onPress };
  });
}

function textInputs(node: ReactTestRenderer): { value: string | undefined; onChangeText: (v: string) => void }[] {
  return (node.root as unknown as { findAllByType: (t: unknown) => { props: { value: string | undefined; onChangeText: (v: string) => void } }[] })
    .findAllByType(TextInput)
    .map((b) => ({ value: b.props.value, onChangeText: b.props.onChangeText }));
}

describe('DisciplinePicker — Rendering & Interaktion', () => {
  it('zeigt alle bestehenden Sparten unverändert an (keine Auswahl → kein Freitext)', () => {
    const node = render({ value: '', onChange: () => {} });
    const text = allText(node);
    for (const d of DOG_DISCIPLINES) expect(text).toContain(d);
    expect(text).toContain('Eigene Sparte');
    expect(textInputs(node)).toHaveLength(0);
  });

  it('zeigt den Freitext nur, wenn „Eigene Sparte" aktiv ist', () => {
    expect(textInputs(render({ value: 'IGP', onChange: () => {} }))).toHaveLength(0);
    const empty = render({ value: DOG_CUSTOM_DISCIPLINE, onChange: () => {} });
    expect(textInputs(empty)).toHaveLength(1);
    const typed = render({ value: 'Hoopers', onChange: () => {} });
    expect(textInputs(typed)).toHaveLength(1);
  });

  it('Tippen auf eine feste Sparte → onChange mit der Sparte', () => {
    const onChange = jest.fn();
    const node = render({ value: '', onChange });
    act(() => { chips(node).find(c => c.label === 'IGP')?.onPress(); });
    expect(onChange).toHaveBeenCalledWith('IGP');
  });

  it('Tippen auf „Eigene Sparte" → onChange mit dem Sentinel', () => {
    const onChange = jest.fn();
    const node = render({ value: '', onChange });
    act(() => { chips(node).find(c => c.label === 'Eigene Sparte')?.onPress(); });
    expect(onChange).toHaveBeenCalledWith(DOG_CUSTOM_DISCIPLINE);
  });

  it('Freitext-Tippen → onChange mit dem Text; Wert wird aus `value` übernommen', () => {
    const onChange = jest.fn();
    const node = render({ value: DOG_CUSTOM_DISCIPLINE, onChange });
    const input = textInputs(node)[0];
    expect(input.value).toBe('');
    act(() => { input.onChangeText('Hoopers'); });
    expect(onChange).toHaveBeenCalledWith('Hoopers');
    const typed = render({ value: 'Hoopers', onChange });
    expect(textInputs(typed)[0].value).toBe('Hoopers');
  });
});
