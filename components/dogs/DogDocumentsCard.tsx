import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { C } from '@/constants/colors';
import type { DogDocument } from './types';

// Dokumente (Impfpass, Stammbaum, HD/ED, Prüfungen). Vorhandene mit Datei sind
// antippbar → öffnen (Signed-URL).
export function DogDocumentsCard({
  documents, onAdd, onOpen,
}: {
  documents: DogDocument[];
  onAdd: () => void;
  onOpen?: (doc: DogDocument) => void;
}) {
  return (
    <View style={s.wrap}>
      <View style={s.card}>
        {documents.map((d, i) => {
          const openable = d.present && !!d.path && !!onOpen;
          const Row: any = openable ? TouchableOpacity : View;
          return (
            <Row key={d.key} style={[s.row, i < documents.length - 1 && s.divider]} {...(openable ? { activeOpacity: 0.7, onPress: () => onOpen!(d) } : {})}>
              <View style={[s.iconWrap, d.present ? s.iconOn : s.iconOff]}>
                <Ionicons name={d.present ? 'document-text' : 'document-outline'} size={16} color={d.present ? C.trackPrimary : C.trackTextMut} />
              </View>
              <Text style={s.label} numberOfLines={1}>{d.label}</Text>
              {openable ? (
                <View style={s.openBtn}><Ionicons name="open-outline" size={14} color={C.trackPrimary} /><Text style={s.openTxt}>Öffnen</Text></View>
              ) : (
                <Text style={[s.status, d.present ? s.statusOn : s.statusOff]}>{d.present ? 'Vorhanden' : 'Fehlt'}</Text>
              )}
            </Row>
          );
        })}
      </View>
      <AnyvoButton label="Dokument hinzufügen" icon="add" variant="secondary" onPress={onAdd} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap:     { gap: 12 },
  card:     { borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, overflow: 'hidden' },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  divider:  { borderBottomWidth: 1, borderBottomColor: C.trackBorder },
  iconWrap: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  iconOn:   { backgroundColor: C.accentDim },
  iconOff:  { backgroundColor: C.trackCardAlt },
  label:    { flex: 1, fontSize: 14.5, color: C.trackText, fontWeight: '600' },
  status:   { fontSize: 12, fontWeight: '800' },
  statusOn: { color: C.trackPrimary },
  statusOff:{ color: C.trackTextMut },
  openBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.accentDim, borderRadius: 9, borderWidth: 1, borderColor: C.accentMid, paddingHorizontal: 10, paddingVertical: 5 },
  openTxt:  { fontSize: 12, color: C.trackPrimary, fontWeight: '800' },
});
