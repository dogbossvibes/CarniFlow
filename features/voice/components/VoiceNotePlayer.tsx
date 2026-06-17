import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { C } from '@/constants/colors';
import { formatDuration } from '@/features/voice/services/voiceRecordingService';
import { useTranscription } from '@/features/voice/hooks/useTranscription';
import type { VoiceNote, TranscriptStatus } from '@/features/voice/services/voiceUploadService';

const STATUS_LABEL: Record<TranscriptStatus, string> = {
  pending: 'Transkript bereit zum Start', processing: 'Transkribiert…', completed: '',
  failed: 'Transkription fehlgeschlagen', disabled: 'Transkription nicht aktiv',
};

// Player mit Waveform-Optik + Türkis-Progress, Transkript & Status.
export function VoiceNotePlayer({ note, onDelete, onUpdated }: { note: VoiceNote; onDelete?: (id: string) => void; onUpdated?: () => void }) {
  const player = useAudioPlayer(note.audio_url);
  const status = useAudioPlayerStatus(player);
  const { status: tStatus, busy, transcribe } = useTranscription(note, onUpdated);

  const playing = status.playing;
  const dur = status.duration || note.duration_seconds || 0;
  const pos = status.currentTime || 0;
  const pct = dur > 0 ? Math.min(1, pos / dur) : 0;

  const toggle = () => (playing ? player.pause() : player.play());

  return (
    <View style={s.card}>
      <View style={s.row}>
        <TouchableOpacity style={s.play} onPress={toggle} activeOpacity={0.85}>
          <Ionicons name={playing ? 'pause' : 'play'} size={18} color={C.accentText} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          {/* Waveform-Optik: feste Balken, Progress als Türkis-Overlay */}
          <View style={s.waveWrap}>
            <View style={s.wave}>
              {WAVE.map((h, i) => <View key={i} style={[s.bar, { height: h }]} />)}
            </View>
            <View style={[s.waveFill, { width: `${pct * 100}%` }]}>
              <View style={s.wave}>{WAVE.map((h, i) => <View key={i} style={[s.bar, s.barOn, { height: h }]} />)}</View>
            </View>
          </View>
          <Text style={s.time}>{formatDuration(Math.round(pos))} / {formatDuration(Math.round(dur))}</Text>
        </View>
        {onDelete && (
          <TouchableOpacity onPress={() => onDelete(note.id)} hitSlop={8}><Ionicons name="trash-outline" size={17} color={C.muted} /></TouchableOpacity>
        )}
      </View>

      {note.transcript ? (
        <Text style={s.transcript}>{note.transcript}</Text>
      ) : (
        <View style={s.transcriptRow}>
          <Text style={s.statusTxt}>{STATUS_LABEL[tStatus] || 'Noch kein Transkript'}</Text>
          {(tStatus === 'pending' || tStatus === 'failed') && (
            <TouchableOpacity style={s.tBtn} onPress={transcribe} disabled={busy} activeOpacity={0.8}>
              <Ionicons name="sparkles" size={12} color={C.accent} />
              <Text style={s.tBtnTxt}>{busy ? '…' : 'Transkribieren'}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const WAVE = [10, 18, 8, 22, 14, 26, 12, 20, 9, 24, 16, 11, 19, 7, 23, 13];

const s = StyleSheet.create({
  card:      { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14 },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
  play:      { width: 42, height: 42, borderRadius: 21, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  waveWrap:  { height: 28, justifyContent: 'center', overflow: 'hidden' },
  wave:      { flexDirection: 'row', alignItems: 'center', gap: 3, height: 28 },
  bar:       { width: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)' },
  barOn:     { backgroundColor: C.accent },
  waveFill:  { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
  time:      { fontSize: 11, color: C.muted, fontWeight: '600', marginTop: 5 },
  transcript:{ fontSize: 13, color: 'rgba(255,255,255,0.82)', lineHeight: 19, marginTop: 12, fontStyle: 'italic' },
  transcriptRow:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  statusTxt: { fontSize: 11.5, color: C.muted, flex: 1 },
  tBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: C.accentDim },
  tBtnTxt:   { fontSize: 12, color: C.accent, fontWeight: '700' },
});
