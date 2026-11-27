import type { DistractionWeather } from './model';
import { fetchMetCurrent } from '@/services/metWeather';
/** Same provider as main-track weather (MET Norway via ANYVO); absent measurements remain unknown, never zero. */
export async function fetchDistractionWeather(lat: number, lng: number): Promise<DistractionWeather | null> {
 const c = await fetchMetCurrent(lat, lng);
 if (!c) return null;
 return { recordedAtMs: Date.now(), temperature: c.temperature, windSpeed: c.windSpeed, humidity: c.humidity, weatherCode: c.wmoCode };
}
