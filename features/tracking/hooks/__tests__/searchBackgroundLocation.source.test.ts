// T-206: Die Absuche fordert Hintergrund-Ortung an; das Legen und andere Aufrufer nicht.
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (rel: string) => readFileSync(join(__dirname, '..', '..', '..', '..', rel), 'utf8');

describe('Hintergrund-Ortung nur in der Absuche (T-206)', () => {
  it('useSearchRecorder startet die Positionsquelle mit allowBackground: true', () => {
    expect(read('features/tracking/hooks/useSearchRecorder.ts')).toMatch(/startPositionSource\([\s\S]{0,1100}\{ allowBackground: true[,\s}]/);
  });
  it('andere Aufrufer bleiben beim Standard (keine Hintergrund-Option)', () => {
    expect(read('features/tracking/hooks/useTrackRecorder.ts')).not.toMatch(/allowBackground/);
    expect(read('features/tracking-distractions/DistractionScreen.tsx')).not.toMatch(/allowBackground/);
  });
  it('nur die Absuche nutzt auf Android die Fused-Ortung (Feldfehler 26.11.)', () => {
    expect(read('features/tracking/hooks/useSearchRecorder.ts')).toMatch(/\{ allowBackground: true, androidUseFusedLocation: true \}/);
    expect(read('features/tracking/hooks/useTrackRecorder.ts')).not.toMatch(/androidUseFusedLocation/);
    expect(read('features/tracking-distractions/DistractionScreen.tsx')).not.toMatch(/androidUseFusedLocation/);
  });
  it('der letzte bekannte Standort ist nur Anzeige: nicht im Recorder, nicht in der Ansatz-Erkennung', () => {
    expect(read('features/tracking/hooks/useSearchRecorder.ts')).not.toMatch(/getLastKnownPositionAsync|useLastKnownApproach/);
    expect(read('features/tracking/hooks/useStartPointApproach.ts')).not.toMatch(/getLastKnownPositionAsync|lastKnown/i);
    const run = read('app/track/run.tsx');
    expect(run).toMatch(/useStartPointApproach\(\{ active: arming, start: startPoint, liveFix: s\.liveFix,/);
    expect(run).not.toMatch(/lastKnown[\s\S]{0,40}(beginSearchNow|flushSearchPoints|liveFix:)/);
  });
  it('run.tsx sagt «Gegenstand erkannt» je Fund nur einmal, auch nach dem Fortsetzen', () => {
    const run = read('app/track/run.tsx');
    expect(run).toMatch(/announcedDwellRef\.current = new Set\(runState\.autoDwellObjectIds\)/);
    expect(run).toMatch(/if \(announcedDwellRef\.current\.has\(id\)\) return;/);
  });
});
