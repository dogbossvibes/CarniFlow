import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useFocusEffect, useRouter } from 'expo-router';
import { FT } from '@/constants/colors';
import { CALIBRATION_STEPS } from '@/features/tracking/utils/stepCalibration';
import { useStepCalibration } from '@/features/tracking/hooks/useStepCalibration';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { useStepLengthSetting } from '@/hooks/useStepLengthSetting';
import { useToast } from '@/components/ui/Toast';
import { HelpButton } from '@/components/help/HelpButton';
import { useT } from '@/i18n';

const cm = (m: number) => Math.round(m * 100);
function Action({ label, onPress, disabled = false, primary = false, busy = false }: {
  label: string; onPress: () => void; disabled?: boolean; primary?: boolean; busy?: boolean;
}) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled, busy }} style={{ minHeight: 48, opacity: disabled ? 0.5 : 1 }}
    className={`items-center justify-center rounded-[16px] px-5 py-3.5 ${primary ? 'bg-ft-acc' : 'bg-white/5 border border-ft-line-strong'}`}>
    <Text className={`text-[15px] text-center font-bold ${primary ? 'text-ft-acc-text' : 'text-ft-text'}`}>{label}</Text>
  </Pressable>;
}

export default function StepCalibrationScreen() {
  const router = useRouter();
  useKeepAwake();
  const { stepLengthM, setStepLengthM, loaded, loadError, reload } = useStepLengthSetting();
  const blocked = useTrackingStore(s => s.isRecording || s.sessionStatus === 'searching');
  const measurement = useStepCalibration(blocked);
  const { interrupt } = measurement;
  const { showToast, toast } = useToast();
  const { t } = useT();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const active = useRef(true);
  useEffect(() => () => { active.current = false; }, []);
  useFocusEffect(useCallback(() => {
    active.current = true;
    return () => { active.current = false; interrupt(); };
  }, [interrupt]));
  const back = useCallback(() => {
    if (router.canGoBack()) router.back(); else router.replace('/(tabs)/profile' as never);
  }, [router]);
  const cancel = useCallback(() => {
    if (savingRef.current) return;
    interrupt(); back();
  }, [back, interrupt]);
  const save = useCallback(async (value: number | null) => {
    const current = useTrackingStore.getState();
    if (!active.current || savingRef.current || !loaded || current.isRecording || current.sessionStatus === 'searching') return;
    savingRef.current = true; setSaving(true);
    try {
      await setStepLengthM(value);
      if (!active.current) return;
      showToast(value === null ? t('track.resetStepLengthDone') : t('track.stepLengthSaved', { cm: cm(value) }));
      if (value !== null) back();
    } catch {
      if (active.current) showToast(t('track.calibrationSaveFailed'));
    } finally { savingRef.current = false; if (active.current) setSaving(false); }
  }, [back, loaded, setStepLengthM, showToast, t]);
  const issueKeys = {
    signal: 'track.calibrationSignal', interrupted: 'track.calibrationInterrupted',
    implausible: 'track.calibrationInvalid', uncertain: 'track.calibrationUncertain',
    course: 'track.calibrationCourse', permission: 'track.locationPermissionMissing', busy: 'track.calibrationBusy',
  } as const;
  const phase = measurement.phase;
  const idle = phase === 'idle';
  const result = phase === 'result';
  const failed = phase === 'error' || (result && measurement.issue != null);
  const currentLabel = !loaded ? t('common.loading') : stepLengthM != null
    ? t('profile.stepLengthPersonal', { cm: cm(stepLengthM) }) : t('profile.stepLengthDefault');

  return <View className="flex-1 bg-ft-bg">
    <SafeAreaView edges={['top', 'bottom']} className="flex-1">
      <View className="flex-row items-center gap-3 px-[18px] pb-3" style={{ paddingTop: 4 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} accessibilityState={{ disabled: saving }}
          disabled={saving} onPress={cancel} hitSlop={8} style={{ width: 48, height: 48, flexShrink: 0 }}
          className="rounded-[12px] border border-ft-line-strong bg-white/10 items-center justify-center">
          <Ionicons name="chevron-back" size={20} color={FT.text} />
        </Pressable>
        <Text className="flex-1 text-[18px] font-black text-ft-text" style={{ flexShrink: 1 }}>{t('track.stepCalibrationTitle')}</Text>
        <HelpButton topicId="track_step_calibration" autoShow tint={FT.text} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }} showsVerticalScrollIndicator={false}>
        <View className="rounded-[20px] p-4 bg-white/5 border border-ft-line-strong gap-2">
          <Text className="text-[13px] text-ft-muted">{t('track.current')}</Text>
          <Text className="text-[22px] font-black text-ft-text">{currentLabel}</Text>
        </View>
        {loadError && <>
          <Text accessibilityRole="alert" className="text-ft-warn">{t('track.calibrationLoadFailed')}</Text>
          <Action label={t('common.retry')} onPress={() => { void reload().catch(() => {}); }} />
        </>}
        {blocked && <Text accessibilityRole="alert" className="text-ft-warn">{t('track.calibrationBusy')}</Text>}
        {idle && <>
          <Text className="text-[15px] text-ft-text leading-[23px]">{t('track.calibrationProtocol', { count: CALIBRATION_STEPS })}</Text>
          <Text className="text-[13px] text-ft-muted leading-[20px]">{t('track.calibrationEstimate')}</Text>
          <Action label={t('track.startCalibration')} onPress={() => { void measurement.start(); }} primary disabled={!loaded || blocked || saving} />
          {stepLengthM != null && <Action label={t('track.resetToDefault')} disabled={!loaded || blocked || saving} busy={saving}
            onPress={() => Alert.alert(t('track.resetStepLengthTitle'), t('track.resetStepLengthBody'), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('track.reset'), style: 'destructive', onPress: () => { void save(null); } },
            ])} />}
        </>}
        {(phase === 'preparing' || phase === 'warming' || phase === 'finishing') && <Text accessibilityLiveRegion="polite" className="text-[16px] font-bold text-ft-text">
          {t(phase === 'finishing' ? 'track.calibrationEndWait' : 'track.calibrationStartWait')}
        </Text>}
        {phase === 'ready' && <>
          <Text accessibilityLiveRegion="polite" className="text-ft-text">{t('track.calibrationReady')}</Text>
          <Action label={t('track.walkSteps', { count: CALIBRATION_STEPS })} onPress={measurement.begin} primary disabled={blocked} />
        </>}
        {phase === 'measuring' && <>
          <Text className="text-[16px] font-bold text-ft-text">{t('track.calibrationWalking', { count: CALIBRATION_STEPS })}</Text>
          <Action label={t('track.doneSteps', { count: CALIBRATION_STEPS })} onPress={measurement.finish} primary />
        </>}
        {(phase === 'measuring' || phase === 'finishing' || result) && <View className="rounded-[20px] p-5 bg-white/5 border border-ft-line-strong gap-2">
          <Text className="text-[13px] text-ft-muted">{t('track.calibrationGpsDistance')}</Text>
          <Text className="text-[34px] font-black text-ft-text" style={{ fontVariant: ['tabular-nums'] }}>≈ {measurement.distanceM.toFixed(1)} m</Text>
          {result && measurement.stepLengthM != null && <>
            <Text className="text-[13px] text-ft-muted">{t('track.yourStepLength')}</Text>
            <Text className="text-[28px] font-black text-ft-acc">{t('track.cmPerStep', { cm: cm(measurement.stepLengthM) })}</Text>
          </>}
        </View>}
        {measurement.accuracy != null && !idle && <Text className="text-[12px] text-ft-muted">
          {t('track.calibrationRadius', { meters: Math.round(measurement.accuracy) })}
        </Text>}
        {failed && measurement.issue && <Text accessibilityRole="alert" className="text-[14px] text-ft-warn leading-[21px]">{t(issueKeys[measurement.issue])}</Text>}
        {result && measurement.stepLengthM != null && <>
          <Text className="text-[13px] text-ft-muted leading-[20px]">{t('track.calibrationEstimate')}</Text>
          <Action label={saving ? t('common.saving') : t('track.applyStepLength')} primary disabled={saving || !loaded || blocked} busy={saving}
            onPress={() => { if (measurement.stepLengthM != null && !measurement.issue) void save(measurement.stepLengthM); }} />
        </>}
        {(result || failed) && <Action label={t('track.measureAgain')} onPress={measurement.reset} disabled={saving || blocked} />}
        {!idle && <Action label={t('common.cancel')} onPress={cancel} disabled={saving} />}
      </ScrollView>
    </SafeAreaView>
    {toast}
  </View>;
}
