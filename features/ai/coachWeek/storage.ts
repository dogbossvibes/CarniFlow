import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import type { CoachRuleId } from './types';

// Coach PR B: Einstellungen und «Nicht passend» je Person.
// - Einstellungen (Coach im Hundeprofil ausblenden, Regel je Hund aus) nur auf dem Gerät.
// - «Nicht passend» lokal UND im bestehenden Ausblenden des Smart Coach (ai_insights,
//   bestehender Typ «training_gap», Schlüssel in data.key). Lokal zuerst: das Ausblenden
//   wirkt auch offline oder wenn der Server ablehnt. Gespeichert wird nur der Schlüssel,
//   keine Begründungstexte und keine Trainingsdaten.

const RULES: readonly CoachRuleId[] = ['exam', 'pause', 'corner', 'lying', 'rating', 'balance'];
export interface CoachPrefs { hiddenInProfile: boolean; disabledRules: Record<string, CoachRuleId[]> }
export const EMPTY_PREFS: CoachPrefs = { hiddenInProfile: false, disabledRules: {} };

const prefsKey = (uid: string) => `anyvo.coachWeek.prefs.v1:${uid}`;
const dismissedKey = (uid: string) => `anyvo.coachWeek.dismissed.v1:${uid}`;
const MAX_LOCAL_DISMISSED = 300;

/** Gespeicherte Einstellungen lesen; Unbekanntes oder Kaputtes fällt auf Standard zurück. */
export function parsePrefs(raw: string | null): CoachPrefs {
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== 'object') return EMPTY_PREFS;
    const disabledRules: Record<string, CoachRuleId[]> = {};
    for (const [dogId, list] of Object.entries((v as { disabledRules?: unknown }).disabledRules ?? {})) {
      if (Array.isArray(list)) {
        const rules = list.filter((r): r is CoachRuleId => RULES.includes(r as CoachRuleId));
        if (rules.length) disabledRules[dogId] = [...new Set(rules)];
      }
    }
    return { hiddenInProfile: (v as { hiddenInProfile?: unknown }).hiddenInProfile === true, disabledRules };
  } catch { return EMPTY_PREFS; }
}

export async function loadCoachPrefs(uid: string): Promise<CoachPrefs> {
  try { return parsePrefs(await AsyncStorage.getItem(prefsKey(uid))); } catch { return EMPTY_PREFS; }
}
export async function saveCoachPrefs(uid: string, prefs: CoachPrefs): Promise<void> {
  await AsyncStorage.setItem(prefsKey(uid), JSON.stringify(prefs));
}

export function withRule(prefs: CoachPrefs, dogId: string, rule: CoachRuleId, enabled: boolean): CoachPrefs {
  const cur = prefs.disabledRules[dogId] ?? [];
  const next = enabled ? cur.filter(r => r !== rule) : [...new Set([...cur, rule])];
  const disabledRules = { ...prefs.disabledRules };
  if (next.length) disabledRules[dogId] = next; else delete disabledRules[dogId];
  return { ...prefs, disabledRules };
}

export function parseDismissed(raw: string | null): string[] {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string' && k.startsWith('coach:')) : [];
  } catch { return []; }
}

/** Lokale und Server-Schlüssel zusammen (nur Coach-Schlüssel). */
export async function loadDismissedCoachKeys(uid: string, serverKeys: Iterable<string>): Promise<string[]> {
  let local: string[] = [];
  try { local = parseDismissed(await AsyncStorage.getItem(dismissedKey(uid))); } catch { /* lokal nicht lesbar: nur Server */ }
  return [...new Set([...local, ...[...serverKeys].filter(k => k.startsWith('coach:'))])];
}

export async function dismissCoachSuggestion(uid: string, dogId: string, key: string): Promise<void> {
  try {
    const local = parseDismissed(await AsyncStorage.getItem(dismissedKey(uid)));
    const next = [...local.filter(k => k !== key), key].slice(-MAX_LOCAL_DISMISSED);
    await AsyncStorage.setItem(dismissedKey(uid), JSON.stringify(next));
  } catch { /* weiter mit Server */ }
  try {
    await supabase.from('ai_insights').insert({
      user_id: uid, dog_id: dogId, insight_type: 'training_gap', severity: 'info',
      title: 'Coach', message: 'coach_week', is_dismissed: true, data: { key },
    });
  } catch { /* lokal bleibt ausgeblendet */ }
}

// ── PR C: übernommene Vorschläge (Schlüssel → Termin-ID), nur auf dem Gerät ──
const plannedKey = (uid: string) => `anyvo.coachWeek.planned.v1:${uid}`;
const MAX_PLANNED = 300;

export function parsePlanned(raw: string | null): Record<string, string> {
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, id] of Object.entries(v)) if (k.startsWith('coach:') && typeof id === 'string' && id) out[k] = id;
    return out;
  } catch { return {}; }
}

export async function loadPlannedCoachEvents(uid: string): Promise<Record<string, string>> {
  try { return parsePlanned(await AsyncStorage.getItem(plannedKey(uid))); } catch { return {}; }
}

export async function rememberPlannedCoachEvent(uid: string, key: string, eventId: string): Promise<void> {
  try {
    const cur = parsePlanned(await AsyncStorage.getItem(plannedKey(uid)));
    delete cur[key];
    const entries = [...Object.entries(cur), [key, eventId] as const].slice(-MAX_PLANNED);
    await AsyncStorage.setItem(plannedKey(uid), JSON.stringify(Object.fromEntries(entries)));
  } catch { /* Abgleich Hund · Tag · Typ erkennt den Termin trotzdem */ }
}
