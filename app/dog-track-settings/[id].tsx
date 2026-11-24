import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { useDogTrackSettings } from '@/features/tracking/hooks/useDogTrackSettings';
import {
  dogTrackSettingsStore, hapticsEnabled, voiceEnabled, INDICATION_LABEL_KEYS, LAY_REMINDER_MINUTES, TRACK_INDICATIONS,
  type DogTrackSettings, type DogTrackSettingsPatch,
} from '@/features/tracking/dogTrackSettings';
import { dogLeadSetting } from '@/features/tracking/store/dogLeadSetting';
import { HANDLER_DISTANCES_M } from '@/features/tracking/utils/searchGeometry';
import { EXAM_TEMPLATES } from '@/features/tracking/utils/examTemplates';

/** Fährten-Einstellungen je Hund. Jede Auswahl wird sofort gespeichert. */
export default function DogTrackSettingsScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const { t } = useT();
  const { settings: loadedSettings, loaded, userId } = useDogTrackSettings(id);
  const [local, setLocal] = useState<{ key: string; settings: DogTrackSettings; synced: boolean | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const scope = `${userId ?? ''}:${id ?? ''}`;
  const settings = local?.key === scope ? local.settings : loadedSettings;
  const synced = local?.key === scope ? local.synced : null;

  const save = async (patch: DogTrackSettingsPatch) => {
    if (!userId || !id || saving) return;
    setSaving(true);
    setLocal({ key: scope, settings: { ...settings, ...patch }, synced: null });   // sofort sichtbar
    try {
      if (patch.handlerDistanceM != null) await dogLeadSetting.save(id, patch.handlerDistanceM);
      const result = await dogTrackSettingsStore.save(userId, id, patch);
      setLocal({ key: scope, settings: result.settings, synced: result.synced });
    } finally { setSaving(false); }
  };

  const chip = (label: string, selected: boolean, onPress: () => void, testID?: string) => (
    <TouchableOpacity key={label} testID={testID} onPress={onPress} disabled={saving} accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: saving }} style={[s.chip, selected && s.chipOn]}>
      <Text style={[s.chipText, selected && s.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
  const exam = settings.examTemplate ?? null;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.top}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={24} color={C.trackText} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title} accessibilityRole="header">{t('track.settings.title')}</Text>
          {!!name && <Text style={s.sub}>{name}</Text>}
        </View>
        {saving && <ActivityIndicator color={C.trackPrimary} />}
      </View>
      {!loaded ? <ActivityIndicator style={{ marginTop: 40 }} color={C.trackPrimary} /> : (
        <ScrollView contentContainerStyle={s.body}>
          {synced === false && <Text style={s.notice} accessibilityLiveRegion="polite">{t('track.settings.deviceOnly')}</Text>}

          <Text style={s.label}>{t('track.settings.indication.title')}</Text>
          <Text style={s.hint}>{t('track.settings.indication.hint')}</Text>
          <View style={s.row} accessibilityRole="radiogroup">
            {TRACK_INDICATIONS.map(v => chip(t(INDICATION_LABEL_KEYS[v]), settings.indication === v, () => void save({ indication: v }), `indication-${v}`))}
            {chip(t('track.settings.none'), !settings.indication, () => void save({ indication: undefined }), 'indication-none')}
          </View>

          <Text style={s.label}>{t('track.settings.distance.title')}</Text>
          <Text style={s.hint}>{t('track.settings.distance.hint')}</Text>
          <View style={s.row} accessibilityRole="radiogroup">
            {HANDLER_DISTANCES_M.map(d => chip(`${d} m`, settings.handlerDistanceM === d, () => void save({ handlerDistanceM: d }), `distance-${d}`))}
          </View>

          <Text style={s.label}>{t('track.settings.exam.title')}</Text>
          <Text style={s.hint}>{t('track.settings.exam.hint')}</Text>
          <View style={s.row} accessibilityRole="radiogroup">
            {chip(t('track.settings.exam.training'), exam === null, () => void save({ examTemplate: null }), 'exam-training')}
            {EXAM_TEMPLATES.map(tpl => chip(tpl.label, exam === tpl.id, () => void save({ examTemplate: tpl.id }), `exam-${tpl.id}`))}
          </View>

          <Text style={s.label}>{t('track.settings.reminder.title')}</Text>
          <Text style={s.hint}>{t('track.settings.reminder.hint')}</Text>
          <View style={s.row} accessibilityRole="radiogroup">
            {chip(t('track.settings.off'), settings.layReminderMin == null, () => void save({ layReminderMin: null }), 'reminder-off')}
            {LAY_REMINDER_MINUTES.map(m => chip(t('track.settings.minutes', { minutes: m }), settings.layReminderMin === m, () => void save({ layReminderMin: m }), `reminder-${m}`))}
          </View>

          <Text style={s.label}>{t('track.settings.help.title')}</Text>
          <View style={s.switchRow}>
            <Text style={s.switchText}>{t('track.settings.help.haptics')}</Text>
            <Switch testID="haptics-switch" value={hapticsEnabled(settings)} disabled={saving} onValueChange={v => void save({ haptics: v })}
              trackColor={{ true: C.trackPrimary }} accessibilityLabel={t('track.settings.help.haptics')} />
          </View>
          <View style={s.switchRow}>
            <Text style={s.switchText}>{t('track.settings.help.voice')}</Text>
            <Switch testID="voice-switch" value={voiceEnabled(settings)} disabled={saving} onValueChange={v => void save({ voice: v })}
              trackColor={{ true: C.trackPrimary }} accessibilityLabel={t('track.settings.help.voice')} />
          </View>
          <Text style={s.hint}>{t('track.settings.help.hint')}</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.trackBg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  title: { color: C.trackText, fontSize: 18, fontWeight: '800' },
  sub: { color: C.trackTextSec, fontSize: 13 },
  body: { padding: 16, paddingBottom: 48, gap: 8 },
  label: { color: C.trackText, fontSize: 15, fontWeight: '800', marginTop: 14 },
  hint: { color: C.trackTextSec, fontSize: 12, lineHeight: 18 },
  notice: { color: C.trackWarning, fontSize: 12, lineHeight: 18 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard },
  chipOn: { borderColor: C.trackPrimary },
  chipText: { color: C.trackText, fontSize: 14, fontWeight: '700' },
  chipTextOn: { color: C.trackPrimary },
  switchRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 12 },
  switchText: { flex: 1, color: C.trackText, fontSize: 14 },
});
