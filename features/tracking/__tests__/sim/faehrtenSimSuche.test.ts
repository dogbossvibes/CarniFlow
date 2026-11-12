// Fährten-Simulator (T-192): schnelle Selbsttests für die Absuche (Hund, Hundeführer,
// Gegenstände) und ein Kontrolllauf durch den echten Such-Recorder. Läuft immer mit.
import './searchMocks';
import { buildSearchGroup, renderReport, SEARCH_GROUPS, addSearchOutcome, type SearchCell } from './matrix';
import { makeRng } from './rng';
import { runSearchScenario } from './searchScenario';
import { buildSearchTruth, DEFAULT_HANDLER, DOGS } from './searchTruth';
import { buildTruthTrack, DEFAULT_WALK, type TrackSpec } from './truthTrack';

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

    const cell: SearchCell = { table: 't', row: 'r', col: 'c', runs: 0, startLocked: 0, endReached: 0, indicated: 0, foundIndicated: 0,
      analysisContactIndicated: 0, notIndicated: 0, foundNotIndicated: 0, layObjectErrSumM: 0, layObjectN: 0, appDeviationSumM: 0,
      dogDeviationSumM: 0, handlerDeviationSumM: 0, recorderScoreSum: 0, analysisScoreSum: 0, analysisScoreN: 0, deviationEvents: 0, breaks: 0 };
    addSearchOutcome(cell, o);
    expect(cell.indicated).toBe(1);   // der Gegenstand am Fährtenende zählt nicht in die Quote
    expect(renderReport([{ group: 'suche', seeds: 1, runs: 1, elapsedS: 0, cells: [], searchCells: [cell] }])).toContain('Verwiesene Gegenstände');
  }, 120000);

  test('Such-Matrix lässt sich aufbauen', () => {
    for (const g of SEARCH_GROUPS) expect(buildSearchGroup(g, 2).length).toBeGreaterThan(0);
  });
});
