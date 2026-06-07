import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { C } from '@/constants/colors';
import { RNMaps, MAPS_AVAILABLE } from '@/components/tracking/TrackMap';
import { SoftBoundary } from '@/components/ui/SoftBoundary';
import { getLiveConditions, type LiveConditions } from '@/services/weatherService';

const DIRS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
function compass(deg: number | null): string {
  if (deg == null) return '–';
  return DIRS[Math.round((deg % 360) / 45) % 8];
}

// GPS-Qualität aus der Genauigkeit (Meter).
function gpsLevel(acc: number | null): { label: string; color: string; bars: number } {
  if (acc == null)  return { label: 'Suche…',     color: C.muted,   bars: 0 };
  if (acc <= 3)     return { label: 'Exzellent',  color: C.success, bars: 3 };
  if (acc <= 8)     return { label: 'Gut',        color: C.warning, bars: 2 };
  return                   { label: 'Schwach',    color: C.danger,  bars: 1 };
}

export function LiveConditionsCard() {
  const [cond, setCond] = useState<LiveConditions | null>(null);
  const [acc,  setAcc]  = useState<number | null>(null);

  useEffect(() => { getLiveConditions().then(setCond); }, []);

  // Live-GPS-Genauigkeit.
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 0 },
        loc => setAcc(loc.coords.accuracy ?? null),
      );
    })();
    return () => sub?.remove();
  }, []);

  // Kompass-Pfeil zur Windrichtung animieren.
  const rot = useSharedValue(0);
  useEffect(() => { if (cond?.windDir != null) rot.value = withSpring(cond.windDir, { damping: 14 }); }, [cond?.windDir]);
  const arrowStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));

  const lvl    = gpsLevel(acc);
  const center = cond ?? { lat: 47.3769, lng: 8.5417 } as LiveConditions;

  return (
    <View>
      {/* ── Glas-Karte: GPS · Wind · Wetter ── */}
      <View style={s.card}>
        <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={s.cardBorder} pointerEvents="none" />

        {/* GPS */}
        <View style={s.col}>
          <Text style={s.colLabel}>GPS</Text>
          <Text style={[s.colVal, { color: lvl.color }]}>{acc != null ? `${acc.toFixed(1)} m` : '–'}</Text>
          <View style={s.barsRow}>
            {[1, 2, 3].map(n => (
              <View key={n} style={[s.bar, { backgroundColor: n <= lvl.bars ? lvl.color : 'rgba(255,255,255,0.15)' }]} />
            ))}
          </View>
          <Text style={[s.colSub, { color: lvl.color }]}>{lvl.label}</Text>
        </View>

        <View style={s.divider} />

        {/* Wind */}
        <View style={s.col}>
          <Text style={s.colLabel}>WIND</Text>
          <View style={s.windRow}>
            <Animated.View style={arrowStyle}>
              <Ionicons name="navigate" size={18} color={C.accent} />
            </Animated.View>
            <Text style={s.colVal}>{compass(cond?.windDir ?? null)}</Text>
          </View>
          <Text style={s.colSub}>{cond?.windSpeed != null ? `${cond.windSpeed} km/h` : '–'}</Text>
          {cond?.windGusts != null ? <Text style={s.colHint}>Böen {cond.windGusts}</Text> : null}
        </View>

        <View style={s.divider} />

        {/* Wetter */}
        <View style={s.col}>
          <Text style={s.colLabel}>WETTER</Text>
          <Text style={s.colVal}>{cond?.emoji ?? ''} {cond?.temp != null ? `${cond.temp}°` : '–'}</Text>
          <Text style={s.colSub}>💧 {cond?.humidity != null ? `${cond.humidity}%` : '–'}</Text>
          <Text style={s.colHint}>☁ {cond?.cloudCover != null ? `${cond.cloudCover}%` : '–'}</Text>
        </View>
      </View>

      {/* ── Mini-Karte mit aktueller Position ── */}
      <View style={s.mapCard}>
        {MAPS_AVAILABLE && RNMaps ? (
          <SoftBoundary fallback={<View style={s.mapFallback}><Ionicons name="map-outline" size={22} color={C.subtle} /></View>}>
            <RNMaps.default
              provider={RNMaps.PROVIDER_DEFAULT}
              style={StyleSheet.absoluteFill}
              mapType="hybrid"
              showsUserLocation
              followsUserLocation={false}
              pointerEvents="none"
              initialRegion={{ latitude: center.lat, longitude: center.lng, latitudeDelta: 0.003, longitudeDelta: 0.003 }}
            />
          </SoftBoundary>
        ) : (
          <View style={s.mapFallback}><Ionicons name="map-outline" size={22} color={C.subtle} /></View>
        )}
        <View style={[s.statusBadge, { borderColor: `${lvl.color}55` }]}>
          <View style={[s.statusDot, { backgroundColor: lvl.color }]} />
          <Text style={s.statusTxt}>{acc != null && acc <= 8 ? 'Tracking bereit' : 'GPS suchen…'}</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    height: 110, borderRadius: 24, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(0,245,212,0.18)',
    backgroundColor: 'rgba(10,12,14,0.5)',
    paddingHorizontal: 8,
  },
  cardBorder: { ...StyleSheet.absoluteFillObject, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  col:     { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 4 },
  colLabel:{ fontSize: 9, color: C.muted, fontWeight: '800', letterSpacing: 1.5 },
  colVal:  { fontSize: 17, color: C.white, fontWeight: '900', letterSpacing: -0.4 },
  colSub:  { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  colHint: { fontSize: 10, color: C.muted, fontWeight: '600' },
  divider: { width: 1, height: 64, backgroundColor: 'rgba(255,255,255,0.08)' },
  barsRow: { flexDirection: 'row', gap: 3, marginVertical: 1 },
  bar:     { width: 6, height: 9, borderRadius: 2 },
  windRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  mapCard:  { height: 130, borderRadius: 20, overflow: 'hidden', marginTop: 12, borderWidth: 1, borderColor: C.border, backgroundColor: '#0A0A10' },
  mapFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  statusBadge: {
    position: 'absolute', bottom: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusTxt: { fontSize: 11, color: C.white, fontWeight: '700' },
});
