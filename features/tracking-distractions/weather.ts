import type { DistractionWeather } from './model';
/** Same provider as main-track weather; absent measurements remain unknown, never zero. */
export async function fetchDistractionWeather(lat: number, lng: number): Promise<DistractionWeather | null> {
 const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
 try {
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&wind_speed_unit=kmh`, { signal: controller.signal });
  if (!response.ok) return null; const body = await response.json(); const c = body?.current;
  if (!c || typeof c !== 'object') return null;
  const number = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;
  return { recordedAtMs: Date.now(), temperature: number(c.temperature_2m, -100, 100), windSpeed: number(c.wind_speed_10m, 0, 500), humidity: number(c.relative_humidity_2m, 0, 100), weatherCode: Number.isInteger(c.weather_code) ? number(c.weather_code, 0, 99) : null };
 } catch { return null; } finally { clearTimeout(timer); }
}
