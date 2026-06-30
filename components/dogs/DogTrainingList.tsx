import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { C } from '@/constants/colors';
import type { DogTrainingItem } from './types';

// Liste der letzten Trainings + „Alle anzeigen". Leerzustand bei fehlenden Daten.
export function DogTrainingList({
  items, onOpen, onShowAll,
}: {
  items: DogTrainingItem[];
  onOpen?: (item: DogTrainingItem) => void;
  onShowAll: () => void;
}) {
  return (
    <View style={s.wrap}>
      {items.length === 0 ? (
        <View style={s.empty}><Text style={s.emptyTxt}>Noch kein Training erfasst.</Text></View>
      ) : (
        <View style={s.card}>
          {items.map((it, i) => (
            <TouchableOpacity
              key={`${it.source}-${it.id}`}
              style={[s.row, i < items.length - 1 && s.rowDivider]}
              activeOpacity={onOpen ? 0.7 : 1}
              onPress={() => onOpen?.(it)}
            >
              <View style={s.iconWrap}><Ionicons name="paw" size={16} color={C.trackPrimary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.disc} numberOfLines={1}>{it.discipline}</Text>
                <Text style={s.date} numberOfLines={1}>{it.dateLabel}</Text>
              </View>
              {it.points != null ? (
                <View style={s.pill}><Text style={s.pillTxt}>{it.points} Pkt</Text></View>
              ) : (
                <Ionicons name="chevron-forward" size={16} color={C.trackTextMut} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
      <AnyvoButton label="Alle Trainings anzeigen" variant="secondary" icon="list-outline" onPress={onShowAll} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap:       { gap: 12 },
  card:       { borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, overflow: 'hidden' },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: C.trackBorder },
  iconWrap:   { width: 38, height: 38, borderRadius: 11, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  disc:       { fontSize: 14.5, color: C.trackText, fontWeight: '700' },
  date:       { fontSize: 12, color: C.trackTextMut, marginTop: 2 },
  pill:       { borderRadius: 9, borderWidth: 1, borderColor: C.accentMid, backgroundColor: C.accentDim, paddingHorizontal: 9, paddingVertical: 4 },
  pillTxt:    { fontSize: 12, color: C.trackPrimary, fontWeight: '800' },
  empty:      { borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, padding: 22, alignItems: 'center' },
  emptyTxt:   { fontSize: 13.5, color: C.trackTextMut },
});
