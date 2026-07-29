jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import {
  ALL_HOME_WIDGETS,
  ALL_QUICK_ACTIONS,
  DEFAULT_HOME_CONFIG,
  HOME_LAYOUT_MODES,
  MAX_QUICK_ACTIONS,
  keyForUser,
  moveInArray,
  sanitizeHomeScreenConfig,
  setWidgetVisible,
  toggleQuickAction,
  visibleWidgets,
  type HomeScreenConfig,
} from '@/stores/homeScreenConfig';

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
});
