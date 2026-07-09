import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { getCommand, deleteCommand, toggleFavorite, CATEGORY_LABEL, type DogCommand } from '@/features/dogs/dogCommands';

const SPORT = C.trackPrimary;
const PRIVAT = C.trackPurple;
const DIFF_LABEL = { easy: 'Einfach', medium: 'Mittel', hard: 'Schwer' } as const;

function Section({ icon, title, children }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <View style={s.secHead}><Ionicons name={icon} size={14} color={C.trackPrimary} /><Text style={s.secTitle}>{title}</Text></View>
      {children}
    </View>
  );
}

export default function DogCommandDetail() {
  const router = useRouter();
  const { t } = useT();
  const { dogId, commandId } = useLocalSearchParams<{ dogId: string; commandId: string }>();
  const [cmd, setCmd] = useState<DogCommand | null>(null);

  useFocusEffect(useCallback(() => {
    if (dogId && commandId) getCommand(dogId, commandId).then(setCmd);
  }, [dogId, commandId]));

  if (!cmd) {
    return <View style={s.root}><SafeAreaView edges={['top']} style={s.center}><Text style={s.muted}>{t('cmd.notFound')}</Text></SafeAreaView></View>;
  }

  const col = cmd.category === 'sport' ? SPORT : PRIVAT;
  const remove = () => {
    Alert.alert(t('cmd.deleteConfirm'), `„${cmd.name}" wird entfernt.`, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => { await deleteCommand(dogId, cmd.id); router.back(); } },
    ]);
  };

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.bar}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={20} color={C.trackText} /></TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={s.iconBtn} onPress={async () => { await toggleFavorite(dogId, cmd.id); setCmd(await getCommand(dogId, cmd.id)); }} hitSlop={8}>
            <Ionicons name={cmd.isFavorite ? 'star' : 'star-outline'} size={18} color={cmd.isFavorite ? C.trackWarning : C.trackTextMut} />
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.push({ pathname: '/dog-command/edit', params: { dogId, commandId: cmd.id } } as never)} hitSlop={8}>
            <Ionicons name="create-outline" size={18} color={C.trackText} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.scroll}>
          <Text style={s.title}>{cmd.name}</Text>
          <View style={s.badges}>
            <View style={[s.badge, { borderColor: `${col}66`, backgroundColor: `${col}18` }]}><Text style={[s.badgeTxt, { color: col }]}>{CATEGORY_LABEL[cmd.category]}</Text></View>
            {cmd.area ? <View style={s.badge}><Text style={[s.badgeTxt, { color: C.trackTextSec }]}>{cmd.area}</Text></View> : null}
            <View style={s.badge}><Text style={[s.badgeTxt, { color: C.trackTextSec }]}>{DIFF_LABEL[cmd.difficulty]}</Text></View>
          </View>

          {cmd.goal ? <Section icon="flag-outline" title={t('cmd.goal')}><Text style={s.body}>{cmd.goal}</Text></Section> : null}

          <Section icon="volume-medium-outline" title={t('cmd.signal')}><Text style={s.body}>„{cmd.verbalCue}"</Text></Section>

          {cmd.handSignal ? <Section icon="hand-left-outline" title={t('cmd.handSignal')}><Text style={s.body}>{cmd.handSignal}</Text></Section> : null}

          {cmd.description ? <Section icon="document-text-outline" title={t('cmd.description')}><Text style={s.body}>{cmd.description}</Text></Section> : null}

          {cmd.steps.length ? <Section icon="list-outline" title={t('cmd.instructions')}>{cmd.steps.map((x, i) => <Text key={i} style={s.li}>{i + 1}. {x}</Text>)}</Section> : null}

          {cmd.commonMistakes.length ? <Section icon="warning-outline" title={t('cmd.commonMistakes')}>{cmd.commonMistakes.map((x, i) => <Text key={i} style={s.li}>• {x}</Text>)}</Section> : null}

          {cmd.tips.length ? <Section icon="bulb-outline" title={t('cmd.tips')}>{cmd.tips.map((x, i) => <Text key={i} style={s.li}>• {x}</Text>)}</Section> : null}

          <View style={{ height: 8 }} />
          <TouchableOpacity onPress={remove} style={s.delBtn} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={16} color={C.trackDanger} />
            <Text style={s.delTxt}>{t('cmd.delete')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.trackBg },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted:   { color: C.trackTextSec, fontSize: 14 },
  bar:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, alignItems: 'center', justifyContent: 'center' },
  scroll:  { padding: 16, gap: 12 },
  title:   { fontSize: 28, color: C.trackText, fontWeight: '900', letterSpacing: -0.5 },
  badges:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge:   { borderRadius: 9, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, paddingHorizontal: 9, paddingVertical: 4 },
  badgeTxt:{ fontSize: 11, fontWeight: '800' },
  section: { borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, padding: 14, gap: 6 },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  secTitle:{ fontSize: 11, color: C.trackTextMut, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  body:    { fontSize: 15, color: C.trackText, lineHeight: 21, fontWeight: '500' },
  li:      { fontSize: 14.5, color: C.trackText, lineHeight: 22, fontWeight: '500' },
  delBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  delTxt:  { fontSize: 14, color: C.trackDanger, fontWeight: '700' },
});
