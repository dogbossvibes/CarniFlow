import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ──────────────────────────────────────────────────────────────────────────
// Personalisierbarer Startbildschirm — zentrale Konfiguration (pro Benutzer).
// Wiederverwendung der bestehenden Home-Komponenten; keine Plugin-Engine, nur
// eine schlanke Registry (Label/Icon/Route). Persistenz lokal (AsyncStorage),
// KEINE DB-Migration. Der Hero/Begrüssungs-Block bleibt immer sichtbar.
// ──────────────────────────────────────────────────────────────────────────

export type HomeLayoutMode   = 'grid' | 'list' | 'compact';
export type HomeWidgetId      = 'week' | 'smart_analysis' | 'quick_actions' | 'recent_sessions' | 'dogs' | 'dog_backpack';
export type HomeQuickActionId = 'add_dog' | 'start_timer' | 'track_gps' | 'lay_track' | 'document_training' | 'start_obedience' | 'show_analysis' | 'training_journal' | 'dog_backpack';
// Personalisierbarer Startseiten-FAB: eine der Aktionen ODER 'hidden' (Button
// ausblenden — von älteren Configs akzeptiert; renderseitig wie fabVisible=false).
export type HomeFabActionId   = 'start_training' | 'document_training' | 'training_journal' | 'start_track' | 'create_appointment' | 'add_dog' | 'open_backpack' | 'hidden';

export type HomeQuickActionConfig = {
  instanceId: string;
  actionId: HomeQuickActionId;
  dogId?: string;
};

export type HomeQuickActionEntry = HomeQuickActionId | HomeQuickActionConfig;

export type HomeWidgetConfig = {
  instanceId: string;
  widgetId: HomeWidgetId;
  dogId?: string;
};

export interface HomeScreenConfig {
  layout:        HomeLayoutMode;
  quickActions:  HomeQuickActionEntry[]; // sichtbar; Strings bleiben legacy-kompatibel
  widgetOrder:   HomeWidgetId[];        // Reihenfolge aller Widgets
  hiddenWidgets: HomeWidgetId[];        // ausgeblendete Widgets
  widgetConfigs?: HomeWidgetConfig[];   // optionale Parameter für instanzierte Widgets
  fabActionId:   HomeFabActionId;       // Aktion des Startseiten-FAB (Standard: Termin erstellen)
  fabVisible:    boolean;               // FAB sichtbar (false = ausblenden, kein Platzhalter)
}

export const HOME_LAYOUT_MODES: HomeLayoutMode[]   = ['grid', 'list', 'compact'];
export const ALL_HOME_WIDGETS: HomeWidgetId[]       = ['week', 'smart_analysis', 'quick_actions', 'recent_sessions', 'dogs', 'dog_backpack'];
export const ALL_QUICK_ACTIONS: HomeQuickActionId[] = ['add_dog', 'start_timer', 'track_gps', 'lay_track', 'document_training', 'start_obedience', 'show_analysis', 'training_journal', 'dog_backpack'];
export const MAX_QUICK_ACTIONS = 6;

// Alle wählbaren FAB-Aktionen inkl. 'hidden' (Sanitize-Akzeptanz). Reihenfolge
// = Reihenfolge im Auswahl-Dialog.
export const ALL_FAB_ACTIONS: HomeFabActionId[] = [
  'start_training', 'document_training', 'training_journal', 'start_track',
  'create_appointment', 'add_dog', 'open_backpack', 'hidden',
];
// Standard für neue Nutzer UND Fallback bei ungültiger/veralteter Action-ID.
export const DEFAULT_FAB_ACTION: HomeFabActionId = 'create_appointment';

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
  training_journal:  { label: 'Journal',         icon: 'book-outline',        route: '/training-journal' },
  dog_backpack:     { label: 'Backpack',         icon: 'bag-handle-outline',   route: '/dog-backpack/[id]' },
};

// FAB-Registry: Icon je Aktion. Route nur für die einfachen Routen-Aktionen;
// add_dog/open_backpack haben eigene Logik (Quota-Gate bzw. Hund-Kontext) im
// FAB-Renderer — eine Quelle, keine duplizierten Switches.
export const HOME_FAB_ACTIONS_META: Partial<Record<HomeFabActionId, { icon: string; route?: string }>> = {
  start_training:       { icon: 'play',              route: '/unit/start' },
  document_training:    { icon: 'create-outline',    route: '/unit/document' },
  training_journal:     { icon: 'book-outline',      route: '/training-journal' },
  start_track:          { icon: 'navigate-outline',  route: '/track' },
  create_appointment:   { icon: 'calendar',          route: '/training-hub' },
  add_dog:              { icon: 'paw' },
  open_backpack:        { icon: 'bag-handle-outline' },
  // 'hidden' hat kein Icon — renderseitig wird der Button ausgeblendet.
};

export const HOME_WIDGETS_META: Record<HomeWidgetId, { label: string; icon: string; description: string }> = {
  week:            { label: 'Wochenübersicht',  icon: 'calendar-outline', description: 'Trainingstage dieser Woche' },
  smart_analysis:  { label: 'Smart Analyse',    icon: 'sparkles-outline', description: 'Coach & deterministische Hinweise' },
  quick_actions:   { label: 'Schnell starten',  icon: 'flash-outline',    description: 'Deine Schnellzugriffe' },
  recent_sessions: { label: 'Letzte Einheiten', icon: 'time-outline',     description: 'Zuletzt erfasste Einheiten' },
  dogs:            { label: 'Meine Hunde',       icon: 'paw-outline',      description: 'Übersicht deiner Hunde' },
  dog_backpack:    { label: 'Backpack',           icon: 'bag-handle-outline', description: 'Rucksack eines Hundes' },
};

// Default: sinnvoll ohne Benutzeraktion. Schnellzugriffe = 6 (ohne „Analyse";
// Schutzdienst wird bewusst nicht angeboten). FAB-Standard = Termin erstellen.
export const DEFAULT_HOME_CONFIG: HomeScreenConfig = {
  layout:        'grid',
  quickActions:  ['add_dog', 'start_timer', 'track_gps', 'document_training', 'lay_track', 'start_obedience'],
  widgetOrder:   ['week', 'smart_analysis', 'quick_actions', 'recent_sessions', 'dogs', 'dog_backpack'],
  hiddenWidgets: [],
  widgetConfigs: [],
  fabActionId:   DEFAULT_FAB_ACTION,
  fabVisible:    true,
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

  let quickActions: HomeQuickActionEntry[] = [];
  const usedActionIds = new Set<HomeQuickActionId>();
  const usedInstanceIds = new Set<string>();
  if (Array.isArray(r.quickActions)) {
    for (const entry of r.quickActions) {
      if (typeof entry === 'string') {
        if (!ALL_QUICK_ACTIONS.includes(entry as HomeQuickActionId) || entry === 'dog_backpack' || usedActionIds.has(entry as HomeQuickActionId)) continue;
        usedActionIds.add(entry as HomeQuickActionId);
        quickActions.push(entry as HomeQuickActionId);
        continue;
      }
      if (!entry || typeof entry !== 'object') continue;
      const candidate = entry as Partial<HomeQuickActionConfig>;
      const actionId = candidate.actionId;
      if (!ALL_QUICK_ACTIONS.includes(actionId as HomeQuickActionId)) continue;
      if (actionId === 'dog_backpack' && (typeof candidate.dogId !== 'string' || !candidate.dogId.trim())) continue;
      if (actionId !== 'dog_backpack' && usedActionIds.has(actionId as HomeQuickActionId)) continue;
      const base = typeof candidate.instanceId === 'string' && candidate.instanceId.trim()
        ? candidate.instanceId.trim() : `${actionId}-${quickActions.length + 1}`;
      let instanceId = base;
      let suffix = 2;
      while (usedInstanceIds.has(instanceId)) instanceId = `${base}-${suffix++}`;
      usedInstanceIds.add(instanceId);
      usedActionIds.add(actionId as HomeQuickActionId);
      quickActions.push({ instanceId, actionId: actionId as HomeQuickActionId, dogId: candidate.dogId?.trim() });
    }
  }
  if (quickActions.length === 0) quickActions = [...DEFAULT_HOME_CONFIG.quickActions];
  const limitedQuickActions = quickActions.slice(0, MAX_QUICK_ACTIONS);

  const widgetOrder = dedupeValid<HomeWidgetId>(r.widgetOrder, ALL_HOME_WIDGETS);
  for (const w of ALL_HOME_WIDGETS) if (!widgetOrder.includes(w)) widgetOrder.push(w);   // neue Widgets ergänzen

  const hiddenWidgets = dedupeValid<HomeWidgetId>(r.hiddenWidgets, ALL_HOME_WIDGETS);

  const widgetConfigs: HomeWidgetConfig[] = [];
  const rawWidgetConfigs = (r as Partial<HomeScreenConfig>).widgetConfigs;
  if (Array.isArray(rawWidgetConfigs)) {
    const usedWidgetInstances = new Set<string>();
    for (const rawConfig of rawWidgetConfigs) {
      if (!rawConfig || typeof rawConfig !== 'object') continue;
      const candidate = rawConfig as Partial<HomeWidgetConfig>;
      if (!ALL_HOME_WIDGETS.includes(candidate.widgetId as HomeWidgetId)) continue;
      if (candidate.widgetId === 'dog_backpack' && (typeof candidate.dogId !== 'string' || !candidate.dogId.trim())) continue;
      const base = typeof candidate.instanceId === 'string' && candidate.instanceId.trim()
        ? candidate.instanceId.trim() : `${candidate.widgetId}-${widgetConfigs.length + 1}`;
      let instanceId = base;
      let suffix = 2;
      while (usedWidgetInstances.has(instanceId)) instanceId = `${base}-${suffix++}`;
      usedWidgetInstances.add(instanceId);
      widgetConfigs.push({ instanceId, widgetId: candidate.widgetId as HomeWidgetId, dogId: candidate.dogId?.trim() });
    }
  }

  // FAB-Aktion: gültige ID behalten, sonst sicher auf Standard zurückfallen.
  // Fehlender Wert (bestehende Nutzer/Alt-Configs) → Standard. Keine bestehende
  // Konfiguration wird zurückgesetzt; die neuen Felder werden nur ergänzt.
  const fabActionId: HomeFabActionId = ALL_FAB_ACTIONS.includes(r.fabActionId as HomeFabActionId)
    ? (r.fabActionId as HomeFabActionId)
    : DEFAULT_FAB_ACTION;
  // fabVisible: nur explizit false bleibt false; alles andere (fehlend/gültig) → true.
  const fabVisible = r.fabVisible === false ? false : true;

  return { layout, quickActions: limitedQuickActions, widgetOrder, hiddenWidgets, widgetConfigs, fabActionId, fabVisible };
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
export function actionIdOf(entry: HomeQuickActionEntry): HomeQuickActionId {
  return typeof entry === 'string' ? entry : entry.actionId;
}

export function toggleQuickAction(cfg: HomeScreenConfig, id: HomeQuickActionId): HomeScreenConfig {
  if (cfg.quickActions.some(a => actionIdOf(a) === id)) return { ...cfg, quickActions: cfg.quickActions.filter(a => actionIdOf(a) !== id) };
  if (cfg.quickActions.length >= MAX_QUICK_ACTIONS) return cfg;   // blockiert bei 6
  return { ...cfg, quickActions: [...cfg.quickActions, id] };
}

export function addDogBackpackQuickAction(cfg: HomeScreenConfig, dogId: string): HomeScreenConfig {
  const normalizedDogId = dogId.trim();
  if (!normalizedDogId || cfg.quickActions.length >= MAX_QUICK_ACTIONS) return cfg;
  const instanceId = `dog_backpack-${normalizedDogId}-${Date.now()}`;
  return {
    ...cfg,
    quickActions: [...cfg.quickActions, { instanceId, actionId: 'dog_backpack', dogId: normalizedDogId }],
  };
}

export function updateWidgetConfig(cfg: HomeScreenConfig, next: HomeWidgetConfig): HomeScreenConfig {
  const current = cfg.widgetConfigs ?? [];
  const filtered = current.filter(item => item.instanceId !== next.instanceId);
  return { ...cfg, widgetConfigs: [...filtered, next] };
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
