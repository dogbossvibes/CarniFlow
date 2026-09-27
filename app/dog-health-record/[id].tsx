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
import { DogDocumentsCard } from '@/components/dogs/DogDocumentsCard';
import type { DogDocument } from '@/components/dogs/types';
import { TrendLine } from '@/components/analytics/TrendLine';
import { useToast } from '@/components/ui/Toast';
import { useT, type TranslationKey } from '@/i18n';
import { getDogById } from '@/services/dogs';
import { deleteDogDocument, getDogDocumentUrl } from '@/services/dogHub';
import { loadHealthOverview, createCondition, createMedication, createMedicationAdministration, createParasiteTreatment, createVaccination, createVetVisit, createWeightEntry, deleteCondition, deleteMedication, deleteMedicationAdministration, deleteParasiteTreatment, deleteVaccination, deleteVetVisit, deleteWeightEntry, loadMedicationAdministrations, updateCondition, updateMedication, updateMedicationAdministration, updateParasiteTreatment, updateVaccination, updateVetVisit, updateWeightEntry, type HealthOverviewData, type HealthMutationResult, type HealthMedicationAdministrationRow } from '@/services/healthService';
import { buildHealthTimeline, filterHealthTimeline, parasiteLabel, type HealthTimelineFilter, type HealthTimelineItem } from '@/features/dogs/healthTimeline';
import { weightChange, weightMeasurements } from '@/features/dogs/health';
import type { Dog } from '@/types';

type Tab = 'overview' | 'timeline' | 'documents';
type QuickAction = 'vaccination' | 'parasite' | 'medication' | 'vet' | 'weight' | 'allergy' | 'intolerance' | 'diagnosis' | 'emergency';

const EMPTY: HealthOverviewData = { entries: [], vaccinations: [], medications: [], conditions: [], parasites: [], vetVisits: [], documents: [] };
const FILTERS: { key: HealthTimelineFilter; label: string }[] = [
  { key: 'all', label: 'Alle' }, { key: 'vaccination', label: 'Impfungen' }, { key: 'medication', label: 'Medikamente' },
  { key: 'vet', label: 'Tierarzt' }, { key: 'weight', label: 'Gewicht' }, { key: 'parasite', label: 'Parasiten' }, { key: 'condition_group', label: 'Diagnosen / Allergien' },
];
const ACTIONS: { key: QuickAction; labelKey: TranslationKey; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'vaccination', labelKey: 'health.recordVaccination', icon: 'shield-checkmark-outline' }, { key: 'parasite', labelKey: 'health.recordParasites', icon: 'bug-outline' },
  { key: 'medication', labelKey: 'health.recordMedication', icon: 'flask-outline' }, { key: 'vet', labelKey: 'health.recordVet', icon: 'medkit-outline' },
  { key: 'weight', labelKey: 'health.recordWeight', icon: 'scale-outline' }, { key: 'allergy', labelKey: 'health.recordAllergy', icon: 'warning-outline' },
  { key: 'intolerance', labelKey: 'health.recordIntolerance', icon: 'close-circle-outline' },
  { key: 'diagnosis', labelKey: 'health.recordDiagnosis', icon: 'document-text-outline' }, { key: 'emergency', labelKey: 'health.recordEmergency', icon: 'alert-circle-outline' },
];

export default function DogHealthRecordRoute() {
  const router = useRouter();
  const { t } = useT();
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

  const reload = useCallback(async () => {
    if (!dogId) return;
    const initialLoad = !dogRef.current;
    if (initialLoad) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [dogResult, overview] = await Promise.all([getDogById(dogId), loadHealthOverview(dogId)]);
      if (dogResult.error || !dogResult.data) throw new Error('Hund nicht gefunden');
      dogRef.current = dogResult.data as Dog; setDog(dogResult.data as Dog); setData(overview);
    } catch {
      if (initialLoad) setError('Gesundheitsdaten konnten nicht geladen werden.');
      else showToast('Aktualisierung nicht möglich. Vorhandene Daten bleiben sichtbar.');
    }
    finally { setLoading(false); setRefreshing(false); }
  }, [dogId, showToast]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const timeline = useMemo(() => buildHealthTimeline(data), [data]);
  const filteredTimeline = useMemo(() => filterHealthTimeline(timeline, filter), [filter, timeline]);
  const measurements = useMemo(() => weightMeasurements(data.entries), [data.entries]);
  const trend = useMemo(() => weightChange(data.entries), [data.entries]);
  const due = useMemo(() => nextDue(data), [data]);
  const isOwner = dog?.owner_id === user?.id;
  const attentionCount = useMemo(() => due.filter(item => item.days <= 30).length, [due]);
  const status = attentionCount > 0 ? `${attentionCount} Punkt${attentionCount === 1 ? '' : 'e'} benötigen Aufmerksamkeit` : due.length ? 'Alles aktuell' : t('health.recordNoDue');

  const openSheet = (action: QuickAction) => {
    if (!isOwner) { showToast('Nur der Hundehalter kann Gesundheitsdaten bearbeiten.'); return; }
    setEditId(null); setSheet(action); setText1(''); setText2(''); setText3(''); setText4(''); setText5(''); setText6(''); setDate1(new Date()); setDate2(null); setActiveMedication(true); setParasiteType('deworming'); setDocumentId(null);
  };

  const openEdit = (item: HealthTimelineItem) => {
    const id = item.id.split(':')[1];
    setEditId(id); setDetail(null);
    if (item.kind === 'vaccination') { const row = data.vaccinations.find(value => value.id === id); if (!row) return; setSheet('vaccination'); setText1(row.vaccine_type); setText2(row.clinic_name ?? ''); setText3(row.vaccine_name ?? ''); setText4(row.note ?? ''); setText5(row.batch_number ?? ''); setDate1(new Date(row.administered_on)); setDate2(row.next_due_on ? new Date(row.next_due_on) : null); setDocumentId(row.document_id ?? null); }
    if (item.kind === 'parasite') { const row = data.parasites.find(value => value.id === id); if (!row) return; setSheet('parasite'); setText1(row.product ?? ''); setText2(row.note ?? ''); setDate1(new Date(row.treatment_date)); setDate2(row.next_due_date ? new Date(row.next_due_date) : null); setParasiteType(row.treatment_type ?? 'deworming'); }
    if (item.kind === 'medication') { const row = data.medications.find(value => value.id === id); if (!row) return; setSheet('medication'); setText1(row.name); setText2(row.dosage ?? ''); setText3(row.frequency ?? ''); setText4(row.note ?? ''); setText5(row.administration_route ?? ''); setText6(row.prescribing_vet ?? ''); setDate1(new Date(row.starts_on)); setDate2(row.ends_on ? new Date(row.ends_on) : null); setActiveMedication(row.is_active); }
    if (item.kind === 'vet') { const row = data.vetVisits.find(value => value.id === id); if (!row) return; setSheet('vet'); setText1(row.clinic_name ?? ''); setText2(row.reason ?? ''); setText3(row.note ?? ''); setDate1(new Date(row.appointment_at)); }
    if (item.kind === 'weight') { const row = data.entries.find(value => value.id === id); if (!row) return; setSheet('weight'); setText1(String(row.weight_kg ?? '')); setText2(row.note ?? ''); setDate1(new Date(row.entry_date)); }
    if (item.kind === 'condition') { const row = data.conditions.find(value => value.id === id); if (!row) return; setSheet(row.kind); setText1(row.name); setText2(row.note ?? ''); setDate1(row.started_on ? new Date(row.started_on) : new Date()); }
  };

  const deleteItem = (item: HealthTimelineItem) => {
    if (item.kind === 'document') return;
    Alert.alert(`${item.title} löschen?`, 'Der Gesundheitseintrag wird dauerhaft entfernt. Verknüpfte Erinnerungen werden ebenfalls bereinigt.', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => {
        const id = item.id.split(':')[1];
        const result = item.kind === 'vaccination' ? await deleteVaccination(id) : item.kind === 'parasite' ? await deleteParasiteTreatment(id) : item.kind === 'medication' ? await deleteMedication(id) : item.kind === 'vet' ? await deleteVetVisit(id) : item.kind === 'weight' ? await deleteWeightEntry(id) : await deleteCondition(id);
        if (result.error) showToast('Löschen nicht möglich');
        else { setDetail(null); showToast(result.reminderSync === 'failed' ? 'Gelöscht, aber Erinnerung konnte nicht bereinigt werden.' : 'Gesundheitseintrag gelöscht'); await reload(); }
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
      if (adminAmount.trim() && !Number.isFinite(amountValue)) throw new Error('Bitte eine gültige Menge eingeben.');
      const administered_at = new Date(adminDate.getFullYear(), adminDate.getMonth(), adminDate.getDate(), adminTime.getHours(), adminTime.getMinutes()).toISOString();
      const payload = { administered_at, amount: amountValue, unit: adminUnit.trim() || null, administration_route: adminRoute.trim() || null, location: adminLocation.trim() || null, note: adminNote.trim() || null };
      // Every save is its own independent row: an edit updates ONLY the row
      // identified by adminEditId; a new "Gabe dokumentieren" always inserts
      // a fresh row, even if amount/date exactly match an earlier one.
      const result = adminEditId ? await updateMedicationAdministration(adminEditId, payload) : await createMedicationAdministration(dogId, medicationDetailId, payload);
      if (result.error) throw result.error;
      setAdminSheetOpen(false);
      await loadAdministrations(medicationDetailId);
      showToast(adminEditId ? 'Gabe aktualisiert' : 'Gabe dokumentiert');
    } catch (cause) { showToast(cause instanceof Error ? cause.message : 'Gabe konnte nicht gespeichert werden'); }
    finally { setAdminSaving(false); }
  };
  const deleteAdmin = (row: HealthMedicationAdministrationRow) => {
    Alert.alert('Gabe löschen?', 'Dieser einzelne Eintrag der Gaben-Historie wird entfernt. Andere Gaben und das Medikament selbst bleiben unverändert.', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => {
        const result = await deleteMedicationAdministration(row.id);
        if (result.error) showToast('Löschen nicht möglich');
        else { showToast('Gabe gelöscht'); if (medicationDetailId) await loadAdministrations(medicationDetailId); }
      } },
    ]);
  };

  const save = async () => {
    if (!dogId || !sheet || saving || !isOwner) return;
    setSaving(true);
    try {
      let reminderSync: HealthMutationResult<unknown>['reminderSync'] = 'not_required';
      if (sheet === 'vaccination') {
        if (!text1.trim() || !date1) throw new Error('Bitte Impfart und Datum ergänzen.');
        const result = editId ? await updateVaccination(editId, { vaccine_type: text1.trim(), administered_on: dateKey(date1), next_due_on: date2 ? dateKey(date2) : null, clinic_name: text2.trim() || null, vaccine_name: text3.trim() || null, note: text4.trim() || null, batch_number: text5.trim() || null, document_id: documentId }) : await createVaccination(dogId, { vaccine_type: text1.trim(), administered_on: dateKey(date1), next_due_on: date2 ? dateKey(date2) : null, clinic_name: text2.trim() || null, vaccine_name: text3.trim() || null, note: text4.trim() || null, batch_number: text5.trim() || null, document_id: documentId });
        if (result.error) throw result.error; reminderSync = result.reminderSync;
      } else if (sheet === 'parasite') {
        if (!date1) throw new Error('Bitte Datum ergänzen.');
        const result = editId ? await updateParasiteTreatment(editId, { treatment_date: dateKey(date1), product: text1.trim() || null, next_due_date: date2 ? dateKey(date2) : null, treatment_type: parasiteType, note: text2.trim() || null }) : await createParasiteTreatment(dogId, { treatment_date: dateKey(date1), product: text1.trim() || null, next_due_date: date2 ? dateKey(date2) : null, treatment_type: parasiteType, note: text2.trim() || null });
        if (result.error) throw result.error; reminderSync = result.reminderSync;
      } else if (sheet === 'medication') {
        if (!text1.trim() || !date1) throw new Error('Bitte Name und Startdatum ergänzen.');
        const result = editId ? await updateMedication(editId, { name: text1.trim(), dosage: text2.trim() || null, frequency: text3.trim() || null, starts_on: dateKey(date1), ends_on: date2 ? dateKey(date2) : null, is_active: activeMedication, note: text4.trim() || null, administration_route: text5.trim() || null, prescribing_vet: text6.trim() || null }) : await createMedication(dogId, { name: text1.trim(), dosage: text2.trim() || null, frequency: text3.trim() || null, starts_on: dateKey(date1), ends_on: date2 ? dateKey(date2) : null, is_active: activeMedication, note: text4.trim() || null, dose_amount: null, dose_unit: null, administration_route: text5.trim() || null, prescribing_vet: text6.trim() || null });
        if (result.error) throw result.error; reminderSync = result.reminderSync;
      } else if (sheet === 'allergy' || sheet === 'intolerance' || sheet === 'diagnosis') {
        if (!text1.trim()) throw new Error('Bitte eine Bezeichnung ergänzen.');
        const result = editId ? await updateCondition(editId, { kind: sheet, name: text1.trim(), started_on: date1 ? dateKey(date1) : null, note: text2.trim() || null }) : await createCondition(dogId, { kind: sheet, name: text1.trim(), status: 'active', started_on: date1 ? dateKey(date1) : null, ended_on: null, note: text2.trim() || null });
        if (result.error) throw result.error; reminderSync = result.reminderSync;
      } else if (sheet === 'vet') {
        if (!date1) throw new Error('Bitte Datum ergänzen.');
        const result = editId ? await updateVetVisit(editId, { appointment_at: date1.toISOString(), clinic_name: text1.trim() || null, reason: text2.trim() || null, note: text3.trim() || null }) : await createVetVisit(dogId, { appointment_at: date1.toISOString(), clinic_name: text1.trim() || null, reason: text2.trim() || null, note: text3.trim() || null });
        if (result.error) throw result.error; reminderSync = result.reminderSync;
      } else if (sheet === 'weight') {
        const value = Number(text1.replace(',', '.'));
        if (!Number.isFinite(value) || value <= 0 || !date1) throw new Error('Bitte ein gültiges Gewicht ergänzen.');
        const result = editId ? await updateWeightEntry(editId, { entry_date: dateKey(date1), weight_kg: value, note: text2.trim() || null }) : await createWeightEntry(dogId, { entry_date: dateKey(date1), weight_kg: value, note: text2.trim() || null });
        if (result.error) throw result.error; reminderSync = result.reminderSync;
      }
      setSheet(null); setEditId(null); showToast(reminderSync === 'failed' ? 'Gespeichert, aber Erinnerung konnte nicht synchronisiert werden.' : editId ? 'Gesundheitsdaten aktualisiert' : 'Gesundheitsdaten gespeichert'); await reload();
    } catch (cause) { showToast(cause instanceof Error ? cause.message : 'Speichern nicht möglich'); }
    finally { setSaving(false); }
  };

  const documents: DogDocument[] = data.documents.map(row => ({ id: row.id, title: row.title?.trim() || 'Gesundheitsdokument', category: row.category || row.kind, fileUrl: row.file_url, fileType: fileType(row.file_url), issuedOn: row.issued_on, createdAt: row.created_at }));
  const openDocument = async (doc: DogDocument) => { if (!doc.fileUrl) return; const url = await getDogDocumentUrl(doc.fileUrl); if (url) Linking.openURL(url).catch(() => {}); };
  const deleteDocument = (doc: DogDocument) => Alert.alert('Dokument löschen?', 'Das Gesundheitsdokument wird dauerhaft entfernt.', [{ text: 'Abbrechen', style: 'cancel' }, { text: 'Löschen', style: 'destructive', onPress: async () => { const result = await deleteDogDocument(doc.id, doc.fileUrl); if (result.error) showToast('Dokument konnte nicht gelöscht werden.'); else { showToast('Dokument gelöscht'); await reload(); } } }]);

  if (loading && !dog) return <View style={s.center}><ActivityIndicator size="large" color={C.trackPrimary} /></View>;
  if (error || !dog) return <View style={s.center}><Text style={s.error}>{error ?? 'Hund nicht gefunden'}</Text><AnyvoButton label="Zurück" variant="secondary" onPress={() => router.back()} /></View>;

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.flex}>
        <View style={s.header}><TouchableOpacity style={s.iconButton} hitSlop={8} onPress={() => router.back()}><Ionicons name="chevron-back" size={20} color={C.trackText} /></TouchableOpacity><View style={s.headerText}><Text style={s.headerTitle} numberOfLines={1}>{t('health.recordTitle')}</Text><Text style={s.headerDog} numberOfLines={1} ellipsizeMode="tail">{dog.name}</Text></View>{isOwner ? <TouchableOpacity style={s.iconButton} hitSlop={8} onPress={() => router.push({ pathname: '/dog-health-sharing/[id]', params: { id: dogId } } as never)}><Ionicons name="people-outline" size={20} color={C.trackText} /></TouchableOpacity> : <View style={s.iconButton} />}</View>
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={C.trackPrimary} colors={[C.trackPrimary]} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.scroll, { paddingBottom: 32 + insets.bottom }]}
        >
          <View style={s.tabs}>{(['overview', 'timeline', 'documents'] as Tab[]).map(key => <TouchableOpacity key={key} onPress={() => setTab(key)} style={[s.tab, tab === key && s.tabActive]}><Text style={[s.tabText, tab === key && s.tabTextActive]}>{key === 'overview' ? t('health.recordOverview') : key === 'timeline' ? t('health.recordTimeline') : t('health.recordDocuments')}</Text></TouchableOpacity>)}</View>
          {Object.keys(data.sectionErrors ?? {}).length > 0 ? <View style={s.warning}><Ionicons name="warning-outline" size={17} color={C.trackWarning} /><Text style={s.warningText}>{t('health.recordPartialLoad')}</Text></View> : null}
          {tab === 'overview' && <Overview dog={dog} status={status} due={due} data={data} measurements={measurements} trend={trend} onAction={openSheet} onTimeline={() => setTab('timeline')} />}
          {tab === 'timeline' && <Timeline items={filteredTimeline} filter={filter} onFilter={setFilter} onDetail={setDetail} />}
          {tab === 'documents' && <DogDocumentsCard documents={documents} onAdd={() => router.push({ pathname: '/dog-document/[id]', params: { id: dogId, category: 'health' } } as never)} onOpen={openDocument} onDelete={isOwner ? deleteDocument : undefined} />}
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
      <AnyvoBottomSheet keyboardAware visible={sheet !== null} onClose={() => setSheet(null)} title={sheetTitle(sheet)}>
        {sheet === 'emergency' ? (
          <Emergency dog={dog} data={data} ownerName={typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null} ownerEmail={user?.email ?? null} ownerPhone={profile?.phone_number ?? null} />
        ) : (
          <>
            <ScrollView style={s.sheetScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} showsVerticalScrollIndicator={false}>
              {renderForm(sheet, { text1, text2, text3, text4, text5, text6, date1, date2, activeMedication, parasiteType, documentId, documents, setText1, setText2, setText3, setText4, setText5, setText6, setDate1, setDate2, setActiveMedication, setParasiteType, setDocumentId })}
            </ScrollView>
            <View style={s.sheetFooter}>
              <AnyvoButton label="Speichern" icon="checkmark" onPress={save} loading={saving} />
            </View>
            <HealthNumericKeyboardAccessory />
          </>
        )}
      </AnyvoBottomSheet>
      <AnyvoBottomSheet keyboardAware visible={detail !== null} onClose={() => setDetail(null)} title={detail?.title}>
        {detail ? (
          <DetailBody
            detail={detail} data={data} isOwner={isOwner}
            administrations={administrations} adminLoading={adminLoading}
            onEdit={openEdit} onDelete={deleteItem}
            onOpenAdminForm={openAdminForm} onEditAdmin={openAdminEdit} onDeleteAdmin={deleteAdmin}
          />
        ) : null}
      </AnyvoBottomSheet>
      {/* "Gabe dokumentieren" — a separate, self-contained sheet stacked above
          the medication detail sheet (same pattern Backpack already uses for
          its own editor + action + suggestions sheets). Saving here only
          ever inserts/updates the ONE administration row identified by
          adminEditId; it never touches the parent medication row. */}
      <AnyvoBottomSheet keyboardAware visible={adminSheetOpen} onClose={() => setAdminSheetOpen(false)} title={adminEditId ? 'Gabe bearbeiten' : 'Gabe dokumentieren'}>
        <ScrollView style={s.sheetScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} showsVerticalScrollIndicator={false}>
          <DateField style={s.dateFieldGap} label="Datum" value={adminDate} onChange={setAdminDate} maximumDate={new Date()} />
          <DateField style={s.dateFieldGap} label="Uhrzeit" value={adminTime} onChange={setAdminTime} mode="time" />
          <Field label="Menge" value={adminAmount} onChangeText={setAdminAmount} placeholder="z. B. 1,5" keyboardType="decimal-pad" />
          <Field label="Einheit" value={adminUnit} onChangeText={setAdminUnit} placeholder="z. B. ml" />
          <Field label="Art der Gabe" value={adminRoute} onChangeText={setAdminRoute} placeholder="z. B. oral" />
          <Field label="Ort" value={adminLocation} onChangeText={setAdminLocation} placeholder="z. B. Zuhause" />
          <Field label="Notiz" value={adminNote} onChangeText={setAdminNote} placeholder="Optional" />
        </ScrollView>
        <View style={s.sheetFooter}>
          <AnyvoButton label="Speichern" icon="checkmark" onPress={saveAdmin} loading={adminSaving} />
        </View>
      </AnyvoBottomSheet>
      {toast}
    </View>
  );
}

function Overview({ dog, status, due, data, measurements, trend, onAction, onTimeline }: { dog: Dog; status: string; due: DueItem[]; data: HealthOverviewData; measurements: ReturnType<typeof weightMeasurements>; trend: ReturnType<typeof weightChange>; onAction: (action: QuickAction) => void; onTimeline: () => void }) {
  const { t } = useT();
  const { width } = useWindowDimensions();
  const actionColumns = width >= 390 ? 3 : 2;
  const actionGap = 9;
  const actionWidth = Math.max(0, (width - 32 - actionGap * (actionColumns - 1)) / actionColumns);
  const trendWidth = Math.max(200, width - 64);
  const latestMeasurement = measurements.at(-1);
  const latestWeight = latestMeasurement?.weight_kg ?? dog.weight_kg;
  return <View style={s.content}>
    <AnyvoCard><View style={s.heroRow}><View style={s.heroIcon}><Ionicons name="heart-outline" size={22} color={C.trackPrimary} /></View><View style={{ flex: 1 }}><Text style={s.eyebrow}>GESUNDHEITSSTATUS</Text><Text style={s.heroTitle}>{status}</Text><Text style={s.muted}>{dog.name} · Zusammenfassung gespeicherter Daten</Text></View></View></AnyvoCard>
    <Text style={s.section}>{t('health.recordQuickActions')}</Text><View style={s.actionGrid}>{ACTIONS.map(action => <TouchableOpacity key={action.key} style={[s.action, { width: actionWidth }]} onPress={() => onAction(action.key)}><View style={s.actionIcon}><Ionicons name={action.icon} size={19} color={C.trackPrimary} /></View><Text style={s.actionText} numberOfLines={2}>{t(action.labelKey)}</Text></TouchableOpacity>)}</View>
    <Text style={s.section}>{t('health.recordCurrentValues')}</Text><AnyvoCard><View style={s.valueHeader}><View style={s.valueCopy}><Text style={s.eyebrow}>{t('health.recordWeight').toUpperCase()}</Text>{latestWeight != null ? <Text style={s.value}>{latestWeight} kg</Text> : <><Text style={s.weightEmptyPrimary} numberOfLines={2}>Noch kein Gewicht erfasst</Text><TouchableOpacity style={s.weightAdd} onPress={() => onAction('weight')} activeOpacity={0.8}><Text style={s.weightAddText}>Gewicht hinzufügen</Text><Ionicons name="arrow-forward" size={15} color={C.trackPrimary} /></TouchableOpacity></>}{latestMeasurement ? <Text style={s.muted}>{formatDate(latestMeasurement.entry_date)}{trend?.delta != null ? ` · ${trend.delta >= 0 ? '+' : ''}${trend.delta.toFixed(1)} kg` : ''}</Text> : null}</View><Ionicons name="scale-outline" size={26} color={C.trackPrimary} /></View>{measurements.length > 1 ? <TrendLine points={measurements.slice(-8).map(entry => ({ date: entry.entry_date, score: entry.weight_kg! }))} width={trendWidth} /> : null}</AnyvoCard>
    <Text style={s.section}>{t('health.recordNext')}</Text>{due.length ? due.slice(0, 3).map(item => <DueRow key={item.id} item={item} />) : <Empty text={t('health.recordNoDue')} />}
    <Text style={s.section}>{t('health.recordRecent')}</Text>{buildHealthTimeline(data).slice(0, 4).map(item => <TimelineRow key={item.id} item={item} onPress={() => onTimeline()} />)}{buildHealthTimeline(data).length === 0 ? <Empty text={t('health.recordNoActivities')} /> : null}
  </View>;
}

function Timeline({ items, filter, onFilter, onDetail }: { items: HealthTimelineItem[]; filter: HealthTimelineFilter; onFilter: (filter: HealthTimelineFilter) => void; onDetail: (item: HealthTimelineItem) => void }) { return <View style={s.content}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>{FILTERS.map(item => <AnyvoChip key={item.key} label={item.label} active={filter === item.key} onPress={() => onFilter(item.key)} />)}</ScrollView>{items.length ? items.map(item => <TimelineRow key={`${item.kind}-${item.id}`} item={item} onPress={() => onDetail(item)} />) : <Empty text="Keine Einträge für diesen Filter" />}</View>; }
function TimelineRow({ item, onPress }: { item: HealthTimelineItem; onPress: () => void }) { return <TouchableOpacity style={s.timelineRow} onPress={onPress} activeOpacity={0.8}><View style={s.timelineIcon}><Ionicons name={kindIcon(item.kind)} size={18} color={C.trackPrimary} /></View><View style={{ flex: 1 }}><Text style={s.rowTitle}>{item.title}</Text><Text style={s.muted}>{kindLabel(item.kind)} · {formatDate(item.date)}{item.detail ? ` · ${item.detail}` : ''}</Text>{item.secondary ? <Text style={s.timelineSecondary}>{item.secondary}</Text> : null}</View><Ionicons name="chevron-forward" size={16} color={C.trackTextMut} /></TouchableOpacity>; }
function DueRow({ item }: { item: DueItem }) { return <View style={s.timelineRow}><View style={s.timelineIcon}><Ionicons name="calendar-outline" size={18} color={item.days <= 30 ? C.trackWarning : C.trackPrimary} /></View><View style={{ flex: 1 }}><Text style={s.rowTitle}>{item.title}</Text><Text style={s.muted}>{formatDate(item.date)} · {item.days < 0 ? 'überfällig' : item.days === 0 ? 'heute' : `in ${item.days} Tagen`}</Text></View></View>; }
function Empty({ text }: { text: string }) { return <AnyvoCard><Text style={s.empty}>{text}</Text></AnyvoCard>; }

// Phase 3 (28.09.2026): the Verlauf detail sheet shows ALL saved fields for
// vaccinations and medications (previously only a single squashed `detail`
// string), plus the medication's own "Gaben" administration history — same
// sheet, same navigation, no Verlauf rebuild. Every other kind keeps the
// original generic body unchanged.
function DetailRow({ label, value }: { label: string; value: string }) {
  return <View style={s.detailRow}><Text style={s.detailLabel}>{label}</Text><Text style={s.detailText}>{value}</Text></View>;
}

function DetailBody({ detail, data, isOwner, administrations, adminLoading, onEdit, onDelete, onOpenAdminForm, onEditAdmin, onDeleteAdmin }: {
  detail: HealthTimelineItem; data: HealthOverviewData; isOwner: boolean;
  administrations: HealthMedicationAdministrationRow[]; adminLoading: boolean;
  onEdit: (item: HealthTimelineItem) => void; onDelete: (item: HealthTimelineItem) => void;
  onOpenAdminForm: () => void; onEditAdmin: (row: HealthMedicationAdministrationRow) => void; onDeleteAdmin: (row: HealthMedicationAdministrationRow) => void;
}) {
  const rawId = detail.id.split(':')[1];
  const editDeleteActions = isOwner ? (
    <View style={s.detailActions}>
      <AnyvoButton label="Bearbeiten" variant="secondary" icon="create-outline" onPress={() => onEdit(detail)} />
      <AnyvoButton label="Löschen" variant="secondary" icon="trash-outline" onPress={() => onDelete(detail)} />
    </View>
  ) : null;

  if (detail.kind === 'vaccination') {
    const row = data.vaccinations.find(v => v.id === rawId);
    if (!row) return null;
    const linkedDocument = row.document_id ? data.documents.find(d => d.id === row.document_id) : null;
    return (
      <View style={s.detail}>
        <View style={s.detailIcon}><Ionicons name="shield-checkmark-outline" size={22} color={C.trackPrimary} /></View>
        <DetailRow label="Impfung" value={row.vaccine_name ? `${row.vaccine_type} · ${row.vaccine_name}` : row.vaccine_type} />
        <DetailRow label="Datum" value={formatDate(row.administered_on)} />
        <DetailRow label="Nächste Fälligkeit" value={row.next_due_on ? formatDate(row.next_due_on) : 'Keine Angabe'} />
        <DetailRow label="Tierarzt / Praxis" value={row.clinic_name || 'Keine Angabe'} />
        <DetailRow label="Chargennummer" value={row.batch_number || 'Keine Angabe'} />
        <DetailRow label="Notiz" value={row.note || 'Keine Angabe'} />
        {linkedDocument ? <Text style={s.detailDocLink}>Dokument verknüpft: {linkedDocument.title || 'Gesundheitsdokument'}</Text> : null}
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
        <DetailRow label="Medikament" value={row.name} />
        <DetailRow label="Dosierung" value={dose || 'Keine Angabe'} />
        <DetailRow label="Art der Gabe" value={row.administration_route || 'Keine Angabe'} />
        <DetailRow label="Zeitraum" value={`${formatDate(row.starts_on)}${row.ends_on ? ` – ${formatDate(row.ends_on)}` : ' – laufend'}`} />
        <DetailRow label="Status" value={row.is_active ? 'Aktiv' : 'Inaktiv'} />
        <DetailRow label="Verordnender Tierarzt / Praxis" value={row.prescribing_vet || 'Keine Angabe'} />
        <DetailRow label="Notiz" value={row.note || 'Keine Angabe'} />
        {editDeleteActions}

        <Text style={s.gabenHeading}>Gaben</Text>
        {isOwner ? <AnyvoButton label="Gabe dokumentieren" icon="add" variant="secondary" onPress={onOpenAdminForm} /> : null}
        {adminLoading ? <Text style={s.muted}>Lädt…</Text> : null}
        {!adminLoading && administrations.length === 0 ? <Text style={s.muted}>Noch keine Gaben dokumentiert.</Text> : null}
        {administrations.map(entry => (
          <View key={entry.id} style={s.adminRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.adminRowTitle}>{formatDateTime(entry.administered_at)}</Text>
              <Text style={s.muted}>
                {[entry.amount != null ? `${entry.amount}${entry.unit ? ` ${entry.unit}` : ''}` : null, entry.administration_route, entry.location].filter(Boolean).join(' · ') || 'Keine weiteren Angaben'}
              </Text>
              {entry.note ? <Text style={s.muted}>{entry.note}</Text> : null}
            </View>
            {isOwner ? (
              <View style={s.adminRowActions}>
                <TouchableOpacity onPress={() => onEditAdmin(entry)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Gabe bearbeiten"><Ionicons name="create-outline" size={18} color={C.trackTextSec} /></TouchableOpacity>
                <TouchableOpacity onPress={() => onDeleteAdmin(entry)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Gabe löschen"><Ionicons name="trash-outline" size={18} color={C.trackDanger} /></TouchableOpacity>
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
      <Text style={s.detailText}>{detail.detail || 'Keine weiteren Angaben hinterlegt.'}</Text>
      {detail.kind !== 'document' ? editDeleteActions : null}
    </View>
  );
}
function Emergency({ dog, data, ownerName, ownerEmail, ownerPhone }: { dog: Dog; data: HealthOverviewData; ownerName: string | null; ownerEmail: string | null; ownerPhone: string | null }) { const { t } = useT(); const allergies = data.conditions.filter(c => c.kind !== 'diagnosis' && c.status !== 'resolved'); const diagnoses = data.conditions.filter(c => c.kind === 'diagnosis' && c.status !== 'resolved'); const meds = data.medications.filter(m => m.is_active); const latest = weightMeasurements(data.entries).at(-1); const weight = latest?.weight_kg ?? dog.weight_kg; return <View style={s.emergency}><Text style={s.emergencyName}>{dog.name}</Text><Text style={s.muted}>{t('health.recordBirthDate')}: {dog.birth_date ? formatDate(dog.birth_date) : t('health.recordNoData')}</Text><Text style={s.emergencyLabel}>{t('health.recordCurrentWeight')}</Text><Text style={s.emergencyText}>{weight != null ? `${weight} kg${latest ? ` · ${formatDate(latest.entry_date)}` : ''}` : t('health.recordNoData')}</Text><Text style={s.emergencyLabel}>{t('health.recordAllergy')} / {t('health.recordIntolerance')}</Text><Text style={s.emergencyText}>{allergies.length ? allergies.map(item => item.name).join(', ') : t('health.recordNoData')}</Text><Text style={s.emergencyLabel}>{t('health.recordActiveMedication')}</Text><Text style={s.emergencyText}>{meds.length ? meds.map(item => item.name).join(', ') : t('health.recordNoData')}</Text><Text style={s.emergencyLabel}>{t('health.recordConditions')}</Text><Text style={s.emergencyText}>{diagnoses.length ? diagnoses.map(item => item.name).join(', ') : t('health.recordNoData')}</Text>{ownerName || ownerEmail || ownerPhone ? <><Text style={s.emergencyLabel}>{t('health.recordOwnerContact')}</Text>{ownerName ? <Text style={s.emergencyText}>{ownerName}</Text> : null}{ownerEmail ? <Text style={s.emergencyText}>{ownerEmail}</Text> : null}{ownerPhone ? <TouchableOpacity onPress={() => Linking.openURL(`tel:${ownerPhone}`)}><Text style={[s.emergencyText, s.emergencyLink]}>{ownerPhone}</Text></TouchableOpacity> : <Text style={s.emergencyText}>{t('health.recordPhoneMissing')}</Text>}</> : null}</View>; }

type FormState = { text1: string; text2: string; text3: string; text4: string; text5: string; text6: string; date1: Date | null; date2: Date | null; activeMedication: boolean; parasiteType: string; documentId: string | null; documents: DogDocument[]; setText1: (value: string) => void; setText2: (value: string) => void; setText3: (value: string) => void; setText4: (value: string) => void; setText5: (value: string) => void; setText6: (value: string) => void; setDate1: (value: Date) => void; setDate2: (value: Date | null) => void; setActiveMedication: (value: boolean) => void; setParasiteType: (value: string) => void; setDocumentId: (value: string | null) => void };
function renderForm(sheet: QuickAction | null, state: FormState) { if (!sheet) return null; if (sheet === 'vaccination') return <><Field label="Impfart" value={state.text1} onChangeText={state.setText1} placeholder="z. B. Tollwut" /><DateField style={s.dateFieldGap} label="Verabreicht am" value={state.date1} onChange={state.setDate1} maximumDate={new Date()} /><DateField style={s.dateFieldGap} label="Nächste Fälligkeit" value={state.date2} onChange={state.setDate2} onClear={() => state.setDate2(null)} minimumDate={state.date1 ?? new Date()} /><Field label="Tierarzt / Praxis" value={state.text2} onChangeText={state.setText2} placeholder="Optional" /><Field label="Impfstoff" value={state.text3} onChangeText={state.setText3} placeholder="Optional" /><Field label="Chargennummer" value={state.text5} onChangeText={state.setText5} placeholder="Optional" /><Field label="Notiz" value={state.text4} onChangeText={state.setText4} placeholder="Optional" /><Text style={s.formLabel}>Dokument verknüpfen</Text><View style={s.choiceRow}><AnyvoChip label="Kein Dokument" active={!state.documentId} onPress={() => state.setDocumentId(null)} />{state.documents.map(doc => <AnyvoChip key={doc.id} label={doc.title} active={state.documentId === doc.id} onPress={() => state.setDocumentId(state.documentId === doc.id ? null : doc.id)} />)}</View>{state.documents.length === 0 ? <Text style={s.muted}>Noch keine Gesundheitsdokumente vorhanden.</Text> : null} </>; if (sheet === 'parasite') return <><Text style={s.formLabel}>Behandlungstyp</Text><View style={s.choiceRow}>{[['deworming', 'Entwurmung'], ['flea_tick', 'Zecken / Floh'], ['heartworm', 'Herzwurm'], ['other', 'Andere']].map(([key, label]) => <AnyvoChip key={key} label={label} active={state.parasiteType === key} onPress={() => state.setParasiteType(key)} />)}</View><Field label="Produkt" value={state.text1} onChangeText={state.setText1} placeholder="Optional" /><DateField style={s.dateFieldGap} label="Behandelt am" value={state.date1} onChange={state.setDate1} maximumDate={new Date()} /><DateField style={s.dateFieldGap} label="Nächste Fälligkeit" value={state.date2} onChange={state.setDate2} onClear={() => state.setDate2(null)} minimumDate={state.date1 ?? new Date()} /><Field label="Notiz" value={state.text2} onChangeText={state.setText2} placeholder="Optional" /> </>; if (sheet === 'medication') return <><Field label="Name" value={state.text1} onChangeText={state.setText1} placeholder="Medikament" /><Field label="Dosierung" value={state.text2} onChangeText={state.setText2} placeholder="Optional" /><Field label="Häufigkeit" value={state.text3} onChangeText={state.setText3} placeholder="Optional" /><Field label="Art der Gabe" value={state.text5} onChangeText={state.setText5} placeholder="z. B. oral" /><Field label="Verordnender Tierarzt / Praxis" value={state.text6} onChangeText={state.setText6} placeholder="Optional" /><DateField style={s.dateFieldGap} label="Beginn" value={state.date1} onChange={state.setDate1} /><DateField style={s.dateFieldGap} label="Ende" value={state.date2} onChange={state.setDate2} onClear={() => state.setDate2(null)} minimumDate={state.date1 ?? new Date()} /><View style={s.switchRow}><Text style={s.rowTitle}>Aktiv</Text><Switch value={state.activeMedication} onValueChange={state.setActiveMedication} trackColor={{ false: C.trackCardAlt, true: C.trackPrimary }} thumbColor="#fff" /></View><Field label="Notiz" value={state.text4} onChangeText={state.setText4} placeholder="Optional" /></>; if (sheet === 'allergy' || sheet === 'intolerance' || sheet === 'diagnosis') return <><Field label={sheet === 'allergy' ? 'Allergie' : sheet === 'intolerance' ? 'Unverträglichkeit' : 'Diagnose'} value={state.text1} onChangeText={state.setText1} placeholder="Bezeichnung" /><DateField style={s.dateFieldGap} label="Beginn" value={state.date1} onChange={state.setDate1} /><Field label="Notiz" value={state.text2} onChangeText={state.setText2} placeholder="Optional" /> </>; if (sheet === 'vet') return <><DateField style={s.dateFieldGap} label="Termin" value={state.date1} onChange={state.setDate1} minimumDate={new Date()} /><Field label="Tierarzt / Praxis" value={state.text1} onChangeText={state.setText1} placeholder="Optional" /><Field label="Anlass" value={state.text2} onChangeText={state.setText2} placeholder="Optional" /><Field label="Notiz" value={state.text3} onChangeText={state.setText3} placeholder="Optional" /> </>; return <><Field label="Gewicht in kg" value={state.text1} onChangeText={state.setText1} placeholder="z. B. 24,5" keyboardType="decimal-pad" /><DateField style={s.dateFieldGap} label="Gemessen am" value={state.date1} onChange={state.setDate1} maximumDate={new Date()} /><Field label="Notiz" value={state.text2} onChangeText={state.setText2} placeholder="Optional" /></>; }
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
type DueItem = { id: string; title: string; date: string; days: number };
function nextDue(data: HealthOverviewData): DueItem[] { const today = new Date(); const items: DueItem[] = []; data.vaccinations.forEach(v => v.next_due_on && items.push({ id: `v-${v.id}`, title: `Impfung · ${v.vaccine_name || v.vaccine_type}`, date: v.next_due_on, days: dayDiff(v.next_due_on, today) })); data.parasites.forEach(p => p.next_due_date && items.push({ id: `p-${p.id}`, title: parasiteLabel(p.treatment_type), date: p.next_due_date, days: dayDiff(p.next_due_date, today) })); data.vetVisits.filter(v => v.appointment_at && new Date(v.appointment_at) >= today).forEach(v => items.push({ id: `vet-${v.id}`, title: v.reason || 'Tierarzttermin', date: v.appointment_at, days: dayDiff(v.appointment_at, today) })); return items.sort((a, b) => a.date.localeCompare(b.date)); }
function dayDiff(value: string, today: Date): number { return Math.ceil((new Date(value).getTime() - today.getTime()) / 86400000); }
function sheetTitle(sheet: QuickAction | null): string { return sheet === 'vaccination' ? 'Impfung erfassen' : sheet === 'parasite' ? 'Parasitenbehandlung erfassen' : sheet === 'medication' ? 'Medikament erfassen' : sheet === 'vet' ? 'Tierarzttermin erfassen' : sheet === 'weight' ? 'Gewicht erfassen' : sheet === 'allergy' ? 'Allergie erfassen' : sheet === 'intolerance' ? 'Unverträglichkeit erfassen' : sheet === 'diagnosis' ? 'Diagnose erfassen' : sheet === 'emergency' ? 'Notfallinformationen' : ''; }
function dateKey(value: Date): string { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
function formatDate(value: string | null): string { if (!value) return 'Datum nicht hinterlegt'; const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Datum nicht lesbar' : date.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
// Manual HH:MM padding (matching components/ui/DateField.tsx's own local
// fmtTime helper) rather than toLocaleTimeString — deterministic across
// environments, not dependent on the host's ICU/locale data.
function formatDateTime(value: string | null): string {
  if (!value) return 'Zeitpunkt nicht hinterlegt';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Zeitpunkt nicht lesbar';
  return `${formatDate(value)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function fileType(path: string | null): 'pdf' | 'image' | 'file' { const ext = path?.split('.').pop()?.toLowerCase(); return ext === 'pdf' ? 'pdf' : ext && ['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(ext) ? 'image' : 'file'; }
function kindIcon(kind: HealthTimelineItem['kind']): React.ComponentProps<typeof Ionicons>['name'] { return kind === 'vaccination' ? 'shield-checkmark-outline' : kind === 'parasite' ? 'bug-outline' : kind === 'medication' ? 'flask-outline' : kind === 'vet' ? 'medkit-outline' : kind === 'weight' ? 'scale-outline' : kind === 'condition' ? 'warning-outline' : 'document-text-outline'; }
function kindLabel(kind: HealthTimelineItem['kind']): string { return kind === 'vaccination' ? 'Impfung' : kind === 'parasite' ? 'Parasiten' : kind === 'medication' ? 'Medikament' : kind === 'vet' ? 'Tierarzt' : kind === 'weight' ? 'Gewicht' : kind === 'condition' ? 'Diagnose / Allergie' : 'Dokument'; }

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.trackBg }, flex: { flex: 1 }, center: { flex: 1, backgroundColor: C.trackBg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }, error: { color: C.trackTextSec, fontSize: 15, textAlign: 'center' }, header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12 }, iconButton: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, alignItems: 'center', justifyContent: 'center' }, headerText: { flex: 1, alignItems: 'center' }, headerTitle: { color: C.trackText, fontWeight: '900', fontSize: 16 }, headerDog: { color: C.trackTextSec, fontSize: 12, marginTop: 2 }, scroll: { padding: 16, gap: 14 }, tabs: { flexDirection: 'row', gap: 8 }, tab: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard }, tabActive: { backgroundColor: C.trackPrimary, borderColor: C.trackPrimary }, tabText: { color: C.trackTextSec, fontWeight: '800', fontSize: 13 }, tabTextActive: { color: C.accentText }, content: { gap: 12 }, warning: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.warningDim, borderRadius: 14, borderWidth: 1, borderColor: C.warning, padding: 12 }, warningText: { flex: 1, color: C.trackTextSec, fontSize: 12 }, heroRow: { flexDirection: 'row', alignItems: 'center', gap: 13 }, heroIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' }, eyebrow: { color: C.trackTextMut, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }, heroTitle: { color: C.trackText, fontSize: 20, fontWeight: '900', marginTop: 3 }, muted: { color: C.trackTextSec, fontSize: 12, marginTop: 3 }, section: { color: C.trackTextMut, fontSize: 11, fontWeight: '900', letterSpacing: 1.3, textTransform: 'uppercase', marginTop: 5 }, actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, action: { alignItems: 'center', gap: 6, paddingVertical: 11, borderRadius: 15, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, minHeight: 82, justifyContent: 'center' }, actionIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' }, actionText: { color: C.trackTextSec, fontSize: 11, fontWeight: '800', textAlign: 'center', lineHeight: 15 }, valueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, valueCopy: { flex: 1, paddingRight: 12 }, value: { color: C.trackText, fontSize: 25, fontWeight: '900', marginTop: 4 }, weightEmptyPrimary: { color: C.trackText, fontSize: 16, lineHeight: 21, fontWeight: '800', marginTop: 4 }, weightAdd: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingVertical: 6, minHeight: 44 }, weightAddText: { color: C.trackPrimary, fontSize: 13, fontWeight: '800' }, empty: { color: C.trackTextMut, fontSize: 13, lineHeight: 19 }, filters: { gap: 8, paddingBottom: 2 }, timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, padding: 13 }, timelineIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' }, rowTitle: { color: C.trackText, fontSize: 14, fontWeight: '800' }, sheetScroll: { flexShrink: 1 }, sheetFooter: { paddingTop: 14, paddingBottom: 6 }, accessoryBar: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', backgroundColor: C.trackCard, borderTopWidth: 1, borderTopColor: C.trackBorder, paddingHorizontal: 16, paddingVertical: 10 }, accessoryDone: { color: C.trackPrimary, fontSize: 16, fontWeight: '800' }, formLabel: { color: C.trackTextMut, fontSize: 10, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6, marginTop: 10 }, dateFieldGap: { marginTop: 10 }, input: { color: C.trackText, backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 }, choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 4 }, switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.trackCard, borderRadius: 14, padding: 10 }, detail: { gap: 10, paddingBottom: 12 }, detailIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' }, detailDate: { color: C.trackTextSec, fontSize: 13 }, detailText: { color: C.trackText, fontSize: 15, lineHeight: 22 }, detailActions: { gap: 8, marginTop: 8 }, timelineSecondary: { color: C.trackPrimary, fontSize: 11.5, fontWeight: '700', marginTop: 2 }, detailRow: { gap: 2 }, detailLabel: { color: C.trackTextMut, fontSize: 10, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' }, detailDocLink: { color: C.trackPrimary, fontSize: 13, fontWeight: '700', marginTop: 4 }, gabenHeading: { color: C.trackTextMut, fontSize: 11, fontWeight: '900', letterSpacing: 1.3, textTransform: 'uppercase', marginTop: 14 }, adminRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, padding: 12 }, adminRowTitle: { color: C.trackText, fontSize: 13.5, fontWeight: '800' }, adminRowActions: { flexDirection: 'row', gap: 10 }, emergency: { gap: 10, paddingBottom: 14 }, emergencyName: { color: C.trackText, fontSize: 25, fontWeight: '900' }, emergencyLabel: { color: C.trackTextMut, fontSize: 10, fontWeight: '900', letterSpacing: 1.1, textTransform: 'uppercase', marginTop: 8 }, emergencyText: { color: C.trackText, fontSize: 15 }, emergencyLink: { color: C.trackPrimary },
});
