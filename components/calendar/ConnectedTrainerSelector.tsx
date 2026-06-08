import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useMyTrainers } from '@/hooks/useTrainer';
import { tapHaptic } from '@/lib/haptics';

const ACCENT = '#00F5D4';

export function ConnectedTrainerSelector({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
      {trainers.map(t => {
        const active = value === t.trainerId;
        const type = t.specialties?.[0] ?? 'Trainer';
        return (
          <TouchableOpacity
            key={t.relationshipId}
            style={[s.card, active && s.cardActive]}
            onPress={() => { tapHaptic(); onChange(active ? null : t.trainerId); }}
            activeOpacity={0.85}
          >
            <View style={s.top}>
              <View style={[s.avatar, active && { borderColor: ACCENT }]}>
                <Ionicons name="person" size={20} color={active ? ACCENT : C.muted} />
              </View>
              {active
                ? <View style={s.check}><Ionicons name="checkmark" size={13} color="#001210" /></View>
                : t.isVerified ? <Ionicons name="shield-checkmark" size={16} color={ACCENT} /> : null}
            </View>
            <Text style={[s.name, active && { color: C.white }]} numberOfLines={1}>{t.name ?? 'Trainer'}</Text>
            <Text style={s.type} numberOfLines={1}>{type}</Text>
            <View style={s.statusRow}>
              <View style={s.statusDot} />
              <Text style={s.status}>Verbunden</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row:       { gap: 10, paddingRight: 8 },
  card:      { width: 170, borderRadius: 18, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, padding: 14, gap: 6 },
  cardActive:{ borderColor: ACCENT, backgroundColor: 'rgba(0,245,212,0.1)', shadowColor: ACCENT, shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  top:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatar:    { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center', backgroundColor: C.cardAlt },
  check:     { width: 22, height: 22, borderRadius: 11, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  name:      { fontSize: 15, color: C.muted, fontWeight: '800', marginTop: 4 },
  type:      { fontSize: 12, color: C.subtle, fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#00F5D4' },
  status:    { fontSize: 11, color: '#00F5D4', fontWeight: '700' },
  invite:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 12, borderWidth: 1, borderColor: `${ACCENT}55`, backgroundColor: 'rgba(0,245,212,0.08)' },
  inviteTxt: { fontSize: 14, color: ACCENT, fontWeight: '700' },
});
