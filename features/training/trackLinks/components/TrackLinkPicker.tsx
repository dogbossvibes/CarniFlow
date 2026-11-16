import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { formatDate, formatDistance, formatTime } from '@/i18n/format';
import { getTrackHistory } from '@/features/tracking/services/trackHistoryService';
import type { TrackHistoryRow } from '@/features/tracking/utils/trackHistoryMerge';
import { preselectedTracks, trackCandidates, type TrackCandidate } from '../candidates';
import { loadTrackChoice, saveTrackChoice } from '../choice';
import { listLinksForUnit, trackLinksAvailable } from '../store';
import { refreshUnitLinks } from '../sync';

interface Props {
  ownerId: string; unitId: string; dogId: string | null;
  /** Trainingstag als JJJJ-MM-TT. */
  day: string | null;
  /** Bestehendes Training: keine Vorwahl, Serverstand nachladen. */
  editing: boolean;
  disabled?: boolean;
  /** Entwurf der Auswahl auf dem Gerät merken (Formular «Training erfassen»). */
  rememberChoice?: boolean;
  /** Aktuelle Auswahl; `null`, solange sie nicht sicher geladen ist. */
  onChange: (sessionIds: string[] | null, byUser: boolean) => void;
}

const MAX_OTHER_DAYS = 30;

/** «Fährten des Tages»: eine oder mehrere Fährten zu einem Training ankreuzen (#114). */
export function TrackLinkPicker({ ownerId, unitId, dogId, day, editing, disabled, rememberChoice, onChange }: Props) {
  const { t, locale } = useT();
  // Geladene Daten gelten nur für genau dieses Training; ein anderes Training sieht sie nie.
  const scope = `${ownerId}|${unitId}`;
  const [loaded, setLoaded] = useState<{ scope: string; rows: TrackHistoryRow[] } | null>(null);
  const rows = loaded?.scope === scope ? loaded.rows : null;
  const [linked, setLinked] = useState<string[]>([]);
  const [manual, setManual] = useState<string[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const notify = useRef(onChange);
  useEffect(() => { notify.current = onChange; });

  useEffect(() => {
    let cancelled = false;
    if (!trackLinksAvailable() || !ownerId || !unitId) return;
    (async () => {
      try {
        if (editing) await refreshUnitLinks(ownerId, unitId);
        const [history, links, stored] = await Promise.all([
          getTrackHistory(ownerId),
          listLinksForUnit(ownerId, unitId),
          rememberChoice ? loadTrackChoice(ownerId, unitId) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setLinked([...new Set(links.map(l => l.training_session_id))]);
        setManual(stored);
        setLoaded({ scope: `${ownerId}|${unitId}`, rows: history });
      } catch {
        // Nicht geladen: Auswahl bleibt `null`, bestehende Verknüpfungen bleiben unberührt.
      }
    })();
    return () => { cancelled = true; };
  }, [ownerId, unitId, editing, rememberChoice]);

  const shown = manual ?? linked;
  const ofDay = useMemo(() => rows ? trackCandidates(rows, { dogId, day, linkedSessionIds: shown }) : [], [rows, dogId, day, shown]);
  const selection = useMemo(() => rows == null ? null : manual ?? preselectedTracks(ofDay, { editing, linkedSessionIds: linked }),
    [rows, manual, ofDay, editing, linked]);
  const list = useMemo(() => {
    if (!rows || !showAll) return ofDay;
    const all = trackCandidates(rows, { dogId, day, linkedSessionIds: selection ?? shown, includeOtherDays: true });
    const keep = new Set(selection ?? []);
    const recent = all.filter(c => c.otherDay && !keep.has(c.sessionId)).slice(-MAX_OTHER_DAYS).map(c => c.sessionId);
    const visible = new Set([...recent, ...keep, ...all.filter(c => !c.otherDay).map(c => c.sessionId)]);
    return all.filter(c => visible.has(c.sessionId)).reverse();
  }, [rows, showAll, ofDay, dogId, day, selection, shown]);

  const selectionKey = selection == null ? null : [...selection].sort().join('|');
  const byUser = useRef(false);
  useEffect(() => {
    notify.current(selection, byUser.current);
    byUser.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur bei geänderter Auswahl melden
  }, [selectionKey]);

  if (!trackLinksAvailable() || !rows || !dogId) return null;
  const hasOtherTracks = rows.some(r => r.dog_id === dogId);
  if (!list.length && !hasOtherTracks) return null;

  const toggle = (sessionId: string) => {
    if (disabled || selection == null) return;
    const next = selection.includes(sessionId) ? selection.filter(id => id !== sessionId) : [...selection, sessionId];
    byUser.current = true;
    setManual(next);
    if (rememberChoice) void saveTrackChoice(ownerId, unitId, next);
  };

  const describe = (c: TrackCandidate) => {
    const start = c.startedAt ? new Date(c.startedAt) : null;
    const valid = !!start && !Number.isNaN(start.getTime());
    const when = valid ? (c.otherDay ? `${formatDate(start!, undefined, locale)} · ${formatTime(start!, undefined, locale)}` : formatTime(start!, undefined, locale)) : t('trackLink.trackFallback');
    const title = c.distanceMeters != null ? `${when} · ${formatDistance(c.distanceMeters, locale)}` : when;
    const meta = [
      c.corners != null ? (c.corners === 1 ? t('trackLink.cornerOne') : t('trackLink.corners', { count: c.corners })) : null,
      c.lyingMinutes != null ? t('trackLink.lyingTime', { minutes: c.lyingMinutes }) : null,
      c.pendingSync ? t('trackLink.pendingSync') : null,
    ].filter(Boolean).join(' · ');
    return { title, meta };
  };

  return (
    <View style={s.wrap}>
      <Text style={s.title} accessibilityRole="header">{t('trackLink.pickerTitle')}</Text>
      <Text style={s.help}>{list.length ? t('trackLink.pickerHelp') : t('trackLink.noneThatDay')}</Text>
      {list.map(c => {
        const on = !!selection?.includes(c.sessionId);
        const { title, meta } = describe(c);
        return (
          <TouchableOpacity key={c.sessionId} style={[s.row, on && s.rowOn]} onPress={() => toggle(c.sessionId)} disabled={disabled}
            activeOpacity={0.8} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: !!disabled }}
            accessibilityLabel={meta ? `${title}, ${meta}` : title}>
            <View style={[s.box, on && s.boxOn]}>{on && <Ionicons name="checkmark" size={16} color={C.accentText} />}</View>
            <View style={s.rowText}>
              <Text style={s.rowTitle}>{title}</Text>
              {!!meta && <Text style={s.rowMeta}>{meta}</Text>}
            </View>
          </TouchableOpacity>
        );
      })}
      {hasOtherTracks && (
        <TouchableOpacity style={s.more} onPress={() => setShowAll(v => !v)} accessibilityRole="button" accessibilityState={{ expanded: showAll }}>
          <Text style={s.moreText}>{t(showAll ? 'trackLink.onlyThatDay' : 'trackLink.otherDay')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 22 },
  title: { color: C.white, fontSize: 19, fontWeight: '700' },
  help: { color: C.textMuted, fontSize: 15, lineHeight: 22, marginTop: 6, marginBottom: 10 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
  rowOn: { borderColor: C.accent, backgroundColor: C.accentDim },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: C.textMuted, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: C.accent, borderColor: C.accent },
  rowText: { flex: 1 },
  rowTitle: { color: C.white, fontSize: 15, fontWeight: '600' },
  rowMeta: { color: C.textMuted, fontSize: 13, marginTop: 2 },
  more: { minHeight: 44, justifyContent: 'center' },
  moreText: { color: C.accent, fontSize: 15, fontWeight: '600' },
});
