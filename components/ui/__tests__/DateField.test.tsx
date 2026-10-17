import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Keyboard, Platform } from 'react-native';
import { DateField } from '@/components/ui/DateField';

// BUGFIX: Auf Android muss das Geburtsdatum als Walzen-Picker (Tag·Monat·Jahr)
// öffnen, damit das Jahr — wie auf iOS — direkt wählbar ist (kein großer
// Monatskalender, kein Monat-für-Monat-Zurücktippen). Wir prüfen, dass DateField
// dem nativen Android-Picker `display: 'spinner'` für den Datumsmodus übergibt.

const mockOpen = jest.fn();
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: 'DateTimePicker',
  DateTimePickerAndroid: { open: (...a: unknown[]) => mockOpen(...a) },
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

jest.mock('@/i18n', () => ({
  useT: () => ({ t: (k: string) => k, locale: 'de-CH' }),
}));

type TestInstance = {
  props: Record<string, any>;
  findAll: (predicate: (n: TestInstance) => boolean) => TestInstance[];
};

function updateNode(node: ReactTestRenderer, element: React.ReactElement) {
  (node as unknown as { update: (value: React.ReactElement) => void }).update(element);
}

function fieldOpen(node: ReactTestRenderer): TestInstance {
  return (node.root as unknown as TestInstance).findAll((n) => n.props.testID === 'date-field')[0];
}

function openField(props: Partial<React.ComponentProps<typeof DateField>> = {}) {
  let node!: ReactTestRenderer;
  act(() => {
    node = TestRenderer.create(
      <DateField value={null} onChange={jest.fn()} maximumDate={new Date(2026, 7, 4)} {...props} />,
    );
  });
  act(() => { fieldOpen(node).props.onPress(); });
  return node;
}

describe('DateField — Android Datums-Picker', () => {
  const realOS = Platform.OS;
  beforeEach(() => { mockOpen.mockClear(); Platform.OS = 'android'; });
  afterAll(() => { Platform.OS = realOS; });

  it('öffnet den Datumsmodus als Walzen-Picker (display: spinner)', () => {
    openField({ mode: 'date' });
    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(mockOpen.mock.calls[0][0]).toEqual(
      expect.objectContaining({ mode: 'date', display: 'spinner' }),
    );
  });

  it('reicht maximumDate durch (keine Zukunftsdaten)', () => {
    openField({ mode: 'date' });
    expect(mockOpen.mock.calls[0][0].maximumDate).toEqual(new Date(2026, 7, 4));
  });

  it('lässt die Zeit beim nativen Default (kein Spinner-Zwang)', () => {
    openField({ mode: 'time' });
    expect(mockOpen.mock.calls[0][0].display).toBe('default');
  });
});


describe('DateField — medication iOS recycling regression', () => {
  const realOS = Platform.OS;
  beforeEach(() => { Platform.OS = 'ios'; });
  afterEach(() => { Platform.OS = realOS; jest.restoreAllMocks(); });
  function picker(node: ReactTestRenderer) {
    return node.root.findByType('DateTimePicker' as never);
  }
  it('clears the keyboard and supplies non-epoch bounds without changing the selected date', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const value = new Date(2026, 9, 8);
    const changed = jest.fn();
    const node = openField({ value, onChange: changed, maximumDate: undefined, stabilizeIOSBounds: true });
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(picker(node).props.value).toEqual(value);
    expect(picker(node).props.minimumDate.getFullYear()).toBe(1);
    expect(picker(node).props.maximumDate.getFullYear()).toBe(9999);
    expect(changed).not.toHaveBeenCalled();
    act(() => node.unmount());
  });
  it('preserves a supplied end-date minimum and replaces a removed bound on the same picker', () => {
    const start = new Date(2026, 9, 8);
    const node = openField({ minimumDate: start, stabilizeIOSBounds: true });
    expect(picker(node).props.minimumDate).toEqual(start);
    act(() => updateNode(node, <DateField value={start} onChange={jest.fn()} stabilizeIOSBounds />));
    expect(picker(node).props.minimumDate.getFullYear()).toBe(1);
    expect(picker(node).props.maximumDate.getFullYear()).toBe(9999);
    act(() => node.unmount());
  });
  it('accepts native date changes, ignores dismissal, and retains the value when reopened', () => {
    const initial = new Date(2026, 9, 8);
    const selected = new Date(2026, 9, 12);
    const changed = jest.fn();
    const node = openField({ value: initial, onChange: changed, maximumDate: undefined, stabilizeIOSBounds: true });
    act(() => picker(node).props.onChange({ type: 'dismissed' }, selected));
    expect(changed).not.toHaveBeenCalled();
    act(() => picker(node).props.onChange({ type: 'set' }, selected));
    expect(changed).toHaveBeenCalledWith(selected);
    act(() => updateNode(node, <DateField value={selected} onChange={changed} stabilizeIOSBounds />));
    act(() => fieldOpen(node).props.onPress());
    expect((node.root as unknown as TestInstance).findAll(n => n.props.mode === 'date' && n.props.display === 'spinner')).toHaveLength(0);
    act(() => fieldOpen(node).props.onPress());
    expect(picker(node).props.value).toEqual(selected);
    act(() => node.unmount());
  });
  it('keeps legacy iOS time fields and Android constraints unchanged', () => {
    const node = openField({ mode: 'time', maximumDate: undefined, stabilizeIOSBounds: true });
    expect(picker(node).props.maximumDate).toBeUndefined();
    expect(picker(node).props.minimumDate).toBeUndefined();
    act(() => node.unmount());
    Platform.OS = 'android'; mockOpen.mockClear();
    const android = openField({ maximumDate: undefined, stabilizeIOSBounds: true });
    expect(mockOpen.mock.calls[0][0].maximumDate).toBeUndefined();
    expect(mockOpen.mock.calls[0][0].minimumDate).toBeUndefined();
    act(() => android.unmount());
  });
});


describe('DateField — text to picker handoff', () => {
  const realOS = Platform.OS;
  afterEach(() => { Platform.OS = realOS; jest.restoreAllMocks(); });
  it.each(['ios', 'android'] as const)('dismisses keyboard before opening date/time on %s, without changing input', os => {
    Platform.OS = os;
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    for (const mode of ['date', 'time'] as const) {
      const changed = jest.fn();
      const node = openField({ mode, onChange: changed });
      expect(dismiss).toHaveBeenCalled();
      expect(changed).not.toHaveBeenCalled();
      if (os === 'android') expect(dismiss.mock.invocationCallOrder.at(-1)).toBeLessThan(mockOpen.mock.invocationCallOrder.at(-1)!);
      act(() => node.unmount());
    }
  });
});
