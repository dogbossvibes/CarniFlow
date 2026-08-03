jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createElement } from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import {
  ALL_HOME_WIDGETS,
  ALL_QUICK_ACTIONS,
  ALL_FAB_ACTIONS,
  DEFAULT_FAB_ACTION,
  addDogBackpackQuickAction,
  actionIdOf,
  DEFAULT_HOME_CONFIG,
  HOME_LAYOUT_MODES,
  MAX_QUICK_ACTIONS,
  keyForUser,
  moveInArray,
  sanitizeHomeScreenConfig,
  setHomeScreenConfig,
  setWidgetVisible,
  toggleQuickAction,
  useHomeScreenConfig,
  visibleWidgets,
  type HomeScreenConfig,
} from '@/stores/homeScreenConfig';

function FabHost({ userId }: { userId: string | null }) {
  const cfg = useHomeScreenConfig(userId);
  return createElement(Text, null, cfg.fabActionId);
}

function fabTexts(node: ReactTestRenderer): string[] {
  return (node.root as unknown as { findAllByType: (t: unknown) => { props: { children: unknown } }[] })
    .findAllByType(Text)
    .map((t) => String(t.props.children));
}

describe('homeScreenConfig — Startbildschirm-Konfiguration', () => {
  // 1) Default-Config ist gültig & sofort nutzbar
  it('1) Default-Config ist gültig', () => {
    expect(sanitizeHomeScreenConfig(DEFAULT_HOME_CONFIG)).toEqual(DEFAULT_HOME_CONFIG);
    expect(DEFAULT_HOME_CONFIG.quickActions.length).toBe(6);
    expect(DEFAULT_HOME_CONFIG.quickActions).not.toContain('show_analysis'); // Analyse nicht Default
    expect(DEFAULT_HOME_CONFIG.layout).toBe('grid');
  });

  // 21) funktioniert ohne gespeicherte Config → Default
  it('21) ohne gespeicherte Config (null/undefined) → Default', () => {
    expect(sanitizeHomeScreenConfig(null)).toEqual(DEFAULT_HOME_CONFIG);
    expect(sanitizeHomeScreenConfig(undefined)).toEqual(DEFAULT_HOME_CONFIG);
    expect(sanitizeHomeScreenConfig('kaputt')).toEqual(DEFAULT_HOME_CONFIG);
  });

  // 17) beschädigte Config → sicherer Fallback, kein Crash
  it('17) beschädigte Config fällt sauber zurück', () => {
    const out = sanitizeHomeScreenConfig({
      layout: 'weird',
      quickActions: ['add_dog', 'ghost_action', 'add_dog'], // ungültig + Duplikat
      widgetOrder: ['dogs', 'unknown_widget'],
      hiddenWidgets: 'nope',
    } as unknown);
    expect(HOME_LAYOUT_MODES).toContain(out.layout);
    expect(out.layout).toBe('grid'); // ungültig → Default
    expect(out.quickActions).toEqual(['add_dog']); // ungültige + Dubletten raus
    expect(out.hiddenWidgets).toEqual([]);
  });

  // 18) unbekannte/veraltete Aktion → herausgefiltert, kein Crash
  it('18) unbekannte Aktion wird gefiltert', () => {
    const out = sanitizeHomeScreenConfig({ ...DEFAULT_HOME_CONFIG, quickActions: ['start_timer', 'does_not_exist'] });
    expect(out.quickActions).toEqual(['start_timer']);
  });

  // 12) entferntes/fehlendes Widget wird hinten ergänzt, Reihenfolge erhalten
  it('12) fehlende Widgets werden ergänzt, vorhandene Reihenfolge bleibt', () => {
    const out = sanitizeHomeScreenConfig({ ...DEFAULT_HOME_CONFIG, widgetOrder: ['dogs', 'week'] });
    expect(out.widgetOrder.slice(0, 2)).toEqual(['dogs', 'week']);
    expect(new Set(out.widgetOrder)).toEqual(new Set(ALL_HOME_WIDGETS));
    expect(out.widgetOrder.length).toBe(ALL_HOME_WIDGETS.length);
  });

  // 6) alle 3 Layouts gültig
  it('6) alle Layout-Modi werden akzeptiert', () => {
    for (const m of HOME_LAYOUT_MODES) {
      expect(sanitizeHomeScreenConfig({ ...DEFAULT_HOME_CONFIG, layout: m }).layout).toBe(m);
    }
    expect(HOME_LAYOUT_MODES).toEqual(['grid', 'list', 'compact']);
  });

  // 2) Schnellaktion an-/abwählen
  it('2) toggleQuickAction fügt hinzu und entfernt', () => {
    const base: HomeScreenConfig = { ...DEFAULT_HOME_CONFIG, quickActions: ['add_dog'] };
    const added = toggleQuickAction(base, 'show_analysis');
    expect(added.quickActions).toEqual(['add_dog', 'show_analysis']);
    const removed = toggleQuickAction(added, 'add_dog');
    expect(removed.quickActions).toEqual(['show_analysis']);
  });

  // 11) max 6 aktive Schnellaktionen erzwungen
  it('11) mehr als 6 Schnellaktionen werden blockiert/gekappt', () => {
    const six: HomeScreenConfig = { ...DEFAULT_HOME_CONFIG, quickActions: ALL_QUICK_ACTIONS.slice(0, MAX_QUICK_ACTIONS) };
    expect(six.quickActions.length).toBe(6);
    const seventh = ALL_QUICK_ACTIONS[6];
    const out = toggleQuickAction(six, seventh);
    expect(out.quickActions.length).toBe(6); // 7. wird blockiert
    expect(out.quickActions).not.toContain(seventh);
    // Sanitizer kappt ebenfalls auf 6
    expect(sanitizeHomeScreenConfig({ ...DEFAULT_HOME_CONFIG, quickActions: ALL_QUICK_ACTIONS }).quickActions.length).toBe(6);
  });

  // 3) Reihenfolge ändern (Reorder)
  it('3) moveInArray verschiebt hoch/runter, Ränder sind stabil', () => {
    expect(moveInArray(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveInArray(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveInArray(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']); // oben → no-op
    expect(moveInArray(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);  // unten → no-op
  });

  // 4/5) Widget ein-/ausblenden + sichtbare Reihenfolge
  it('4+5) setWidgetVisible blendet aus/ein, visibleWidgets respektiert Reihenfolge', () => {
    const hidden = setWidgetVisible(DEFAULT_HOME_CONFIG, 'dogs', false);
    expect(hidden.hiddenWidgets).toContain('dogs');
    expect(visibleWidgets(hidden)).not.toContain('dogs');
    const shown = setWidgetVisible(hidden, 'dogs', true);
    expect(shown.hiddenWidgets).not.toContain('dogs');
    expect(visibleWidgets(shown)).toEqual(DEFAULT_HOME_CONFIG.widgetOrder);
  });

  // 20) Pro-Benutzer-Isolation über den Storage-Key
  it('20) Storage-Key ist pro Benutzer', () => {
    expect(keyForUser('user-a')).toBe('home_screen_config:user-a');
    expect(keyForUser('user-b')).toBe('home_screen_config:user-b');
    expect(keyForUser('user-a')).not.toBe(keyForUser('user-b'));
    expect(keyForUser(null)).toBe('home_screen_config:anon');
    expect(keyForUser(undefined)).toBe('home_screen_config:anon');
  });

  // 7) Reset entspricht Default (idempotent über Sanitizer)
  it('7) sanitize(DEFAULT) bleibt Default (Reset-Grundlage)', () => {
    expect(sanitizeHomeScreenConfig({ ...DEFAULT_HOME_CONFIG })).toEqual(DEFAULT_HOME_CONFIG);
  });

  it('22) Backpack-Schnellaktion speichert die dogs.id', () => {
    const out = addDogBackpackQuickAction({ ...DEFAULT_HOME_CONFIG, quickActions: DEFAULT_HOME_CONFIG.quickActions.slice(0, 5) }, 'dog-sam');
    expect(out.quickActions).toHaveLength(6);
    const entry = out.quickActions.find(item => actionIdOf(item) === 'dog_backpack');
    expect(entry).toMatchObject({ actionId: 'dog_backpack', dogId: 'dog-sam' });
  });

  it('23) Backpack-Instanzen bleiben für mehrere Hunde getrennt', () => {
    const raw = {
      ...DEFAULT_HOME_CONFIG,
      quickActions: [
        { instanceId: 'sam', actionId: 'dog_backpack', dogId: 'sam-id' },
        { instanceId: 'malu', actionId: 'dog_backpack', dogId: 'malu-id' },
      ],
      widgetConfigs: [{ instanceId: 'backpack-widget', widgetId: 'dog_backpack', dogId: 'sam-id' }],
    };
    const out = sanitizeHomeScreenConfig(raw);
    expect(out.quickActions).toEqual([
      { instanceId: 'sam', actionId: 'dog_backpack', dogId: 'sam-id' },
      { instanceId: 'malu', actionId: 'dog_backpack', dogId: 'malu-id' },
    ]);
    expect(out.widgetConfigs).toEqual(raw.widgetConfigs);
  });

  it('24) ungültige Backpack-Config wird ohne Hund-ID verworfen', () => {
    const out = sanitizeHomeScreenConfig({
      ...DEFAULT_HOME_CONFIG,
      quickActions: [{ instanceId: 'broken', actionId: 'dog_backpack' }],
      widgetConfigs: [{ instanceId: 'broken-widget', widgetId: 'dog_backpack' }],
    });
    expect(out.quickActions).not.toContainEqual(expect.objectContaining({ actionId: 'dog_backpack' }));
    expect(out.widgetConfigs).toEqual([]);
  });

  it('25) doppelte Instanz-IDs werden repariert', () => {
    const out = sanitizeHomeScreenConfig({
      ...DEFAULT_HOME_CONFIG,
      quickActions: [
        { instanceId: 'same', actionId: 'dog_backpack', dogId: 'sam-id' },
        { instanceId: 'same', actionId: 'dog_backpack', dogId: 'malu-id' },
      ],
    });
    const entries = out.quickActions.filter(item => typeof item !== 'string');
    expect(new Set(entries.map(item => typeof item === 'string' ? item : item.instanceId)).size).toBe(2);
  });

  // ── FAB (personalisierbarer Schnellbutton) ──────────────────────────────

  it('26) FAB-Standard = Termin erstellen (neue Nutzer + fehlender Wert)', () => {
    expect(DEFAULT_FAB_ACTION).toBe('create_appointment');
    expect(DEFAULT_HOME_CONFIG.fabActionId).toBe('create_appointment');
    expect(DEFAULT_HOME_CONFIG.fabVisible).toBe(true);
    expect(sanitizeHomeScreenConfig(null).fabActionId).toBe('create_appointment');
    expect(sanitizeHomeScreenConfig(undefined).fabActionId).toBe('create_appointment');
    expect(sanitizeHomeScreenConfig({} as unknown).fabActionId).toBe('create_appointment');
    expect(sanitizeHomeScreenConfig(null).fabVisible).toBe(true);
  });

  it('27) gespeicherte FAB-Auswahl bleibt erhalten (kein Zurücksetzen)', () => {
    const out = sanitizeHomeScreenConfig({ ...DEFAULT_HOME_CONFIG, fabActionId: 'start_track', fabVisible: false });
    expect(out.fabActionId).toBe('start_track');
    expect(out.fabVisible).toBe(false);
  });

  it('28) ungültige/alte Action-ID fällt auf create_appointment zurück', () => {
    expect(sanitizeHomeScreenConfig({ ...DEFAULT_HOME_CONFIG, fabActionId: 'ghost_action' } as unknown).fabActionId).toBe(DEFAULT_FAB_ACTION);
    expect(sanitizeHomeScreenConfig({ ...DEFAULT_HOME_CONFIG, fabActionId: '' } as unknown).fabActionId).toBe(DEFAULT_FAB_ACTION);
  });

  it('29) hidden-Aktion wird als ID akzeptiert (Alt-Configs)', () => {
    expect(ALL_FAB_ACTIONS).toContain('hidden');
    expect(sanitizeHomeScreenConfig({ ...DEFAULT_HOME_CONFIG, fabActionId: 'hidden' }).fabActionId).toBe('hidden');
  });

  it('30) fabVisible: Standard true, nur explizit false bleibt false', () => {
    expect(sanitizeHomeScreenConfig({ ...DEFAULT_HOME_CONFIG, fabVisible: 'nope' } as unknown).fabVisible).toBe(true);
    expect(sanitizeHomeScreenConfig({ ...DEFAULT_HOME_CONFIG, fabVisible: false }).fabVisible).toBe(false);
  });

  it('31) Auswahl wird gespeichert (setHomeScreenConfig → AsyncStorage)', async () => {
    setHomeScreenConfig({ ...DEFAULT_HOME_CONFIG, fabActionId: 'start_training' });
    const raw = await AsyncStorage.getItem(keyForUser(null));
    const stored = JSON.parse(raw ?? '{}');
    expect(stored.fabActionId).toBe('start_training');
  });

  it('32) App-Neustart behält die FAB-Auswahl (hydrate aus AsyncStorage)', async () => {
    await AsyncStorage.setItem(keyForUser('u1'), JSON.stringify({ ...DEFAULT_HOME_CONFIG, fabActionId: 'start_track', fabVisible: false }));
    let node!: ReactTestRenderer;
    await act(async () => {
      node = TestRenderer.create(createElement(FabHost, { userId: 'u1' }));
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(fabTexts(node)).toContain('start_track');
  });
});
