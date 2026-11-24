import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { FirstTrackGuideCard, useFirstTrackGuide } from '../FirstTrackGuide';
import { FIRST_LAY_GUIDE, FIRST_SEARCH_GUIDE, type GuideStep, type HelpGuideId, type HelpTopicId } from '@/features/help/helpRegistry';
import { keyForUser, sanitizeSeen } from '@/stores/helpSeen';

let mockUserId = 'u0';
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ user: { id: mockUserId } }) }));
jest.mock('@/i18n', () => ({
  useT: () => ({ t: (key: string, p?: Record<string, unknown>) => (p ? `${key}:${JSON.stringify(p)}` : key) }),
}));

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const stored = async (user: string) => sanitizeSeen(JSON.parse((await AsyncStorage.getItem(keyForUser(user))) ?? 'null'));

function Harness({ guideId, legacy, steps, minStep, reached, counter }: {
  guideId: HelpGuideId; legacy: HelpTopicId; steps: GuideStep[]; minStep?: number; reached?: boolean;
  counter: 'help.firstLayCounter' | 'help.firstSearchCounter';
}) {
  const guide = useFirstTrackGuide({ guideId, legacyTopicId: legacy, steps, minStep, reached });
  React.useEffect(() => { probe = guide; });
  return <FirstTrackGuideCard guide={guide} steps={steps} counterKey={counter} />;
}
let probe: { target: string | null; decided: boolean; active: boolean };

async function mount(user: string, props: Partial<React.ComponentProps<typeof Harness>> = {}) {
  mockUserId = user;
  let tree!: ReactTestRenderer;
  const all = { guideId: 'guide_first_lay' as const, legacy: 'track_laying' as const, steps: FIRST_LAY_GUIDE, counter: 'help.firstLayCounter' as const, ...props };
  await act(async () => { tree = TestRenderer.create(<Harness {...all} />); });
  await flush();
  return { tree, rerender: async (next: Partial<React.ComponentProps<typeof Harness>>) => {
    await act(async () => { tree.update(<Harness {...all} {...next} />); });
  } };
}
const card = (tree: ReactTestRenderer) => tree.root.findAll(n => n.props.testID === 'first-track-guide' && typeof n.type === 'string');
const press = (tree: ReactTestRenderer, id: string) => act(() => { tree.root.find(n => n.props.testID === id && typeof n.props.onPress === 'function').props.onPress(); });
const texts = (tree: ReactTestRenderer) => tree.root.findAll(n => typeof n.props.children === 'string').map(n => n.props.children as string);

describe('Geführte erste Fährte', () => {
  it('zeigt neuen Konten Schritt 1 und erst nach dem Laden (kein Aufblitzen)', async () => {
    const { tree } = await mount('new-1');
    expect(probe.decided).toBe(true);
    expect(card(tree)).toHaveLength(1);
    expect(texts(tree)).toContain('help.firstLayStartTitle');
    expect(probe.target).toBeNull();
    act(() => tree.unmount());
  });

  it('springt beim Start der Aufzeichnung auf «Winkel setzen» und hebt den Winkel-Knopf hervor', async () => {
    const { tree, rerender } = await mount('new-2');
    await rerender({ minStep: 1, reached: true });
    expect(texts(tree)).toContain('help.firstLayAngleTitle');
    expect(probe.target).toBe('angle');
    press(tree, 'first-track-guide-next');
    expect(texts(tree)).toContain('help.firstLayObjectTitle');
    expect(probe.target).toBe('object');
    act(() => tree.unmount());
  });

  it('«Überspringen» beendet alles und merkt Anleitung plus altes Coachmark pro Konto', async () => {
    const { tree } = await mount('new-3');
    press(tree, 'first-track-guide-skip');
    expect(card(tree)).toHaveLength(0);
    expect(probe.active).toBe(false);
    await flush();
    expect(await stored('new-3')).toEqual(expect.arrayContaining(['guide_first_lay', 'track_laying']));
    act(() => tree.unmount());
    const again = await mount('new-3');
    expect(card(again.tree)).toHaveLength(0);
    act(() => again.tree.unmount());
  });

  it('läuft bis «Fertig» durch und zeigt sich danach nie wieder', async () => {
    const { tree } = await mount('new-4');
    for (let i = 0; i < FIRST_LAY_GUIDE.length; i++) press(tree, 'first-track-guide-next');
    expect(card(tree)).toHaveLength(0);
    await flush();
    expect(await stored('new-4')).toContain('guide_first_lay');
    act(() => tree.unmount());
  });

  it('bestehende Konten (Coachmark schon gesehen) bekommen keine Anleitung', async () => {
    await AsyncStorage.setItem(keyForUser('old-1'), JSON.stringify(['track_laying']));
    const { tree } = await mount('old-1');
    expect(probe.decided).toBe(true);
    expect(card(tree)).toHaveLength(0);
    expect(probe.target).toBeNull();
    act(() => tree.unmount());
  });

  it('wer den geführten Teil erreicht und den Bildschirm verlässt, sieht sie nicht noch einmal', async () => {
    const { tree, rerender } = await mount('new-5');
    await rerender({ minStep: 1, reached: true });
    await rerender({ minStep: 1, reached: false });   // z. B. Absuche gestartet, Ansatz-Ansicht weg
    act(() => tree.unmount());
    await flush();
    expect(await stored('new-5')).toEqual(expect.arrayContaining(['guide_first_lay', 'track_laying']));
  });

  it('Verlassen vor dem Start zählt nicht als gesehen', async () => {
    const { tree } = await mount('new-6');
    act(() => tree.unmount());
    await flush();
    expect(await stored('new-6')).toEqual([]);
  });

  it('Absuche: ein einziger Hinweis mit «Verstanden», ohne Überspringen', async () => {
    const { tree } = await mount('new-7', { guideId: 'guide_first_search', legacy: 'track_search', steps: FIRST_SEARCH_GUIDE, counter: 'help.firstSearchCounter' });
    expect(texts(tree)).toContain('help.firstSearchTitle');
    expect(tree.root.findAll(n => n.props.testID === 'first-track-guide-skip' && typeof n.type === 'string')).toHaveLength(0);
    expect(texts(tree)).toContain('help.firstGuideGotIt');
    press(tree, 'first-track-guide-next');
    await flush();
    expect(await stored('new-7')).toEqual(expect.arrayContaining(['guide_first_search', 'track_search']));
    act(() => tree.unmount());
  });

  it('Gesehen-Liste behält unbekannte Einträge nicht, kennt aber die neuen Anleitungen', () => {
    expect(sanitizeSeen(['guide_first_lay', 'guide_first_search', 'guide_x', 'home'])).toEqual(['guide_first_lay', 'guide_first_search', 'home']);
  });
});
