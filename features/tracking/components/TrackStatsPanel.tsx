import { StyleSheet, View } from 'react-native';
import { AnyvoStatCard } from '@/components/ui/AnyvoStatCard';
import { C } from '@/constants/colors';

function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Schwebendes Stats-Panel: Distanz · Dauer · Gegenstände (+ optional Abweichung).
export function TrackStatsPanel({
  distanceMeters, durationSeconds, articles, deviation,
}: { distanceMeters: number; durationSeconds: number; articles: string; deviation?: string }) {
  return (
    <View style={s.panel}>
      <AnyvoStatCard value={`${Math.round(distanceMeters)} m`} label="DISTANZ" accent />
      <View style={s.sep} />
      <AnyvoStatCard value={fmtDur(durationSeconds)} label="DAUER" />
      <View style={s.sep} />
      <AnyvoStatCard value={articles} label="GEGENSTÄNDE" />
      {deviation != null && (<><View style={s.sep} /><AnyvoStatCard value={deviation} label="ABWEICHUNG" /></>)}
    </View>
  );
}

const s = StyleSheet.create({
  panel: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(13,13,13,0.92)', borderRadius: 20, borderWidth: 1, borderColor: C.trackBorder, paddingVertical: 12, paddingHorizontal: 8 },
  sep:   { width: 1, height: 30, backgroundColor: C.trackBorder },
});
