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
