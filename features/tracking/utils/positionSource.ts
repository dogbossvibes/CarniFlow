import * as Location from 'expo-location';
import { startPositionStream, type StreamSample } from '@/features/tracking/utils/positionStream';
import { precisionLocationClient as client } from '@/features/tracking/native/precisionLocationClient';

// Zentrale Positionsquelle für die Fährtenaufnahme.
//
// Reihenfolge: natives Precision-Modul (via positionStream) → bei fehlendem Modul
// ODER Fehler automatisch expo-location. Liefert ein einheitliches Sample inkl.
// Debug-Metadaten (source/provider) und einen statischen Info-Block.
//
// Bewusst schlank: kapselt nur die Quelle, ändert KEINE Filter-/Schwellenlogik.

export type LocationSourceKind = 'native' | 'expo' | 'external';

export interface PositionSourceSample extends StreamSample {
  source:   LocationSourceKind;
  provider: string | null;
}

export interface PositionSourceInfo {
  isNativeAvailable: boolean;
  rawGnssSupported:  boolean;
  source:            LocationSourceKind;
  provider:          string | null;
}

export interface PositionSourceHandle {
  stop: () => void;
  info: PositionSourceInfo;
}

function baseInfo(): PositionSourceInfo {
  let isNativeAvailable = false, rawGnssSupported = false;
  try { isNativeAvailable = client.isNativeAvailable(); } catch { /* Fallback: false */ }
  try { rawGnssSupported = client.isRawGnssSupported().supported === true; } catch { /* Fallback: false */ }
  return {
    isNativeAvailable,
    rawGnssSupported,
    source:   isNativeAvailable ? 'native' : 'expo',
    provider: null,
  };
}

// Adapter: einheitliches Sample → expo-location LocationObject-Form, damit die
// bestehende onFix-Logik der Recorder unverändert bleibt.
export function sampleToLocationObject(s: PositionSourceSample): Location.LocationObject {
  return {
    coords: {
      latitude:         s.lat,
      longitude:        s.lng,
      accuracy:         s.accuracy ?? null,
      altitude:         s.altitude ?? null,
      altitudeAccuracy: null,
      heading:          s.course ?? null,
      speed:            s.speed ?? null,
    },
    timestamp: s.t,
  } as Location.LocationObject;
}

// Startet die Positionsquelle. Gibt eine stop-Funktion + statische Info zurück.
export async function startPositionSource(
  onSample: (s: PositionSourceSample) => void,
  opts: Location.LocationOptions,
): Promise<PositionSourceHandle> {
  const info = baseInfo();

  const emit = (s: StreamSample, fallbackSource: LocationSourceKind) => {
    const src = s.source ?? fallbackSource;
    const sample: PositionSourceSample = { ...s, source: src, provider: s.provider ?? null };
    info.source = src;
    if (sample.provider != null) info.provider = sample.provider;
    onSample(sample);
  };

  // 1) Bevorzugt: natives Modul / BLE über positionStream (fällt intern bereits
  //    auf expo-location zurück, wenn kein natives Modul im Build ist).
  try {
    const stop = await startPositionStream((s) => emit(s, info.source), opts);
    return { stop, info };
  } catch (e) {
    // 2) Harte Sicherung: schlägt der native Start fehl (z. B. Modul vorhanden,
    //    aber Fehler), auf reines expo-location zurückfallen. Kein Crash.
    console.warn('[positionSource] Native/positionStream fehlgeschlagen — Fallback auf expo-location.', e);
    const sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: opts.timeInterval ?? 1000,
        distanceInterval: 0,
      },
      (loc) => emit({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? null,
        altitude: loc.coords.altitude ?? null,
        speed: loc.coords.speed ?? null,
        course: loc.coords.heading ?? null,
        t: loc.timestamp || Date.now(),
        provider: 'expo-location',
        source: 'expo',
      }, 'expo'),
    );
    return { stop: () => sub.remove(), info: { ...info, source: 'expo', provider: 'expo-location' } };
  }
}
