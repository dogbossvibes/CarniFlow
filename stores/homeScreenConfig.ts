import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ──────────────────────────────────────────────────────────────────────────
// Personalisierbarer Startbildschirm — zentrale Konfiguration (pro Benutzer).
// Wiederverwendung der bestehenden Home-Komponenten; keine Plugin-Engine, nur
// eine schlanke Registry (Label/Icon/Route). Persistenz lokal (AsyncStorage),
// KEINE DB-Migration. Der Hero/Begrüssungs-Block bleibt immer sichtbar.
// ──────────────────────────────────────────────────────────────────────────

export type HomeLayoutMode   = 'grid' | 'list' | 'compact';
export type HomeWidgetId      = 'week' | 'smart_analysis' | 'quick_actions' | 'recent_sessions' | 'dogs';
export type HomeQuickActionId = 'add_dog' | 'start_timer' | 'track_gps' | 'lay_track' | 'document_training' | 'start_obedience' | 'show_analysis';

export interface HomeScreenConfig {
  layout:        HomeLayoutMode;
  quickActions:  HomeQuickActionId[];   // sichtbar auf dem Startscreen (Reihenfolge = Anzeige)
  widgetOrder:   HomeWidgetId[];        // Reihenfolge aller Widgets
  hiddenWidgets: HomeWidgetId[];        // ausgeblendete Widgets
}

export const HOME_LAYOUT_MODES: HomeLayoutMode[]   = ['grid', 'list', 'compact'];
export const ALL_HOME_WIDGETS: HomeWidgetId[]       = ['week', 'smart_analysis', 'quick_actions', 'recent_sessions', 'dogs'];
export const ALL_QUICK_ACTIONS: HomeQuickActionId[] = ['add_dog', 'start_timer', 'track_gps', 'lay_track', 'document_training', 'start_obedience', 'show_analysis'];
export const MAX_QUICK_ACTIONS = 6;

// Metadaten-Registry (Label/Icon/Route) — eine Quelle, keine duplizierten switches.
export const HOME_LAYOUT_LABEL: Record<HomeLayoutMode, string> = { grid: 'Raster', list: 'Liste', compact: 'Kompakt' };

export const HOME_QUICK_ACTIONS_META: Record<HomeQuickActionId, { label: string; icon: string; route: string }> = {
  add_dog:           { label: 'Hund hinzufügen', icon: 'add-circle-outline',  route: '/add-dog' },
  start_timer:       { label: 'Timer starten',   icon: 'play-circle-outline', route: '/unit/timer' },
  track_gps:         { label: 'Fährten GPS',     icon: 'navigate-outline',    route: '/track' },
  lay_track:         { label: 'Fährte legen',    icon: 'git-branch-outline',  route: '/track/legen' },
  document_training: { label: 'Dokumentieren',   icon: 'create-outline',      route: '/unit/document' },
  start_obedience:   { label: 'Unterordnung',    icon: 'ribbon-outline',      route: '/unit/start' },
  show_analysis:     { label: 'Analyse',         icon: 'sparkles-outline',    route: '/analyse/insights' },
};

export const HOME_WIDGETS_META: Record<HomeWidgetId, { label: string; icon: string; description: string }> = {
  week:            { label: 'Wochenübersicht',  icon: 'calendar-outline', description: 'Trainingstage dieser Woche' },
  smart_analysis:  { label: 'Smart Analyse',    icon: 'sparkles-outline', description: 'Coach & deterministische Hinweise' },
  quick_actions:   { label: 'Schnell starten',  icon: 'flash-outline',    description: 'Deine Schnellzugriffe' },
  recent_sessions: { label: 'Letzte Einheiten', icon: 'time-outline',     description: 'Zuletzt erfasste Einheiten' },
  dogs:            { label: 'Meine Hunde',       icon: 'paw-outline',      description: 'Übersicht deiner Hunde' },
};

// Default: sinnvoll ohne Benutzeraktion. Schnellzugriffe = 6 (ohne „Analyse";
// Schutzdienst wird bewusst nicht angeboten).
export const DEFAULT_HOME_CONFIG: HomeScreenConfig = {
  layout:        'grid',
  quickActions:  ['add_dog', 'start_timer', 'track_gps', 'document_training', 'lay_track', 'start_obedience'],
  widgetOrder:   ['week', 'smart_analysis', 'quick_actions', 'recent_sessions', 'dogs'],
  hiddenWidgets: [],
};

// ── Reine Helfer (testbar) ──────────────────────────────────────────────────

// Robuste Bereinigung: ungültige/veraltete IDs raus, fehlende (neue) Widgets
// hinten ergänzt, Dedupe, max. Schnellaktionen, gültiges Layout. Nie crashen.
export function sanitizeHomeScreenConfig(raw: unknown): HomeScreenConfig {
  const r = (raw && typeof raw === 'object') ? raw as Partial<HomeScreenConfig> : {};
  const layout: HomeLayoutMode = HOME_LAYOUT_MODES.includes(r.layout as HomeLayoutMode)
    ? (r.layout as HomeLayoutMode) : DEFAULT_HOME_CONFIG.layout;

  const dedupeValid = <T,>(arr: unknown, valid: readonly T[]): T[] => {
    const out: T[] = [];
    if (Array.isArray(arr)) for (const x of arr) if ((valid as readonly unknown[]).includes(x) && !out.includes(x as T)) out.push(x as T);
    return out;
  };

  let quickActions = dedupeValid<HomeQuickActionId>(r.quickActions, ALL_QUICK_ACTIONS);
  if (quickActions.length === 0) quickActions = [...DEFAULT_HOME_CONFIG.quickActions];
  quickActions = quickActions.slice(0, MAX_QUICK_ACTIONS);

  const widgetOrder = dedupeValid<HomeWidgetId>(r.widgetOrder, ALL_HOME_WIDGETS);
  for (const w of ALL_HOME_WIDGETS) if (!widgetOrder.includes(w)) widgetOrder.push(w);   // neue Widgets ergänzen

  const hiddenWidgets = dedupeValid<HomeWidgetId>(r.hiddenWidgets, ALL_HOME_WIDGETS);

  return { layout, quickActions, widgetOrder, hiddenWidgets };
}

// Element in einem Array verschieben (dir: -1 hoch, +1 runter). Reiner Helfer.
export function moveInArray<T>(arr: T[], index: number, dir: -1 | 1): T[] {
  const to = index + dir;
  if (index < 0 || index >= arr.length || to < 0 || to >= arr.length) return arr;
  const copy = [...arr];
  [copy[index], copy[to]] = [copy[to], copy[index]];
  return copy;
}

// Schnellaktion an-/abwählen (max. MAX_QUICK_ACTIONS aktiv).
export function toggleQuickAction(cfg: HomeScreenConfig, id: HomeQuickActionId): HomeScreenConfig {
  if (cfg.quickActions.includes(id)) return { ...cfg, quickActions: cfg.quickActions.filter(a => a !== id) };
  if (cfg.quickActions.length >= MAX_QUICK_ACTIONS) return cfg;   // blockiert bei 6
  return { ...cfg, quickActions: [...cfg.quickActions, id] };
}

// Widget ein-/ausblenden.
export function setWidgetVisible(cfg: HomeScreenConfig, id: HomeWidgetId, visible: boolean): HomeScreenConfig {
  const hidden = cfg.hiddenWidgets.filter(w => w !== id);
  return { ...cfg, hiddenWidgets: visible ? hidden : [...hidden, id] };
}

// Sichtbare Widgets in Reihenfolge (für den Renderer).
export function visibleWidgets(cfg: HomeScreenConfig): HomeWidgetId[] {
  return cfg.widgetOrder.filter(w => !cfg.hiddenWidgets.includes(w));
}

// ── Per-User-Persistenz (AsyncStorage), reaktiver Store ─────────────────────
export const keyForUser = (userId?: string | null) => `home_screen_config:${userId || 'anon'}`;

let currentUserId: string | null = null;
let hydratedFor: string | null | undefined = undefined;
let state: HomeScreenConfig = DEFAULT_HOME_CONFIG;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

async function hydrate(userId: string | null) {
  currentUserId = userId;
  try {
    const raw = await AsyncStorage.getItem(keyForUser(userId));
    state = sanitizeHomeScreenConfig(raw ? JSON.parse(raw) : null);
  } catch { state = DEFAULT_HOME_CONFIG; }
  hydratedFor = userId;
  emit();
}

export function setHomeScreenConfig(next: HomeScreenConfig) {
  state = sanitizeHomeScreenConfig(next);
  emit();
  AsyncStorage.setItem(keyForUser(currentUserId), JSON.stringify(state)).catch(() => { /* best-effort */ });
}

export function resetHomeScreenConfig() {
  setHomeScreenConfig({ ...DEFAULT_HOME_CONFIG });
}

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const getSnapshot = () => state;

// Hook: hydriert pro Nutzer (userId aus der Session) und liefert die reaktive Config.
export function useHomeScreenConfig(userId: string | null | undefined): HomeScreenConfig {
  const cfg = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    const uid = userId ?? null;
    if (hydratedFor !== uid) void hydrate(uid);
  }, [userId]);
  return cfg;
}
