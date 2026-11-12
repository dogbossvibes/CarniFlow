import type { RawMeasurement } from './rawMeasurementJournal';

/** Non-finite timestamps are evidence too; encode their actual value explicitly,
 * never replace them with a fabricated timestamp or JSON's implicit null. */
export function encodeRawMeasurement(record: RawMeasurement): string {
  return JSON.stringify(record, (_key, value) => typeof value === 'number' && !Number.isFinite(value)
    ? { $nonFinite: String(value) } : value);
}
export function decodeRawMeasurement(payload: string): RawMeasurement {
  return JSON.parse(payload, (_key, value) => {
    if (value && typeof value === 'object' && Object.keys(value).length === 1) {
      if (value.$nonFinite === 'NaN') return Number.NaN;
      if (value.$nonFinite === 'Infinity') return Number.POSITIVE_INFINITY;
      if (value.$nonFinite === '-Infinity') return Number.NEGATIVE_INFINITY;
    }
    return value;
  }) as RawMeasurement;
}
export const rawTimestampSqlValue = (value: number): number | string => Number.isFinite(value) ? value : String(value);
