/**
 * track_markers-Contract: die neuen Check-Constraints müssen EXAKT die
 * TypeScript-Unions AngleKind / MarkerMaterial / MarkerType abbilden
 * (features/tracking/store/trackingStore.ts) — keine erfundenen, keine
 * fehlenden Werte. NULL bleibt erlaubt.
 */
import { readFileSync } from 'fs';

const sql = readFileSync('supabase/migrations/20260913220000_track_markers_contract.sql', 'utf8');
const store = readFileSync('features/tracking/store/trackingStore.ts', 'utf8');

function unionMembers(typeName: string): string[] {
  const m = store.match(new RegExp(`export type ${typeName} =([\\s\\S]*?);`));
  if (!m) throw new Error(`type ${typeName} not found`);
  return Array.from(m[1].matchAll(/'([a-z_]+)'/g)).map(x => x[1]);
}
function sqlArray(constraint: string): string[] {
  const m = sql.match(new RegExp(`constraint ${constraint}[\\s\\S]*?array\\[([\\s\\S]*?)\\]::text\\[\\]`));
  if (!m) throw new Error(`constraint ${constraint} not found`);
  return Array.from(m[1].matchAll(/'([a-z_]+)'/g)).map(x => x[1]);
}

describe('track_markers Check-Constraints = Client-Contract', () => {
  it('angle_kind: exakt AngleKind (10 Werte)', () => {
    const ts = unionMembers('AngleKind');
    expect(ts).toEqual(['links', 'rechts', 'spitz_links', 'spitz_rechts', 'spitz', 'absatz', 'abriss', 'gw', 'ow', 'bw']);
    expect(sqlArray('track_markers_angle_kind_check').sort()).toEqual([...ts].sort());
  });
  it('material: exakt MarkerMaterial (8 Werte)', () => {
    const ts = unionMembers('MarkerMaterial');
    expect(ts).toEqual(['stoff', 'holz', 'duebel', 'leder', 'plastik', 'metall', 'teppich', 'diverses']);
    expect(sqlArray('track_markers_material_check').sort()).toEqual([...ts].sort());
  });
  it('NULL-Semantik explizit erhalten; marker_type-Constraint nicht angefasst; keine Datenmigration', () => {
    expect(sql).toMatch(/check \(angle_kind is null or angle_kind = any/);
    expect(sql).toMatch(/check \(material is null or material = any/);
    expect(sql).not.toContain('track_markers_marker_type_check');
    const code = sql.replace(/--.*$/gm, '');
    expect(code).not.toMatch(/\bupdate\b|\bdelete\b|\binsert\b/i);
    expect(code).toMatch(/drop constraint if exists track_markers_angle_kind_check/);
    expect(code).toMatch(/drop constraint if exists track_markers_material_check/);
  });
});
