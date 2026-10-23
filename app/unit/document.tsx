import { useCallback, useEffect, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import {
  ActivityIndicator, Alert, AppState, BackHandler, Keyboard, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { HelpButton } from '@/components/help/HelpButton';
import { PhotoPicker } from '@/components/ui/PhotoPicker';
import { AudioRecorder } from '@/components/ui/AudioRecorder';
import { CompactDurationStepper } from '@/components/ui/CompactDurationStepper';
import { MultiVideoUpload } from '@/components/training/MultiVideoUpload';
import { MetricsInput } from '@/components/training/MetricsInput';
import { CustomExerciseSheet } from '@/components/training/CustomExerciseSheet';
import { readPendingTrainingSave, readTrainingSaveIntent, retryTrainingSave } from '@/features/training/documentation/saveIntent';
import { addTrainingFocuses } from '@/features/training/documentation/focus';
import { ServerTrainingFocusList, useServerTrainingFocuses } from '@/components/training/ServerTrainingFocusList';
import { TrainingFocusList } from '@/components/training/TrainingFocusList';
import { ExerciseIdentityList } from '@/components/training/ExerciseIdentityList';
import { loadTrainingPreparation, type PreparationUnit } from '@/services/trainingPreparation';
import { historyDate } from '@/features/training/documentation/historyDate';
import { planTemplate, readTemplateHints, templateEntryContext, type TemplateContext, type TemplateChoice } from '@/features/training/documentation/template';
import { TrainingPreparation } from '@/components/training/TrainingPreparation';
import { planFromHistory, lastExerciseHistory, performedExercises, localDay, measuredMinutes, type PlannedExercise } from '@/features/training/documentation/model';
import { isConfirmedDocumentedRetry, trainingUnitFingerprint } from '@/features/training/documentation/retry';
import { documentDraftKey, loadDocumentDraft, saveDocumentDraft, clearDocumentDraft } from '@/features/training/documentation/draft';
import { SelectedExerciseCard } from '@/components/training/SelectedExerciseCard';
import { useDogs } from '@/hooks/useDogs';
import { useSession } from '@/hooks/useSession';
import { useProfile } from '@/hooks/useProfile';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { DISCIPLINES, customToDiscipline, disciplineColor, type Discipline } from '@/constants/disciplines';
import { DEFAULT_SPARTEN } from '@/constants/sparten';
import {
  saveDocumentedUnitAtomic, getTrainingUnitById, getRecentExerciseNames,
} from '@/services/trainingUnitService';
import { updateCustomCategory } from '@/services/customCategoryService';
import { handleQuotaBlock } from '@/features/subscription/quotaUx';
import { DateField } from '@/components/ui/DateField';
import { DogIcon } from '@/components/ui/DogIcon';
import { queryClient } from '@/lib/queryClient';
import { tapHaptic, successHaptic } from '@/lib/haptics';
import type { AudioNote } from '@/types';
import type { TrainingMetrics } from '@/types/analytics';
import type { DocumentSave } from '@/services/trainingDocumentService';
import type { TrainingUnit } from '@/types/trainingUnit';
import { useT } from '@/i18n';
import { formatDate } from '@/i18n/format';

const EMPTY_METRICS: TrainingMetrics = {
  motivation: null, konzentration: null, praezision: null,
  ausdauer: null, trieblage: null, impulskontrolle: null,
};

const scopeKey = (d: Discipline) => d.key.startsWith('custom:') ? d.key : `system:${d.key}`;

const SCORE_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface DocumentDraft {
  unitId: string; dogId: string | null; activeDisc: string; selected: PlannedExercise[];
  description: string; score: number; date: string; durationMin: number | null;
  photos: string[]; videos: string[]; audio: (AudioNote & { transcript?: string | null })[]; metrics: TrainingMetrics;
  templateContext?: TemplateContext;
  otherDogs?: Record<string, Omit<DocumentDraft, 'otherDogs'>>;
  workflowStep?: number; shared: boolean; operationId?: string; recordedDurationSec?: number | null; atomic?: boolean; nextFocusDisciplineKey?: string; nextFocus?: string; nextFocusDiscipline?: string; focusId?: string; sourceFingerprint?: string; remoteCompleted?: boolean;
}

function draftFromIntent(draft: DocumentDraft, request: DocumentSave): DocumentDraft {
  const unit = request.unit;
  const focus = request.focusChanges?.filter(change => change.action === 'create').map(change => change.request) ?? [];
  const general = focus.find(item => !item.sourceExerciseId);
  const ids = new Set(request.exercises.map(e => e.id));
  return { ...draft, unitId: request.unitId, operationId: request.requestId, atomic: true, remoteCompleted: false,
    dogId: unit.dog_id ?? draft.dogId, description: unit.notes ?? '', score: unit.score ?? 0,
    date: unit.session_date ? `${unit.session_date}T12:00:00` : draft.date,
    durationMin: unit.duration_sec != null ? Math.round(unit.duration_sec / 60) : null, recordedDurationSec: unit.duration_sec ?? null,
    photos: unit.photos ?? draft.photos, videos: unit.videos ?? draft.videos,
    audio: unit.audio_files?.map(a => ({ ...a, createdAt: '' })) ?? draft.audio,
    shared: unit.shared_with_trainer ?? draft.shared,
    metrics: { ...draft.metrics, ...Object.fromEntries(Object.keys(EMPTY_METRICS).filter(k => k in unit).map(k => [k, unit[k as keyof typeof unit]])) },
    nextFocus: general?.text ?? '', nextFocusDisciplineKey: general?.disciplineKey ?? '', focusId: general?.id ?? draft.focusId,
    selected: [...request.exercises.map(e => {
      const previous = draft.selected.find(old => old.key === e.id);
      const next = focus.find(item => item.sourceExerciseId === e.id);
      return { ...previous, key: e.id, name: e.exercise_name, discipline: e.discipline, disciplineKey: e.discipline_key,
        exerciseKey: e.exercise_identity_id ?? undefined, performed: true, rating: e.rating, notes: e.notes,
        durationSec: e.duration_sec, nextFocus: next?.text, nextFocusId: next?.id,
        identityNew: request.identityChanges?.some(change => change.request.id === e.exercise_identity_id) ?? false };
    }), ...draft.selected.filter(e => !e.performed && !ids.has(e.key))],
  };
}

function validDocumentDraft(value: unknown): value is DocumentDraft {
  if (!value || typeof value !== 'object') return false;
  const d = value as DocumentDraft;
  if (d.otherDogs && (typeof d.otherDogs !== 'object' || Array.isArray(d.otherDogs) || !Object.entries(d.otherDogs).every(([dog, value]) => value && value.dogId === dog && !('otherDogs' in value) && validDocumentDraft(value)))) return false;
  if (d.templateContext) {
    const c = d.templateContext;
    if (typeof c.sourceId !== 'string' || typeof c.sourceDate !== 'string' || c.dogId !== d.dogId || typeof c.discipline !== 'string'
        || !Array.isArray(c.hints) || !c.hints.every(h => h && typeof h.id === 'string' && typeof h.text === 'string' && typeof h.date === 'string')) return false;
  }
  return typeof d.unitId === 'string' && !!d.unitId && typeof d.activeDisc === 'string'
    && (d.dogId == null || typeof d.dogId === 'string') && typeof d.description === 'string'
    && typeof d.shared === 'boolean' && Number.isFinite(d.score)
    && typeof d.date === 'string' && Number.isFinite(new Date(d.date).getTime())
    && (d.durationMin === null || (Number.isFinite(d.durationMin) && d.durationMin >= 0))
    && Array.isArray(d.selected) && d.selected.every(e => e && typeof e.key === 'string' && typeof e.name === 'string'
      && typeof e.discipline === 'string' && typeof e.performed === 'boolean'
      && (e.rating === null || (Number.isFinite(e.rating) && e.rating >= 1 && e.rating <= 5))
      && (e.notes === null || typeof e.notes === 'string'))
    && Array.isArray(d.photos) && d.photos.every(url => typeof url === 'string')
    && Array.isArray(d.videos) && d.videos.every(url => typeof url === 'string')
    && Array.isArray(d.audio) && d.audio.every(a => a && typeof a.url === 'string' && typeof a.duration === 'string')
    && !!d.metrics && ['motivation', 'konzentration', 'praezision', 'ausdauer', 'trieblage', 'impulskontrolle']
      .every(key => { const v = d.metrics[key as keyof TrainingMetrics]; return v === null || Number.isFinite(v); });
}

export default function DocumentScreen() {
  const { session, loading } = useSession();
  const { id, dogId: entryDog, discipline: entryDiscipline, draftToken, template } = useLocalSearchParams<{ id?: string; dogId?: string; discipline?: string; draftToken?: string; template?: string }>();
  if (loading) return <ActivityIndicator />;
  if (!session) return <Redirect href="/(auth)/login" />;
  // A new account or edit target gets a fresh component; late reads cannot
  // repopulate another account's form.
  return <DocumentForm key={`${session?.user.id ?? 'signed-out'}:${id ?? `new:${entryDog ?? ''}:${entryDiscipline ?? ''}:${template ?? ''}:${draftToken ?? ''}`}`} />;
}

function DocumentForm() {
  const router = useRouter();
  const { t, locale } = useT();
  const { id, duration, dogId: dogIdParam, discipline: discParam, note: noteParam, template, templateChoice, draftToken } =
    useLocalSearchParams<{ id?: string; duration?: string; dogId?: string; discipline?: string; note?: string; template?: string; templateChoice?: string; draftToken?: string }>();
  const editing = !!id;
  // Vom Timer mitgegebene Dauer (Sekunden) → Minuten vorbefüllen.
  const initialMin = template ? null : measuredMinutes(duration);
  const { dogs, loading: dogsLoading } = useDogs();
  const { session } = useSession();
  const { profile, loading: profileLoading } = useProfile();
  const { categories, loading: categoriesLoading } = useCustomCategories();

  // Feste Sparten nach den im Profil aktivierten filtern. Fallback = Standard-
  // Sparten (nicht „alle"), konsistent mit dem Sparten-Hub (app/unit/start.tsx),
  // damit Opt-in-Sparten wie Obedience nicht vorab erscheinen.
  const aktiveSparten = profile?.aktive_sparten ?? DEFAULT_SPARTEN;
  const disciplines: Discipline[] = [
    ...DISCIPLINES.filter(d => !d.custom && aktiveSparten.includes(d.label)),
    ...categories.map(customToDiscipline),
  ];

  // Vom KI-Hinweis/Timer vorgeschlagene Sparte (Label → Key), sofern aktiv.
  const paramDiscKey = discParam ? disciplines.find(d => d.label === discParam || d.key === discParam)?.key : undefined;
  const initialDisc = paramDiscKey && disciplines.some(d => d.key === paramDiscKey)
    ? paramDiscKey : (disciplines[0]?.key ?? 'faehrte');

  const [dogId, setDogId] = useState<string | null>(dogIdParam ?? (dogs.length === 1 ? dogs[0].id : null));
  const [activeDisc, setActiveDisc] = useState<string>(initialDisc);
  const [selected, setSelected] = useState<PlannedExercise[]>([]);
  const [templateContext, setTemplateContext] = useState<TemplateContext>();
  const [customSheetOpen, setCustomSheetOpen] = useState(false);
  const [recentNames, setRecentNames] = useState<string[]>([]);
  const [description, setDescription] = useState(template ? '' : noteParam ?? '');
  const [score, setScore] = useState(0);
  const [date, setDate] = useState(new Date());
  const [durationMin, setDurationMin] = useState(initialMin);
  const recordedDurationSec = useRef(!template && duration && Number.isFinite(Number(duration)) && Number(duration) > 0 ? Number(duration) : null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [audio, setAudio] = useState<(AudioNote & { transcript?: string | null })[]>([]);
  const [metrics, setMetrics] = useState<TrainingMetrics>(EMPTY_METRICS);
  const [nextFocus, setNextFocus] = useState('');
  const [nextFocusDiscipline, setNextFocusDiscipline] = useState('');
  const [nextFocusDisciplineKey, setNextFocusDisciplineKey] = useState('');
  const [pendingSave, setPendingSave] = useState(false);
  const legacyCompletion = useRef(false);
  const [saving, setSaving] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [recordedTimes, setRecordedTimes] = useState<{ started_at: string | null; ended_at: string | null }>({ started_at: null, ended_at: null });
  const sourceFingerprint = useRef<string | undefined>(undefined);
  const [editConflict, setEditConflict] = useState(false);
  const [remoteCompleted, setRemoteCompleted] = useState(false);
  const saveLock = useRef(false);
  const stopDraft = useRef(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftBlocked, setDraftBlocked] = useState(false);
  const [draftError, setDraftError] = useState(false);
  const [loadRetry, setLoadRetry] = useState(0);
  const [editLoaded, setEditLoaded] = useState(!editing);
  const [details, setDetails] = useState(editing);
  const [workflowStep, setWorkflowStep] = useState(0);
  const [contextOpen, setContextOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [preparationOpen, setPreparationOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [otherDogDrafts, setOtherDogDrafts] = useState<NonNullable<DocumentDraft['otherDogs']>>({});
  const scrollRef = useRef<ScrollView>(null);
  const dogSwitchLock = useRef(false);
  useEffect(() => { dogSwitchLock.current = false; }, [dogId]);
  const moveToStep = useCallback((step: number) => { Keyboard.dismiss(); setWorkflowStep(step); setPickerOpen(step === 1 && !selected.length); scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [selected.length]);

  const [shared, setShared] = useState<boolean | null>(null);
  const [historyRetry, setHistoryRetry] = useState(0);
  const [history, setHistory] = useState<{ scope: string; units: PreparationUnit[]; error: boolean; loading: boolean; limited: boolean }>({ scope: '', units: [], error: false, loading: false, limited: false });
  useFocusEffect(useCallback(() => {
    if (editing || saved || workflowStep === 0) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (saving || pendingSave || remoteCompleted) return false;
      moveToStep(workflowStep - 1);
      return true;
    });
    return () => subscription.remove();
  }, [editing, saved, workflowStep, saving, pendingSave, remoteCompleted, moveToStep]));
  const entryContext = template ? templateEntryContext(template, dogIdParam ?? '', discParam ?? '')
    : dogIdParam || discParam ? JSON.stringify([dogIdParam ?? null, discParam ?? null]) : undefined;
  const templateReady = !template || (!dogsLoading && !profileLoading && !categoriesLoading);
  const templateDogAllowed = !template || dogs.some(d => d.id === dogIdParam);
  const templateDisc = template ? disciplines.find(d => d.key === discParam) : undefined;
  const templateDiscKey = templateDisc?.key ?? '';
  const templateDiscLabel = templateDisc?.label ?? '';
  const templateScopeKey = templateDisc ? scopeKey(templateDisc) : '';
  const draftKey = session?.user.id ? documentDraftKey(session.user.id, id, entryContext) : null;
  const disciplineTouched = useRef(false);
  const resolvedInitialDisc = paramDiscKey ?? disciplines[0]?.key;
  useEffect(() => {
    if (!editing && !disciplineTouched.current && resolvedInitialDisc) setActiveDisc(resolvedInitialDisc);
  }, [editing, resolvedInitialDisc]);
  const unitIdRef = useRef(id ?? Crypto.randomUUID());
  const focusIdRef = useRef(Crypto.randomUUID());
  const operationIdRef = useRef(Crypto.randomUUID());

  useEffect(() => {
    if (!draftKey || !session?.user.id || !templateReady) return;
    let cancelled = false;
    const owner = session.user.id;
    (async () => {
      let draft: DocumentDraft | null = null;
      try {
        const saved = await loadDocumentDraft<unknown>(draftKey);
        if (saved != null && !validDocumentDraft(saved)) throw new Error('Invalid training draft');
        draft = saved ?? null;
      } catch {
        if (!cancelled) { setDraftError(true); setDraftBlocked(true); setDraftReady(true); }
        return;
      }
      if (cancelled) return;
      // An explicit template has its own durable entry key. Existing ordinary
      // drafts are never replaced; returning to this entry restores user edits.
      if (template && !draft) {
        try {
          if (editing || !draftToken || !templateChoice || !templateDogAllowed || !templateDiscKey) throw new Error('Template unavailable');
          const choice: TemplateChoice = JSON.parse(templateChoice);
          if (!templateDiscLabel || choice.dog !== dogIdParam || choice.discipline !== templateDiscLabel || choice.disciplineKey !== templateScopeKey) throw new Error('Template scope changed');
          const result = await getTrainingUnitById(template);
          if (cancelled) return;
          if (result.error || !result.data || result.data.id !== template) throw new Error('Template unavailable');
          const hints = choice.focuses?.length ? await readTemplateHints(owner, choice.dog, choice.discipline, choice.disciplineKey, () => !cancelled) : [];
          if (cancelled) return;
          const seed = planTemplate(result.data as TrainingUnit, owner, choice, hints, Crypto.randomUUID);
          setDogId(choice.dog); setActiveDisc(templateDiscKey); setSelected(seed.exercises); setTemplateContext(seed.context);
          disciplineTouched.current = true;
          setWorkflowStep(0);
        } catch {
          if (!cancelled) { setDraftError(true); setDraftBlocked(true); setDraftReady(true); }
          return;
        }
      }
      let restoringIntent = false;
      if (draft && typeof draft.unitId === 'string' && Array.isArray(draft.selected)
          && typeof draft.date === 'string' && Number.isFinite(new Date(draft.date).getTime())
          && Array.isArray(draft.photos) && Array.isArray(draft.videos) && Array.isArray(draft.audio)) {
        unitIdRef.current = id ?? draft.unitId;
        operationIdRef.current = draft.operationId ?? operationIdRef.current;
        focusIdRef.current = draft.focusId ?? focusIdRef.current;
        sourceFingerprint.current = draft.sourceFingerprint;
        setRemoteCompleted(draft.remoteCompleted ?? false);
        legacyCompletion.current = !!draft.remoteCompleted && !draft.atomic;
        setNextFocusDisciplineKey(draft.nextFocusDisciplineKey ?? '');
        let pending;
        try { pending = await readTrainingSaveIntent(owner, id ?? draft.unitId); }
        catch { if (!cancelled) { setDraftError(true); setDraftBlocked(true); setDraftReady(true); } return; }
        if (cancelled) return;
        restoringIntent = !!pending && pending.request.requestId === operationIdRef.current;
        if (restoringIntent && pending) draft = draftFromIntent(draft, pending.request);
        setPendingSave(restoringIntent);
        setOtherDogDrafts(draft.otherDogs ?? {});
        setTemplateContext(draft.templateContext);
        setWorkflowStep(restoringIntent || draft.remoteCompleted ? 2 : [0, 1, 2].includes(draft.workflowStep ?? -1) ? draft.workflowStep! : draft.selected.length ? 1 : 0);
        recordedDurationSec.current = draft.recordedDurationSec ?? null;
        setRemoteCompleted(draft.remoteCompleted ?? false);
        setNextFocusDisciplineKey(draft.nextFocusDisciplineKey ?? '');
        focusIdRef.current = draft.focusId ?? focusIdRef.current;
        disciplineTouched.current = true;
        setDogId(draft.dogId); setActiveDisc(draft.activeDisc); setSelected(draft.selected);
        setDescription(draft.description); setScore(draft.score); setDate(new Date(draft.date));
        setDurationMin(draft.durationMin); setPhotos(draft.photos); setVideos(draft.videos);
        setAudio(draft.audio); setMetrics(draft.metrics); setShared(draft.shared); setNextFocus(draft.nextFocus ?? ''); setNextFocusDiscipline(draft.nextFocusDiscipline ?? '');
      }
      if (id) {
        try {
          const { data, error } = await getTrainingUnitById(id);
          if (cancelled) return;
          const u = data as TrainingUnit | null;
          if (error || !u || u.owner_id !== owner) throw new Error('Training unavailable');
          const fingerprint = trainingUnitFingerprint(u);
          if (draft && !restoringIntent && !draft.remoteCompleted && draft.sourceFingerprint !== fingerprint) {
            setEditConflict(true); setEditLoaded(false); setDraftReady(true); return;
          }
          if (draft && !restoringIntent && !Object.prototype.hasOwnProperty.call(draft, 'recordedDurationSec')
              && u.duration_sec != null && draft.durationMin === Math.round(u.duration_sec / 60)) {
            recordedDurationSec.current = u.duration_sec;
          }
          if (!restoringIntent) sourceFingerprint.current = fingerprint;
          setEditConflict(false);
          setEditLoaded(true);
          setRecordedTimes({ started_at: u.started_at ?? null, ended_at: u.ended_at ?? null });
          if (!draft) {
            setDogId(u.dog_id);
            setSelected((u.exercises ?? []).map((e, i) => ({
              key: e.id ?? `edit-${i}`, discipline: e.discipline, name: e.exercise_name,
              rating: e.rating ?? null, notes: e.notes ?? null, performed: true, durationSec: e.duration_sec, exerciseKey: e.exercise_identity_id ?? undefined, disciplineKey: e.discipline_key,
            })));
            setDescription(u.notes ?? ''); setScore(u.score ?? 0);
            setDate(u.session_date ? new Date(`${u.session_date}T12:00:00`) : new Date());
            recordedDurationSec.current = u.duration_sec;
            setDurationMin(u.duration_sec != null ? Math.round(u.duration_sec / 60) : null);
            setPhotos(u.photos ?? []); setVideos(u.videos ?? []);
            setAudio((u.audio_files ?? []).map(a => ({ url: a.url, duration: a.duration, createdAt: '', transcript: a.transcript })));
            setShared(!!u.shared_with_trainer);
            setMetrics({ motivation: u.motivation ?? null, konzentration: u.konzentration ?? null, praezision: u.praezision ?? null,
              ausdauer: u.ausdauer ?? null, trieblage: u.trieblage ?? null, impulskontrolle: u.impulskontrolle ?? null });
          }
        } catch { if (!cancelled) setDraftError(true); }
      }
      if (!cancelled) setDraftReady(true);
    })();
    return () => { cancelled = true; };
  }, [draftKey, id, session?.user.id, loadRetry, templateReady, templateDogAllowed, templateDiscKey, templateDiscLabel, templateScopeKey, dogIdParam, draftToken, editing, template, templateChoice]);

  const draftSnapshot = useCallback((): DocumentDraft => ({ templateContext, otherDogs: otherDogDrafts, workflowStep, unitId: unitIdRef.current, dogId, activeDisc, selected, description, score,
    date: date.toISOString(), durationMin, recordedDurationSec: recordedDurationSec.current, photos, videos, audio, metrics,
    shared: shared ?? profile?.share_trainings_default ?? false, operationId: operationIdRef.current, atomic: !legacyCompletion.current,
    nextFocusDisciplineKey, nextFocus, nextFocusDiscipline, focusId: focusIdRef.current, sourceFingerprint: sourceFingerprint.current, remoteCompleted,
  }), [templateContext, otherDogDrafts, workflowStep, dogId, activeDisc, selected, description, score, date, durationMin, photos, videos, audio, metrics, shared, profile?.share_trainings_default, nextFocusDisciplineKey, nextFocus, nextFocusDiscipline, remoteCompleted]);
  useEffect(() => {
    if (!draftReady || !draftKey || draftBlocked || stopDraft.current || (editing && !editLoaded)) return;
    void saveDocumentDraft(draftKey, draftSnapshot()).catch(() => { if (alive.current) setDraftError(true); });
  }, [draftReady, draftKey, draftBlocked, editing, editLoaded, draftSnapshot]);

  // Genau einen Hund erst nach abgeschlossenem Load automatisch wählen. Die
  // Auswahl aus Navigation oder Edit-Modus bleibt dabei unverändert.
  useEffect(() => {
    if (!editing && !dogsLoading && !dogId && dogs.length === 1) setDogId(dogs[0].id);
  }, [dogsLoading, dogs, editing, dogId]);

  const disc = disciplines.find(d => d.key === activeDisc) ?? disciplines[0];
  const [focusRevision, setFocusRevision] = useState(0);
  const serverFocuses = useServerTrainingFocuses(dogId ? session?.user.id : undefined, dogId ?? undefined, disc ? scopeKey(disc) : undefined, focusRevision);
  const isCustomDiscipline = !!disc?.key.startsWith('custom:');
  const activeCategory = isCustomDiscipline
    ? categories.find(c => `custom:${c.id}` === disc?.key)
    : undefined;

  const discLabel = disc?.label;
  const discExercises = JSON.stringify(disc?.exercises ?? []);
  // Vorschläge aus der eigenen Trainingshistorie für FESTE Sparten (siehe
  // CustomExerciseSheet-Kommentar): kein neues Schema, rein lesende Query.
  useEffect(() => {
    setRecentNames([]);
    if (!discLabel || !dogId || isCustomDiscipline || !session?.user.id) { setRecentNames([]); return; }
    let cancelled = false;
    const currentExercises = JSON.parse(discExercises) as string[];
    getRecentExerciseNames(session.user.id, discLabel, 20, dogId ?? undefined).then(({ data }) => {
      if (!cancelled) setRecentNames(data.filter(n => !currentExercises.includes(n)));
    }).catch(() => { if (!cancelled) setRecentNames([]); });
    return () => { cancelled = true; };
  }, [discLabel, discExercises, dogId, isCustomDiscipline, session?.user.id]);

  const historyScope = `${session?.user.id}:${dogId}:${disc?.label}`;
  const visibleHistory = history.scope === historyScope ? history : { units: [], error: false, loading: !!dogId, limited: false };
  useFocusEffect(useCallback(() => {
    if (!session?.user.id || !dogId || !discLabel) return;
    let cancelled = false;
    let requestVersion = historyRetry;
    const owner = session.user.id; const dog = dogId; const label = discLabel;
    const load = async () => {
      const version = ++requestVersion;
      setHistory(prev => prev.scope === historyScope ? { ...prev, loading: true, error: false } : { scope: historyScope, units: [], loading: true, error: false, limited: false });
      try {
        const result = await loadTrainingPreparation(owner, dog, label);
        if (!cancelled && version === requestVersion) setHistory({ scope: historyScope, ...result, loading: false, error: false });
      } catch {
        if (!cancelled && version === requestVersion) setHistory(prev => prev.scope === historyScope ? { ...prev, loading: false, error: true } : { scope: historyScope, units: [], loading: false, error: true, limited: false });
      }
    };
    void load();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void load();
    });
    return () => { cancelled = true; subscription.remove(); };
  }, [historyScope, historyRetry, session?.user.id, dogId, discLabel]));

  const openHistory = (unit: TrainingUnit) => {
    const source = unit as PreparationUnit;
    if (source.historySource === 'session') router.push(`/training/${source.originalId}` as never);
    else router.push({ pathname: '/unit/detail', params: { id: unit.id } });
  };

  const reuseExercises = (unit: TrainingUnit, exercises: NonNullable<TrainingUnit['exercises']>) => {
    moveToStep(1);
    setSelected(prev => [...prev, ...exercises.filter(e => !prev.some(p => p.sourceUnitId === unit.id && !!e.id && p.sourceExerciseId === e.id))
      .map(e => ({ ...planFromHistory(unit, e, Crypto.randomUUID()), exerciseKey: e.exercise_identity_id ?? Crypto.randomUUID(), identityNew: !e.exercise_identity_id, disciplineKey: e.discipline_key ?? (disc && e.discipline === disc.label ? scopeKey(disc) : null) }))]);
  };

  // „Eigene Übung"-Kennzeichnung ohne neue Spalte: eine Übung gilt als eigen,
  // wenn sie NICHT in der (festen oder eigenen) Übungsliste der Sparte steht.
  // Funktioniert dadurch automatisch auch nach dem erneuten Laden eines
  // gespeicherten Trainings — exercise_name selbst wird bereits unverändert
  // gespeichert, dafür ist keine Migration nötig.
  const isCustomExercise = (discLabel: string, name: string) => {
    const d = disciplines.find(x => x.label === discLabel);
    return !d || !d.exercises.includes(name);
  };

  const toggleExercise = (label: string, name: string) => {
    tapHaptic();
    setSelected(prev =>
      prev.some(e => e.discipline === label && e.name === name)
        ? prev.filter(e => !(e.discipline === label && e.name === name))
        : [...prev, { key: Crypto.randomUUID(), discipline: label, name, rating: null, notes: null, performed: true, exerciseKey: Crypto.randomUUID(), identityNew: true, disciplineKey: disc ? scopeKey(disc) : null }],
    );
  };

  const handleAddCustomExercise = async (name: string, saveForFuture: boolean) => {
    if (!disc) return;
    // Duplikat-Prüfung ATOMAR im Updater (nicht vorher per isSelected/geschlossener
    // Closure): ein doppelt ausgelöstes „Hinzufügen" (z. B. Doppel-Tap, bevor React
    // neu rendert) darf dieselbe Übung nie zweimal einfügen — die Prüfung muss auf
    // dem tatsächlichen State zum Zeitpunkt der Anwendung laufen, nicht auf einem
    // möglicherweise veralteten `selected` aus dem Moment des Funktionsaufrufs.
    setSelected(prev =>
      prev.some(e => e.discipline === disc.label && e.name === name)
        ? prev
        : [...prev, { key: Crypto.randomUUID(), discipline: disc.label, name, rating: null, notes: null, performed: true, exerciseKey: Crypto.randomUUID(), identityNew: true, disciplineKey: disc ? scopeKey(disc) : null }],
    );
    setCustomSheetOpen(false);
    setPickerOpen(false);
    // Eigene Sparte + „für zukünftige Trainings speichern": dieselbe Persistenz
    // wie im Kategorie-Editor (app/unit/new-category.tsx) — keine zweite Logik.
    if (activeCategory && saveForFuture && !activeCategory.exercises.includes(name)) {
      const { error } = await updateCustomCategory(activeCategory.id, {
        name: activeCategory.name, icon: activeCategory.icon, color: activeCategory.color,
        exercises: [...activeCategory.exercises, name],
      });
      if (!error) queryClient.invalidateQueries({ queryKey: ['customCategories'] });
      else if (alive.current) Alert.alert(t('common.error'), t('training.saveError'));
    }
  };

  const setExerciseRating = (idx: number, rating: number | null) => {
    setSelected(prev => prev.map((e, i) => (i === idx ? { ...e, rating } : e)));
  };
  const setExerciseNotes = (idx: number, notes: string) => {
    setSelected(prev => prev.map((e, i) => (i === idx ? { ...e, notes } : e)));
  };
  const removeExercise = (idx: number) => {
    tapHaptic();
    setSelected(prev => prev.filter((_, i) => i !== idx));
  };

  // Each dog keeps its own unit/request identities and complete local form.
  // Inactive drafts stay inside the existing account-scoped durable draft.
  const emptyDogDraft = (targetDog: string): Omit<DocumentDraft, 'otherDogs'> => ({
    unitId: Crypto.randomUUID(), operationId: Crypto.randomUUID(), focusId: Crypto.randomUUID(),
    dogId: targetDog, activeDisc, selected: [], description: '', score: 0, date: new Date().toISOString(),
    durationMin: null, recordedDurationSec: null, photos: [], videos: [], audio: [], metrics: { ...EMPTY_METRICS },
    shared: profile?.share_trainings_default ?? false, atomic: true, workflowStep: 0,
  });
  const changeDog = (targetDog: string) => {
    if (dogSwitchLock.current || dogId === targetDog || editing || saving || pendingSave || remoteCompleted) return;
    dogSwitchLock.current = true;
    const snapshot = draftSnapshot();
    const { otherDogs: _otherDogs, ...currentDraft } = snapshot;
    const next = otherDogDrafts[targetDog] ?? (dogId ? emptyDogDraft(targetDog) : { ...currentDraft, dogId: targetDog });
    setOtherDogDrafts(previous => {
      const result = { ...previous };
      delete result[targetDog];
      if (dogId) result[dogId] = currentDraft;
      return result;
    });
    unitIdRef.current = next.unitId; operationIdRef.current = next.operationId ?? Crypto.randomUUID(); focusIdRef.current = next.focusId ?? Crypto.randomUUID();
    recordedDurationSec.current = next.recordedDurationSec ?? null;
    disciplineTouched.current = true;
    setDogId(targetDog); setActiveDisc(next.activeDisc); setSelected(next.selected); setTemplateContext(next.templateContext);
    setDescription(next.description); setScore(next.score); setDate(new Date(next.date)); setDurationMin(next.durationMin);
    setPhotos(next.photos); setVideos(next.videos); setAudio(next.audio); setMetrics(next.metrics); setShared(next.shared);
    setNextFocus(next.nextFocus ?? ''); setNextFocusDiscipline(next.nextFocusDiscipline ?? ''); setNextFocusDisciplineKey(next.nextFocusDisciplineKey ?? '');
    setWorkflowStep(next.workflowStep ?? 0); setPickerOpen(false); setPreparationOpen(false); setContextOpen(false); setCustomSheetOpen(false); setRecentNames([]);
    sourceFingerprint.current = undefined; legacyCompletion.current = false;
  };

  const hintDiscipline = disciplines.find(d => d.key === activeDisc && selected.some(e => e.performed && e.discipline === d.label))
    ?? disciplines.find(d => selected.some(e => e.performed && e.discipline === d.label)) ?? disc;
  const canSave = draftReady && editLoaded && !editConflict && !!dogId && dogs.some(d => d.id === dogId) && selected.some(e => e.performed);

  const speichern = async () => {
    if (!canSave || !session?.user.id || saveLock.current) return;
    saveLock.current = true;
    Keyboard.dismiss();
    setSaving(true);
    try {
    const payload = {
      dog_id:       dogId!,
      session_date: localDay(date),
      started_at:   recordedTimes.started_at,
      ended_at:     recordedTimes.ended_at,
      duration_sec: recordedDurationSec.current ?? (durationMin != null ? durationMin * 60 : null),
      score:        score || null,
      notes:        description.trim() || null,
      photos,
      videos,
      audio_files:  audio.map(a => ({ url: a.url, duration: a.duration, transcript: a.transcript ?? null })),
      shared_with_trainer: shared ?? profile?.share_trainings_default ?? false,
      ...metrics,
    };
    const exercises = selected.filter(e => e.performed).map((e, i) => ({ ...performedExercises([e])[0], id: e.key, seq_index: i, exercise_identity_id: e.exerciseKey ?? null, discipline_key: e.disciplineKey ?? null }));

    if (editing && !remoteCompleted && !pendingSave) {
      const latest = await getTrainingUnitById(id!);
      if (!alive.current) return;
      if (latest.error || !latest.data || latest.data.owner_id !== session.user.id
          || trainingUnitFingerprint(latest.data as TrainingUnit) !== sourceFingerprint.current) {
        setEditConflict(true);
        Alert.alert(t('common.error'), t('trainingDoc.reviewSave'));
        return;
      }
    }
    let error: { code?: string; message?: string } | null = null;
    if (pendingSave) {
      const result = await retryTrainingSave(session.user.id, id ?? unitIdRef.current, operationIdRef.current, () => alive.current);
      error = result.error;
    } else if (remoteCompleted) {
      const latest = await getTrainingUnitById(id ?? unitIdRef.current);
      if (!alive.current) return;
      if (latest.error || !latest.data || !isConfirmedDocumentedRetry(latest.data as TrainingUnit, session.user.id, payload, exercises)) {
        Alert.alert(t('common.error'), t('trainingDoc.reviewSave')); return;
      }
    } else {
      const focusChanges = [
        ...(nextFocus.trim() ? [{ action: 'create' as const, request: { id: focusIdRef.current, requestId: focusIdRef.current,
          sourceUnitId: id ?? unitIdRef.current, disciplineKey: nextFocusDisciplineKey, text: nextFocus.trim() } }] : []),
        ...selected.filter(e => e.performed && e.nextFocus?.trim()).map(e => ({ action: 'create' as const, request: {
          id: e.nextFocusId!, requestId: e.nextFocusId!, sourceUnitId: id ?? unitIdRef.current,
          sourceExerciseId: e.key, disciplineKey: e.disciplineKey ?? '', text: e.nextFocus!.trim(),
        } })),
      ];
      if (focusChanges.some(change => !change.request.id || !change.request.disciplineKey
          || !exercises.some(e => e.discipline_key === change.request.disciplineKey))) {
        Alert.alert(t('common.error'), t('trainingDoc.reviewSave')); return;
      }
      if (draftKey) await saveDocumentDraft(draftKey, draftSnapshot());
      if (!alive.current) return;
      const result = await saveDocumentedUnitAtomic(session.user.id, id ?? unitIdRef.current, payload, exercises,
        editing ? 'edit' : 'create', { operationId: operationIdRef.current, current: () => alive.current,
          expectedFingerprint: editing ? sourceFingerprint.current : undefined, focusChanges,
          identityChanges: selected.filter(e => e.performed && e.identityNew && e.exerciseKey && e.disciplineKey).map(e => ({ request: {
            id: e.exerciseKey!, requestId: e.exerciseKey!, expectedRevision: null, disciplineKey: e.disciplineKey!, displayName: e.name,
          } })),
        });
      error = result.error;
    }
    if (!alive.current) return;
    if (error) {
      if (handleQuotaBlock(error, 'training', t, () => router.push('/premium' as never))) return;
      Alert.alert(t('common.error'), ['TRAINING_DOCUMENT_REVIEW_REQUIRED', 'CONFLICT', 'UNRESOLVED_SAVE'].includes(error.code ?? '') ? t('trainingDoc.reviewSave') : t(error.code === 'LOCAL_SAVE_ERROR' ? 'trainingDoc.draftError' : 'training.saveError')); return;
    }
    setRemoteCompleted(true);
    const focusInputs = [
      ...(nextFocus.trim() ? [{ key: 'unit', text: nextFocus.trim(), discipline: nextFocusDiscipline || disc?.label || activeDisc, exerciseName: undefined as string | undefined, exerciseKey: undefined as string | undefined }] : []),
      ...selected.filter(e => e.nextFocus?.trim()).map(e => ({ key: e.key, text: e.nextFocus!.trim(), discipline: e.discipline, exerciseName: e.name, exerciseKey: e.exerciseKey ?? e.key })),
    ];
    if (legacyCompletion.current && focusInputs.length) {
      try {
        await addTrainingFocuses(session.user.id, focusInputs.map(f => ({
          id: `${id ?? unitIdRef.current}:${focusIdRef.current}:${f.key}`, dogId: dogId!, discipline: f.discipline,
          originUnitId: id ?? unitIdRef.current, originDate: localDay(date), exerciseName: f.exerciseName, exerciseKey: f.exerciseKey,
          originText: f.text, text: f.text, status: 'open',
        })), () => alive.current);
      } catch {
        if (!alive.current) return;
        Alert.alert(t('trainingDoc.focusError'), t('trainingDoc.focusLocal'));
        return; // Preserve the complete draft; the next save reconciles the persisted unit before writing.
      }
    }
    if (!alive.current) return;
    stopDraft.current = true;
    if (draftKey) {
      if (Object.keys(otherDogDrafts).length) await saveDocumentDraft(draftKey, { ...emptyDogDraft(dogId!), otherDogs: otherDogDrafts });
      else await clearDocumentDraft(draftKey).catch(() => {});
    }
    if (!alive.current) return;
    successHaptic();
    queryClient.invalidateQueries({ queryKey: ['trainingFeed'] });
    queryClient.invalidateQueries({ queryKey: ['clientActivity'] });
    if (editing) router.replace({ pathname: '/unit/detail', params: { id: id! } });
    else setSaved(true);
    } catch {
      if (!alive.current) return;
      Alert.alert(t('common.error'), t('training.saveError'));
    } finally {
      if (alive.current && session?.user.id) {
        const pending = await readPendingTrainingSave(session.user.id, id ?? unitIdRef.current).catch(() => null);
        if (alive.current) { setPendingSave(!!pending); setSaving(false); }
      }
      saveLock.current = false;
    }
  };

  if (saved) return <SafeAreaView style={s.safe}>
    <ScrollView contentContainerStyle={[s.content, { paddingTop: 32, gap: 18 }]}>
      <Ionicons name="checkmark-circle" size={48} color={C.accent} />
      <Text style={s.title} accessibilityRole="header" accessibilityLiveRegion="polite">{t('trainingFlow.saved')}</Text>
      <Text style={s.contextTitle}>{dogs.find(d => d.id === dogId)?.name} · {formatDate(date, undefined, locale ?? 'de')}</Text>
      {selected.filter(e => e.performed).map(e => <View key={e.key} style={s.focusEntry}><Text style={s.contextTitle}>{e.name} · {e.discipline}</Text>
        <Text style={s.fieldLabel}>{t('trainingFlow.observed')}</Text><Text style={s.flowHelp}>{e.notes?.trim() || t('trainingFlow.noObservation')}</Text>
        {!!e.nextFocus?.trim() && <><Text style={s.fieldLabel}>{t('trainingDoc.exerciseNextFocus')}</Text><Text style={s.flowHelp}>{e.nextFocus}</Text></>}
      </View>)}
      {!!nextFocus.trim() && <Text style={s.flowHelp}>{t('trainingDoc.sessionNextFocus')}: {nextFocus}</Text>}
      <TouchableOpacity accessibilityRole="button" style={s.contextToggle} onPress={() => router.replace({ pathname: '/unit/detail', params: { id: unitIdRef.current } })}><Text style={s.actionText}>{t('trainingFlow.viewSaved')}</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={s.contextToggle} onPress={() => router.replace('/(tabs)/home')}><Text style={s.actionText}>{t('common.close')}</Text></TouchableOpacity>
    </ScrollView>
  </SafeAreaView>;

  if (draftBlocked) return <SafeAreaView style={s.safe}><Text style={s.saveHint}>{t('trainingDoc.draftError')}</Text><TouchableOpacity style={s.chip} accessibilityRole="button" onPress={() => { setDraftBlocked(false); setDraftReady(false); setLoadRetry(v => v + 1); }}><Text style={s.chipTxt}>{t('common.retry')}</Text></TouchableOpacity></SafeAreaView>;
  if (!draftReady) return <SafeAreaView style={s.safe}><ActivityIndicator accessibilityLabel={t('common.loading')} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => { if (!editing && workflowStep > 0 && !pendingSave && !remoteCompleted) moveToStep(workflowStep - 1); else router.back(); }} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>{t('training.diary')}</Text>
          <Text style={s.title} accessibilityRole="header" accessibilityLiveRegion="polite">{editing ? t('training.editTraining') : t((['trainingFlow.prepareTitle', 'trainingFlow.observeTitle', 'trainingFlow.nextTitle'] as const)[workflowStep])}</Text>
        </View>
        <HelpButton topicId="document_training" autoShow tint={C.white} />
      </View>

      {!editing && <View style={s.steps} accessibilityLabel={t('trainingFlow.step', { step: workflowStep + 1 })}>{(['prepare', 'observe', 'next'] as const).map((key, index) => <View key={key} style={[s.step, workflowStep === index && s.activeStep]}><Text style={[s.stepText, workflowStep === index && { color: C.white }]}>{index + 1} · {t(`trainingFlow.${key}`)}</Text></View>)}</View>}
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" pointerEvents={saving || remoteCompleted || pendingSave ? 'none' : 'auto'}>

          {draftError && <Text style={s.saveHint} accessibilityRole="alert">{t('trainingDoc.draftError')}</Text>}
          {editing && !editLoaded && <TouchableOpacity accessibilityRole="button" style={s.chip} onPress={() => setLoadRetry(v => v + 1)}><Text style={s.chipTxt}>{t('common.retry')}</Text></TouchableOpacity>}
          {editConflict && <Text style={s.saveHint} accessibilityRole="alert">{t('trainingDoc.reviewSave')}</Text>}
          {pendingSave && <Text style={s.saveHint} accessibilityRole="alert">{t('trainingDoc.pendingSave')}</Text>}
          {remoteCompleted && legacyCompletion.current && <Text style={s.saveHint}>{t('trainingDoc.remoteCompleted')}</Text>}
          {/* Trainingskontext: Hund + Sparte kompakt in einer Card */}
          <View style={s.contextCard}>
            {!editing && dogId && dogs.some(d => d.id === dogId) && <><Text style={s.contextTitle}>{dogs.find(d => d.id === dogId)?.name} · {disc?.label}</Text><Text style={s.flowHelp}>{formatDate(date, undefined, locale ?? 'de')}</Text><TouchableOpacity style={s.contextToggle} accessibilityRole="button" accessibilityState={{ expanded: contextOpen }} onPress={() => setContextOpen(v => !v)}><Text style={s.actionText}>{t('trainingFlow.changeContext')}</Text></TouchableOpacity></>}
            {(editing || contextOpen || !dogId || !dogs.length) && <>
            {!dogsLoading && dogs.length === 0 ? (
              <>
                <Text style={s.label}>{t('training.dogLabel')}</Text>
                <View style={s.emptyDogCard}>
                  <Text style={s.emptyDogTxt}>{t('training.addFirstDog')}</Text>
                  <TouchableOpacity style={s.addDogBtn} onPress={() => router.push('/add-dog')} activeOpacity={0.8}>
                    <Text style={s.addDogTxt}>{t('training.addFirstDog')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : dogs.length === 1 ? (
              <>
                <Text style={s.label}>{t('training.dogLabel')}</Text>
                <View style={s.lockedDog} accessibilityLabel={t('training.chooseDogA11y', { dog: dogs[0].name })}>
                  <DogIcon size={14} color={C.accent} />
                  <Text style={s.lockedDogTxt}>{dogs[0].name}</Text>
                </View>
              </>
            ) : dogs.length > 1 && (
              <>
                <Text style={s.label}>{t('training.dogLabel')}</Text>
                <View style={s.chipRow}>
                  {dogs.map(d => {
                    const aktiv = dogId === d.id;
                    return (
                      <TouchableOpacity key={d.id} style={[s.chip, aktiv && s.chipActive]} accessibilityRole="button" accessibilityState={{ selected: aktiv }} accessibilityLabel={d.name} onPress={() => { if (dogId === d.id) return; if (!editing) { tapHaptic(); changeDog(d.id); return; } tapHaptic(); setDogId(d.id); setNextFocus(''); setNextFocusDiscipline(''); setNextFocusDisciplineKey(''); setRecentNames([]); setCustomSheetOpen(false); setSelected(prev => prev.map(e => ({ ...e, rating: null, notes: null, performed: false, durationSec: null, nextFocus: undefined, nextFocusId: undefined, sourceUnitId: undefined, sourceExerciseId: undefined })));  }} activeOpacity={0.8}>
                        {aktiv && <LinearGradient colors={['#00FFCC', '#00FFCC']} style={StyleSheet.absoluteFill} />}
                        <Text style={[s.chipTxt, aktiv && s.chipTxtActive]}>{d.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <Text style={[s.label, { marginTop: dogs.length > 0 ? 16 : 0 }]}>{t('training.disciplineLabel')}</Text>
            <View style={s.chipRow}>
              {disciplines.map(d => {
                const aktiv = activeDisc === d.key;
                return (
                  <TouchableOpacity key={d.key} style={[s.chip, aktiv && { borderColor: d.accent, backgroundColor: `${d.accent}1A` }]} accessibilityRole="button" accessibilityState={{ selected: aktiv }} accessibilityLabel={d.label} onPress={() => { tapHaptic(); disciplineTouched.current = true; setActiveDisc(d.key); setRecentNames([]); setCustomSheetOpen(false); }} activeOpacity={0.8}>
                    <Ionicons name={d.icon} size={13} color={aktiv ? d.accent : C.muted} />
                    <Text style={[s.chipTxt, aktiv && { color: d.accent, fontWeight: '700' }]}>{d.label}</Text>
                  </TouchableOpacity>
                );
              })}
              {/* Eigene Kategorie anlegen — dieselbe Route/Logik wie app/unit/start.tsx. */}
              <TouchableOpacity
                style={s.chip}
                onPress={() => { tapHaptic(); router.push('/unit/new-category'); }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('training.createCategory')}
              >
                <Ionicons name="add" size={13} color={C.accent} />
                <Text style={[s.chipTxt, { color: C.accent, fontWeight: '700' }]}>{t('training.createCategory')}</Text>
              </TouchableOpacity>
            </View>
            </>}
          </View>

          {!editing && templateContext && templateContext.dogId === dogId && templateContext.discipline === disc?.label && workflowStep < 2 && <View style={s.contextCard}>
            <Text style={s.sectionTitle}>{t('trainingTemplate.context', { date: historyDate(templateContext.sourceDate, locale) })}</Text>
            <Text style={s.flowHelp}>{t('trainingTemplate.contextHelp')}</Text>
            {templateContext.hints.map(hint => <Text key={hint.id} style={s.flowHelp}>{hint.text} · {historyDate(hint.date, locale)}</Text>)}
          </View>}

          {(editing || workflowStep === 0) && <>
          {session?.user.id && dogId && disc && <ServerTrainingFocusList preparation={!editing} key={`server:${historyScope}`} ownerId={session.user.id} {...serverFocuses}
            onRetry={() => setFocusRevision(v => v + 1)} onOpenSource={unitId => router.push({ pathname: '/unit/detail', params: { id: unitId } })} />}
          {session?.user.id && dogId && disc && <TrainingFocusList preparation={!editing} key={`local:${historyScope}`} ownerId={session.user.id} dogId={dogId} discipline={disc.label}
            onOpenSource={unitId => router.push({ pathname: '/unit/detail', params: { id: unitId } })} availableUnitIds={new Set(visibleHistory.units.map(unit => unit.id))} />}
          {!editing && <Text style={s.flowHelp}>{t('trainingFlow.prepareHelp')}</Text>}
          {!editing && dogId && disc && <TouchableOpacity style={s.contextToggle} accessibilityRole="button" accessibilityState={{ expanded: preparationOpen }} onPress={() => setPreparationOpen(v => !v)}><Text style={s.actionText}>{t('trainingFlow.previousTraining')}</Text></TouchableOpacity>}
          {!editing && preparationOpen && dogId && disc && <TrainingPreparation units={visibleHistory.units} discipline={disc.label}
            loading={visibleHistory.loading} error={visibleHistory.error} limited={visibleHistory.limited}
            onRetry={() => setHistoryRetry(v => v + 1)} onReuse={reuseExercises}
            onOpen={openHistory} />}
          </>}

          {(editing || workflowStep === 1) && <>
          {!editing && <><Text style={s.sectionTitle}>{t('trainingFlow.trainedToday')}</Text><TouchableOpacity style={s.contextToggle} accessibilityRole="button" accessibilityState={{ expanded: pickerOpen }} onPress={() => setPickerOpen(v => !v)}><Text style={s.actionText}>{t(selected.length ? 'trainingFlow.addExercise' : 'trainingFlow.chooseExercise')}</Text></TouchableOpacity></>}
          {(editing || pickerOpen) && disc && session?.user.id && <ExerciseIdentityList key={`${session.user.id}:${disc.key}`} ownerId={session.user.id} disciplineKey={scopeKey(disc)}
            disciplineLabel={disc.label} suggestions={[...disc.exercises.filter(e => e !== 'Eigene Übung'), ...recentNames]}
            historyByIdentity={Object.fromEntries(visibleHistory.units.filter(unit => unit.id !== id).reverse().flatMap(unit => (unit.exercises ?? [])
              .filter(exercise => !!exercise.exercise_identity_id)
              .map(exercise => [exercise.exercise_identity_id!, { date: unit.session_date, notes: exercise.notes }])))}
            selectedIds={selected.filter(e => e.discipline === disc.label).map(e => e.exerciseKey ?? '')}
            selectedNames={selected.filter(e => e.discipline === disc.label).map(e => e.name)}
            allowRename={editing}
            singleChoicePerName={!editing}
            disabled={saving || remoteCompleted}
            onCreate={name => { toggleExercise(disc.label, name); setPickerOpen(false); }}
            onAddCustom={() => { tapHaptic(); setCustomSheetOpen(true); }}
            onSelect={identity => { setSelected(prev => !editing && prev.some(e => e.discipline === disc.label
              && e.name.trim().toLowerCase() === identity.display_name.trim().toLowerCase()) ? prev
              : prev.some(e => e.exerciseKey === identity.id) ? prev.filter(e => e.exerciseKey !== identity.id)
              : [...prev, { key: Crypto.randomUUID(), discipline: disc.label, disciplineKey: identity.discipline_key,
                name: identity.display_name, exerciseKey: identity.id, rating: null, notes: null, performed: !editing }]); setPickerOpen(false); }} />}

          {/* Ausgewählte Übungen → Karten mit Bewertung + Notiz */}
          {selected.length > 0 && (
            <>
              <Text style={s.label}>{t('training.selectedCount', { count: selected.length })}</Text>
              <View style={s.selectedList}>
                {selected.map((e, i) => {
                  const previous = lastExerciseHistory(visibleHistory.units.filter(unit => unit.id !== id), e)[0];
                  return (
                  <SelectedExerciseCard
                    key={e.key}
                    observationMode={!editing}
                    name={e.name}
                    accentColor={disciplineColor(e.discipline)}
                    isCustom={isCustomExercise(e.discipline, e.name)}
                    rating={e.rating}
                    notes={e.notes}
                    onRatingChange={r => setExerciseRating(i, r)}
                    onNotesChange={n => setExerciseNotes(i, n)}
                    onRemove={() => removeExercise(i)}
                    nextFocus={e.nextFocus}
                    onNextFocusChange={editing ? text => setSelected(prev => prev.map((x, j) => j === i ? { ...x, nextFocus: text, nextFocusId: x.nextFocusId ?? Crypto.randomUUID() } : x)) : undefined}
                    performed={e.performed}
                    onPerformedChange={() => setSelected(prev => prev.map((x, j) => j === i ? { ...x, performed: !x.performed } : x))}
                    historyChoices={!editing && !previous && !saving && !remoteCompleted ? visibleHistory.units.filter(unit => unit.id !== id).flatMap(unit =>
                      (unit.exercises ?? []).filter(past => past.discipline === e.discipline && past.exercise_name === e.name
                        && !!past.id).map(past => ({
                        id: `${unit.id}-${past.id}`, date: unit.session_date, notes: past.notes, trainingNotes: unit.notes,
                        // A name only offers candidates. The user explicitly picks
                        // the original row; today's result is never copied/reset.
                        onSelect: () => setSelected(prev => prev.map(current => current.key !== e.key ? current : {
                          ...current, sourceUnitId: unit.id, sourceExerciseId: past.id,
                          exerciseKey: past.exercise_identity_id ?? current.exerciseKey,
                          identityNew: past.exercise_identity_id ? false : current.identityNew,
                          disciplineKey: past.discipline_key ?? current.disciplineKey,
                        })),
                      }))) : []}
                    historical={previous ? { date: previous.unit.session_date, rating: previous.exercise.rating,
                      notes: previous.exercise.notes, trainingNotes: previous.unit.notes, onOpen: () => openHistory(previous.unit) } : undefined}
                  />
                ); })}
              </View>
            </>
          )}

          </>}
          {(editing || workflowStep === 2) && <>
          {!editing && <>
            <Text style={s.flowHelp}>{t('trainingFlow.nextHelp')}</Text>
            {selected.filter(e => e.performed).map(e => <View key={e.key} style={s.focusEntry}>
              <Text style={s.contextTitle}>{e.name} · {e.discipline}</Text>
              <Text style={s.flowHelp}>{t('trainingFlow.observed')}: {e.notes?.trim() || t('trainingFlow.noObservation')}</Text>
              <Text style={s.fieldLabel}>{t('trainingDoc.exerciseNextFocus')}</Text>
              <TextInput style={s.textarea} value={e.nextFocus ?? ''} multiline maxLength={500} editable={!saving && !remoteCompleted}
                accessibilityLabel={`${e.name}: ${t('trainingDoc.exerciseNextFocus')}`} placeholder={t('trainingFlow.hintPlaceholder')} placeholderTextColor={C.placeholder}
                onChangeText={text => setSelected(prev => prev.map(x => x.key === e.key ? { ...x, nextFocus: text, nextFocusId: x.nextFocusId ?? Crypto.randomUUID() } : x))} />
            </View>)}
          </>}
          <Text style={s.label}>{t('trainingDoc.sessionNextFocus')}{nextFocus && nextFocusDiscipline ? ` · ${nextFocusDiscipline}` : ''}</Text>
          <TextInput style={s.textarea} value={nextFocus} onChangeText={text => { setNextFocus(text); setNextFocusDiscipline(hintDiscipline?.label ?? activeDisc); setNextFocusDisciplineKey(hintDiscipline ? scopeKey(hintDiscipline) : ''); }} editable={!saving && !remoteCompleted} multiline maxLength={500}
            placeholder={t('trainingDoc.sessionNextFocus')} placeholderTextColor={C.placeholder} accessibilityLabel={t('trainingDoc.sessionNextFocus')} />
          </>}
          {(editing || workflowStep === 1) && <>
          <TouchableOpacity onPress={() => setDetails(v => !v)} accessibilityRole="button" accessibilityState={{ expanded: details }} style={s.contextToggle}>
            <Text style={s.actionText}>{t('trainingFlow.optionalDetails')}</Text>
          </TouchableOpacity>
          {details && <>
          {/* Trainingsnotiz */}
          <Text style={s.label}>{t('trainingDoc.sessionNotes')}</Text>
          <TextInput style={s.textarea} placeholder={t('training.descriptionPlaceholder')} placeholderTextColor={C.placeholder} value={description} onChangeText={setDescription} editable={!saving && !remoteCompleted} multiline />

          {/* Datum + Dauer */}
          <Text style={s.label}>{t('training.dateLabel')}</Text>
          <DateField value={date} onChange={setDate} maximumDate={new Date()} />

          <Text style={s.label}>{t('training.durationLabel')}</Text>
          {durationMin == null ? <TouchableOpacity onPress={() => { recordedDurationSec.current = null; setDurationMin(5); }} accessibilityRole="button" accessibilityLabel={t('trainingDoc.enterDuration')} style={s.chip}>
            <Text style={s.chipTxt}>{t('trainingDoc.optionalDuration')} · {t('trainingDoc.enterDuration')}</Text>
          </TouchableOpacity> : <>
            <CompactDurationStepper value={durationMin} onChange={value => { recordedDurationSec.current = null; setDurationMin(value); }} />
            <TouchableOpacity onPress={() => { recordedDurationSec.current = null; setDurationMin(null); }} accessibilityRole="button" style={s.chip}>
              <Text style={s.chipTxt}>{t('trainingDoc.unknownDuration')}</Text>
            </TouchableOpacity>
          </>}

          {/* Gesamteindruck 1–10 — kompakte Segment-Leiste, Datenformat unverändert */}
          <Text style={[s.label, { marginTop: 22 }]}>{t('training.ratingLabel')}</Text>
          <View style={s.scoreCompact}>
            <Text style={s.scoreValue}>{score ? `${score}/10` : '—/10'}</Text>
            <View style={s.scoreBar}>
              {SCORE_STEPS.map(n => {
                const aktiv = score >= n;
                return (
                  <TouchableOpacity
                    key={n}
                    style={[s.scoreSeg, aktiv && s.scoreSegActive]}
                    onPress={() => { tapHaptic(); setScore(score === n ? 0 : n); }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={String(n)}
                  />
                );
              })}
            </View>
          </View>

          {/* Metriken (optional, Basis für KI-Auswertung) — bereits kompakt, unverändert */}
          <Text style={[s.label, { marginTop: 22 }]}>{t('training.metricsLabel')}</Text>
          <MetricsInput value={metrics} onChange={setMetrics} />

          {/* Medien: Fotos/Videos/Sprachaufnahmen gemeinsam gruppiert, Upload-/
              Storage-Logik der drei bestehenden Komponenten vollständig unverändert. */}
          <Text style={[s.label, { marginTop: 22 }]}>{t('training.mediaLabel')}</Text>
          <View style={s.mediaCard}>
            <Text style={s.mediaSubLabel}>{t('training.photosLabel')}</Text>
            <PhotoPicker value={photos} onChange={setPhotos} />
            <Text style={[s.mediaSubLabel, { marginTop: 16 }]}>{t('training.videosLabel')}</Text>
            <MultiVideoUpload value={videos} onChange={setVideos} />
            <Text style={[s.mediaSubLabel, { marginTop: 16 }]}>{t('training.voiceRecordingsLabel')}</Text>
            <AudioRecorder value={audio} onChange={setAudio} />
          </View>

          </>}
          </>}
          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Speichern — sticky/fixed CTA über dem Home Indicator */}
      <SafeAreaView edges={['bottom']} style={s.footer}>
        {!canSave && (editing || workflowStep > 0) && (
          <Text style={s.saveHint}>
            {!dogId ? t('training.chooseDogSaveHint') : !editing && !selected.length ? t('trainingFlow.chooseExercise') : t('trainingDoc.performedHint')}
          </Text>
        )}
        <AnimatedPressable style={[s.saveBtn, (workflowStep === 0 && !editing ? !dogId : !canSave) && { opacity: 0.4 }]} scale={0.97}
          disabled={saving || (workflowStep === 0 && !editing && !pendingSave && !remoteCompleted ? !dogId || !dogs.some(d => d.id === dogId) : !canSave)}
          onPress={editing || workflowStep === 2 || pendingSave || remoteCompleted ? speichern : () => moveToStep(workflowStep + 1)}>
          <LinearGradient colors={['#00FFCC', '#00FFCC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          <Ionicons name="checkmark-circle" size={22} color={C.accentText} />
          <Text style={s.saveTxt}>{saving ? t('common.saving') : remoteCompleted || pendingSave ? t('common.retry') : editing ? t('training.saveChanges') : t((['trainingFlow.start', 'trainingFlow.continue', 'training.saveUnit'] as const)[workflowStep])}</Text>
        </AnimatedPressable>
      </SafeAreaView>

      <CustomExerciseSheet
        visible={customSheetOpen}
        onClose={() => setCustomSheetOpen(false)}
        isCustomDiscipline={isCustomDiscipline}
        onSave={handleAddCustomExercise}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  flex:   { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  backBtn:{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  eyebrow:{ fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  title:  { fontSize: 22, color: C.white, fontWeight: '900', letterSpacing: -0.4 },

  steps: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 16 },
  step: { flex: 1, borderTopWidth: 3, borderColor: C.border, paddingTop: 8 },
  activeStep: { borderColor: C.accent },
  stepText: { color: C.muted, fontSize: 12, flexShrink: 1 },
  contextTitle: { color: C.white, fontSize: 16, fontWeight: '700' },
  contextToggle: { minHeight: 44, paddingVertical: 12, justifyContent: 'center' },
  actionText: { color: C.accent, fontSize: 15, fontWeight: '600' },
  sectionTitle: { color: C.white, fontSize: 19, fontWeight: '700', marginTop: 22 },
  fieldLabel: { color: C.white, fontSize: 15, marginBottom: 8 },
  flowHelp: { color: C.subtle, fontSize: 15, lineHeight: 23, marginVertical: 12 },
  focusEntry: { padding: 16, gap: 8, marginVertical: 10, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 4 },

  label: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10, marginTop: 18 },

  contextCard: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 14 },

  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:         { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 9, overflow: 'hidden' },
  chipActive:   { borderColor: C.accent },
  chipTxt:      { fontSize: 13, color: C.muted, fontWeight: '600' },
  chipTxtActive:{ color: C.accentText, fontWeight: '700' },
  lockedDog: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', backgroundColor: C.cardAlt, borderRadius: 20, borderWidth: 1, borderColor: C.accent, paddingHorizontal: 14, paddingVertical: 8 },
  lockedDogTxt: { fontSize: 13, color: C.white, fontWeight: '700' },
  emptyDogCard: { gap: 10, backgroundColor: C.cardAlt, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14 },
  emptyDogTxt: { fontSize: 13, color: C.subtle },
  addDogBtn: { alignSelf: 'flex-start', borderRadius: 12, borderWidth: 1, borderColor: C.accent, paddingHorizontal: 12, paddingVertical: 8 },
  addDogTxt: { fontSize: 13, color: C.accent, fontWeight: '700' },

  selectedList: { gap: 10 },

  textarea: { backgroundColor: C.input, borderRadius: 16, borderWidth: 1, borderColor: C.border, color: C.white, fontSize: 16, padding: 14, minHeight: 100, textAlignVertical: 'top' },

  scoreCompact: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scoreValue:   { fontSize: 15, color: C.white, fontWeight: '900', minWidth: 46 },
  scoreBar:     { flex: 1, flexDirection: 'row', gap: 4 },
  scoreSeg:     { flex: 1, height: 26, borderRadius: 7, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  scoreSegActive:{ backgroundColor: C.accent, borderColor: C.accent },

  mediaCard: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 14 },
  mediaSubLabel: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.2 },

  footer:  { paddingHorizontal: 20, paddingTop: 10, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border },
  saveHint:{ fontSize: 12.5, color: C.muted, textAlign: 'center', marginBottom: 10, fontWeight: '600' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 56, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 18, overflow: 'hidden', marginBottom: 10 },
  saveTxt: { fontSize: 16, color: C.accentText, fontWeight: '900', letterSpacing: 0.3 },
});
