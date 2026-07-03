import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { DogAvatar } from '@/components/dogs/DogAvatar';
import { DogHubStatsGrid } from '@/components/dogs/DogHubStatsGrid';
import { DogQuickActions, type QuickActionKey } from '@/components/dogs/DogQuickActions';
import { DogTrainingList } from '@/components/dogs/DogTrainingList';
import { DogFaehrteSummary } from '@/components/dogs/DogFaehrteSummary';
import { DogGoalsCard } from '@/components/dogs/DogGoalsCard';
import { DogHealthLoadCard } from '@/components/dogs/DogHealthLoadCard';
import { DogDocumentsCard } from '@/components/dogs/DogDocumentsCard';
import { DogTrainerCard } from '@/components/dogs/DogTrainerCard';
import { DogAiCoachCard } from '@/components/dogs/DogAiCoachCard';
import { genderLabel, type DogDocument, type DogHubVM, type DogTrainingItem } from '@/components/dogs/types';

export interface DogHubActions {
  onBack:             () => void;
  onSettings:         () => void;
  onStartTraining:    (discipline?: string | null, note?: string | null) => void;
  onStartFaehrte:     () => void;
  onQuickAction:      (k: QuickActionKey) => void;
  onOpenTraining?:    (item: DogTrainingItem) => void;
  onAddHealth:        () => void;
  onAddDoc:           () => void;
  onOpenDocument?:    (doc: DogDocument) => void;
  onEditGoal:         () => void;
  onChat:             () => void;
  onUpgrade?:         () => void;
}

type TabKey = 'overview' | 'training' | 'faehrte' | 'goals' | 'health' | 'docs' | 'trainer';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Übersicht' },
  { key: 'training', label: 'Training' },
  { key: 'faehrte',  label: 'Fährte' },
  { key: 'goals',    label: 'Ziele' },
  { key: 'health',   label: 'Gesundheit' },
  { key: 'docs',     label: 'Dokumente' },
  { key: 'trainer',  label: 'Trainer' },
];

export function DogHubScreen({ vm, actions, aiUnlocked }: { vm: DogHubVM; actions: DogHubActions; aiUnlocked: boolean }) {
  const [tab, setTab] = useState<TabKey>('overview');
  const [aiTipHidden, setAiTipHidden] = useState(false);   // „Später" blendet den KI-Hinweis für diese Sitzung aus
  const { width } = useWindowDimensions();
  const id = vm.identity;
  const meta = [id.breed, id.ageLabel, genderLabel(id.gender)].filter(Boolean).join(' · ');
  const badges = [
    id.discipline,
    id.weightKg != null ? `${id.weightKg} kg` : null,
    id.shoulderHeightCm != null ? `${id.shoulderHeightCm} cm` : null,
  ].filter((b): b is string => !!b);
  const cols = width >= 600 ? 2 : 2;

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

            {/* Tab-Leiste */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabbar}>
              {TABS.map(t => {
                const on = t.key === tab;
                return (
                  <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} style={[s.tab, on && s.tabOn]} activeOpacity={0.8}>
                    <Text style={[s.tabTxt, on && s.tabTxtOn]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Tab-Inhalt */}
            <View style={s.content}>
              {tab === 'overview' && (
                <>
                  <DogHubStatsGrid stats={vm.stats} columns={cols} />
                  {vm.lastTrainingLabel ? (
                    <View style={s.note}>
                      <Ionicons name="time-outline" size={15} color={C.trackTextMut} />
                      <Text style={s.noteTxt} numberOfLines={1}>Letztes Training: <Text style={s.noteStrong}>{vm.lastTrainingLabel}</Text></Text>
                    </View>
                  ) : null}
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
              {tab === 'training' && (
                <>
                  <Text style={s.sectionLabel}>Schnellstart</Text>
                  <DogQuickActions onSelect={actions.onQuickAction} />
                  <Text style={s.sectionLabel}>Letzte Trainings</Text>
                  <DogTrainingList items={vm.recentTrainings} onOpen={actions.onOpenTraining} />
                </>
              )}
              {tab === 'faehrte'  && <DogFaehrteSummary data={vm.faehrte} onStart={actions.onStartFaehrte} />}
              {tab === 'goals'    && <DogGoalsCard goal={vm.goal} onEdit={actions.onEditGoal} />}
              {tab === 'health'   && <DogHealthLoadCard health={vm.health} onAddEntry={actions.onAddHealth} />}
              {tab === 'docs'     && <DogDocumentsCard documents={vm.documents} onAdd={actions.onAddDoc} onOpen={actions.onOpenDocument} />}
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
});
