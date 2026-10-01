import { FIELD_TEST_PROFILES, getFieldTestProfile } from '@/features/tracking/utils/fieldTestProfiles';

describe('reale Feldprotokolle', () => {
  it.each([
    ['1fn', 'R → L', 3],
    ['2fn', 'SR → SL → R → L', 3],
  ])('%s zeigt die unabhängig protokollierte Ground Truth', (id, angles, objects) => {
    const profile = getFieldTestProfile(id);
    expect(profile?.expectedAngles).toBe(angles);
    expect(profile?.expectedObjects).toBe(objects);
    expect(profile?.route).toContain('G3');
  });

  it('zeigt ohne Auswahl keine vermeintlich verbindliche Route', () => {
    expect(getFieldTestProfile(null)).toBeNull();
    expect(new Set(FIELD_TEST_PROFILES.map(profile => profile.id)).size).toBe(FIELD_TEST_PROFILES.length);
  });
});
