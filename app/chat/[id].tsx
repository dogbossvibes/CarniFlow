import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import {
  useAudioRecorder, useAudioPlayer, setAudioModeAsync, AudioModule, RecordingPresets,
} from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import { C } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';
import { useProfile } from '@/hooks/useProfile';
import { uploadAudio, uploadVideo } from '@/services/mediaService';
import { signMediaUrl } from '@/lib/mediaUrl';
import { getThread, markThreadRead, sendMessage, subscribeThread } from '@/services/messageService';
import { tapHaptic } from '@/lib/haptics';
import type { Message } from '@/types/message';

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function ChatThreadScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const { session } = useSession();
  const { profile } = useProfile();
  const meId = session?.user.id;

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading]   = useState(true);
  const [text, setText]         = useState('');
  const [sending, setSending]   = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds]   = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const recorder  = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const senderName = profile?.trainer_name ?? profile?.full_name ?? 'Jemand';

  const load = useCallback(async () => {
    if (!meId || !id) return;
    const t = await getThread(meId, id);
    setMessages(t);
    setLoading(false);
    markThreadRead(meId, id);
  }, [meId, id]);

  useEffect(() => { load(); }, [load]);

  // Realtime: eingehende Nachrichten anhängen.
  useEffect(() => {
    if (!meId || !id) return;
    const unsub = subscribeThread(meId, id, m => {
      setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
      markThreadRead(meId, id);
    });
    return unsub;
  }, [meId, id]);

  const push = (m: Message) => setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);

  const doSend = async (payload: { body?: string; audioUrl?: string; videoUrl?: string }) => {
    if (!meId || !id) return;
    setSending(true);
    const { data, error } = await sendMessage({ senderId: meId, recipientId: id, senderName, ...payload });
    setSending(false);
    if (error || !data) { Alert.alert('Fehler', error ?? 'Senden fehlgeschlagen.'); return; }
    push(data);
  };

  const sendText = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    await doSend({ body: t });
  };

  // ── Sprachnachricht ──
  const startRec = async () => {
    try {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      if (!granted) { Alert.alert('Mikrofon nötig 🎙️', 'Bitte Mikrofon-Zugriff erlauben.'); return; }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true); setSeconds(0);
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } catch { Alert.alert('Ups', 'Aufnahme konnte nicht gestartet werden.'); }
  };
  const stopRec = async () => {
    if (!recording) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    try {
      await recorder.stop();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      const uri = recorder.uri;
      if (!uri) return;
      setSending(true);
      const { url } = await uploadAudio(uri);
      await doSend({ audioUrl: url });
    } catch { Alert.alert('Ups', 'Sprachnachricht konnte nicht gesendet werden.'); }
    finally { setSending(false); }
  };

  // ── Video-Feedback ──
  const pickVideo = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Zugriff nötig', 'Bitte Mediathek-Zugriff erlauben.'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 0.7, videoMaxDuration: 120 });
      if (res.canceled || !res.assets[0]) return;
      setSending(true);
      const { url } = await uploadVideo(res.assets[0].uri);
      await doSend({ videoUrl: url });
    } catch { Alert.alert('Ups', 'Video konnte nicht gesendet werden.'); }
    finally { setSending(false); }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={22} color={C.white} /></TouchableOpacity>
        <Text style={s.headerName} numberOfLines={1}>{name || 'Chat'}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        {loading ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={s.thread}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 && (
              <Text style={s.emptyTxt}>Noch keine Nachrichten. Schreib die erste!</Text>
            )}
            {messages.map(m => (
              <Bubble key={m.id} m={m} mine={m.sender_id === meId} />
            ))}
          </ScrollView>
        )}

        <View style={s.inputBar}>
          {recording ? (
            <View style={s.recRow}>
              <View style={s.recDot} />
              <Text style={s.recTxt}>Aufnahme… {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</Text>
              <TouchableOpacity style={s.recStop} onPress={stopRec} activeOpacity={0.85}>
                <Ionicons name="stop" size={18} color={C.accentText} />
                <Text style={s.recStopTxt}>Senden</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TouchableOpacity style={s.iconBtn} onPress={pickVideo} disabled={sending} hitSlop={6}>
                <Ionicons name="videocam-outline" size={22} color={C.muted} />
              </TouchableOpacity>
              <TouchableOpacity style={s.iconBtn} onPress={() => { tapHaptic(); startRec(); }} disabled={sending} hitSlop={6}>
                <Ionicons name="mic-outline" size={22} color={C.accent} />
              </TouchableOpacity>
              <TextInput
                style={s.input} value={text} onChangeText={setText}
                placeholder="Nachricht…" placeholderTextColor={C.subtle} multiline
              />
              <TouchableOpacity style={[s.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]} onPress={sendText} disabled={!text.trim() || sending}>
                {sending ? <ActivityIndicator color={C.accentText} size="small" /> : <Ionicons name="arrow-up" size={20} color={C.accentText} />}
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ m, mine }: { m: Message; mine: boolean }) {
  return (
    <View style={[s.bubbleWrap, mine ? s.wrapMine : s.wrapOther]}>
      <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleOther]}>
        {m.body ? <Text style={[s.bubbleTxt, mine && { color: C.accentText }]}>{m.body}</Text> : null}
        {m.audio_url ? <AudioBubble url={m.audio_url} mine={mine} /> : null}
        {m.video_url ? <VideoBubble url={m.video_url} /> : null}
        <Text style={[s.bubbleTime, mine ? { color: 'rgba(6,6,6,0.5)' } : { color: C.subtle }]}>{fmtTime(m.created_at)}</Text>
      </View>
    </View>
  );
}

function AudioBubble({ url, mine }: { url: string; mine: boolean }) {
  const player = useAudioPlayer(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const localRef = useRef<string | null>(null);

  const toggle = async () => {
    try {
      if (playing) { player.pause(); setPlaying(false); return; }
      setBusy(true);
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      if (!localRef.current) {
        const remote = await signMediaUrl(url);
        const local  = FileSystem.cacheDirectory + `chat_audio_${Date.now()}.mp4`;
        const res    = await FileSystem.downloadAsync(remote, local);
        if (res.status !== 200) throw new Error('download');
        localRef.current = res.uri;
        player.replace({ uri: res.uri });
      }
      player.play();
      setPlaying(true);
    } catch { Alert.alert('Ups', 'Abspielen fehlgeschlagen.'); }
    finally { setBusy(false); }
  };

  return (
    <TouchableOpacity style={s.audioRow} onPress={toggle} activeOpacity={0.8}>
      <View style={[s.audioBtn, mine && { backgroundColor: 'rgba(6,6,6,0.15)' }]}>
        {busy ? <ActivityIndicator size="small" color={mine ? C.accentText : C.accent} />
          : <Ionicons name={playing ? 'pause' : 'play'} size={16} color={mine ? C.accentText : C.accent} />}
      </View>
      <Ionicons name="mic" size={15} color={mine ? C.accentText : C.muted} />
      <Text style={[s.audioTxt, mine && { color: C.accentText }]}>Sprachnachricht</Text>
    </TouchableOpacity>
  );
}

function VideoBubble({ url }: { url: string }) {
  const player = useVideoPlayer(null, p => { p.loop = false; });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let on = true;
    signMediaUrl(url).then(u => { if (on) { player.replace({ uri: u }); setReady(true); } });
    return () => { on = false; };
  }, [url, player]);

  if (!ready) return <View style={s.videoLoading}><ActivityIndicator color={C.accent} /></View>;
  return <VideoView player={player} style={s.video} nativeControls contentFit="cover" />;
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  back:    { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  headerName: { flex: 1, fontSize: 18, color: C.white, fontWeight: '800' },

  thread:  { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 8 },
  emptyTxt:{ fontSize: 13, color: C.subtle, textAlign: 'center', marginTop: 40 },

  bubbleWrap: { maxWidth: '82%' },
  wrapMine:   { alignSelf: 'flex-end' },
  wrapOther:  { alignSelf: 'flex-start' },
  bubble:     { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: C.accent, borderBottomRightRadius: 6 },
  bubbleOther:{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderBottomLeftRadius: 6 },
  bubbleTxt:  { fontSize: 15, color: C.white, lineHeight: 21 },
  bubbleTime: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },

  audioRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  audioBtn:  { width: 32, height: 32, borderRadius: 16, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  audioTxt:  { fontSize: 14, color: C.white, fontWeight: '600' },

  video:        { width: 220, height: 150, borderRadius: 12, backgroundColor: '#000' },
  videoLoading: { width: 220, height: 150, borderRadius: 12, backgroundColor: C.cardAlt, alignItems: 'center', justifyContent: 'center' },

  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg },
  iconBtn:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  input:    { flex: 1, maxHeight: 120, backgroundColor: C.input, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, color: C.white, fontSize: 15 },
  sendBtn:  { width: 40, height: 40, borderRadius: 20, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },

  recRow:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  recDot:   { width: 10, height: 10, borderRadius: 5, backgroundColor: C.danger },
  recTxt:   { flex: 1, fontSize: 14, color: C.white, fontWeight: '600' },
  recStop:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.accent, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 9 },
  recStopTxt: { fontSize: 14, color: C.accentText, fontWeight: '800' },
});
