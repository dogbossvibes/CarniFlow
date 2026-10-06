// App-Intent-Routing: feste Allowlist (Swift ↔ JS identisch), TTL, consume-once.
import { existsSync, readFileSync } from 'fs';
import {
  INTENT_ROUTES, PENDING_INTENT_ROUTE_KEY, PENDING_INTENT_ROUTE_TTL_MS, consumePendingIntentRoute, parsePendingIntentRoute,
} from '@/features/appIntents/pendingIntentRoute';

const NOW = Date.parse('2026-10-06T08:00:00.000Z');
const raw = (route: string, at = NOW, id = 'id-1') => `${route}|${at}|${id}`;
const store = (initial: unknown) => {
  const data: Record<string, unknown> = { [PENDING_INTENT_ROUTE_KEY]: initial };
  return { data, get: (k: string) => data[k], set: (v: Record<string, unknown>) => { for (const [k, x] of Object.entries(v)) { if (x == null) delete data[k]; else data[k] = x; } } };
};

describe('parsePendingIntentRoute', () => {
  it('feste Ziele → bestehende Expo-Routen', () => {
    expect(parsePendingIntentRoute(raw('track'), NOW)?.path).toBe('/track');
    expect(parsePendingIntentRoute(raw('track/legen'), NOW)?.path).toBe('/track/legen');
    expect(parsePendingIntentRoute(raw('track/historie'), NOW)?.path).toBe('/track/historie');
  });
  it('ungültige/fremde Werte nie navigierbar (keine beliebigen URLs/Strings)', () => {
    for (const r of ['anyvo://track', '/track', 'track/run', 'track/liegen?dogId=x&id=y', '__proto__', 'constructor', '', 'track/legen/../run']) {
      expect(parsePendingIntentRoute(raw(r), NOW)).toBeNull();
    }
    for (const v of [null, 42, {}, 'track', 'track|x|id', `track|${NOW}|`, `track|${NOW}|id|extra`]) expect(parsePendingIntentRoute(v, NOW)).toBeNull();
  });
  it('abgelaufen (> TTL) oder Zukunft (> 60 s) → verworfen', () => {
    expect(parsePendingIntentRoute(raw('track', NOW - PENDING_INTENT_ROUTE_TTL_MS - 1), NOW)).toBeNull();
    expect(parsePendingIntentRoute(raw('track', NOW + 61_000), NOW)).toBeNull();
    expect(parsePendingIntentRoute(raw('track', NOW - PENDING_INTENT_ROUTE_TTL_MS + 1000), NOW)?.path).toBe('/track');
  });
});

describe('consumePendingIntentRoute (consume-once)', () => {
  it('liefert das Ziel genau einmal und löscht den Eintrag', () => {
    const s = store(raw('track/legen'));
    expect(consumePendingIntentRoute(s, NOW)?.path).toBe('/track/legen');
    expect(PENDING_INTENT_ROUTE_KEY in s.data).toBe(false);
    expect(consumePendingIntentRoute(s, NOW)).toBeNull();
  });
  it('ungültige/abgelaufene Einträge werden ebenfalls gelöscht (kein Hängenbleiben)', () => {
    const s = store('evil|1|x');
    expect(consumePendingIntentRoute(s, NOW)).toBeNull();
    expect(PENDING_INTENT_ROUTE_KEY in s.data).toBe(false);
  });
  it('bereits verarbeitete id wird nicht erneut geliefert (keine doppelte Navigation)', () => {
    expect(consumePendingIntentRoute(store(raw('track', NOW, 'same')), NOW, 'same')).toBeNull();
  });
  it('kein Eintrag → nichts lesen/schreiben', () => {
    const s = store(undefined);
    delete s.data[PENDING_INTENT_ROUTE_KEY];
    const spy = jest.spyOn(s, 'set');
    expect(consumePendingIntentRoute(s, NOW)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('Vertrag Swift ↔ JS ↔ Expo-Routen', () => {
  const swift = readFileSync('plugins/ios/app/AnyvoAppIntents.swift', 'utf8');
  it('Swift-Allowlist (AnyvoIntentRoute) = JS-Allowlist, gleicher UserDefaults-Key', () => {
    const swiftRoutes = [...swift.matchAll(/case \w+ = "([^"]+)"/g)].map(m => m[1]).sort();
    expect(swiftRoutes).toEqual(Object.keys(INTENT_ROUTES).sort());
    expect(swift).toContain(`static let defaultsKey = "${PENDING_INTENT_ROUTE_KEY}"`);
  });
  it('alle Ziele sind echte Expo-Router-Routen', () => {
    for (const p of Object.values(INTENT_ROUTES)) {
      const file = p === '/track' ? 'app/track/index.tsx' : `app${p}.tsx`;
      expect(existsSync(file)).toBe(true);
    }
  });
  it('„Fährte legen" öffnet nur die Vorbereitung (Lege-Screen startet in warmup, Aufnahme erst per Tippen)', () => {
    const legen = readFileSync('app/track/legen.tsx', 'utf8');
    expect(legen).toMatch(/useState<'warmup' \| 'recording'>\('warmup'\)/);
    expect(readFileSync('features/appIntents/pendingIntentRoute.ts', 'utf8')).not.toMatch(/beginRecording|startRecording|claimNewbieQuota/);
  });
});
