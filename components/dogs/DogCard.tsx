import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SignedImage } from '@/components/ui/SignedImage';
import { DogIcon } from '@/components/ui/DogIcon';
import { FT } from '@/constants/colors';
import { updateDog } from '@/services/dogs';
import type { Dog } from '@/types';

// ── ListRich — reichhaltige Hunde-Listenkarte im ANYVO-Look (NativeWind, ft-Tokens).
//    Avatar · Name · Rasse/Geschlecht · Info-Chips (Alter, Gewicht, Titel)
//    + Favorit-Herz („Herz"-Feld) + Schnell-Bearbeiten.

function alterLabel(birth: string | null): string | null {
  if (!birth) return null;
  const monate = Math.floor((Date.now() - new Date(birth).getTime()) / (30 * 24 * 3600 * 1000));
  if (monate < 0) return null;
  return monate < 12 ? `${monate} Mon.` : `${(monate / 12).toFixed(monate % 12 === 0 ? 0 : 1)} J.`;
}

function Chip({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <View className={`rounded-[8px] px-2 py-[3px] border ${accent ? 'bg-ft-acc-dim border-[rgba(21,230,195,0.4)]' : 'bg-white/5 border-ft-line'}`}>
      <Text className={`text-[11px] font-semibold ${accent ? 'text-ft-acc' : 'text-ft-muted'}`}>{label}</Text>
    </View>
  );
}

type Props = { dog: Dog; onPress?: () => void };

export function DogCard({ dog, onPress }: Props) {
  const router = useRouter();
  const [fav, setFav] = useState(!!dog.is_favorite);

  const alter = alterLabel(dog.birth_date);
  const gender = dog.gender === 'male' ? '♂ Rüde' : dog.gender === 'female' ? '♀ Hündin' : null;
  const titles = (dog.titles ?? []).slice(0, 2);

  const openDetail = onPress ?? (() => router.push(`/dog/${dog.id}` as never));

  const toggleFav = () => {
    const next = !fav;
    setFav(next);                                   // optimistisch
    updateDog(dog.id, { is_favorite: next }).then(({ error }) => { if (error) setFav(!next); });
  };

  return (
    <Pressable
      onPress={openDetail}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      className="flex-row items-center gap-[14px] rounded-ft-md border border-ft-line-strong bg-ft-surface2 p-4"
    >
      {dog.photo_url ? (
        <SignedImage url={dog.photo_url} style={{ width: 60, height: 60, borderRadius: 17 }} contentFit="cover" />
      ) : (
        <View className="w-[60px] h-[60px] rounded-[17px] items-center justify-center bg-ft-acc-dim">
          <DogIcon size={26} color={FT.acc} />
        </View>
      )}

      <View className="flex-1 gap-[3px]">
        <Text className="text-[16.5px] font-extrabold text-ft-text" numberOfLines={1}>{dog.name}</Text>
        {(dog.breed || gender) ? (
          <Text className="text-[12.5px] text-ft-muted" numberOfLines={1}>
            {dog.breed ?? ''}{dog.breed && gender ? ' · ' : ''}{gender ?? ''}
          </Text>
        ) : null}
        <View className="flex-row flex-wrap gap-1.5 mt-1.5">
          {alter ? <Chip label={alter} /> : null}
          {dog.weight_kg != null ? <Chip label={`${dog.weight_kg} kg`} /> : null}
          {titles.map((t, i) => <Chip key={`${t}-${i}`} label={t} accent />)}
        </View>
      </View>

      <View className="items-center gap-2">
        <Pressable
          onPress={toggleFav}
          hitSlop={8}
          className={`w-9 h-9 rounded-[11px] items-center justify-center border ${fav ? 'bg-[rgba(255,93,108,0.14)] border-[rgba(255,93,108,0.4)]' : 'bg-white/5 border-ft-line'}`}
        >
          <Ionicons name={fav ? 'heart' : 'heart-outline'} size={16} color={fav ? FT.bad : FT.muted} />
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/edit-dog', params: { id: dog.id } } as never)}
          hitSlop={8}
          className="w-9 h-9 rounded-[11px] items-center justify-center bg-white/5 border border-ft-line"
        >
          <Ionicons name="pencil-outline" size={15} color={FT.muted} />
        </Pressable>
      </View>
    </Pressable>
  );
}
