import { pinQaTrackingModes, loadQaPreferences } from './qaPreferences';
import * as Location from 'expo-location';
import { startPositionStream, type StreamSample } from '@/features/tracking/utils/positionStream';
import { precisionLocationClient as client } from '@/features/tracking/native/precisionLocationClient';
import { getLocationSourceMode } from '@/features/tracking/utils/locationSourceMode';
import { normalizeFixQuality, type LocationFixQuality } from './locationFixQuality';
import { beginPositionDiagnostics, recordPositionDiagnostics, recordGnssDiagnostics, endPositionDiagnostics } from './positionDiagnostics';

// Zentrale Positionsquelle für die Fährtenaufnahme.
//
// Reihenfolge: natives Precision-Modul (via positionStream) → bei fehlendem Modul
// ODER Fehler automatisch expo-location. Liefert ein einheitliches Sample inkl.
// Debug-Metadaten (source/provider) und einen statischen Info-Block.
//
// Bewusst schlank: kapselt nur die Quelle, ändert KEINE Filter-/Schwellenlogik.
//
// QA-A/B-Schalter (Build-43-Feldtest-Audit, siehe locationSourceMode.ts):
// steht `getLocationSourceMode() === 'legacy'`, wird AnyvoPrecisionLocation
// NICHT gestartet — es läuft exakt derselbe reine expo-location-Zweig wie
// der bisherige Fehler-Fallback unten (`startLegacyExpoLocation`), also exakt
// der alte, auf Build 40 nachweislich funktionierende Pfad. Alles danach
// (EMA, Distanz-Gates, Search-Start-Acquisition, Corner-Detection) bleibt in
// beiden Modi unverändert — die Hooks kennen den Modus nicht.

export type LocationSourceKind = 'native' | 'expo' | 'external';

export interface PositionSourceSample extends StreamSample {
  t: number;
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
export type TrackingLocationObject = Location.LocationObject & {
  coords: Location.LocationObject['coords'] & Required<LocationFixQuality>;
};

export function sampleToLocationObject(s: PositionSourceSample): TrackingLocationObject {
  return {
    coords: {
      latitude:         s.lat,
      longitude:        s.lng,
      accuracy:         s.accuracy ?? null,
      altitude:         s.altitude ?? null,
      ...normalizeFixQuality(s),
      heading:          s.course ?? null,
      speed:            s.speed ?? null,
    },
    timestamp: s.t,
  };
}

// Exakt der alte, auf Build 40 (Commit 82bd17c) nachweislich funktionierende
// iOS-Pfad: reines expo-location, dieselben Optionen wie damals. `timeInterval`
// wird bewusst weiterhin durchgereicht (Android nutzt es echt — auf iOS ist es
// laut expo-locations eigener LocationOptions.swift/Location.types.d.ts ein
// No-Op, siehe Audit-Kommentar oben — KEIN eigenes Verhalten wird hier
// erfunden, nur exakt das alte Options-Objekt reproduziert).
async function startLegacyExpoLocation(
  onEmit: (s: StreamSample, fallbackSource: LocationSourceKind) => void,
  opts: Location.LocationOptions,
  providerLabel: string,
): Promise<() => void> {
  const sub = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: opts.timeInterval ?? 1000,
      distanceInterval: 0,
    },
    (loc) => onEmit({
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      accuracy: loc.coords.accuracy ?? null,
      altitude: loc.coords.altitude ?? null,
      ...normalizeFixQuality({ altitudeAccuracy: loc.coords.altitudeAccuracy }),
      speed: loc.coords.speed ?? null,
      course: loc.coords.heading ?? null,
      t: loc.timestamp || Date.now(),
      provider: providerLabel,
      source: 'expo',
    }, 'expo'),
  );
  return () => sub.remove();
}

// Startet die Positionsquelle. Gibt eine stop-Funktion + statische Info zurück.
export async function startPositionSource(
  onSample: (s: PositionSourceSample) => void,
  opts: Location.LocationOptions,
): Promise<PositionSourceHandle> {
  await loadQaPreferences();
  const release = pinQaTrackingModes();
  try {
    const handle = await startPositionSourcePinned(onSample, opts);
    return { ...handle, stop: () => { try { handle.stop(); } finally { release(); } } };
  } catch (error) { release(); throw error; }
}

async function startPositionSourcePinned(onSample: (s: PositionSourceSample) => void, opts: Location.LocationOptions): Promise<PositionSourceHandle> {
  const info = baseInfo();
  const diagnosticId = beginPositionDiagnostics();
  let stopped = false;
  let gnssSub: { remove: () => void } | null = null;
  const removeGnss = () => {
    try { gnssSub?.remove(); } catch { /* optional diagnostics cannot block source cleanup */ }
    gnssSub = null;
  };
  const finishHandle = (stop: () => void, sourceInfo: PositionSourceInfo): PositionSourceHandle => ({
    info: sourceInfo,
    stop: () => {
      if (stopped) return;
      stopped = true;
      removeGnss();
      endPositionDiagnostics(diagnosticId);
      stop();
    },
  });

  const emit = (s: StreamSample, fallbackSource: LocationSourceKind) => {
    if (stopped) return;
    const src = s.source ?? fallbackSource;
    const sample: PositionSourceSample = { ...s, ...normalizeFixQuality(s), t: s.t ?? Date.now(), source: src, provider: s.provider ?? null };
    recordPositionDiagnostics(diagnosticId, sample);
    info.source = src;
    if (sample.provider != null) info.provider = sample.provider;
    onSample(sample);
  };

  // 0) QA-A/B-Schalter: LEGACY erzwingt den alten expo-location-Pfad, ohne
  //    AnyvoPrecisionLocation überhaupt zu starten (siehe locationSourceMode.ts).
  if (getLocationSourceMode() === 'legacy') {
    try {
      const stop = await startLegacyExpoLocation(emit, opts, 'expo-location-legacy');
      return finishHandle(stop, { ...info, isNativeAvailable: false, source: 'expo', provider: 'expo-location-legacy' });
    } catch (error) {
      stopped = true;
      endPositionDiagnostics(diagnosticId);
      throw error;
    }
  }

  // 1) Bevorzugt: natives Modul / BLE über positionStream (fällt intern bereits
  //    auf expo-location zurück, wenn kein natives Modul im Build ist).
  try {
    if (info.isNativeAvailable && typeof client.onGnssStatus === 'function') {
      try { gnssSub = client.onGnssStatus(s => recordGnssDiagnostics(diagnosticId, s)); }
      catch { /* older binaries may lack diagnostics; retain the native position path */ }
    }
    const stop = await startPositionStream((s) => emit(s, info.source), opts);
    return finishHandle(stop, info);
  } catch (e) {
    // 2) Harte Sicherung: schlägt der native Start fehl (z. B. Modul vorhanden,
    //    aber Fehler), auf reines expo-location zurückfallen. Kein Crash.
    console.warn('[positionSource] Native/positionStream fehlgeschlagen — Fallback auf expo-location.', e);
    removeGnss();
    try {
      const stop = await startLegacyExpoLocation(emit, opts, 'expo-location');
      return finishHandle(stop, { ...info, source: 'expo', provider: 'expo-location' });
    } catch (fallbackError) {
      stopped = true;
      endPositionDiagnostics(diagnosticId);
      throw fallbackError;
    }
  }
}
