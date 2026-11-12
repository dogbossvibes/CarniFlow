import type { DogHealthEntryRow } from '@/services/dogHub';
import { weightMeasurements } from './health';

export type WeightPeriod = 'month' | 'quarter' | 'year' | 'all';
export type WeightMeasurement = DogHealthEntryRow & { weight_kg: number };
export type WeightChartPoint = { entry: WeightMeasurement; day: number; x: number; y: number };

/** Date-only values stay calendar days, independent of timezone and DST. */
export function weightDay(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]) - 1, day = Number(match[3]);
  const result = Date.UTC(year, month, day);
  const date = new Date(result);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day ? result : null;
}

export function journalMeasurements(entries: DogHealthEntryRow[]): WeightMeasurement[] {
  // Reuse the existing definition/order of a recorded measurement. Never
  // merge equal weights or same-day records; ids and all original fields stay intact.
  return weightMeasurements(entries).filter((entry): entry is WeightMeasurement => entry.weight_kg !== null);
}

export function weightSeries(entries: WeightMeasurement[], period: WeightPeriod, today = new Date()) {
  const end = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const months = period === 'month' ? 1 : period === 'quarter' ? 3 : 12;
  const start = new Date(Date.UTC(today.getFullYear(), today.getMonth() - months, 1));
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(today.getDate(), lastDay));
  return entries.flatMap(entry => {
    const day = weightDay(entry.entry_date);
    return day !== null && (period === 'all' || (day >= start.getTime() && day <= end)) ? [{ entry, day }] : [];
  }).sort((a, b) => a.day - b.day);
}

/** Kilogram axis and elapsed calendar time, without score limits or smoothing. */
export function weightChart(series: ReturnType<typeof weightSeries>, width: number, height: number, fontScale = 1) {
  const left = Math.min(width * 0.3, 42 * fontScale), right = 14;
  const top = 18, bottom = height - 30 * fontScale;
  if (!series.length || !Number.isFinite(width) || width < 80 || height <= 60) return null;
  const values = series.map(point => point.entry.weight_kg);
  const min = Math.min(...values), max = Math.max(...values);
  const padding = Math.max((max - min) * 0.15, Math.abs(max) * 0.005, 0.05);
  const step = 10 ** Math.floor(Math.log10(Math.max(max - min, 0.1)));
  const lower = Math.floor((min >= 0 ? Math.max(0, min - padding) : min - padding) / step) * step;
  const upper = Math.ceil((max + padding) / step) * step;
  const first = series[0].day, last = series[series.length - 1].day;
  const y = (value: number) => top + (upper - value) / (upper - lower) * (bottom - top);
  const points: WeightChartPoint[] = series.map(point => ({
    ...point,
    x: left + (last === first ? 0.5 : (point.day - first) / (last - first)) * (width - left - right),
    y: y(point.entry.weight_kg),
  }));
  return {
    points, left, right: width - right, bottom,
    ticks: [lower, (lower + upper) / 2, upper].map(value => ({ value, y: y(value) })),
    path: points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' '),
  };
}
