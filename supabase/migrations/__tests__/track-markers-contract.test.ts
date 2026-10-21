/**
 * track_markers-Contract: historische Migrationen und der später geprüfte
 * Operations-Override bleiben getrennt. Der heutige Materialvertrag muss die
 * TypeScript-Union vollständig enthalten; NULL bleibt erlaubt.
 *
 * Jeder Constraint kann über mehrere additive Migrationen neu gesetzt worden
 * sein (drop constraint if exists + add constraint, nie ALTER). Die zuletzt
 * (per Dateiname/Timestamp) geschriebene Version ist die aktuell gültige.
 * Der feste Neuner-Vertrag gilt nur für die historische filz-Migration.
 * Die heutige TypeScript-Union wird direkt mit dem bytegenau gepinnten,
 * geprüften Operations-CHECK verglichen, damit neue Materialien nicht durch
 * ein nachgepflegtes unabhängiges Array oder bloßes Filtern verschwinden.
 */
import { readdirSync, readFileSync } from 'fs';
import { createHash } from 'node:crypto';
import { join } from 'path';

const MIGRATIONS_DIR = 'supabase/migrations';
const store = readFileSync('features/tracking/store/trackingStore.ts', 'utf8');
// Historical migrations remain a nine-material contract. The reviewed and
// deployed 2026-10-18 operation adds ball/gummi without rewriting history.
// Source: marker-materials-05-20261018-r4/candidate.sql
// Full-source SHA256: 50a39528f0867bd2df23014e1c046ccf9f570732c3e90f005e1c0a8a47b6dc58.
// Fixture is EXACTLY lines17–18, not an executable migration or live DB query.
const historicMaterials = ['stoff', 'filz', 'holz', 'duebel', 'leder', 'plastik', 'metall', 'teppich', 'diverses'];
const operationsDDL = readFileSync(join(__dirname, 'fixtures/marker-materials-operations-20261018.sql.txt'), 'utf8');

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

  it('material: latest historical migration preserves its exact nine-material contract', () => {
    const { values, file } = latestConstraintSource('track_markers_material_check');
    expect(file).toBe('20260926090000_track_markers_material_filz.sql');
    expect([...values].sort()).toEqual([...historicMaterials].sort());
  });

  it('material: reviewed deployed operation matches every current MarkerMaterial including ball/gummi', () => {
    expect(createHash('sha256').update(operationsDDL).digest('hex'))
      .toBe('66b00a81a65efcbc1e3923e8b586d10635830362fd16ed4b5c2234cd369ab3fe');
    const list = operationsDDL.match(/array\[([\s\S]*?)\]::text\[\]/);
    expect(list).not.toBeNull();
    const values = Array.from(list![1].matchAll(/'([a-z_]+)'/g)).map(value => value[1]);
    expect([...values].sort()).toEqual([...unionMembers('MarkerMaterial')].sort());
    expect(values).toEqual(expect.arrayContaining(['ball', 'gummi', 'filz']));
    expect(operationsDDL).toContain('check(material is null or material=any(');
    expect(operationsDDL).not.toMatch(/\bupdate\b|\bdelete\b|\binsert\b/i);
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
