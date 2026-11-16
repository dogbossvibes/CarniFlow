import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { formatDate, formatDistance, formatTime } from '@/i18n/format';
import { getTrackHistory } from '@/features/tracking/services/trackHistoryService';
import type { TrackHistoryRow } from '@/features/tracking/utils/trackHistoryMerge';
import { applyTrackChoice } from '../apply';
import { listLinksForUnit, trackLinksAvailable } from '../store';
import { refreshUnitLinks } from '../sync';
import { TrackLinkPicker } from './TrackLinkPicker';

interface Props { ownerId: string; unitId: string; dogId: string | null; day: string | null }

/** Training-Detail: verknüpfte Fährten zeigen und die Zuordnung nachträglich ändern (#114). */
export function LinkedTracksCard({ ownerId, unitId, dogId, day }: Props) {
  const { t, locale } = useT();
  const router = useRouter();
  const [rows, setRows] = useState<TrackHistoryRow[] | null>(null);
  const [linked, setLinked] = useState<string[]>([]);
  const [changing, setChanging] = useState(false);

  const reload = useCallback(async () => {
    const links = await listLinksForUnit(ownerId, unitId).catch(() => []);
    setLinked([...new Set(links.map(l => l.training_session_id))]);
  }, [ownerId, unitId]);

  useEffect(() => {
    let cancelled = false;
    if (!trackLinksAvailable() || !ownerId || !unitId) return;
    (async () => {
      await refreshUnitLinks(ownerId, unitId);
      const history = await getTrackHistory(ownerId).catch(() => [] as TrackHistoryRow[]);
      if (cancelled) return;
      setRows(history);
      await reload();
    })();
    return () => { cancelled = true; };
  }, [ownerId, unitId, reload]);

  if (!trackLinksAvailable() || !rows) return null;
  // Ohne Fährten dieses Hundes und ohne Verknüpfung gibt es nichts zu zeigen.
  if (!linked.length && !rows.some(r => !!dogId && r.dog_id === dogId)) return null;
  const byId = new Map(rows.map(r => [r.id, r]));

  return (
    <View>
      <Text style={s.label}>{t('trackLink.linkedTracks').toUpperCase()}</Text>
      {!changing && !linked.length && <Text style={s.note}>{t('trackLink.noneLinked')}</Text>}
      {!changing && linked.map(sessionId => {
        const row = byId.get(sessionId);
        const startIso = row?.started_at ?? row?.created_at ?? null;
        const start = startIso ? new Date(startIso) : null;
        const when = start && !Number.isNaN(start.getTime())
          ? `${formatDate(start, undefined, locale)} · ${formatTime(start, undefined, locale)}` : t('trackLink.trackFallback');
        const title = typeof row?.distance_meters === 'number' ? `${when} · ${formatDistance(row.distance_meters, locale)}` : when;
        const meta = [
          typeof row?.corners_total === 'number' ? (row.corners_total === 1 ? t('trackLink.cornerOne') : t('trackLink.corners', { count: row.corners_total })) : null,
          typeof row?.lying_time_minutes === 'number' ? t('trackLink.lyingTime', { minutes: row.lying_time_minutes }) : null,
        ].filter(Boolean).join(' · ');
        return (
          <TouchableOpacity key={sessionId} style={s.row} activeOpacity={0.8} accessibilityRole="button"
            accessibilityLabel={`${t('trackLink.openTrack')}: ${title}`}
            onPress={() => router.push({ pathname: '/track/[id]', params: { id: sessionId } })}>
            <Ionicons name="trail-sign-outline" size={20} color={C.textMuted} />
            <View style={s.rowText}>
              <Text style={s.rowTitle}>{title}</Text>
              {!!meta && <Text style={s.rowMeta}>{meta}</Text>}
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
          </TouchableOpacity>
        );
      })}
      {changing && (
        <TrackLinkPicker ownerId={ownerId} unitId={unitId} dogId={dogId} day={day} editing
          onChange={(ids, byUser) => { if (byUser) void applyTrackChoice(ownerId, unitId, ids).then(reload); }} />
      )}
      <TouchableOpacity style={s.change} accessibilityRole="button" onPress={() => { setChanging(v => !v); void reload(); }}>
        <Text style={s.changeText}>{t(changing ? 'common.done' : linked.length ? 'trackLink.change' : 'trackLink.add')}</Text>
      </TouchableOpacity>
      <Text style={s.note}>{t('trackLink.keepsTrack')}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 10, color: C.textMuted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 12, marginTop: 24 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
  rowText: { flex: 1 },
  rowTitle: { color: C.white, fontSize: 15, fontWeight: '600' },
  rowMeta: { color: C.textMuted, fontSize: 13, marginTop: 2 },
  change: { minHeight: 44, justifyContent: 'center' },
  changeText: { color: C.accent, fontSize: 15, fontWeight: '600' },
  note: { color: C.textMuted, fontSize: 13, lineHeight: 19 },
});
