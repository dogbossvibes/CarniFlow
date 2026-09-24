import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { TrackingMap, type MapMarker } from '@/features/tracking/components/TrackingMap';
import { buildTrackDetailMap } from '@/features/tracking/utils/trackDetailMap';
import { getTrackSessionById } from '@/features/tracking/services/trackService';
import { ReviewSections } from '@/features/track-sharing/ReviewSections';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addTrackFeedback, deleteTrackFeedback, getSharedTrack, listTrackFeedback, updateTrackFeedback, type TrackFeedback } from '@/services/trackShareService';
import { supabase } from '@/lib/supabase';

export default function SharedTrackDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [track, setTrack] = useState<any | null>(null);
  const [share, setShare] = useState<any | null>(null);
  const [feedback, setFeedback] = useState<TrackFeedback[]>([]);
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => {
    if (!id) return;
    const [{ data: shared }, { data }] = await Promise.all([getSharedTrack(String(id)), getTrackSessionById(String(id))]);
    const { data: user } = await supabase.auth.getUser();
    setUid(user.user?.id ?? null); setShare(shared);
    setTrack(shared && data ? { ...data, dog: shared.track.dog, owner_name: shared.track.owner_name } : null);
    if (shared) { const result = await listTrackFeedback(shared.id); setFeedback((result.data as TrackFeedback[] | null) ?? []); }
    setLoading(false);
  })(); }, [id]);
  const map = useMemo(() => {
    if (!track) return null;
    const detail = buildTrackDetailMap(track);
    const markers: MapMarker[] = detail.markers.map(m => ({ id: m.id, type: m.type, lat: m.lat, lng: m.lng, angleKind: m.angleKind, material: m.material, distanceFromStart: m.distanceFromStart, note: m.note, objectIndex: m.objectIndex, legIndex: m.legIndex }));
    return { ...detail, markers, fitPoints: [...detail.lay, ...detail.run, ...detail.markers.filter(m => m.lat != null && m.lng != null).map(m => ({ lat: m.lat as number, lng: m.lng as number }))] };
  }, [track]);
  const send = async () => { if (!share || !uid || !body.trim()) return; if (editingId) await updateTrackFeedback(editingId, { body }); else await addTrackFeedback(share.id, uid, body); setBody(''); setEditingId(null); const result = await listTrackFeedback(share.id); setFeedback((result.data as TrackFeedback[] | null) ?? []); };
  if (loading) return <View style={s.center}><ActivityIndicator color={C.accent} /></View>;
  if (!share || !track) return <View style={s.center}><Text style={s.muted}>Diese Fährte ist nicht mehr freigegeben.</Text></View>;
  return <SafeAreaView style={s.safe}><KeyboardAvoidingView style={s.safe} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={s.header}><Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Zurück"><Ionicons name="chevron-back" size={24} color={C.white} /></Pressable><Text style={s.title}>Geteilte Fährte</Text><View style={{ width: 24 }} /></View>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.eyebrow}>{track.dog?.name ?? 'Hund'} · {track.session_date ?? ''}</Text>
      <Text style={s.hero}>{track.distance_meters != null ? `${Math.round(track.distance_meters)} m` : 'Fährte'}</Text>
      {map?.hasLay && <View style={s.map}><TrackingMap layPoints={map.lay} runPoints={map.run} markers={map.markers} segments={track.track_data?.segments ?? []} startAnchor={map.start} endPoint={map.end} fitToPoints={map.fitPoints} currentPosition={null} showUserLocation={false} follow={false} mapType="hybrid" /></View>}
      <ReviewSections track={track} />
      <Text style={s.section}>Trainerfeedback</Text>
      <View style={s.card}>{feedback.map(item => <View key={item.id} style={s.feedback}><View style={s.meta}><Text style={s.author}>{item.author_user_id === uid ? 'Du' : track.owner_name ?? 'Besitzer'}</Text><Text style={s.muted}>{new Date(item.created_at).toLocaleDateString()}</Text></View><Text style={s.line}>{item.body}</Text>{item.reaction && <Text style={{ fontSize: 18 }}>{item.reaction}</Text>}{item.author_user_id === uid && <View style={s.actions}><Pressable onPress={() => { setEditingId(item.id); setBody(item.body); }}><Text style={s.action}>Bearbeiten</Text></Pressable><Pressable onPress={async () => { await deleteTrackFeedback(item.id); setFeedback(prev => prev.filter(x => x.id !== item.id)); }}><Text style={s.action}>Löschen</Text></Pressable>{(['👍', '✅', '👀', '💡'] as const).map(reaction => <Pressable key={reaction} accessibilityLabel={`Reaktion ${reaction}`} onPress={async () => { await updateTrackFeedback(item.id, { reaction: item.reaction === reaction ? null : reaction }); const result = await listTrackFeedback(share.id); setFeedback((result.data as TrackFeedback[] | null) ?? []); }}><Text style={s.action}>{reaction}</Text></Pressable>)}</View>}</View>)}<TextInput value={body} onChangeText={setBody} multiline accessibilityLabel="Feedback schreiben" placeholder="Feedback schreiben…" placeholderTextColor={C.muted} style={s.input} /><Pressable onPress={send} disabled={!body.trim()} style={[s.send, !body.trim() && { opacity: .45 }]} accessibilityRole="button" accessibilityLabel="Feedback senden"><Text style={s.sendText}>{editingId ? 'Feedback aktualisieren' : 'Feedback senden'}</Text></Pressable></View>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }, muted: { color: C.muted, fontSize: 14 },
  header: { padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: C.border }, title: { flex: 1, textAlign: 'center', color: C.white, fontSize: 20, fontWeight: '900' },
  content: { padding: 18, gap: 14 }, eyebrow: { color: C.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1 }, hero: { color: C.white, fontSize: 30, fontWeight: '900' }, map: { height: 240, overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: C.border }, card: { gap: 10, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: C.border, backgroundColor: C.card }, section: { color: C.white, fontSize: 16, fontWeight: '900' }, line: { color: C.muted, fontSize: 13, lineHeight: 19 }, feedback: { gap: 6, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border }, meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }, author: { color: C.white, fontWeight: '800' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, action: { color: C.accent, fontWeight: '800', fontSize: 12, minHeight: 44, paddingVertical: 12 }, input: { minHeight: 64, color: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 10, textAlignVertical: 'top' }, send: { minHeight: 44, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }, sendText: { color: C.accentText, fontWeight: '900' },
});
