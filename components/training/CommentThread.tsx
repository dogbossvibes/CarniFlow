import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  useAudioRecorder, useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync, AudioModule, RecordingPresets,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';
import { useComments } from '@/hooks/useComments';
import { addComment } from '@/services/commentService';
import { uploadTrainingAudio, uploadTrainingVideo } from '@/services/storage';
import { queryClient } from '@/lib/queryClient';
import { notifyNewComment } from '@/lib/push';
import { signMediaUrl } from '@/lib/mediaUrl';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { tapHaptic } from '@/lib/haptics';
import type { NewComment, TrainingComment } from '@/types/comment';

const fmt =(s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const time = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };

function VideoBubble({ uri }: { uri: string }) {
  const signed = useSignedUrl(uri);
  const player = useVideoPlayer(signed, p => { p.loop = false; p.muted = true; });
  useEffect(() => { if (signed) player.replace(signed); }, [signed, player]);
  return <VideoView player={player} style={s.video} contentFit="cover" nativeControls allowsFullscreen />;
}

// Messenger-artiger Kommentar-Thread an einer Trainingseinheit (Trainer ↔ Kunde).
export function CommentThread({ unitId }: { unitId: string }) {
  const { session } = useSession();
  const uid = session?.user.id;
  const { comments, loading } = useComments(unitId);

  const [text, setText]       = useState('');
  const [busy, setBusy]       = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRec, setIsRec] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const localRef = useRef<string | null>(null);

  useEffect(() => {
    if (status.didJustFinish) { setPlayingId(null); cleanupLocal(); }
  }, [status.didJustFinish]);

  const cleanupLocal = () => {
    if (localRef.current) { FileSystem.deleteAsync(localRef.current, { idempotent: true }); localRef.current = null; }
  };
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['comments', unitId] });

  const send = async (c: NewComment) => {
    if (!uid) return;
    setBusy(true);
    const { error } = await addComment(unitId, uid, c);
    setBusy(false);
    if (error) { Alert.alert('Fehler', error.message ?? 'Senden fehlgeschlagen.'); return; }
    invalidate();
    notifyNewComment(unitId);   // best-effort Push an die Gegenseite
  };

  const sendText = () => {
    const b = text.trim();
    if (!b) return;
    setText(''); tapHaptic();
    send({ kind: 'text', body: b, media_url: null, duration: null });
  };

  const startRec = async () => {
    try {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      if (!granted) { Alert.alert('Mikrofon nötig', 'Bitte Mikrofon-Zugriff erlauben.'); return; }
      if (player.playing) player.pause();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRec(true); setRecSecs(0);
      recTimer.current = setInterval(() => setRecSecs(x => x + 1), 1000);
      tapHaptic();
    } catch { Alert.alert('Fehler', 'Aufnahme nicht gestartet.'); }
  };

  const stopRecAndSend = async () => {
    if (!isRec) return;
    if (recTimer.current) clearInterval(recTimer.current);
    const dur = fmt(recSecs);
    setIsRec(false);
    try {
      await recorder.stop();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      const uri = recorder.uri;
      if (!uri) return;
      setBusy(true);
      const url = await uploadTrainingAudio(uri);
      setBusy(false);
      await send({ kind: 'voice', body: null, media_url: url, duration: dur });
    } catch { setBusy(false); Alert.alert('Fehler', 'Sprachnachricht nicht gesendet.'); }
  };

  const pickVideo = async () => {
    // Android: System Photo Picker (kein READ_MEDIA nötig). iOS: bestehender Flow.
    if (Platform.OS !== 'android') {
      const { status: st } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (st !== 'granted') { Alert.alert('Zugriff verweigert', 'Bitte Video-Zugriff erlauben.'); return; }
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 0.7, videoMaxDuration: 120 });
    if (res.canceled) return;
    setBusy(true);
    try {
      const url = await uploadTrainingVideo(res.assets[0].uri);
      await send({ kind: 'video', body: null, media_url: url, duration: null });
    } catch { Alert.alert('Fehler', 'Video nicht gesendet.'); }
    finally { setBusy(false); }
  };

  const togglePlay = async (c: TrainingComment) => {
    if (!c.media_url) return;
    try {
      if (player.playing) player.pause();
      cleanupLocal();
      if (playingId === c.id) { setPlayingId(null); return; }
      setPlayingId(c.id);
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      const local = FileSystem.cacheDirectory + `c_${c.id}.m4a`;
      const r = await FileSystem.downloadAsync(await signMediaUrl(c.media_url), local);
      localRef.current = r.uri;
      player.replace({ uri: r.uri });
      player.play();
    } catch { setPlayingId(null); }
  };

  return (
    <View>
      <Text style={s.label}>NACHRICHTEN ({comments.length})</Text>

      {loading ? (
        <ActivityIndicator color={C.accent} style={{ marginVertical: 16 }} />
      ) : comments.length === 0 ? (
        <Text style={s.empty}>Noch keine Nachrichten. Schreib etwas zur Einheit.</Text>
      ) : (
        comments.map(c => {
          const mine = c.author_id === uid;
          return (
            <View key={c.id} style={[s.row, mine ? s.rowMine : s.rowOther]}>
              <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleOther]}>
                {c.kind === 'text' && (
                  <Text style={[s.text, mine && s.textMine]}>{c.body}</Text>
                )}
                {c.kind === 'voice' && (
                  <TouchableOpacity style={s.voice} onPress={() => togglePlay(c)} activeOpacity={0.8}>
                    <Ionicons name={playingId === c.id ? 'pause-circle' : 'play-circle'} size={28} color={mine ? C.accentText : C.accent} />
                    <Text style={[s.voiceDur, mine && s.textMine]}>{c.duration ?? 'Sprachnachricht'}</Text>
                  </TouchableOpacity>
                )}
                {c.kind === 'video' && c.media_url && <VideoBubble uri={c.media_url} />}
                <Text style={[s.time, mine && s.timeMine]}>{time(c.created_at)}</Text>
              </View>
            </View>
          );
        })
      )}

      {/* Composer */}
      <View style={s.composer}>
        {isRec ? (
          <View style={s.recRow}>
            <View style={s.recDot} />
            <Text style={s.recTxt}>Aufnahme … {fmt(recSecs)}</Text>
            <TouchableOpacity style={s.sendBtn} onPress={stopRecAndSend} activeOpacity={0.8}>
              <Ionicons name="send" size={18} color={C.accentText} />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TextInput
              style={s.input}
              placeholder="Nachricht schreiben…"
              placeholderTextColor={C.placeholder}
              value={text}
              onChangeText={setText}
              multiline
            />
            {text.trim().length > 0 ? (
              <TouchableOpacity style={s.sendBtn} onPress={sendText} disabled={busy} activeOpacity={0.8}>
                <Ionicons name="send" size={18} color={C.accentText} />
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={s.iconBtn} onPress={pickVideo} disabled={busy} activeOpacity={0.7}>
                  <Ionicons name="videocam" size={20} color={C.muted} />
                </TouchableOpacity>
                <TouchableOpacity style={s.iconBtn} onPress={startRec} disabled={busy} activeOpacity={0.7}>
                  <Ionicons name="mic" size={20} color={C.muted} />
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </View>
      {busy && !isRec ? <ActivityIndicator color={C.accent} style={{ marginTop: 8 }} /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 14, marginTop: 24 },
  empty: { fontSize: 13, color: C.subtle, marginBottom: 8 },

  row:      { flexDirection: 'row', marginBottom: 10 },
  rowMine:  { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  bubble:   { maxWidth: '82%', borderRadius: 18, padding: 12, gap: 4 },
  bubbleMine:  { backgroundColor: C.accent, borderTopRightRadius: 4 },
  bubbleOther: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderTopLeftRadius: 4 },
  text:     { fontSize: 15, color: C.white, lineHeight: 20 },
  textMine: { color: C.accentText },
  voice:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2, minWidth: 160 },
  voiceDur: { fontSize: 14, color: C.white, fontWeight: '600' },
  video:    { width: 220, height: 150, borderRadius: 12, backgroundColor: '#000' },
  time:     { fontSize: 10, color: C.muted, alignSelf: 'flex-end' },
  timeMine: { color: 'rgba(6,6,6,0.55)' },

  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 12, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 8 },
  input:    { flex: 1, color: C.white, fontSize: 15, paddingHorizontal: 8, paddingVertical: 8, maxHeight: 100 },
  iconBtn:  { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sendBtn:  { width: 40, height: 40, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  recRow:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8 },
  recDot:   { width: 10, height: 10, borderRadius: 5, backgroundColor: C.danger },
  recTxt:   { flex: 1, fontSize: 14, color: C.white, fontWeight: '600' },
});
