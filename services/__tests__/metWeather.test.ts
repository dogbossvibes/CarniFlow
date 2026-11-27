jest.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
import { supabase } from '@/lib/supabase';
import { fetchMetCurrent, metSymbolToWmo, pickCurrentHour } from '../metWeather';
import { fetchCurrentWeather } from '../weatherService';
import { isRainyWeatherCode } from '@/features/tracking/utils/rainMode';

const invoke = supabase.functions.invoke as jest.Mock;
const H = 3_600_000;
const hourStart = (ms: number) => ms - (ms % H);

beforeEach(() => jest.clearAllMocks());

describe('metSymbolToWmo', () => {
  it.each([
    ['clearsky_day', 0], ['fair_night', 1], ['partlycloudy_polartwilight', 2], ['cloudy', 3], ['fog', 45],
    ['lightrain', 61], ['rain', 63], ['heavyrain', 65], ['sleet', 63],
    ['lightrainshowers_day', 80], ['heavyrainshowers_night', 82],
    ['lightsnow', 71], ['heavysnow', 75], ['snowshowers_day', 85], ['heavysnowshowers_day', 86],
    ['rainandthunder', 95], ['lightssnowshowersandthunder_day', 95],
  ])('%s → %s', (sym, code) => expect(metSymbolToWmo(sym)).toBe(code));
  it('unbekannt bleibt null', () => {
    expect(metSymbolToWmo('neu_unbekannt')).toBeNull();
    expect(metSymbolToWmo(null)).toBeNull();
    expect(metSymbolToWmo('')).toBeNull();
  });
  it('Regenmodus greift bei Regen, Schneeregen und Gewitter, nicht bei Schnee', () => {
    for (const s of ['lightrain', 'rainshowers_day', 'sleet', 'rainandthunder']) expect(isRainyWeatherCode(metSymbolToWmo(s))).toBe(true);
    for (const s of ['snow', 'snowshowers_day', 'cloudy', 'fog']) expect(isRainyWeatherCode(metSymbolToWmo(s))).toBe(false);
  });
});

describe('pickCurrentHour', () => {
  const now = Date.UTC(2026, 10, 27, 9, 20);
  it('nimmt die laufende Stunde, nicht vergangene', () => {
    const raw = { hours: [
      { time: new Date(Date.UTC(2026, 10, 27, 8)).toISOString(), temperature: 1 },
      { time: new Date(Date.UTC(2026, 10, 27, 10)).toISOString(), temperature: 3 },
      { time: new Date(Date.UTC(2026, 10, 27, 9)).toISOString(), temperature: 2, windDirection: 270, symbol: 'cloudy' },
    ] };
    expect(pickCurrentHour(raw, now)).toMatchObject({ temperature: 2, windDirection: 270, wmoCode: 3 });
  });
  it('verwirft Unbrauchbares', () => {
    expect(pickCurrentHour(null, now)).toBeNull();
    expect(pickCurrentHour({ hours: [{ time: 'x' }, null] }, now)).toBeNull();
    expect(pickCurrentHour({ hours: [{ time: new Date(now).toISOString(), temperature: 'warm', humidity: 140 }] }, now))
      .toMatchObject({ temperature: null, humidity: null });
  });
});

describe('fetchMetCurrent', () => {
  it('sendet nur auf ~1 km gerundete Koordinaten', async () => {
    invoke.mockResolvedValue({ data: { hours: [] }, error: null });
    await fetchMetCurrent(46.948123, 7.444119);
    expect(invoke).toHaveBeenCalledWith('track-weather', { body: { lat: 46.95, lng: 7.44 } });
  });
  it('Fehler und Zeitüberschreitung → null', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('401') });
    expect(await fetchMetCurrent(46.9, 7.4)).toBeNull();
    invoke.mockReturnValue(new Promise(() => {}));
    expect(await fetchMetCurrent(46.9, 7.4, 20)).toBeNull();
    expect(await fetchMetCurrent(NaN, 7.4)).toBeNull();
  });
});

describe('fetchCurrentWeather (Lege-Screen)', () => {
  it('liefert das bisherige Format mit deutscher Wetterlage', async () => {
    invoke.mockResolvedValue({ data: { hours: [{ time: new Date(hourStart(Date.now())).toISOString(), temperature: 5.4, windSpeed: 12, windDirection: 200, humidity: 88, symbol: 'lightrain' }] }, error: null });
    expect(await fetchCurrentWeather(46.95, 7.44)).toEqual({
      temperature: 5.4, windSpeed: 12, windDirection: 200, humidity: 88, weatherCode: 61, weatherCondition: 'Leichter Regen',
    });
  });
  it('ohne Temperatur oder offline → null, blockiert nichts', async () => {
    invoke.mockResolvedValue({ data: { hours: [{ time: new Date(hourStart(Date.now())).toISOString(), windSpeed: 3 }] }, error: null });
    expect(await fetchCurrentWeather(46.95, 7.44)).toBeNull();
    invoke.mockRejectedValue(new Error('offline'));
    expect(await fetchCurrentWeather(46.95, 7.44)).toBeNull();
  });
});
