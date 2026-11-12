import { readFileSync } from 'fs';
import { computeTrend } from '@/services/analytics/trends';
import type { TrendPoint } from '@/types/analytics';

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
const point = (n: number, score: number): TrendPoint =>
  ({ date: daysAgo(n), score, motivation: 0, konzentration: 0, praezision: 0 });

describe('Analyse — Zeiträume 7/30/90 Tage', () => {
  const points = [point(80, 40), point(60, 50), point(20, 60), point(3, 80)];

  it('90 Tage rechnet über mehr Einheiten als 30 Tage', () => {
    expect(computeTrend(points, 7).sessions).toBe(1);
    expect(computeTrend(points, 30).sessions).toBe(2);
    expect(computeTrend(points, 90).sessions).toBe(4);
  });

  it('der Bildschirm nutzt für 90T den 90-Tage-Trend, nicht den 30-Tage-Wert', () => {
    const screen = readFileSync('app/(tabs)/analytics.tsx', 'utf8');
    expect(screen).toContain('const activeTrend = period === 7 ? trend7 : period === 30 ? trend30 : trend90;');
    expect(readFileSync('hooks/useAnalytics.ts', 'utf8')).toContain('const trend90 = computeTrend(trendPoints, 90);');
  });

  it('ohne Auswertung zeigt der Bildschirm keine Nullwerte, sondern die Einladung', () => {
    const screen = readFileSync('app/(tabs)/analytics.tsx', 'utf8');
    expect(screen).toContain('{hasAnalysis && (');
    expect(screen).toContain('{!hasAnalysis && !aiLoading && (');
  });
});
