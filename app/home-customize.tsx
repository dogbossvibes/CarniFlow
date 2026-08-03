import { C } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';
import {
  HOME_LAYOUT_LABEL,
  HOME_LAYOUT_MODES,
  HOME_QUICK_ACTIONS_META,
  HOME_WIDGETS_META,
  ALL_QUICK_ACTIONS,
  MAX_QUICK_ACTIONS,
  actionIdOf,
  addDogBackpackQuickAction,
  moveInArray,
  resetHomeScreenConfig,
  setHomeScreenConfig,
  setWidgetVisible,
  toggleQuickAction,
  updateWidgetConfig,
  useHomeScreenConfig,
  visibleWidgets,
  ALL_FAB_ACTIONS,
  HOME_FAB_ACTIONS_META,
  type HomeFabActionId,
  type HomeLayoutMode,
  type HomeQuickActionId,
  type HomeScreenConfig,
  type HomeWidgetId,
} from '@/stores/homeScreenConfig';
import { ActionListModal } from '@/components/home/ActionListModal';
import { FAB_ACTION_LABEL_KEY } from '@/components/QuickAddSheet';
import { useDogs } from '@/hooks/useDogs';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useT, type TranslationKey } from '@/i18n';
import { useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Switch, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const LAYOUT_LABEL_KEY: Record<HomeLayoutMode, TranslationKey> = {
  grid: 'home.layoutGrid',
  list: 'home.layoutList',
  compact: 'home.layoutCompact',
};

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

const WIDGET_LABEL_KEY: Record<HomeWidgetId, TranslationKey> = {
  week: 'home.widgetWeek',
  smart_analysis: 'home.widgetSmartAnalysis',
  quick_actions: 'home.widgetQuickActions',
  recent_sessions: 'home.widgetRecentSessions',
  dogs: 'home.widgetDogs',
  dog_backpack: 'home.widgetDogBackpack',
};

const WIDGET_DESC_KEY: Record<HomeWidgetId, TranslationKey> = {
  week: 'home.widgetWeekDesc',
  smart_analysis: 'home.widgetSmartAnalysisDesc',
  quick_actions: 'home.widgetQuickActionsDesc',
  recent_sessions: 'home.widgetRecentSessionsDesc',
  dogs: 'home.widgetDogsDesc',
  dog_backpack: 'home.widgetDogBackpackDesc',
};

export default function HomeCustomizeScreen() {
  const router = useRouter();
  const { t } = useT();
  const { user } = useSession();
  const { dogs } = useDogs();
  const config = useHomeScreenConfig(user?.id);
  const [fabPickerOpen, setFabPickerOpen] = useState(false);

  const activeActions = config.quickActions;
  const inactiveActions = ALL_QUICK_ACTIONS.filter((a) => a !== 'dog_backpack' && !activeActions.some(entry => actionIdOf(entry) === a));
  const atMax = activeActions.length >= MAX_QUICK_ACTIONS;

  // ── Aktionen ──
  const setLayout = (layout: HomeLayoutMode) => setHomeScreenConfig({ ...config, layout });

  const moveWidget = (id: HomeWidgetId, dir: -1 | 1) => {
    const idx = config.widgetOrder.indexOf(id);
    setHomeScreenConfig({ ...config, widgetOrder: moveInArray(config.widgetOrder, idx, dir) });
  };
  const toggleWidget = (id: HomeWidgetId, visible: boolean) =>
    setHomeScreenConfig(setWidgetVisible(config, id, visible));

  const moveAction = (entry: HomeScreenConfig['quickActions'][number], dir: -1 | 1) => {
    const idx = config.quickActions.indexOf(entry);
    setHomeScreenConfig({ ...config, quickActions: moveInArray(config.quickActions, idx, dir) });
  };
  const toggleAction = (entry: HomeScreenConfig['quickActions'][number]) => {
    if (typeof entry !== 'string') {
      setHomeScreenConfig({ ...config, quickActions: config.quickActions.filter(item => typeof item === 'string' || item.instanceId !== entry.instanceId) });
      return;
    }
    setHomeScreenConfig(toggleQuickAction(config, entry));
  };
  const addDogBackpack = (dogId: string) => setHomeScreenConfig(addDogBackpackQuickAction(config, dogId));
  const setBackpackWidgetDog = (dogId: string) => setHomeScreenConfig(updateWidgetConfig(config, {
    instanceId: 'dog_backpack-widget', widgetId: 'dog_backpack', dogId,
  }));

  const onReset = () => {
    Alert.alert(
      'Auf Standard zurücksetzen',
      'Layout, Widgets und Schnellzugriffe werden auf die Standardeinstellungen zurückgesetzt. Andere Einstellungen bleiben unverändert.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Zurücksetzen', style: 'destructive', onPress: () => resetHomeScreenConfig() },
      ],
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>ERSCHEINUNGSBILD</Text>
          <Text style={s.headerTitle}>Startbildschirm anpassen</Text>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* ── LIVE-VORSCHAU ── */}
        <Text style={s.sectionLabel}>VORSCHAU</Text>
        <HomePreview config={config} />

        {/* ── LAYOUT ── */}
        <Text style={s.sectionLabel}>LAYOUT</Text>
        <View style={s.segment}>
          {HOME_LAYOUT_MODES.map((mode) => {
            const active = config.layout === mode;
            return (
              <TouchableOpacity
                key={mode}
                style={[s.segmentBtn, active && s.segmentBtnActive]}
                onPress={() => setLayout(mode)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Layout ${HOME_LAYOUT_LABEL[mode]}`}
              >
                <Text style={[s.segmentText, active && s.segmentTextActive]}>
                  {HOME_LAYOUT_LABEL[mode]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── WIDGETS ── */}
        <Text style={s.sectionLabel}>WIDGETS</Text>
        <Text style={s.hint}>Ein-/ausblenden und Reihenfolge festlegen.</Text>
        <View style={s.karte}>
          {config.widgetOrder.map((id, i) => {
            const meta = HOME_WIDGETS_META[id];
            const visible = !config.hiddenWidgets.includes(id);
            return (
              <View key={id} style={[s.zeile, i < config.widgetOrder.length - 1 && s.zeileTrenner]}>
                <View style={s.reorder}>
                  <TouchableOpacity
                    onPress={() => moveWidget(id, -1)}
                    disabled={i === 0}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`${meta.label} nach oben`}
                  >
                    <Ionicons name="chevron-up" size={18} color={i === 0 ? C.border : C.muted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => moveWidget(id, 1)}
                    disabled={i === config.widgetOrder.length - 1}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`${meta.label} nach unten`}
                  >
                    <Ionicons name="chevron-down" size={18} color={i === config.widgetOrder.length - 1 ? C.border : C.muted} />
                  </TouchableOpacity>
                </View>
                <View style={s.zeileIcon}>
                  <Ionicons name={meta.icon as IconName} size={18} color={C.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.zeileLabel}>{meta.label}</Text>
                  <Text style={s.zeileSub} numberOfLines={1}>{meta.description}</Text>
                </View>
                <Switch
                  value={visible}
                  onValueChange={(v) => toggleWidget(id, v)}
                  trackColor={{ false: C.cardAlt, true: C.accent }}
                  thumbColor={C.white}
                  accessibilityLabel={`Widget ${meta.label}`}
                />
                {id === 'dog_backpack' && (
                  <View style={s.dogSelector}>
                    <Text style={s.zeileSub}>{t('home.selectDog')}</Text>
                    {dogs.map(dog => {
                      const selected = config.widgetConfigs?.some(item => item.widgetId === 'dog_backpack' && item.dogId === dog.id);
                      return (
                        <TouchableOpacity
                          key={dog.id}
                          style={[s.dogOption, selected && s.dogOptionActive]}
                          onPress={() => setBackpackWidgetDog(dog.id)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                        >
                          <Text style={s.dogOptionText}>{dog.name}</Text>
                          {selected && <Ionicons name="checkmark" size={16} color={C.accent} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* ── SCHNELLZUGRIFFE ── */}
        <Text style={s.sectionLabel}>SCHNELLZUGRIFFE</Text>
        <Text style={s.hint}>
          {activeActions.length}/{MAX_QUICK_ACTIONS} aktiv. Aktive Aktionen erscheinen im Widget „Schnell starten“.
        </Text>

        {/* Aktive (mit Reihenfolge) */}
        <View style={s.karte}>
          {activeActions.map((entry, i) => {
            const id = actionIdOf(entry);
            const meta = HOME_QUICK_ACTIONS_META[id];
            const dog = typeof entry !== 'string' && entry.dogId ? dogs.find(item => item.id === entry.dogId) : undefined;
            const label = id === 'dog_backpack' ? (dog ? t('backpack.ownTitle', { name: dog.name }) : t('home.dogUnavailable')) : t(QUICK_ACTION_LABEL_KEY[id]);
            const entryKey = typeof entry === 'string' ? entry : entry.instanceId;
            return (
              <View key={entryKey} style={[s.zeile, i < activeActions.length - 1 && s.zeileTrenner]}>
                <View style={s.reorder}>
                  <TouchableOpacity
                    onPress={() => moveAction(entry, -1)}
                    disabled={i === 0}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`${meta.label} nach oben`}
                  >
                    <Ionicons name="chevron-up" size={18} color={i === 0 ? C.border : C.muted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => moveAction(entry, 1)}
                    disabled={i === activeActions.length - 1}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`${meta.label} nach unten`}
                  >
                    <Ionicons name="chevron-down" size={18} color={i === activeActions.length - 1 ? C.border : C.muted} />
                  </TouchableOpacity>
                </View>
                <View style={s.zeileIcon}>
                  <Ionicons name={meta.icon as IconName} size={18} color={C.accent} />
                </View>
                <Text style={[s.zeileLabel, { flex: 1 }]}>{meta.label}</Text>
                <Switch
                  value
                  onValueChange={() => toggleAction(entry)}
                  trackColor={{ false: C.cardAlt, true: C.accent }}
                  thumbColor={C.white}
                  accessibilityLabel={t('home.quickActionLabel', { label })}
                />
              </View>
            );
          })}
        </View>

        {/* Verfügbar (inaktiv) */}
        {inactiveActions.length > 0 && (
          <>
            <Text style={[s.hint, { marginTop: 16 }]}>Verfügbar</Text>
            <View style={s.karte}>
              {inactiveActions.map((id, i) => {
                const meta = HOME_QUICK_ACTIONS_META[id];
                return (
                  <View key={id} style={[s.zeile, i < inactiveActions.length - 1 && s.zeileTrenner]}>
                    <View style={s.zeileIcon}>
                      <Ionicons name={meta.icon as IconName} size={18} color={atMax ? C.muted : C.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.zeileLabel, atMax && { color: C.muted }]}>{meta.label}</Text>
                      {atMax && <Text style={s.zeileSub}>Maximal {MAX_QUICK_ACTIONS} aktiv</Text>}
                    </View>
                    <Switch
                      value={false}
                      onValueChange={() => toggleAction(id)}
                      disabled={atMax}
                      trackColor={{ false: C.cardAlt, true: C.accent }}
                      thumbColor={C.white}
                      accessibilityLabel={`Schnellzugriff ${meta.label} hinzufügen`}
                    />
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── SCHNELLBUTTON (FAB) ── */}
        <Text style={s.sectionLabel}>{t('fab.title')}</Text>
        <View style={s.karte}>
          <TouchableOpacity
            style={s.zeile}
            onPress={() => setFabPickerOpen(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('fab.selectTitle')}
          >
            <View style={s.zeileIcon}>
              {config.fabActionId === 'hidden' || !HOME_FAB_ACTIONS_META[config.fabActionId] ? (
                <Ionicons name="eye-off-outline" size={18} color={C.accent} />
              ) : (
                <Ionicons name={(HOME_FAB_ACTIONS_META[config.fabActionId]?.icon ?? 'add') as IconName} size={18} color={C.accent} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.zeileLabel}>
                {config.fabActionId === 'hidden' || !HOME_FAB_ACTIONS_META[config.fabActionId]
                  ? t('fab.hide')
                  : t(FAB_ACTION_LABEL_KEY[config.fabActionId])}
              </Text>
              <Text style={s.zeileSub}>{t('fab.selectTitle')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
          </TouchableOpacity>
          <View style={[s.zeile, s.zeileTrenner]}>
            <Text style={[s.zeileLabel, { flex: 1, marginBottom: 0 }]}>{t('fab.visible')}</Text>
            <Switch
              value={config.fabVisible !== false}
              onValueChange={(v) => setHomeScreenConfig({ ...config, fabVisible: v })}
              trackColor={{ false: C.cardAlt, true: C.accent }}
              thumbColor={C.white}
              accessibilityLabel={t('fab.visible')}
            />
          </View>
        </View>

        <ActionListModal
          visible={fabPickerOpen}
          onClose={() => setFabPickerOpen(false)}
          title={t('fab.selectTitle')}
          items={ALL_FAB_ACTIONS.filter((id) => id !== 'hidden').map((id) => ({
            key: id,
            icon: HOME_FAB_ACTIONS_META[id]?.icon as IconName | undefined,
            label: t(FAB_ACTION_LABEL_KEY[id]),
            selected: id === config.fabActionId,
          }))}
          onSelect={(key) => {
            setHomeScreenConfig({ ...config, fabActionId: key as HomeFabActionId });
            setFabPickerOpen(false);
          }}
        />

        {/* ── RESET ── */}
        <TouchableOpacity
          style={s.resetBtn}
          onPress={onReset}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Auf Standard zurücksetzen"
        >
          <Ionicons name="refresh-outline" size={18} color={C.danger} />
          <Text style={s.resetText}>Auf Standard zurücksetzen</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// Kompakte Live-Vorschau: zeigt sichtbare Widgets in Reihenfolge; das Widget
// „Schnell starten" zeigt die aktiven Aktionen im gewählten Layout an.
function HomePreview({ config }: { config: ReturnType<typeof useHomeScreenConfig> }) {
  const { t } = useT();
  const widgets = visibleWidgets(config);
  return (
    <View style={s.preview}>
      <View style={s.previewHero}>
        <Text style={s.previewHeroText}>Guten Tag</Text>
        <Ionicons name="options-outline" size={14} color="rgba(255,255,255,0.6)" />
      </View>
      {widgets.length === 0 ? (
        <Text style={s.previewEmpty}>Keine Widgets sichtbar</Text>
      ) : (
        widgets.map((id) => {
          if (id === 'quick_actions') {
            return (
              <View key={id} style={s.previewBlock}>
                <Text style={s.previewLabel}>{t('home.quickStart')}</Text>
                <View style={config.layout === 'list' ? s.previewList : s.previewGrid}>
                  {config.quickActions.map((a) => (
                    <View
                      key={typeof a === 'string' ? a : a.instanceId}
                      style={[
                        s.previewChip,
                        config.layout === 'list' && s.previewChipList,
                        config.layout === 'compact' && s.previewChipCompact,
                      ]}
                    >
                      <Ionicons name={HOME_QUICK_ACTIONS_META[actionIdOf(a)].icon as IconName} size={12} color={C.accent} />
                      {config.layout === 'list' && (
                        <Text style={s.previewChipText} numberOfLines={1}>
                          {t(QUICK_ACTION_LABEL_KEY[actionIdOf(a)])}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            );
          }
          return (
            <View key={id} style={s.previewBlock}>
              <Text style={s.previewLabel}>{HOME_WIDGETS_META[id].label}</Text>
              <View style={s.previewBar} />
            </View>
          );
        })
      )}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, gap: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerSub: { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  headerTitle: { fontSize: 22, color: C.white, fontWeight: '900', letterSpacing: -0.4 },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 4 },

  sectionLabel: { fontSize: 10, color: C.muted, fontWeight: '800', letterSpacing: 1.5, marginTop: 22, marginBottom: 10 },
  hint: { fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 18 },

  // Vorschau
  preview: {
    backgroundColor: C.bg, borderRadius: 18, borderWidth: 1, borderColor: C.border,
    padding: 12, gap: 10,
  },
  previewHero: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.cardAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  },
  previewHeroText: { fontSize: 13, color: C.white, fontWeight: '800' },
  previewEmpty: { fontSize: 12, color: C.muted, textAlign: 'center', paddingVertical: 12 },
  previewBlock: { gap: 6 },
  previewLabel: { fontSize: 10, color: C.muted, fontWeight: '700' },
  previewBar: { height: 22, borderRadius: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  previewList: { gap: 6 },
  previewChip: {
    width: 34, height: 30, borderRadius: 8, backgroundColor: C.card,
    borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  previewChipCompact: { width: 26, height: 24 },
  previewChipList: {
    width: '100%', flexDirection: 'row', justifyContent: 'flex-start',
    gap: 8, paddingHorizontal: 10, height: 30,
  },
  previewChipText: { fontSize: 11, color: C.white, fontWeight: '600' },

  // Segmented Layout
  segment: {
    flexDirection: 'row', backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.border, padding: 4, gap: 4,
  },
  segmentBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segmentBtnActive: { backgroundColor: C.accent },
  segmentText: { fontSize: 14, color: C.muted, fontWeight: '700' },
  segmentTextActive: { color: C.accentText },

  // Karten/Zeilen
  karte: {
    backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: 'hidden',
  },
  zeile: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 14, minHeight: 60,
  },
  zeileTrenner: { borderBottomWidth: 1, borderBottomColor: C.border },
  reorder: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  zeileIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: C.accentDim,
    alignItems: 'center', justifyContent: 'center',
  },
  zeileLabel: { fontSize: 15, color: C.white, fontWeight: '600', marginBottom: 2 },
  zeileSub: { fontSize: 12, color: C.muted },

  // Reset
  resetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 28, paddingVertical: 16, borderRadius: 14,
    borderWidth: 1, borderColor: C.danger,
  },
  resetText: { fontSize: 15, color: C.danger, fontWeight: '700' },
  dogSelector: { width: '100%', marginTop: 10, gap: 6 },
  dogOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: C.cardAlt },
  dogOptionActive: { borderWidth: 1, borderColor: C.accent },
  dogOptionText: { color: C.white, fontSize: 13, fontWeight: '700' },
  dogActionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
});
