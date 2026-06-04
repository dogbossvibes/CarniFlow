import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SignedImage } from '@/components/ui/SignedImage';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { DogIcon } from '@/components/ui/DogIcon';
import type { Dog } from '@/types';

function altersLabel(geburtsDatum: string | null): string {
  if (!geburtsDatum) return '';
  const monate = Math.floor((Date.now() - new Date(geburtsDatum).getTime()) / (30 * 24 * 3600 * 1000));
  return monate < 12 ? `${monate} Mon.` : `${Math.floor(monate / 12)} J.`;
}

type Props = { dog: Dog; onPress?: () => void };

export function DogCard({ dog, onPress }: Props) {
  const router = useRouter();
  const alter  = altersLabel(dog.birth_date);

  const handlePress = onPress ?? (() => router.push(`/dog/${dog.id}` as never));

  return (
    <AnimatedPressable style={s.card} onPress={handlePress}>
      {dog.photo_url ? (
        <SignedImage
          url={dog.photo_url}
          style={s.avatarImage}
          contentFit="cover"
        />
      ) : (
        <View style={[s.avatar, { backgroundColor: `${C.accent}14` }]}>
          <DogIcon size={24} color={C.accent} />
        </View>
      )}

      <View style={s.info}>
        <Text style={s.name}>{dog.name}</Text>
        {dog.breed ? <Text style={s.breed} numberOfLines={1}>{dog.breed}</Text> : null}
        <View style={s.badges}>
          {alter ? <Badge label={alter} color={C.accent} /> : null}
          {dog.gender ? <Badge label={dog.gender === 'male' ? '♂ Rüde' : '♀ Hündin'} color={C.muted} /> : null}
        </View>
      </View>

      <TouchableOpacity
        style={s.editBtn}
        onPress={() => router.push({ pathname: '/edit-dog', params: { id: dog.id } } as never)}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="pencil-outline" size={15} color={C.muted} />
      </TouchableOpacity>
    </AnimatedPressable>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[s.badge, { backgroundColor: `${color}15` }]}>
      <Text style={[s.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: C.card,
    borderRadius:    18,
    borderWidth:     1,
    borderColor:     C.border,
    padding:         16,
    gap:             14,
  },
  avatar:      { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 54, height: 54, borderRadius: 16 },
  info:      { flex: 1, gap: 2 },
  name:      { fontSize: 16, color: C.white, fontWeight: '700', letterSpacing: -0.2 },
  breed:     { fontSize: 13, color: C.muted },
  badges:    { flexDirection: 'row', gap: 6, marginTop: 6 },
  badge:     { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  editBtn: {
    width:           34,
    height:          34,
    borderRadius:    10,
    backgroundColor: C.card,
    borderWidth:     1,
    borderColor:     C.border,
    alignItems:      'center',
    justifyContent:  'center',
  },
});
