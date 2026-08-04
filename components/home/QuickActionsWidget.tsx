import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { C } from '@/constants/colors';
import {
  HOME_QUICK_ACTIONS_META,
  actionIdOf,
  type HomeLayoutMode,
  type HomeQuickActionEntry,
  type HomeQuickActionId,
} from '@/stores/homeScreenConfig';
import { useT, type TranslationKey } from '@/i18n';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const QUICK_ACTION_LABEL_KEY: Record<HomeQuickActionId, TranslationKey> = {
  add_dog: 'home.actionAddDog',
  start_timer: 'home.actionStartTimer',
  track_gps: 'home.actionTrackGps',
  lay_track: 'home.actionLayTrack',
  document_training: 'home.actionDocumentTraining',
  start_obedience: 'home.actionStartObedience',
  show_analysis: 'home.actionShowAnalysis',
  training_journal: 'home.actionTrainingJournal',
  dog_backpack: 'home.actionDogBackpack',
};

// Schnellzugriffe-Widget: rendert die konfigurierten Aktionen aus der zentralen
// Registry in einem der drei Layouts. Reine Darstellung — jede Aktion nutzt die
// bestehende Route (kein doppelter Screen, keine Business-Logik hier).
export function QuickActionsWidget({
  actions,
  layout,
  dogs,
}: {
  actions: HomeQuickActionEntry[];
  layout: HomeLayoutMode;
  dogs: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { t } = useT();
  if (actions.length === 0) return null;

  const go = (entry: HomeQuickActionEntry) => {
    const actionId = actionIdOf(entry);
    const meta = HOME_QUICK_ACTIONS_META[actionId];
    if (actionId !== 'dog_backpack') {
      router.push(meta.route as never);
      return;
    }
    const dogId = typeof entry === 'string' ? undefined : entry.dogId;
    const dog = dogId ? dogs.find(item => item.id === dogId) : undefined;
    if (!dog) {
      Alert.alert(t('home.dogUnavailable'), t('home.removeUnavailableAction'));
      return;
    }
    router.push({ pathname: '/dog-backpack/[id]', params: { id: dog.id, name: dog.name } } as never);
  };

  return (
    <View style={s.wrap}>
      <View style={s.kopf}>
        <Text style={s.titel}>{t('home.quickStart')}</Text>
      </View>

      <View style={layout === 'list' ? s.listWrap : s.gridWrap}>
        {actions.map((entry) => {
          const id = actionIdOf(entry);
          const meta = HOME_QUICK_ACTIONS_META[id];
          if (!meta) return null; // unbekannte/veraltete ID → still überspringen (kein Crash)
          const label = t(QUICK_ACTION_LABEL_KEY[id]);
          const instanceId = typeof entry === 'string' ? entry : entry.instanceId;

          if (layout === 'list') {
            return (
              <AnimatedPressable
                key={instanceId}
                style={s.listRow}
                scale={0.98}
                onPress={() => go(entry)}
                accessibilityRole="button"
                accessibilityLabel={label}
              >
                <View style={s.listIcon}>
                  <Ionicons name={meta.icon as IconName} size={22} color={C.accent} />
                </View>
                <Text style={s.listLabel} numberOfLines={1}>{label}</Text>
                <Ionicons name="chevron-forward" size={18} color={C.muted} />
              </AnimatedPressable>
            );
          }

          // grid | compact — Kacheln (kompakt = kleiner, 3 pro Reihe)
          const compact = layout === 'compact';
          return (
            <AnimatedPressable
              key={instanceId}
              style={[s.tile, compact ? s.tileCompact : s.tileGrid]}
              scale={0.96}
              onPress={() => go(entry)}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Ionicons name={meta.icon as IconName} size={compact ? 20 : 24} color={C.accent} />
              <Text
                style={[s.tileLabel, compact && s.tileLabelCompact]}
                numberOfLines={2}
              >
                {label}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 20, marginBottom: 28 },
  kopf: { marginBottom: 14 },
  titel: { fontSize: 15, color: C.white, fontWeight: '800', letterSpacing: 0.3 },

  // Grid / Compact: flexibles Wrap-Raster
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    padding: 14,
    gap: 10,
    justifyContent: 'center',
  },
  // 2 pro Reihe (Raster): (100% - gap) / 2 ≈ 47%
  tileGrid: { width: '47%', minHeight: 96 },
  // 3 pro Reihe (Kompakt): (100% - 2*gap) / 3 ≈ 30%
  tileCompact: { width: '30%', minHeight: 78, padding: 10, gap: 6 },
  tileLabel: { fontSize: 13, color: C.white, fontWeight: '700', letterSpacing: -0.2 },
  tileLabelCompact: { fontSize: 11 },

  // Liste: breite Zeilen
  listWrap: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
  },
  listIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: C.accentDim,
    alignItems: 'center', justifyContent: 'center',
  },
  listLabel: { flex: 1, fontSize: 15, color: C.white, fontWeight: '700' },
});
