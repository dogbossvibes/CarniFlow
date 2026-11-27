import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { showUndoToast } from '@/lib/undoToast';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView as ScrollView } from '@/components/ui/KeyboardAwareScrollView';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { formatDate } from '@/i18n/format';
import { useSession } from '@/lib/session-context';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { DateField } from '@/components/ui/DateField';
import { EXAM_TYPES, examTypeByKey } from '@/features/exam-book/catalog';
import {
  sectionsFromTemplate, suggestFromSections, sumSections, validateExam,
  type ExamInput, type ExamIssue, type ExamSection,
} from '@/features/exam-book/model';
import { examBookAvailable, getExam, listPendingIds, removeExam, restoreExam, saveExam } from '@/features/exam-book/store';
import { syncExamBook } from '@/features/exam-book/sync';
import {
  addExamLink, listExamLinks, listLinkCandidates, removeExamLink,
  type ExamLink, type ExamLinkCandidate, type ExamLinkKind,
} from '@/features/exam-book/service';

// Prüfung erfassen oder bearbeiten (Spec 01-pruefungsbuch.md).
// Speichern wirkt sofort lokal (offline); der Upload läuft im Hintergrund.
// Entfernen setzt nur deleted_at und lässt sich rückgängig machen.

const toIsoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIsoDate = (s: string) => new Date(`${s}T12:00:00`);
const parseNum = (s: string): number | null => {
  const t = s.replace(',', '.').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const numText = (n: number | null) => (n == null ? '' : String(n));

function emptyInput(dogId: string): ExamInput {
  return {
    dog_id: dogId, exam_date: toIsoDate(new Date()), location: null, club: null, judge: null,
    exam_type: 'igp', exam_type_label: null, exam_level: null, sections: sectionsFromTemplate('igp'),
    total_points: null, max_points: null, rating: null, passed: null, placement: null, notes: null,
  };
}

export default function ExamEditScreen() {
  const router = useRouter();
  const { t } = useT();
  const { user } = useSession();
  const ownerId = user?.id ?? '';
  const params = useLocalSearchParams<{ dogId: string; examId?: string }>();
  const dogId = typeof params.dogId === 'string' ? params.dogId : '';
  const examId = typeof params.examId === 'string' ? params.examId : null;

  const [form, setForm] = useState<ExamInput>(() => emptyInput(dogId));
  const [totalText, setTotalText] = useState('');
  const [placementText, setPlacementText] = useState('');
  // Eingabetext der Abteilungspunkte roh halten («85.» bleibt beim Tippen stehen); gerechnet wird mit der Zahl.
  const [pointsText, setPointsText] = useState<Record<number, string>>({});
  const [loaded, setLoaded] = useState(!examId);
  const [issues, setIssues] = useState<ExamIssue[]>([]);
  const [saving, setSaving] = useState(false);
  const [synced, setSynced] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!examId || !ownerId) return;
    let alive = true;
    void (async () => {
      const [exam, pendingIds] = await Promise.all([getExam(ownerId, examId), listPendingIds(ownerId, dogId)]);
      if (!alive) return;
      if (exam) {
        setForm({
          dog_id: exam.dog_id, exam_date: exam.exam_date, location: exam.location, club: exam.club, judge: exam.judge,
          exam_type: exam.exam_type, exam_type_label: exam.exam_type_label, exam_level: exam.exam_level,
          sections: exam.sections, total_points: exam.total_points, max_points: exam.max_points, rating: exam.rating,
          passed: exam.passed, placement: exam.placement, notes: exam.notes,
        });
        setTotalText(numText(exam.total_points));
        setPlacementText(numText(exam.placement));
        setSynced(!pendingIds.includes(exam.id));
      }
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [examId, ownerId, dogId]);

  const def = examTypeByKey(form.exam_type) ?? examTypeByKey('other')!;
  const sum = useMemo(() => sumSections(form.sections), [form.sections]);
  const suggestion = useMemo(() => suggestFromSections(form.exam_type, form.sections), [form.exam_type, form.sections]);
  const set = <K extends keyof ExamInput>(key: K, value: ExamInput[K]) => setForm(f => ({ ...f, [key]: value }));

  const chooseType = (key: string) => { if (key !== form.exam_type) setPointsText({}); setForm(f => f.exam_type === key ? f : ({
    ...f, exam_type: key, exam_level: null, sections: sectionsFromTemplate(key),
    exam_type_label: key === 'other' ? f.exam_type_label : null,
  })); };
  const setSection = (index: number, patch: Partial<ExamSection>) =>
    setForm(f => ({ ...f, sections: f.sections.map((sec, i) => i === index ? { ...sec, ...patch } : sec) }));

  const save = async () => {
    if (savingRef.current) return;
    const input: ExamInput = {
      ...form,
      sections: form.sections.map((sec, i) => (i in pointsText ? { ...sec, points: parseNum(pointsText[i]) } : sec)),
      total_points: parseNum(totalText),
      max_points: sum.max ?? form.max_points,
      placement: (() => { const n = parseNum(placementText); return n != null && Number.isInteger(n) && n >= 1 ? n : null; })(),
    };
    const found = validateExam(input);
    setIssues(found);
    if (found.length) return;
    savingRef.current = true; setSaving(true);
    try {
      await saveExam(ownerId, input, examId);
      void syncExamBook(ownerId);
      router.back();
    } catch {
      Alert.alert(t('exam.saveFailed'));
    } finally {
      savingRef.current = false; setSaving(false);
    }
  };

  const remove = async () => {
    if (!examId) return;
    const removed = await removeExam(ownerId, examId).catch(() => null);
    if (!removed) { Alert.alert(t('exam.saveFailed')); return; }
    // Globaler Hinweis (nicht an diesen Screen gebunden): er bleibt nach dem
    // Zurückgehen sichtbar. Entfernt ist schon weich (deleted_at); Rückgängig stellt her.
    showUndoToast({
      message: t('exam.removed'),
      onUndo: () => { void restoreExam(ownerId, examId).then(() => syncExamBook(ownerId)); },
      onCommit: () => { void syncExamBook(ownerId); },
    });
    router.back();
  };

  if (!examBookAvailable()) {
    return <SafeAreaView style={s.safe}><Text style={[s.text, { padding: 20 }]}>{t('exam.unavailable')}</Text></SafeAreaView>;
  }
  if (!loaded) return <SafeAreaView style={s.safe}><ActivityIndicator color={C.trackPrimary} style={{ marginTop: 40 }} /></SafeAreaView>;

  const err = (issue: ExamIssue, key: Parameters<typeof t>[0]) => issues.includes(issue) ? <Text style={s.error} accessibilityLiveRegion="polite">{t(key)}</Text> : null;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={C.trackText} />
        </TouchableOpacity>
        <Text accessibilityRole="header" style={[s.headerTitle, { flex: 1 }]}>{t(examId ? 'exam.editTitle' : 'exam.newTitle')}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => void save()} disabled={saving} style={s.iconBtn}>
          {saving ? <ActivityIndicator color={C.trackPrimary} /> : <Text style={s.saveText}>{t('exam.save')}</Text>}
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <DateField label={t('exam.date')} value={fromIsoDate(form.exam_date)} onChange={d => set('exam_date', toIsoDate(d))} />
        {err('date', 'exam.invalidDate')}

        <Text style={s.label}>{t('exam.type')}</Text>
        <Chips items={EXAM_TYPES.map(x => ({ key: x.key, label: x.label }))} value={form.exam_type} onChange={chooseType} />
        {err('type', 'exam.invalidType')}
        {form.exam_type === 'other' ? (
          <Field label={t('exam.typeLabel')} value={form.exam_type_label ?? ''} onChange={v => set('exam_type_label', v)} max={80} />
        ) : null}
        {def.levels.length > 0 ? <>
          <Text style={s.label}>{t('exam.level')}</Text>
          <Chips items={def.levels.map(l => ({ key: l.key, label: l.label }))} value={form.exam_level} onChange={k => set('exam_level', form.exam_level === k ? null : k)} />
        </> : (
          <Field label={t('exam.level')} value={form.exam_level ?? ''} onChange={v => set('exam_level', v)} max={20} />
        )}

        <Field label={t('exam.location')} value={form.location ?? ''} onChange={v => set('location', v)} max={120} />
        <Field label={t('exam.club')} value={form.club ?? ''} onChange={v => set('club', v)} max={120} />
        <Field label={t('exam.judge')} value={form.judge ?? ''} onChange={v => set('judge', v)} max={120} />

        <Text style={s.label}>{t('exam.points')}</Text>
        <View style={s.card}>
          {form.sections.map((sec, i) => (
            <View key={`${sec.key}-${i}`} style={[s.sectionRow, i > 0 && s.divider]}>
              <Text style={[s.text, { flex: 1 }]}>{`${sec.key} ${sec.label}`}</Text>
              {sec.maxPoints == null && def.key === 'bh' ? (
                <YesNo value={sec.passed ?? null} onChange={v => setSection(i, { passed: v })} />
              ) : <>
                <TextInput
                  style={s.pointsInput} keyboardType="decimal-pad" value={pointsText[i] ?? numText(sec.points)}
                  onChangeText={v => { setPointsText(p => ({ ...p, [i]: v })); setSection(i, { points: parseNum(v) }); }}
                  accessibilityLabel={`${sec.label} ${t('exam.points')}`} maxLength={7}
                />
                {sec.maxPoints != null ? <Text style={s.muted}>{t('exam.maxPoints', { max: sec.maxPoints })}</Text> : null}
              </>}
            </View>
          ))}
        </View>
        {err('points_over_max', 'exam.invalidPoints')}

        <View style={s.inline}>
          <Field label={t('exam.total')} value={totalText} onChange={setTotalText} keyboard="decimal-pad" max={9} style={{ flex: 1 }} />
          {sum.total != null && parseNum(totalText) !== sum.total ? (
            <TouchableOpacity accessibilityRole="button" onPress={() => setTotalText(numText(sum.total))} style={s.suggest}>
              <Text style={s.suggestText}>{t('exam.totalAuto', { total: sum.total })}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {err('total_over_max', 'exam.invalidPoints')}

        <View style={s.inline}>
          <Field label={t('exam.rating')} value={form.rating ?? ''} onChange={v => set('rating', v)} max={30} style={{ flex: 1 }} />
          {suggestion.rating && suggestion.rating !== form.rating ? (
            <TouchableOpacity accessibilityRole="button" onPress={() => set('rating', suggestion.rating)} style={s.suggest}>
              <Text style={s.suggestText}>{t('exam.ratingSuggest', { rating: suggestion.rating })}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={s.label}>{t('exam.passed')}</Text>
        <View style={s.inline}>
          <YesNo value={form.passed} onChange={v => set('passed', v)} withUnknown />
          {suggestion.passed != null && form.passed == null ? (
            <TouchableOpacity accessibilityRole="button" onPress={() => set('passed', suggestion.passed)} style={s.suggest}>
              <Text style={s.suggestText}>{t('exam.ratingSuggest', { rating: t(suggestion.passed ? 'exam.yes' : 'exam.no') })}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {def.placement ? <Field label={t('exam.placement')} value={placementText} onChange={setPlacementText} keyboard="number-pad" max={5} /> : null}
        <Field label={t('exam.notes')} value={form.notes ?? ''} onChange={v => set('notes', v)} max={4000} multiline />

        {examId ? <ExamLinks ownerId={ownerId} dogId={dogId} examId={examId} examDate={form.exam_date} synced={synced} /> : null}

        {examId ? <AnyvoButton variant="secondary" icon="trash-outline" label={t('exam.remove')} onPress={() => void remove()} /> : null}
        <AnyvoButton label={t('exam.save')} onPress={() => void save()} loading={saving} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Verknüpfungen (online) ──────────────────────────────────
const LINK_LABEL: Record<ExamLinkKind, 'exam.linkTrack' | 'exam.linkTraining' | 'exam.linkDocument'> = {
  training_session: 'exam.linkTrack', training_unit: 'exam.linkTraining', document: 'exam.linkDocument',
};

function ExamLinks({ ownerId, dogId, examId, examDate, synced }: { ownerId: string; dogId: string; examId: string; examDate: string; synced: boolean }) {
  const { t } = useT();
  const [links, setLinks] = useState<ExamLink[] | null>(null);
  const [candidates, setCandidates] = useState<ExamLinkCandidate[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [offline, setOffline] = useState(false);

  const apply = useCallback((res: Awaited<ReturnType<typeof listExamLinks>>) => {
    setLinks(res.data ?? []);
    setOffline(!!res.error);
  }, []);
  const load = useCallback(() => listExamLinks(examId).then(apply), [examId, apply]);
  useEffect(() => {
    if (!synced) return;
    let alive = true;
    void listExamLinks(examId).then(res => { if (alive) apply(res); });
    return () => { alive = false; };
  }, [synced, examId, apply]);

  const openPicker = async () => {
    setPickerOpen(true); setCandidates(null);
    const res = await listLinkCandidates(ownerId, dogId, examDate);
    setCandidates(res.data ?? []);
    if (res.error) setOffline(true);
  };
  const add = async (c: ExamLinkCandidate) => {
    const res = await addExamLink(examId, c.kind, c.id);
    if (res.error) { setOffline(true); return; }
    setPickerOpen(false); void load();
  };
  const unlink = async (link: ExamLink) => {
    const res = await removeExamLink(link.id);
    if (res.error) { setOffline(true); return; }
    void load();
  };

  if (!synced) return <Text style={s.muted}>{t('exam.linkOffline')}</Text>;
  const linked = new Set((links ?? []).map(l => `${l.kind}:${l.target_id}`));
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.label}>{t('exam.links')}</Text>
      {(links ?? []).map(l => (
        <View key={l.id} style={s.linkRow}>
          <Text style={[s.text, { flex: 1 }]}>{t(LINK_LABEL[l.kind])}</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => void unlink(l)} style={s.iconBtn}><Text style={s.suggestText}>{t('exam.linkRemove')}</Text></TouchableOpacity>
        </View>
      ))}
      {offline ? <Text style={s.muted}>{t('exam.linkOffline')}</Text> : null}
      <AnyvoButton variant="secondary" icon="link-outline" label={t('exam.linkAdd')} onPress={() => void openPicker()} />
      <Text style={s.muted}>{t('exam.linkKeeps')}</Text>
      <AnyvoBottomSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title={t('exam.linkAdd')} closeButton>
        {candidates === null ? <ActivityIndicator color={C.trackPrimary} />
          : candidates.filter(c => !linked.has(`${c.kind}:${c.id}`)).length === 0 ? <Text style={s.text}>{t('exam.linkNone')}</Text>
          : candidates.filter(c => !linked.has(`${c.kind}:${c.id}`)).map(c => (
            <TouchableOpacity key={`${c.kind}:${c.id}`} accessibilityRole="button" style={s.linkRow} onPress={() => void add(c)}>
              <Text style={[s.text, { flex: 1 }]}>{[t(LINK_LABEL[c.kind]), c.title, c.date ? formatDate(fromIsoDate(c.date)) : null].filter(Boolean).join(' · ')}</Text>
              <Ionicons name="add-circle-outline" size={20} color={C.trackPrimary} />
            </TouchableOpacity>
          ))}
      </AnyvoBottomSheet>
    </View>
  );
}

// ── kleine Eingaben ─────────────────────────────────────────
function Field({ label, value, onChange, max, multiline, keyboard, style }: {
  label: string; value: string; onChange: (v: string) => void; max: number; multiline?: boolean;
  keyboard?: 'decimal-pad' | 'number-pad'; style?: object;
}) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={[s.input, multiline && { minHeight: 90, textAlignVertical: 'top' }]} value={value} onChangeText={onChange}
        maxLength={max} multiline={multiline} keyboardType={keyboard} accessibilityLabel={label}
        placeholderTextColor={C.trackTextMut}
      />
    </View>
  );
}

function Chips({ items, value, onChange }: { items: { key: string; label: string }[]; value: string | null; onChange: (key: string) => void }) {
  return (
    <View style={s.chips}>
      {items.map(it => {
        const on = it.key === value;
        return (
          <TouchableOpacity key={it.key} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onChange(it.key)} style={[s.chip, on && s.chipOn]}>
            <Text style={[s.chipText, on && s.chipTextOn]}>{it.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function YesNo({ value, onChange, withUnknown }: { value: boolean | null; onChange: (v: boolean | null) => void; withUnknown?: boolean }) {
  const { t } = useT();
  const items: { key: string; label: string; v: boolean | null }[] = [
    { key: 'yes', label: t('exam.yes'), v: true }, { key: 'no', label: t('exam.no'), v: false },
    ...(withUnknown ? [{ key: 'open', label: t('exam.unknown'), v: null }] : []),
  ];
  return <Chips items={items} value={items.find(i => i.v === value)?.key ?? null} onChange={k => onChange(items.find(i => i.key === k)!.v)} />;
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: C.trackBg },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: C.trackText },
  iconBtn:     { padding: 10, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  saveText:    { fontSize: 16, fontWeight: '700', color: C.trackPrimary },
  content:     { padding: 16, gap: 12, paddingBottom: 48 },
  label:       { fontSize: 13, fontWeight: '600', color: C.trackTextSec },
  text:        { fontSize: 15, color: C.trackText },
  muted:       { fontSize: 13, color: C.trackTextSec },
  error:       { fontSize: 13, color: C.trackDanger },
  input:       { backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: C.trackText },
  card:        { backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder },
  sectionRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, minHeight: 56 },
  divider:     { borderTopWidth: 1, borderTopColor: C.trackBorder },
  pointsInput: { width: 72, backgroundColor: C.trackCardAlt, borderRadius: 10, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16, fontWeight: '700', color: C.trackText, textAlign: 'right' },
  inline:      { flexDirection: 'row', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' },
  suggest:     { paddingVertical: 12, paddingHorizontal: 8, minHeight: 44, justifyContent: 'center' },
  suggestText: { fontSize: 14, fontWeight: '600', color: C.trackPrimary },
  chips:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:        { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, minHeight: 44, justifyContent: 'center' },
  chipOn:      { backgroundColor: C.trackPrimary, borderColor: C.trackPrimary },
  chipText:    { fontSize: 14, color: C.trackText },
  chipTextOn:  { color: '#000000', fontWeight: '700' },
  linkRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, minHeight: 48 },
});
