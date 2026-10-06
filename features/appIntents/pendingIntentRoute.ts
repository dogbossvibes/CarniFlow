// App-Intent-Routing (Siri / Kurzbefehle / Action Button) — reine, testbare Logik.
//
// Der native Intent (plugins/ios/app/AnyvoAppIntents.swift) bringt ANYVO in den Vordergrund
// und legt GENAU EIN festes Ziel in NSUserDefaults ab: "<route>|<epochMs>|<id>".
// Hier wird es gegen eine Allowlist geprüft und genau einmal verbraucht. Keine beliebigen
// URLs/Strings, keine Session- oder Hundedaten.

export const PENDING_INTENT_ROUTE_KEY = 'anyvo.appIntent.pendingRoute';

/** Allowlist: native Route (Swift-Enum AnyvoIntentRoute) → bestehende Expo-Route. */
export const INTENT_ROUTES = {
  track: '/track',
  'track/legen': '/track/legen',
  'track/historie': '/track/historie',
} as const;

export type IntentRoutePath = (typeof INTENT_ROUTES)[keyof typeof INTENT_ROUTES];

/** Ältere Einträge (z. B. Intent ausgelöst, App aber nie geöffnet/angemeldet) verfallen. */
export const PENDING_INTENT_ROUTE_TTL_MS = 5 * 60_000;

export interface PendingIntentRoute { path: IntentRoutePath; id: string; at: number }

/** Validiert einen Rohwert; alles Unbekannte/Abgelaufene/Kaputte → null. */
export function parsePendingIntentRoute(raw: unknown, now: number): PendingIntentRoute | null {
  if (typeof raw !== 'string') return null;
  const parts = raw.split('|');
  if (parts.length !== 3) return null;
  const [route, atRaw, id] = parts;
  if (!Object.prototype.hasOwnProperty.call(INTENT_ROUTES, route)) return null;
  const at = Number(atRaw);
  if (!Number.isFinite(at) || !id) return null;
  if (now - at > PENDING_INTENT_ROUTE_TTL_MS || at - now > 60_000) return null;   // abgelaufen / Uhr-Sprung
  return { path: INTENT_ROUTES[route as keyof typeof INTENT_ROUTES], id, at };
}

export interface PendingRouteStore {
  get(key: string): unknown;
  /** null entfernt den Eintrag (RCTSettingsManager: removeObjectForKey). */
  set(values: Record<string, unknown>): void;
}

/**
 * Verbraucht den Eintrag genau einmal: jeder vorhandene Wert wird gelöscht (auch ungültige
 * oder abgelaufene), ein bereits verarbeitetes id wird nicht erneut geliefert.
 */
export function consumePendingIntentRoute(store: PendingRouteStore, now: number, alreadyHandled?: string | null): PendingIntentRoute | null {
  const raw = store.get(PENDING_INTENT_ROUTE_KEY);
  if (raw == null) return null;
  store.set({ [PENDING_INTENT_ROUTE_KEY]: null });
  const parsed = parsePendingIntentRoute(raw, now);
  if (!parsed || parsed.id === alreadyHandled) return null;
  return parsed;
}
