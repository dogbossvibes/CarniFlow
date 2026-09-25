import { readFileSync } from 'fs';

// Customer Release Phase 8 — real device bug: a marker saved with
// material='filz' rendered "Ohne Material" on the Liegezeit screen even
// though the SQL contract (20260926090000) and the persistence pipeline
// (features/sync/services/remoteTrainingSyncService.ts,
// features/tracking/services/trackService.ts) already threaded `material`
// through correctly end to end. Root cause: app/track/liegen.tsx held its
// OWN, independent, hardcoded materialLabel() switch — a fourth copy of the
// material→label mapping (separate from the correctly i18n-keyed ones in
// app/track/[id].tsx, SegmentDetailSheet.tsx, MarkerDetailSheet.tsx) that
// predates 'filz' (added 15.09.2026, 7ead9de) and was never updated. Pure
// display bug — this file is a route/screen, not under features/tracking/**,
// components/tracking/**, lib/trackRecorder.ts, lib/trackGuidance.ts,
// hooks/useTrackStats.ts or types/tracking.ts, so fixing it touches no
// tracking algorithm.
const liegen = readFileSync('app/track/liegen.tsx', 'utf8');
const legen = readFileSync('app/track/legen.tsx', 'utf8');
const store = readFileSync('features/tracking/store/trackingStore.ts', 'utf8');

const ALL_MATERIALS = ['stoff', 'filz', 'holz', 'duebel', 'leder', 'plastik', 'metall', 'teppich', 'diverses'];
const LABEL: Record<string, string> = {
  holz: 'Holz', duebel: 'Dübel', stoff: 'Stoff', filz: 'Filz', leder: 'Leder',
  plastik: 'Plastik', metall: 'Metall', teppich: 'Teppich', diverses: 'Divers',
};

function materialLabelSwitchBody(): string {
  const m = liegen.match(/function materialLabel\([\s\S]*?\{([\s\S]*?)\n\}/);
  if (!m) throw new Error('materialLabel() not found in liegen.tsx');
  return m[1];
}

describe('Liegezeit materialLabel(): every MarkerMaterial value, filz included', () => {
  const body = materialLabelSwitchBody();

  it('MarkerMaterial (trackingStore.ts) and the Liegezeit label switch cover exactly the same 9 materials', () => {
    const tsUnion = Array.from(store.match(/export type MarkerMaterial =([\s\S]*?);/)![1].matchAll(/'([a-z_]+)'/g)).map(x => x[1]);
    expect([...tsUnion].sort()).toEqual([...ALL_MATERIALS].sort());
    for (const material of ALL_MATERIALS) {
      expect(body).toMatch(new RegExp(`case '${material}':\\s*return '${LABEL[material]}';`));
    }
  });

  it('filz specifically renders "Filz", matching every other material\'s pattern exactly', () => {
    expect(body).toMatch(/case 'filz':\s*return 'Filz';/);
  });

  it('a marker with no material (or any unrecognized value) still renders "Ohne Material" — no regression', () => {
    expect(body).toMatch(/default:\s*return 'Ohne Material';/);
  });
});

describe('legen.tsx: filz is a first-class, directly-committed Gegenstand selection (not stale/derived)', () => {
  it('GEGENSTAND_MATERIALS includes filz with its own icon and label, same shape as every other material', () => {
    expect(legen).toMatch(/\{ material: 'filz',\s*icon: '[a-z-]+',\s*label: 'Filz' \}/);
  });

  it('placeGegenstand passes the tapped material straight through as a function argument (no stale ref read before commit)', () => {
    // placeGegenstand(material) is called directly from the tap handler with
    // the picker's own `m.material` — not from a ref that could be stale —
    // and forwards that same `material` synchronously into addMarker.
    expect(legen).toMatch(/const placeGegenstand = useCallback\(\(material: MarkerMaterial\) => \{/);
    expect(legen).toMatch(/void rec\.addMarker\('gegenstand', \{ material \}\)/);
    expect(legen).toMatch(/onPress=\{\(\) => placeGegenstand\(m\.material\)\}/);
  });
});
