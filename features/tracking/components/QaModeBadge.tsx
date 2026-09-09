// QA-Anzeige der TATSÄCHLICH aktiven Engine/Source im Lege-Screen.
//
// Zeigt nicht die gespeicherte Präferenz, sondern die Werte, die beim GPS-Start
// wirklich gelesen wurden (trackingWarmupState.ts). Damit ist ein
// Screenrecording eines Feldtests beweiskräftig: was auf dem Bildschirm steht,
// ist das, womit aufgezeichnet wurde.
//
// Sichtbar NUR im QA-Diagnosemodus. Ohne ihn rendert die Komponente `null` und
// die Oberfläche bleibt exakt wie bisher.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C } from '@/constants/colors';
import { isQaDiagnosticsEnabled, subscribeQaDiagnostics } from '@/features/tracking/utils/qaDiagnosticsMode';
import {
  getActiveTrackingModes, subscribeActiveTrackingModes, type ActiveTrackingModes,
} from '@/features/tracking/utils/trackingWarmupState';
import { getLocationSourceMode, subscribeLocationSourceMode, type LocationSourceMode } from '@/features/tracking/utils/locationSourceMode';
import { getTrackingEngineMode, subscribeTrackingEngineMode, type TrackingEngineMode } from '@/features/tracking/utils/trackingEngineMode';
import { motionClient } from '@/features/tracking/native/motionClient';

const engineLabel = (m: TrackingEngineMode | null) => (m === 'build40' ? 'BUILD40' : m === 'current' ? 'CURRENT' : '—');
const sourceLabel = (m: LocationSourceMode | null) => (m === 'legacy' ? 'EXPO' : m === 'precision' ? 'PRECISION' : '—');

export function QaModeBadge() {
  const [qaOn, setQaOn] = useState(isQaDiagnosticsEnabled());
  const [active, setActive] = useState<ActiveTrackingModes>(getActiveTrackingModes());
  const [prefEngine, setPrefEngine] = useState(getTrackingEngineMode());
  const [prefSource, setPrefSource] = useState(getLocationSourceMode());

  useEffect(() => subscribeQaDiagnostics(setQaOn), []);
  useEffect(() => subscribeActiveTrackingModes(setActive), []);
  useEffect(() => subscribeTrackingEngineMode(setPrefEngine), []);
  useEffect(() => subscribeLocationSourceMode(setPrefSource), []);
  // Vorhandene Verfügbarkeitsprüfung, keine neue API. Ein Feldtest darf nicht
  // still ohne Motion-Daten laufen.
  const [motionAvailable] = useState(() => motionClient.isAvailable());

  if (!qaOn) return null;

  // Solange kein Stream läuft, gilt die Präferenz — sie WIRD beim nächsten
  // Start gelesen. Läuft einer, zählt ausschliesslich, was er gelesen hat.
  const shownEngine = active.warmupActive ? active.engine : prefEngine;
  const shownSource = active.warmupActive ? active.source : prefSource;
  const drifted = active.warmupActive && (active.engine !== prefEngine || active.source !== prefSource);

  return (
    <View style={s.wrap}>
      <View style={[s.dot, active.warmupActive ? s.dotLive : s.dotIdle]} />
      <Text style={s.txt}>
        {engineLabel(shownEngine)} · {sourceLabel(shownSource)}
        {active.warmupActive ? ` · ${active.reportedSource ?? 'wartet'}` : ' · bereit'}
      </Text>
      <Text style={s.motion}>
        {!motionAvailable ? 'Motion · nicht verfügbar'
          : active.motion === 'live' ? `Motion · aktiv (${active.motionSamples})`
            : active.motion === 'waiting' ? 'Motion · keine Samples'
              : 'Motion · verfügbar'}
      </Text>
      {drifted && (
        <Text style={s.warn}>
          Änderung wird beim nächsten Fährtenstart aktiv
          {` (${engineLabel(prefEngine)} · ${sourceLabel(prefSource)})`}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6,
    alignSelf: 'flex-start', marginHorizontal: 18, marginBottom: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotLive: { backgroundColor: C.accent },
  dotIdle: { backgroundColor: C.muted },
  txt: { fontSize: 11, fontWeight: '800', color: C.white, letterSpacing: 0.4 },
  motion: { fontSize: 11, fontWeight: '700', color: C.muted },
  warn: { fontSize: 11, fontWeight: '600', color: C.accent, width: '100%' },
});
