import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import type { TranslationKey } from '@/i18n/de-CH';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
export type QuickActionKey = 'unterordnung' | 'faehrte' | 'schutzdienst' | 'spiel' | 'custom';

// Schnellstart-Kacheln (Training-Tab): bewusst nur Unterordnung, Fährte, Custom.
// Schutzdienst & Spiel & Motivation sind hier NICHT gelistet — sie bleiben aber
// als Trainingsart/Disziplin (Historie, Doku, Auswertung) vollständig erhalten.
// a11y = VoiceOver/TalkBack-Label. Reihenfolge = Anzeige.
export const QUICK_ACTION_ITEMS: {
  key: QuickActionKey;
  label: string;
  labelKey: TranslationKey;
  icon: IconName;
  a11y: string;
  a11yKey: TranslationKey;
}[] = [
  { key: 'unterordnung', label: 'Unterordnung', labelKey: 'dog.quickUnterordnung', icon: 'ribbon-outline',     a11y: 'Unterordnung starten', a11yKey: 'dog.quickUnterordnungA11y' },
  { key: 'faehrte',      label: 'Fährte',       labelKey: 'dog.quickFaehrte',      icon: 'footsteps-outline',  a11y: 'Fährte starten',       a11yKey: 'dog.quickFaehrteA11y' },
  { key: 'custom',       label: 'Custom',       labelKey: 'dog.quickCustom',       icon: 'add-circle-outline', a11y: 'Eigenes Training starten', a11yKey: 'dog.quickCustomA11y' },
];

// Schnellstart-Kacheln für das Training-Tab.
export function DogQuickActions({ onSelect }: { onSelect: (key: QuickActionKey) => void }) {
  // Lazy import keeps static tests for QUICK_ACTION_ITEMS free of native AsyncStorage.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useT } = require('@/i18n') as typeof import('@/i18n');
  const { t } = useT();
  return (
    <View style={s.grid}>
      {QUICK_ACTION_ITEMS.map(it => (
        <TouchableOpacity
          key={it.key}
          style={s.tile}
          activeOpacity={0.85}
          onPress={() => onSelect(it.key)}
          accessibilityRole="button"
          accessibilityLabel={t(it.a11yKey)}
        >
          {/* Icon direkt auf Mint (keine dunkle Icon-Box mehr), schwarz */}
          <Ionicons name={it.icon} size={24} color={C.accentText} />
          <Text
            style={s.label}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {t(it.labelKey)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  // Drei gleich breite Kacheln in einer Reihe (flex:1), sauberer Zwischenraum.
  grid:  { flexDirection: 'row', gap: 10 },
  tile:  {
    flex: 1,
    minWidth: 0,                 // erlaubt gleichmässiges Schrumpfen auf schmalen Geräten
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.accent,   // ANYVO-Mint (= aktiver Training-Tab-Akzent), vollflächig
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 6,
  },
  // Schwarze Schrift auf Mint; einzeilig, schrumpft statt umzubrechen/abzuschneiden.
  label: { fontSize: 13, color: C.accentText, fontWeight: '800', textAlign: 'center', letterSpacing: -0.2, flexShrink: 1 },
});
