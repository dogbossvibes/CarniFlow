import { buildLocalTrackSessionInput } from '@/features/tracking/utils/localTrackSession';

describe('buildLocalTrackSessionInput — vollständige NOT-NULL-Metadaten, keine Dummies', () => {
  const base = { localId: 'uuid-1', ownerId: 'owner-1', dogId: 'dog-1', startedAt: '2026-08-11T10:00:00.000Z' };

  it('führende UUID + owner + dog + Remote-Pflichtfelder gesetzt', () => {
    const out = buildLocalTrackSessionInput(base);
    expect(out.local_id).toBe('uuid-1');
    expect(out.user_id).toBe('owner-1');   // = owner_id (auth.uid())
    expect(out.dog_id).toBe('dog-1');       // NOT NULL remote
    expect(out.category).toBe('IGP');       // NOT NULL / CHECK remote
    expect(out.type).toBe('track');
    expect(out.status).toBe('active');
    expect(out.title).toBe('Fährte');
    expect(out.started_at).toBe(base.startedAt);
  });

  it('Metadaten werden 1:1 übernommen (keine erfundenen Werte)', () => {
    const out = buildLocalTrackSessionInput({ ...base, meta: {
      surfaceTypes: ['Wiese'], terrainConditions: ['Nass'], temperature: 12.3,
      weatherCondition: 'bewölkt', windSpeed: 4, humidity: 80, latitude: 47.1, longitude: 8.2,
    } });
    expect(out.surface_types).toEqual(['Wiese']);
    expect(out.terrain_conditions).toEqual(['Nass']);
    expect(out.temperature).toBe(12.3);
    expect(out.weather_condition).toBe('bewölkt');
    expect(out.wind_speed).toBe(4);
    expect(out.humidity).toBe(80);
    expect(out.latitude).toBe(47.1);
    expect(out.longitude).toBe(8.2);
  });

  it('ohne Meta: null statt Dummy; dog_id=null bleibt null', () => {
    const out = buildLocalTrackSessionInput({ ...base, dogId: null });
    expect(out.dog_id).toBeNull();
    expect(out.surface_types).toBeNull();
    expect(out.latitude).toBeNull();
    expect(out.weather_condition).toBeNull();
  });
});
