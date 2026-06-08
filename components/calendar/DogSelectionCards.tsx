import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { SignedImage } from '@/components/ui/SignedImage';
import { DogIcon } from '@/components/ui/DogIcon';
import { useDogs } from '@/hooks/useDogs';
import { tapHaptic } from '@/lib/haptics';

const ACCENT = '#00F5D4';

function alter(birth: string | null): string {
  if (!birth) return '';
  const months = Math.floor((Date.now() - new Date(birth).getTime()) / (30 * 24 * 3600 * 1000));
  return months < 12 ? `${months} Mon.` : `${(months / 12).toFixed(1)} J.`;
}

export function DogSelectionCards({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
  const { dogs } = useDogs();
  if (dogs.length === 0) return null;

  return (
    <View style={s.grid}>
      {dogs.map(d => {
        const active = selected.includes(d.id);
        return (
          <TouchableOpacity
            key={d.id}
            style={[s.card, active && s.cardActive]}
            onPress={() => { tapHaptic(); onToggle(d.id); }}
            activeOpacity={0.85}
          >
            <View style={s.avatar}>
              {d.photo_url
                ? <SignedImage url={d.photo_url} style={StyleSheet.absoluteFill} contentFit="cover" />
                : <DogIcon size={22} color={active ? ACCENT : C.muted} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.name, active && { color: C.white }]} numberOfLines={1}>{d.name}</Text>
              <Text style={s.sub} numberOfLines={1}>
                {[d.breed, alter(d.birth_date)].filter(Boolean).join(' · ') || 'Hund'}
              </Text>
            </View>
            {active && <View style={s.check}><Ionicons name="checkmark" size={12} color="#001210" /></View>}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  grid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card:  { width: '47.8%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  cardActive: { borderColor: ACCENT, backgroundColor: 'rgba(0,245,212,0.1)', shadowColor: ACCENT, shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 5 },
  avatar:{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: C.cardAlt, alignItems: 'center', justifyContent: 'center' },
  name:  { fontSize: 14, color: C.muted, fontWeight: '700' },
  sub:   { fontSize: 11, color: C.subtle, marginTop: 1 },
  check: { position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
});
