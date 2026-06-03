import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Glass, GlassIconButton, isGlass } from '@/components/ui/Glass';
import { SignedImage } from '@/components/ui/SignedImage';
import { ZoomableImage } from '@/components/ui/ZoomableImage';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { signMediaUrl } from '@/lib/mediaUrl';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { HeroImage } from '@/components/training/HeroImage';
import { CommentThread } from '@/components/training/CommentThread';
import { disciplineColor } from '@/constants/disciplines';
import { getTrainingUnitById, deleteTrainingUnit, setUnitShared } from '@/services/trainingUnitService';
import { queryClient } from '@/lib/queryClient';
import { tapHaptic } from '@/lib/haptics';
import type { TrainingUnit, AudioFile } from '@/types/trainingUnit';

function DetailVideo({ uri }: { uri: string }) {
  const signed = useSignedUrl(uri);
  const player = useVideoPlayer(signed, p => { p.loop = false; p.muted = true; });
  useEffect(() => { if (signed) player.replace(signed); }, [signed, player]);
  return <VideoView player={player} style={s.video} contentFit="cover" nativeControls allowsFullscreen />;
}

// Read-only Audio-Wiedergabe. Datei wird lokal geladen (Supabase-CDN ohne
// Range-Support), dann via expo-audio abgespielt — gleiches Muster wie AudioRecorder.
function AudioMemos({ files }: { files: AudioFile[] }) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const localRef = useRef<string | null>(null);

  useEffect(() => {
    if (status.didJustFinish) {
      setPlayingIdx(null);
      if (localRef.current) { FileSystem.deleteAsync(localRef.current, { idempotent: true }); localRef.current = null; }
    }
  }, [status.didJustFinish]);

  const toggle = async (idx: number) => {
    try {
      if (player.playing) player.pause();
      if (localRef.current) { FileSystem.deleteAsync(localRef.current, { idempotent: true }); localRef.current = null; }
      if (playingIdx === idx) { setPlayingIdx(null); return; }
      setPlayingIdx(idx);
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      const localUri = FileSystem.cacheDirectory + `memo_${idx}_${Date.now()}.mp4`;
      const result   = await FileSystem.downloadAsync(await signMediaUrl(files[idx].url), localUri);
      if (result.status !== 200) throw new Error('Download fehlgeschlagen');
      localRef.current = result.uri;
      player.replace({ uri: result.uri });
      player.play();
    } catch (e: any) {
      setPlayingIdx(null);
      Alert.alert('Fehler', 'Abspielen nicht möglich: ' + (e?.message ?? ''));
    }
  };

  return (
    <>
      {files.map((a, i) => (
        <View key={`${a.url}-${i}`} style={[s.audioRow, isGlass && s.cardGlass]}>{isGlass && <Glass style={s.glassBg} />}
          <TouchableOpacity style={s.audioIcon} onPress={() => toggle(i)} activeOpacity={0.7}>
            <Ionicons name={playingIdx === i ? 'pause' : 'play'} size={16} color={C.accent} />
          </TouchableOpacity>
          <View style={s.flex}>
            <Text style={s.audioTitle}>Sprachnotiz {i + 1}</Text>
            {a.transcript ? <Text style={s.audioTranscript}>{a.transcript}</Text> : null}
          </View>
          <Text style={s.audioDur}>{a.duration}</Text>
        </View>
      ))}
    </>
  );
}

function formatDate(d: string): string {
  const [y, mo, day] = d.split('-');
  return y && mo && day ? `${day}.${mo}.${y}` : d;
}
function formatDur(sec: number | null): string {
  if (!sec) return '—';
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export default function UnitDetailScreen() {
  const router = useRouter();
  const { id, readonly, clientName } = useLocalSearchParams<{ id: string; readonly?: string; clientName?: string }>();
  const isReadOnly = readonly === '1';   // Trainer-Sicht auf eine Kunden-Einheit
  const [unit, setUnit]       = useState<TrainingUnit | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);   // Foto-Vollbild

  useEffect(() => {
    (async () => {
      if (!id) { setLoading(false); return; }
      const { data } = await getTrainingUnitById(id);
      setUnit((data as TrainingUnit) ?? null);
      setLoading(false);
    })();
  }, [id]);

  const toggleShare = async (value: boolean) => {
    if (!unit) return;
    setUnit({ ...unit, shared_with_trainer: value });   // optimistisch
    const { error } = await setUnitShared(unit.id, value);
    if (error) { setUnit({ ...unit, shared_with_trainer: !value }); Alert.alert('Fehler', error.message); return; }
    queryClient.invalidateQueries({ queryKey: ['clientActivity'] });
    queryClient.invalidateQueries({ queryKey: ['trainingFeed'] });
  };

  const handleDelete = () => {
    tapHaptic();
    Alert.alert('Einheit löschen?', 'Diese Aktion kann nicht rückgängig gemacht werden.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen', style: 'destructive',
        onPress: async () => {
          if (!id) return;
          const { error } = await deleteTrainingUnit(id);
          if (error) { Alert.alert('Fehler', error.message); return; }
          queryClient.invalidateQueries({ queryKey: ['trainingFeed'] });
          router.back();
        },
      },
    ]);
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={C.accent} size="large" /></View>;
  }
  if (!unit) {
    return (
      <SafeAreaView style={s.center}>
        <Text style={s.missing}>Einheit nicht gefunden</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.link}>Zurück</Text></TouchableOpacity>
      </SafeAreaView>
    );
  }

  const exercises = unit.exercises ?? [];

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <HeroImage height={260} overlay={0.96} contentPosition="top">
          <SafeAreaView edges={['top']} style={s.heroSafe}>
            <View style={s.heroText}>
              <Text style={s.eyebrow}>{isReadOnly ? `GETEILTE EINHEIT · ${formatDate(unit.session_date)}` : formatDate(unit.session_date)}</Text>
              <Text style={s.heroTitle}>{unit.dog?.name ?? 'Einheit'}</Text>
              {isReadOnly && clientName ? <Text style={s.heroClient}>👤 {clientName}</Text> : null}
            </View>
          </SafeAreaView>
        </HeroImage>

        <View style={s.body}>
          <View style={s.statsRow}>
            <View style={[s.statCard, isGlass && s.cardGlass]}>{isGlass && <Glass style={s.glassBg} />}
              <Text style={s.statVal}>{formatDur(unit.duration_sec)}</Text>
              <Text style={s.statLabel}>DAUER</Text>
            </View>
            <View style={[s.statCard, isGlass && s.cardGlass]}>{isGlass && <Glass style={s.glassBg} />}
              <Text style={s.statVal}>{exercises.length}</Text>
              <Text style={s.statLabel}>ÜBUNGEN</Text>
            </View>
            <View style={[s.statCard, isGlass && s.cardGlass]}>{isGlass && <Glass style={s.glassBg} />}
              <Text style={s.statVal}>
                {unit.score != null ? `${unit.score}/10` : unit.rating != null ? `${unit.rating}/5` : '—'}
              </Text>
              <Text style={s.statLabel}>BEWERTUNG</Text>
            </View>
          </View>

          {/* Datenschutz: mit Trainer teilen (nur Owner) */}
          {!isReadOnly && (
          <View style={[s.shareRow, isGlass && s.cardGlass]}>{isGlass && <Glass style={s.glassBg} />}
            <Ionicons name="share-social-outline" size={18} color={unit.shared_with_trainer ? C.accent : C.muted} />
            <View style={s.flex}>
              <Text style={s.shareTitle}>Mit Trainer teilen</Text>
              <Text style={s.shareSub}>Verbundene Trainer sehen diese Einheit</Text>
            </View>
            <Switch
              value={unit.shared_with_trainer}
              onValueChange={toggleShare}
              trackColor={{ false: C.cardAlt, true: C.accent }}
              thumbColor={C.white}
            />
          </View>
          )}

          <Text style={s.label}>ÜBUNGEN</Text>
          {exercises.map((ex, i) => (
            <View key={ex.id ?? i} style={[s.exRow, isGlass && s.cardGlass]}>{isGlass && <Glass style={s.glassBg} />}
              <View style={[s.exDot, { backgroundColor: disciplineColor(ex.discipline) }]} />
              <View style={s.flex}>
                <Text style={s.exName}>{ex.exercise_name}</Text>
                <Text style={s.exDisc}>{ex.discipline}</Text>
              </View>
              {ex.rating != null && (
                <View style={s.exStars}>
                  <Ionicons name="star" size={12} color={C.star} />
                  <Text style={s.exRating}>{ex.rating}</Text>
                </View>
              )}
            </View>
          ))}

          {unit.notes ? (
            <>
              <Text style={s.label}>NOTIZEN</Text>
              <View style={[s.notesBox, isGlass && s.cardGlass]}>{isGlass && <Glass style={s.glassBg} />}<Text style={s.notesTxt}>{unit.notes}</Text></View>
            </>
          ) : null}

          {/* Fotos */}
          {unit.photos?.length > 0 && (
            <>
              <Text style={s.label}>FOTOS</Text>
              <View style={s.photoGrid}>
                {unit.photos.map(url => (
                  <TouchableOpacity key={url} onPress={() => { tapHaptic(); setPreview(url); }} activeOpacity={0.85}>
                    <SignedImage url={url} style={s.photo} contentFit="cover" transition={200} />
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Videos */}
          {unit.videos?.length > 0 && (
            <>
              <Text style={s.label}>VIDEOS</Text>
              <View style={{ gap: 10 }}>
                {unit.videos.map(url => <DetailVideo key={url} uri={url} />)}
              </View>
            </>
          )}

          {/* Sprachmemos */}
          {unit.audio_files?.length > 0 && (
            <>
              <Text style={s.label}>SPRACHMEMOS</Text>
              <AudioMemos files={unit.audio_files} />
            </>
          )}

          {/* Kommentare / Nachrichten (Trainer ↔ Kunde) */}
          {id ? <CommentThread unitId={id} /> : null}

          {!isReadOnly && (
            <>
              <TouchableOpacity style={s.editBtn} onPress={() => { tapHaptic(); router.push({ pathname: '/unit/document', params: { id: id! } }); }} activeOpacity={0.8}>
                <Ionicons name="create-outline" size={18} color={C.accentText} />
                <Text style={s.editTxt}>Bearbeiten</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.deleteBtn} onPress={handleDelete} activeOpacity={0.8}>
                <Ionicons name="trash-outline" size={18} color={C.danger} />
                <Text style={s.deleteTxt}>Einheit löschen</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={{ height: 40 }} />
        </View>
      </ScrollView>

      <SafeAreaView edges={['top']} style={s.backWrap} pointerEvents="box-none">
        <GlassIconButton onPress={() => router.back()} size={38} radius={12} style={{ marginTop: 4 }}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </GlassIconButton>
      </SafeAreaView>

      {/* Foto-Vollbild mit Pinch-Zoom */}
      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <GestureHandlerRootView style={s.lightbox}>
          {preview && <ZoomableImage url={preview} onClose={() => setPreview(null)} />}
          <SafeAreaView edges={['top']} style={s.lightboxClose} pointerEvents="box-none">
            <GlassIconButton onPress={() => setPreview(null)} size={38} radius={12} style={{ marginTop: 4 }}>
              <Ionicons name="close" size={24} color={C.white} />
            </GlassIconButton>
          </SafeAreaView>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  flex:   { flex: 1 },
  scroll: { paddingBottom: 0 },
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 10 },
  missing:{ color: C.muted, fontSize: 15 },
  link:   { color: C.accent, fontSize: 14, fontWeight: '700' },

  heroSafe: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 20, paddingBottom: 22 },
  heroText: { gap: 4 },
  eyebrow:  { fontSize: 12, color: C.accent, fontWeight: '800', letterSpacing: 1 },
  heroTitle:{ fontSize: 30, color: C.white, fontWeight: '900', letterSpacing: -0.6 },
  heroClient:{ fontSize: 14, color: '#CFCFCF', fontWeight: '600', marginTop: 4 },

  body: { paddingHorizontal: 20, marginTop: 4 },

  statsRow:  { flexDirection: 'row', gap: 10, marginTop: 8 },
  statCard:  { flex: 1, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingVertical: 18, alignItems: 'center', gap: 6 },
  cardGlass: { backgroundColor: 'transparent', overflow: 'hidden' },
  glassBg:   { ...StyleSheet.absoluteFillObject },
  statVal:   { fontSize: 20, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  statLabel: { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 1 },

  label: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 12, marginTop: 24 },

  exRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 8 },
  exDot:    { width: 9, height: 9, borderRadius: 4.5 },
  exName:   { fontSize: 15, color: C.white, fontWeight: '700' },
  exDisc:   { fontSize: 12, color: C.muted, fontWeight: '500', marginTop: 1 },
  exStars:  { flexDirection: 'row', alignItems: 'center', gap: 3 },
  exRating: { fontSize: 12, color: C.star, fontWeight: '700' },

  notesBox: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14 },
  notesTxt: { fontSize: 14, color: '#CFCFCF', lineHeight: 20 },

  shareRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12, marginTop: 16 },
  shareTitle: { fontSize: 14, color: C.white, fontWeight: '700' },
  shareSub:   { fontSize: 12, color: C.muted, marginTop: 2 },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo:     { width: 104, height: 104, borderRadius: 14, backgroundColor: C.card },
  video:     { width: '100%', height: 200, borderRadius: 14, backgroundColor: '#000' },

  audioRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  audioIcon:       { width: 34, height: 34, borderRadius: 10, backgroundColor: `${C.accent}1A`, alignItems: 'center', justifyContent: 'center' },
  audioTitle:      { fontSize: 14, color: C.white, fontWeight: '700' },
  audioTranscript: { fontSize: 12, color: C.muted, marginTop: 2 },
  audioDur:        { fontSize: 12, color: C.muted, fontWeight: '600' },

  editBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28, height: 52, borderRadius: 16, backgroundColor: C.accent },
  editTxt:   { fontSize: 15, color: C.accentText, fontWeight: '800' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 14, borderRadius: 16, borderWidth: 1, borderColor: C.dangerDim, backgroundColor: C.dangerDim },
  deleteTxt: { fontSize: 14, color: C.danger, fontWeight: '700' },

  backWrap:{ position: 'absolute', top: 0, left: 20, right: 20 },

  lightbox:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
  lightboxClose: { position: 'absolute', top: 0, left: 20, right: 20 },
});
