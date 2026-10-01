/** Manually recorded field ground truth, independent of detector output. */
export interface FieldTestProfile {
  id: string;
  name: string;
  route: string;
  expectedAngles: string;
  expectedObjects: number;
  note: string;
}

export const FIELD_TEST_PROFILES: readonly FieldTestProfile[] = [
  {
    id: '1fn',
    name: '1FN · normale Winkel',
    route: 'Start → ca. 5 Schritte → G1 → ca. 5 Schritte → rechts → ca. 5 Schritte → G2 → ca. 5 Schritte → links → ca. 10 Schritte → G3 → Ende',
    expectedAngles: 'R → L',
    expectedObjects: 3,
    note: 'Ground Truth aus dem realen Feldprotokoll; der alte Export erkannte nur R.',
  },
  {
    id: '2fn',
    name: '2FN · spitze und normale Winkel',
    route: 'Start → spitz rechts → G1 → spitz links → rechts → G2 → links → G3 / Ende',
    expectedAngles: 'SR → SL → R → L',
    expectedObjects: 3,
    note: 'Ground Truth aus dem realen Feldprotokoll; der alte Export enthielt nur zwei Gegenstände.',
  },
];

export function getFieldTestProfile(id: string | null): FieldTestProfile | null {
  return FIELD_TEST_PROFILES.find(profile => profile.id === id) ?? null;
}
