jest.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
import { supabase } from '@/lib/supabase';
import { fetchDistractionWeather } from '../weather';
const invoke = supabase.functions.invoke as jest.Mock;
const hourIso = () => new Date(Date.now() - (Date.now() % 3_600_000)).toISOString();
it('keeps missing weather fields unknown instead of fabricating wind/humidity zeros', async () => {
 invoke.mockResolvedValue({ data: { hours: [{ time: hourIso(), temperature: 12 }] }, error: null });
 expect(await fetchDistractionWeather(47, 8)).toMatchObject({ temperature: 12, humidity: null, windSpeed: null, weatherCode: null });
});
it('maps the MET symbol to the stored WMO code', async () => {
 invoke.mockResolvedValue({ data: { hours: [{ time: hourIso(), temperature: 4, windSpeed: 9, humidity: 90, symbol: 'rainshowers_day' }] }, error: null });
 expect(await fetchDistractionWeather(47, 8)).toMatchObject({ temperature: 4, windSpeed: 9, humidity: 90, weatherCode: 81 });
});
it('does not block an offline recording on a weather failure', async () => {
 invoke.mockRejectedValue(new Error('offline'));
 expect(await fetchDistractionWeather(47, 8)).toBeNull();
});
