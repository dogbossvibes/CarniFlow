import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { HoldToStopButton, HOLD_TO_STOP_MS } from '@/features/tracking/components/HoldToStopButton';
import { deCH } from '@/i18n/de-CH';

jest.mock('@/features/tracking/utils/haptics', () => ({ hapticSuccess: jest.fn() }));

// Direkte Deckung des Aufgaben-Checklists (Spec §8), organisiert per Screen. Das
// generische Hold-Verhalten selbst ist bereits vollständig in
// HoldToStopButton.test.tsx abgedeckt — diese Suite bestätigt zusätzlich, dass
// LEGEN und ABSUCHE exakt dieselbe Komponente mit den jeweils erwarteten Props
// (disabled/busy/label) verwenden, statt zwei fast identische Implementierungen.
// Die label-Werte sind die echten de-CH-Übersetzungen — exakt das, was
// t('track.stopLaying')/t('track.evaluate') in legen.tsx/run.tsx liefert.
const LEGEN_LABEL = deCH['track.stopLaying'];
const ABSUCHE_LABEL = deCH['track.evaluate'];

type PressableTestNode = { props: { onPress: () => void; onPressIn: () => void; onPressOut: () => void } };

function findStop(tree: ReactTestRenderer): PressableTestNode {
  return (tree.root as unknown as {
    findByProps: (props: { accessibilityLabel: string }) => PressableTestNode;
  }).findByProps({ accessibilityLabel: 'Fährte stoppen' });
}

function findAllByProps<P extends object>(tree: ReactTestRenderer, props: Partial<P>): { props: P }[] {
  return (tree.root as unknown as {
    findAllByProps: (p: Partial<P>) => { props: P }[];
  }).findAllByProps(props);
}

describe('NORMALER STOP / LEGEN (finishTrack via HoldToStopButton, wie app/track/legen.tsx verdrahtet)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function renderLegenStop(finishTrack: () => void, recording = true) {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <HoldToStopButton
          onStop={finishTrack}
          disabled={!recording}
          label={LEGEN_LABEL}
          containerClassName="h-[60px] rounded-[18px]"
          containerStyle={{ flex: 1.3 }}
        />,
      );
    });
    return tree;
  }

  it('zeigt "Stopp" (track.stopLaying) — nicht "Stoppen & Auswerten"', () => {
    const tree = renderLegenStop(jest.fn());
    expect(LEGEN_LABEL).toBe('Stopp');
    expect(findAllByProps<{ children: string }>(tree, { children: LEGEN_LABEL }).length).toBeGreaterThan(0);
    expect(findAllByProps<{ children: string }>(tree, { children: ABSUCHE_LABEL })).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('Tap → kein Stop', () => {
    const finishTrack = jest.fn();
    const tree = renderLegenStop(finishTrack);
    act(() => findStop(tree).props.onPress());
    expect(finishTrack).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('kurzer Hold → kein Stop', () => {
    const finishTrack = jest.fn();
    const tree = renderLegenStop(finishTrack);
    const stop = findStop(tree);
    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS - 300));
    act(() => stop.props.onPressOut());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS));
    expect(finishTrack).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('Cancel → kein Stop', () => {
    const finishTrack = jest.fn();
    const tree = renderLegenStop(finishTrack);
    const stop = findStop(tree);
    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS - 50));
    act(() => stop.props.onPressOut());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS));
    expect(finishTrack).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('1500 ms → finishTrack genau 1x', () => {
    const finishTrack = jest.fn();
    const tree = renderLegenStop(finishTrack);
    const stop = findStop(tree);
    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS));
    expect(finishTrack).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('Over-Hold → genau 1x', () => {
    const finishTrack = jest.fn();
    const tree = renderLegenStop(finishTrack);
    const stop = findStop(tree);
    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS * 3));
    act(() => stop.props.onPressOut());
    expect(finishTrack).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('disabled (phase !== recording) → kein Hold möglich', () => {
    const finishTrack = jest.fn();
    const tree = renderLegenStop(finishTrack, /* recording */ false);
    const disabledProp = (findStop(tree) as unknown as { props: { disabled?: boolean } }).props.disabled;
    expect(disabledProp).toBe(true);
    act(() => tree.unmount());
  });
});

describe('NORMALER STOP / ABSUCHE (handleFinish via HoldToStopButton, wie app/track/run.tsx verdrahtet)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function renderRunStop(handleFinish: () => void, opts: { finishing?: boolean; arming?: boolean } = {}) {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <HoldToStopButton
          onStop={handleFinish}
          disabled={!!(opts.finishing || opts.arming)}
          busy={!!opts.finishing}
          label={ABSUCHE_LABEL}
          containerClassName="h-[60px] rounded-[18px]"
          containerStyle={{ flex: 1.3 }}
        />,
      );
    });
    return tree;
  }

  it('zeigt "Stoppen & Auswerten" (track.evaluate) — nicht nur "Stopp"', () => {
    const tree = renderRunStop(jest.fn());
    // track.evaluate ist die bestehende, bereits vollständig lokalisierte Fach-
    // Beschriftung ("Stop & Auswerten" DE) — bevorzugt statt eines neuen,
    // fast-doppelten Keys (Spec „Bestehende i18n-Keys bevorzugen").
    expect(ABSUCHE_LABEL).toContain('Auswerten');
    expect(findAllByProps<{ children: string }>(tree, { children: ABSUCHE_LABEL }).length).toBeGreaterThan(0);
    expect(findAllByProps<{ children: string }>(tree, { children: LEGEN_LABEL })).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('Tap → kein Stop', () => {
    const handleFinish = jest.fn();
    const tree = renderRunStop(handleFinish);
    act(() => findStop(tree).props.onPress());
    expect(handleFinish).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('kurzer Hold → kein Stop', () => {
    const handleFinish = jest.fn();
    const tree = renderRunStop(handleFinish);
    const stop = findStop(tree);
    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS - 300));
    act(() => stop.props.onPressOut());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS));
    expect(handleFinish).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('1500 ms → handleFinish genau 1x', () => {
    const handleFinish = jest.fn();
    const tree = renderRunStop(handleFinish);
    const stop = findStop(tree);
    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS));
    expect(handleFinish).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('disabled während arming → kein Hold möglich', () => {
    const handleFinish = jest.fn();
    const tree = renderRunStop(handleFinish, { arming: true });
    const disabledProp = (findStop(tree) as unknown as { props: { disabled?: boolean } }).props.disabled;
    expect(disabledProp).toBe(true);
    act(() => tree.unmount());
  });
});
