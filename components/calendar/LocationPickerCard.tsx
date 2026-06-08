import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { RNMaps, MAPS_AVAILABLE } from '@/components/tracking/TrackMap';
import { SoftBoundary } from '@/components/ui/SoftBoundary';
import { tapHaptic } from '@/lib/haptics';

const ACCENT = '#00F5D4';

export function LocationPickerCard({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const useCurrent = async () => {
    tapHaptic();
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setLoading(false); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      setCoords({ lat: latitude, lng: longitude });
      const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
      const place = geo[0];
      const name = place?.city ?? place?.district ?? place?.subregion ?? '';
      if (name) onChange(name);
    } catch { /* ignore */ }
    setLoading(false);
  };

  return (
    <View>
      <View style={s.searchRow}>
        <View style={s.inputWrap}>
          <Ionicons name="search" size={16} color={C.muted} />
          <TextInput
            style={s.input}
            value={value}
            onChangeText={onChange}
            placeholder="Ort suchen…"
            placeholderTextColor={C.subtle}
          />
        </View>
        <TouchableOpacity style={s.gpsBtn} onPress={useCurrent} activeOpacity={0.8} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color={ACCENT} /> : <Ionicons name="navigate" size={18} color={ACCENT} />}
        </TouchableOpacity>
      </View>

      {coords && (
        <View style={s.mapCard}>
          {MAPS_AVAILABLE && RNMaps ? (
            <SoftBoundary fallback={<View style={s.mapFallback}><Ionicons name="location" size={20} color={ACCENT} /></View>}>
              <RNMaps.default
                provider={RNMaps.PROVIDER_DEFAULT}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
                initialRegion={{ latitude: coords.lat, longitude: coords.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
              >
                <RNMaps.Marker coordinate={{ latitude: coords.lat, longitude: coords.lng }} pinColor={ACCENT} />
              </RNMaps.default>
            </SoftBoundary>
          ) : (
            <View style={s.mapFallback}>
              <Ionicons name="location" size={20} color={ACCENT} />
              <Text style={s.mapTxt}>{value || 'Standort gesetzt'}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: 10 },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.input, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12 },
  input:     { flex: 1, color: C.white, fontSize: 15, paddingVertical: 12 },
  gpsBtn:    { width: 48, borderRadius: 12, borderWidth: 1, borderColor: `${ACCENT}55`, backgroundColor: 'rgba(0,245,212,0.1)', alignItems: 'center', justifyContent: 'center' },
  mapCard:   { height: 120, borderRadius: 20, overflow: 'hidden', marginTop: 12, borderWidth: 1, borderColor: C.border, backgroundColor: '#0A0A10' },
  mapFallback:{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 6, flexDirection: 'row' },
  mapTxt:    { fontSize: 13, color: C.white, fontWeight: '600' },
});
