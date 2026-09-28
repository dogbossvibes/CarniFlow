import { useState } from 'react';
import { LayoutAnimation, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, UIManager, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT, type TranslationKey } from '@/i18n';
import { DogAvatar } from '@/components/dogs/DogAvatar';
import { type QuickActionKey } from '@/components/dogs/DogQuickActions';
import { DogFaehrteSummary } from '@/components/dogs/DogFaehrteSummary';
import { DogCommandsCard } from '@/components/dogs/DogCommandsCard';
import { DogGoalsCard } from '@/components/dogs/DogGoalsCard';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { DogHealthLoadCard } from '@/components/dogs/DogHealthLoadCard';
import { DogTrainerCard } from '@/components/dogs/DogTrainerCard';
import { DogAiCoachCard } from '@/components/dogs/DogAiCoachCard';
import { DogHeatCard } from '@/components/dogs/DogHeatCard';
import { DogTodayCard } from '@/components/dogs/DogTodayCard';
import { DogAppointmentsCard } from '@/components/dogs/DogAppointmentsCard';
import { DogRecentCard } from '@/components/dogs/DogRecentCard';
import { DogStatusTiles } from '@/components/dogs/DogStatusTiles';
import { buildTodayHints, type DogAppointment } from '@/features/dogs/dashboard';
import { ActiveFaehrteCard } from '@/features/tracking/components/ActiveFaehrteCard';
import type { ActiveFaehrte } from '@/features/tracking/store/activeFaehrtenModel';
import type { HeatCycle, HeatPrediction } from '@/features/dogs/heatCycles';
import type { DogCommand } from '@/features/dogs/dogCommands';
import { CATEGORY_I18N_KEY, type DogBackpackItem, type EquipmentCategory } from '@/features/dogs/backpack';
import { genderLabel, type DogDocument, type DogHubVM, type DogTrainingItem } from '@/components/dogs/types';

// Läufigkeit (nur Hündinnen) — lokal geladen, als eigenständiger Prop reingereicht.
export interface DogHeatProps {
  cycles: HeatCycle[];
  prediction: HeatPrediction | null;
  onAdd: () => void;
  onOpen?: (c: HeatCycle) => void;
  onOpenCalendar?: () => void;
  onDelete?: (c: HeatCycle) => void;
  phaseCounts?: Record<string, number>;
  obsCounts?: Record<string, number>;
  currentPhases?: Record<string, string>;  // heatCycleId → current phase type name
}
// Kommandoliste — lokal geladen, als eigenständiger Prop reingereicht.
export interface DogCommandsProps { commands: DogCommand[]; onAdd: () => void; onOpen: (c: DogCommand) => void; onToggleFavorite: (c: DogCommand) => void; onSeedDemo?: () => void; onDelete?: (c: DogCommand) => void }
// Persönlicher Rucksack — Zusammenfassung (lokal geladen) + Öffnen-Aktion.
export interface DogBackpackProps { dogName: string; total: number; active: number; packed: number; items?: DogBackpackItem[]; onOpen: () => void; onAdd?: () => void }
// Dashboard-Termine (bereits gefiltert/sortiert im Route-Wrapper) + Kalender-Öffnen.
export interface DogAppointmentsProps { items: DogAppointment[]; onOpenCalendar: () => void }

export interface DogHubActions {
  onBack:             () => void;
  onSettings:         () => void;
  onStartTraining:    (discipline?: string | null, note?: string | null) => void;
  onStartFaehrte:     () => void;
  onQuickAction:      (k: QuickActionKey) => void;
  onOpenTraining?:    (item: DogTrainingItem) => void;
  onAddHealth:        () => void;
  onOpenHealthRecord?: () => void;
  onOpenCommands?: () => void;
  onOpenGoals?: () => void;
  onAddDoc:           () => void;
  onOpenDocument?:    (doc: DogDocument) => void;
  onDeleteDocument?:  (doc: DogDocument) => void;
  onEditGoal:         () => void;
  onChat:             () => void;
  onUpgrade?:         () => void;
  onOpenJournal?:     () => void;   // „Alle Trainings anzeigen" → Trainingstagebuch (vorgefiltert)
}

type TabKey = 'overview' | 'health' | 'heat' | 'trainer';
// Labels über i18n (labelKey). Die technischen `key`s bleiben unverändert.
const TABS: { key: TabKey; labelKey: TranslationKey }[] = [
  { key: 'overview', labelKey: 'doghub.tab.overview' },
  { key: 'heat',     labelKey: 'doghub.tab.heat' },   // nur Hündinnen (unten gefiltert)
  { key: 'trainer',  labelKey: 'doghub.tab.trainer' },
];

export function DogHubScreen({ vm, actions, aiUnlocked, heat, commands, backpack, appointments, activeFaehrte, onOpenFaehrte, lastFaehrteId, onOpenLastFaehrte }: { vm: DogHubVM; actions: DogHubActions; aiUnlocked: boolean; heat?: DogHeatProps; commands?: DogCommandsProps; backpack?: DogBackpackProps; appointments?: DogAppointmentsProps; activeFaehrte?: ActiveFaehrte | null; onOpenFaehrte?: () => void; lastFaehrteId?: string | null; onOpenLastFaehrte?: () => void }) {
  const { t, locale } = useT();
  const intlLocale = locale === 'fr' ? 'fr-CH' : locale === 'it' ? 'it-CH' : locale === 'en' ? 'en-GB' : 'de-CH';
  const [tab, setTab] = useState<TabKey>('overview');
  const [expandedSection, setExpandedSection] = useState<'health' | 'commands' | 'goals' | 'backpack' | null>(null);
  const [aiTipHidden, setAiTipHidden] = useState(false);   // „Später" blendet den KI-Hinweis für diese Sitzung aus
  const id = vm.identity;
  const meta = [id.breed, id.ageLabel, genderLabel(id.gender)].filter(Boolean).join(' · ');
  const badges = [
    id.discipline,
    id.weightKg != null ? `${id.weightKg} kg` : null,
    id.shoulderHeightCm != null ? `${id.shoulderHeightCm} cm` : null,
  ].filter((b): b is string => !!b);
  // „Heute mit {Hund}": deterministische Hinweise aus bereits geladenen Daten.
  const isFemale = id.gender === 'female';
  const heatPred = isFemale ? (heat?.prediction ?? null) : null;
  const todayHints = buildTodayHints({
    appointments: appointments?.items ?? [],
    heat: heatPred ? { daysUntil: heatPred.daysUntil, active: heatPred.active } : null,
    goalTitle: vm.goal.title,
    backpackActive: backpack?.active ?? 0,
    backpackPacked: backpack?.packed ?? 0,
    lastTrainingLabel: vm.lastTrainingLabel,
  });
  const toggleSection = (section: 'health' | 'commands' | 'goals' | 'backpack') => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSection(current => current === section ? null : section);
  };

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Top-Bar */}
        <View style={s.topbar}>
          <TouchableOpacity style={s.iconBtn} onPress={actions.onBack} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={C.trackText} />
          </TouchableOpacity>
          <Text style={s.topName} numberOfLines={1}>{id.name}</Text>
          <TouchableOpacity style={s.iconBtn} onPress={actions.onSettings} hitSlop={8}>
            <Ionicons name="settings-outline" size={18} color={C.trackText} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
          <View style={s.container}>
            {/* Identitäts-Header */}
            <View style={s.idCard}>
              <DogAvatar photoUrl={id.photoUrl} size={72} radius={22} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={s.idName} numberOfLines={1} adjustsFontSizeToFit>{id.name}</Text>
                {meta ? <Text style={s.idMeta} numberOfLines={2}>{meta}</Text> : null}
                {id.statusLabel ? <Text style={s.idStatus} numberOfLines={1}>{id.statusLabel}</Text> : null}
              </View>
            </View>
            {badges.length > 0 ? (
              <View style={s.badgeRow}>
                {badges.map(b => <View key={b} style={s.badge}><Text style={s.badgeTxt}>{b}</Text></View>)}
              </View>
            ) : null}

            {actions.onOpenHealthRecord ? (
              <View style={s.miniHub}>
                <TouchableOpacity
                  style={s.miniHubHeader}
                  onPress={() => toggleSection('health')}
                  activeOpacity={0.86}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: expandedSection === 'health' }}
                >
                  <View style={s.healthEntryIcon}><Ionicons name="medkit-outline" size={18} color={C.trackPrimary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.healthEntryTitle}>Gesundheitsakte</Text>
                    <Text style={s.healthEntrySub} numberOfLines={1}>
                      {vm.health.nextVetLabel ? `Nächster Termin: ${vm.health.nextVetLabel}` : vm.health.weightKg != null ? `Gewicht: ${vm.health.weightKg} kg` : 'Noch keine Gesundheitsdaten'}
                    </Text>
                  </View>
                  <Ionicons name={expandedSection === 'health' ? 'chevron-up' : 'chevron-down'} size={17} color={C.trackTextMut} />
                </TouchableOpacity>
                {expandedSection === 'health' ? (
                  <View style={s.healthPreview}>
                    <View style={s.healthPreviewRow}>
                      <View style={s.healthPreviewTile}>
                        <Ionicons name="scale-outline" size={17} color={C.trackPrimary} />
                        <Text style={s.healthPreviewTitle}>Gewicht</Text>
                        <Text style={s.healthPreviewSub}>{vm.health.weightKg != null ? `${vm.health.weightKg} kg` : 'Noch nicht erfasst'}</Text>
                      </View>
                      <View style={s.healthPreviewTile}>
                        <Ionicons name="calendar-outline" size={17} color={C.trackPrimary} />
                        <Text style={s.healthPreviewTitle}>Tierarzt</Text>
                        <Text style={s.healthPreviewSub}>{vm.health.nextVetLabel ?? 'Kein Termin'}</Text>
                      </View>
                    </View>
                    <TouchableOpacity style={s.healthOpenButton} onPress={actions.onOpenHealthRecord} activeOpacity={0.84} accessibilityRole="button">
                      <Ionicons name="open-outline" size={17} color={C.trackPrimary} />
                      <Text style={s.healthOpenText}>Gesundheitsakte öffnen</Text>
                      <Ionicons name="chevron-forward" size={16} color={C.trackTextMut} />
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={s.miniHub}>
              <TouchableOpacity
                style={s.miniHubHeader}
                onPress={() => toggleSection('commands')}
                activeOpacity={0.86}
                accessibilityRole="button"
                accessibilityState={{ expanded: expandedSection === 'commands' }}
              >
                <View style={s.miniHubIcon}><Ionicons name="megaphone-outline" size={18} color={C.trackPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.miniHubTitle}>Kommandos</Text>
                  <Text style={s.miniHubSummary}>
                    {commands && commands.commands.length > 0 ? `${commands.commands.length} Kommandos` : 'Noch keine Kommandos'}
                  </Text>
                </View>
                <Ionicons name={expandedSection === 'commands' ? 'chevron-up' : 'chevron-down'} size={17} color={C.trackTextMut} />
              </TouchableOpacity>
              {expandedSection === 'commands' && commands ? (
                commands.commands.length > 0 ? (
                  <DogCommandsCard
                    commands={commands.commands}
                    onAdd={commands.onAdd}
                    onOpen={commands.onOpen}
                    onToggleFavorite={commands.onToggleFavorite}
                    onSeedDemo={commands.onSeedDemo}
                    onDelete={commands.onDelete}
                  />
                ) : (
                  <View style={s.commandEmptyHub}>
                    <View style={s.commandCategoryRow}>
                      <View style={s.commandCategoryTile}>
                        <Ionicons name="home-outline" size={17} color={C.trackPurple} />
                        <Text style={s.commandCategoryCount}>0</Text>
                        <Text style={s.commandCategoryLabel}>Alltag</Text>
                      </View>
                      <View style={s.commandCategoryTile}>
                        <Ionicons name="trophy-outline" size={17} color={C.trackPrimary} />
                        <Text style={s.commandCategoryCount}>0</Text>
                        <Text style={s.commandCategoryLabel}>Training / Sport</Text>
                      </View>
                    </View>
                    <AnyvoButton label="Kommando hinzufügen" icon="add" variant="secondary" onPress={commands.onAdd} />
                  </View>
                )
              ) : null}
            </View>

            <View style={s.miniHub}>
              <TouchableOpacity
                style={s.miniHubHeader}
                onPress={() => toggleSection('goals')}
                activeOpacity={0.86}
                accessibilityRole="button"
                accessibilityState={{ expanded: expandedSection === 'goals' }}
              >
                <View style={s.miniHubIcon}><Ionicons name="flag-outline" size={18} color={C.trackPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.miniHubTitle}>Ziele</Text>
                  <Text style={s.miniHubSummary}>{vm.goal.title || 'Keine aktiven Ziele'}</Text>
                </View>
                <Ionicons name={expandedSection === 'goals' ? 'chevron-up' : 'chevron-down'} size={17} color={C.trackTextMut} />
              </TouchableOpacity>
              {expandedSection === 'goals' ? <DogGoalsCard goal={vm.goal} onEdit={actions.onEditGoal} /> : null}
            </View>

            {backpack ? (
              <View style={s.miniHub}>
                <TouchableOpacity
                  style={s.miniHubHeader}
                  onPress={() => toggleSection('backpack')}
                  activeOpacity={0.86}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: expandedSection === 'backpack' }}
                >
                  <View style={s.miniHubIcon}><Ionicons name="bag-handle-outline" size={18} color={C.trackPrimary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.miniHubTitle}>Backpack</Text>
                    <Text style={s.miniHubSummary}>{backpack.active > 0 ? `${backpack.active} Einträge` : 'Noch keine Einträge'}</Text>
                  </View>
                  <Ionicons name={expandedSection === 'backpack' ? 'chevron-up' : 'chevron-down'} size={17} color={C.trackTextMut} />
                </TouchableOpacity>
                {expandedSection === 'backpack' ? (
                  <View style={s.backpackPreview}>
                    {(() => {
                      const categoryCounts = new Map<EquipmentCategory, number>();
                      (backpack.items ?? []).filter(item => item.isActive).forEach(item => {
                        if (item.category) categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
                      });
                      const categories = Array.from(categoryCounts.entries());
                      return categories.length > 0 ? (
                        <View style={s.backpackCategoryRow}>
                          {categories.map(([category, count]) => (
                            <View key={category} style={s.backpackCategoryTile}>
                              <Text style={s.backpackCategoryCount}>{count}</Text>
                              <Text style={s.backpackCategoryLabel}>{t(CATEGORY_I18N_KEY[category] as TranslationKey)}</Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <View style={s.backpackFallbackTile}>
                          <Ionicons name="list-outline" size={17} color={C.trackPrimary} />
                          <View style={{ flex: 1 }}>
                            <Text style={s.backpackCategoryLabel}>Alle Einträge</Text>
                            <Text style={s.backpackFallbackText}>{backpack.active > 0 ? `${backpack.active} Einträge` : 'Noch keine Einträge'}</Text>
                          </View>
                        </View>
                      );
                    })()}
                    {backpack.onAdd ? <AnyvoButton label="Eintrag hinzufügen" icon="add" variant="secondary" onPress={backpack.onAdd} /> : null}
                    <TouchableOpacity style={s.backpackOpenButton} onPress={backpack.onOpen} activeOpacity={0.84} accessibilityRole="button">
                      <Ionicons name="open-outline" size={17} color={C.trackPrimary} />
                      <Text style={s.backpackOpenText}>Backpack öffnen</Text>
                      <Ionicons name="chevron-forward" size={16} color={C.trackTextMut} />
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Oberste Karte: offene Fährte dieses Hundes (falls vorhanden). Bindet
                die Fährte an den Hund — überlebt Navigation/Hundewechsel/Neustart. */}
            {activeFaehrte && onOpenFaehrte ? (
              <View style={{ marginBottom: 12 }}>
                <ActiveFaehrteCard entry={activeFaehrte} dogName={id.name} onOpen={onOpenFaehrte} />
              </View>
            ) : lastFaehrteId && onOpenLastFaehrte ? (
              // Keine aktive Fährte, aber es gibt eine abgeschlossene → Ansehen anbieten.
              <TouchableOpacity style={s.lastFaehrte} onPress={onOpenLastFaehrte} activeOpacity={0.85} accessibilityRole="button">
                <View style={s.lastIcon}><Ionicons name="footsteps" size={17} color={C.trackPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.lastTitle}>Letzte Fährte ansehen</Text>
                  <Text style={s.lastSub}>Auswertung & Verlauf</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={C.trackTextMut} />
              </TouchableOpacity>
            ) : null}

            {/* Tab-Leiste */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabbar}>
              {TABS.filter(tb => tb.key !== 'heat' || id.gender === 'female').map(tb => {
                const on = tb.key === tab;
                return (
                  <TouchableOpacity key={tb.key} onPress={() => setTab(tb.key)} style={[s.tab, on && s.tabOn]} activeOpacity={0.8}>
                    <Text style={[s.tabTxt, on && s.tabTxtOn]}>{t(tb.labelKey)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Tab-Inhalt */}
            <View style={s.content}>
              {tab === 'overview' && (
                <>
                  {/* 1) Heute mit {Hund} */}
                  <DogTodayCard
                    dogName={id.name}
                    hints={todayHints}
                    heatDaysUntil={heatPred?.daysUntil}
                    heatActive={heatPred?.active}
                    goalTitle={vm.goal.title}
                    backpackActive={backpack?.active ?? 0}
                    backpackPacked={backpack?.packed ?? 0}
                    lastTrainingLabel={vm.lastTrainingLabel}
                    localeTag={intlLocale}
                  />

                  {/* 2) Nächste Termine */}
                  {appointments && (
                    <DogAppointmentsCard
                      appointments={appointments.items}
                      localeTag={intlLocale}
                      onOpenCalendar={appointments.onOpenCalendar}
                    />
                  )}

                  {/* Einzigartige Wochenstatistik bleibt in der Übersicht; der Start erfolgt zentral im Training. */}
                  <DogFaehrteSummary data={vm.faehrte} onStart={actions.onStartFaehrte} showStart={false} />

                  {/* 3) Läufigkeit — nur Hündinnen */}
                  {isFemale && heat && (
                    <>
                      <Text style={s.sectionLabel}>{t('dash.heat')}</Text>
                      <DogHeatCard cycles={heat.cycles} prediction={heat.prediction} onAdd={heat.onAdd} onOpen={heat.onOpen} onOpenCalendar={heat.onOpenCalendar} currentPhases={heat.currentPhases} />
                    </>
                  )}

                  {/* 4) Journal / Zuletzt */}
                  {actions.onOpenJournal && (
                    <DogRecentCard
                      lastTrainingLabel={vm.lastTrainingLabel}
                      lastFaehrteLabel={vm.lastFaehrteLabel}
                      onOpenJournal={actions.onOpenJournal}
                    />
                  )}

                  {/* 6) Trainingsstatus */}
                  <Text style={s.sectionLabel}>{t('dash.status')}</Text>
                  <DogStatusTiles
                    trainingsThisWeek={vm.trainingsThisWeek}
                    lastTrainingLabel={vm.lastTrainingLabel}
                    lastFaehrteLabel={vm.lastFaehrteLabel}
                    goalTitle={vm.goal.title}
                    goalPct={vm.goal.overallPct}
                  />

                  {/* 7) Smart Analyse (deterministisch, Premium-Gate unverändert) */}
                  {!aiTipHidden && (
                    <DogAiCoachCard
                      tip={vm.aiTip}
                      isUnlocked={aiUnlocked || !!vm.isDemo}
                      onStart={() => actions.onStartTraining(vm.aiTip?.discipline ?? null, vm.aiTip?.hint ?? null)}
                      onUpgrade={actions.onUpgrade}
                      onLater={() => setAiTipHidden(true)}
                    />
                  )}

                </>
              )}
              {tab === 'health'   && <DogHealthLoadCard health={vm.health} onAddEntry={actions.onAddHealth} />}
              {tab === 'heat'     && heat && <DogHeatCard cycles={heat.cycles} prediction={heat.prediction} onAdd={heat.onAdd} onOpen={heat.onOpen} onOpenCalendar={heat.onOpenCalendar} onDelete={heat.onDelete} phaseCounts={heat.phaseCounts} obsCounts={heat.obsCounts} currentPhases={heat.currentPhases} />}
              {tab === 'trainer'  && <DogTrainerCard trainer={vm.trainer} onChat={actions.onChat} />}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.trackBg },
  topbar:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  iconBtn:   { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, alignItems: 'center', justifyContent: 'center' },
  topName:   { flex: 1, fontSize: 16, color: C.trackText, fontWeight: '800', textAlign: 'center' },
  scroll:    { paddingBottom: 48 },
  container: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 16, gap: 14 },
  idCard:    { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.trackCard, borderRadius: 22, borderWidth: 1, borderColor: C.trackBorder, padding: 16, marginTop: 6 },
  idName:    { fontSize: 24, color: C.trackText, fontWeight: '900', letterSpacing: -0.6 },
  idMeta:    { fontSize: 13, color: C.trackTextSec, fontWeight: '500' },
  idStatus:  { fontSize: 12.5, color: C.trackPrimary, fontWeight: '700', marginTop: 1 },
  badgeRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge:     { backgroundColor: C.accentDim, borderColor: C.accentMid, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 6 },
  badgeTxt:  { fontSize: 12, color: C.trackPrimary, fontWeight: '800' },
  tabbar:    { gap: 8, paddingVertical: 2, paddingRight: 8 },
  tab:       { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard },
  tabOn:     { backgroundColor: C.trackPrimary, borderColor: C.trackPrimary },
  tabTxt:    { fontSize: 13, color: C.trackTextSec, fontWeight: '700' },
  tabTxtOn:  { color: '#04201b', fontWeight: '800' },
  content:   { gap: 12, marginTop: 2 },
  sectionLabel: { fontSize: 11, color: C.trackTextMut, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase', marginTop: 4 },
  note:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, padding: 12 },
  noteTxt:   { flex: 1, fontSize: 13, color: C.trackTextSec, fontWeight: '500' },
  noteStrong:{ color: C.trackText, fontWeight: '700' },
  lastFaehrte:{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, padding: 13, marginBottom: 12 },
  lastIcon:  { width: 34, height: 34, borderRadius: 11, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  lastTitle: { fontSize: 14, color: C.trackText, fontWeight: '800' },
  lastSub:   { fontSize: 11.5, color: C.trackTextMut, fontWeight: '600', marginTop: 1 },
  journalLink:{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 14, paddingVertical: 13, marginTop: 4 },
  journalLinkTxt:{ flex: 1, fontSize: 14, color: C.trackText, fontWeight: '700' },
  healthEntry:{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, padding: 13 },
  healthEntryIcon:{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  healthEntryTitle:{ fontSize: 14.5, color: C.trackText, fontWeight: '800' },
  healthEntrySub:{ fontSize: 11.5, color: C.trackTextSec, fontWeight: '600', marginTop: 2 },
  healthPreview:{ gap: 10, paddingTop: 10 },
  healthPreviewRow:{ flexDirection: 'row', gap: 10 },
  healthPreviewTile:{ flex: 1, minHeight: 78, borderRadius: 13, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCardAlt, padding: 11, gap: 4 },
  healthPreviewTitle:{ fontSize: 12.5, color: C.trackText, fontWeight: '800' },
  healthPreviewSub:{ fontSize: 11, color: C.trackTextSec, fontWeight: '600' },
  healthOpenButton:{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 11, paddingVertical: 10 },
  healthOpenText:{ flex: 1, fontSize: 12.5, color: C.trackPrimary, fontWeight: '800' },
  backpackPreview:{ gap: 10, paddingTop: 10 },
  backpackCategoryRow:{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  backpackCategoryTile:{ flexBasis: '47%', flexGrow: 1, minHeight: 70, borderRadius: 13, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCardAlt, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 8 },
  backpackCategoryCount:{ fontSize: 19, color: C.trackText, fontWeight: '900' },
  backpackCategoryLabel:{ fontSize: 11.5, color: C.trackTextSec, fontWeight: '700', textAlign: 'center' },
  backpackFallbackTile:{ flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 62, borderRadius: 13, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCardAlt, paddingHorizontal: 12 },
  backpackFallbackText:{ fontSize: 11, color: C.trackTextMut, fontWeight: '600', marginTop: 2 },
  backpackOpenButton:{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 11, paddingVertical: 10 },
  backpackOpenText:{ flex: 1, fontSize: 12.5, color: C.trackPrimary, fontWeight: '800' },
  miniHub:   { backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, padding: 13, gap: 10 },
  miniHubHeader:{ flexDirection: 'row', alignItems: 'center', gap: 12 },
  miniHubIcon:{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  miniHubTitle:{ fontSize: 14.5, color: C.trackText, fontWeight: '800' },
  miniHubSummary:{ fontSize: 11.5, color: C.trackTextSec, fontWeight: '600', marginTop: 2 },
  commandEmptyHub:{ gap: 12, paddingTop: 10 },
  commandCategoryRow:{ flexDirection: 'row', gap: 10 },
  commandCategoryTile:{ flex: 1, minHeight: 78, borderRadius: 13, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCardAlt, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 8 },
  commandCategoryCount:{ fontSize: 20, color: C.trackText, fontWeight: '900' },
  commandCategoryLabel:{ fontSize: 11, color: C.trackTextSec, fontWeight: '700', textAlign: 'center' },
});
