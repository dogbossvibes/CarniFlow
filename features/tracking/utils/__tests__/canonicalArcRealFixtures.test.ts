/**
 * Canonical Reference Progress — Real-Fixture-Regression.
 *
 * Reale QA-v2.1-Exporte (read-only Kopien, identifiziert per sessionId). Für
 * jeden VORHANDENEN Marker: gespeicherter distance_from_start vs. kanonische
 * Bogenlänge auf der persistierten Lay-Linie (`points` = SQLite point_type='lay'
 * = genau die Linie, die die Absuche als laidPoints verwendet). Marker-x/y und
 * `points` teilen im Export denselben Ursprung (points[0]).
 *
 * KEINE neue Corner Detection — nur vorhandene Marker gegen vorhandene Linie.
 */
import * as fs from 'fs';
import * as path from 'path';
import { buildSearchEventArcs } from '@/features/tracking/utils/canonicalArc';
import { buildArc, type LL } from '@/features/tracking/utils/searchGeometry';

const FIX = path.join(__dirname, 'fixtures', 'realFieldV21');
const LAT0 = 47.0, LNG0 = 8.0;
const M_PER_LAT = 111320;
const M_PER_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const toLL = (x: number, y: number): LL => ({ latitude: LAT0 + y / M_PER_LAT, longitude: LNG0 + x / M_PER_LNG });

interface Run { id: string; file: string; sessionId: string }
const RUNS: Run[] = [
  { id: 'Lauf 1',  file: 'lauf1-qa-a3055da3.json',  sessionId: 'qa-a3055da3' },
  { id: 'Lauf 2',  file: 'lauf2-qa-848ea966.json',  sessionId: 'qa-848ea966' },
  { id: 'Lauf 3',  file: 'lauf3-qa-1c341a07.json',  sessionId: 'qa-1c341a07' },
  { id: 'Lauf 7',  file: 'lauf7-qa-3e78df58.json',  sessionId: 'qa-3e78df58' },
  { id: 'Lauf 8',  file: 'lauf8-qa-ef808e24.json',  sessionId: 'qa-ef808e24' },
  { id: 'Lauf 9',  file: 'lauf9-qa-01e12e75.json',  sessionId: 'qa-01e12e75' },
  { id: 'Lauf 10', file: 'lauf10-qa-5637ad58.json', sessionId: 'qa-5637ad58' },
  { id: 'R1',      file: 'r1-qa-03d970ff.json',     sessionId: 'qa-03d970ff' },
];

// Golden-Pins: von genau diesem Code auf den realen Exporten berechnet (Regression,
// KEINE Ground Truth). Toleranz 0,05 m.
const EXPECTED: Record<string, { angleKind: string; storedM: number; canonicalM: number }[]> = {
  'qa-a3055da3': [{ angleKind: 'rechts',      storedM: 7.8,  canonicalM: 7.78 }],
  'qa-848ea966': [{ angleKind: 'spitz_links', storedM: 4.9,  canonicalM: 5.53 }, { angleKind: 'spitz_links', storedM: 10.3, canonicalM: 9.99 }],
  'qa-01e12e75': [{ angleKind: 'rechts',      storedM: 4.8,  canonicalM: 7.76 }],
  'qa-5637ad58': [{ angleKind: 'rechts',      storedM: 5.7,  canonicalM: 9.23 }],
  'qa-03d970ff': [{ angleKind: 'links',       storedM: 11.4, canonicalM: 12.05 }],
};

describe('Canonical arcM auf realen Feld-Exporten', () => {
  const rows: string[] = [];
  for (const run of RUNS) {
    it(`${run.id} (${run.sessionId})`, () => {
      const j = JSON.parse(fs.readFileSync(path.join(FIX, run.file), 'utf8'));
      expect(j.sessionId).toBe(run.sessionId);
      const line: LL[] = j.points.map((p: { x: number; y: number }) => toLL(p.x, p.y));
      const total = buildArc(line).total;
      const markers = (j.markers as { type: string; angleKind: string | null; x: number | null; y: number | null; atM: number | null }[])
        .map((m, i) => ({
          id: `m${i}`, type: m.type, angleKind: m.angleKind,
          ...(m.x != null && m.y != null ? { lat: toLL(m.x, m.y).latitude, lng: toLL(m.x, m.y).longitude } : { lat: null, lng: null }),
          distance_from_start: m.atM,
        }));
      const arcs = buildSearchEventArcs(markers, line);
      if (markers.length === 0) rows.push(`${run.id.padEnd(8)} ${run.sessionId}  — keine Marker (Linie ${total.toFixed(2)} m)`);
      const exp = EXPECTED[run.sessionId] ?? [];
      expect(markers.length).toBe(exp.length);
      markers.forEach((m, i) => {
        const a = arcs[m.id];
        expect(a.source).toBe('projected');
        expect(a.arcM as number).toBeGreaterThanOrEqual(0);
        expect(a.arcM as number).toBeLessThanOrEqual(total + 1e-9);
        const delta = (a.arcM as number) - (m.distance_from_start as number);
        rows.push(
          `${run.id.padEnd(8)} ${run.sessionId}  ${String(m.angleKind).padEnd(12)} stored=${(m.distance_from_start as number).toFixed(1).padStart(5)} m` +
          `  canonical=${(a.arcM as number).toFixed(2).padStart(6)} m  Δ=${(delta >= 0 ? '+' : '') + delta.toFixed(2)} m` +
          `  offLine=${(a.offLineM as number).toFixed(2)} m  Linie=${total.toFixed(2)} m`,
        );
        expect(m.angleKind).toBe(exp[i].angleKind);
        expect(m.distance_from_start).toBe(exp[i].storedM);
        expect(Math.abs((a.arcM as number) - exp[i].canonicalM)).toBeLessThanOrEqual(0.05);
      });
    });
  }
  afterAll(() => {
    console.log('\n══ Real-Fixture: stored distance_from_start vs. canonical arcM ══\n' + rows.join('\n'));
  });
});
