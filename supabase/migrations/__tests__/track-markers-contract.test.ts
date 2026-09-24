/**
 * track_markers-Contract: die Check-Constraints müssen EXAKT die TypeScript-
 * Unions AngleKind / MarkerMaterial abbilden (features/tracking/store/
 * trackingStore.ts) — keine erfundenen, keine fehlenden Werte. NULL bleibt
 * erlaubt.
 *
 * Jeder Constraint kann über mehrere additive Migrationen neu gesetzt worden
 * sein (drop constraint if exists + add constraint, nie ALTER). Die zuletzt
 * (per Dateiname/Timestamp) geschriebene Version ist die aktuell gültige.
 * Dieser Test hält KEINE eigene, unabhängige Werteliste mehr — genau das war
 * die Ursache der 'filz'-Lücke (TypeScript erweitert am 15.09.2026 in
 * 7ead9de, aber 20260913220000 vom 13.09.2026 konnte das nicht mehr
 * enthalten, und ein hartcodiertes Test-Array hätte dieselbe Lücke haben
 * können). Stattdessen: TS-Union gegen die zuletzt maßgebliche SQL-Migration,
 * direkt.
 */
import { readdirSync, readFileSync } from 'fs';

const MIGRATIONS_DIR = 'supabase/migrations';
const store = readFileSync('features/tracking/store/trackingStore.ts', 'utf8');

function unionMembers(typeName: string): string[] {
  const m = store.match(new RegExp(`export type ${typeName} =([\\s\\S]*?);`));
  if (!m) throw new Error(`type ${typeName} not found`);
  return Array.from(m[1].matchAll(/'([a-z_]+)'/g)).map(x => x[1]);
}

// Latest (by filename, which sorts chronologically) migration that (re)defines
// the given constraint, plus its allowed-values array and full source.
function latestConstraintSource(constraint: string): { file: string; sql: string; values: string[] } {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
  let winner: { file: string; sql: string } | null = null;
  for (const file of files) {
    const sql = readFileSync(`${MIGRATIONS_DIR}/${file}`, 'utf8');
    if (new RegExp(`add constraint ${constraint}\\b`).test(sql)) winner = { file, sql };
  }
  if (!winner) throw new Error(`no migration defines constraint ${constraint}`);
  const m = winner.sql.match(new RegExp(`constraint ${constraint}[\\s\\S]*?array\\[([\\s\\S]*?)\\]::text\\[\\]`));
  if (!m) throw new Error(`constraint ${constraint} found in ${winner.file} but no array[...] value list`);
  const values = Array.from(m[1].matchAll(/'([a-z_]+)'/g)).map(x => x[1]);
  return { file: winner.file, sql: winner.sql, values };
}

describe('track_markers Check-Constraints = Client-Contract', () => {
  it('angle_kind: SQL constraint (latest-defining migration) matches AngleKind exactly', () => {
    const ts = unionMembers('AngleKind');
    const { values, file } = latestConstraintSource('track_markers_angle_kind_check');
    expect(file).toBe('20260913220000_track_markers_contract.sql');
    expect([...values].sort()).toEqual([...ts].sort());
  });

  it('material: SQL constraint (latest-defining migration) matches MarkerMaterial exactly', () => {
    const ts = unionMembers('MarkerMaterial');
    const { values, file } = latestConstraintSource('track_markers_material_check');
    expect(file).toBe('20260926090000_track_markers_material_filz.sql');
    expect([...values].sort()).toEqual([...ts].sort());
  });

  it('material: filz is present in both the TypeScript contract and the live SQL contract', () => {
    expect(unionMembers('MarkerMaterial')).toContain('filz');
    expect(latestConstraintSource('track_markers_material_check').values).toContain('filz');
  });

  it('NULL-Semantik explizit erhalten in beiden maßgeblichen Migrationen; marker_type-Constraint nicht angefasst', () => {
    const angle = latestConstraintSource('track_markers_angle_kind_check');
    const material = latestConstraintSource('track_markers_material_check');
    expect(angle.sql).toMatch(/check \(angle_kind is null or angle_kind = any/);
    expect(material.sql).toMatch(/check \(material is null or material = any/);
    expect(angle.sql).not.toContain('track_markers_marker_type_check');
    expect(material.sql).not.toContain('track_markers_marker_type_check');
  });

  it('material-fix migration (20260926090000) is additive-only: no data touched, idempotent, replaces nothing but this one constraint', () => {
    const { sql, file } = latestConstraintSource('track_markers_material_check');
    expect(file).toBe('20260926090000_track_markers_material_filz.sql');
    const code = sql.replace(/--.*$/gm, '');
    expect(code).not.toMatch(/\bupdate\b|\bdelete\b|\binsert\b/i);
    expect(code).not.toMatch(/drop\s+table|drop\s+function|create\s+table|enable row level security/i);
    expect(code).toMatch(/drop constraint if exists track_markers_material_check/);
    expect(code).not.toContain('track_markers_angle_kind_check');
  });
});
