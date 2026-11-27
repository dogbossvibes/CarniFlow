import { readFileSync } from 'fs';
import { join } from 'path';
import {
  MAX_HOURS, MET_USER_AGENT, cacheSecondsFromExpires, cellKey, mapMetForecast, parseTrackWeatherRequest,
} from '../_shared/met-forecast';

const NOW = Date.parse('2026-04-15T08:20:00Z');
const step = (time: string, hourly = true) => ({
  time,
  data: {
    instant: { details: { air_temperature: 11.3, relative_humidity: 72.1, wind_speed: 5, wind_speed_of_gust: 10, wind_from_direction: 250, cloud_area_fraction: 80, ultraviolet_index_clear_sky: 2.4 } },
    ...(hourly ? { next_1_hours: { summary: { symbol_code: 'lightrain' }, details: { precipitation_amount: 0.4 } } } : { next_6_hours: {} }),
  },
});

describe('track-weather – Eingabe', () => {
  it('rundet auf 2 Dezimalen und prüft Bereiche', () => {
    expect(parseTrackWeatherRequest({ lat: 46.948123, lng: 7.444119 })).toEqual({ lat: 46.95, lng: 7.44 });
    expect(parseTrackWeatherRequest({ lat: 91, lng: 0 })).toBeNull();
    expect(parseTrackWeatherRequest({ lat: '46', lng: 7 })).toBeNull();
    expect(parseTrackWeatherRequest(null)).toBeNull();
    expect(cellKey(46.95, 7.4)).toBe('46.95,7.40');
  });
});

describe('track-weather – MET-Antwort', () => {
  it('rechnet m/s in km/h um, beginnt bei der laufenden Stunde, stoppt beim 6-h-Teil', () => {
    const body = { properties: { timeseries: [
      step('2026-04-15T07:00:00Z'), step('2026-04-15T08:00:00Z'), step('2026-04-15T09:00:00Z'), step('2026-04-15T12:00:00Z', false), step('2026-04-15T13:00:00Z'),
    ] } };
    const hours = mapMetForecast(body, NOW);
    expect(hours.map(h => h.time)).toEqual(['2026-04-15T08:00:00.000Z', '2026-04-15T09:00:00.000Z']);
    expect(hours[0]).toMatchObject({ windSpeed: 18, windGust: 36, temperature: 11.3, precipitation: 0.4, symbol: 'lightrain', thunderProbability: null });
  });
  it('fehlerhafte Werte werden null, nie 0; höchstens MAX_HOURS (72) Stunden', () => {
    const bad = step('2026-04-15T08:00:00Z');
    (bad.data.instant.details as Record<string, unknown>).wind_speed = 'x';
    expect(mapMetForecast({ properties: { timeseries: [bad] } }, NOW)[0].windSpeed).toBeNull();
    const many = Array.from({ length: 90 }, (_, i) => step(new Date(Date.parse('2026-04-15T08:00:00Z') + i * 3_600_000).toISOString()));
    expect(MAX_HOURS).toBe(72);
    expect(mapMetForecast({ properties: { timeseries: many } }, NOW)).toHaveLength(MAX_HOURS);
    expect(mapMetForecast({}, NOW)).toEqual([]);
  });
  it('Cache-Dauer aus Expires, begrenzt', () => {
    expect(cacheSecondsFromExpires(null, NOW)).toBe(900);
    expect(cacheSecondsFromExpires(new Date(NOW + 30 * 60_000).toUTCString(), NOW)).toBe(1800);
    expect(cacheSecondsFromExpires(new Date(NOW + 10 * 3_600_000).toUTCString(), NOW)).toBe(7200);
  });
});

describe('track-weather – Funktion', () => {
  const src = readFileSync(join(__dirname, '../track-weather/index.ts'), 'utf8');
  it('setzt den MET-User-Agent, prüft die Eingabe und loggt keine Standorte', () => {
    expect(MET_USER_AGENT).toMatch(/^ANYVO\/.+anyvo\.app/);
    expect(src).toContain("'User-Agent': MET_USER_AGENT");
    expect(src).toContain('parseTrackWeatherRequest(');
    expect(src).not.toMatch(/console\.(log|info|warn|error)/);
  });
});
