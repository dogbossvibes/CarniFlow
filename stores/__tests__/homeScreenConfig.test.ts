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
  DEFAULT_QUICK_BUTTON_ACTIONS,
  DEFAULT_QUICK_BUTTON_POSITION,
  addDogBackpackQuickAction,
  actionIdOf,
  backpackWidgetDogIds,
  DEFAULT_HOME_CONFIG,
  HOME_LAYOUT_MODES,
  MAX_QUICK_ACTIONS,
  MAX_QUICK_BUTTON_ACTIONS,
  QUICK_BUTTON_FIXED_ACTIONS,
  QUICK_BUTTON_ROUTE_ACTIONS,
  addQuickButtonAction,
  dogBackpackActionId,
  dogOpenActionId,
  keyForUser,
  moveInArray,
  moveQuickButtonAction,
  parseQuickActionId,
  quickButtonActionIdsOf,
  removeQuickButtonAction,
  resolveQuickAction,
  sanitizeHomeScreenConfig,
  sanitizeQuickButtonActions,
  sanitizeQuickButtonPosition,
  setHomeScreenConfig,
  setWidgetVisible,
  toggleBackpackWidgetDog,
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

function BackpackHost({ userId }: { userId: string | null }) {
  const cfg = useHomeScreenConfig(userId);
  return createElement(Text, null, backpackWidgetDogIds(cfg).join(','));
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

  // ── Backpack-Widget (T-42): Hund pro Widget an-/abwählen ────────────────

  it('33) Hund antippen wählt den Hund für das Backpack-Widget', () => {
    const out = toggleBackpackWidgetDog(DEFAULT_HOME_CONFIG, 'd1');
    expect(backpackWidgetDogIds(out)).toEqual(['d1']);
    expect(out.widgetConfigs).toEqual([{ instanceId: 'dog_backpack-widget-d1', widgetId: 'dog_backpack', dogId: 'd1' }]);
  });

  it('34) erneut antippen wählt ab (kein Doppel-Eintrag)', () => {
    const once = toggleBackpackWidgetDog(DEFAULT_HOME_CONFIG, 'd1');
    const twice = toggleBackpackWidgetDog(once, 'd1');
    expect(backpackWidgetDogIds(twice)).toEqual([]);
    expect(twice.widgetConfigs).toEqual([]);
  });

  it('35) mehrere Hunde gleichzeitig auswählbar', () => {
    const a = toggleBackpackWidgetDog(DEFAULT_HOME_CONFIG, 'd1');
    const b = toggleBackpackWidgetDog(a, 'd2');
    expect(backpackWidgetDogIds(b)).toEqual(['d1', 'd2']);
    const c = toggleBackpackWidgetDog(b, 'd1');   // einer abgewählt
    expect(backpackWidgetDogIds(c)).toEqual(['d2']);
  });

  it('36) leere Hund-ID ändert nichts', () => {
    expect(toggleBackpackWidgetDog(DEFAULT_HOME_CONFIG, '  ')).toEqual(DEFAULT_HOME_CONFIG);
    expect(toggleBackpackWidgetDog(DEFAULT_HOME_CONFIG, '')).toEqual(DEFAULT_HOME_CONFIG);
  });

  it('37) Auswahl übersteht Sanitize (stabile Instanz-ID)', () => {
    const out = sanitizeHomeScreenConfig(toggleBackpackWidgetDog(DEFAULT_HOME_CONFIG, 'd1'));
    expect(backpackWidgetDogIds(out)).toEqual(['d1']);
  });

  it('38) Widget-Auswahl wird gespeichert (setHomeScreenConfig → AsyncStorage)', async () => {
    let host!: ReactTestRenderer;
    await act(async () => { host = TestRenderer.create(createElement(BackpackHost, { userId: 'u1' })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    setHomeScreenConfig(toggleBackpackWidgetDog(DEFAULT_HOME_CONFIG, 'd1'));
    const raw = await AsyncStorage.getItem(keyForUser('u1'));
    const stored = JSON.parse(raw ?? '{}');
    expect(backpackWidgetDogIds(stored)).toEqual(['d1']);
  });

  it('39) App-Neustart behält die Backpack-Widget-Auswahl (hydrate)', async () => {
    await AsyncStorage.setItem(keyForUser('u1'), JSON.stringify({ ...DEFAULT_HOME_CONFIG, widgetConfigs: [{ instanceId: 'dog_backpack-widget-d1', widgetId: 'dog_backpack', dogId: 'd1' }] }));
    let node!: ReactTestRenderer;
    await act(async () => {
      node = TestRenderer.create(createElement(BackpackHost, { userId: 'u1' }));
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(fabTexts(node)).toContain('d1');
  });

  // ── Schnellbutton (T-42, global): quickButtonActions (max. 8) ─────────────

  it('40) QuickButton-Standard = Termin erstellen (neue Nutzer + fehlender Wert)', () => {
    expect(DEFAULT_QUICK_BUTTON_ACTIONS).toEqual(['create_appointment']);
    expect(DEFAULT_HOME_CONFIG.quickButtonActions).toEqual(['create_appointment']);
    expect(DEFAULT_HOME_CONFIG.quickButtonVisible).toBe(true);
    expect(sanitizeHomeScreenConfig(null).quickButtonActions).toEqual(['create_appointment']);
    expect(sanitizeHomeScreenConfig(undefined).quickButtonActions).toEqual(['create_appointment']);
    expect(sanitizeHomeScreenConfig({} as unknown).quickButtonActions).toEqual(['create_appointment']);
    expect(sanitizeHomeScreenConfig(null).quickButtonVisible).toBe(true);
  });

  it('41) mehrere Aktionen bleiben in Reihenfolge erhalten (max. 8)', () => {
    const out = sanitizeHomeScreenConfig({
      ...DEFAULT_HOME_CONFIG,
      quickButtonActions: ['start_training', dogOpenActionId('d1'), 'training_journal', 'hide_button'],
    });
    expect(out.quickButtonActions).toEqual(['start_training', 'open-dog:d1', 'training_journal', 'hide_button']);
    expect(out.quickButtonVisible).toBe(true);
  });

  it('42) ungültige/veraltete Aktionen werden gefiltert + dedupliziert; leere Auswahl bleibt leer', () => {
    const out = sanitizeHomeScreenConfig({
      ...DEFAULT_HOME_CONFIG,
      quickButtonActions: ['ghost_action', '', 'open-backpack:d2', 'start_track', 'start_track', 'hide_button'],
    } as unknown);
    expect(out.quickButtonActions).toEqual(['open-backpack:d2', 'start_track', 'hide_button']);
    // Nutzer hat bewusst alles entfernt → NICHT auf Standard zurücksetzen.
    expect(sanitizeHomeScreenConfig({ ...DEFAULT_HOME_CONFIG, quickButtonActions: [] }).quickButtonActions).toEqual([]);
  });

  it('43) hide_button + Hund-Aktionen sind gültig (canonical Keys)', () => {
    expect(parseQuickActionId('hide_button')).toEqual({ kind: 'hide' });
    expect(parseQuickActionId('open-dog:  d7 ')).toEqual({ kind: 'dog', dogId: 'd7' });
    expect(parseQuickActionId('open-backpack:d8')).toEqual({ kind: 'dog_backpack', dogId: 'd8' });
    expect(parseQuickActionId('open-dog:')).toEqual({ kind: 'invalid' });
    expect(parseQuickActionId(42)).toEqual({ kind: 'invalid' });
    expect(sanitizeQuickButtonActions(['open-dog:d1', 'open-dog:d1', 'open-backpack:d1']))
      .toEqual(['open-dog:d1', 'open-backpack:d1']);
  });

  it('44) quickButtonVisible: Standard true, nur explizit false bleibt false', () => {
    expect(sanitizeHomeScreenConfig({ ...DEFAULT_HOME_CONFIG, quickButtonVisible: 'nope' } as unknown).quickButtonVisible).toBe(true);
    expect(sanitizeHomeScreenConfig({ ...DEFAULT_HOME_CONFIG, quickButtonVisible: false }).quickButtonVisible).toBe(false);
  });

  it('45) Migration: legacy fabActionId/fabVisible werden übernommen', () => {
    const out = sanitizeHomeScreenConfig({ fabActionId: 'start_training', fabVisible: false } as unknown);
    expect(out.quickButtonActions).toEqual(['start_training']);
    expect(out.quickButtonVisible).toBe(false);
    expect(out.fabActionId).toBe('start_training');
    // fabActionId 'hidden' (T-41) → kein Schnellbutton.
    expect(sanitizeHomeScreenConfig({ fabActionId: 'hidden' } as unknown).quickButtonActions).toEqual([]);
  });

  it('46) Migration: legacy quickButtonActionId/quickButtonDogId (T-42 v1); neue Felder gewinnen', () => {
    const openDog = sanitizeHomeScreenConfig({ quickButtonActionId: 'open_dog', quickButtonDogId: 'd1' } as unknown);
    expect(openDog.quickButtonActions).toEqual(['open-dog:d1']);
    const backpack = sanitizeHomeScreenConfig({ quickButtonActionId: 'open_backpack', quickButtonDogId: 'd2' } as unknown);
    expect(backpack.quickButtonActions).toEqual(['open-backpack:d2']);
    // Legacydaten + fabActionId open_dog → Hund-Aktion.
    expect(sanitizeHomeScreenConfig({ fabActionId: 'open_dog', quickButtonDogId: 'd3' } as unknown).quickButtonActions)
      .toEqual(['open-dog:d3']);
    // Neue quickButtonActions sind Quell der Wahrheit (gewinnen über Legacy).
    const fresh = sanitizeHomeScreenConfig({
      quickButtonActions: ['start_track'],
      quickButtonActionId: 'open_dog', quickButtonDogId: 'd9',
      fabActionId: 'create_appointment',
    } as unknown);
    expect(fresh.quickButtonActions).toEqual(['start_track']);
  });

  it('47) quickButtonActionIdsOf filtert gelöschte Hunde, behält Reihenfolge', () => {
    const cfg = { ...DEFAULT_HOME_CONFIG, quickButtonActions: ['start_track', 'open-dog:d1', 'open-backpack:ghost', 'hide_button'] };
    expect(quickButtonActionIdsOf(cfg, [{ id: 'd1' }])).toEqual(['start_track', 'open-dog:d1', 'hide_button']);
    expect(quickButtonActionIdsOf(cfg, [])).toEqual(['start_track', 'hide_button']);
  });

  it('48) quickButtonActionIdsOf kappt auf MAX_QUICK_BUTTON_ACTIONS (8)', () => {
    const ids = ['start_training', 'document_training', 'training_journal', 'start_track',
      'create_appointment', 'add_dog', 'hide_button', 'open-dog:d1', 'open-backpack:d2'];
    const cfg = { ...DEFAULT_HOME_CONFIG, quickButtonActions: ids };
    const out = quickButtonActionIdsOf(cfg, [{ id: 'd1' }, { id: 'd2' }]);
    expect(out.length).toBe(MAX_QUICK_BUTTON_ACTIONS);
    expect(out[out.length - 1]).toBe('open-dog:d1');   // letzte erlaubte Aktion
    expect(out).not.toContain('open-backpack:d2');     // Nummer 9 → gekappt
  });

  it('49) dogOpenActionId/dogBackpackActionId sind stabil + in FIXED_ACTIONS enthalten', () => {
    expect(dogOpenActionId('d1')).toBe('open-dog:d1');
    expect(dogBackpackActionId('d1')).toBe('open-backpack:d1');
    expect(QUICK_BUTTON_ROUTE_ACTIONS).toHaveLength(6);
    expect(QUICK_BUTTON_FIXED_ACTIONS).toEqual([...QUICK_BUTTON_ROUTE_ACTIONS, 'hide_button']);
  });

  it('50) resolveQuickAction: Route, Hund (nur wenn vorhanden), hide/unknown → null', () => {
    expect(resolveQuickAction('start_training', [])).toEqual({ type: 'route', route: '/unit/start' });
    expect(resolveQuickAction('create_appointment', [])).toEqual({ type: 'route', route: '/training-hub' });
    expect(resolveQuickAction('add_dog', [])).toEqual({ type: 'route', route: '/add-dog' });
    expect(resolveQuickAction('open-dog:d1', [{ id: 'd1' }])).toEqual({ type: 'dog', dogId: 'd1' });
    expect(resolveQuickAction('open-backpack:d1', [{ id: 'd1' }])).toEqual({ type: 'dog_backpack', dogId: 'd1' });
    expect(resolveQuickAction('open-dog:ghost', [{ id: 'd1' }])).toBeNull();   // gelöscht → kein Ziel
    expect(resolveQuickAction('open-backpack:ghost', [])).toBeNull();
    expect(resolveQuickAction('hide_button', [])).toBeNull();                  // kein Navigations-Ziel
    expect(resolveQuickAction('ghost_action', [])).toBeNull();
  });

  it('51) add/remove/move: anwählen (max 8), entfernen, Reihenfolge verschieben', () => {
    let cfg: HomeScreenConfig = { ...DEFAULT_HOME_CONFIG, quickButtonActions: [] };
    cfg = addQuickButtonAction(cfg, 'start_training');
    cfg = addQuickButtonAction(cfg, 'open-dog:d1');
    cfg = addQuickButtonAction(cfg, 'start_training');          // Duplikat → ignoriert
    expect(cfg.quickButtonActions).toEqual(['start_training', 'open-dog:d1']);
    expect(addQuickButtonAction(cfg, 'ghost_action')).toBe(cfg); // ungültig → unverändert

    const full = { ...DEFAULT_HOME_CONFIG, quickButtonActions: Array.from({ length: MAX_QUICK_BUTTON_ACTIONS }, (_, i) => `start_track` as string) };
    expect(addQuickButtonAction(full, 'add_dog')).toBe(full);    // voll → blockiert

    cfg = moveQuickButtonAction(cfg, 'open-dog:d1', -1);
    expect(cfg.quickButtonActions).toEqual(['open-dog:d1', 'start_training']);
    cfg = removeQuickButtonAction(cfg, 'open-dog:d1');
    expect(cfg.quickButtonActions).toEqual(['start_training']);
  });

  it('52) QuickButton-Auswahl wird gespeichert (setHomeScreenConfig → AsyncStorage)', async () => {
    setHomeScreenConfig({
      ...DEFAULT_HOME_CONFIG,
      quickButtonActions: ['start_training', dogOpenActionId('d1')],
    });
    const raw = await AsyncStorage.getItem(keyForUser('u1'));
    const stored = JSON.parse(raw ?? '{}');
    expect(stored.quickButtonActions).toEqual(['start_training', 'open-dog:d1']);
  });

  // ── T-42C: verschiebbare Position (quickButtonPosition: side + yRatio) ─────

  it('53) Standard: kein quickButtonPosition → klassische Position (rechts unten)', () => {
    expect(DEFAULT_QUICK_BUTTON_POSITION).toEqual({ side: 'right', yRatio: 1 });
    expect(DEFAULT_HOME_CONFIG.quickButtonPosition).toBeUndefined();
    expect(sanitizeHomeScreenConfig(null).quickButtonPosition).toBeUndefined();
    expect(sanitizeQuickButtonPosition(undefined)).toBeUndefined();
    expect(sanitizeQuickButtonPosition(null)).toBeUndefined();
  });

  it('54) gültige Position bleibt erhalten; yRatio wird auf 0..1 geklemmt', () => {
    expect(sanitizeQuickButtonPosition({ side: 'left', yRatio: 0.4 })).toEqual({ side: 'left', yRatio: 0.4 });
    expect(sanitizeQuickButtonPosition({ side: 'right', yRatio: -0.5 })).toEqual({ side: 'right', yRatio: 0 });
    expect(sanitizeQuickButtonPosition({ side: 'left', yRatio: 7 })).toEqual({ side: 'left', yRatio: 1 });
    expect(sanitizeQuickButtonPosition({ side: 'left', yRatio: 0.5, extra: 1 })).toEqual({ side: 'left', yRatio: 0.5 });
  });

  it('55) ungültige Werte → Standard (Seite right, yRatio 1), nie ein Crash', () => {
    expect(sanitizeQuickButtonPosition({})).toEqual(DEFAULT_QUICK_BUTTON_POSITION);
    expect(sanitizeQuickButtonPosition({ side: 'top', yRatio: 0.5 })).toEqual({ side: 'right', yRatio: 0.5 });
    expect(sanitizeQuickButtonPosition({ side: 'left', yRatio: 'hoch' })).toEqual({ side: 'left', yRatio: 1 });
    expect(sanitizeQuickButtonPosition({ side: 'left', yRatio: NaN })).toEqual({ side: 'left', yRatio: 1 });
    expect(sanitizeQuickButtonPosition('kaputt')).toEqual(DEFAULT_QUICK_BUTTON_POSITION);
    expect(sanitizeQuickButtonPosition(42)).toEqual(DEFAULT_QUICK_BUTTON_POSITION);
  });

  it('56) sanitizeHomeScreenConfig übernimmt Position + klemmt beim Sanitize', () => {
    const kept = sanitizeHomeScreenConfig({ ...DEFAULT_HOME_CONFIG, quickButtonPosition: { side: 'left', yRatio: 0.3 } });
    expect(kept.quickButtonPosition).toEqual({ side: 'left', yRatio: 0.3 });
    const clamped = sanitizeHomeScreenConfig({ ...DEFAULT_HOME_CONFIG, quickButtonPosition: { side: 'middle', yRatio: 9 } } as unknown);
    expect(clamped.quickButtonPosition).toEqual({ side: 'right', yRatio: 1 });
    const missing = sanitizeHomeScreenConfig({ ...DEFAULT_HOME_CONFIG });
    expect(missing.quickButtonPosition).toBeUndefined();
  });

  it('57) Position wird gespeichert (setHomeScreenConfig → AsyncStorage)', async () => {
    setHomeScreenConfig({
      ...DEFAULT_HOME_CONFIG,
      quickButtonPosition: { side: 'left', yRatio: 0.25 },
    });
    const raw = await AsyncStorage.getItem(keyForUser('u1'));
    const stored = JSON.parse(raw ?? '{}');
    expect(stored.quickButtonPosition).toEqual({ side: 'left', yRatio: 0.25 });
  });

  it('58) App-Neustart behält die Position (hydrate aus AsyncStorage)', async () => {
    await AsyncStorage.setItem(keyForUser('u1'), JSON.stringify({
      ...DEFAULT_HOME_CONFIG,
      quickButtonPosition: { side: 'left', yRatio: 0.8 },
    }));
    let node!: ReactTestRenderer;
    await act(async () => {
      node = TestRenderer.create(createElement(FabHost, { userId: 'u1' }));
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(fabTexts(node)).toContain('create_appointment');
  });
});
