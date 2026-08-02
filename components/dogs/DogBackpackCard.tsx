import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { backpackStatus } from '@/features/dogs/backpack';

// Kompakte Rucksack-Card im Hunde-Überblick. Zeigt nur eine Zusammenfassung
// (nie die komplette Checkliste) und öffnet den Verwaltungsscreen. Ganze Card
// ist tappbar. Additiv — ersetzt keine bestehende Übersichtskarte.
export function DogBackpackCard({
  dogName, total, active, packed, onOpen,
}: {
  dogName: string;
  total: number;
  active: number;
  packed: number;
  onOpen: () => void;
}) {
  const { t } = useT();
  const empty = total === 0;

  // Kompakter Statustext (Dashboard): „Alles bereit" / „Noch nichts eingepackt"
  // / „{packed} von {total} eingepackt".
  const status = backpackStatus(active, packed);
  const statusText =
    status === 'all_ready'   ? t('backpack.allReady') :
    status === 'none_packed' ? t('backpack.nonePacked') :
    t('backpack.packedSummary', { packed, total: active });
  const subText = empty
    ? t('backpack.emptyText')
    : `${t('backpack.activeItems', { count: active })} · ${statusText}`;

  const a11yLabel = empty
    ? `${t('backpack.title')}. ${t('backpack.emptyText')}`
    : `${t('backpack.ownTitle', { name: dogName })}. ${subText}`;

  return (
    <TouchableOpacity
      style={s.card}
      onPress={onOpen}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={empty ? t('backpack.emptySetup') : t('backpack.view')}
    >
      <View style={s.icon}>
        <Ionicons name="bag-handle-outline" size={18} color={C.trackPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.title} numberOfLines={1}>
          {empty ? t('backpack.title') : t('backpack.ownTitle', { name: dogName })}
        </Text>
        <Text style={s.sub} numberOfLines={2}>{subText}</Text>
      </View>
      <Text style={s.link}>{empty ? t('backpack.emptySetup') : t('backpack.view')}</Text>
      <Ionicons name="chevron-forward" size={16} color={C.trackTextMut} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, padding: 14 },
  icon:  { width: 34, height: 34, borderRadius: 11, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14.5, color: C.trackText, fontWeight: '800' },
  sub:   { fontSize: 12, color: C.trackTextSec, fontWeight: '600', marginTop: 2 },
  link:  { fontSize: 13, color: C.trackPrimary, fontWeight: '800' },
});
