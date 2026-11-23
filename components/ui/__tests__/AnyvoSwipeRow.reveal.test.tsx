// Rote Ecken im Journal: die Wisch-Aktionen liegen dauerhaft hinter der Karte und dürfen im
// Ruhezustand nicht an den runden Kartenecken hervorschauen.
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AnyvoSwipeRow } from '../AnyvoSwipeRow';
import { swipeActionOpacity } from '../SwipeActionReveal';

let mockTranslation = 0;
jest.mock('@/lib/monitoring', () => ({ captureError: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  __esModule: true,
  SwipeDirection: { LEFT: 'left', RIGHT: 'right' },
  // Wie die echte Komponente: jede Aktion erhält (progress, translation).
  default: ({ children, renderLeftActions, renderRightActions }: {
    children: React.ReactNode;
    renderLeftActions?: (progress: { value: number }, translation: { value: number }) => React.ReactNode;
    renderRightActions?: (progress: { value: number }, translation: { value: number }) => React.ReactNode;
  }) => jest.requireActual('react').createElement(
    jest.requireActual('react').Fragment, null,
    renderLeftActions?.({ value: 0 }, { value: mockTranslation }), children, renderRightActions?.({ value: 0 }, { value: mockTranslation }),
  ),
}));

let view: ReactTestRenderer;
afterEach(() => { act(() => view?.unmount()); mockTranslation = 0; });

function render() {
  act(() => {
    view = TestRenderer.create(
      <AnyvoSwipeRow
        accessibilityLabel="Eintrag"
        rightActions={[{ key: 'delete', label: 'Löschen', icon: 'trash-outline', destructive: true, onPress: () => {} }]}
        leftActions={[{ key: 'edit', label: 'Bearbeiten', icon: 'create-outline', onPress: () => {} }]}
      >
        <Text>Karte</Text>
      </AnyvoSwipeRow>,
    );
  });
}

/** Deckkraft der Hülle um die Aktion mit diesem Text. */
function revealOpacity(label: string): number | undefined {
  type Node = { props: { style?: Parameters<typeof StyleSheet.flatten>[0]; accessibilityRole?: string }; parent: Node | null };
  let node = (view.root as unknown as { findByProps: (props: object) => Node }).findByProps({ children: label }).parent;
  while (node) {
    const style = StyleSheet.flatten(node.props.style) as { opacity?: number } | undefined;
    if (style && typeof style.opacity === 'number' && (style.opacity === 0 || style.opacity === 1) && node.props.accessibilityRole !== 'button') return style.opacity;
    node = node.parent;
  }
  return undefined;
}

describe('AnyvoSwipeRow: Aktionen nur beim Wischen sichtbar', () => {
  it('im Ruhezustand sind beide Aktionsseiten unsichtbar (keine roten Ecken)', () => {
    render();
    expect(revealOpacity('Löschen')).toBe(0);
    expect(revealOpacity('Bearbeiten')).toBe(0);
  });

  it('nach links gewischt: rechte Aktion sichtbar, linke bleibt unsichtbar', () => {
    mockTranslation = -40; render();
    expect(revealOpacity('Löschen')).toBe(1);
    expect(revealOpacity('Bearbeiten')).toBe(0);
  });

  it('nach rechts gewischt: linke Aktion sichtbar, rechte bleibt unsichtbar', () => {
    mockTranslation = 40; render();
    expect(revealOpacity('Bearbeiten')).toBe(1);
    expect(revealOpacity('Löschen')).toBe(0);
  });

  it('gemeinsame Regel: erst ab spürbarem Zug sichtbar', () => {
    expect(swipeActionOpacity(0, 'right')).toBe(0);
    expect(swipeActionOpacity(-0.3, 'right')).toBe(0);
    expect(swipeActionOpacity(-12, 'right')).toBe(1);
    expect(swipeActionOpacity(12, 'left')).toBe(1);
  });
});
