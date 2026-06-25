import * as Location from 'expo-location';

export interface WeatherInfo {
  location: string;
  weather:  string;
}

function wetterBeschreibung(code: number): string {
  if (code === 0)  return '☀️';
  if (code <= 2)   return '⛅';
  if (code === 3)  return '☁️';
  if (code <= 49)  return '🌫️';
  if (code <= 59)  return '🌦️';
  if (code <= 69)  return '🌧️';
  if (code <= 79)  return '❄️';
  if (code <= 84)  return '🌦️';
  if (code <= 94)  return '⛈️';
  return '🌡️';
}

export interface LiveConditions {
  lat:        number;
  lng:        number;
  location:   string;
  emoji:      string;
  temp:       number | null;   // °C
  humidity:   number | null;   // %
  windSpeed:  number | null;   // km/h
  windDir:    number | null;   // Grad (woher der Wind kommt)
  windGusts:  number | null;   // km/h
  cloudCover: number | null;   // %
}

// Erweiterte Live-Bedingungen (Wind, Feuchte, Böen, Bewölkung) + Koordinaten —
// für die Live-Conditions-Card im Fährten-Setup.
export async function getLiveConditions(): Promise<LiveConditions | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const { latitude, longitude } = position.coords;

    const [geocode, weatherRes] = await Promise.all([
      Location.reverseGeocodeAsync({ latitude, longitude }),
      fetch(
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${latitude}&longitude=${longitude}` +
        `&current=temperature_2m,relative_humidity_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m` +
        `&wind_speed_unit=kmh&timezone=auto`
      ),
    ]);

    const place = geocode[0];
    const location = place?.city ?? place?.district ?? place?.subregion ?? '';

    const data = await weatherRes.json();
    const c = data.current ?? {};
    const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

    return {
      lat:        latitude,
      lng:        longitude,
      location,
      emoji:      wetterBeschreibung(c.weather_code ?? -1),
      temp:       c.temperature_2m != null ? Math.round(c.temperature_2m) : null,
      humidity:   num(c.relative_humidity_2m),
      windSpeed:  c.wind_speed_10m != null ? Math.round(c.wind_speed_10m) : null,
      windDir:    num(c.wind_direction_10m),
      windGusts:  c.wind_gusts_10m != null ? Math.round(c.wind_gusts_10m) : null,
      cloudCover: num(c.cloud_cover),
    };
  } catch (e) {
    console.error('[WeatherService] live', e);
    return null;
  }
}

// ── Aktuelles Wetter zu einer bekannten Position (für die Fährten-Aufnahme) ──
// Nutzt eine bereits vorhandene GPS-Position (kein erneuter Permission-Prompt)
// und liefert exakte Werte + deutsche Wetterlage aus dem WMO-Code.
export interface CurrentWeather {
  temperature:      number;   // °C
  windSpeed:        number;   // km/h
  humidity:         number;   // %
  weatherCode:      number;   // WMO-Code
  weatherCondition: string;   // deutsche Wetterlage
}

const WMO_LABEL: Record<number, string> = {
  0: 'Klar',
  1: 'Überwiegend klar', 2: 'Teils bewölkt', 3: 'Bewölkt',
  45: 'Nebel', 48: 'Reifnebel',
  51: 'Leichter Niesel', 53: 'Niesel', 55: 'Starker Niesel',
  56: 'Gefrierender Niesel', 57: 'Gefrierender Niesel',
  61: 'Leichter Regen', 63: 'Regen', 65: 'Starker Regen',
  66: 'Gefrierender Regen', 67: 'Gefrierender Regen',
  71: 'Leichter Schneefall', 73: 'Schneefall', 75: 'Starker Schneefall',
  77: 'Schneegriesel',
  80: 'Leichte Regenschauer', 81: 'Regenschauer', 82: 'Heftige Regenschauer',
  85: 'Leichte Schneeschauer', 86: 'Schneeschauer',
  95: 'Gewitter', 96: 'Gewitter mit Hagel', 99: 'Gewitter mit Hagel',
};

export function weatherLabel(code: number): string {
  return WMO_LABEL[code] ?? 'Unbekannt';
}

// Holt das aktuelle Wetter für lat/lng. null bei Fehler/kein Netz — darf das
// Fährtenlegen nie blockieren.
export async function fetchCurrentWeather(lat: number, lng: number): Promise<CurrentWeather | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
      `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const c = json?.current;
    if (!c || typeof c.temperature_2m !== 'number') return null;
    const code = Number(c.weather_code);
    return {
      temperature:      c.temperature_2m,
      windSpeed:        c.wind_speed_10m ?? 0,
      humidity:         c.relative_humidity_2m ?? 0,
      weatherCode:      code,
      weatherCondition: weatherLabel(code),
    };
  } catch {
    return null;
  }
}

export async function getLocationAndWeather(): Promise<WeatherInfo> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { location: '', weather: '' };

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { latitude, longitude } = position.coords;

    const [geocode, weatherRes] = await Promise.all([
      Location.reverseGeocodeAsync({ latitude, longitude }),
      fetch(
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${latitude}&longitude=${longitude}` +
        `&current=temperature_2m,weather_code&timezone=auto`
      ),
    ]);

    // Ortsname
    const place   = geocode[0];
    const city    = place?.city ?? place?.district ?? place?.subregion ?? '';
    const country = place?.country ?? '';
    const isChDE  = country === 'Switzerland' || country === 'Schweiz' ||
                    country === 'Germany'     || country === 'Deutschland' ||
                    country === 'Austria'     || country === 'Österreich';
    const locationStr = city
      ? isChDE ? city : `${city}, ${country}`
      : '';

    // Wetter (Open-Meteo — kostenlos, kein API-Key)
    const data        = await weatherRes.json();
    const temp        = Math.round(data.current.temperature_2m);
    const emoji       = wetterBeschreibung(data.current.weather_code);
    const weatherStr  = `${emoji} ${temp}°C`;

    return { location: locationStr, weather: weatherStr };
  } catch (e) {
    console.error('[WeatherService]', e);
    return { location: '', weather: '' };
  }
}
