import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C } from '@/constants/colors';
export type TrackHubTab = 'training' | 'tracks' | 'together';
export function TrackHubTabs({ selected, onSelect }: { selected: TrackHubTab; onSelect(tab: TrackHubTab): void }) {
  return <View accessibilityRole="tablist" style={s.tabs}>{([
    ['training', 'Training'], ['tracks', 'Meine Fährten'], ['together', 'Gemeinsam'],
  ] as const).map(([key, label]) => <Pressable key={key} testID={`track-hub-${key}`} accessibilityRole="tab"
    accessibilityState={{ selected: selected === key }} onPress={() => onSelect(key)} style={[s.tab, selected === key && s.active]}>
    <Text style={[s.label, selected === key && s.selected]}>{label}</Text>
  </Pressable>)}</View>;
}
const s = StyleSheet.create({
  tabs: { flexDirection: 'row', marginHorizontal: 18, marginBottom: 16, gap: 8 },
  tab: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  active: { borderBottomColor: C.trackPrimary }, label: { color: C.trackTextSec, fontSize: 14, fontWeight: '600', textAlign: 'center' }, selected: { color: C.trackPrimary },
});
