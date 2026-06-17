import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useVoiceNotes } from '@/features/voice/hooks/useVoiceNotes';
import { VoiceNotePlayer } from '@/features/voice/components/VoiceNotePlayer';

// Liste aller Sprachmemos einer Einheit/Track-Session.
export function VoiceNotesList({
  trainingUnitId, trainingSessionId, emptyHint = true,
}: {
  trainingUnitId?: string;
  trainingSessionId?: string;
  emptyHint?: boolean;
}) {
  const { notes, isLoading, remove, refetch } = useVoiceNotes({ trainingUnitId, trainingSessionId });

  if (isLoading) return null;
  if (notes.length === 0) {
    return emptyHint ? (
      <View style={s.empty}>
        <Ionicons name="mic-off-outline" size={22} color={C.subtle} />
        <Text style={s.emptyTxt}>Keine Sprachmemo vorhanden.</Text>
      </View>
    ) : null;
  }

  return (
    <View style={{ gap: 10 }}>
      {notes.map(n => (
        <VoiceNotePlayer key={n.id} note={n} onDelete={remove} onUpdated={() => refetch()} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  empty:    { alignItems: 'center', gap: 8, paddingVertical: 22 },
  emptyTxt: { fontSize: 13, color: C.muted },
});
