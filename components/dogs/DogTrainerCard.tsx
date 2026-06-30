import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { C } from '@/constants/colors';
import type { DogTrainer } from './types';

// Trainer-Karte: Name, aktueller Plan, letzter Kommentar, „Zum Chat".
export function DogTrainerCard({ trainer, onChat }: { trainer: DogTrainer | null; onChat: () => void }) {
  if (!trainer || (!trainer.name && !trainer.plan && !trainer.lastComment)) {
    return (
      <View style={s.empty}>
        <Ionicons name="people-outline" size={22} color={C.trackTextMut} />
        <Text style={s.emptyTxt}>Noch kein Trainer verknüpft.</Text>
      </View>
    );
  }
  return (
    <View style={s.wrap}>
      <View style={s.card}>
        <View style={s.head}>
          <View style={s.avatar}><Text style={s.avatarTxt}>{(trainer.name?.[0] ?? '?').toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.name} numberOfLines={1}>{trainer.name ?? 'Trainer'}</Text>
            {trainer.plan ? <Text style={s.plan} numberOfLines={2}>{trainer.plan}</Text> : null}
          </View>
        </View>
        {trainer.lastComment ? (
          <View style={s.comment}>
            <Ionicons name="chatbubble-ellipses-outline" size={14} color={C.trackPrimary} />
            <Text style={s.commentTxt}>{trainer.lastComment}</Text>
          </View>
        ) : null}
      </View>
      <AnyvoButton label="Zum Chat" icon="chatbubbles" onPress={onChat} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap:      { gap: 12 },
  card:      { borderRadius: 20, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, padding: 16, gap: 12 },
  head:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar:    { width: 46, height: 46, borderRadius: 14, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 18, color: C.trackPrimary, fontWeight: '900' },
  name:      { fontSize: 16, color: C.trackText, fontWeight: '800' },
  plan:      { fontSize: 13, color: C.trackTextSec, fontWeight: '500', marginTop: 2 },
  comment:   { flexDirection: 'row', gap: 9, backgroundColor: C.trackCardAlt, borderRadius: 12, padding: 11 },
  commentTxt:{ flex: 1, fontSize: 13, color: C.trackText, fontWeight: '500', lineHeight: 18 },
  empty:     { borderRadius: 20, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, padding: 24, alignItems: 'center', gap: 8 },
  emptyTxt:  { fontSize: 13.5, color: C.trackTextMut },
});
