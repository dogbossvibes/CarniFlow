import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TranslationKey } from '@/i18n';

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
export type HomeFabActionId   = 'start_training' | 'document_training' | 'training_journal' | 'start_track' | 'create_appointment' | 'add_dog' | 'open_dog' | 'open_backpack' | 'hidden';

// Aktionen des globalen ANYVO-Schnellbuttons (alle 5 Haupt-Tabseiten, max. 8).
// Fixe Routen-Aktionen + 'hide_button' (Button ausblenden) sowie dynamische,
// hundspezifische Aktionen. Dog-IDs sind OHNE Hundenamen stabil — der Name wird
// beim Öffnen frisch aus useDogs() aufgelöst (Umbenennung → kein Problem).
export type QuickRouteActionId = 'start_training' | 'document_training' | 'training_journal' | 'start_track' | 'create_appointment' | 'add_dog';
export type QuickActionId = QuickRouteActionId | 'hide_button' | `open-dog:${string}` | `open-backpack:${string}`;

// Aufgelöstes Ziel einer Schnellbutton-Aktion (ein Ort für die Auflösung).
//   • route        → Navigation ohne Hund-Kontext
//   • dog          → Hundeprofil des gewählten Hundes
//   • dog_backpack → Backpack des gewählten Hundes
export type QuickActionTarget =
  | { type: 'route'; route: string }
  | { type: 'dog'; dogId: string }
  | { type: 'dog_backpack'; dogId: string };

export type HomeQuickActionConfig = {
  instanceId: string;
  actionId: HomeQuickActionId;
  dogId?: string;
};

export type HomeQuickActionEntry = HomeQuickActionId | HomeQuickActionConfig;

// Position des globalen ANYVO-Schnellbuttons (frei verschiebbar). Relativ statt
// absolut: side (linke/rechte Bildschirmkante, Snap) + yRatio (0..1 vertikale
// Position im erlaubten Band zwischen Statusbar und Tab-Leiste). So bleibt die
// Position auf unterschiedlichen Displays/bei Rotation stabil.
export type QuickButtonSide = 'left' | 'right';
export interface QuickButtonPosition {
  side: QuickButtonSide;
  yRatio: number; // 0 = oben, 1 = unten (Default, entspricht der klassischen Position)
}

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
  // Globaler ANYVO-Schnellbutton (alle 5 Haupt-Tabseiten, max. 8 Aktionen):
  // quickButtonActions = aktivierte Aktionen in Nutzer-Reihenfolge. Fixe IDs
  // (QUICK_BUTTON_ROUTE_ACTIONS + 'hide_button') plus dynamische Hund-Aktionen
  // 'open-dog:<dogId>' / 'open-backpack:<dogId>'. Legacy fabActionId/fabVisible
  // (T-41) und quickButtonActionId/quickButtonDogId (T-42 v1) werden beim
  // Sanitize migriert, damit bestehende Konfigurationen weiter funktionieren.
  quickButtonActions:  string[];
  quickButtonVisible:  boolean;
  // Frei wählbare Position (verschiebbarer Schnellbutton). Fehlt → klassische
  // Standardposition (rechts unten). Wird beim Sanitize validiert (Side + 0..1).
  quickButtonPosition?: QuickButtonPosition;
}

export const HOME_LAYOUT_MODES: HomeLayoutMode[]   = ['grid', 'list', 'compact'];
export const ALL_HOME_WIDGETS: HomeWidgetId[]       = ['week', 'smart_analysis', 'quick_actions', 'recent_sessions', 'dogs', 'dog_backpack'];
export const ALL_QUICK_ACTIONS: HomeQuickActionId[] = ['add_dog', 'start_timer', 'track_gps', 'lay_track', 'document_training', 'start_obedience', 'show_analysis', 'training_journal', 'dog_backpack'];
export const MAX_QUICK_ACTIONS = 6;

// Alle wählbaren FAB-Aktionen inkl. 'hidden' (Sanitize-Akzeptanz). Reihenfolge
// = Reihenfolge im Auswahl-Dialog.
export const ALL_FAB_ACTIONS: HomeFabActionId[] = [
  'start_training', 'document_training', 'training_journal', 'start_track',
  'create_appointment', 'add_dog', 'open_dog', 'open_backpack', 'hidden',
];
// Standard für neue Nutzer UND Fallback bei ungültiger/veralteter Action-ID.
export const DEFAULT_FAB_ACTION: HomeFabActionId = 'create_appointment';

// ── Globaler Schnellbutton (max. 8 Aktionen) ────────────────────────────────
export const MAX_QUICK_BUTTON_ACTIONS = 8;
export const QUICK_BUTTON_ROUTE_ACTIONS: QuickRouteActionId[] = [
  'start_training', 'document_training', 'training_journal', 'start_track',
  'create_appointment', 'add_dog',
];
// Alle fix (nicht hundspezifisch) wählbaren Aktionen inkl. 'hide_button'.
export const QUICK_BUTTON_FIXED_ACTIONS: QuickActionId[] = [...QUICK_BUTTON_ROUTE_ACTIONS, 'hide_button'];
// Standard für neue Nutzer: eine Aktion (Termin erstellen) → kurzer Tipp führt direkt aus.
export const DEFAULT_QUICK_BUTTON_ACTIONS: QuickActionId[] = ['create_appointment'];
// Standard-FAB-Position: rechts unten (yRatio 1 = untere Kante).
export const DEFAULT_QUICK_BUTTON_POSITION: QuickButtonPosition = { side: 'right', yRatio: 1 };
// Dog-spezifische Action-IDs (stabil, ohne Hundenamen).
export const dogOpenActionId = (dogId: string): QuickActionId => `open-dog:${dogId}`;
export const dogBackpackActionId = (dogId: string): QuickActionId => `open-backpack:${dogId}`;

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
  open_dog:             { icon: 'paw-outline',      route: '/dog/[id]' },
  open_backpack:        { icon: 'bag-handle-outline' },
  // 'hidden' hat kein Icon — renderseitig wird der Button ausgeblendet.
};

// Schnellbutton-Registry: Label (i18n-Key) + Icon je fixer Aktion; Route nur
// für die einfachen Routen-Aktionen (add_dog hat das Quota-Gate renderseitig,
// hide_button blendet den Button aus). Hund-Aktionen nutzen das Profilbild.
export const QUICK_BUTTON_ACTIONS_META: Partial<Record<QuickActionId, { icon: string; route?: string; labelKey: TranslationKey }>> = {
  start_training:       { icon: 'play',             route: '/unit/start',       labelKey: 'quickButton.actions.startTraining' },
  document_training:    { icon: 'create-outline',   route: '/unit/document',    labelKey: 'quickButton.actions.documentTraining' },
  training_journal:     { icon: 'book-outline',     route: '/training-journal', labelKey: 'quickButton.actions.trainingJournal' },
  start_track:          { icon: 'navigate-outline', route: '/track',            labelKey: 'quickButton.actions.startTrack' },
  create_appointment:   { icon: 'calendar',         route: '/training-hub',     labelKey: 'quickButton.actions.createAppointment' },
  add_dog:              { icon: 'paw',              route: '/add-dog',          labelKey: 'quickButton.actions.addDog' },
  hide_button:          { icon: 'eye-off-outline',                              labelKey: 'quickButton.actions.hideButton' },
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
  quickButtonActions: [...DEFAULT_QUICK_BUTTON_ACTIONS],
  quickButtonVisible:  true,
};

// ── Reine Helfer (testbar) ──────────────────────────────────────────────────

// Position des Schnellbuttons validieren: side links/rechts, yRatio auf 0..1
// geklemmt. Fehlende/ungültige Werte → Standard (rechts unten), nie ein Crash.
export function sanitizeQuickButtonPosition(raw: unknown): QuickButtonPosition | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object') return { ...DEFAULT_QUICK_BUTTON_POSITION };
  const r = raw as Partial<QuickButtonPosition>;
  const side = r.side === 'left' || r.side === 'right'
    ? r.side
    : DEFAULT_QUICK_BUTTON_POSITION.side;
  const yRatio = typeof r.yRatio === 'number' && Number.isFinite(r.yRatio)
    ? Math.min(1, Math.max(0, r.yRatio))
    : DEFAULT_QUICK_BUTTON_POSITION.yRatio;
  return { side, yRatio };
}

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

  // Schnellbutton (global, max. 8): quickButtonActions bevorzugt. Fehlt der neue
  // Wert, wird aus den Legacy-Feldern migriert: quickButtonActionId/quickButtonDogId
  // (T-42 v1) vorrangig, sonst fabActionId/fabVisible (T-41). Komplett neue Nutzer
  // (kein einziges Schnellbutton-Feld) erhalten den Standard. Ungültige IDs werden
  // rausgefiltert, Duplikate entfernt und auf MAX_QUICK_BUTTON_ACTIONS gekappt.
  const legacyAction = (r as { quickButtonActionId?: unknown }).quickButtonActionId;
  const legacyDogRaw = (r as { quickButtonDogId?: unknown }).quickButtonDogId;
  const legacyDogId = typeof legacyDogRaw === 'string' && legacyDogRaw.trim() ? legacyDogRaw.trim() : null;
  const hasQuickActions = Array.isArray(r.quickButtonActions);
  const hasAnyQuickButtonSource = hasQuickActions
    || legacyAction !== undefined
    || legacyDogRaw !== undefined
    || r.fabActionId !== undefined
    || r.fabVisible !== undefined;

  let quickButtonActions: string[] = [];
  if (hasQuickActions) {
    quickButtonActions = sanitizeQuickButtonActions(r.quickButtonActions);
  } else if (legacyAction === 'hidden') {
    quickButtonActions = [];
  } else if (legacyAction === 'open_dog' && legacyDogId) {
    quickButtonActions = [dogOpenActionId(legacyDogId)];
  } else if (legacyAction === 'open_backpack' && legacyDogId) {
    quickButtonActions = [dogBackpackActionId(legacyDogId)];
  } else if (typeof legacyAction === 'string' && (QUICK_BUTTON_ROUTE_ACTIONS as readonly string[]).includes(legacyAction)) {
    quickButtonActions = [legacyAction];
  } else if (r.fabActionId === 'hidden') {
    quickButtonActions = [];
  } else if (r.fabActionId === 'open_dog' && legacyDogId) {
    quickButtonActions = [dogOpenActionId(legacyDogId)];
  } else if (r.fabActionId === 'open_backpack' && legacyDogId) {
    quickButtonActions = [dogBackpackActionId(legacyDogId)];
  } else if (typeof r.fabActionId === 'string' && (QUICK_BUTTON_ROUTE_ACTIONS as readonly string[]).includes(r.fabActionId)) {
    quickButtonActions = [r.fabActionId];
  }
  if (quickButtonActions.length === 0 && !hasAnyQuickButtonSource) {
    quickButtonActions = [...DEFAULT_QUICK_BUTTON_ACTIONS];
  }

  // quickButtonVisible: nur explizit false bleibt false; explizit true → true;
  // fehlend → Legacy fabVisible (false bleibt false), sonst true.
  const quickButtonVisible = r.quickButtonVisible === false ? false
    : (r.quickButtonVisible === true ? true : (r.fabVisible === false ? false : true));

  // Position: ungültig → Standard; fehlt → undefined (klassische Position).
  const quickButtonPosition = sanitizeQuickButtonPosition((r as { quickButtonPosition?: unknown }).quickButtonPosition);

  return {
    layout, quickActions: limitedQuickActions, widgetOrder, hiddenWidgets, widgetConfigs,
    fabActionId, fabVisible, quickButtonActions, quickButtonVisible, quickButtonPosition,
  };
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

// Backpack-Widget: einen Hund an-/abwählen (mehrere Hunde gleichzeitig möglich).
// Instanz-ID pro Hund stabil → Auswahl übersteht Sanitize + App-Neustart.
export function toggleBackpackWidgetDog(cfg: HomeScreenConfig, dogId: string): HomeScreenConfig {
  const id = dogId.trim();
  if (!id) return cfg;
  const current = cfg.widgetConfigs ?? [];
  const exists = current.some(item => item.widgetId === 'dog_backpack' && item.dogId === id);
  if (exists) {
    return { ...cfg, widgetConfigs: current.filter(item => !(item.widgetId === 'dog_backpack' && item.dogId === id)) };
  }
  return {
    ...cfg,
    widgetConfigs: [...current, { instanceId: `dog_backpack-widget-${id}`, widgetId: 'dog_backpack', dogId: id }],
  };
}

// Ausgewählte Hund-IDs für das Backpack-Widget (Reihenfolge der Config).
export function backpackWidgetDogIds(cfg: HomeScreenConfig): string[] {
  return (cfg.widgetConfigs ?? [])
    .filter(item => item.widgetId === 'dog_backpack' && typeof item.dogId === 'string' && item.dogId.trim().length > 0)
    .map(item => item.dogId as string);
}

// ── Schnellbutton (global) ──────────────────────────────────────────────────

// Parsen einer gespeicherten Aktion in eine stabile Form. Hund-Aktionen
// ('open-dog:<dogId>' / 'open-backpack:<dogId>') sind ohne Hundenamen stabil —
// der Name wird beim Öffnen frisch aus useDogs() aufgelöst (Umbenennung ok).
export type QuickActionParse =
  | { kind: 'route'; id: QuickRouteActionId }
  | { kind: 'dog'; dogId: string }
  | { kind: 'dog_backpack'; dogId: string }
  | { kind: 'hide' }
  | { kind: 'invalid' };

export function parseQuickActionId(value: unknown): QuickActionParse {
  if (typeof value !== 'string' || !value.trim()) return { kind: 'invalid' };
  const id = value.trim();
  if (id === 'hide_button') return { kind: 'hide' };
  if ((QUICK_BUTTON_ROUTE_ACTIONS as readonly string[]).includes(id)) return { kind: 'route', id: id as QuickRouteActionId };
  const dog = id.match(/^open-dog:(.+)$/);
  if (dog?.[1]?.trim()) return { kind: 'dog', dogId: dog[1].trim() };
  const backpack = id.match(/^open-backpack:(.+)$/);
  if (backpack?.[1]?.trim()) return { kind: 'dog_backpack', dogId: backpack[1].trim() };
  return { kind: 'invalid' };
}

// Kanonische Key-Form einer Aktion (normiert), null bei ungültig.
export function quickButtonActionKey(value: unknown): string | null {
  const p = parseQuickActionId(value);
  switch (p.kind) {
    case 'route':     return p.id;
    case 'dog':       return dogOpenActionId(p.dogId);
    case 'dog_backpack': return dogBackpackActionId(p.dogId);
    case 'hide':      return 'hide_button';
    default:          return null;
  }
}

// Gespeicherte Liste bereinigen: nur gültige Aktionen, dedupliziert, max. 8.
export function sanitizeQuickButtonActions(raw: unknown): string[] {
  const out: string[] = [];
  if (!Array.isArray(raw)) return out;
  const seen = new Set<string>();
  for (const entry of raw) {
    const key = quickButtonActionKey(entry);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= MAX_QUICK_BUTTON_ACTIONS) break;
  }
  return out;
}

// Aktivierte Aktionen in Nutzer-Reihenfolge. Hund-Aktionen, deren Hund nicht
// (mehr) existiert, werden gefiltert (gelöschter Hund → sicher weg, nie Crash).
// Nie mehr als MAX_QUICK_BUTTON_ACTIONS (Sanitize garantiert es schon beim
// Speichern; diese Grenze schützt zusätzlich vor handgebauten Configs).
export function quickButtonActionIdsOf(cfg: HomeScreenConfig, dogs: { id: string }[]): QuickActionId[] {
  const dogIds = new Set(dogs.map((d) => d.id));
  const out: QuickActionId[] = [];
  for (const raw of cfg.quickButtonActions ?? []) {
    const p = parseQuickActionId(raw);
    if (p.kind === 'invalid') continue;
    if ((p.kind === 'dog' || p.kind === 'dog_backpack') && !dogIds.has(p.dogId)) continue;
    const key = quickButtonActionKey(raw);
    if (key) out.push(key as QuickActionId);
    if (out.length >= MAX_QUICK_BUTTON_ACTIONS) break;
  }
  return out;
}

// Reine Auflösung einer Schnellbutton-Aktion in ein Ziel. Hund-Aktionen nur,
// wenn der Hund noch existiert; 'hide_button'/unbekannt → null (renderseitig
// kein Navigations-Ziel — hide blendet den Button aus).
export function resolveQuickAction(id: string, dogs: { id: string }[]): QuickActionTarget | null {
  const p = parseQuickActionId(id);
  if (p.kind === 'route') return { type: 'route', route: QUICK_BUTTON_ACTIONS_META[p.id]?.route ?? '' };
  if (p.kind === 'dog' && dogs.some((d) => d.id === p.dogId)) return { type: 'dog', dogId: p.dogId };
  if (p.kind === 'dog_backpack' && dogs.some((d) => d.id === p.dogId)) return { type: 'dog_backpack', dogId: p.dogId };
  return null;
}

// Aktion hinzufügen (max. MAX_QUICK_BUTTON_ACTIONS, keine Duplikate).
export function addQuickButtonAction(cfg: HomeScreenConfig, id: string): HomeScreenConfig {
  if (!quickButtonActionKey(id) || cfg.quickButtonActions.includes(id)) return cfg;
  if (cfg.quickButtonActions.length >= MAX_QUICK_BUTTON_ACTIONS) return cfg;
  return { ...cfg, quickButtonActions: [...cfg.quickButtonActions, id] };
}

// Aktion entfernen.
export function removeQuickButtonAction(cfg: HomeScreenConfig, id: string): HomeScreenConfig {
  return { ...cfg, quickButtonActions: cfg.quickButtonActions.filter((a) => a !== id) };
}

// Aktion in der Reihenfolge verschieben (dir: -1 hoch, +1 runter).
export function moveQuickButtonAction(cfg: HomeScreenConfig, id: string, dir: -1 | 1): HomeScreenConfig {
  const idx = cfg.quickButtonActions.indexOf(id);
  return { ...cfg, quickButtonActions: moveInArray(cfg.quickButtonActions, idx, dir) };
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
