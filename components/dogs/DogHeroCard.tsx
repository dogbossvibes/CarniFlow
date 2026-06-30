import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SignedImage } from '@/components/ui/SignedImage';
import { DogIcon } from '@/components/ui/DogIcon';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { C } from '@/constants/colors';
import { genderLabel, type DogIdentity } from './types';

// Emotionale Hero-Card für Home/Dashboard: grosses Bild + Identität + heutige
// Empfehlung + „Training starten". Bild fehlt ⇒ Anyvo-Avatar.
export function DogHeroCard({
  identity, lastTrainingLabel, todayRecommendation, onStartTraining, onPress,
}: {
  identity: DogIdentity;
  lastTrainingLabel: string | null;
  todayRecommendation: string | null;
  onStartTraining: () => void;
  onPress?: () => void;
}) {
  const meta = [identity.breed, identity.ageLabel, genderLabel(identity.gender), identity.discipline].filter(Boolean).join(' · ');

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && onPress ? { opacity: 0.95 } : null]}>
      <View style={s.imgWrap}>
        {identity.photoUrl ? (
          <SignedImage url={identity.photoUrl} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <View style={[StyleSheet.absoluteFill, s.imgFallback]}><DogIcon size={64} color={C.trackPrimary} /></View>
        )}
        <LinearGradient colors={['transparent', 'rgba(5,5,5,0.2)', 'rgba(5,5,5,0.92)']} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={s.overlay}>
          {identity.statusLabel ? (
            <View style={s.statusBadge}><Text style={s.statusTxt} numberOfLines={1}>{identity.statusLabel}</Text></View>
          ) : null}
          <Text style={s.name} numberOfLines={1} adjustsFontSizeToFit>{identity.name}</Text>
          {meta ? <Text style={s.meta} numberOfLines={2}>{meta}</Text> : null}
        </View>
      </View>

      <View style={s.body}>
        {lastTrainingLabel ? (
          <View style={s.row}>
            <Ionicons name="time-outline" size={15} color={C.trackTextMut} />
            <Text style={s.rowTxt} numberOfLines={1}>Letztes Training: <Text style={s.rowStrong}>{lastTrainingLabel}</Text></Text>
          </View>
        ) : null}
        {todayRecommendation ? (
          <View style={s.tip}>
            <Ionicons name="sparkles" size={14} color={C.trackPrimary} />
            <Text style={s.tipTxt}>{todayRecommendation}</Text>
          </View>
        ) : null}
        <AnyvoButton label="Training starten" icon="play" onPress={onStartTraining} />
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card:        { borderRadius: 24, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, overflow: 'hidden' },
  imgWrap:     { height: 210, justifyContent: 'flex-end' },
  imgFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentDim },
  overlay:     { padding: 18, gap: 4 },
  statusBadge: { alignSelf: 'flex-start', backgroundColor: C.accentDim, borderColor: C.accentMid, borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5, marginBottom: 4 },
  statusTxt:   { fontSize: 11.5, color: C.trackPrimary, fontWeight: '800', letterSpacing: 0.3 },
  name:        { fontSize: 30, color: C.trackText, fontWeight: '900', letterSpacing: -0.8 },
  meta:        { fontSize: 13.5, color: 'rgba(255,255,255,0.72)', fontWeight: '500' },
  body:        { padding: 16, gap: 12 },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTxt:      { flex: 1, fontSize: 13, color: C.trackTextMut, fontWeight: '500' },
  rowStrong:   { color: C.trackText, fontWeight: '700' },
  tip:         { flexDirection: 'row', gap: 9, backgroundColor: C.accentDim, borderRadius: 14, borderWidth: 1, borderColor: C.accentMid, padding: 12 },
  tipTxt:      { flex: 1, fontSize: 13, color: C.trackText, fontWeight: '600', lineHeight: 18 },
});
