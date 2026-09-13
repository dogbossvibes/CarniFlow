import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { TrackScoreRing } from '@/features/tracking/components/TrackScoreRing';

// Ring-Innenraum: nur Zahl (+ optional „/max"). Lange Beschriftungen gehören
// NICHT in den Ring (Auswertungs-Screen: Label unter dem Ring, Notenstufe rechts).
function texts(node: ReactTestRenderer): string[] {
  // Typisierung wie in DogBackpackCard.test.tsx (react-test-renderer-Typen kennen findAllByType nicht).
  const nodes = (node.root as unknown as { findAllByType: (t: unknown) => { props: { children: unknown } }[] }).findAllByType(Text);
  return nodes.map(t => React.Children.toArray(t.props.children as React.ReactNode).join(''));
}

describe('TrackScoreRing', () => {
  it('showMax: Zahl + „/100", sonst kein Text im Ring', () => {
    let node!: ReactTestRenderer;
    act(() => { node = TestRenderer.create(<TrackScoreRing value={69} size={96} showMax />); });
    expect(texts(node)).toEqual(['69', '/100']);
  });
  it('ohne showMax/label/sub steht ausschliesslich die Zahl im Ring (bestehendes Verhalten)', () => {
    let node!: ReactTestRenderer;
    act(() => { node = TestRenderer.create(<TrackScoreRing value={42} />); });
    expect(texts(node)).toEqual(['42']);
  });
  it('label/sub bleiben für kurze Wörter verfügbar (keine API-Änderung für andere Aufrufer)', () => {
    let node!: ReactTestRenderer;
    act(() => { node = TestRenderer.create(<TrackScoreRing value={88} label="Score" sub="Gut" />); });
    expect(texts(node)).toEqual(['88', 'Score', 'Gut']);
  });
});
