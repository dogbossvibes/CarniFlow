// Liegezeit-Live-Activity V2: Identität (dogId + sessionId), echter Hundename, fachlicher
// Liegezeit-Beginn, Multi-Dog, Rehydration (Fälle A–E), V1-Fallback/-Migration, Privacy,
// kein JS-Tick. Das native Modul wird durch einen Fake mit ActivityKit-Semantik ersetzt
// (exakte Zuordnung je dogId + sessionId, wie RestingActivityController.swift).
import { Platform } from 'react-native';

type FakeActivity = { activityId: string; dogId: string; sessionId: string; lyingStartedAtMs: number; input: any };
const mockActs: FakeActivity[] = [];
let mockV2 = true;
let mockSeq = 0;
const mockNativeCalls: string[] = [];
jest.mock('@/modules/anyvo-resting-activity', () => ({
  isRestingActivityModuleAvailable: () => mockV2,
  isRestingActivitySupported: () => mockV2,
  startRestingActivity: (input: any) => {
    mockNativeCalls.push('start');
    const hit = mockActs.find(a => a.dogId === input.dogId && a.sessionId === input.sessionId);
    if (hit) return hit.activityId;
    const a = { activityId: `act-${++mockSeq}`, dogId: input.dogId, sessionId: input.sessionId, lyingStartedAtMs: input.lyingStartedAtMs, input };
    mockActs.push(a);
    return a.activityId;
  },
  endRestingActivity: async (dogId: string, sessionId: string) => {
    mockNativeCalls.push('end');
    const before = mockActs.length;
    for (let i = mockActs.length - 1; i >= 0; i--) if (mockActs[i].dogId === dogId && mockActs[i].sessionId === sessionId) mockActs.splice(i, 1);
    return before - mockActs.length;
  },
  endRestingActivityById: async (id: string) => {
    mockNativeCalls.push('endById');
    const i = mockActs.findIndex(a => a.activityId === id);
    if (i >= 0) mockActs.splice(i, 1);
    return i >= 0;
  },
  listRestingActivities: () => mockActs.map(({ activityId, dogId, sessionId, lyingStartedAtMs }) => ({ activityId, dogId, sessionId, lyingStartedAtMs })),
  endLegacyRestingActivities: async () => { mockNativeCalls.push('endLegacy'); return 0; },
}));
const mockV1Start = jest.fn((..._a: unknown[]) => `v1-${++mockSeq}`);
const mockV1Stop = jest.fn();
jest.mock('expo-live-activity', () => ({
  startActivity: (...a: unknown[]) => mockV1Start(...a),
  stopActivity: (...a: unknown[]) => mockV1Stop(...a),
}), { virtual: false });
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

/* eslint-disable import/first -- Mocks müssen vor den Imports registriert sein */
import fs from 'fs';
import {
  startLiegezeitActivity, endLiegezeitActivity, restingDeepLinkUrl, restingDeepLinkPath, _v1ActivityCount,
} from '@/features/tracking/native/liegezeitLiveActivity';
import { planRestingActivities, reconcileRestingActivities } from '@/features/tracking/native/restingActivityReconcile';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import type { ActiveFaehrte } from '@/features/tracking/store/activeFaehrtenModel';
/* eslint-enable import/first */

const LABELS = { lying: 'Liegezeit', since: 'seit', fallbackTitle: 'Fährte' };
const NOW = Date.parse('2026-10-05T11:10:00.000Z');
const entry = (dog: string, over: Partial<ActiveFaehrte> = {}): ActiveFaehrte => ({
  dogId: dog, sessionId: `s-${dog}`, runId: null, status: 'resting', startedAt: NOW - 3_600_000, layStartedAt: NOW - 5 * 60_000,
  searchStartedAt: null, distanceMeters: 100, winkelCount: 0, objektCount: 0, gpsAccuracy: null, weather: null, updatedAt: NOW, ...over,
});
const params = (url: string) => Object.fromEntries(new URL(url).searchParams);

beforeEach(() => {
  mockActs.length = 0; mockNativeCalls.length = 0; mockV2 = true;
  mockV1Start.mockClear(); mockV1Stop.mockClear();
  useActiveFaehrten.setState({ byDog: {}, hydrated: true });
});

it('Testumgebung ist iOS', () => { expect(Platform.OS).toBe('ios'); });

describe('Start: Identität, Name, Zeitbasis, Deep-Link', () => {
  it('übergibt dogId, sessionId, echten Namen, lokalisierte Labels und den fachlichen Liegezeit-Beginn (nicht „jetzt")', () => {
    const startedAt = NOW - 5 * 60_000;   // Timer 1: vor 5 Minuten
    startLiegezeitActivity({ dogId: 'dog-A', sessionId: 's-A', dogName: 'Skadi', startedAt }, LABELS);
    expect(mockActs).toHaveLength(1);
    expect(mockActs[0].input).toEqual({
      dogId: 'dog-A', sessionId: 's-A', dogName: 'Skadi', lyingStartedAtMs: startedAt,
      lyingLabel: 'Liegezeit', sinceLabel: 'seit', deepLinkUrl: 'anyvo://track/liegen?dogId=dog-A&id=s-A',
    });
  });
  it('Timer 2: 90 Minuten alte Liegezeit → Basis bleibt exakt dieser Zeitpunkt (Stunden rendert SwiftUI)', () => {
    const startedAt = NOW - 90 * 60_000;
    startLiegezeitActivity({ dogId: 'dog-A', sessionId: 's-A', dogName: 'Skadi', startedAt }, LABELS);
    expect(mockActs[0].lyingStartedAtMs).toBe(startedAt);
    expect((NOW - mockActs[0].lyingStartedAtMs) / 60_000).toBe(90);
  });
  it('kein „Hund"-Platzhalter: unbekannter Name → neutrale lokalisierte Beschriftung', () => {
    startLiegezeitActivity({ dogId: 'dog-A', sessionId: 's-A', dogName: null, startedAt: NOW }, LABELS);
    startLiegezeitActivity({ dogId: 'dog-B', sessionId: 's-B', dogName: '   ', startedAt: NOW }, LABELS);
    expect(mockActs.map(a => a.input.dogName)).toEqual(['Fährte', 'Fährte']);
  });
  it('idempotent je dogId + sessionId (kein Duplikat, keine Ersetzung)', () => {
    startLiegezeitActivity({ dogId: 'dog-A', sessionId: 's-A', dogName: 'Skadi', startedAt: NOW }, LABELS);
    startLiegezeitActivity({ dogId: 'dog-A', sessionId: 's-A', dogName: 'Skadi', startedAt: NOW }, LABELS);
    expect(mockActs).toHaveLength(1);
  });
  it('ohne sessionId / dogId / Startzeit → keine Activity (fail closed)', () => {
    startLiegezeitActivity({ dogId: 'dog-A', sessionId: null, dogName: 'Skadi', startedAt: NOW }, LABELS);
    startLiegezeitActivity({ dogId: '', sessionId: 's-A', dogName: 'Skadi', startedAt: NOW }, LABELS);
    startLiegezeitActivity({ dogId: 'dog-A', sessionId: 's-A', dogName: 'Skadi', startedAt: 0 }, LABELS);
    expect(mockActs).toHaveLength(0);
  });
  it('Deep-Link enthält dogId + sessionId (URL-kodiert), App-Schema aus app.json', () => {
    const scheme = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo.scheme;
    const url = restingDeepLinkUrl('dog A', 's/1');
    expect(url.startsWith(`${scheme}://track/liegen?`)).toBe(true);
    expect(params(url)).toEqual({ dogId: 'dog A', id: 's/1' });
    expect(restingDeepLinkPath('dog-A', 's-A')).toBe('/track/liegen?dogId=dog-A&id=s-A');
  });
});

describe('Multi-Dog: eigene Activity je Hund, Ende nur exakt', () => {
  beforeEach(() => {
    startLiegezeitActivity({ dogId: 'dog-A', sessionId: 's-A', dogName: 'Skadi', startedAt: NOW - 30 * 60_000 }, LABELS);
    startLiegezeitActivity({ dogId: 'dog-B', sessionId: 's-B', dogName: 'Yam', startedAt: NOW - 10 * 60_000 }, LABELS);
  });
  it('A und B gleichzeitig, je eigener Name, Timer-Basis und Deep-Link', () => {
    expect(mockActs.map(a => [a.input.dogName, a.lyingStartedAtMs, params(a.input.deepLinkUrl)])).toEqual([
      ['Skadi', NOW - 30 * 60_000, { dogId: 'dog-A', id: 's-A' }],
      ['Yam', NOW - 10 * 60_000, { dogId: 'dog-B', id: 's-B' }],
    ]);
  });
  it('Ende A beendet nur A; Ende B nur B', async () => {
    await endLiegezeitActivity({ dogId: 'dog-A', sessionId: 's-A' });
    expect(mockActs.map(a => a.dogId)).toEqual(['dog-B']);
    await endLiegezeitActivity({ dogId: 'dog-B', sessionId: 's-B' });
    expect(mockActs).toHaveLength(0);
  });
  it('falsche Kombination (Hund A + Session B) oder fehlende sessionId beendet nichts', async () => {
    await endLiegezeitActivity({ dogId: 'dog-A', sessionId: 's-B' });
    await endLiegezeitActivity({ dogId: 'dog-A', sessionId: null });
    expect(mockActs).toHaveLength(2);
  });
});

describe('Kein JS-Tick / Polling', () => {
  it('Timer 5: es gibt keinen Update-Pfad — nur start/end/list; Wrapper ohne setInterval/update', () => {
    startLiegezeitActivity({ dogId: 'dog-A', sessionId: 's-A', dogName: 'Skadi', startedAt: NOW }, LABELS);
    expect(new Set(mockNativeCalls)).toEqual(new Set(['start']));
    const mod = fs.readFileSync('modules/anyvo-resting-activity/index.ts', 'utf8');
    const wrapper = fs.readFileSync('features/tracking/native/liegezeitLiveActivity.ts', 'utf8');
    for (const src of [mod, wrapper]) expect(src).not.toMatch(/setInterval|updateActivity|\.update\(/);
    const swift = fs.readFileSync('modules/anyvo-resting-activity/ios/AnyvoRestingActivityModule.swift', 'utf8');
    expect(swift).not.toMatch(/\.update\(|Timer\./);
  });
});

describe('Rehydration (Registry = Source of Truth)', () => {
  const info = (dog: string, session = `s-${dog}`, id = `act-${dog}`) => ({ activityId: id, dogId: dog, sessionId: session, lyingStartedAtMs: 1 });
  it('A: offene Liegezeit + passende Activity → behalten', () => {
    expect(planRestingActivities([info('A')], { A: entry('A') }, ['A'])).toEqual({ keep: ['act-A'], end: [], start: [] });
  });
  it('B: offene Liegezeit ohne Activity → anlegen mit Registry-Liegezeit-Beginn (kein Reset auf 00:00)', () => {
    const p = planRestingActivities([], { A: entry('A') }, ['A']);
    expect(p.start).toEqual([{ dogId: 'A', sessionId: 's-A', startedAt: NOW - 5 * 60_000 }]);
  });
  it('B: ohne Beleg nichts anlegen (fremder Hund, Hunde unbekannt, keine sessionId, kein Liegezeit-Beginn)', () => {
    expect(planRestingActivities([], { A: entry('A') }, ['X']).start).toEqual([]);
    expect(planRestingActivities([], { A: entry('A') }, null).start).toEqual([]);
    expect(planRestingActivities([], { A: entry('A', { sessionId: null }) }, ['A']).start).toEqual([]);
    expect(planRestingActivities([], { A: entry('A', { layStartedAt: null }) }, ['A']).start).toEqual([]);
  });
  it('C: Activity, aber Fährte nicht mehr in der Liegezeit (Absuche/abgeschlossen/entfernt) → beenden', () => {
    expect(planRestingActivities([info('A')], { A: entry('A', { status: 'searching' }) }, ['A']).end).toEqual(['act-A']);
    expect(planRestingActivities([info('A')], {}, ['A']).end).toEqual(['act-A']);
  });
  it('D: Activity mit anderer sessionId als die Registry → beenden, NICHT umhängen; neue Session bekommt eigene', () => {
    const p = planRestingActivities([info('A', 's-OLD')], { A: entry('A') }, ['A']);
    expect(p.end).toEqual(['act-A']);
    expect(p.start).toEqual([{ dogId: 'A', sessionId: 's-A', startedAt: NOW - 5 * 60_000 }]);
  });
  it('E: zwei Hunde unabhängig; Duplikat derselben Fährte wird beendet', () => {
    const p = planRestingActivities([info('A'), info('B'), info('A', 's-A', 'act-A2')], { A: entry('A'), B: entry('B') }, ['A', 'B']);
    expect(p).toEqual({ keep: ['act-A', 'act-B'], end: ['act-A2'], start: [] });
  });
  it('Timer 3/4: App-Kill → Wiederaufbau nutzt identische Zeitbasis; V1 wird vorher beendet, verwaiste beendet', async () => {
    const reg = entry('A', { layStartedAt: NOW - 25 * 60_000 });
    useActiveFaehrten.setState({ byDog: { A: reg, B: entry('B', { status: 'searching' }) }, hydrated: true });
    mockActs.push({ activityId: 'act-B-old', dogId: 'B', sessionId: 's-B', lyingStartedAtMs: 1, input: {} });
    const plan = await reconcileRestingActivities({ ownDogs: [{ id: 'A', name: 'Skadi' }, { id: 'B', name: 'Yam' }], labels: LABELS });
    expect(mockNativeCalls[0]).toBe('endLegacy');
    expect(plan?.end).toEqual(['act-B-old']);
    expect(mockActs.map(a => [a.dogId, a.input.dogName, a.lyingStartedAtMs])).toEqual([['A', 'Skadi', NOW - 25 * 60_000]]);
    // erneuter Abgleich ändert nichts (idempotent, kein Neustart)
    await reconcileRestingActivities({ ownDogs: [{ id: 'A', name: 'Skadi' }], labels: LABELS });
    expect(mockActs).toHaveLength(1);
  });
  it('ohne V2-Modul (älterer Build/Android) → kein Abgleich', async () => {
    mockV2 = false;
    expect(await reconcileRestingActivities({ ownDogs: null, labels: LABELS })).toBeNull();
    expect(mockNativeCalls).toEqual([]);
  });
});

describe('V1-Fallback (nur ohne V2-Modul): ebenfalls je Hund, kein Singleton', () => {
  beforeEach(() => { mockV2 = false; });
  it('zwei Hunde → zwei V1-Activities mit Namen; Ende A stoppt nur A', async () => {
    startLiegezeitActivity({ dogId: 'dog-A', sessionId: 's-A', dogName: 'Skadi', startedAt: NOW }, LABELS);
    startLiegezeitActivity({ dogId: 'dog-B', sessionId: 's-B', dogName: 'Yam', startedAt: NOW }, LABELS);
    expect(mockV1Start).toHaveBeenCalledTimes(2);
    expect((mockV1Start.mock.calls[0][0] as any).title).toBe('Skadi · Liegezeit');
    expect((mockV1Start.mock.calls[0][1] as any).deepLinkUrl).toBe('/track/liegen?dogId=dog-A&id=s-A');
    const idA = mockV1Start.mock.results[0].value;
    await endLiegezeitActivity({ dogId: 'dog-A', sessionId: 's-A' });
    expect(mockV1Stop).toHaveBeenCalledTimes(1);
    expect(mockV1Stop.mock.calls[0][0]).toBe(idA);
    expect(_v1ActivityCount()).toBe(1);
    await endLiegezeitActivity({ dogId: 'dog-B', sessionId: 's-B' });
  });
});

describe('Privacy / Schema (Source-Vertrag)', () => {
  const attrs = fs.readFileSync('modules/anyvo-resting-activity/ios/AnyvoRestingActivityAttributes.swift', 'utf8');
  const fields = [...attrs.matchAll(/^\s*var (\w+):/gm)].map(m => m[1]);
  it('V2-Attribute: nur Identität + Darstellung; ContentState leer (Timer nicht im State)', () => {
    expect(fields).toEqual(['dogId', 'sessionId', 'dogName', 'lyingStartedAt', 'lyingLabel', 'sinceLabel', 'deepLinkUrl']);
    expect(attrs).toMatch(/public struct ContentState: Codable, Hashable \{\}/);
    expect(fields.join(' ')).not.toMatch(/lat|lng|coord|route|email|token|user|account|diag|path/i);
  });
  it('eigener V2-Typname (V1-Schema bleibt unangetastet)', () => {
    expect(attrs).toMatch(/struct AnyvoRestingActivityAttributes: ActivityAttributes/);
  });
  it('Widget rendert den Timer nativ ab lyingStartedAt (hochzählend), Hundename sichtbar, URL je Fährte', () => {
    const w = fs.readFileSync('modules/anyvo-resting-activity/widget/AnyvoRestingActivityWidget.swift', 'utf8');
    expect(w).toMatch(/Text\(timerInterval: attributes\.timerRange, countsDown: false, showsHours: true\)/);
    expect(w).toMatch(/lyingStartedAt\.\.\./);
    expect(w).toMatch(/compactLeading/); expect(w).toMatch(/compactTrailing/); expect(w).toMatch(/minimal/);
    expect(w).toMatch(/\.widgetURL\(context\.attributes\.url\)/);
    expect(w).toMatch(/\.widgetURL\(attributes\.url\)/);
    expect(w).not.toMatch(/Text\("(Liegezeit|seit|Hund)/);   // keine hartcodierten deutschen Texte
  });
  it('relevanceScore = Liegezeit-Beginn (jüngere Liegezeit zuerst), nur UI', () => {
    const c = fs.readFileSync('modules/anyvo-resting-activity/ios/RestingActivityController.swift', 'utf8');
    expect(c).toMatch(/relevanceScore: relevanceScore\(for: attributes\.lyingStartedAt\)/);
    expect(c).toMatch(/lyingStartedAt\.timeIntervalSince1970/);
  });
});

describe('Config-Plugin', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const plugin = require('../../../../plugins/withAnyvoRestingLiveActivity');
  it('steht in app.json VOR expo-live-activity (Xcode-Mods laufen umgekehrt)', () => {
    const plugins: unknown[] = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo.plugins;
    const names = plugins.map(p => (Array.isArray(p) ? p[0] : p));
    expect(names.indexOf('./plugins/withAnyvoRestingLiveActivity')).toBeGreaterThan(-1);
    expect(names.indexOf('./plugins/withAnyvoRestingLiveActivity')).toBeLessThan(names.indexOf('expo-live-activity'));
  });
  it('registriert das V2-Widget im WidgetBundle (idempotent), V1-Widget bleibt', () => {
    const src = fs.readFileSync('node_modules/expo-live-activity/ios-files/LiveActivityWidgetBundle.swift', 'utf8');
    const once = plugin.patchWidgetBundle(src);
    expect(once).toContain('LiveActivityWidget()');
    expect(once).toContain('AnyvoRestingActivityWidget()');
    expect(plugin.patchWidgetBundle(once)).toBe(once);
    expect(() => plugin.patchWidgetBundle('struct X {}')).toThrow(/nicht gefunden/);
  });
});
