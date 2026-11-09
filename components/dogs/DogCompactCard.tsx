import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { DogAvatar } from './DogAvatar';
import { genderLabel, type DogIdentity } from './types';
import { useT } from '@/i18n';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Kompakte Listenkarte: Avatar · Name · Rasse/Alter/Geschlecht · Sparten-Badge ·
// letztes Training + Schnellaktionen (Training/Fährte/Statistik). Tap → Dog Hub.
export function DogCompactCard({
  identity, lastTrainingLabel, openHintLabel, onOpen, onTraining, onFaehrte, onStats, trackColor, trackColorLabel,
}: {
  trackColor?: string;
  trackColorLabel?: string;
  identity: DogIdentity;
  /** Fertiger Text, z. B. „Letztes Training: vor 3 Tagen · Unterordnung“ (T-184 Etappe 2). */
  lastTrainingLabel: string | null;
  openHintLabel?: string | null;
  onOpen: () => void;
  onTraining: () => void;
  onFaehrte: () => void;
  onStats: () => void;
}) {
  const { t } = useT();
  const meta = [identity.breed, identity.ageLabel, genderLabel(identity.gender)].filter(Boolean).join(' · ');

  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [s.card, pressed && { opacity: 0.9 }]}>
      <View style={s.top}>
        <DogAvatar photoUrl={identity.photoUrl} size={58} />
        <View style={s.info}>
          <View style={s.nameRow}>
            <Text style={s.name} numberOfLines={1}>{identity.name}</Text>
            {identity.discipline ? (
              <View style={s.badge}><Text style={s.badgeTxt} numberOfLines={1}>{identity.discipline}</Text></View>
            ) : null}
          </View>
          {meta ? <Text style={s.meta} numberOfLines={1}>{meta}</Text> : null}
          {lastTrainingLabel ? <Text style={s.last} numberOfLines={1}>{lastTrainingLabel}</Text> : null}
          {openHintLabel ? <Text style={s.hint} numberOfLines={2}>{openHintLabel}</Text> : null}
        </View>
        {trackColor && <View testID="dog-track-color-stripe" accessible accessibilityLabel={trackColorLabel} style={{ width: 5, height: 38, borderRadius: 3, borderWidth: 0.5, borderColor: '#888888', backgroundColor: trackColor }} />}
        <Ionicons name="chevron-forward" size={18} color={C.trackTextMut} />
      </View>

      <View style={s.actions}>
        <QuickIcon icon="barbell-outline" label={lastTrainingLabel ? t('continueTraining.next') : 'Training'}
          a11yLabel={lastTrainingLabel ? `${t('continueTraining.next')}: ${identity.name}` : undefined} onPress={onTraining} />
        <QuickIcon icon="footsteps-outline" label="Fährte" onPress={onFaehrte} />
        <QuickIcon icon="stats-chart-outline" label="Statistik" onPress={onStats} />
      </View>
    </Pressable>
  );
}

function QuickIcon({ icon, label, a11yLabel, onPress }: { icon: IconName; label: string; a11yLabel?: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.qi} onPress={onPress} activeOpacity={0.8} hitSlop={6} accessibilityRole="button" accessibilityLabel={a11yLabel ?? label}>
      <Ionicons name={icon} size={17} color={C.trackPrimary} />
      <Text style={s.qiTxt} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card:    { borderRadius: 20, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, padding: 14, gap: 12 },
  top:     { flexDirection: 'row', alignItems: 'center', gap: 14 },
  info:    { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name:    { flexShrink: 1, fontSize: 17, color: C.trackText, fontWeight: '800', letterSpacing: -0.3 },
  badge:   { backgroundColor: C.accentDim, borderColor: C.accentMid, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  badgeTxt:{ fontSize: 10.5, color: C.trackPrimary, fontWeight: '800' },
  meta:    { fontSize: 12.5, color: C.trackTextSec, fontWeight: '500' },
  last:    { fontSize: 12.5, color: C.trackTextSec, fontWeight: '600', marginTop: 1 },
  hint:    { fontSize: 12.5, color: C.trackPrimary, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: C.trackBorder, paddingTop: 12 },
  qi:      { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.trackCardAlt, borderRadius: 12, paddingVertical: 10 },
  qiTxt:   { fontSize: 12, color: C.trackText, fontWeight: '700' },
});
