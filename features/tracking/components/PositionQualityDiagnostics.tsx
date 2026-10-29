import { constellationLabel } from '../utils/gnssConstellations';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { C } from '@/constants/colors';
import { getPositionDiagnostics, subscribePositionDiagnostics, diagnosticAgeMs, diagnosticIsFresh } from '../utils/positionDiagnostics';
import { isLaySessionWarmupReady } from '../utils/layStartLock';

const uncertainty = (value: number | null | undefined, unit: string) => value == null ? 'unbekannt' : `${value.toFixed(1)} ${unit}`;
export function PositionQualityDiagnostics() {
  const state = useSyncExternalStore(subscribePositionDiagnostics, getPositionDiagnostics, getPositionDiagnostics);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const fix = state.fix;
  const fresh = state.active && diagnosticIsFresh(fix?.timestamp, now);
  const gnssFresh = state.active && diagnosticIsFresh(state.gnss?.timestamp, now);
  const age = diagnosticAgeMs(fix?.timestamp, now);
  return <View style={s.card}>
    <Text style={s.title}>Qualität der aktiven Fährtenquelle</Text>
    <Text style={s.line}>Quelle: {fix?.source ?? 'noch keine'} · {state.active ? 'aktiv' : 'gestoppt'}</Text>
    <Text style={s.line}>Letzter Fix: {age == null ? 'unbekannt' : `${(age / 1000).toFixed(1)} s`} · {fresh ? 'aktuell' : 'keine frische Messung'}</Text>
    <Text style={s.line}>Messungen empfangen: {state.timing.received}</Text>
    <Text style={s.line}>Letzter Messabstand: {state.timing.lastIntervalMs == null ? 'unbekannt' : `${(state.timing.lastIntervalMs / 1000).toFixed(1)} s`}</Text>
    <Text style={s.line}>Größter Messabstand: {(state.timing.largestGapMs / 1000).toFixed(1)} s</Text>
    <Text style={s.line}>Gleiche / rückläufige Zeitstempel: {state.timing.duplicates} / {state.timing.outOfOrder}</Text>
    <Text style={s.note}>Seit Start dieser Positionsquelle. Ein Zeitabstand belegt allein keinen Satellitenausfall. Keine Koordinaten werden hierfür gespeichert.</Text>
    <Text style={s.line}>Lagegenauigkeit: {uncertainty(fix?.accuracy, 'm')}</Text>
    <Text style={s.line}>Höhengenauigkeit: {uncertainty(fix?.altitudeAccuracy, 'm')}</Text>
    <Text style={s.line}>Geschwindigkeitsgenauigkeit: {uncertainty(fix?.speedAccuracy, 'm/s')}</Text>
    <Text style={s.line}>Kursgenauigkeit: {uncertainty(fix?.courseAccuracy, '°')}</Text>
    <Text style={s.note}>{fresh && isLaySessionWarmupReady(fix?.accuracy ?? null) ? 'Aktueller Fix erfüllt die bestehende Lay-Genauigkeitsregel.' : 'Im Freien auf einen aktuellen, stabilen Fix warten.'} Diese Anzeige ändert keine Startfreigabe.</Text>
    {Platform.OS === 'android' ? <>
      <Text style={s.line}>Satelliten beobachtet / verwendet: {gnssFresh ? `${state.gnss!.satelliteCount} / ${state.gnss!.usedInFixCount}` : 'unbekannt'}</Text>
      <Text style={s.line}>Signalstärke Ø / max: {gnssFresh ? `${uncertainty(state.gnss?.averageCn0DbHz, 'dBHz')} / ${uncertainty(state.gnss?.maxCn0DbHz, 'dBHz')}` : 'unbekannt'}</Text>
      {gnssFresh && state.gnss?.constellations ? state.gnss.constellations.map(system => <View key={system.constellation}>
        <Text style={s.line}>{constellationLabel(system.constellation)}: {system.observed} beobachtet · {system.used} verwendet</Text>
        <Text style={s.note}>Gemeldete Frequenzen: {system.frequenciesHz.length ? system.frequenciesHz.map(hz => `${(hz / 1e6).toFixed(2)} MHz`).join(' · ') : 'nicht verfügbar'}</Text>
      </View>) : <Text style={s.note}>Aufschlüsselung nach Satellitensystem und Frequenz: nicht verfügbar. Dafür werden aktuelle Daten eines unterstützten Android-Builds benötigt.</Text>}
      <Text style={s.note}>Mehr Satellitensignale bedeuten nicht automatisch eine genauere Fährte. Angezeigt werden Empfangsdaten, keine garantierte Genauigkeit oder vollständige Geräteliste.</Text>
      <Text style={s.note}>Statusalter: {diagnosticAgeMs(state.gnss?.timestamp, now) == null ? 'unbekannt' : `${(diagnosticAgeMs(state.gnss?.timestamp, now)! / 1000).toFixed(1)} s`}. Ältere Binaries und Fallback können diese Werte nicht liefern.</Text>
    </> : <Text style={s.note}>iOS liefert hier keine einzelnen Satelliten oder GNSS-Rohmessungen. Das iPhone wählt unterstützte Satellitensysteme selbst. Lagegenauigkeit und Messalter stehen oben; Bewegungssensoren werden separat diagnostiziert.</Text>}
  </View>;
}
const s = StyleSheet.create({ card: { backgroundColor: C.card, padding: 16, borderRadius: 16, marginBottom: 16 }, title: { color: C.trackText, fontWeight: '700', marginBottom: 8 }, line: { color: C.trackText, marginVertical: 3 }, note: { color: C.trackTextSec, marginTop: 8 } });
