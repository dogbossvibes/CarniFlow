import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { useDogTrackColor } from '@/features/tracking/hooks/useDogTrackColor';
import { useDogActiveFaehrte } from '@/features/tracking/hooks/useActiveFaehrte';
import { TrackColorPicker } from '@/components/dogs/TrackColorPicker';
import { type TrackOverlayColorKey } from '@/features/tracking/utils/trackOverlayColors';
import { updateDog } from '@/services/dogs';
import { getDogRecoveryTracks, type DogRecoveryTrack } from '@/features/tracking/services/dogTrackRecoveryService';
import { getTrackSessionById } from '@/features/tracking/services/trackService';
import { hasFinalSearchRun } from '@/features/tracking/store/trackRecovery';
import { TrackResumeCta } from './TrackResumeCta';
import { ActiveFaehrteCard } from './ActiveFaehrteCard';
import { reopenTarget } from '@/features/tracking/store/activeFaehrtenModel';

/** Always reachable in this dog's profile; reads local history even after a deliberate cancel removed the registry entry. */
export function DogTrackingPanel({ userId, dogId, dogName, lastTrackId }: { userId: string; dogId: string; dogName: string; lastTrackId?: string | null }) {
  const { t, locale } = useT();
  const router = useRouter();
  const active = useDogActiveFaehrte(dogId);
  const { dog, color, colorKey, storedKey, loading: colorLoading, refresh } = useDogTrackColor(dogId);
  const [colorOpen, setColorOpen] = useState(false);
  const [showTracks, setShowTracks] = useState(false);
  const [savingColor, setSavingColor] = useState(false);
  const savingRef = useRef(false);
  const [tracks, setTracks] = useState<DogRecoveryTrack[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [remoteResult, setRemoteResult] = useState<{ id: string; scope: string; final: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const scope = `${userId}:${dogId}:${revision}`;
  const [loadedScope, setLoadedScope] = useState('');
  const remoteFinal = remoteResult?.id === selected && remoteResult?.scope === scope ? remoteResult.final : null;
  const supported = !!dog && Object.prototype.hasOwnProperty.call(dog, 'track_overlay_color_key');
  useFocusEffect(useCallback(() => {
    let alive = true;
    setLoading(true); setFailed(false); setTracks([]); setSelected(null); setRemoteResult(null);
    if (!userId) { setLoading(false); return; }
    getDogRecoveryTracks(userId, dogId).then(rows => {
      if (!alive) return;
      setTracks(rows); setSelected(rows[0]?.id ?? null); setLoadedScope(scope);
    }).catch(() => { if (alive) setFailed(true); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId, dogId, scope]));
  useFocusEffect(useCallback(() => {
    const token = ++generation.current;
    setRemoteResult(null);
    if (!selected || loadedScope !== scope) return;
    getTrackSessionById(selected).then(({ data }) => {
      if (token !== generation.current) return;
      const own = data?.id === selected && data?.dog_id === dogId && data?.owner_id === userId;
      setRemoteResult({ id: selected, scope, final: own ? hasFinalSearchRun(data) : false });
    }).catch(() => { if (token === generation.current) setRemoteResult({ id: selected, scope, final: false }); });
    return () => { generation.current++; };
  }, [selected, loadedScope, scope, dogId, userId]));
  const saveColor = async (next: TrackOverlayColorKey | null) => {
    if (!supported || savingRef.current) return;
    savingRef.current = true; setSavingColor(true);
    try {
      const result = await updateDog(dogId, { track_overlay_color_key: next });
      if (result.error) throw result.error;
      await refresh();
    } catch { Alert.alert(t('dog.trackColor.title'), t('dog.saveErrorPlain')); }
    finally { savingRef.current = false; setSavingColor(false); }
  };
  const dateLabel = (date: string | null) => {
    const stamp = Date.parse(date ?? '');
    return Number.isFinite(stamp) ? new Date(stamp).toLocaleDateString(locale === 'gsw' ? 'de-CH' : locale, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  };
  return <View style={s.panel} testID="dog-tracking-panel">
    <View style={s.header}><Ionicons name="footsteps-outline" size={21} color={color} /><Text style={s.title}>{t('track.profile.title')}</Text></View>
    <TouchableOpacity testID="dog-track-color-toggle" style={s.colorRow} onPress={() => setColorOpen(v => !v)} accessibilityRole="button" accessibilityState={{ expanded: colorOpen }}>
      <View style={[s.stripe, { backgroundColor: color }]} />
      <Text style={s.text}>{t('dog.trackColor.title')}{colorKey ? ` · ${t(`dog.trackColor.${colorKey}`)}` : ''}</Text>
      <Ionicons name={colorOpen ? 'chevron-up' : 'chevron-down'} size={18} color={C.trackTextMut} />
    </TouchableOpacity>
    {colorOpen && <View style={{ gap: 10, paddingBottom: 12 }}>
      {colorLoading ? <ActivityIndicator color={color} /> : <>
        {!supported && <Text style={s.hint}>{t('dog.trackColor.unavailable')}</Text>}
        <TrackColorPicker dogId={dogId} value={storedKey} onChange={saveColor} disabled={!supported || savingColor} />
        {savingColor && <ActivityIndicator color={color} />}
      </>}
    </View>}
    {active ? <ActiveFaehrteCard entry={active} dogName={dogName} onOpen={() => router.push(reopenTarget(active) as never)} /> : <>
      {loading ? <ActivityIndicator color={color} /> : failed ? <TouchableOpacity onPress={() => setRevision(v => v + 1)} accessibilityRole="button" style={s.link}><Text style={s.hint}>{t('track.profile.retry')}</Text></TouchableOpacity> : null}
      {loadedScope === scope && tracks.length > 0 && <>
        <Text style={s.hint}>{t('track.profile.saved')}</Text>
        {tracks.length > 1 && <TouchableOpacity testID="dog-recovery-choose" style={s.link} onPress={() => setShowTracks(v => !v)} accessibilityRole="button" accessibilityState={{ expanded: showTracks }}><Text style={s.linkText}>{t('track.profile.choose')} ({tracks.length})</Text><Ionicons name={showTracks ? 'chevron-up' : 'chevron-down'} size={16} color={C.trackPrimary} /></TouchableOpacity>}
        {(showTracks ? tracks : tracks.filter(track => track.id === selected)).map(track => <TouchableOpacity testID={`dog-recovery-track-${track.id}`} key={track.id} onPress={() => { setSelected(track.id); setShowTracks(false); }} accessibilityRole="radio" accessibilityState={{ selected: selected === track.id }} style={[s.savedRow, selected === track.id && s.selected]}>
          <Text style={s.text}>{dateLabel(track.date)} · {t(track.cancelled ? 'track.profile.cancelled' : 'track.profile.open')}</Text>
          {selected === track.id && <Ionicons name="checkmark" size={18} color={color} />}
        </TouchableOpacity>)}
        {selected && (remoteFinal == null ? <ActivityIndicator color={color} /> : remoteFinal ? <Text style={s.hint}>{t('track.profile.finished')}</Text> : <TrackResumeCta key={`${scope}:${selected}:${revision}`} sessionId={selected} dogId={dogId} userId={userId} hasRemoteSearchRun={remoteFinal} showUnavailable />)}
        {selected && <TouchableOpacity style={s.link} onPress={() => router.push(`/track/${selected}` as never)} accessibilityRole="button"><Text style={s.linkText}>{t('track.profile.details')}</Text><Ionicons name="chevron-forward" size={16} color={C.trackPrimary} /></TouchableOpacity>}
      </>}
      {!loading && loadedScope === scope && tracks.length === 0 && <Text style={s.hint}>{t('track.profile.noOpen')}</Text>}
    </>}
    {lastTrackId && <TouchableOpacity style={s.link} onPress={() => router.push(`/track/${lastTrackId}` as never)} accessibilityRole="button"><Text style={s.linkText}>{t('track.preview.open')}</Text><Ionicons name="chevron-forward" size={16} color={C.trackPrimary} /></TouchableOpacity>}
  </View>;
}
const s = StyleSheet.create({
  panel: { borderWidth: 1, borderColor: C.trackBorder, borderRadius: 20, backgroundColor: C.trackCard, padding: 16, marginBottom: 14, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 }, title: { color: C.trackText, fontSize: 17, fontWeight: '800' },
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }, stripe: { width: 5, height: 28, borderRadius: 3 },
  text: { flex: 1, color: C.trackText, fontSize: 13 }, hint: { color: C.trackTextSec, fontSize: 12, lineHeight: 18 },
  savedRow: { flexDirection: 'row', alignItems: 'center', padding: 12, minHeight: 48, gap: 8, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder },
  selected: { borderColor: C.trackPrimary }, link: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, linkText: { color: C.trackPrimary, fontSize: 13, fontWeight: '700', flexShrink: 1 },
});
