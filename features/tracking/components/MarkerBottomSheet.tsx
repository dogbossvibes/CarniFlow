import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { C } from '@/constants/colors';
import type { MarkerType, MarkerMaterial } from '@/features/tracking/store/trackingStore';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface MarkerChoice { type: MarkerType; material?: MarkerMaterial }

// Gegenstände werden als Material gesetzt (alle type 'gegenstand' + material).
const MATERIALS: { material: MarkerMaterial; icon: IconName; label: string }[] = [
  { material: 'stoff',    icon: 'shirt-outline',       label: 'Stoff' },
  { material: 'holz',     icon: 'leaf-outline',        label: 'Holz' },
  { material: 'leder',    icon: 'bag-outline',         label: 'Leder' },
  { material: 'plastik',  icon: 'cube-outline',        label: 'Plastik' },
  { material: 'diverses', icon: 'ellipsis-horizontal', label: 'Diverses' },
];

const OTHERS: { type: MarkerType; icon: IconName; title: string; sub: string; color: string }[] = [
  { type: 'winkel',       icon: 'git-branch', title: 'Winkel',       sub: 'Richtungswechsel markieren', color: C.trackWarning },
  { type: 'verleitung',   icon: 'warning',    title: 'Verleitung',   sub: 'Fremdfährte / Ablenkung',    color: C.trackPurple },
  { type: 'sprachmarker', icon: 'mic',        title: 'Sprachmarker', sub: 'Notiz an dieser Stelle aufnehmen', color: C.trackBlue },
];

export function MarkerBottomSheet({
  visible, onClose, onSelect,
}: { visible: boolean; onClose: () => void; onSelect: (choice: MarkerChoice) => void }) {
  const pick = (choice: MarkerChoice) => { onClose(); onSelect(choice); };
  return (
    <AnyvoBottomSheet visible={visible} onClose={onClose} title="Markierung setzen">
      <View style={{ paddingBottom: 8 }}>
        <Text style={s.label}>Gegenstand</Text>
        <View style={s.matGrid}>
          {MATERIALS.map(m => (
            <TouchableOpacity key={m.material} style={s.matCell} activeOpacity={0.85}
              onPress={() => pick({ type: 'gegenstand', material: m.material })}>
              <View style={s.matIcon}><Ionicons name={m.icon} size={20} color={C.trackPrimary} /></View>
              <Text style={s.matLabel}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[s.label, { marginTop: 16 }]}>Sonstige</Text>
        <View style={{ gap: 10 }}>
          {OTHERS.map(o => (
            <TouchableOpacity key={o.type} style={s.row} onPress={() => pick({ type: o.type })} activeOpacity={0.85}>
              <View style={[s.icon, { backgroundColor: `${o.color}1F` }]}><Ionicons name={o.icon} size={20} color={o.color} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{o.title}</Text>
                <Text style={s.sub}>{o.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.trackTextMut} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </AnyvoBottomSheet>
  );
}

const s = StyleSheet.create({
  label:   { fontSize: 10, color: C.trackTextMut, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 },
  matGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  matCell: { width: '30.5%', flexGrow: 1, alignItems: 'center', gap: 7, paddingVertical: 14, borderRadius: 16, backgroundColor: C.trackCard, borderWidth: 1, borderColor: C.trackBorder },
  matIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: C.trackPrimaryDk + '24', alignItems: 'center', justifyContent: 'center' },
  matLabel:{ fontSize: 12.5, color: C.trackText, fontWeight: '700' },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, padding: 14 },
  icon:    { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: 16, color: C.trackText, fontWeight: '800' },
  sub:     { fontSize: 12, color: C.trackTextSec, marginTop: 2 },
});
