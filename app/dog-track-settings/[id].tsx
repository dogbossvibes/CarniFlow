import { useCallback, useRef, useState } from 'react';
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
  // Jede Auswahl gilt sofort; Speichervorgänge laufen nacheinander (keine Sperre, kein verlorener Tipp).
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const latestRef = useRef<{ key: string; settings: DogTrackSettings } | null>(null);
  const openRef = useRef(0);

  const save = useCallback((patch: DogTrackSettingsPatch) => {
    if (!userId || !id) return;
    const base = latestRef.current?.key === scope ? latestRef.current.settings : settings;
    const optimistic = { ...base, ...patch };
    latestRef.current = { key: scope, settings: optimistic };
    setLocal({ key: scope, settings: optimistic, synced: null });   // sofort sichtbar
    openRef.current += 1; setSaving(true);
    queueRef.current = queueRef.current.then(async () => {
      try {
        if (patch.handlerDistanceM != null) await dogLeadSetting.save(id, patch.handlerDistanceM);
        const result = await dogTrackSettingsStore.save(userId, id, patch);
        // Nur der letzte offene Speichervorgang übernimmt das Ergebnis; neuere Tipps bleiben sichtbar.
        if (openRef.current === 1 && latestRef.current?.key === scope) {
          latestRef.current = { key: scope, settings: result.settings };
          setLocal({ key: scope, settings: result.settings, synced: result.synced });
        } else setLocal(prev => prev && prev.key === scope ? { ...prev, synced: result.synced } : prev);
      } catch { /* Gerätekopie ist bereits geschrieben oder bleibt beim nächsten Tipp erhalten */ }
      finally { openRef.current -= 1; if (openRef.current === 0) setSaving(false); }
    });
  }, [userId, id, scope, settings]);

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
            {TRACK_INDICATIONS.map(v => <Chip key={`indication-${v}`} label={t(INDICATION_LABEL_KEYS[v])} selected={settings.indication === v} onPress={() => save({ indication: v })} testID={`indication-${v}`} />)}
            <Chip label={t('track.settings.none')} selected={!settings.indication} onPress={() => save({ indication: undefined })} testID="indication-none" />
          </View>

          <Text style={s.label}>{t('track.settings.distance.title')}</Text>
          <Text style={s.hint}>{t('track.settings.distance.hint')}</Text>
          <View style={s.row} accessibilityRole="radiogroup">
            {HANDLER_DISTANCES_M.map(d => <Chip key={`distance-${d}`} label={`${d} m`} selected={settings.handlerDistanceM === d} onPress={() => save({ handlerDistanceM: d })} testID={`distance-${d}`} />)}
          </View>

          <Text style={s.label}>{t('track.settings.exam.title')}</Text>
          <Text style={s.hint}>{t('track.settings.exam.hint')}</Text>
          <View style={s.row} accessibilityRole="radiogroup">
            <Chip label={t('track.settings.exam.training')} selected={exam === null} onPress={() => save({ examTemplate: null })} testID="exam-training" />
            {EXAM_TEMPLATES.map(tpl => <Chip key={`exam-${tpl.id}`} label={tpl.label} selected={exam === tpl.id} onPress={() => save({ examTemplate: tpl.id })} testID={`exam-${tpl.id}`} />)}
          </View>

          <Text style={s.label}>{t('track.settings.reminder.title')}</Text>
          <Text style={s.hint}>{t('track.settings.reminder.hint')}</Text>
          <View style={s.row} accessibilityRole="radiogroup">
            <Chip label={t('track.settings.off')} selected={settings.layReminderMin == null} onPress={() => save({ layReminderMin: null })} testID="reminder-off" />
            {LAY_REMINDER_MINUTES.map(m => <Chip key={`reminder-${m}`} label={t('track.settings.minutes', { minutes: m })} selected={settings.layReminderMin === m} onPress={() => save({ layReminderMin: m })} testID={`reminder-${m}`} />)}
          </View>

          <Text style={s.label}>{t('track.settings.help.title')}</Text>
          <View style={s.switchRow}>
            <Text style={s.switchText}>{t('track.settings.help.haptics')}</Text>
            <Switch testID="haptics-switch" value={hapticsEnabled(settings)} onValueChange={v => save({ haptics: v })}
              trackColor={{ true: C.trackPrimary }} accessibilityLabel={t('track.settings.help.haptics')} />
          </View>
          <View style={s.switchRow}>
            <Text style={s.switchText}>{t('track.settings.help.voice')}</Text>
            <Switch testID="voice-switch" value={voiceEnabled(settings)} onValueChange={v => save({ voice: v })}
              trackColor={{ true: C.trackPrimary }} accessibilityLabel={t('track.settings.help.voice')} />
          </View>
          <Text style={s.hint}>{t('track.settings.help.hint')}</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Chip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity testID={testID} onPress={onPress} accessibilityRole="radio"
      accessibilityState={{ checked: selected }} style={[s.chip, selected && s.chipOn]}>
      <Text style={[s.chipText, selected && s.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
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
