import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
export type QuickActionKey = 'unterordnung' | 'faehrte' | 'schutzdienst' | 'spiel' | 'custom';

const ITEMS: { key: QuickActionKey; label: string; icon: IconName }[] = [
  { key: 'unterordnung', label: 'Unterordnung', icon: 'ribbon-outline' },
  { key: 'faehrte',      label: 'Fährte',       icon: 'footsteps-outline' },
  { key: 'schutzdienst', label: 'Schutzdienst', icon: 'shield-outline' },
  { key: 'spiel',        label: 'Spiel & Motivation', icon: 'happy-outline' },
  { key: 'custom',       label: 'Custom',       icon: 'add-circle-outline' },
];

// Schnellstart-Kacheln für das Training-Tab.
export function DogQuickActions({ onSelect }: { onSelect: (key: QuickActionKey) => void }) {
  return (
    <View style={s.grid}>
      {ITEMS.map(it => (
        <TouchableOpacity key={it.key} style={s.tile} activeOpacity={0.85} onPress={() => onSelect(it.key)}>
          <View style={s.iconWrap}><Ionicons name={it.icon} size={20} color={C.trackPrimary} /></View>
          <Text style={s.label} numberOfLines={2}>{it.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  grid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile:     { flexBasis: '30%', flexGrow: 1, minWidth: 96, alignItems: 'center', gap: 8, backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, paddingVertical: 16, paddingHorizontal: 8 },
  iconWrap: { width: 42, height: 42, borderRadius: 13, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  label:    { fontSize: 12, color: C.trackText, fontWeight: '700', textAlign: 'center' },
});
