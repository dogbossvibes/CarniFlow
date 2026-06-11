import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { C } from '@/constants/colors';
import type { MarkerType } from '@/features/tracking/store/trackingStore';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const OPTIONS: { type: MarkerType; icon: IconName; title: string; sub: string; color: string }[] = [
  { type: 'gegenstand',   icon: 'cube',            title: 'Gegenstand',  sub: 'Gegenstand markieren',   color: C.trackPrimary },
  { type: 'winkel',       icon: 'git-branch',      title: 'Winkel',      sub: 'Winkel markieren',       color: C.trackWarning },
  { type: 'verleitung',   icon: 'warning',         title: 'Verleitung',  sub: 'Verleitung markieren',   color: C.trackPurple },
  { type: 'sprachmarker', icon: 'mic',             title: 'Sprachmarker', sub: 'Sprachnotiz aufnehmen',  color: C.trackPurple },
];

export function MarkerBottomSheet({
  visible, onClose, onSelect,
}: { visible: boolean; onClose: () => void; onSelect: (type: MarkerType) => void }) {
  return (
    <AnyvoBottomSheet visible={visible} onClose={onClose} title="Marker wählen">
      <View style={{ gap: 10, paddingBottom: 8 }}>
        {OPTIONS.map(o => (
          <TouchableOpacity key={o.type} style={s.row} onPress={() => { onClose(); onSelect(o.type); }} activeOpacity={0.85}>
            <View style={[s.icon, { backgroundColor: `${o.color}1F` }]}><Ionicons name={o.icon} size={20} color={o.color} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{o.title}</Text>
              <Text style={s.sub}>{o.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.trackTextMut} />
          </TouchableOpacity>
        ))}
      </View>
    </AnyvoBottomSheet>
  );
}

const s = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, padding: 14 },
  icon:  { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, color: C.trackText, fontWeight: '800' },
  sub:   { fontSize: 12, color: C.trackTextSec, marginTop: 2 },
});
