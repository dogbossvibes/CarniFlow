// Fährten-Simulator (T-192): schnelle Selbsttests für die Absuche (Hund, Hundeführer,
// Gegenstände) und ein Kontrolllauf durch den echten Such-Recorder. Läuft immer mit.
import './searchMocks';
import { buildSearchGroup, emptySearchCell, renderReport, SEARCH_GROUPS, addSearchOutcome } from './matrix';
import { makeRng } from './rng';
import { runSearchScenario } from './searchScenario';
import { buildSearchTruth, DEFAULT_HANDLER, DOGS } from './searchTruth';
import { buildTruthTrack, DEFAULT_WALK, SHAPE_TRACKS, type TrackSpec } from './truthTrack';

const SHORT: TrackSpec = { name: 'kurz', parts: [{ leg: 18 }, { turn: 90 }, { leg: 18 }], articlesAtM: [10, 36] };

describe('wahre Absuche', () => {
  const lay = buildTruthTrack(SHORT, DEFAULT_WALK, makeRng(1));

  test('ruhiger Hund bleibt nah an der Fährte, der Hundeführer hängt höchstens eine Leinenlänge dahinter', () => {
    const t = buildSearchTruth(lay, DOGS.ruhig, DEFAULT_HANDLER, makeRng(2));
    expect(t.dogMeanLateralM).toBeLessThan(0.6);
    t.dogSamples.forEach((d, i) => {
      const h = t.handlerTimeline.samples[i];
      expect(Math.hypot(h.x - d.x, h.y - d.y)).toBeLessThanOrEqual(DEFAULT_HANDLER.lineM + 0.6);
    });
    // Der Hundeführer schneidet den Winkel ab — er ist dort weiter von der Fährte weg als der Hund.
    expect(t.handlerMaxLateralM).toBeGreaterThan(t.dogMaxLateralM);
  });

  test('verwiesene Gegenstände: der Hundeführer geht zum Hund und bleibt dort stehen', () => {
    const t = buildSearchTruth(lay, DOGS.ruhig, DEFAULT_HANDLER, makeRng(3));
    expect(t.articles.every(a => a.indicated && a.arrivedTS != null && a.leftTS != null)).toBe(true);
    const a = t.articles[0];
    const during = t.handlerTimeline.samples.filter(s => s.tS > (a.leftTS as number) - 3 && s.tS < (a.leftTS as number) - 0.5);
    expect(during.every(s => s.speedMps === 0)).toBe(true);
    expect(Math.hypot(during[0].x - a.x, during[0].y - a.y)).toBeLessThan(2);
  });

  test('unsicherer Hund pendelt deutlich weiter als der ruhige', () => {
    const calm = buildSearchTruth(lay, DOGS.ruhig, DEFAULT_HANDLER, makeRng(4));
    const wide = buildSearchTruth(lay, DOGS.unsicher, DEFAULT_HANDLER, makeRng(4));
    expect(wide.dogMeanLateralM).toBeGreaterThan(calm.dogMeanLateralM * 2);
  });
});

describe('Lauf durch den echten Such-Recorder', () => {
  test('Legen mit Gegenständen und Absuche laufen durch und liefern auswertbare Ergebnisse', async () => {
    const o = await runSearchScenario({ track: SHORT, device: 'dual', env: 'open', platform: 'ios', dog: DOGS.ruhig, seed: 1 });
    expect(o.lay.run.objects).toHaveLength(2);
    expect(o.score.objects.every(x => x.layErrM < 8)).toBe(true);
    expect(o.search.result.analyticsSamples.length).toBeGreaterThan(10);
    expect(o.search.analytics).not.toBeNull();
    expect(o.score.startLocked).toBe(true);

    const cell = emptySearchCell('t', 'r', 'c');
    addSearchOutcome(cell, o);
    expect(cell.indicated).toBe(1);   // der Gegenstand am Fährtenende zählt nicht in die Quote
    expect(renderReport([{ group: 'suche', seeds: 1, runs: 1, elapsedS: 0, cells: [], searchCells: [cell] }])).toContain('Verwiesene Gegenstände');
  }, 120000);

  test('Sprachführung und Ende laufen mit und lassen sich gegen die Wahrheit auswerten (T-205)', async () => {
    const o = await runSearchScenario({ track: SHORT, device: 'dual', env: 'open', platform: 'ios', dog: DOGS.ruhig, seed: 1 });
    expect(o.search.spoken.some(e => e.key === 'search-started')).toBe(true);
    expect(o.search.spoken.some(e => e.key?.startsWith('feature:'))).toBe(true);
    // Gesprochene Ansagen überlappen sich nie (eine Sprachausgabe).
    const spans = o.search.spoken.filter(e => e.endMs != null).map(e => [e.startMs, e.endMs as number]).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1] - 1);
    expect(o.score.guidance.features.length).toBeGreaterThan(0);
    expect(o.search.trace.length).toBeGreaterThan(10);
    expect(o.score.guidance.pawErrMeanM).toBeGreaterThanOrEqual(0);
  }, 120000);

  test('App-Abbruch und Fortsetzen über den echten Speicherweg (T-205)', async () => {
    const o = await runSearchScenario({ track: SHORT, device: 'dual', env: 'open', platform: 'ios', dog: DOGS.ruhig, seed: 2,
      interruptions: [{ kind: 'kill', atFrac: 0.5, durationS: 10 }] });
    expect(o.search.kills).toHaveLength(1);
    const k = o.search.kills[0];
    expect(k.restartMs).not.toBeNull();
    expect(k.pointsBefore).toBeGreaterThan(0);
    expect(o.score.guidance.resume).toHaveLength(1);
    // Nach dem Fortsetzen nimmt die Absuche wieder Punkte auf.
    expect(o.search.trace.some(t => t.tMs > (k.restartMs as number) + 3000)).toBe(true);
  }, 120000);

  test('Pause, Sperrbildschirm und manuelles Antippen lassen sich einspielen (T-205)', async () => {
    const o = await runSearchScenario({ track: SHORT, device: 'dual', env: 'open', platform: 'ios', dog: DOGS.ruhig, seed: 3,
      manualTap: { tapAfterS: 2 }, interruptions: [{ kind: 'lock', atFrac: 0.3, durationS: 8 }, { kind: 'pause', atFrac: 0.6, durationS: 5 }] });
    expect(o.score.guidance.manualTaps).toBeGreaterThan(0);
    expect(o.search.trace.some(t => t.paused)).toBe(true);
  }, 120000);

  test('Android: Bildschirm aus liefert nur mit Wachhalter weiter Positionen (T-209/T-210)', async () => {
    const lock = { track: SHORT, device: 'dual', env: 'open', platform: 'android', dog: DOGS.ruhig, seed: 3,
      interruptions: [{ kind: 'lock', atFrac: 0.3, durationS: 20 }] } as const;
    const gap = (o: Awaited<ReturnType<typeof runSearchScenario>>) => Math.max(...o.search.trace.slice(1).map((t, i) => t.tMs - o.search.trace[i].tMs));
    const withKeepalive = await runSearchScenario({ ...lock, interruptions: [...lock.interruptions] });
    const without = await runSearchScenario({ ...lock, interruptions: [...lock.interruptions], androidKeepalive: false });
    expect(gap(withKeepalive)).toBeLessThan(8000);
    expect(gap(without)).toBeGreaterThan(18000);
  }, 120000);

  test('Fährtenverlust und schwierige Formen erzeugen die erwartete Wahrheit (T-205)', () => {
    const lay = buildTruthTrack(SHAPE_TRACKS.Kreuzung, DEFAULT_WALK, makeRng(5));
    // Schenkel 4 kreuzt Schenkel 1: ein Punkt des letzten Schenkels liegt nah am ersten.
    const { x, y, s } = lay.path;
    const late = x.map((_, i) => i).filter(i => s[i] > 100);
    const early = x.map((_, i) => i).filter(i => s[i] < 35);
    const minD = Math.min(...late.map(i => Math.min(...early.filter((_, k) => k % 10 === 0).map(j => Math.hypot(x[i] - x[j], y[i] - y[j])))));
    expect(minD).toBeLessThan(1);
    const t = buildSearchTruth(lay, DOGS.ruhig, DEFAULT_HANDLER, makeRng(6), { losses: [{ atM: 50, offsetM: 10, lengthM: 12 }] });
    expect(t.lossWindowsS).toHaveLength(1);
    expect(Math.max(...t.dogSamples.filter(d => d.lost).map(d => d.lateralM))).toBeGreaterThan(7);
    // Am Fährtenende geht der Hundeführer zum Hund.
    const end = t.handlerTimeline.samples[t.handlerTimeline.samples.length - 1];
    const last = lay.path.x.length - 1;
    expect(Math.hypot(end.x - lay.path.x[last], end.y - lay.path.y[last])).toBeLessThan(2);
  });

  test('Regression T-207: nach dem abgekürzten Winkel bleibt der Fortschritt nicht am alten Schenkel hängen', async () => {
    // Dieser Lauf blieb vor T-207 nach dem ersten Winkel bei 28 % stehen (Kontinuitätsfalle).
    const o = await runSearchScenario({ track: SHAPE_TRACKS.Kreuzung, device: 'single', env: 'open', platform: 'ios', dog: DOGS.ruhig, seed: 4 });
    expect(o.score.progressPct).toBeGreaterThan(90);
  }, 120000);

  test('Regression T-208: GPS-Drift vom Hinweg zum parallelen Rückweg setzt den Fortschritt nicht nach vorn', async () => {
    // Parallele Schenkel 8 m: Hinweg 0–40 m, Rückweg 48–88 m. Ab 30 m auf dem Hinweg driften die Messungen
    // über ~7 s bis 6 m seitlich (also 2 m vom Rückweg) und zurück. Vor T-208 sprang der Fortschritt
    // dabei endgültig auf ~52 m (Rückweg).
    let driftMs = 0;
    const o = await runSearchScenario({ track: SHAPE_TRACKS['Parallele Schenkel 8 m'], device: 'single', env: 'open', platform: 'ios', dog: DOGS.ruhig, seed: 1,
      fixTransform: (fixes, lay) => {
        const { x, y, s } = lay.truth.path;
        const at = (m: number) => { const i = s.findIndex(v => v >= m); return { x: x[i], y: y[i] }; };
        const out = at(30), back = at(58);
        const i = fixes.reduce((best, f, k) => (Math.hypot(f.x - out.x, f.y - out.y) < Math.hypot(fixes[best].x - out.x, fixes[best].y - out.y) ? k : best), 0);
        driftMs = fixes[i].tMs;
        // Anstieg über 2 Messungen, 3 Messungen auf voller Drift, Abklingen über 2 Messungen.
        const w = (k: number) => { const d = k - i; if (d < 0) return 0; if (d < 2) return (d + 1) / 3; if (d < 5) return 1; if (d < 7) return (7 - d) / 3; return 0; };
        return fixes.map((f, k) => { const a = 0.75 * w(k); return a ? { ...f, x: f.x + a * (back.x - out.x), y: f.y + a * (back.y - out.y) } : f; });
      } });
    const after = o.search.trace.filter(t => t.tMs >= driftMs && t.tMs <= driftMs + 12000);
    expect(after.length).toBeGreaterThan(0);
    expect(Math.max(...after.map(t => t.appHandlerM))).toBeLessThan(45);
    expect(o.score.progressPct).toBeGreaterThan(85);
  }, 120000);

  test('Such-Matrix lässt sich aufbauen', () => {
    for (const g of SEARCH_GROUPS) expect(buildSearchGroup(g, 2).length).toBeGreaterThan(0);
  });
});
