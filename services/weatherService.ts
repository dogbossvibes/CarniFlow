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
