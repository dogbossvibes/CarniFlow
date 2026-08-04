import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Platform } from 'react-native';
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
