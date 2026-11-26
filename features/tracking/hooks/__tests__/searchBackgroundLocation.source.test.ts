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
  it('nur die Absuche nutzt den Android-Wechsel auf expo-location (Feldfehler 26.11.)', () => {
    expect(read('features/tracking/hooks/useSearchRecorder.ts')).toMatch(/androidNativeFixTimeoutMs: SEARCH_ANDROID_NATIVE_FIX_TIMEOUT_MS/);
    expect(read('features/tracking/hooks/useTrackRecorder.ts')).not.toMatch(/androidNativeFixTimeoutMs/);
    expect(read('features/tracking-distractions/DistractionScreen.tsx')).not.toMatch(/androidNativeFixTimeoutMs/);
  });
  it('run.tsx sagt «Gegenstand erkannt» je Fund nur einmal, auch nach dem Fortsetzen', () => {
    const run = read('app/track/run.tsx');
    expect(run).toMatch(/announcedDwellRef\.current = new Set\(runState\.autoDwellObjectIds\)/);
    expect(run).toMatch(/if \(announcedDwellRef\.current\.has\(id\)\) return;/);
  });
});
