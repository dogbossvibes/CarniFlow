import * as Crypto from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { HeroImage } from '@/components/training/HeroImage';
import { MetricsInput } from '@/components/training/MetricsInput';
import { disciplineColor } from '@/constants/disciplines';
import { finishTrainingUnit } from '@/services/trainingUnitService';
import { handleQuotaBlock } from '@/features/subscription/quotaUx';
import type { TrainingMetrics } from '@/types/analytics';
import { queryClient } from '@/lib/queryClient';
import { useActiveTraining, resetUnit, updateSummaryDraft, saveActiveTrainingDraft, retryActiveTrainingLoad } from '@/stores/activeTraining';
import { readTrainingSaveIntent, retryTrainingSave } from '@/features/training/documentation/saveIntent';
import type { DocumentSave } from '@/services/trainingDocumentService';
import { useSession } from '@/hooks/useSession';
import { useProfile } from '@/hooks/useProfile';
import { successHaptic, tapHaptic } from '@/lib/haptics';
import { useT } from '@/i18n';

function formatDur(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

export default function SummaryScreen() {
  const { session } = useSession();
  const active = useActiveTraining();
  const { t } = useT();
  if (active.hydrating) return <ActivityIndicator />;
  if (active.hydrationError && session) return <TouchableOpacity accessibilityRole="button" onPress={() => retryActiveTrainingLoad(session.user.id)}><Text>{t('trainingDoc.draftError')}</Text></TouchableOpacity>;
  if (!session) return <Redirect href="/(auth)/login" />;
  return <SummaryForm key={`${session.user.id}:${active.unitId ?? ''}`} />;
}

function SummaryForm() {
  const router = useRouter();
  const { t } = useT();
  const active = useActiveTraining();
  const { profile } = useProfile();
  const { session } = useSession();
  const alive = useRef(true);
  const saveLock = useRef(false);
  useEffect(() => () => { alive.current = false; }, []);
  const { duration } = useLocalSearchParams<{ duration: string }>();
  const [durationSec, setDurationSec] = useState(!active.summaryDraft?.pending && Number(duration) > 0 ? Number(duration) : active.summaryDraft?.durationSec ?? (Number(duration ?? 0) || 0));
  const operationId = useRef(active.summaryDraft?.operationId ?? Crypto.randomUUID());
  const [pendingRequest, setPendingRequest] = useState<DocumentSave | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);

  const [rating, setRating] = useState<number | null>(active.summaryDraft?.rating ?? null);
  const [notes, setNotes]   = useState(active.summaryDraft?.notes ?? '');
  const [metrics, setMetrics] = useState<TrainingMetrics>(active.summaryDraft?.metrics ?? {
    motivation: null, konzentration: null, praezision: null,
    ausdauer: null, trieblage: null, impulskontrolle: null,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!session?.user.id || !active.unitId || active.ownerId && active.ownerId !== session.user.id) return;
    void readTrainingSaveIntent(session.user.id, active.unitId).then(saved => {
      if (cancelled) return;
      const request = saved?.request.requestId === operationId.current ? saved.request : null;
      setPendingRequest(request);
      if (request) {
        setNotes(request.unit.notes ?? ''); setRating(request.unit.rating ?? null); setDurationSec(request.unit.duration_sec ?? durationSec);
        setMetrics(old => ({ ...old, ...Object.fromEntries(Object.keys(old).filter(k => k in request.unit).map(k => [k, request.unit[k as keyof typeof request.unit]])) }));
      }
      setLoadError(false); setReady(true);
    }).catch(() => { if (!cancelled) { setLoadError(true); setReady(true); } });
    return () => { cancelled = true; };
    // Duration is captured once for this active-unit form, not changed by a retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id, active.unitId, retry]);
  useEffect(() => {
    if (ready && !loadError && session?.user.id && (!active.ownerId || active.ownerId === session.user.id)) updateSummaryDraft({ operationId: operationId.current, rating, notes, metrics, durationSec, pending: !!pendingRequest }, session.user.id);
  }, [ready, loadError, session?.user.id, active.ownerId, rating, notes, metrics, durationSec, pendingRequest]);

  if (!active.unitId || (active.ownerId && active.ownerId !== session?.user.id)) return <Redirect href="/(tabs)/home" />;

  const displayedExercises = pendingRequest?.exercises ?? active.exercises;
  const rated = displayedExercises.filter(e => e.rating != null);
  const avg = rated.length ? rated.reduce((sum, e) => sum + (e.rating ?? 0), 0) / rated.length : null;

  const speichern = async () => {
    if (!session || !ready || loadError || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    try {
    updateSummaryDraft({ operationId: operationId.current, rating, notes, metrics, durationSec, pending: true }, session.user.id);
    await saveActiveTrainingDraft(session.user.id);
    if (!alive.current) return;
    const { error } = pendingRequest
      ? await retryTrainingSave(session.user.id, active.unitId!, operationId.current, () => alive.current)
      : await finishTrainingUnit(
      active.unitId!,
      { duration_sec: durationSec, rating, notes: notes.trim() || null, shared_with_trainer: profile?.share_trainings_default ?? false, ...metrics },
      active.exercises.map((e, i) => ({
        discipline:    e.discipline,
        exercise_name: e.exercise_name,
        rating:        e.rating,
        notes:         e.notes,
        duration_sec:  e.duration_sec,
        seq_index:     i,
      })), session.user.id, () => alive.current, active.sourceFingerprint ?? undefined, operationId.current,
    );
    if (!alive.current) return;

    if (error) {
      if (handleQuotaBlock(error, 'training', t, () => router.push('/premium' as never))) return;
      Alert.alert(t('common.error'), t(['CONFLICT', 'UNRESOLVED_SAVE'].includes(error.code ?? '') ? 'trainingDoc.reviewSave' : 'training.saveError'));
      return;
    }
    successHaptic();
    if (resetUnit(session.user.id) === false) return;
    queryClient.invalidateQueries({ queryKey: ['trainingFeed'] });
    router.replace('/(tabs)/home');
    } catch {
      if (alive.current) Alert.alert(t('common.error'), t('training.saveError'));
    } finally {
      if (alive.current && session?.user.id && active.unitId) {
        const saved = await readTrainingSaveIntent(session.user.id, active.unitId).catch(() => null);
        if (alive.current) {
          const request = saved?.request.requestId === operationId.current ? saved.request : null;
          setPendingRequest(request); setSaving(false);
          updateSummaryDraft({ operationId: operationId.current, rating, notes, metrics, durationSec, pending: !!request }, session.user.id);
        }
      }
      saveLock.current = false;
    }
  };

  const dirty = rating != null || notes.trim() !== '' || Object.values(metrics).some(v => v != null);

  const zurueck = () => {
    tapHaptic();
    if (!dirty) { router.back(); return; }
    Alert.alert(t('training.leaveTrainingTitle'), t('training.leaveTrainingBody'), [
      { text: t('training.continueEditing'), style: 'cancel' },
      { text: t('training.backToTraining'), onPress: () => router.back() },
    ]);
  };

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <HeroImage height={340} overlay={0.96} contentPosition="top">
          <SafeAreaView edges={['top']} style={s.heroSafe}>
            <View style={s.celebrate}>
              <View style={s.trophy}>
                <Ionicons name="trophy" size={26} color={C.accentText} />
              </View>
              <Text style={s.heroTitle}>{t('training.strongUnit')}</Text>
              <Text style={s.heroSub}>{t('training.dogTrained', { dog: active.dogName ?? t('training.yourDog') })}</Text>
            </View>
          </SafeAreaView>
        </HeroImage>

        <View style={s.body}>
          {pendingRequest && <Text style={s.label}>{t('trainingDoc.pendingSave')}</Text>}
          {loadError && <TouchableOpacity accessibilityRole="button" onPress={() => setRetry(value => value + 1)}><Text style={s.label}>{t('trainingDoc.draftError')}</Text></TouchableOpacity>}
          {/* Stats */}
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statVal}>{formatDur(durationSec)}</Text>
              <Text style={s.statLabel}>{t('training.durationLabel')}</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statVal}>{displayedExercises.length}</Text>
              <Text style={s.statLabel}>{t('training.exercisesLabel')}</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statVal}>{avg != null ? avg.toFixed(1) : '—'}</Text>
              <Text style={s.statLabel}>{t('training.avgRating')}</Text>
            </View>
          </View>

          {/* Übungsliste */}
          <Text style={s.label}>{t('training.exercisesLabel')}</Text>
          {displayedExercises.map((ex, i) => (
            <View key={`${ex.exercise_name}-${i}`} style={s.exRow}>
              <View style={[s.exDot, { backgroundColor: disciplineColor(ex.discipline) }]} />
              <Text style={s.exName}>{ex.exercise_name}</Text>
              <Text style={s.exDisc}>{ex.discipline}</Text>
              {ex.rating != null && (
                <View style={s.exStars}>
                  <Ionicons name="star" size={12} color={C.star} />
                  <Text style={s.exRating}>{ex.rating}</Text>
                </View>
              )}
            </View>
          ))}

          {/* Gesamtbewertung */}
          <Text style={s.label}>{t('training.ratingLabel')}</Text>
          <View style={s.bigStars}>
            {[1, 2, 3, 4, 5].map(n => (
              <TouchableOpacity key={n} onPress={() => { if (!pendingRequest && !saving) { tapHaptic(); setRating(n); } }} hitSlop={6}>
                <Ionicons
                  name={rating != null && n <= rating ? 'star' : 'star-outline'}
                  size={32}
                  color={rating != null && n <= rating ? C.star : C.subtle}
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* Notizen */}
          <Text style={s.label}>{t('common.notes').toUpperCase()}</Text>
          <TextInput
            style={s.notes}
            placeholder={t('training.howWasIt')}
            placeholderTextColor={C.placeholder}
            value={notes}
            onChangeText={setNotes}
            editable={!pendingRequest && !saving}
            multiline
          />

          <Text style={s.label}>{t('training.metricsLabel')}</Text>
          <MetricsInput value={metrics} onChange={value => { if (!pendingRequest && !saving) setMetrics(value); }} />

          <AnimatedPressable style={[s.saveBtn, saving && { opacity: 0.5 }]} scale={0.97} disabled={saving || !ready || loadError} onPress={speichern}>
            <LinearGradient colors={['#00FFCC', '#00FFCC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            <Ionicons name="checkmark-circle" size={22} color={C.accentText} />
            <Text style={s.saveTxt}>{saving ? t('common.saving') : t('training.saveUnit')}</Text>
          </AnimatedPressable>

          <View style={{ height: 40 }} />
        </View>
      </ScrollView>

      <SafeAreaView edges={['top']} style={s.backWrap} pointerEvents="box-none">
        <TouchableOpacity style={s.backBtn} onPress={zurueck} activeOpacity={0.7} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 0 },

  backWrap: { position: 'absolute', top: 0, left: 20, right: 20 },
  backBtn:  { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginTop: 8 },

  heroSafe:  { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 20, paddingBottom: 24 },
  celebrate: { gap: 8 },
  trophy:    { width: 56, height: 56, borderRadius: 18, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  heroTitle: { fontSize: 36, color: C.white, fontWeight: '900', letterSpacing: -0.8 },
  heroSub:   { fontSize: 15, color: '#CFCFCF', fontWeight: '500' },

  body: { paddingHorizontal: 20, marginTop: 4 },

  statsRow:  { flexDirection: 'row', gap: 10, marginTop: 8 },
  statCard:  { flex: 1, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingVertical: 18, alignItems: 'center', gap: 6 },
  statVal:   { fontSize: 20, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  statLabel: { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 1 },

  label: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 12, marginTop: 24 },

  exRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 8 },
  exDot:    { width: 8, height: 8, borderRadius: 4 },
  exName:   { fontSize: 14, color: C.white, fontWeight: '700', flex: 1 },
  exDisc:   { fontSize: 12, color: C.muted, fontWeight: '500' },
  exStars:  { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 4 },
  exRating: { fontSize: 12, color: C.star, fontWeight: '700' },

  bigStars: { flexDirection: 'row', gap: 12, justifyContent: 'center', paddingVertical: 4 },

  notes: { backgroundColor: C.input, borderRadius: 16, borderWidth: 1, borderColor: C.border, color: C.white, fontSize: 14, padding: 14, minHeight: 90, textAlignVertical: 'top' },

  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 60, borderRadius: 20, overflow: 'hidden', marginTop: 28 },
  saveTxt: { fontSize: 16, color: C.accentText, fontWeight: '900', letterSpacing: 0.3 },
});
