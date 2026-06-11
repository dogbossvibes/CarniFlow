import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { C } from '@/constants/colors';
import { bearingToCardinal } from '@/features/tracking/utils/gpsFilter';
import type { OrientationMode } from '@/features/tracking/store/trackingStore';

const MODES: { key: OrientationMode; label: string }[] = [
  { key: 'north',   label: 'Norden oben' },
  { key: 'heading', label: 'Bewegung oben' },
  { key: 'track',   label: 'Fährte oben' },
];

export function CompassBottomSheet({
  visible, onClose, heading, mode, onChangeMode,
}: {
  visible: boolean; onClose: () => void; heading: number | null;
  mode: OrientationMode; onChangeMode: (m: OrientationMode) => void;
}) {
  const deg = heading != null ? Math.round(heading) : null;
  return (
    <AnyvoBottomSheet visible={visible} onClose={onClose} title="Ausrichtung kalibrieren">
      <View style={s.compassWrap}>
        <View style={s.dial}>
          <Text style={[s.cardN, { top: 6 }]}>N</Text>
          <Text style={[s.cardN, { bottom: 6 }]}>S</Text>
          <Text style={[s.cardN, { left: 8, top: '46%' }]}>W</Text>
          <Text style={[s.cardN, { right: 8, top: '46%' }]}>O</Text>
          <Ionicons name="navigate" size={56} color={C.trackPrimary}
            style={deg != null ? { transform: [{ rotate: `${deg}deg` }] } : undefined} />
        </View>
        <Text style={s.degTxt}>{deg != null ? `${deg}°` : '—'} <Text style={s.cardTxt}>{deg != null ? bearingToCardinal(deg) : ''}</Text></Text>
      </View>

      <Text style={s.hint}>Drehe dich langsam, bis Pfeil und Fährtenrichtung übereinstimmen.</Text>

      <View style={s.modeRow}>
        {MODES.map(m => {
          const on = mode === m.key;
          return (
            <TouchableOpacity key={m.key} style={[s.mode, on && s.modeOn]} onPress={() => onChangeMode(m.key)} activeOpacity={0.85}>
              <Text style={[s.modeTxt, on && s.modeTxtOn]}>{m.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity style={s.save} onPress={onClose} activeOpacity={0.85}>
        <Text style={s.saveTxt}>Ausrichtung speichern</Text>
      </TouchableOpacity>
      <View style={{ height: 8 }} />
    </AnyvoBottomSheet>
  );
}

const s = StyleSheet.create({
  compassWrap: { alignItems: 'center', gap: 12, marginBottom: 8 },
  dial:    { width: 180, height: 180, borderRadius: 90, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, alignItems: 'center', justifyContent: 'center' },
  cardN:   { position: 'absolute', fontSize: 12, color: C.trackTextSec, fontWeight: '800' },
  degTxt:  { fontSize: 30, color: C.trackText, fontWeight: '900' },
  cardTxt: { fontSize: 18, color: C.trackPrimary, fontWeight: '800' },
  hint:    { fontSize: 13, color: C.trackTextSec, textAlign: 'center', lineHeight: 19, marginVertical: 14 },
  modeRow: { flexDirection: 'row', gap: 8 },
  mode:    { flex: 1, backgroundColor: C.trackCard, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, paddingVertical: 11, alignItems: 'center' },
  modeOn:  { borderColor: C.trackPrimary, backgroundColor: C.trackPrimary },
  modeTxt: { fontSize: 12, color: C.trackTextSec, fontWeight: '700' },
  modeTxtOn: { color: '#04110F', fontWeight: '800' },
  save:    { backgroundColor: C.trackPrimary, borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
  saveTxt: { fontSize: 15, color: '#04110F', fontWeight: '900' },
});
