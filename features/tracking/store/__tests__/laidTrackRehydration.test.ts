// Regressionstest BUG A (Feldtest B): "Legen 252 m / 8 Winkel / 7 Gegenstände
// → Stop → Liegezeit zeigt korrekt 252 m → nach ~1:49 h zeigt die Liegezeit
// plötzlich 0 m / 8 Winkel / 7 Gegenstände; beim Eintritt in die Absuche
// erscheint 'Der gespeicherte Fährtenansatz ist nicht verfügbar' und die
// gelegte Geometrie fehlt auf der Karte."
//
// Zwei unabhängige Ursachen, beide hier abgesichert:
//  1. Die Absuche (run.tsx) schrieb ihre eigene, bei 0 startende Suchdistanz
//     im 4-s-Takt in `ActiveFaehrte.distanceMeters` — laut
//     activeFaehrtenModel.ts ausdrücklich die Kennzahl der GELEGTEN Fährte und
//     genau das Feld, das liegen.tsx als Fallback anzeigt, wenn der Laufzeit-
//     Store leer ist. Winkel/Gegenstände wurden dabei nicht überschrieben →
//     exakt das beobachtete Muster "0 m / 8 Winkel / 7 Gegenstände".
//  2. Der Laufzeit-Store überlebt einen App-Neustart nicht; der persistierte
//     Puffer (loadPending) enthält alles, wurde in run.tsx aber nur im
//     Recovery-Fall zurückgespielt.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTrackingStore, type MarkerSample, type TrackPointSample } from '@/features/tracking/store/trackingStore';
import { loadPending, clearPending } from '@/features/tracking/store/trackPersist';
import { upsertEntry } from '@/features/tracking/store/activeFaehrtenModel';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const DOG = 'dog-feldtest-b';
const M_PER_DEG = 111320;

function laidPoints(totalM: number, step = 4): TrackPointSample[] {
  const pts: TrackPointSample[] = [];
  for (let d = 0; d <= totalM; d += step) {
    pts.push({ lat: d / M_PER_DEG, lng: 0, accuracy: 4, altitude: null, speed: null, heading: null, t: 1000 + d * 1000 });
  }
  return pts;
}
function marker(type: 'winkel' | 'gegenstand', i: number): MarkerSample {
  return {
    id: `${type}-${i}`, type, material: type === 'gegenstand' ? 'holz' : null,
    angleKind: type === 'winkel' ? 'links' : null,
    lat: (i * 10) / M_PER_DEG, lng: 0, accuracy: 4, distance_from_start: i * 10,
    note: null, audio_url: null, found: false, t: 1000 + i * 1000,
  } as MarkerSample;
}

// Realistischer Neustart: der Laufzeit-Store ist leer, der persistierte Puffer
// (AsyncStorage) bleibt erhalten. Bewusst NICHT store.reset() — das würde den
// Puffer mit löschen und damit gar nicht den Feldfall abbilden.
function simulateAppRestart() {
  useTrackingStore.setState({
    trackPoints: [], markers: [], segments: [], runPoints: [], searchTrackPoints: [],
    distanceMeters: 0, durationSeconds: 0, startAnchor: null, currentSessionId: null,
    layFinishedAt: null, layStartedAt: null, dogId: null,
  } as any);
}

describe('BUG A — gelegte Fährte überlebt Liegezeit und App-Neustart', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    simulateAppRestart();
  });
  afterEach(async () => { await clearPending(DOG); });

  it('Legen 252 m / 8 Winkel / 7 Gegenstände → Stop → simulierter Neustart → alles wieder vollständig da', async () => {
    // ── Legen ──
    const st = useTrackingStore.getState();
    st.startRecording('session-b', DOG);
    const pts = laidPoints(252);
    useTrackingStore.setState({ trackPoints: pts, distanceMeters: 252 } as any);
    for (let i = 0; i < 8; i++) useTrackingStore.getState().addMarker(marker('winkel', i));
    for (let i = 0; i < 7; i++) useTrackingStore.getState().addMarker(marker('gegenstand', i));
    useTrackingStore.getState().setStartAnchor({ lat: pts[0].lat, lng: pts[0].lng, accuracy: 4, t: 1000 });

    // ── Stop / Liegezeit-Start (schreibt den Puffer sofort, persistNow) ──
    useTrackingStore.getState().setLayFinishedAt(Date.now());

    // Unmittelbar nach dem Stop stimmt alles (wie im Video).
    expect(useTrackingStore.getState().distanceMeters).toBe(252);
    expect(useTrackingStore.getState().markers.filter(m => m.type === 'winkel')).toHaveLength(8);
    expect(useTrackingStore.getState().markers.filter(m => m.type === 'gegenstand')).toHaveLength(7);

    // ── Realistischer App-Neustart (Laufzeit-Store weg, Puffer bleibt) ──
    simulateAppRestart();
    expect(useTrackingStore.getState().trackPoints).toHaveLength(0);   // Ausgangslage des Feldfalls

    // ── Session neu laden (derselbe Pfad, den liegen.tsx und – nach dem Fix –
    //    auch run.tsx nutzen) ──
    const pending = await loadPending(DOG);
    expect(pending).not.toBeNull();
    useTrackingStore.getState().restorePending(pending!);

    const after = useTrackingStore.getState();
    expect(after.distanceMeters).toBe(252);                                   // ← vor dem Fix: 0
    expect(after.trackPoints.length).toBe(pts.length);                        // vollständige Polyline
    expect(after.trackPoints[0].lat).toBeCloseTo(pts[0].lat, 9);              // Startkoordinate
    expect(after.startAnchor).not.toBeNull();                                 // gespeicherter Fährtenansatz
    expect(after.markers.filter(m => m.type === 'winkel')).toHaveLength(8);
    expect(after.markers.filter(m => m.type === 'gegenstand')).toHaveLength(7);
  });

  it('Registry: die Absuche darf die GELEGTE Distanz nicht mit ihrer eigenen (0 m) überschreiben', () => {
    // Legen trägt die Kennzahlen ein (legen.tsx).
    let map = upsertEntry({}, DOG, { distanceMeters: 252, winkelCount: 8, objektCount: 7, status: 'resting' });
    expect(map[DOG].distanceMeters).toBe(252);

    // run.tsx spiegelt im 4-s-Takt die GPS-Genauigkeit — und NUR diese.
    // (Vor dem Fix wurde hier zusätzlich `distanceMeters: Math.round(s.distanceM)`
    // geschrieben, also die bei 0 startende Suchdistanz.)
    map = upsertEntry(map, DOG, { gpsAccuracy: 5 });

    expect(map[DOG].distanceMeters).toBe(252);   // ← vor dem Fix: 0
    expect(map[DOG].winkelCount).toBe(8);
    expect(map[DOG].objektCount).toBe(7);
  });

  it('Nachweis des alten Fehlverhaltens: das frühere Schreibmuster erzeugt exakt "0 m / 8 Winkel / 7 Gegenstände"', () => {
    let map = upsertEntry({}, DOG, { distanceMeters: 252, winkelCount: 8, objektCount: 7, status: 'resting' });
    // Exakt der alte run.tsx-Intervall: Suchdistanz (s.distanceM = 0 zu Beginn)
    // in das Feld der GELEGTEN Distanz.
    map = upsertEntry(map, DOG, { gpsAccuracy: 5, distanceMeters: 0 });
    expect(map[DOG].distanceMeters).toBe(0);     // ← das im Video beobachtete Symptom
    expect(map[DOG].winkelCount).toBe(8);        // Winkel/Gegenstände blieben unberührt …
    expect(map[DOG].objektCount).toBe(7);        // … genau wie im Video
  });
});
