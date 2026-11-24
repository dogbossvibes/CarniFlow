import AsyncStorage from '@react-native-async-storage/async-storage';
import { createElement, useEffect } from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import {
  DEFAULT_HOME_CONFIG, keyForUser as homeKey, resetHomeScreenConfigDeferred, setHomeScreenConfig,
  useHomeScreenConfig, type HomeScreenConfig,
} from '@/stores/homeScreenConfig';
import { keyForUser as helpKey, markHelpSeen, resetHelpSeenDeferred, useHelpSeen } from '@/stores/helpSeen';
import { HELP_TOPICS, type HelpSeenId, type HelpTopicId } from '@/features/help/helpRegistry';

const USER = 'user-1';
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const stored = async (key: string) => JSON.parse((await AsyncStorage.getItem(key)) ?? 'null');

let homeCfg: HomeScreenConfig;
let seen: HelpSeenId[];
function Probe({ userId }: { userId: string }) {
  const cfg = useHomeScreenConfig(userId);
  const topics = useHelpSeen(userId);
  useEffect(() => { homeCfg = cfg; seen = topics; });
  return null;
}
async function mount(userId: string) {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = TestRenderer.create(createElement(Probe, { userId })); });
  await flush();
  return tree;
}
const [topicA, topicB, topicC] = Object.keys(HELP_TOPICS) as HelpTopicId[];

describe('Startbildschirm zurücksetzen mit Rückgängig', () => {
  const custom = (): HomeScreenConfig => ({ ...DEFAULT_HOME_CONFIG, layout: 'list' });

  it('zeigt sofort den Standard, speichert aber erst beim Festschreiben', async () => {
    const tree = await mount(USER);
    act(() => setHomeScreenConfig(custom()));
    await flush();
    let reset!: ReturnType<typeof resetHomeScreenConfigDeferred>;
    act(() => { reset = resetHomeScreenConfigDeferred(); });
    expect(homeCfg.layout).toBe(DEFAULT_HOME_CONFIG.layout);
    // Bis zum Festschreiben (Fristablauf oder App geht in den Hintergrund) bleibt der alte Stand gespeichert.
    expect((await stored(homeKey(USER))).layout).toBe('list');
    act(() => reset.commit());
    await flush();
    expect((await stored(homeKey(USER))).layout).toBe(DEFAULT_HOME_CONFIG.layout);
    tree.unmount();
  });

  it('N1: zweimal Zurücksetzen, dann Rückgängig stellt die eigene Anordnung wieder her', async () => {
    const tree = await mount(USER);
    act(() => setHomeScreenConfig(custom()));
    let first!: ReturnType<typeof resetHomeScreenConfigDeferred>;
    let second!: ReturnType<typeof resetHomeScreenConfigDeferred>;
    act(() => { first = resetHomeScreenConfigDeferred(); });
    // Der zweite Hinweis schreibt den ersten fest (wie lib/undoToast).
    act(() => { second = resetHomeScreenConfigDeferred(); first.commit(); });
    act(() => second.undo());
    await flush();
    expect(homeCfg.layout).toBe('list');
    expect((await stored(homeKey(USER))).layout).toBe('list');
    tree.unmount();
  });

  it('späteres Zurücksetzen nach dem Festschreiben ist eine neue Aktion', async () => {
    const tree = await mount(USER);
    act(() => setHomeScreenConfig(custom()));
    let reset!: ReturnType<typeof resetHomeScreenConfigDeferred>;
    act(() => { reset = resetHomeScreenConfigDeferred(); });
    act(() => reset.commit());
    // Standard ist gespeichert; erneutes Zurücksetzen + Rückgängig bleibt beim Standard.
    act(() => { reset = resetHomeScreenConfigDeferred(); });
    act(() => reset.undo());
    await flush();
    expect(homeCfg.layout).toBe(DEFAULT_HOME_CONFIG.layout);
    expect((await stored(homeKey(USER))).layout).toBe(DEFAULT_HOME_CONFIG.layout);
    tree.unmount();
  });

  it('Rückgängig stellt die alte Einstellung wieder her', async () => {
    const tree = await mount(USER);
    act(() => setHomeScreenConfig(custom()));
    let reset!: ReturnType<typeof resetHomeScreenConfigDeferred>;
    act(() => { reset = resetHomeScreenConfigDeferred(); });
    act(() => reset.undo());
    await flush();
    expect(homeCfg.layout).toBe('list');
    expect((await stored(homeKey(USER))).layout).toBe('list');
    tree.unmount();
  });

  it('schreibt nach einem Nutzerwechsel nichts in das andere Konto', async () => {
    const tree = await mount(USER);
    act(() => setHomeScreenConfig(custom()));
    let reset!: ReturnType<typeof resetHomeScreenConfigDeferred>;
    act(() => { reset = resetHomeScreenConfigDeferred(); });
    await act(async () => { tree.update(createElement(Probe, { userId: 'user-2' })); });
    await flush();
    act(() => { reset.commit(); reset.undo(); });
    await flush();
    expect(await AsyncStorage.getItem(homeKey('user-2'))).toBeNull();
    expect((await stored(homeKey(USER))).layout).toBe('list');
    tree.unmount();
  });
});

describe('Hilfe-Hinweise zurücksetzen mit Rückgängig', () => {
  it('speichert erst beim Festschreiben und stellt bei Rückgängig alles wieder her', async () => {
    const tree = await mount('help-user');
    act(() => { markHelpSeen(topicA); markHelpSeen(topicB); });
    await flush();
    let reset!: ReturnType<typeof resetHelpSeenDeferred>;
    act(() => { reset = resetHelpSeenDeferred(); });
    expect(seen).toEqual([]);
    expect(await stored(helpKey('help-user'))).toEqual([topicA, topicB]);
    // Ein in der Frist gesehener Hinweis bleibt auch nach Rückgängig gesehen.
    act(() => markHelpSeen(topicC));
    act(() => reset.undo());
    await flush();
    expect(seen).toEqual([topicA, topicB, topicC]);
    expect(await stored(helpKey('help-user'))).toEqual([topicA, topicB, topicC]);

    // N1: zweimal Zurücksetzen, dann Rückgängig stellt alle gesehenen Hinweise wieder her.
    let second!: ReturnType<typeof resetHelpSeenDeferred>;
    act(() => { reset = resetHelpSeenDeferred(); });
    act(() => { second = resetHelpSeenDeferred(); reset.commit(); });
    act(() => second.undo());
    await flush();
    expect(await stored(helpKey('help-user'))).toEqual([topicA, topicB, topicC]);

    act(() => { reset = resetHelpSeenDeferred(); });
    act(() => reset.commit());
    await flush();
    expect(await stored(helpKey('help-user'))).toEqual([]);
    // Späteres Zurücksetzen nach dem Festschreiben ist eine neue Aktion.
    act(() => { reset = resetHelpSeenDeferred(); });
    act(() => reset.undo());
    await flush();
    expect(await stored(helpKey('help-user'))).toEqual([]);
    tree.unmount();
  });
});
