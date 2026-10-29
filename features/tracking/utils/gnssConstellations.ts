import type { GnssStatusAndroid } from '../native/types';
type Systems = NonNullable<GnssStatusAndroid['constellations']>;
const names = new Set(['GPS', 'GLONASS', 'GALILEO', 'BEIDOU', 'QZSS', 'SBAS', 'NAVIC', 'UNKNOWN']);
/** Fail closed on partial/malformed bridge payloads. Counts refer to tracked
 * signals reported by Android; never infer hardware support or positioning accuracy.
 */
export function normalizeConstellations(value: unknown, observed: number, used: number): Systems | undefined {
  if (!Array.isArray(value) || value.length > names.size) return undefined;
  const seen = new Set<string>();
  const result: Systems = [];
  for (const row of value) {
    if (!row || !names.has(row.constellation) || seen.has(row.constellation)
      || !Number.isSafeInteger(row.observed) || row.observed < 1
      || !Number.isSafeInteger(row.used) || row.used < 0 || row.used > row.observed
      || !Array.isArray(row.frequenciesHz) || row.frequenciesHz.length > 32
      || row.frequenciesHz.some((v: unknown) => typeof v !== 'number' || !Number.isFinite(v) || v <= 0)) return undefined;
    seen.add(row.constellation);
    result.push({ constellation: row.constellation, observed: row.observed, used: row.used,
      frequenciesHz: [...new Set<number>(row.frequenciesHz)].sort((a, b) => a - b) });
  }
  if (result.reduce((n, r) => n + r.observed, 0) !== observed || result.reduce((n, r) => n + r.used, 0) !== used) return undefined;
  return result;
}
export function constellationLabel(name: string): string {
  return ({ GALILEO: 'Galileo', BEIDOU: 'BeiDou', NAVIC: 'NavIC', UNKNOWN: 'Unbekannt' } as Record<string, string>)[name] ?? name;
}
