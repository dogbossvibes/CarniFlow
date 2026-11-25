import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { formatDate } from '@/i18n/format';
import { useSession } from '@/lib/session-context';
import { useCapabilities } from '@/hooks/useCapabilities';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { AnyvoCard } from '@/components/ui/AnyvoCard';
import { EXAM_TYPES, examDisplayName, examTypeByKey } from '@/features/exam-book/catalog';
import { examProgress, sectionSeries, type ExamResult } from '@/features/exam-book/model';
import { useExamBook } from '@/features/exam-book/useExamBook';
import { acceptServerVersion, keepLocalVersion } from '@/features/exam-book/store';
import { fetchRemoteExam } from '@/features/exam-book/sync';
import { listSharedExams } from '@/features/exam-book/service';
import { ExamPointsChart } from '@/features/exam-book/ui/ExamPointsChart';
import { ExamShareSheet } from '@/features/exam-book/ui/ExamShareSheet';

// Prüfungsbuch eines Hundes (Spec 01-pruefungsbuch.md).
// Eigener Hund: lokal (offline) mit Bearbeiten. Geteilter Hund (?shared=1):
// nur Lesen über die Freigabe, keine Anhänge, keine Bearbeitung.
export default function DogExamsRoute() {
  const { id, name, shared } = useLocalSearchParams<{ id: string; name?: string; shared?: string }>();
  const { user } = useSession();
  const dogId = typeof id === 'string' ? id : '';
  const dogName = typeof name === 'string' ? name : '';
  const key = `${user?.id ?? ''}:${dogId}`;
  return shared === '1'
    ? <SharedExams key={key} dogId={dogId} dogName={dogName} />
    : <OwnExams key={key} ownerId={user?.id ?? ''} dogId={dogId} dogName={dogName} />;
}

function OwnExams({ ownerId, dogId, dogName }: { ownerId: string; dogId: string; dogName: string }) {
  const router = useRouter();
  const { t } = useT();
  const { isPro } = useCapabilities();
  const { exams, conflicts, pending, loading, reload, available } = useExamBook(ownerId, dogId);
  const [shareOpen, setShareOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const openEdit = (examId?: string) => router.push({ pathname: '/dog-exam/edit', params: { dogId, ...(examId ? { examId } : {}) } } as never);

  const resolve = async (examId: string, keep: 'mine' | 'other') => {
    const remote = await fetchRemoteExam(examId);
    if (!remote) { Alert.alert(t('exam.loadFailed')); return; }
    if (keep === 'mine') await keepLocalVersion(ownerId, examId, (remote as { updated_at?: string }).updated_at ?? null);
    else await acceptServerVersion(ownerId, remote);
    await reload();
  };

  const onRefresh = async () => { setRefreshing(true); try { await reload(); } finally { setRefreshing(false); } };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <Header title={t('exam.bookTitle')} subtitle={dogName} onBack={() => router.back()}>
        {available ? <>
          <IconButton icon="people-outline" label={t('exam.share')} onPress={() => setShareOpen(true)} />
          <IconButton icon="add" label={t('exam.add')} onPress={() => openEdit()} />
        </> : null}
      </Header>
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={C.trackPrimary} />}>
        {!available ? <AnyvoCard><Text style={s.text}>{t('exam.unavailable')}</Text></AnyvoCard>
          : loading ? <ActivityIndicator color={C.trackPrimary} />
          : <>
            {[...conflicts].map(cid => {
              const exam = exams.find(e => e.id === cid);
              return (
                <AnyvoCard key={cid} style={s.warnCard}>
                  <Text style={s.title}>{t('exam.conflictTitle')}</Text>
                  {exam ? <Text style={s.muted}>{rowTitle(exam)} · {dateLabel(exam.exam_date)}</Text> : null}
                  <Text style={s.text}>{t('exam.conflictBody')}</Text>
                  <AnyvoButton label={t('exam.conflictMine')} onPress={() => void resolve(cid, 'mine')} />
                  <AnyvoButton variant="secondary" label={t('exam.conflictOther')} onPress={() => void resolve(cid, 'other')} />
                </AnyvoCard>
              );
            })}
            <ExamOverview exams={exams} isPro={isPro} onUpgrade={() => router.push('/premium' as never)} />
            {exams.length === 0 ? (
              <AnyvoCard>
                <Text style={s.title}>{t('exam.emptyTitle')}</Text>
                <Text style={s.muted}>{t('exam.emptyBody')}</Text>
                <AnyvoButton label={t('exam.add')} icon="add" onPress={() => openEdit()} />
              </AnyvoCard>
            ) : (
              <ExamList exams={exams} pending={pending} onOpen={e => openEdit(e.id)} />
            )}
          </>}
      </ScrollView>
      <ExamShareSheet visible={shareOpen} onClose={() => setShareOpen(false)} ownerId={ownerId} dogId={dogId} dogName={dogName} />
    </SafeAreaView>
  );
}

function SharedExams({ dogId, dogName }: { dogId: string; dogName: string }) {
  const router = useRouter();
  const { t } = useT();
  const [state, setState] = useState<{ loading: boolean; exams: ExamResult[]; error: boolean }>({ loading: true, exams: [], error: false });
  const load = useCallback(async () => {
    setState(cur => ({ ...cur, loading: true }));
    const res = await listSharedExams(dogId);
    setState({ loading: false, exams: res.data ?? [], error: !!res.error });
  }, [dogId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <Header title={t('exam.bookTitle')} subtitle={dogName ? `${dogName} · ${t('exam.sharedReadOnly')}` : t('exam.sharedReadOnly')} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={state.loading} onRefresh={() => void load()} tintColor={C.trackPrimary} />}>
        {state.error ? <AnyvoCard><Text style={s.text}>{t('exam.loadFailed')}</Text><AnyvoButton label={t('connect.retry')} onPress={() => void load()} /></AnyvoCard>
          : !state.loading && state.exams.length === 0 ? <AnyvoCard><Text style={s.text}>{t('exam.sharedUnavailable')}</Text></AnyvoCard>
          : <>
            {/* Geteilte sehen den Verlauf unabhängig vom eigenen Abo: er gehört zur Freigabe. */}
            <ExamOverview exams={state.exams} isPro onUpgrade={() => undefined} />
            <ExamList exams={state.exams} pending={new Set()} />
            <Text style={s.muted}>{t('exam.attachmentsPrivate')}</Text>
          </>}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Bausteine ───────────────────────────────────────────────
function ExamOverview({ exams, isPro, onUpgrade }: { exams: ExamResult[]; isPro: boolean; onUpgrade: () => void }) {
  const { t } = useT();
  const progress = useMemo(() => examProgress(exams), [exams]);
  const charts = useMemo(() => EXAM_TYPES.map(def => ({ def, series: sectionSeries(exams, def.key) }))
    .filter(c => Object.values(c.series).some(points => points.length >= 2)), [exams]);
  const hasAnyPoints = exams.some(e => e.sections.some(sec => sec.points != null));
  return <>
    {progress.map(p => (
      <AnyvoCard key={p.typeKey} style={p.highestPassed ? s.okCard : undefined}>
        <Text style={s.title}>{p.highestPassed ? t('exam.passedLevel', { level: p.highestPassed.levelLabel }) : `${p.typeLabel} · ${t('exam.noPassYet')}`}</Text>
        <Text style={s.text}>{p.next ? t('exam.nextLevel', { level: p.next.levelLabel }) : t('exam.highestLevel')}</Text>
      </AnyvoCard>
    ))}
    {hasAnyPoints ? (
      isPro ? (
        charts.length > 0 ? charts.map(({ def, series }) => (
          <AnyvoCard key={def.key}>
            <Text style={s.title}>{`${t('exam.chartTitle')} · ${def.label}`}</Text>
            <ExamPointsChart series={series} labels={Object.fromEntries(def.sections.map(sec => [sec.key, sec.label]))} />
          </AnyvoCard>
        )) : <Text style={s.muted}>{t('exam.chartEmpty')}</Text>
      ) : (
        <TouchableOpacity accessibilityRole="button" onPress={onUpgrade} style={s.lockRow}>
          <Ionicons name="lock-closed-outline" size={16} color={C.trackTextSec} />
          <Text style={[s.muted, { flex: 1 }]}>{t('exam.chartLocked')}</Text>
          <Ionicons name="chevron-forward" size={16} color={C.trackTextMut} />
        </TouchableOpacity>
      )
    ) : null}
  </>;
}

function ExamList({ exams, pending, onOpen }: { exams: ExamResult[]; pending: Set<string>; onOpen?: (e: ExamResult) => void }) {
  const { t } = useT();
  return (
    <View style={s.list}>
      {exams.map((e, i) => {
        const points = e.total_points != null ? `${formatPoints(e.total_points)}${e.max_points != null ? `/${formatPoints(e.max_points)}` : ''}` : '';
        const result = e.passed === true ? t('exam.passed') : e.passed === false ? t('exam.no') : '';
        const label = [dateLabel(e.exam_date), rowTitle(e), points, e.rating ?? '', result].filter(Boolean).join(', ');
        const body = (
          <View style={[s.row, i > 0 && s.divider]}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{rowTitle(e)}</Text>
              <Text style={s.muted}>{[dateLabel(e.exam_date), e.club ?? e.location].filter(Boolean).join(' · ')}</Text>
              {pending.has(e.id) ? <Text style={s.pending}>{t('exam.pendingSync')}</Text> : null}
            </View>
            <View style={s.rowRight}>
              {points ? <Text style={s.points}>{points}</Text> : null}
              {e.rating ? <Text style={s.muted}>{e.rating}</Text> : null}
            </View>
            {e.passed === true ? <Ionicons name="checkmark-circle" size={20} color={C.trackPrimary} accessibilityElementsHidden />
              : e.passed === false ? <Ionicons name="close-circle-outline" size={20} color={C.trackDanger} accessibilityElementsHidden /> : null}
          </View>
        );
        return onOpen
          ? <TouchableOpacity key={e.id} accessibilityRole="button" accessibilityLabel={label} onPress={() => onOpen(e)}>{body}</TouchableOpacity>
          : <View key={e.id} accessible accessibilityLabel={label}>{body}</View>;
      })}
    </View>
  );
}

function Header({ title, subtitle, onBack, children }: { title: string; subtitle?: string; onBack: () => void; children?: React.ReactNode }) {
  const { t } = useT();
  return (
    <View style={s.header}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={onBack} style={s.iconBtn}>
        <Ionicons name="chevron-back" size={24} color={C.trackText} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" style={s.headerTitle}>{title}</Text>
        {subtitle ? <Text style={s.muted}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function IconButton({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={s.iconBtn} hitSlop={8}>
      <Ionicons name={icon} size={22} color={C.trackPrimary} />
    </TouchableOpacity>
  );
}

function rowTitle(e: ExamResult): string {
  const def = examTypeByKey(e.exam_type);
  return examDisplayName(def?.key ?? e.exam_type, e.exam_level, e.exam_type_label);
}

function dateLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return Number.isNaN(d.getTime()) ? isoDate : formatDate(d);
}

function formatPoints(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: C.trackBg },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, gap: 4 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: C.trackText },
  iconBtn:     { padding: 10, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  content:     { padding: 16, gap: 12, paddingBottom: 40 },
  title:       { fontSize: 16, fontWeight: '700', color: C.trackText },
  text:        { fontSize: 15, color: C.trackText },
  muted:       { fontSize: 13, color: C.trackTextSec },
  pending:     { fontSize: 12, color: C.trackWarning, marginTop: 2 },
  okCard:      { borderColor: C.trackPrimary, borderWidth: 1 },
  warnCard:    { borderColor: C.trackWarning, borderWidth: 1, gap: 8 },
  lockRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: C.trackCard, minHeight: 44 },
  list:        { backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, minHeight: 56 },
  divider:     { borderTopWidth: 1, borderTopColor: C.trackBorder },
  rowTitle:    { fontSize: 15, fontWeight: '600', color: C.trackText },
  rowRight:    { alignItems: 'flex-end' },
  points:      { fontSize: 15, fontWeight: '700', color: C.trackText },
});
