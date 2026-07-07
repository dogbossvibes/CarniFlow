import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { C } from '@/constants/colors';
import { categoryLabel, categoryIcon, FILE_TYPE_LABEL } from '@/features/dogs/documentCategories';
import type { DogDocument } from './types';

function fmtDate(d: string | null): string | null {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Dokumentenordner: moderne Karten echter Uploads (Titel · Kategorie-Badge ·
// Dateityp · Datum). Antippen öffnet die Datei (Signed-URL). Leer → Empty State.
export function DogDocumentsCard({
  documents, onAdd, onOpen, onDelete,
}: {
  documents: DogDocument[];
  onAdd: () => void;
  onOpen?: (doc: DogDocument) => void;
  onDelete?: (doc: DogDocument) => void;
}) {
  if (documents.length === 0) {
    return (
      <View style={s.empty}>
        <View style={s.emptyIcon}><Ionicons name="folder-open-outline" size={26} color={C.trackPrimary} /></View>
        <Text style={s.emptyTitle}>Noch keine Dokumente</Text>
        <Text style={s.emptyTxt}>
          Lade wichtige Unterlagen deines Hundes hoch – zum Beispiel Impfpass, Stammbaum, Prüfungen oder Tierarztberichte.
        </Text>
        <AnyvoButton label="Dokument hinzufügen" icon="add" onPress={onAdd} />
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      {documents.map(d => {
        const date = fmtDate(d.issuedOn ?? d.createdAt);
        return (
          <TouchableOpacity key={d.id} style={s.docCard} activeOpacity={onOpen ? 0.75 : 1} onPress={() => onOpen?.(d)}>
            <View style={s.docIcon}><Ionicons name={categoryIcon(d.category)} size={20} color={C.trackPrimary} /></View>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={s.docTitle} numberOfLines={1}>{d.title}</Text>
              <View style={s.metaRow}>
                <View style={s.badge}><Text style={s.badgeTxt}>{categoryLabel(d.category)}</Text></View>
                <Text style={s.metaTxt}>{FILE_TYPE_LABEL[d.fileType]}{date ? ` · ${date}` : ''}</Text>
              </View>
            </View>
            {onDelete ? (
              <TouchableOpacity hitSlop={8} onPress={() => onDelete(d)} style={s.trash} activeOpacity={0.7}>
                <Ionicons name="trash-outline" size={17} color={C.trackTextMut} />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        );
      })}
      <AnyvoButton label="Dokument hinzufügen" icon="add" variant="secondary" onPress={onAdd} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap:       { gap: 10 },
  docCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, padding: 13 },
  docIcon:    { width: 42, height: 42, borderRadius: 13, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  docTitle:   { fontSize: 15.5, color: C.trackText, fontWeight: '800' },
  metaRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge:      { backgroundColor: C.trackCardAlt, borderRadius: 8, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTxt:   { fontSize: 10.5, color: C.trackTextSec, fontWeight: '800', letterSpacing: 0.3 },
  metaTxt:    { fontSize: 11.5, color: C.trackTextMut, fontWeight: '600' },
  trash:      { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  empty:      { gap: 12, alignItems: 'center', borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, paddingHorizontal: 20, paddingVertical: 26 },
  emptyIcon:  { width: 56, height: 56, borderRadius: 18, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16.5, color: C.trackText, fontWeight: '800' },
  emptyTxt:   { fontSize: 13.5, color: C.trackTextSec, fontWeight: '500', lineHeight: 19, textAlign: 'center', marginBottom: 2 },
});
