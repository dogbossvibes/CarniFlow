import { fetchDistractionWeather } from '../weather';
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
it('keeps missing weather fields unknown instead of fabricating wind/humidity zeros', async () => {
 global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ current: { temperature_2m: 12 } }) })) as never;
 expect(await fetchDistractionWeather(47, 8)).toMatchObject({ temperature: 12, humidity: null, windSpeed: null, weatherCode: null });
});
it('does not block an offline recording on a weather failure', async () => {
 global.fetch = jest.fn(async () => { throw new Error('offline'); }) as never;
 expect(await fetchDistractionWeather(47, 8)).toBeNull();
});
