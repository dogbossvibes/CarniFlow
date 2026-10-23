import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, AppState, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { useDogs } from '@/hooks/useDogs';
import { ServerTrainingFocusList, useServerTrainingFocuses } from '@/components/training/ServerTrainingFocusList';
import { TrainingFocusList } from '@/components/training/TrainingFocusList';
import { readTrainingFocuses, type TrainingFocus } from '@/features/training/documentation/focus';
import { useTrainingFeed } from '@/hooks/useTrainingFeed';
import { DISCIPLINES, disciplineColor } from '@/constants/disciplines';
import type { FeedItem } from '@/services/trainingFeed';
import { deleteFeedItem } from '@/services/deleteTraining';
import { AnyvoSwipeRow, type AnyvoSwipeAction } from '@/components/ui/AnyvoSwipeRow';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import {
  filterFeed, groupFeed, summarize, paginate, hasMore, disciplinesOf,
  itemDiscipline, itemDogName, itemHasMedia, itemNotePreview,
  type JournalPeriod, type JournalGroup,
} from '@/features/training/journal';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const discIcon = (label: string): IconName => (DISCIPLINES.find(d => d.label === label)?.icon as IconName) ?? 'paw';

const PERIODS: JournalPeriod[] = ['all', '7d', '30d', 'year'];
const PERIOD_KEY: Record<JournalPeriod, 'journal.period.all' | 'journal.period.7d' | 'journal.period.30d' | 'journal.period.year'> = {
  all: 'journal.period.all', '7d': 'journal.period.7d', '30d': 'journal.period.30d', year: 'journal.period.year',
};

const intlLocale = (l: string) => (l === 'fr' ? 'fr-CH' : l === 'it' ? 'it-CH' : l === 'en' ? 'en-GB' : 'de-CH');

// Zentrales Trainingstagebuch — spartenübergreifende Historie ALLER dokumentierten
// Einheiten. Datenquelle: useTrainingFeed (training_units + training_sessions +
// GPS-Fährten), bereits vereinheitlicht + completed-only. Keine eigene DB.
export default function TrainingJournalScreen() {
  const router = useRouter();
  const { t, locale } = useT();
  const { dogId: paramDogId } = useLocalSearchParams<{ dogId?: string }>();
  const { dogs } = useDogs();
  const { feed, loading, refresh, ownerId, error: feedError } = useTrainingFeed();   // voller Feed, Filter clientseitig

  const [dogFilter, setDogFilter] = useState<string | null>(paramDogId ?? null);
  const [discFilter, setDiscFilter] = useState<string | null>(null);
  const [period, setPeriod] = useState<JournalPeriod>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [focusData, setFocusData] = useState<{ owner: string; items: TrainingFocus[] }>({ owner: '', items: [] });
  const [focusRevision, setFocusRevision] = useState(0);
  const serverFocuses = useServerTrainingFocuses(ownerId, undefined, undefined, focusRevision);
  const focusLabels = new Map(DISCIPLINES.map(d => [`system:${d.key}`, d.label]));
  for (const item of feed) for (const exercise of item.exercises ?? []) if (exercise.discipline_key) focusLabels.set(exercise.discipline_key, exercise.discipline);
  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    readTrainingFocuses(ownerId).then(items => { if (!cancelled) setFocusData({ owner: ownerId, items }); }).catch(() => {});
    return () => { cancelled = true; };
  }, [ownerId, focusRevision, feed]);
  const currentFocuses = focusData.owner === ownerId ? focusData.items : [];
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const year = new Date().getFullYear();
  const summary = useMemo(() => summarize(feed, year), [feed, year]);
  const disciplines = useMemo(() => disciplinesOf(feed), [feed]);

  const filtered = useMemo(
    () => filterFeed(feed, { dogId: dogFilter, discipline: discFilter, period, query }),
    [feed, dogFilter, discFilter, period, query],
  );
  const windowed = useMemo(() => paginate(filtered, page), [filtered, page]);
  const groups = useMemo(() => groupFeed(windowed), [windowed]);
  const filtersActive = dogFilter !== null || discFilter !== null || period !== 'all' || query.trim() !== '';

  const resetFilters = () => { setDogFilter(null); setDiscFilter(null); setPeriod('all'); setQuery(''); setPage(1); };

  const onRefresh = async () => { setRefreshing(true); try { await refresh(); } finally { setRefreshing(false); } };

  // The stack keeps this screen mounted. Query window-focus refresh is disabled
  // in React Native, so navigation back and resume must re-read the shared feed.
  // Keep cached rows and filters visible while fetching; use the query's error UI
  // on failure and do not cancel a request shared with another feed consumer.
  useFocusEffect(useCallback(() => {
    if (!ownerId) return;
    void refresh({ cancelRefetch: false });
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh({ cancelRefetch: false });
    });
    return () => subscription.remove();
  }, [ownerId, refresh]));

  const openDetail = (it: FeedItem) => {
    if      (it.source === 'unit')  router.push({ pathname: '/unit/detail', params: { id: it.id } });
    else if (it.source === 'track') router.push(`/track/${it.id}` as never);
    else                            router.push(`/training/${it.id}` as never);
  };

  // ANYVO Gesture UX v1 — Training rollout (30.09.2026). Same routes the
  // detail screens' own existing edit affordances already use — no new
  // edit flow: app/unit/detail.tsx's own "Bearbeiten" button navigates to
  // /unit/document for a 'unit' entry; app/training/[id].tsx (the legacy
  // 'session' detail screen) already reads an `edit` search param
  // (useLocalSearchParams<{ id: string; edit?: string }>()) to open
  // directly in its existing inline edit mode. Never called for 'track'
  // entries (Tracking domain, out of scope for this patch).
  const openEdit = (it: FeedItem) => {
    if (it.source === 'unit') router.push({ pathname: '/unit/document', params: { id: it.id } } as never);
    else router.push({ pathname: '/training/[id]', params: { id: it.id, edit: 'true' } } as never);
  };

  // ANYVO Gesture UX v1 — Training rollout (30.09.2026). Wraps the exact
  // same confirm-then-delete mechanics already used by confirmDeleteTrack
  // just below (same Alert.alert pattern, same deleteFeedItem service, same
  // refresh()) — only for non-track (unit/session) entries. Returns a real
  // Promise<void> (resolving only once the user has actually decided, and
  // rejecting only on a genuine delete failure) so AnyvoSwipeRow's own
  // already-hardened async handling (components/ui/AnyvoSwipeRow.tsx,
  // 30.09.2026) can meaningfully govern this action's pending/retry/
  // no-unhandled-rejection behavior end-to-end — not just the network call
  // in isolation. User-facing error feedback stays this handler's own
  // responsibility (Alert.alert), exactly as AnyvoSwipeRow's contract
  // requires; AnyvoSwipeRow only additionally reports the same failure via
  // captureError for telemetry.
  const confirmDeleteTraining = useCallback((it: FeedItem): Promise<void> => new Promise<void>((resolve, reject) => {
    Alert.alert(t('training.deleteTitle'), t('training.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel', onPress: () => resolve() },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          const { error } = await deleteFeedItem(it);   // RLS: nur eigene Einträge
          if (error) {
            Alert.alert(t('journal.deleteTrainingError'));
            reject(new Error(error));
            return;
          }
          await refresh();                              // Feed aktualisieren (kein App-Reload)
          resolve();
        },
      },
    ], { cancelable: true, onDismiss: () => resolve() });
  }), [t, refresh]);

  // Fährteneintrag löschen: bestätigen → über die bestehende vereinheitlichte
  // Delete-Fassade (deleteFeedItem; löscht die Fährten-Session inkl. FK-Cascade auf
  // Punkte/Marker/Runs) löschen → Feed neu laden. Nicht optimistisch: der Eintrag
  // bleibt sichtbar, bis das Löschen bestätigt ist; bei Fehler bleibt er erhalten.
  const confirmDeleteTrack = useCallback((it: FeedItem) => {
    Alert.alert(t('journal.deleteTrackTitle'), t('journal.deleteTrackBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          setDeletingId(it.id);
          const { error } = await deleteFeedItem(it);   // RLS: nur eigene Einträge
          if (error) {
            setDeletingId(null);
            Alert.alert(t('journal.deleteError'));
            return;                                      // Eintrag bleibt sichtbar
          }
          await refresh();                               // Feed aktualisieren (kein App-Reload)
          setDeletingId(null);
        },
      },
    ]);
  }, [t, refresh]);

  const groupLabel = (g: JournalGroup): string => {
    if (g.kind === 'today')     return t('journal.group.today');
    if (g.kind === 'yesterday') return t('journal.group.yesterday');
    if (g.kind === 'week')      return t('journal.group.week');
    const d = new Date(g.refDate);
    const s = d.toLocaleDateString(intlLocale(locale), { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const fmtMinutes = (min: number): string =>
    min >= 60 ? t('journal.hoursShort', { count: Math.round(min / 60) }) : t('journal.minutesShort', { count: min });

  const dogName = (id: string) => dogs.find(d => d.id === id)?.name ?? '';

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Top-Bar */}
        <View style={s.bar}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <Ionicons name="chevron-back" size={20} color={C.trackText} />
          </TouchableOpacity>
          <Text style={s.barTitle} numberOfLines={1}>{t('journal.title')}</Text>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/analyse/insights' as never)} hitSlop={8}
            accessibilityRole="button" accessibilityLabel={t('journal.openAnalysis')}>
            <Ionicons name="sparkles-outline" size={17} color={C.trackPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag"
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.trackPrimary} />}
        >
          <Text style={s.subtitle}>{t('journal.subtitle')}</Text>

          {ownerId && <ServerTrainingFocusList key={`${ownerId}:${dogFilter}:${discFilter}`} ownerId={ownerId} {...serverFocuses}
            rows={serverFocuses.rows.filter(f => (!dogFilter || f.dog_id === dogFilter) && (!discFilter || focusLabels.get(f.discipline_key) === discFilter))}
            dogNames={Object.fromEntries(dogs.map(d => [d.id, d.name]))}
            onRetry={() => setFocusRevision(v => v + 1)} onOpenSource={unitId => router.push({ pathname: '/unit/detail', params: { id: unitId } })} />}
          {ownerId && <TrainingFocusList collapsedByDefault key={`${ownerId}:${dogFilter}:${discFilter}`} ownerId={ownerId}
            dogId={dogFilter} discipline={discFilter}
            dogNames={Object.fromEntries(dogs.map(d => [d.id, d.name]))}
            availableUnitIds={feedError ? undefined : new Set(feed.filter(it => it.source === 'unit').map(it => it.id))}
            onOpenSource={unitId => router.push({ pathname: '/unit/detail', params: { id: unitId } })}
            onChange={() => setFocusRevision(v => v + 1)} />}
          {/* Zusammenfassung „Dieses Jahr" */}
          <View style={s.summaryCard}>
            <Text style={s.summaryEyebrow}>{t('journal.thisYear')}</Text>
            <View style={s.summaryRow}>
              <Stat value={String(summary.trainings)} label={t('journal.statTrainings')} />
              <View style={s.statDiv} />
              <Stat value={fmtMinutes(summary.totalMinutes)} label={t('journal.statTime')} />
              <View style={s.statDiv} />
              <Stat value={String(summary.dogCount)} label={t('journal.statDogs')} />
              <View style={s.statDiv} />
              <Stat value={String(summary.disciplineCount)} label={t('journal.statDisciplines')} />
            </View>
          </View>

          {/* Suche */}
          <View style={s.searchRow}>
            <Ionicons name="search" size={16} color={C.trackTextMut} />
            <TextInput
              value={query}
              onChangeText={(v) => { setQuery(v); setPage(1); }}
              placeholder={t('journal.search')}
              placeholderTextColor={C.trackTextMut}
              style={s.searchInput}
              returnKeyType="search"
              accessibilityLabel={t('journal.search')}
            />
            {query ? (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.close')}>
                <Ionicons name="close-circle" size={16} color={C.trackTextMut} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Zeitraum-Segment */}
          <View style={s.seg}>
            {PERIODS.map(p => {
              const on = period === p;
              return (
                <TouchableOpacity key={p} style={[s.segBtn, on && s.segBtnOn]} onPress={() => { setPeriod(p); setPage(1); }} activeOpacity={0.85}
                  accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${t('journal.filterPeriod')}: ${t(PERIOD_KEY[p])}`}>
                  <Text style={[s.segTxt, on && s.segTxtOn]}>{t(PERIOD_KEY[p])}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Hund-Filter */}
          {dogs.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
              <FilterChip label={t('journal.allDogs')} active={dogFilter === null} onPress={() => { setDogFilter(null); setPage(1); }} />
              {dogs.map(d => (
                <FilterChip key={d.id} label={d.name} active={dogFilter === d.id} onPress={() => { setDogFilter(d.id); setPage(1); }} />
              ))}
            </ScrollView>
          ) : null}

          {/* Sparten-Filter */}
          {disciplines.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
              <FilterChip label={t('journal.allDisciplines')} active={discFilter === null} onPress={() => { setDiscFilter(null); setPage(1); }} />
              {disciplines.map(d => (
                <FilterChip key={d} label={d} active={discFilter === d} dotColor={disciplineColor(d)} onPress={() => { setDiscFilter(d); setPage(1); }} />
              ))}
            </ScrollView>
          ) : null}

          {/* Aktive Filter zurücksetzen */}
          {filtersActive ? (
            <TouchableOpacity style={s.resetRow} onPress={resetFilters} activeOpacity={0.85}
              accessibilityRole="button" accessibilityLabel={t('journal.resetFilters')}>
              <Ionicons name="close-circle-outline" size={15} color={C.trackTextSec} />
              <Text style={s.resetTxt}>{t('journal.resetFilters')}</Text>
            </TouchableOpacity>
          ) : null}

          {feedError && <TouchableOpacity onPress={onRefresh} style={s.loadMore} accessibilityRole="button"><Text style={s.cardNote}>{t('trainingDoc.historyError')}</Text></TouchableOpacity>}
          {/* Inhalt */}
          {loading && feed.length === 0 ? (
            <ActivityIndicator color={C.trackPrimary} style={{ marginTop: 40 }} />
          ) : feed.length === 0 && feedError ? null : feed.length === 0 ? (
            <EmptyState
              icon="book-outline"
              title={t('journal.emptyTitle')}
              text={t('journal.emptyText')}
              ctaLabel={t('journal.emptyCta')}
              onCta={() => router.push('/unit/start' as never)}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="filter-outline"
              title={t('journal.noMatchTitle')}
              ctaLabel={t('journal.resetFilters')}
              onCta={resetFilters}
            />
          ) : (
            <>
              <Text style={s.cardNote} accessibilityLiveRegion="polite">{t('journal.entryCount', { shown: windowed.length, total: filtered.length })}</Text>
              {groups.map(g => (
                <View key={g.key} style={{ marginTop: 8 }}>
                  <Text style={s.groupLabel}>{groupLabel(g)}</Text>
                  <View style={{ gap: 10 }}>
                    {g.items.map(it => (
                      <JournalCard
                        key={`${it.source}-${it.id}`}
                        item={it}
                        focus={it.source === 'unit' ? (serverFocuses.rows.find(f => f.source_unit_id === it.id && f.status !== 'done')?.text ?? currentFocuses.find(f => f.originUnitId === it.id && f.status !== 'done')?.text) : undefined}
                        dogName={itemDogName(it) ?? dogName(it.dog_id)}
                        localeTag={intlLocale(locale)}
                        minutesLabel={(min) => t('journal.minutesShort', { count: min })}
                        pointsLabel={(pts) => t('dog.pointsShort', { points: pts })}
                        mediaLabel={t('journal.media')}
                        onPress={() => openDetail(it)}
                        onDelete={it.source === 'track' ? () => confirmDeleteTrack(it) : () => confirmDeleteTraining(it)}
                        deleting={deletingId === it.id}
                        deleteLabel={it.source === 'track' ? t('journal.deleteTrackA11y') : t('training.deleteA11y')}
                        onEdit={it.source === 'track' ? undefined : () => openEdit(it)}
                      />
                    ))}
                  </View>
                </View>
              ))}

              {hasMore(filtered.length, page) ? (
                <TouchableOpacity style={s.loadMore} onPress={() => setPage(p => p + 1)} activeOpacity={0.85}
                  accessibilityRole="button" accessibilityLabel={t('journal.loadMore')}>
                  <Text style={s.loadMoreTxt}>{t('journal.loadMore')}</Text>
                  <Ionicons name="chevron-down" size={16} color={C.trackPrimary} />
                </TouchableOpacity>
              ) : null}
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ── Teilkomponenten ──────────────────────────────────────────────────────────
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statV} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.statL} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function FilterChip({ label, active, onPress, dotColor }: { label: string; active: boolean; onPress: () => void; dotColor?: string }) {
  return (
    <TouchableOpacity style={[s.chip, active && s.chipOn]} onPress={onPress} activeOpacity={0.85}
      accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={label}>
      {dotColor ? <View style={[s.dot, { backgroundColor: dotColor }]} /> : null}
      <Text style={[s.chipTxt, active && s.chipTxtOn]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function EmptyState({ icon, title, text, ctaLabel, onCta }: { icon: IconName; title: string; text?: string; ctaLabel: string; onCta: () => void }) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}><Ionicons name={icon} size={26} color={C.trackPrimary} /></View>
      <Text style={s.emptyTitle}>{title}</Text>
      {text ? <Text style={s.emptyText}>{text}</Text> : null}
      <TouchableOpacity style={s.emptyCta} onPress={onCta} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={ctaLabel}>
        <Text style={s.emptyCtaTxt}>{ctaLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ANYVO Gesture UX v1 — Training rollout (30.09.2026). Row-type is decided
// exclusively by item.source, never by which props happen to be passed:
// - 'track' (GPS-Fährten) → the exact, byte-identical legacy row this
//   component had before this patch (plain TouchableOpacity + the existing
//   inline trash-icon button). Tracking domain, explicitly out of scope —
//   nothing about it changes.
// - 'unit'/'session' (real training entries) → migrated to the shared
//   AnyvoSwipeRow (components/ui/AnyvoSwipeRow.tsx), the exact same
//   already-hardened primitive the dog-command pilot (062347b/ffb332b)
//   uses. TAP still opens the exact same existing detail flow (onPress,
//   unchanged). SWIPE left reveals Bearbeiten/Löschen, calling the exact
//   same pre-existing onEdit/onDelete handlers the screen provides above —
//   no second edit/delete implementation. LONG PRESS opens the same
//   Öffnen/Bearbeiten/Löschen action-sheet pattern as
//   app/dog-command/[id].tsx's pilot. "Wiederholen"/"Teilen" are
//   deliberately NOT offered — audited and confirmed to have no existing,
//   tested handler reachable from a FeedItem at this level (see the
//   accompanying rollout report).
function JournalCard({
  item, dogName, localeTag, minutesLabel, pointsLabel, mediaLabel, onPress,
  onDelete, deleting, deleteLabel, onEdit, editLabel, focus,
}: {
  item: FeedItem;
  focus?: string;
  dogName: string;
  localeTag: string;
  minutesLabel: (min: number) => string;
  pointsLabel: (pts: number) => string;
  mediaLabel: string;
  onPress: () => void;
  // Legacy (track) inline delete button only. Ignored for training entries
  // — see onDelete's second role below.
  onDelete?: () => void;
  deleting?: boolean;
  deleteLabel?: string;
  // Only ever provided for non-track entries (see the call site above).
  onEdit?: () => void;
  editLabel?: string;
}) {
  const { t } = useT();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isTrack = item.source === 'track';

  const discipline = itemDiscipline(item);
  const accent = disciplineColor(discipline);
  const note = itemNotePreview(item);
  const media = itemHasMedia(item);
  const durationMin = item.duration_sec != null ? Math.round(item.duration_sec / 60) : null;
  const distance = item.distance_meters != null ? `${Math.round(item.distance_meters)} m` : null;
  const time = new Date(item.session_date).toLocaleDateString(localeTag, { day: '2-digit', month: 'short' });

  const meta = [dogName || null, durationMin != null ? minutesLabel(durationMin) : null, distance, time].filter(Boolean).join(' · ');
  const a11y = `${discipline}. ${meta}${item.rating != null ? `. ${pointsLabel(item.rating)}` : ''}${media ? `. ${mediaLabel}` : ''}`;

  const cardInner = (
    <>
      <View style={[s.cardIcon, { backgroundColor: `${accent}22`, borderColor: `${accent}55` }]}>
        <Ionicons name={discIcon(discipline)} size={17} color={accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.cardTitle} numberOfLines={1}>{isTrack ? discipline : disciplinesOf([item]).join(' · ')}</Text>
        <Text style={s.cardMeta} numberOfLines={1}>{meta}</Text>
        {item.source !== 'track' && item.exercises?.length ? <Text style={s.cardNote} numberOfLines={expanded ? undefined : 1}>
          {item.exercises.map(e => e.exercise_name).join(' · ')}
        </Text> : null}
        {note ? <Text style={s.cardNote} numberOfLines={expanded ? undefined : 1}>{note}</Text> : null}
        {focus ? <Text style={s.cardNote} numberOfLines={expanded ? undefined : 1}>{t('trainingDoc.nextFocus')}: {focus}</Text> : null}
        {!isTrack && onEdit && <TouchableOpacity testID="journal-visible-edit" onPress={onEdit} accessibilityRole="button"
          accessibilityLabel={t('common.edit')} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
          <Text style={s.cardNote}>{t('common.edit')}</Text>
        </TouchableOpacity>}
        {!isTrack && <TouchableOpacity onPress={() => setExpanded(v => !v)} style={{ minHeight: 44, justifyContent: 'center' }}
          accessibilityRole="button" accessibilityState={{ expanded }}>
          <Text style={s.cardNote}>{t(expanded ? 'trainingDoc.less' : 'trainingDoc.more')}</Text>
        </TouchableOpacity>}
      </View>
      <View style={s.cardRight}>
        {item.rating != null ? (
          <View style={s.pill}><Text style={s.pillTxt}>{pointsLabel(item.rating)}</Text></View>
        ) : null}
        {media ? <Ionicons name="images-outline" size={15} color={C.trackTextMut} accessibilityLabel={mediaLabel} /> : null}
        {isTrack && onDelete ? (
          deleting ? (
            <ActivityIndicator size="small" color={C.trackTextMut} style={s.cardDelete} />
          ) : (
            <TouchableOpacity
              style={s.cardDelete}
              onPress={onDelete}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={deleteLabel}
            >
              <Ionicons name="trash-outline" size={16} color={C.trackTextMut} />
            </TouchableOpacity>
          )
        ) : null}
        <Ionicons name="chevron-forward" size={16} color={C.trackTextMut} />
      </View>
    </>
  );

  if (isTrack) {
    // Legacy path — byte-identical to pre-Gesture-UX-v1 behavior.
    return (
      <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={a11y}>
        {cardInner}
      </TouchableOpacity>
    );
  }

  const actions: AnyvoSwipeAction[] = [
    ...(onEdit ? [{ key: 'edit', label: editLabel ?? t('common.edit'), icon: 'create-outline' as const, onPress: onEdit }] : []),
    ...(onDelete ? [{ key: 'delete', label: deleteLabel ?? t('common.delete'), icon: 'trash-outline' as const, destructive: true, onPress: onDelete }] : []),
  ];

  return (
    <>
      <AnyvoSwipeRow
        onPress={onPress}
        onLongPress={actions.length ? () => setActionsOpen(true) : undefined}
        rightActions={actions}
        accessibilityLabel={actions.length ? `${a11y}, lange drücken für Aktionen` : a11y}
      >
        <View style={s.card}>{cardInner}</View>
      </AnyvoSwipeRow>

      {/* Long-Press-Aktionsmenü — dasselbe Muster wie
          app/dog-command/[id].tsx's Pilot (ein Sheet pro Row). */}
      <AnyvoBottomSheet visible={actionsOpen} onClose={() => setActionsOpen(false)} title={discipline}>
        <View style={{ gap: 8, paddingBottom: 6 }}>
          <TouchableOpacity testID="journal-action-menu-open" style={s.menuAction} onPress={() => { setActionsOpen(false); onPress(); }} activeOpacity={0.85} accessibilityRole="button">
            <Ionicons name="open-outline" size={19} color={C.trackText} />
            <Text style={s.menuActionTxt}>{t('common.open')}</Text>
          </TouchableOpacity>
          {onEdit ? (
            <TouchableOpacity testID="journal-action-menu-edit" style={s.menuAction} onPress={() => { setActionsOpen(false); onEdit(); }} activeOpacity={0.85} accessibilityRole="button">
              <Ionicons name="create-outline" size={19} color={C.trackText} />
              <Text style={s.menuActionTxt}>{t('common.edit')}</Text>
            </TouchableOpacity>
          ) : null}
          {onDelete ? (
            <TouchableOpacity testID="journal-action-menu-delete" style={s.menuAction} onPress={() => { setActionsOpen(false); onDelete(); }} activeOpacity={0.85} accessibilityRole="button">
              <Ionicons name="trash-outline" size={19} color={C.trackDanger} />
              <Text style={[s.menuActionTxt, { color: C.trackDanger }]}>{t('common.delete')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </AnyvoBottomSheet>
    </>
  );
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.trackBg },
  bar:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12 },
  iconBtn:   { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, alignItems: 'center', justifyContent: 'center' },
  barTitle:  { flex: 1, fontSize: 16, color: C.trackText, fontWeight: '800', textAlign: 'center' },
  scroll:    { paddingHorizontal: 16, paddingBottom: 16, gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' },
  subtitle:  { fontSize: 13, color: C.trackTextSec, fontWeight: '500', marginTop: 2 },

  summaryCard:{ backgroundColor: C.trackCard, borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, padding: 16, marginTop: 4 },
  summaryEyebrow:{ fontSize: 10.5, color: C.trackTextMut, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 },
  summaryRow:{ flexDirection: 'row', alignItems: 'center' },
  stat:      { flex: 1, alignItems: 'center', gap: 3 },
  statV:     { fontSize: 19, color: C.trackText, fontWeight: '900', letterSpacing: -0.4 },
  statL:     { fontSize: 10, color: C.trackTextMut, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  statDiv:   { width: 1, height: 30, backgroundColor: C.trackBorder },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 13, paddingVertical: 10 },
  searchInput:{ flex: 1, fontSize: 15, color: C.trackText, padding: 0 },

  seg:       { flexDirection: 'row', gap: 6, backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, padding: 4 },
  segBtn:    { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 9 },
  segBtnOn:  { backgroundColor: C.trackPrimary },
  segTxt:    { fontSize: 13, color: C.trackTextSec, fontWeight: '700' },
  segTxtOn:  { color: '#04201b', fontWeight: '800' },

  chipRow:   { gap: 8, paddingVertical: 2, paddingRight: 8 },
  chip:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard },
  chipOn:    { backgroundColor: C.trackCardAlt, borderColor: C.trackPrimary },
  chipTxt:   { fontSize: 13, color: C.trackTextSec, fontWeight: '700', maxWidth: 160 },
  chipTxtOn: { color: C.trackText, fontWeight: '800' },
  dot:       { width: 8, height: 8, borderRadius: 4 },

  groupLabel:{ fontSize: 11, color: C.trackTextMut, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },

  card:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 13, paddingVertical: 12 },
  cardIcon:  { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14.5, color: C.trackText, fontWeight: '800' },
  cardMeta:  { fontSize: 12, color: C.trackTextSec, fontWeight: '600', marginTop: 2 },
  cardNote:  { fontSize: 12, color: C.trackTextMut, fontWeight: '500', marginTop: 2 },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardDelete:{ width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  menuAction:   { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, paddingHorizontal: 14, paddingVertical: 13 },
  menuActionTxt:{ fontSize: 14.5, color: C.trackText, fontWeight: '700' },
  pill:      { borderRadius: 9, borderWidth: 1, borderColor: C.accentMid, backgroundColor: C.accentDim, paddingHorizontal: 9, paddingVertical: 4 },
  pillTxt:   { fontSize: 12, color: C.trackPrimary, fontWeight: '800' },

  resetRow:  { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 4, paddingVertical: 2 },
  resetTxt:  { fontSize: 13, color: C.trackTextSec, fontWeight: '700' },
  loadMore:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, paddingVertical: 13, marginTop: 12 },
  loadMoreTxt:{ fontSize: 14, color: C.trackPrimary, fontWeight: '800' },

  empty:     { alignItems: 'center', gap: 8, paddingVertical: 40, paddingHorizontal: 20 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle:{ fontSize: 16, color: C.trackText, fontWeight: '800', textAlign: 'center' },
  emptyText: { fontSize: 13, color: C.trackTextSec, fontWeight: '500', textAlign: 'center', lineHeight: 18 },
  emptyCta:  { marginTop: 10, backgroundColor: C.trackPrimary, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12 },
  emptyCtaTxt:{ fontSize: 14, color: '#04201b', fontWeight: '800' },
});
