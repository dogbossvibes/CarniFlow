import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useMyTrainers } from '@/hooks/useTrainer';
import { tapHaptic } from '@/lib/haptics';

const ACCENT = '#00F5D4';

export function TrainerSelector({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const router = useRouter();
  const { trainers } = useMyTrainers();

  if (trainers.length === 0) {
    return (
      <TouchableOpacity style={s.invite} onPress={() => router.push('/trainer')} activeOpacity={0.8}>
        <Ionicons name="person-add-outline" size={18} color={ACCENT} />
        <Text style={s.inviteTxt}>Trainer verbinden</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      {trainers.map(t => {
        const active = value === t.trainerId;
        return (
          <TouchableOpacity
            key={t.relationshipId}
            style={[s.row, active && s.rowActive]}
            onPress={() => { tapHaptic(); onChange(active ? null : t.trainerId); }}
            activeOpacity={0.8}
          >
            <View style={[s.avatar, active && { borderColor: ACCENT }]}>
              <Ionicons name="person" size={16} color={active ? ACCENT : C.muted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.name, active && { color: C.white }]} numberOfLines={1}>{t.name ?? 'Trainer'}</Text>
              {t.location ? <Text style={s.sub}>{t.location}</Text> : null}
            </View>
            {active
              ? <Ionicons name="checkmark-circle" size={20} color={ACCENT} />
              : <Ionicons name="ellipse-outline" size={20} color={C.subtle} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  invite:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 12, borderWidth: 1, borderColor: `${ACCENT}55`, backgroundColor: 'rgba(0,245,212,0.08)' },
  inviteTxt: { fontSize: 14, color: ACCENT, fontWeight: '700' },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  rowActive: { borderColor: ACCENT, backgroundColor: 'rgba(0,245,212,0.1)' },
  avatar:    { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center', backgroundColor: C.cardAlt },
  name:      { fontSize: 14, color: C.muted, fontWeight: '700' },
  sub:       { fontSize: 12, color: C.subtle, marginTop: 1 },
});
