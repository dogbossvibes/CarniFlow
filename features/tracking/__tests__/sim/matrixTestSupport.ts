// Fährten-Simulator (T-192) — reiner Testcode.
// Gemeinsamer Rahmen der Matrix-Testdateien. Die grosse Matrix läuft NUR, wenn
// FAEHRTEN_SIM gesetzt ist (z. B. FAEHRTEN_SIM=full); im normalen Testlauf wird sie übersprungen.
import { tmpdir } from 'os';
import { join } from 'path';
import { isSearchGroup, OPT_IN_GROUPS, runGroup, runSearchGroup, writeGroupResult, type GroupName } from './matrix';

export function defineMatrixGroupTest(group: GroupName): void {
  const mode = process.env.FAEHRTEN_SIM;
  const enabled = !!mode && ((mode === 'full' && !OPT_IN_GROUPS.includes(group)) || mode.split(',').includes(group));
  const seeds = Math.max(1, Number(process.env.FAEHRTEN_SIM_SEEDS) || 6);
  const outDir = process.env.FAEHRTEN_SIM_OUT || join(tmpdir(), 'anyvo-faehrten-sim');
  const examTracks = process.env.FAEHRTEN_SIM_TRACKS?.split(',').map((s: string) => s.trim()).filter(Boolean);
  (enabled ? test : test.skip)(`Fährten-Simulator Matrix: ${group}`, async () => {
    const result = isSearchGroup(group) ? await runSearchGroup(group, seeds) : runGroup(group, seeds, examTracks);
    const reportPath = writeGroupResult(outDir, result);
    process.stdout.write(`\n[faehrten-sim] ${group}: ${result.runs} Läufe in ${result.elapsedS} s → ${reportPath}\n`);
    expect(result.runs).toBeGreaterThan(0);
  }, 3 * 60 * 60 * 1000);
}
