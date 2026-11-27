import * as Location from 'expo-location';
import { fetchMetCurrent } from './metWeather';

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

    const [geocode, c] = await Promise.all([
      Location.reverseGeocodeAsync({ latitude, longitude }),
      fetchMetCurrent(latitude, longitude),
    ]);

    const place = geocode[0];
    const location = place?.city ?? place?.district ?? place?.subregion ?? '';

    return {
      lat:        latitude,
      lng:        longitude,
      location,
      emoji:      wetterBeschreibung(c?.wmoCode ?? -1),
      temp:       c?.temperature != null ? Math.round(c.temperature) : null,
      humidity:   c?.humidity ?? null,
      windSpeed:  c?.windSpeed != null ? Math.round(c.windSpeed) : null,
      windDir:    c?.windDirection ?? null,
      windGusts:  c?.windGust != null ? Math.round(c.windGust) : null,
      cloudCover: c?.cloudCover ?? null,
    };
  } catch (e) {
    console.error('[WeatherService] live', e);
    return null;
  }
}

// ── Aktuelles Wetter zu einer bekannten Position (für die Fährten-Aufnahme) ──
// Nutzt eine bereits vorhandene GPS-Position (kein erneuter Permission-Prompt)
// und liefert die Werte + deutsche Wetterlage (MET-Symbol → WMO-Code).
export interface CurrentWeather {
  temperature:      number;   // °C
  windSpeed:        number;   // km/h
  /** Richtung, AUS der der Wind kommt (Grad, 0 = Nord); null, wenn der Dienst sie nicht liefert. */
  windDirection?:   number | null;
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
  const c = await fetchMetCurrent(lat, lng);
  if (!c || c.temperature == null) return null;
  const code = c.wmoCode ?? -1;
  return {
    temperature:      c.temperature,
    windSpeed:        c.windSpeed ?? 0,
    windDirection:    c.windDirection,
    humidity:         c.humidity ?? 0,
    weatherCode:      code,
    weatherCondition: weatherLabel(code),
  };
}

export async function getLocationAndWeather(): Promise<WeatherInfo> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { location: '', weather: '' };

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { latitude, longitude } = position.coords;

    const [geocode, c] = await Promise.all([
      Location.reverseGeocodeAsync({ latitude, longitude }),
      fetchMetCurrent(latitude, longitude),
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

    // Wetter (MET Norway über ANYVO-Funktion)
    if (!c || c.temperature == null) return { location: locationStr, weather: '' };
    const temp        = Math.round(c.temperature);
    const emoji       = wetterBeschreibung(c.wmoCode ?? -1);
    const weatherStr  = `${emoji} ${temp}°C`;

    return { location: locationStr, weather: weatherStr };
  } catch (e) {
    console.error('[WeatherService]', e);
    return { location: '', weather: '' };
  }
}
