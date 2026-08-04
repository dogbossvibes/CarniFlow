import { C } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';
import {
  HOME_LAYOUT_MODES,
  HOME_QUICK_ACTIONS_META,
  HOME_WIDGETS_META,
  ALL_QUICK_ACTIONS,
  MAX_QUICK_ACTIONS,
  actionIdOf,
  addDogBackpackQuickAction,
  backpackWidgetDogIds,
  moveInArray,
  resetHomeScreenConfig,
  setHomeScreenConfig,
  setWidgetVisible,
  toggleBackpackWidgetDog,
  toggleQuickAction,
  useHomeScreenConfig,
  visibleWidgets,
  MAX_QUICK_BUTTON_ACTIONS,
  QUICK_BUTTON_ACTIONS_META,
  QUICK_BUTTON_FIXED_ACTIONS,
  addQuickButtonAction,
  dogBackpackActionId,
  dogOpenActionId,
  moveQuickButtonAction,
  parseQuickActionId,
  quickButtonActionIdsOf,
  removeQuickButtonAction,
  type HomeLayoutMode,
  type HomeQuickActionId,
  type HomeScreenConfig,
  type HomeWidgetId,
  type QuickActionId,
} from '@/stores/homeScreenConfig';
import { ActionListModal } from '@/components/home/ActionListModal';
import { DogAvatar } from '@/components/dogs/DogAvatar';
import { useDogs } from '@/hooks/useDogs';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
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
  const [quickPickerOpen, setQuickPickerOpen] = useState(false);

  const activeActions = config.quickActions;
  const inactiveActions = ALL_QUICK_ACTIONS.filter((a) => a !== 'dog_backpack' && !activeActions.some(entry => actionIdOf(entry) === a));
  const atMax = activeActions.length >= MAX_QUICK_ACTIONS;

  // Schnellbutton (global): aktivierte Aktionen in Nutzer-Reihenfolge.
  const quickActions = quickButtonActionIdsOf(config, dogs);
  const atQuickMax = quickActions.length >= MAX_QUICK_BUTTON_ACTIONS;

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

  // Schnellbutton (global): Aktion an-/abwählen (max. MAX_QUICK_BUTTON_ACTIONS).
  const toggleQuick = (id: QuickActionId) => {
    if (quickActions.includes(id)) {
      setHomeScreenConfig(removeQuickButtonAction(config, id));
      return;
    }
    if (quickActions.length >= MAX_QUICK_BUTTON_ACTIONS) {
      Alert.alert(t('quickButton.errors.maxActions', { max: MAX_QUICK_BUTTON_ACTIONS }));
      return;
    }
    setHomeScreenConfig(addQuickButtonAction(config, id));
  };
  const toggleDogQuick = (dog: { id: string }, kind: 'open' | 'backpack') => {
    toggleQuick(kind === 'open' ? dogOpenActionId(dog.id) : dogBackpackActionId(dog.id));
  };
  const addDogBackpack = (dogId: string) => setHomeScreenConfig(addDogBackpackQuickAction(config, dogId));
  const toggleBackpackWidget = (dogId: string) => setHomeScreenConfig(toggleBackpackWidgetDog(config, dogId));

  const onReset = () => {
    Alert.alert(
      t('home.reset'),
      t('home.resetBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('home.resetConfirm'), style: 'destructive', onPress: () => resetHomeScreenConfig() },
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
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>{t('home.customizeEyebrow')}</Text>
          <Text style={s.headerTitle}>{t('home.customizeTitle')}</Text>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* ── LIVE-VORSCHAU ── */}
        <Text style={s.sectionLabel}>{t('home.preview')}</Text>
        <HomePreview config={config} />

        {/* ── LAYOUT ── */}
        <Text style={s.sectionLabel}>{t('home.layout')}</Text>
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
                accessibilityLabel={`Layout ${t(LAYOUT_LABEL_KEY[mode])}`}
              >
                <Text style={[s.segmentText, active && s.segmentTextActive]}>
                  {t(LAYOUT_LABEL_KEY[mode])}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── WIDGETS ── */}
        <Text style={s.sectionLabel}>{t('home.widgets')}</Text>
        <Text style={s.hint}>{t('home.widgetsHint')}</Text>
        <View style={s.karte}>
          {config.widgetOrder.map((id, i) => {
            const meta = HOME_WIDGETS_META[id];
            const label = t(WIDGET_LABEL_KEY[id]);
            const description = t(WIDGET_DESC_KEY[id]);
            const visible = !config.hiddenWidgets.includes(id);
            return (
              <View key={id} style={[s.zeile, i < config.widgetOrder.length - 1 && s.zeileTrenner]}>
                <View style={s.reorder}>
                  <TouchableOpacity
                    onPress={() => moveWidget(id, -1)}
                    disabled={i === 0}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.moveUp', { label })}
                  >
                    <Ionicons name="chevron-up" size={18} color={i === 0 ? C.border : C.muted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => moveWidget(id, 1)}
                    disabled={i === config.widgetOrder.length - 1}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.moveDown', { label })}
                  >
                    <Ionicons name="chevron-down" size={18} color={i === config.widgetOrder.length - 1 ? C.border : C.muted} />
                  </TouchableOpacity>
                </View>
                <View style={s.zeileIcon}>
                  <Ionicons name={meta.icon as IconName} size={18} color={C.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.zeileLabel}>{label}</Text>
                  <Text style={s.zeileSub} numberOfLines={1}>{description}</Text>
                </View>
                <Switch
                  value={visible}
                  onValueChange={(v) => toggleWidget(id, v)}
                  trackColor={{ false: C.cardAlt, true: C.accent }}
                  thumbColor={C.white}
                  accessibilityLabel={t('home.widgetLabel', { label })}
                />
              </View>
            );
          })}
        </View>

        {/* ── BACKPACK-WIDGETS ── */}
        <Text style={s.sectionLabel}>{t('home.backpackWidgets')}</Text>
        <Text style={s.hint}>{t('home.backpackWidgetsHint')}</Text>
        <View style={s.karte}>
          {dogs.length === 0 ? (
            <Text style={[s.zeileSub, { padding: 14 }]}>{t('home.noDogsForBackpack')}</Text>
          ) : dogs.map((dog, i) => {
            const selected = backpackWidgetDogIds(config).includes(dog.id);
            return (
              <TouchableOpacity
                key={dog.id}
                style={[s.zeile, i < dogs.length - 1 && s.zeileTrenner]}
                onPress={() => toggleBackpackWidget(dog.id)}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={t('home.backpackWidgetToggle', { name: dog.name })}
              >
                <View style={s.zeileIcon}>
                  <Ionicons name="bag-handle-outline" size={18} color={selected ? C.accent : C.muted} />
                </View>
                <Text style={[s.zeileLabel, { flex: 1, marginBottom: 0 }]}>{dog.name}</Text>
                <View style={[s.checkBox, selected && s.checkBoxOn]}>
                  {selected && <Ionicons name="checkmark" size={14} color={C.accentText} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── SCHNELLZUGRIFFE ── */}
        <Text style={s.sectionLabel}>{t('home.quickActions')}</Text>
        <Text style={s.hint}>
          {t('home.quickActionsHint', { active: activeActions.length, max: MAX_QUICK_ACTIONS })}
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
                    accessibilityLabel={t('home.moveUp', { label })}
                  >
                    <Ionicons name="chevron-up" size={18} color={i === 0 ? C.border : C.muted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => moveAction(entry, 1)}
                    disabled={i === activeActions.length - 1}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.moveDown', { label })}
                  >
                    <Ionicons name="chevron-down" size={18} color={i === activeActions.length - 1 ? C.border : C.muted} />
                  </TouchableOpacity>
                </View>
                <View style={s.zeileIcon}>
                  <Ionicons name={meta.icon as IconName} size={18} color={C.accent} />
                </View>
                <Text style={[s.zeileLabel, { flex: 1 }]}>{label}</Text>
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

        <Text style={[s.hint, { marginTop: 16 }]}>{t('home.actionDogBackpack')}</Text>
        <View style={s.karte}>
          {dogs.length === 0 ? (
            <Text style={s.zeileSub}>{t('home.noDogsForBackpack')}</Text>
          ) : dogs.map(dog => (
            <TouchableOpacity
              key={dog.id}
              style={s.dogActionRow}
              onPress={() => addDogBackpack(dog.id)}
              disabled={atMax}
              accessibilityRole="button"
              accessibilityLabel={t('home.addBackpackAction', { name: dog.name })}
            >
              <Ionicons name="bag-handle-outline" size={18} color={atMax ? C.muted : C.accent} />
              <Text style={[s.zeileLabel, { flex: 1 }, atMax && { color: C.muted }]}>{t('backpack.ownTitle', { name: dog.name })}</Text>
              <Ionicons name="add-circle-outline" size={20} color={atMax ? C.muted : C.accent} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Verfügbar (inaktiv) */}
        {inactiveActions.length > 0 && (
          <>
            <Text style={[s.hint, { marginTop: 16 }]}>{t('home.available')}</Text>
            <View style={s.karte}>
              {inactiveActions.map((id, i) => {
                const meta = HOME_QUICK_ACTIONS_META[id];
                const label = t(QUICK_ACTION_LABEL_KEY[id]);
                return (
                  <View key={id} style={[s.zeile, i < inactiveActions.length - 1 && s.zeileTrenner]}>
                    <View style={s.zeileIcon}>
                      <Ionicons name={meta.icon as IconName} size={18} color={atMax ? C.muted : C.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.zeileLabel, atMax && { color: C.muted }]}>{label}</Text>
                      {atMax && <Text style={s.zeileSub}>{t('home.maxActive', { max: MAX_QUICK_ACTIONS })}</Text>}
                    </View>
                    <Switch
                      value={false}
                      onValueChange={() => toggleAction(id)}
                      disabled={atMax}
                      trackColor={{ false: C.cardAlt, true: C.accent }}
                      thumbColor={C.white}
                      accessibilityLabel={t('home.quickActionAddLabel', { label })}
                    />
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── SCHNELLBUTTON (global, alle Hauptseiten) ── */}
        <Text style={s.sectionLabel}>{t('quickButton.title')}</Text>
        <Text style={s.hint}>{t('quickButton.description')}</Text>
        <View style={s.karte}>
          {/* Vorschau: grüner runder Button, immer das ANYVO-Logo (nie Kalender/Plus). */}
          <View style={s.zeile}>
            <View style={s.previewFab}>
              <Image source={require('@/assets/images/anyvologo.png')} style={s.previewFabImg} contentFit="contain" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.zeileLabel}>{t('quickButton.preview')}</Text>
              <Text style={s.zeileSub}>{t('quickButton.shortPressHint')}</Text>
            </View>
          </View>

          <View style={[s.zeile, s.zeileTrenner]}>
            <Text style={[s.zeileLabel, { flex: 1, marginBottom: 0 }]}>{t('quickButton.show')}</Text>
            <Switch
              value={config.quickButtonVisible !== false}
              onValueChange={(v) => setHomeScreenConfig({ ...config, quickButtonVisible: v })}
              trackColor={{ false: C.cardAlt, true: C.accent }}
              thumbColor={C.white}
              accessibilityLabel={t('quickButton.show')}
            />
          </View>

          {/* Aktive Aktionen: Reihenfolge + Entfernen. */}
          <View style={[s.zeile, s.zeileTrenner]}>
            <Text style={[s.zeileLabel, { flex: 1, marginBottom: 0 }]}>
              {t('quickButton.selectedCount', { count: quickActions.length, max: MAX_QUICK_BUTTON_ACTIONS })}
            </Text>
            <Text style={s.zeileSub}>{t('quickButton.reorder')}</Text>
          </View>

          {quickActions.length === 0 && (
            <Text style={[s.zeileSub, s.zeileTrenner, { paddingVertical: 12 }]}>{t('quickButton.noActions')}</Text>
          )}

          {quickActions.map((id, idx) => {
            const p = parseQuickActionId(id);
            const isDog = p.kind === 'dog' || p.kind === 'dog_backpack';
            const dog = isDog ? dogs.find((d) => d.id === p.dogId) : undefined;
            const meta = !isDog ? QUICK_BUTTON_ACTIONS_META[id] : undefined;
            const name = dog?.name ?? '';
            const label = isDog
              ? (p.kind === 'dog' ? t('quickButton.dogOpen', { name }) : t('quickButton.dogBackpack', { name }))
              : t(meta?.labelKey ?? 'quickButton.chooseAction');
            return (
              <View key={id} style={[s.zeile, s.zeileTrenner, { gap: 10 }]}>
                <View style={s.zeileIcon}>
                  {isDog ? (
                    <DogAvatar photoUrl={dog?.photo_url ?? null} size={30} radius={15} />
                  ) : (
                    <Ionicons name={(meta?.icon ?? 'ellipse-outline') as IconName} size={18} color={C.accent} />
                  )}
                </View>
                <Text style={[s.zeileLabel, { flex: 1, marginBottom: 0 }]}>{label}</Text>
                <TouchableOpacity
                  onPress={() => setHomeScreenConfig(moveQuickButtonAction(config, id, -1))}
                  disabled={idx === 0}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('quickButton.reorder')}
                  accessibilityState={{ disabled: idx === 0 }}
                >
                  <Ionicons name="chevron-up" size={20} color={idx === 0 ? C.muted : C.accent} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setHomeScreenConfig(moveQuickButtonAction(config, id, 1))}
                  disabled={idx === quickActions.length - 1}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('quickButton.reorder')}
                  accessibilityState={{ disabled: idx === quickActions.length - 1 }}
                >
                  <Ionicons name="chevron-down" size={20} color={idx === quickActions.length - 1 ? C.muted : C.accent} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => toggleQuick(id)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.delete')}
                >
                  <Ionicons name="close" size={20} color={C.danger} />
                </TouchableOpacity>
              </View>
            );
          })}

          {/* Hinzufügen (mehrfach möglich, max. 8). */}
          <TouchableOpacity
            style={[s.zeile, s.zeileTrenner]}
            onPress={() => setQuickPickerOpen(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('quickButton.chooseActions')}
          >
            <View style={s.zeileIcon}>
              <Ionicons name="add" size={18} color={C.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.zeileLabel}>{t('quickButton.chooseActions')}</Text>
              <Text style={s.zeileSub}>
                {atQuickMax
                  ? t('quickButton.maxActions', { max: MAX_QUICK_BUTTON_ACTIONS })
                  : t('quickButton.longPressHint')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
          </TouchableOpacity>

          {/* Eigene Hunde: „Hund öffnen" / „Backpack öffnen" pro Hund einzeln. */}
          <View style={[s.zeile, s.zeileTrenner, s.quickDogColumn]}>
            <Text style={[s.zeileLabel, { marginBottom: 0 }]}>{t('quickButton.ownDogs')}</Text>
            {dogs.length === 0 ? (
              <Text style={s.zeileSub}>{t('quickButton.noDogs')}</Text>
            ) : dogs.map((dog) => {
              const openOn = quickActions.includes(dogOpenActionId(dog.id));
              const packOn = quickActions.includes(dogBackpackActionId(dog.id));
              return (
                <View key={dog.id} style={[s.dogActionRow, s.dogQuickCard]}>
                  <DogAvatar photoUrl={dog.photo_url} size={34} radius={17} />
                  <Text style={[s.zeileLabel, { flex: 1, marginBottom: 0 }]}>{dog.name}</Text>
                  <TouchableOpacity
                    style={[s.dogQuickChip, openOn && s.dogQuickChipOn]}
                    onPress={() => toggleDogQuick(dog, 'open')}
                    activeOpacity={0.7}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: openOn }}
                    accessibilityLabel={t('quickButton.dogOpen', { name: dog.name })}
                  >
                    <Text style={[s.dogQuickChipText, openOn && s.dogQuickChipTextOn]}>{t('quickButton.actions.openDog')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.dogQuickChip, packOn && s.dogQuickChipOn]}
                    onPress={() => toggleDogQuick(dog, 'backpack')}
                    activeOpacity={0.7}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: packOn }}
                    accessibilityLabel={t('quickButton.dogBackpack', { name: dog.name })}
                  >
                    <Text style={[s.dogQuickChipText, packOn && s.dogQuickChipTextOn]}>{t('quickButton.actions.openBackpack')}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>

        <ActionListModal
          visible={quickPickerOpen}
          onClose={() => setQuickPickerOpen(false)}
          title={t('quickButton.chooseActions')}
          items={QUICK_BUTTON_FIXED_ACTIONS.map((id) => ({
            key: id,
            icon: QUICK_BUTTON_ACTIONS_META[id]?.icon as IconName | undefined,
            label: t(QUICK_BUTTON_ACTIONS_META[id]?.labelKey ?? 'quickButton.chooseAction'),
            selected: quickActions.includes(id),
          }))}
          onSelect={(key) => toggleQuick(key as QuickActionId)}
        />

        {/* ── RESET ── */}
        <TouchableOpacity
          style={s.resetBtn}
          onPress={onReset}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('home.reset')}
        >
          <Ionicons name="refresh-outline" size={18} color={C.danger} />
          <Text style={s.resetText}>{t('home.reset')}</Text>
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
        <Text style={s.previewHeroText}>{t('greeting.day')}</Text>
        <Ionicons name="options-outline" size={14} color="rgba(255,255,255,0.6)" />
      </View>
      {widgets.length === 0 ? (
        <Text style={s.previewEmpty}>{t('home.widgetVisibleNone')}</Text>
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
              <Text style={s.previewLabel}>{t(WIDGET_LABEL_KEY[id])}</Text>
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
  checkBox: {
    width: 24, height: 24, borderRadius: 8,
    borderWidth: 1.5, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.cardAlt,
  },
  checkBoxOn: { borderColor: C.accent, backgroundColor: C.accent },
  dogActionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  dogQuickCard: { borderWidth: 1, borderColor: C.border, borderRadius: 12, marginTop: 8 },
  dogQuickChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.cardAlt,
  },
  dogQuickChipOn: { borderColor: C.accent, backgroundColor: C.accent },
  dogQuickChipText: { fontSize: 11, fontWeight: '700', color: C.muted },
  dogQuickChipTextOn: { color: C.accentText },

  // Schnellbutton-Vorschau (anyvologo auf grünem/tealem runden Kreis wie der echte Button).
  previewFab: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#00FFCC', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  previewFabImg: { width: 26, height: 26 },
  quickDogColumn: { flexDirection: 'column', alignItems: 'stretch', gap: 2 },
});
