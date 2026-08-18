import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';

export interface PremiumInlineUpsellProps {
  /** Kurzer, feature-spezifischer Titel, z. B. „Gewichtsverlauf mit Active". */
  title: string;
  /** Optionaler Untertitel. */
  subtitle?: string;
  ctaLabel?: string;
  onPress?: () => void;
}

// Dezenter Inline-Premium-Hinweis für gesperrte WEITERFÜHRENDE Funktionen. Ersetzt
// NICHT den ganzen Screen — die Basiswerte bleiben darüber sichtbar/bearbeitbar.
// CTA führt auf die bestehende /premium-(Membership/Upgrade-)Logik.
export function PremiumInlineUpsell({ title, subtitle, ctaLabel, onPress }: PremiumInlineUpsellProps) {
  const { t } = useT();
  const router = useRouter();
  const go = onPress ?? (() => router.push('/premium' as never));
  return (
    <TouchableOpacity style={s.card} onPress={go} activeOpacity={0.85}
      accessibilityRole="button" accessibilityLabel={`${title}. ${ctaLabel ?? t('premiumUpsell.cta')}`}>
      <View style={s.iconWrap}>
        <Ionicons name="lock-closed" size={15} color={C.accent} />
      </View>
      <View style={s.body}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        <Text style={s.sub} numberOfLines={2}>{subtitle ?? t('premiumUpsell.subtitle')}</Text>
      </View>
      <View style={s.cta}>
        <Text style={s.ctaTxt}>{ctaLabel ?? t('premiumUpsell.cta')}</Text>
        <Ionicons name="chevron-forward" size={14} color={C.accent} />
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card:     { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12 },
  iconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  body:     { flex: 1, minWidth: 0 },
  title:    { fontSize: 14, color: C.white, fontWeight: '800' },
  sub:      { fontSize: 12, color: C.muted, fontWeight: '500', marginTop: 2, lineHeight: 16 },
  cta:      { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ctaTxt:   { fontSize: 12.5, color: C.accent, fontWeight: '800' },
});
