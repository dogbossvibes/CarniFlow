import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, InputAccessoryView, Keyboard, Linking, Platform, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/lib/session-context';
import { useProfile } from '@/hooks/useProfile';
import { C } from '@/constants/colors';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { AnyvoCard } from '@/components/ui/AnyvoCard';
import { AnyvoChip } from '@/components/ui/AnyvoChip';
import { DateField } from '@/components/ui/DateField';
import { SwipeableHealthRow } from '@/components/ui/SwipeableHealthRow';
import { DogDocumentsCard } from '@/components/dogs/DogDocumentsCard';
import { HealthHeatCard, HealthHeatSheetContent } from '@/components/dogs/HealthHeatSection';
import type { DogDocument } from '@/components/dogs/types';
import { isFemaleDog } from '@/components/dogs/types';
import { TrendLine } from '@/components/analytics/TrendLine';
import { useToast } from '@/components/ui/Toast';
import { useT, translate as healthT, type TranslationKey } from '@/i18n';
import { getDogById } from '@/services/dogs';
import { deleteDogDocument, getDogDocumentUrl } from '@/services/dogHub';
import { HEALTH_SECTION_LIMIT, retryHealthReminder, type HealthReminderReference, loadHealthOverview, createCondition, createMedication, createMedicationAdministration, createParasiteTreatment, createVaccination, createVetVisit, createWeightEntry, deleteCondition, deleteMedication, deleteMedicationAdministration, deleteParasiteTreatment, deleteVaccination, deleteVetVisit, deleteWeightEntry, loadMedicationAdministrations, updateCondition, updateMedication, updateMedicationAdministration, updateParasiteTreatment, updateVaccination, updateVetVisit, updateWeightEntry, type HealthOverviewData, type HealthMutationResult, type HealthMedicationAdministrationRow } from '@/services/healthService';
import { buildHealthTimeline, filterHealthTimeline, type HealthTimelineFilter, type HealthTimelineItem } from '@/features/dogs/healthTimeline';
import { healthDueItems, healthHasLimitedData, healthSummaryKey, type HealthDueItem } from '@/features/dogs/healthOverview';
import { formatDate as localizedDate } from '@/i18n/format';
import { fromISODate } from '@/features/dogs/dateInput';
import { weightChange, weightMeasurements } from '@/features/dogs/health';
// Läufigkeit-in-Gesundheitsakte-Integration (29.09.2026): wiederverwendet
// ausschliesslich das bestehende Läufigkeits-Datenmodell/-Service
// (dog_heat_cycles/-phases/-observations, DOG_HEAT_CYCLES.sql) — kein
// zweites Datenmodell. Detail-/Edit-/Phasen-/Beobachtungs-Verwaltung bleibt
// vollständig in app/dog-heat/[id].tsx.
import { getHeatCycleDetails, deleteHeatCycle, predictHeat, getHeatHistoryStats, type HeatCycle, type HeatPhase, type HeatObservation } from '@/features/dogs/heatCycles';
import type { Dog } from '@/types';

type Tab = 'overview' | 'timeline' | 'documents';
type QuickAction = 'vaccination' | 'parasite' | 'medication' | 'vet' | 'weight' | 'allergy' | 'intolerance' | 'diagnosis' | 'emergency';

const EMPTY: HealthOverviewData = { entries: [], vaccinations: [], medications: [], conditions: [], parasites: [], vetVisits: [], documents: [] };
const FILTERS: { key: HealthTimelineFilter; label: TranslationKey }[] = [
  { key: 'all', label: "journal.period.all" }, { key: 'vaccination', label: "health.uxVaccinations" }, { key: 'medication', label: "health.uxMedications" },
  { key: 'vet', label: "dog.vet" }, { key: 'weight', label: "health.recordWeight" }, { key: 'parasite', label: "health.recordParasites" }, { key: 'condition_group', label: "health.uxConditionGroup" },
];
// Läufigkeit-Filter (29.09.2026) separat gehalten statt in FILTERS
// eingemischt — nur bei Hündinnen sinnvoll (siehe Timeline unten); bei
// Rüden bleibt FILTERS exakt wie bisher, keine leere/tote Option.
const HEAT_FILTER: { key: HealthTimelineFilter; label: TranslationKey } = { key: 'heat', label: "dash.heat" };
const ACTIONS: { key: QuickAction; labelKey: TranslationKey; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'vaccination', labelKey: 'health.recordVaccination', icon: 'shield-checkmark-outline' }, { key: 'parasite', labelKey: 'health.recordParasites', icon: 'bug-outline' },
  { key: 'medication', labelKey: 'health.recordMedication', icon: 'flask-outline' }, { key: 'vet', labelKey: 'health.recordVet', icon: 'medkit-outline' },
  { key: 'weight', labelKey: 'health.recordWeight', icon: 'scale-outline' }, { key: 'allergy', labelKey: 'health.recordAllergy', icon: 'warning-outline' },
  { key: 'intolerance', labelKey: 'health.recordIntolerance', icon: 'close-circle-outline' },
  { key: 'diagnosis', labelKey: 'health.recordDiagnosis', icon: 'document-text-outline' }, { key: 'emergency', labelKey: 'health.recordEmergency', icon: 'alert-circle-outline' },
];
// Läufigkeit-Quick-Action (29.09.2026): eigener Eintrag statt Erweiterung
// von QuickAction/ACTIONS — "key: 'heat'" wird in Overview VOR onAction
// abgefangen (öffnet keine der bestehenden 9 Formular-Sheets), damit
// openSheet/save() unverändert bleiben.
const HEAT_ACTION: { key: 'heat'; labelKey: TranslationKey; icon: React.ComponentProps<typeof Ionicons>['name'] } = { key: 'heat', labelKey: 'health.recordHeat', icon: 'heart-outline' };

export default function DogHealthRecordRoute() {
  const router = useRouter();
  const { t, locale } = useT();
  const { user } = useSession();
  const { profile } = useProfile();
  const { id: dogId } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { showToast, toast } = useToast();
  const [dog, setDog] = useState<Dog | null>(null);
  const dogRef = useRef<Dog | null>(null);
  const [data, setData] = useState<HealthOverviewData>(EMPTY);
  const [tab, setTab] = useState<Tab>('overview');
  const [filter, setFilter] = useState<HealthTimelineFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<QuickAction | null>(null);
  const [detail, setDetail] = useState<HealthTimelineItem | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reminderNotice, setReminderNotice] = useState<{ reference: HealthReminderReference; status: HealthMutationResult<unknown>['reminderSync'] } | null>(null);
  const [retryingReminder, setRetryingReminder] = useState(false);
  const retryReminder = async () => {
    if (!reminderNotice || retryingReminder) return;
    setRetryingReminder(true);
    const reference = reminderNotice.reference;
    try {
      const status = await retryHealthReminder(reference);
      setReminderNotice(current => current?.reference === reference ? { reference, status } : current);
    } finally { setRetryingReminder(false); }
  };
  const [text1, setText1] = useState('');
  const [text2, setText2] = useState('');
  const [text3, setText3] = useState('');
  // Phase 3 (28.09.2026): text4 = Notiz (vaccination + medication), text5 =
  // Chargennummer (vaccination) / Art der Gabe (medication), text6 =
  // verordnender Tierarzt/Praxis (medication only) — same generic-slot reuse
  // pattern as text1–3 above, just extended for the two new fields each type needed.
  const [text4, setText4] = useState('');
  const [text5, setText5] = useState('');
  const [text6, setText6] = useState('');
  // Phase 3 (28.09.2026): vaccination document_id already existed in the DB
  // but had no UI to set it — smallest possible picker over the SAME health
  // documents already loaded for the Dokumente tab, no new document system.
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [date1, setDate1] = useState<Date | null>(new Date());
  const [date2, setDate2] = useState<Date | null>(null);
  const [activeMedication, setActiveMedication] = useState(true);
  const [parasiteType, setParasiteType] = useState('deworming');
  // Läufigkeit-in-Gesundheitsakte-Integration (29.09.2026): nur bei
  // Hündinnen geladen (isFemaleDog) — bei Rüden bleiben diese Arrays leer,
  // sodass die neue Karte/Bereich/Quick-Action gar nicht erst existieren
  // (nicht nur leer angezeigt werden). Wiederverwendet getHeatCycleDetails,
  // dieselbe Funktion, die app/dog-heat-calendar/[id].tsx bereits nutzt.
  const [heatCycles, setHeatCycles] = useState<HeatCycle[]>([]);
  const [heatPhases, setHeatPhases] = useState<HeatPhase[]>([]);
  const [heatObservations, setHeatObservations] = useState<HeatObservation[]>([]);
  const [heatOpen, setHeatOpen] = useState(false);
  const [heatFailed, setHeatFailed] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const loadGeneration = useRef(0);
  useEffect(() => () => { loadGeneration.current += 1; }, []);

  const reload = useCallback(async () => {
    if (!dogId) return;
    const generation = ++loadGeneration.current;
    const initialLoad = dogRef.current?.id !== dogId;
    if (initialLoad) { setLoading(true); setDog(null); setData(EMPTY); setHeatCycles([]); setHeatPhases([]); setHeatObservations([]); }
    else setRefreshing(true);
    setError(null);
    try {
      const [dogResult, overview] = await Promise.all([getDogById(dogId), loadHealthOverview(dogId)]);
      if (generation !== loadGeneration.current) return;
      if (dogResult.error || !dogResult.data) throw new Error(healthT("health.uxDogNotFound"));
      const loadedDog = dogResult.data as Dog;
      dogRef.current = loadedDog; setDog(loadedDog); setData(previous => {
        if (initialLoad) return overview;
        const next = { ...overview, sectionLimits: { ...overview.sectionLimits } };
        for (const section of Object.keys(overview.sectionErrors ?? {}) as (keyof NonNullable<HealthOverviewData["sectionErrors"]>)[]) {
          // Preserve the last loaded values while clearly flagging failed sections.
          Object.assign(next, { [section]: previous[section] });
          if (previous.sectionLimits?.[section]) next.sectionLimits[section] = true;
        }
        return next;
      }); setLastLoadedAt(new Date()); setHeatFailed(false);
      if (isFemaleDog(loadedDog)) {
        // Eigener try/catch: ein Läufigkeits-Ladefehler darf nicht die
        // gesamte Gesundheitsakte unsichtbar machen (dieselbe
        // Isolationslogik wie data.sectionErrors für die übrigen Bereiche).
        try {
          const heat = await getHeatCycleDetails(dogId);
          if (generation !== loadGeneration.current) return;
          setHeatCycles(heat.cycles); setHeatPhases(heat.phases); setHeatObservations(heat.observations);
        } catch { if (generation === loadGeneration.current) setHeatFailed(true); }
      } else {
        setHeatCycles([]); setHeatPhases([]); setHeatObservations([]);
      }
    } catch {
      if (generation !== loadGeneration.current) return;
      if (initialLoad) setError(healthT("health.uxLoadFailed"));
      else showToast(healthT("health.uxRefreshFailed"));
    }
    finally { if (generation === loadGeneration.current) { setLoading(false); setRefreshing(false); } }
  }, [dogId, showToast]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  // Nur der Verlauf-Tab bekommt die kompakten Läufigkeit-Einträge — die
  // Übersicht zeigt Läufigkeit bereits als eigene HealthHeatCard, dieselben
  // Daten sollen dort nicht zusätzlich in "Letzte Aktivitäten" auftauchen.
  const timeline = useMemo(() => buildHealthTimeline(data, heatCycles, (key, _fallback, params) => healthT(key, params, locale), formatDate), [data, heatCycles, locale]);
  const filteredTimeline = useMemo(() => filterHealthTimeline(timeline, filter), [filter, timeline]);
  const measurements = useMemo(() => weightMeasurements(data.entries), [data.entries]);
  const trend = useMemo(() => weightChange(data.entries), [data.entries]);
  const due = useMemo(() => healthDueItems(data, timeline), [data, timeline]);
  const isOwner = dog?.owner_id === user?.id;
  // Läufigkeit-in-Gesundheitsakte-Integration (29.09.2026): isFemaleDog ist
  // die einzige Stelle, die entscheidet, ob der gesamte Läufigkeitsbereich
  // existiert — Karte, Bereich, Quick Action, Verlauf-Filter.
  const isFemale = isFemaleDog(dog);
  const heatPrediction = useMemo(() => predictHeat(heatCycles), [heatCycles]);
  const heatStats = useMemo(() => getHeatHistoryStats(heatCycles), [heatCycles]);
  const status = t(healthSummaryKey(data, heatFailed, due));

  const openSheet = (action: QuickAction) => {
    if (!isOwner && action !== 'emergency') { showToast(healthT("health.uxOwnerEditOnly")); return; }
    setEditId(null); setSheet(action); setText1(''); setText2(''); setText3(''); setText4(''); setText5(''); setText6(''); setDate1(new Date()); setDate2(null); setActiveMedication(true); setParasiteType('deworming'); setDocumentId(null);
  };

  const openEdit = (item: HealthTimelineItem) => {
    const id = item.id.split(':')[1];
    setEditId(id); setDetail(null);
    if (item.kind === 'vaccination') { const row = data.vaccinations.find(value => value.id === id); if (!row) return; setSheet('vaccination'); setText1(row.vaccine_type); setText2(row.clinic_name ?? ''); setText3(row.vaccine_name ?? ''); setText4(row.note ?? ''); setText5(row.batch_number ?? ''); setDate1(new Date(row.administered_on)); setDate2(row.next_due_on ? new Date(row.next_due_on) : null); setDocumentId(row.document_id ?? null); }
    if (item.kind === 'parasite') { const row = data.parasites.find(value => value.id === id); if (!row) return; setSheet('parasite'); setText1(row.product ?? ''); setText2(row.note ?? ''); setDate1(new Date(row.treatment_date)); setDate2(row.next_due_date ? new Date(row.next_due_date) : null); setParasiteType(row.treatment_type ?? 'deworming'); }
    if (item.kind === 'medication') { const row = data.medications.find(value => value.id === id); if (!row) return; setSheet('medication'); setText1(row.name); setText2(row.dosage ?? ''); setText3(row.frequency ?? ''); setText4(row.note ?? ''); setText5(row.administration_route ?? ''); setText6(row.prescribing_vet ?? ''); setDate1(fromISODate(row.starts_on)); setDate2(fromISODate(row.ends_on)); setActiveMedication(row.is_active); }
    if (item.kind === 'vet') { const row = data.vetVisits.find(value => value.id === id); if (!row) return; setSheet('vet'); setText1(row.clinic_name ?? ''); setText2(row.reason ?? ''); setText3(row.note ?? ''); setDate1(new Date(row.appointment_at)); }
    if (item.kind === 'weight') { const row = data.entries.find(value => value.id === id); if (!row) return; setSheet('weight'); setText1(String(row.weight_kg ?? '')); setText2(row.note ?? ''); setDate1(new Date(row.entry_date)); }
    if (item.kind === 'condition') { const row = data.conditions.find(value => value.id === id); if (!row) return; setSheet(row.kind); setText1(row.name); setText2(row.note ?? ''); setDate1(row.started_on ? new Date(row.started_on) : new Date()); }
  };

  // Läufigkeit-in-Gesundheitsakte-Integration (29.09.2026): Detail-/Edit-
  // Verwaltung bleibt vollständig in app/dog-heat/[id].tsx — hier nur
  // Navigation dorthin, kein zweites Edit-System.
  const openHeatCycle = (cycle: HeatCycle) => { router.push(`/dog-heat/${cycle.id}` as never); };
  // "Läufigkeit erfassen" Quick Action: prüft zuerst auf eine bereits
  // offene/aktive Läufigkeit (bestehende isActiveCycle-Logik) und öffnet in
  // diesem Fall deren Detailansicht, statt blind einen zweiten,
  // gleichzeitigen Zyklus über die bestehende /dog-heat-new-Route
  // anzulegen — reuse, keine neue Läufigkeits-Erfassungslogik.
  const openHeatQuickAction = () => {
    if (!isFemale || !dogId) return;
    router.push(`/dog-heat-overview/${dogId}` as never);
  };
  // Long-Press-Standard (29.09.2026, dieselbe Copy/dieselbe deleteHeatCycle-
  // Logik wie app/dog-heat-calendar/[id].tsx und app/dog-heat/[id].tsx —
  // keine parallele Delete-Implementierung): kurz tippen öffnet, lang
  // drücken löscht nur nach Bestätigung, nur Owner.
  const deleteHeatCycleConfirm = (cycle: HeatCycle) => {
    Alert.alert(t('dog.deleteHeatTitle'), t('dog.deleteEntryBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => {
        const { error } = await deleteHeatCycle(cycle.id);
        if (error) { showToast(healthT("health.uxHeatDeleteFailed")); return; }
        showToast(healthT("health.uxHeatDeleted"));
        await reload();
      } },
    ]);
  };

  // Swipe-left-to-delete (28.09.2026): this is the SAME confirm+delete flow
  // already used by the detail sheet's own "Löschen" button (onEdit/onDelete
  // passed to DetailBody) — now also reachable directly from a Verlauf card
  // via SwipeableHealthRow, without opening the detail sheet first. Kept as
  // one function, one confirmation, one delete call so the two entry points
  // can never drift apart. 'document' timeline rows are excluded here on
  // purpose — Health documents already have their own dedicated delete flow
  // (the Dokumente tab's deleteDocument, below), and duplicating a second,
  // conflicting destructive control for the same row was explicitly out of
  // scope. Medication gets its own confirmation copy: dog_health_medication_
  // administrations.medication_id is "on delete cascade" (see
  // supabase/migrations/20260929090000_health_vaccination_medication_history.sql),
  // so deleting a medication genuinely does delete every "Gabe" documented
  // for it — that must never happen silently. Vaccinations keep the generic
  // copy: dog_health_vaccinations.document_id is "on delete set null" — the
  // OTHER direction of that FK — so deleting a vaccination never touches its
  // linked document (verified from schema, not assumed).
  const deleteConfirmCopy = (item: HealthTimelineItem): { title: string; message: string } => item.kind === 'medication'
    ? { title: t('health.uxDeleteTitle', { name: item.title }), message: healthT("health.uxMedicationDeleteBody") }
    : { title: t('health.uxDeleteTitle', { name: item.title }), message: healthT("health.uxEntryDeleteBody") };

  const deleteItem = (item: HealthTimelineItem) => {
    // 'document' has its own dedicated delete flow (Dokumente tab); 'heat'
    // has its own dedicated delete flow too (deleteHeatCycleConfirm, in the
    // Läufigkeit-Bereich) — never reached here in practice since heat
    // Verlauf rows navigate straight to /dog-heat/[id] instead of opening
    // this generic detail sheet, but guarded defensively all the same.
    if (item.kind === 'document' || item.kind === 'heat') return;
    const { title, message } = deleteConfirmCopy(item);
    Alert.alert(title, message, [
      { text: healthT("health.shareCancel"), style: 'cancel' },
      { text: healthT("backpack.delete"), style: 'destructive', onPress: async () => {
        const id = item.id.split(':')[1];
        const result = item.kind === 'vaccination' ? await deleteVaccination(id) : item.kind === 'parasite' ? await deleteParasiteTreatment(id) : item.kind === 'medication' ? await deleteMedication(id) : item.kind === 'vet' ? await deleteVetVisit(id) : item.kind === 'weight' ? await deleteWeightEntry(id) : await deleteCondition(id);
        if (result.error) showToast(healthT("health.uxDeleteFailed"));
        else { setDetail(null); showToast(result.reminderSync === 'failed' ? healthT("health.uxDeletedReminderFailed") : healthT("health.uxEntryDeleted")); await reload(); }
      } },
    ]);
  };

  // Phase 3 (28.09.2026) — medication administration history ("Gaben").
  // Loaded on demand only when a medication's detail sheet is open (never
  // as part of the main Verlauf/overview payload, per the explicit
  // "do not flood Verlauf" instruction). Each save/delete here touches
  // exactly one administration row — never the parent medication, never
  // any other administration.
  const [administrations, setAdministrations] = useState<HealthMedicationAdministrationRow[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSheetOpen, setAdminSheetOpen] = useState(false);
  const [adminEditId, setAdminEditId] = useState<string | null>(null);
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminDate, setAdminDate] = useState<Date | null>(new Date());
  const [adminTime, setAdminTime] = useState<Date | null>(new Date());
  const [adminAmount, setAdminAmount] = useState('');
  const [adminUnit, setAdminUnit] = useState('');
  const [adminRoute, setAdminRoute] = useState('');
  const [adminLocation, setAdminLocation] = useState('');
  const [adminNote, setAdminNote] = useState('');

  const medicationDetailId = detail?.kind === 'medication' ? detail.id.split(':')[1] : null;

  const loadAdministrations = useCallback(async (medicationId: string) => {
    setAdminLoading(true);
    const result = await loadMedicationAdministrations(medicationId);
    setAdministrations(result.error ? [] : result.data);
    setAdminLoading(false);
  }, []);

  useEffect(() => {
    if (medicationDetailId) loadAdministrations(medicationDetailId);
    else setAdministrations([]);
  }, [medicationDetailId, loadAdministrations]);

  const openAdminForm = () => {
    setAdminEditId(null); setAdminDate(new Date()); setAdminTime(new Date());
    setAdminAmount(''); setAdminUnit(''); setAdminRoute(''); setAdminLocation(''); setAdminNote('');
    setAdminSheetOpen(true);
  };
  const openAdminEdit = (row: HealthMedicationAdministrationRow) => {
    const at = new Date(row.administered_at);
    setAdminEditId(row.id); setAdminDate(at); setAdminTime(at);
    setAdminAmount(row.amount != null ? String(row.amount) : ''); setAdminUnit(row.unit ?? ''); setAdminRoute(row.administration_route ?? ''); setAdminLocation(row.location ?? ''); setAdminNote(row.note ?? '');
    setAdminSheetOpen(true);
  };
  const saveAdmin = async () => {
    if (!medicationDetailId || !dogId || adminSaving || !adminDate || !adminTime) return;
    setAdminSaving(true);
    try {
      const amountValue = adminAmount.trim() ? Number(adminAmount.replace(',', '.')) : null;
      if (adminAmount.trim() && !Number.isFinite(amountValue)) throw new Error(healthT("health.uxAmountInvalid"));
      const administered_at = new Date(adminDate.getFullYear(), adminDate.getMonth(), adminDate.getDate(), adminTime.getHours(), adminTime.getMinutes()).toISOString();
      const payload = { administered_at, amount: amountValue, unit: adminUnit.trim() || null, administration_route: adminRoute.trim() || null, location: adminLocation.trim() || null, note: adminNote.trim() || null };
      // Every save is its own independent row: an edit updates ONLY the row
      // identified by adminEditId; a new "Gabe dokumentieren" always inserts
      // a fresh row, even if amount/date exactly match an earlier one.
      const result = adminEditId ? await updateMedicationAdministration(adminEditId, payload) : await createMedicationAdministration(dogId, medicationDetailId, payload);
      if (result.error) throw result.error;
      setAdminSheetOpen(false);
      await loadAdministrations(medicationDetailId);
      showToast(adminEditId ? healthT("health.uxAdministrationUpdated") : healthT("health.uxAdministrationSaved"));
    } catch (cause) { showToast(cause instanceof Error ? cause.message : healthT("health.uxAdministrationSaveFailed")); }
    finally { setAdminSaving(false); }
  };
  const deleteAdmin = (row: HealthMedicationAdministrationRow) => {
    Alert.alert(healthT("health.uxAdministrationDeleteTitle"), healthT("health.uxAdministrationDeleteBody"), [
      { text: healthT("health.shareCancel"), style: 'cancel' },
      { text: healthT("backpack.delete"), style: 'destructive', onPress: async () => {
        const result = await deleteMedicationAdministration(row.id);
        if (result.error) showToast(healthT("health.uxDeleteFailed"));
        else { showToast(healthT("health.uxAdministrationDeleted")); if (medicationDetailId) await loadAdministrations(medicationDetailId); }
      } },
    ]);
  };

  const save = async () => {
    if (!dogId || !sheet || saving || !isOwner) return;
    setSaving(true);
    try {
      let reminderSync: HealthMutationResult<unknown>['reminderSync'] = 'not_required';
      let reference: HealthReminderReference | null = null;
      if (sheet === 'vaccination') {
        if (!text1.trim() || !date1) throw new Error(healthT("health.uxVaccinationRequired"));
        const result = editId ? await updateVaccination(editId, { vaccine_type: text1.trim(), administered_on: dateKey(date1), next_due_on: date2 ? dateKey(date2) : null, clinic_name: text2.trim() || null, vaccine_name: text3.trim() || null, note: text4.trim() || null, batch_number: text5.trim() || null, document_id: documentId }) : await createVaccination(dogId, { vaccine_type: text1.trim(), administered_on: dateKey(date1), next_due_on: date2 ? dateKey(date2) : null, clinic_name: text2.trim() || null, vaccine_name: text3.trim() || null, note: text4.trim() || null, batch_number: text5.trim() || null, document_id: documentId });
        if (result.error) throw result.error; reminderSync = result.reminderSync;
        if (result.data?.id) reference = { dogId, id: result.data.id, kind: 'vaccination' };
      } else if (sheet === 'parasite') {
        if (!date1) throw new Error(healthT("health.uxDateRequired"));
        const result = editId ? await updateParasiteTreatment(editId, { treatment_date: dateKey(date1), product: text1.trim() || null, next_due_date: date2 ? dateKey(date2) : null, treatment_type: parasiteType, note: text2.trim() || null }) : await createParasiteTreatment(dogId, { treatment_date: dateKey(date1), product: text1.trim() || null, next_due_date: date2 ? dateKey(date2) : null, treatment_type: parasiteType, note: text2.trim() || null });
        if (result.error) throw result.error; reminderSync = result.reminderSync;
        if (result.data?.id) reference = { dogId, id: result.data.id, kind: 'parasite' };
      } else if (sheet === 'medication') {
        if (!text1.trim() || !date1) throw new Error(healthT("health.uxMedicationRequired"));
        const result = editId ? await updateMedication(editId, { name: text1.trim(), dosage: text2.trim() || null, frequency: text3.trim() || null, starts_on: dateKey(date1), ends_on: date2 ? dateKey(date2) : null, is_active: activeMedication, note: text4.trim() || null, administration_route: text5.trim() || null, prescribing_vet: text6.trim() || null }) : await createMedication(dogId, { name: text1.trim(), dosage: text2.trim() || null, frequency: text3.trim() || null, starts_on: dateKey(date1), ends_on: date2 ? dateKey(date2) : null, is_active: activeMedication, note: text4.trim() || null, dose_amount: null, dose_unit: null, administration_route: text5.trim() || null, prescribing_vet: text6.trim() || null });
        if (result.error) throw result.error; reminderSync = result.reminderSync;
        if (result.data?.id) reference = { dogId, id: result.data.id, kind: 'medication' };
      } else if (sheet === 'allergy' || sheet === 'intolerance' || sheet === 'diagnosis') {
        if (!text1.trim()) throw new Error(healthT("health.uxNameRequired"));
        const result = editId ? await updateCondition(editId, { kind: sheet, name: text1.trim(), started_on: date1 ? dateKey(date1) : null, note: text2.trim() || null }) : await createCondition(dogId, { kind: sheet, name: text1.trim(), status: 'active', started_on: date1 ? dateKey(date1) : null, ended_on: null, note: text2.trim() || null });
        if (result.error) throw result.error; reminderSync = result.reminderSync;
      } else if (sheet === 'vet') {
        if (!date1) throw new Error(healthT("health.uxDateRequired"));
        const result = editId ? await updateVetVisit(editId, { appointment_at: date1.toISOString(), clinic_name: text1.trim() || null, reason: text2.trim() || null, note: text3.trim() || null }) : await createVetVisit(dogId, { appointment_at: date1.toISOString(), clinic_name: text1.trim() || null, reason: text2.trim() || null, note: text3.trim() || null });
        if (result.error) throw result.error; reminderSync = result.reminderSync;
        if (result.data?.id) reference = { dogId, id: result.data.id, kind: 'vet' };
      } else if (sheet === 'weight') {
        const value = Number(text1.replace(',', '.'));
        if (!Number.isFinite(value) || value <= 0 || !date1) throw new Error(healthT("health.uxWeightRequired"));
        const result = editId ? await updateWeightEntry(editId, { entry_date: dateKey(date1), weight_kg: value, note: text2.trim() || null }) : await createWeightEntry(dogId, { entry_date: dateKey(date1), weight_kg: value, note: text2.trim() || null });
        if (result.error) throw result.error; reminderSync = result.reminderSync;
      }
      if (reference) setReminderNotice({ reference, status: reminderSync });
      setSheet(null); setEditId(null); showToast(reminderSync === 'failed' ? healthT("health.uxCalendarSyncFailed") : editId ? healthT("health.uxUpdated") : healthT("health.recordSaved")); await reload();
    } catch (cause) { showToast(cause instanceof Error ? cause.message : healthT("health.uxSaveFailed")); }
    finally { setSaving(false); }
  };

  const documents: DogDocument[] = data.documents.map(row => ({ id: row.id, title: row.title?.trim() || healthT("health.uxHealthDocument"), category: row.category || row.kind, fileUrl: row.file_url, fileType: fileType(row.file_url), issuedOn: row.issued_on, createdAt: row.created_at }));
  const openDocument = async (doc: DogDocument) => {
    try {
      if (!doc.fileUrl) throw new Error('missing');
      const url = await getDogDocumentUrl(doc.fileUrl);
      if (!url) throw new Error('missing');
      await Linking.openURL(url);
    } catch { showToast(t('health.uxDocumentOpenFailed')); }
  };
  const openHealthDetail = (item: HealthTimelineItem) => {
    if (item.kind === 'document') { const doc = documents.find(row => row.id === item.id.split(':')[1]); if (doc) void openDocument(doc); return; }
    if (item.kind === 'heat') { const cycle = heatCycles.find(row => row.id === item.id.split(':')[1]); if (cycle) openHeatCycle(cycle); return; }
    setDetail(item);
  };
  const deleteDocument = (doc: DogDocument) => Alert.alert(healthT("dog.deleteDocumentTitle"), healthT("health.uxDocumentDeleteBody"), [{ text: healthT("health.shareCancel"), style: 'cancel' }, { text: healthT("backpack.delete"), style: 'destructive', onPress: async () => { const result = await deleteDogDocument(doc.id, doc.fileUrl); if (result.error) showToast(healthT("health.uxDocumentDeleteFailed")); else { showToast(healthT("health.uxDocumentDeleted")); await reload(); } } }]);

  if (loading && !dog) return <View style={s.center}><ActivityIndicator size="large" color={C.trackPrimary} /></View>;
  if (error || !dog) return <View style={s.center}><Text style={s.error}>{error ?? healthT("health.uxDogNotFound")}</Text><AnyvoButton label={healthT("track.continuation.leaveStay")} variant="secondary" onPress={() => router.back()} /></View>;

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.flex}>
        <View style={s.header}><TouchableOpacity style={s.iconButton} hitSlop={8} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('common.back')}><Ionicons name="chevron-back" size={20} color={C.trackText} /></TouchableOpacity><View style={s.headerText}><Text style={s.headerTitle} numberOfLines={1}>{t('health.recordTitle')}</Text><Text style={s.headerDog} numberOfLines={1} ellipsizeMode="tail">{dog.name}</Text></View>{isOwner ? <TouchableOpacity style={s.iconButton} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('health.shareTitle')} onPress={() => router.push({ pathname: '/dog-health-sharing/[id]', params: { id: dogId } } as never)}><Ionicons name="people-outline" size={20} color={C.trackText} /></TouchableOpacity> : <View style={s.iconButton} />}</View>
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={C.trackPrimary} colors={[C.trackPrimary]} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.scroll, { paddingBottom: 32 + insets.bottom }]}
        >
          <View style={s.tabs}>{(['overview', 'timeline', 'documents'] as Tab[]).map(key => <TouchableOpacity key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)} style={[s.tab, tab === key && s.tabActive]}><Text style={[s.tabText, tab === key && s.tabTextActive]}>{key === 'overview' ? t('health.recordOverview') : key === 'timeline' ? t('health.recordTimeline') : t('health.recordDocuments')}</Text></TouchableOpacity>)}</View>
          {Object.keys(data.sectionErrors ?? {}).length > 0 || heatFailed ? <View style={s.warning} accessibilityRole="alert"><Ionicons name="warning-outline" size={17} color={C.trackWarning} /><View style={s.flex}><Text style={s.warningText}>{t('health.recordPartialLoad')}</Text><AnyvoButton label={t('health.uxRetry')} variant="secondary" onPress={reload} loading={refreshing} /></View></View> : null}
          {healthHasLimitedData(data) ? <View style={s.warning} accessibilityRole="alert"><Text style={s.warningText}>{t('health.uxLimitedData', { limit: HEALTH_SECTION_LIMIT })}</Text></View> : null}
          {isOwner && reminderNotice?.reference.dogId === dogId ? <AnyvoCard><Text style={s.muted} accessibilityLiveRegion="polite">{t(reminderNotice.status === 'failed' ? 'health.uxReminderFailed' : reminderNotice.status === 'synced' ? 'health.uxCalendarOnly' : 'health.uxReminderNotNeeded')}</Text>{reminderNotice.status === 'failed' ? <AnyvoButton label={t('health.uxReminderRetry')} variant="secondary" onPress={retryReminder} loading={retryingReminder} /> : null}</AnyvoCard> : null}
          {tab === 'overview' && <Overview dog={dog} status={status} due={due} data={data} measurements={measurements} trend={trend} onAction={openSheet} onTimeline={() => setTab('timeline')} onDetail={openHealthDetail} isOwner={isOwner} lastLoadedAt={lastLoadedAt} isFemale={isFemale} heatCycles={heatCycles} heatPrediction={heatPrediction} onOpenHeat={() => router.push(`/dog-heat-overview/${dogId}` as never)} onAddHeat={openHeatQuickAction} />}
          {tab === 'timeline' && <Timeline items={filteredTimeline} filter={filter} onFilter={setFilter} onDetail={openHealthDetail} onDelete={deleteItem} isOwner={isOwner} isFemale={isFemale} />}
          {tab === 'documents' && <DogDocumentsCard documents={documents} onAdd={isOwner ? () => router.push({ pathname: '/dog-document/[id]', params: { id: dogId, category: 'health' } } as never) : undefined} onOpen={openDocument} onDelete={isOwner ? deleteDocument : undefined} />}
        </ScrollView>
      </SafeAreaView>
      {/* ROOT CAUSE HISTORY (Digital Health Record "Gewicht erfassen" keyboard
          saga — Customer Release, corrected 27.09.2026):
          Part 1: this sheet never opted into AnyvoBottomSheet's keyboardAware
          mode, so it never repositioned above the keyboard. Fixed by opting
          in (applies to every quick-action form sharing this one sheet
          instance) and dropping a now-redundant local KeyboardAvoidingView.
          Part 2 (misdiagnosed at the time): after part 1, device testing
          showed the title stayed visible but the form body still collapsed
          to a sliver. This was attributed to plain flexShrink:1 on the
          ScrollView "not reliably bounding shrinkage to the leftover after
          fixed siblings" — and "fixed" by wrapping the body in an explicit
          flex:1/minHeight:0 container (sheetBody) plus giving the ScrollView
          flex:1/minHeight:0 instead of just flexShrink:1.
          Part 3 (the ACTUAL cause of part 2, found afterwards): the sheet's
          keyboard-driven shrink was never actually happening at all —
          AnyvoBottomSheet's own KeyboardAvoidingView-inside-Modal never
          reliably applied padding (see components/ui/AnyvoBottomSheet.tsx for
          the full explanation), so nothing downstream had anything to
          distribute in the first place. Fixed at the shared layer instead.
          The consequence of part 2's fix, only now discovered on a native
          build (no OTA-delivery ambiguity): flex:1 uses flexBasis:0%, which
          only sizes correctly against a BOUNDED ancestor. Every ancestor
          here (AnyvoBottomSheet's SafeAreaView/sheet views) is content-sized
          (flexShrink:1, no explicit height) — there is no bounded parent to
          distribute against. With flexBasis:0% and no space handed down,
          sheetBody/sheetScroll compute to ZERO height regardless of keyboard
          state — exactly matching "title visible, entire form body gone,
          even with the keyboard closed."
          Correction: sheetBody removed; the ScrollView goes back to plain
          flexShrink:1 (flexBasis:auto — content-sized, matching every other
          child here), exactly as it was before part 2. Because part 3 now
          correctly shrinks AnyvoBottomSheet's own container for a real
          keyboard, this plain flexShrink:1 is sufficient on its own: with no
          keyboard, nothing squeezes anything and the sheet sizes to its full
          content; with a keyboard open, the ScrollView is the only
          flexShrink>0 child, so 100% of any required shrinkage lands on it
          (never on the flexShrink:0 footer) — no artificial zero-basis
          wrapper needed. Save stays outside the scrollable body in a fixed
          footer either way.
          Part 4 (28.09.2026 — physical-device report: form body still
          collapsed BEFORE the keyboard even opened): a line-by-line
          structural audit against app/dog-backpack/[id].tsx (the confirmed-
          working AnyvoBottomSheet consumer on the same device) found no
          remaining flex/minHeight/maxHeight divergence — sheetScroll here
          was already the same flexShrink:1 as Backpack's editorScroll. The
          one real structural difference: this ScrollView's
          contentContainerStyle carried its own {"{ gap: 10, paddingBottom: 10 }"}
          (sheetContent), which Backpack's editor ScrollView does not use at
          all — Backpack spaces fields via each field's own label margin
          instead. Removed sheetContent to match Backpack's pattern exactly;
          inter-field spacing now lives on formLabel's marginTop and on a new
          dateFieldGap style applied to every DateField call site in
          renderForm below, mirroring how Backpack's fieldLabel already
          carried its own spacing. This audit found no evidence this
          contentContainerStyle difference was capable of causing a
          collapse — flagged honestly as a structural-parity cleanup, not a
          proven fix; if the physical-device symptom persists, the more
          likely explanation is the device still running a stale bundle
          (see the still-open OTA-delivery/persisted-state investigation),
          not a remaining layout defect in this file. */}
      <AnyvoBottomSheet keyboardAware closeButton visible={sheet !== null} onClose={() => { setSheet(null); setEditId(null); }} title={sheetTitle(sheet)}>
        {sheet === 'emergency' ? (
          <Emergency dog={dog} data={data} ownerName={isOwner && typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null} ownerEmail={isOwner ? user?.email ?? null : null} ownerPhone={isOwner ? profile?.phone_number ?? null : null} />
        ) : (
          <>
            <ScrollView style={s.sheetScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} showsVerticalScrollIndicator={false}>
              {renderForm(sheet, { text1, text2, text3, text4, text5, text6, date1, date2, activeMedication, parasiteType, documentId, documents, setText1, setText2, setText3, setText4, setText5, setText6, setDate1, setDate2, setActiveMedication, setParasiteType, setDocumentId })}
            </ScrollView>
            <View style={s.sheetFooter}>
              <AnyvoButton label={healthT("backpack.save")} icon="checkmark" onPress={save} loading={saving} />
            </View>
            <HealthNumericKeyboardAccessory />
          </>
        )}
      </AnyvoBottomSheet>
      {/* ROOT CAUSE (Gaben, 28.09.2026 — physical-device report: "Gabe
          dokumentieren" visibly did nothing): this used to be TWO separate
          AnyvoBottomSheet instances — the medication detail sheet
          (visible={detail !== null}) and a second "admin editor" sheet
          (visible={adminSheetOpen}) — with onOpenAdminForm setting
          adminSheetOpen=true WITHOUT clearing detail, so both were
          simultaneously visible=true. Each AnyvoBottomSheet wraps its own
          independent <Modal>, and React Native's iOS Modal cannot reliably
          present a second, separate full-screen Modal while a first one is
          already presented — the underlying UIKit presentation is silently
          dropped, matching exactly "onPress fires, state changes, nothing
          visible". Fixed by merging into ONE sheet whose body switches
          between the detail view and the admin editor via a single boolean
          (adminSheetOpen) — the same "one sheet, conditional content"
          pattern already used above for the emergency vs. normal
          quick-action form. Never two Modals at once. detail itself is
          untouched by opening/closing the editor, so medicationDetailId
          (and therefore dogId/medicationId context for
          create/updateMedicationAdministration) is preserved exactly as
          before — this was purely a presentation bug, never a state bug.
          onClose (the header X, wired below) always resets adminEditId too
          — even though both openAdminForm/openAdminEdit already overwrite
          it on next open — so no stale edit-target id can ever linger in
          state while the sheet is closed. */}
      <AnyvoBottomSheet
        keyboardAware
        closeButton
        visible={detail !== null}
        onClose={() => { setDetail(null); setAdminSheetOpen(false); setAdminEditId(null); }}
        title={adminSheetOpen ? (adminEditId ? healthT("health.uxAdministrationEdit") : healthT("health.uxAdministrationAdd")) : detail?.title}
      >
        {adminSheetOpen ? (
          <>
            <ScrollView style={s.sheetScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} showsVerticalScrollIndicator={false}>
              <DateField style={s.dateFieldGap} label={healthT("heat.obsDate")} value={adminDate} onChange={setAdminDate} maximumDate={new Date()} />
              <DateField style={s.dateFieldGap} label={healthT("health.uxTime")} value={adminTime} onChange={setAdminTime} mode="time" />
              <Field label={healthT("health.uxAmount")} value={adminAmount} onChangeText={setAdminAmount} placeholder={healthT("health.uxAmountExample")} keyboardType="decimal-pad" />
              <Field label={healthT("health.uxDoseUnit")} value={adminUnit} onChangeText={setAdminUnit} placeholder={healthT("health.uxUnitExample")} />
              <Field label={healthT("health.uxRoute")} value={adminRoute} onChangeText={setAdminRoute} placeholder={healthT("health.uxRouteExample")} />
              <Field label={healthT("health.uxLocation")} value={adminLocation} onChangeText={setAdminLocation} placeholder={healthT("health.uxHomeExample")} />
              <Field label={healthT("training.exerciseNoteLabel")} value={adminNote} onChangeText={setAdminNote} placeholder={healthT("health.uxOptional")} />
            </ScrollView>
            <View style={[s.sheetFooter, s.adminFooterRow]}>
              <AnyvoButton label={healthT("health.shareCancel")} variant="secondary" style={s.adminFooterButton} onPress={() => setAdminSheetOpen(false)} />
              <AnyvoButton label={healthT("backpack.save")} icon="checkmark" style={s.adminFooterButton} onPress={saveAdmin} loading={adminSaving} />
            </View>
          </>
        ) : detail ? (
          <DetailBody
            detail={detail} data={data} isOwner={isOwner} onOpenDocument={id => { const doc = documents.find(row => row.id === id); if (doc) void openDocument(doc); }}
            administrations={administrations} adminLoading={adminLoading}
            onEdit={openEdit} onDelete={deleteItem}
            onOpenAdminForm={openAdminForm} onEditAdmin={openAdminEdit} onDeleteAdmin={deleteAdmin}
          />
        ) : null}
      </AnyvoBottomSheet>
      {/* Läufigkeit-Bereich (29.09.2026) — eigenes, modernes Sheet innerhalb
          der Gesundheitsakte, unabhängig von der Quick-Action-/Detail-
          Sheet-State-Machine oben (kein Interferenzrisiko: nur eines dieser
          Sheets wird je vom Nutzer geöffnet). Detail-/Edit-/Phasen-/
          Beobachtungs-Verwaltung bleibt vollständig in
          app/dog-heat/[id].tsx — hier nur Status-Hero, rein rechnerische
          Verlaufsstatistik (getHeatHistoryStats) und die moderne
          Verlaufsliste, die zu app/dog-heat/[id].tsx verlinkt. */}
      <AnyvoBottomSheet keyboardAware closeButton visible={heatOpen} onClose={() => setHeatOpen(false)} title={t('heat.title')}>
        <ScrollView style={s.sheetScroll} showsVerticalScrollIndicator={false}>
          <HealthHeatSheetContent
            cycles={heatCycles} phases={heatPhases} observations={heatObservations}
            prediction={heatPrediction} stats={heatStats} isOwner={isOwner}
            onOpenCycle={openHeatCycle} onDeleteCycle={deleteHeatCycleConfirm} onAdd={openHeatQuickAction}
          />
        </ScrollView>
      </AnyvoBottomSheet>
      {toast}
    </View>
  );
}

function Overview({ dog, status, due, data, measurements, trend, onAction, onTimeline, onDetail, isOwner, lastLoadedAt, isFemale, heatCycles, heatPrediction, onOpenHeat, onAddHeat }: { dog: Dog; status: string; due: HealthDueItem[]; data: HealthOverviewData; measurements: ReturnType<typeof weightMeasurements>; trend: ReturnType<typeof weightChange>; onAction: (action: QuickAction) => void; onTimeline: () => void; onDetail: (item: HealthTimelineItem) => void; isOwner: boolean; lastLoadedAt: Date | null; isFemale: boolean; heatCycles: HeatCycle[]; heatPrediction: ReturnType<typeof predictHeat>; onOpenHeat: () => void; onAddHeat: () => void }) {
  const { t } = useT();
  const { width, fontScale } = useWindowDimensions();
  const [moreActions, setMoreActions] = useState(false);
  const [allDue, setAllDue] = useState(false);
  const actions = isFemale ? [...ACTIONS, HEAT_ACTION] : ACTIONS;
  const frequent = actions.filter(action => ['weight', 'medication', 'vet'].includes(action.key));
  const shownActions = moreActions ? actions : frequent;
  const actionColumns = fontScale > 1.3 ? 1 : width >= 390 ? 3 : 2;
  const actionGap = 9;
  const actionWidth = Math.max(0, (width - 32 - actionGap * (actionColumns - 1)) / actionColumns);
  const latestMeasurement = measurements.at(-1);
  const latestWeight = latestMeasurement?.weight_kg ?? dog.weight_kg;
  const recent = buildHealthTimeline(data, [], (key, _fallback, params) => healthT(key, params), formatDate);
  const openDue = (item: HealthDueItem) => { const entry = recent.find(row => row.id === item.itemId); if (entry) onDetail(entry); };
  return <View style={s.content}>
    <AnyvoCard><View style={s.heroRow}><View style={s.heroIcon}><Ionicons name="heart-outline" size={22} color={C.trackPrimary} /></View><View style={{ flex: 1 }}><Text style={s.eyebrow}>{t('health.uxOverviewTitle')}</Text><Text style={s.heroTitle}>{status}</Text><Text style={s.muted}>{dog.name} · {t('health.uxStoredSummary')}</Text>{lastLoadedAt ? <Text style={s.muted}>{t('health.uxLoadedAt', { date: localizedDate(lastLoadedAt) })}</Text> : null}</View></View></AnyvoCard>
    <Text style={s.section}>{t('health.recordNext')}</Text>
    {due.length ? (allDue ? due : due.slice(0, 3)).map(item => <DueRow key={item.id} item={item} onPress={() => openDue(item)} />) : <Empty text={t(healthHasLimitedData(data) ? 'health.uxNoLoadedDue' : 'health.recordNoDue')} />}
    {due.length > 3 ? <AnyvoButton label={t(allDue ? 'health.uxShowLess' : healthHasLimitedData(data) ? 'health.uxShowLoadedDue' : 'health.uxShowAllDue', { count: due.length })} variant="secondary" onPress={() => setAllDue(value => !value)} /> : null}
    {isOwner ? <><Text style={s.section}>{t('health.recordQuickActions')}</Text><View style={s.actionGrid}>{shownActions.map(action => <TouchableOpacity key={action.key} style={[s.action, { width: actionWidth }]} accessibilityRole="button" accessibilityLabel={t(action.labelKey)} onPress={() => action.key === 'heat' ? onAddHeat() : onAction(action.key)}><View style={s.actionIcon}><Ionicons name={action.icon} size={19} color={C.trackPrimary} /></View><Text style={s.actionText}>{t(action.labelKey)}</Text></TouchableOpacity>)}</View><AnyvoButton label={t(moreActions ? 'health.uxShowLess' : 'health.uxMoreActions')} variant="secondary" onPress={() => setMoreActions(value => !value)} /><AnyvoButton label={t('health.recordEmergencyTitle')} variant="secondary" icon="alert-circle-outline" onPress={() => onAction('emergency')} /></> : <AnyvoButton label={t('health.recordEmergencyTitle')} variant="secondary" onPress={() => onAction('emergency')} />}
    <Text style={s.section}>{t('health.recordCurrentValues')}</Text><AnyvoCard><View style={s.valueHeader}><View style={s.valueCopy}><Text style={s.eyebrow}>{t('health.recordWeight').toUpperCase()}</Text>{latestWeight != null ? <Text style={s.value}>{latestWeight} kg</Text> : <><Text style={s.weightEmptyPrimary}>{t('health.uxNoWeight')}</Text>{isOwner ? <TouchableOpacity style={s.weightAdd} accessibilityRole="button" onPress={() => onAction('weight')}><Text style={s.weightAddText}>{t('health.uxAddWeight')}</Text><Ionicons name="arrow-forward" size={15} color={C.trackPrimary} /></TouchableOpacity> : null}</>}{latestMeasurement ? <Text style={s.muted}>{formatDate(latestMeasurement.entry_date)}{trend?.delta != null ? ` · ${trend.delta >= 0 ? '+' : ''}${trend.delta.toFixed(1)} kg` : ''}</Text> : null}</View><Ionicons name="scale-outline" size={26} color={C.trackPrimary} /></View>{measurements.length > 1 ? <TrendLine points={measurements.slice(-8).map(entry => ({ date: entry.entry_date, score: entry.weight_kg! }))} width={Math.max(200, width - 64)} /> : null}</AnyvoCard>
    {isFemale ? <><Text style={s.section}>{t('heat.title')}</Text>{!isOwner && !heatCycles.length ? <Empty text={t('health.recordNoActivities')} /> : <HealthHeatCard cycles={heatCycles} prediction={heatPrediction} onPress={onOpenHeat} onAdd={onAddHeat} />}</> : null}
    <Text style={s.section}>{t('health.recordRecent')}</Text>{recent.slice(0, 4).map(item => <TimelineRow key={item.id} item={item} onPress={() => onDetail(item)} onDelete={() => {}} deletable={false} />)}{recent.length === 0 ? <Empty text={t('health.recordNoActivities')} /> : <AnyvoButton label={t('health.uxFullTimeline')} variant="secondary" onPress={onTimeline} />}
  </View>;
}

function Timeline({ items, filter, onFilter, onDetail, onDelete, isOwner, isFemale }: { items: HealthTimelineItem[]; filter: HealthTimelineFilter; onFilter: (filter: HealthTimelineFilter) => void; onDetail: (item: HealthTimelineItem) => void; onDelete: (item: HealthTimelineItem) => void; isOwner: boolean; isFemale: boolean }) {
  // Läufigkeit-Filter nur bei Hündinnen sichtbar (29.09.2026) — bei Rüden
  // bleibt die Filterliste exakt die bisherigen 7 Optionen.
  const filters = isFemale ? [...FILTERS, HEAT_FILTER] : FILTERS;
  return <View style={s.content}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>{filters.map(item => <AnyvoChip key={item.key} label={healthT(item.label)} active={filter === item.key} onPress={() => onFilter(item.key)} />)}</ScrollView>{items.length ? items.map(item => <TimelineRow key={`${item.kind}-${item.id}`} item={item} onPress={() => onDetail(item)} onDelete={() => onDelete(item)} deletable={isOwner && item.kind !== 'document' && item.kind !== 'heat'} />) : <Empty text={healthT("health.uxFilterEmpty")} />}</View>;
}
// Swipe-left-to-delete (28.09.2026): SwipeableHealthRow only reveals the
// action and forwards the tap — deletable=false (non-owner, or a 'document'
// row, which keeps its own dedicated delete flow in the Dokumente tab
// instead) renders the exact same card with no swipe affordance at all, so
// tap-to-open-detail is completely unaffected either way.
// Long-press delete (28.09.2026, ANYVO-wide standardization) added
// ADDITIONALLY to the existing swipe-left action — both call the exact same
// `onDelete` (== deleteItem(item), the one authoritative confirm+delete
// path), so there is no duplicated deletion logic and no gesture conflict:
// ReanimatedSwipeable's pan recognizer only claims predominantly-horizontal
// drags, onLongPress only fires after delayLongPress with the touch staying
// essentially stationary, and a normal tap still only ever calls onPress.
// This exact "swipe + long-press, same handler, same TouchableOpacity"
// combination is already proven safe in production by
// app/track/historie.tsx (SwipeableTrainingItem + onLongPress).
function TimelineRow({ item, onPress, onDelete, deletable }: { item: HealthTimelineItem; onPress: () => void; onDelete: () => void; deletable: boolean }) {
  return (
    <SwipeableHealthRow enabled={deletable} onDelete={onDelete} accessibilityLabel={healthT('health.uxDeleteAction', { name: item.title })}>
      <TouchableOpacity
        style={s.timelineRow} onPress={onPress} activeOpacity={0.8}
        onLongPress={deletable ? onDelete : undefined} delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={deletable ? healthT('health.uxDeleteHint', { name: item.title }) : undefined}
        testID={item.kind === 'heat' ? `health-verlauf-row-heat-${item.id}` : undefined}
      >
        <View style={s.timelineIcon}><Ionicons name={kindIcon(item.kind)} size={18} color={C.trackPrimary} /></View><View style={{ flex: 1 }}><Text style={s.rowTitle}>{item.title}</Text><Text style={s.muted}>{kindLabel(item.kind)} · {formatDate(item.date)}{item.detail ? ` · ${item.detail}` : ''}</Text>{item.secondary ? <Text style={s.timelineSecondary}>{item.secondary}</Text> : null}</View><Ionicons name="chevron-forward" size={16} color={C.trackTextMut} />
      </TouchableOpacity>
    </SwipeableHealthRow>
  );
}
function DueRow({ item, onPress }: { item: HealthDueItem; onPress: () => void }) { const { t } = useT(); return <TouchableOpacity style={s.timelineRow} onPress={onPress} accessibilityRole="button"><View style={s.timelineIcon}><Ionicons name="calendar-outline" size={18} color={item.days <= 30 ? C.trackWarning : C.trackPrimary} /></View><View style={{ flex: 1 }}><Text style={s.rowTitle}>{item.title}</Text><Text style={s.muted}>{formatDate(item.date)} · {t(item.days < 0 ? 'health.uxOverdue' : item.days === 0 ? 'health.uxToday' : 'health.uxInDays', { count: item.days })}</Text></View><Ionicons name="chevron-forward" size={18} color={C.trackTextMut} /></TouchableOpacity>; }

function Empty({ text }: { text: string }) { return <AnyvoCard><Text style={s.empty}>{text}</Text></AnyvoCard>; }

// Phase 3 (28.09.2026): the Verlauf detail sheet shows ALL saved fields for
// vaccinations and medications (previously only a single squashed `detail`
// string), plus the medication's own "Gaben" administration history — same
// sheet, same navigation, no Verlauf rebuild. Every other kind keeps the
// original generic body unchanged.
function DetailRow({ label, value }: { label: string; value: string }) {
  return <View style={s.detailRow}><Text style={s.detailLabel}>{label}</Text><Text style={s.detailText}>{value}</Text></View>;
}

function DetailBody({ detail, data, isOwner, administrations, adminLoading, onEdit, onDelete, onOpenAdminForm, onEditAdmin, onDeleteAdmin, onOpenDocument }: {
  detail: HealthTimelineItem; data: HealthOverviewData; isOwner: boolean; onOpenDocument: (id: string) => void;
  administrations: HealthMedicationAdministrationRow[]; adminLoading: boolean;
  onEdit: (item: HealthTimelineItem) => void; onDelete: (item: HealthTimelineItem) => void;
  onOpenAdminForm: () => void; onEditAdmin: (row: HealthMedicationAdministrationRow) => void; onDeleteAdmin: (row: HealthMedicationAdministrationRow) => void;
}) {
  const rawId = detail.id.split(':')[1];
  const editDeleteActions = isOwner ? (
    <View style={s.detailActions}>
      <AnyvoButton label={healthT("backpack.edit")} variant="secondary" icon="create-outline" onPress={() => onEdit(detail)} />
      <AnyvoButton label={healthT("backpack.delete")} variant="secondary" icon="trash-outline" onPress={() => onDelete(detail)} />
    </View>
  ) : null;

  if (detail.kind === 'vaccination') {
    const row = data.vaccinations.find(v => v.id === rawId);
    if (!row) return null;
    const linkedDocument = row.document_id ? data.documents.find(d => d.id === row.document_id) : null;
    return (
      <View style={s.detail}>
        <View style={s.detailIcon}><Ionicons name="shield-checkmark-outline" size={22} color={C.trackPrimary} /></View>
        <DetailRow label={healthT("dog.vaccination")} value={row.vaccine_name ? `${row.vaccine_type} · ${row.vaccine_name}` : row.vaccine_type} />
        <DetailRow label={healthT("heat.obsDate")} value={formatDate(row.administered_on)} />
        <DetailRow label={healthT("health.uxNextDue")} value={row.next_due_on ? formatDate(row.next_due_on) : healthT("health.uxNotProvided")} />
        <DetailRow label={healthT("health.uxClinic")} value={row.clinic_name || healthT("health.uxNotProvided")} />
        <DetailRow label={healthT("health.uxBatch")} value={row.batch_number || healthT("health.uxNotProvided")} />
        <DetailRow label={healthT("training.exerciseNoteLabel")} value={row.note || healthT("health.uxNotProvided")} />
        {linkedDocument ? <TouchableOpacity style={{ minHeight: 48, justifyContent: 'center' }} onPress={() => onOpenDocument(linkedDocument.id)} accessibilityRole="button" accessibilityLabel={healthT('health.uxOpenDocument')}><Text style={s.detailDocLink}>{healthT('health.uxOpenDocument')}: {linkedDocument.title || healthT('health.uxHealthDocument')}</Text></TouchableOpacity> : null}
        {editDeleteActions}
      </View>
    );
  }

  if (detail.kind === 'medication') {
    const row = data.medications.find(m => m.id === rawId);
    if (!row) return null;
    const dose = row.dose_amount != null ? `${row.dose_amount}${row.dose_unit ? ` ${row.dose_unit}` : ''}` : row.dosage;
    return (
      <View style={s.detail}>
        <View style={s.detailIcon}><Ionicons name="flask-outline" size={22} color={C.trackPrimary} /></View>
        <DetailRow label={healthT("health.recordMedication")} value={row.name} />
        <DetailRow label={healthT("health.uxDosage")} value={dose || healthT("health.uxNotProvided")} />
        <DetailRow label={healthT("health.uxRoute")} value={row.administration_route || healthT("health.uxNotProvided")} />
        <DetailRow label={healthT("journal.filterPeriod")} value={`${formatDate(row.starts_on)}${row.ends_on ? ` – ${formatDate(row.ends_on)}` : healthT("health.uxOngoing")}`} />
        <DetailRow label={healthT("sync.status")} value={row.is_active ? healthT("backpack.active") : healthT("backpack.inactive")} />
        <DetailRow label={healthT("health.uxPrescriber")} value={row.prescribing_vet || healthT("health.uxNotProvided")} />
        <DetailRow label={healthT("training.exerciseNoteLabel")} value={row.note || healthT("health.uxNotProvided")} />
        {editDeleteActions}

        <Text style={s.gabenHeading}>Gaben</Text>
        {isOwner ? <AnyvoButton label={healthT("health.uxAdministrationAdd")} icon="add" variant="secondary" onPress={onOpenAdminForm} /> : null}
        {adminLoading ? <Text style={s.muted}>Lädt…</Text> : null}
        {!adminLoading && administrations.length === 0 ? <Text style={s.muted}>Noch keine Gaben dokumentiert.</Text> : null}
        {administrations.map(entry => (
          <View key={entry.id} style={s.adminRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.adminRowTitle}>{formatDateTime(entry.administered_at)}</Text>
              <Text style={s.muted}>
                {[entry.amount != null ? `${entry.amount}${entry.unit ? ` ${entry.unit}` : ''}` : null, entry.administration_route, entry.location].filter(Boolean).join(' · ') || healthT("health.uxNoFurtherInfo")}
              </Text>
              {entry.note ? <Text style={s.muted}>{entry.note}</Text> : null}
            </View>
            {isOwner ? (
              <View style={s.adminRowActions}>
                <TouchableOpacity onPress={() => onEditAdmin(entry)} hitSlop={8} accessibilityRole="button" accessibilityLabel={healthT("health.uxAdministrationEdit")}><Ionicons name="create-outline" size={18} color={C.trackTextSec} /></TouchableOpacity>
                <TouchableOpacity onPress={() => onDeleteAdmin(entry)} hitSlop={8} accessibilityRole="button" accessibilityLabel={healthT("health.uxAdministrationDelete")}><Ionicons name="trash-outline" size={18} color={C.trackDanger} /></TouchableOpacity>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    );
  }

  // Every other kind keeps the original, unenhanced generic body.
  return (
    <View style={s.detail}>
      <View style={s.detailIcon}><Ionicons name={kindIcon(detail.kind)} size={22} color={C.trackPrimary} /></View>
      <Text style={s.detailDate}>{formatDate(detail.date)}</Text>
      <Text style={s.detailText}>{detail.detail || healthT("health.uxNoFurtherInfoStored")}</Text>
      {detail.kind !== 'document' ? editDeleteActions : null}
    </View>
  );
}
function Emergency({ dog, data, ownerName, ownerEmail, ownerPhone }: { dog: Dog; data: HealthOverviewData; ownerName: string | null; ownerEmail: string | null; ownerPhone: string | null }) { const { t } = useT(); const allergies = data.conditions.filter(c => c.kind !== 'diagnosis' && c.status !== 'resolved'); const diagnoses = data.conditions.filter(c => c.kind === 'diagnosis' && c.status !== 'resolved'); const meds = data.medications.filter(m => m.is_active); const latest = weightMeasurements(data.entries).at(-1); const weight = latest?.weight_kg ?? dog.weight_kg; return <View style={s.emergency}><Text style={s.emergencyName}>{dog.name}</Text><Text style={s.muted}>{t('health.recordBirthDate')}: {dog.birth_date ? formatDate(dog.birth_date) : t('health.recordNoData')}</Text><Text style={s.emergencyLabel}>{t('health.recordCurrentWeight')}</Text><Text style={s.emergencyText}>{weight != null ? `${weight} kg${latest ? ` · ${formatDate(latest.entry_date)}` : ''}` : t('health.recordNoData')}</Text><Text style={s.emergencyLabel}>{t('health.recordAllergy')} / {t('health.recordIntolerance')}</Text><Text style={s.emergencyText}>{allergies.length ? allergies.map(item => item.name).join(', ') : t('health.recordNoData')}</Text><Text style={s.emergencyLabel}>{t('health.recordActiveMedication')}</Text><Text style={s.emergencyText}>{meds.length ? meds.map(item => item.name).join(', ') : t('health.recordNoData')}</Text><Text style={s.emergencyLabel}>{t('health.recordConditions')}</Text><Text style={s.emergencyText}>{diagnoses.length ? diagnoses.map(item => item.name).join(', ') : t('health.recordNoData')}</Text>{ownerName || ownerEmail || ownerPhone ? <><Text style={s.emergencyLabel}>{t('health.recordOwnerContact')}</Text>{ownerName ? <Text style={s.emergencyText}>{ownerName}</Text> : null}{ownerEmail ? <Text style={s.emergencyText}>{ownerEmail}</Text> : null}{ownerPhone ? <TouchableOpacity onPress={() => Linking.openURL(`tel:${ownerPhone}`)}><Text style={[s.emergencyText, s.emergencyLink]}>{ownerPhone}</Text></TouchableOpacity> : <Text style={s.emergencyText}>{t('health.recordPhoneMissing')}</Text>}</> : null}</View>; }

type FormState = { text1: string; text2: string; text3: string; text4: string; text5: string; text6: string; date1: Date | null; date2: Date | null; activeMedication: boolean; parasiteType: string; documentId: string | null; documents: DogDocument[]; setText1: (value: string) => void; setText2: (value: string) => void; setText3: (value: string) => void; setText4: (value: string) => void; setText5: (value: string) => void; setText6: (value: string) => void; setDate1: (value: Date) => void; setDate2: (value: Date | null) => void; setActiveMedication: (value: boolean) => void; setParasiteType: (value: string) => void; setDocumentId: (value: string | null) => void };
function renderForm(sheet: QuickAction | null, state: FormState) { if (!sheet) return null; if (sheet === 'vaccination') return <><Field label={healthT("health.uxVaccinationType")} value={state.text1} onChangeText={state.setText1} placeholder={healthT("health.uxRabiesExample")} /><DateField style={s.dateFieldGap} label={healthT("health.uxAdministeredOn")} value={state.date1} onChange={state.setDate1} maximumDate={new Date()} /><DateField style={s.dateFieldGap} label={healthT("health.uxNextDue")} value={state.date2} onChange={state.setDate2} onClear={() => state.setDate2(null)} minimumDate={state.date1 ?? new Date()} /><Field label={healthT("health.uxClinic")} value={state.text2} onChangeText={state.setText2} placeholder={healthT("health.uxOptional")} /><Field label={healthT("health.uxVaccine")} value={state.text3} onChangeText={state.setText3} placeholder={healthT("health.uxOptional")} /><Field label={healthT("health.uxBatch")} value={state.text5} onChangeText={state.setText5} placeholder={healthT("health.uxOptional")} /><Field label={healthT("training.exerciseNoteLabel")} value={state.text4} onChangeText={state.setText4} placeholder={healthT("health.uxOptional")} /><Text style={s.formLabel}>{healthT("health.uxLinkedDocument")}</Text><View style={s.choiceRow}><AnyvoChip label={healthT("health.uxNoDocument")} active={!state.documentId} onPress={() => state.setDocumentId(null)} />{state.documents.map(doc => <AnyvoChip key={doc.id} label={doc.title} active={state.documentId === doc.id} onPress={() => state.setDocumentId(state.documentId === doc.id ? null : doc.id)} />)}</View>{state.documents.length === 0 ? <Text style={s.muted}>{healthT("health.uxNoHealthDocs")}</Text> : null} </>; if (sheet === 'parasite') return <><Text style={s.formLabel}>{healthT("health.uxTreatmentType")}</Text><View style={s.choiceRow}>{[['deworming', healthT("health.deworming")], ['flea_tick', healthT("health.uxFleaTick")], ['heartworm', healthT("health.uxHeartworm")], ['other', healthT("health.uxOther")]].map(([key, label]) => <AnyvoChip key={key} label={label} active={state.parasiteType === key} onPress={() => state.setParasiteType(key)} />)}</View><Field label={healthT("health.uxProduct")} value={state.text1} onChangeText={state.setText1} placeholder={healthT("health.uxOptional")} /><DateField style={s.dateFieldGap} label={healthT("health.uxTreatedOn")} value={state.date1} onChange={state.setDate1} maximumDate={new Date()} /><DateField style={s.dateFieldGap} label={healthT("health.uxNextDue")} value={state.date2} onChange={state.setDate2} onClear={() => state.setDate2(null)} minimumDate={state.date1 ?? new Date()} /><Field label={healthT("training.exerciseNoteLabel")} value={state.text2} onChangeText={state.setText2} placeholder={healthT("health.uxOptional")} /> </>; if (sheet === 'medication') return <><Field label={healthT("profile.name")} value={state.text1} onChangeText={state.setText1} placeholder={healthT("health.recordMedication")} /><Field label={healthT("health.uxDosage")} value={state.text2} onChangeText={state.setText2} placeholder={healthT("health.uxOptional")} /><Field label={healthT("health.uxFrequency")} value={state.text3} onChangeText={state.setText3} placeholder={healthT("health.uxOptional")} /><Field label={healthT("health.uxRoute")} value={state.text5} onChangeText={state.setText5} placeholder={healthT("health.uxRouteExample")} /><Field label={healthT("health.uxPrescriber")} value={state.text6} onChangeText={state.setText6} placeholder={healthT("health.uxOptional")} /><DateField style={s.dateFieldGap} stabilizeIOSBounds label={healthT("dog.heatStart")} value={state.date1} onChange={state.setDate1} /><DateField style={s.dateFieldGap} stabilizeIOSBounds label={healthT("track.endFlag")} value={state.date2} onChange={state.setDate2} onClear={() => state.setDate2(null)} minimumDate={state.date1 ?? new Date()} /><View style={s.switchRow}><Text style={s.rowTitle}>{healthT("backpack.active")}</Text><Switch accessibilityLabel={healthT("health.uxMedicationActive")} value={state.activeMedication} onValueChange={state.setActiveMedication} trackColor={{ false: C.trackCardAlt, true: C.trackPrimary }} thumbColor="#fff" /></View><Field label={healthT("training.exerciseNoteLabel")} value={state.text4} onChangeText={state.setText4} placeholder={healthT("health.uxOptional")} /></>; if (sheet === 'allergy' || sheet === 'intolerance' || sheet === 'diagnosis') return <><Field label={sheet === 'allergy' ? healthT("health.recordAllergy") : sheet === 'intolerance' ? healthT("health.recordIntolerance") : healthT("health.recordDiagnosis")} value={state.text1} onChangeText={state.setText1} placeholder={healthT("backpack.labelField")} /><DateField style={s.dateFieldGap} label={healthT("dog.heatStart")} value={state.date1} onChange={state.setDate1} /><Field label={healthT("training.exerciseNoteLabel")} value={state.text2} onChangeText={state.setText2} placeholder={healthT("health.uxOptional")} /> </>; if (sheet === 'vet') return <><DateField style={s.dateFieldGap} label={healthT("health.uxAppointment")} value={state.date1} onChange={state.setDate1} minimumDate={new Date()} /><Field label={healthT("health.uxClinic")} value={state.text1} onChangeText={state.setText1} placeholder={healthT("health.uxOptional")} /><Field label={healthT("health.uxReason")} value={state.text2} onChangeText={state.setText2} placeholder={healthT("health.uxOptional")} /><Field label={healthT("training.exerciseNoteLabel")} value={state.text3} onChangeText={state.setText3} placeholder={healthT("health.uxOptional")} /> </>; return <><Field label={healthT("health.uxWeightKg")} value={state.text1} onChangeText={state.setText1} placeholder={healthT("health.uxWeightExample")} keyboardType="decimal-pad" /><DateField style={s.dateFieldGap} label={healthT("health.uxMeasuredOn")} value={state.date1} onChange={state.setDate1} maximumDate={new Date()} /><Field label={healthT("training.exerciseNoteLabel")} value={state.text2} onChangeText={state.setText2} placeholder={healthT("health.uxOptional")} /></>; }
// ROOT CAUSE (Health numeric keyboard UX, found on device retest after the
// sheet-layout fix): iOS's decimal-pad keyboard has no Return/Done key at
// all — unlike the standard keyboard, there is no built-in way to finish
// entering a number. "Blind typing" wasn't a visibility regression from the
// sheet fix; it's that users had no way to confirm they were done and see
// the result settle, since there's nothing on the decimal-pad itself to
// tap. Fix: a reusable iOS keyboard accessory toolbar ("Fertig") attached
// via inputAccessoryViewID — any Field using keyboardType="decimal-pad"
// gets it automatically, with zero per-field code (see Field below). This
// is the standard, minimal RN mechanism for exactly this gap; Android's
// numeric keypad already has its own dismiss affordances, so this is
// iOS-only by design. Pressing "Fertig" only calls Keyboard.dismiss() — it
// never touches form state and never calls save(), matching the existing
// Save button's separate, explicit action.
const HEALTH_NUMERIC_ACCESSORY_ID = 'health-numeric-done';
function HealthNumericKeyboardAccessory() {
  const { t } = useT();
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={HEALTH_NUMERIC_ACCESSORY_ID}>
      <View style={s.accessoryBar}>
        <TouchableOpacity onPress={() => Keyboard.dismiss()} hitSlop={8} accessibilityRole="button">
          <Text style={s.accessoryDone}>{t('common.done')}</Text>
        </TouchableOpacity>
      </View>
    </InputAccessoryView>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType = 'default' }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'default' | 'decimal-pad' }) {
  const isNumeric = keyboardType === 'decimal-pad';
  return (
    <View>
      <Text style={s.formLabel}>{label}</Text>
      <TextInput
        value={value}
        accessibilityLabel={label}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.trackTextMut}
        keyboardType={keyboardType}
        style={s.input}
        inputAccessoryViewID={Platform.OS === 'ios' && isNumeric ? HEALTH_NUMERIC_ACCESSORY_ID : undefined}
      />
    </View>
  );
}

function sheetTitle(sheet: QuickAction | null): string { return sheet === 'vaccination' ? healthT("health.uxAddVaccination") : sheet === 'parasite' ? healthT("health.uxAddParasite") : sheet === 'medication' ? healthT("health.uxAddMedication") : sheet === 'vet' ? healthT("health.uxAddVet") : sheet === 'weight' ? healthT("health.uxAddWeight") : sheet === 'allergy' ? healthT("health.uxAddAllergy") : sheet === 'intolerance' ? healthT("health.uxAddIntolerance") : sheet === 'diagnosis' ? healthT("health.uxAddDiagnosis") : sheet === 'emergency' ? healthT("health.recordEmergencyTitle") : ''; }
function dateKey(value: Date): string { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
function formatDate(value: string | null): string { if (!value) return healthT("health.uxDateMissing"); const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? fromISODate(value)! : new Date(value); return Number.isNaN(date.getTime()) ? healthT("health.uxDateInvalid") : localizedDate(date); }
// Manual HH:MM padding (matching components/ui/DateField.tsx's own local
// fmtTime helper) rather than toLocaleTimeString — deterministic across
// environments, not dependent on the host's ICU/locale data.
function formatDateTime(value: string | null): string {
  if (!value) return healthT("health.uxTimeMissing");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return healthT("health.uxTimeInvalid");
  return `${formatDate(value)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function fileType(path: string | null): 'pdf' | 'image' | 'file' { const ext = path?.split('.').pop()?.toLowerCase(); return ext === 'pdf' ? 'pdf' : ext && ['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(ext) ? 'image' : 'file'; }
function kindIcon(kind: HealthTimelineItem['kind']): React.ComponentProps<typeof Ionicons>['name'] { return kind === 'vaccination' ? 'shield-checkmark-outline' : kind === 'parasite' ? 'bug-outline' : kind === 'medication' ? 'flask-outline' : kind === 'vet' ? 'medkit-outline' : kind === 'weight' ? 'scale-outline' : kind === 'condition' ? 'warning-outline' : kind === 'heat' ? 'heart-outline' : 'document-text-outline'; }
function kindLabel(kind: HealthTimelineItem['kind']): string { return kind === 'vaccination' ? healthT("dog.vaccination") : kind === 'parasite' ? healthT("health.recordParasites") : kind === 'medication' ? healthT("health.recordMedication") : kind === 'vet' ? healthT("dog.vet") : kind === 'weight' ? healthT("health.recordWeight") : kind === 'condition' ? healthT("health.uxConditionType") : kind === 'heat' ? healthT("dash.heat") : healthT("health.uxDocument"); }

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.trackBg }, flex: { flex: 1 }, center: { flex: 1, backgroundColor: C.trackBg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }, error: { color: C.trackTextSec, fontSize: 15, textAlign: 'center' }, header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12 }, iconButton: { width: 48, height: 48, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, alignItems: 'center', justifyContent: 'center' }, headerText: { flex: 1, alignItems: 'center' }, headerTitle: { color: C.trackText, fontWeight: '900', fontSize: 16 }, headerDog: { color: C.trackTextSec, fontSize: 12, marginTop: 2 }, scroll: { padding: 16, gap: 14 }, tabs: { flexDirection: 'row', gap: 8 }, tab: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard }, tabActive: { backgroundColor: C.trackPrimary, borderColor: C.trackPrimary }, tabText: { color: C.trackTextSec, fontWeight: '800', fontSize: 13 }, tabTextActive: { color: C.accentText }, content: { gap: 12 }, warning: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.warningDim, borderRadius: 14, borderWidth: 1, borderColor: C.warning, padding: 12 }, warningText: { flex: 1, color: C.trackTextSec, fontSize: 12 }, heroRow: { flexDirection: 'row', alignItems: 'center', gap: 13 }, heroIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' }, eyebrow: { color: C.trackTextMut, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }, heroTitle: { color: C.trackText, fontSize: 20, fontWeight: '900', marginTop: 3 }, muted: { color: C.trackTextSec, fontSize: 12, marginTop: 3 }, section: { color: C.trackTextMut, fontSize: 11, fontWeight: '900', letterSpacing: 1.3, textTransform: 'uppercase', marginTop: 5 }, actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, action: { alignItems: 'center', gap: 6, paddingVertical: 11, borderRadius: 15, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, minHeight: 82, justifyContent: 'center' }, actionIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' }, actionText: { color: C.trackTextSec, fontSize: 11, fontWeight: '800', textAlign: 'center', lineHeight: 15 }, valueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, valueCopy: { flex: 1, paddingRight: 12 }, value: { color: C.trackText, fontSize: 25, fontWeight: '900', marginTop: 4 }, weightEmptyPrimary: { color: C.trackText, fontSize: 16, lineHeight: 21, fontWeight: '800', marginTop: 4 }, weightAdd: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingVertical: 6, minHeight: 44 }, weightAddText: { color: C.trackPrimary, fontSize: 13, fontWeight: '800' }, empty: { color: C.trackTextMut, fontSize: 13, lineHeight: 19 }, filters: { gap: 8, paddingBottom: 2 }, timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, padding: 13 }, timelineIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' }, rowTitle: { color: C.trackText, fontSize: 14, fontWeight: '800' }, sheetScroll: { flexShrink: 1 }, sheetFooter: { paddingTop: 14, paddingBottom: 6 }, adminFooterRow: { flexDirection: 'row', gap: 10 }, adminFooterButton: { flex: 1 }, accessoryBar: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', backgroundColor: C.trackCard, borderTopWidth: 1, borderTopColor: C.trackBorder, paddingHorizontal: 16, paddingVertical: 10 }, accessoryDone: { color: C.trackPrimary, fontSize: 16, fontWeight: '800' }, formLabel: { color: C.trackTextMut, fontSize: 10, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6, marginTop: 10 }, dateFieldGap: { marginTop: 10 }, input: { color: C.trackText, backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 }, choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 4 }, switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.trackCard, borderRadius: 14, padding: 10 }, detail: { gap: 10, paddingBottom: 12 }, detailIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' }, detailDate: { color: C.trackTextSec, fontSize: 13 }, detailText: { color: C.trackText, fontSize: 15, lineHeight: 22 }, detailActions: { gap: 8, marginTop: 8 }, timelineSecondary: { color: C.trackPrimary, fontSize: 11.5, fontWeight: '700', marginTop: 2 }, detailRow: { gap: 2 }, detailLabel: { color: C.trackTextMut, fontSize: 10, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' }, detailDocLink: { color: C.trackPrimary, fontSize: 13, fontWeight: '700', marginTop: 4 }, gabenHeading: { color: C.trackTextMut, fontSize: 11, fontWeight: '900', letterSpacing: 1.3, textTransform: 'uppercase', marginTop: 14 }, adminRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, padding: 12 }, adminRowTitle: { color: C.trackText, fontSize: 13.5, fontWeight: '800' }, adminRowActions: { flexDirection: 'row', gap: 10 }, emergency: { gap: 10, paddingBottom: 14 }, emergencyName: { color: C.trackText, fontSize: 25, fontWeight: '900' }, emergencyLabel: { color: C.trackTextMut, fontSize: 10, fontWeight: '900', letterSpacing: 1.1, textTransform: 'uppercase', marginTop: 8 }, emergencyText: { color: C.trackText, fontSize: 15 }, emergencyLink: { color: C.trackPrimary },
});
