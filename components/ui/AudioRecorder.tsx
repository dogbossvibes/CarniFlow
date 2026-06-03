import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  useAudioRecorder,
  useAudioPlayer,
  useAudioPlayerStatus,
  setAudioModeAsync,
  AudioModule,
  RecordingPresets,
} from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { uploadAudio } from '@/services/mediaService';
import { C } from '@/constants/colors';
import { signMediaUrl } from '@/lib/mediaUrl';
import type { AudioNote } from '@/types';

interface Props {
  value:    AudioNote[];
  onChange: (notes: AudioNote[]) => void;
}

export function AudioRecorder({ value, onChange }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [seconds,     setSeconds]     = useState(0);
  const [playingIdx,  setPlayingIdx]  = useState<number | null>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const localUriRef = useRef<string | null>(null);

  // Eine Audio-Lib (expo-audio) für Aufnahme UND Wiedergabe → kein Session-Konflikt.
  const recorder     = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player       = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);

  // Detect playback completion → clean up temp file
  useEffect(() => {
    if (playerStatus.didJustFinish) {
      setPlayingIdx(null);
      if (localUriRef.current) {
        FileSystem.deleteAsync(localUriRef.current, { idempotent: true });
        localUriRef.current = null;
      }
    }
  }, [playerStatus.didJustFinish]);

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ── RECORDING (expo-audio) ────────────────────────────────────────────────

  const startRec = async () => {
    try {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert(
          'Mikrofon-Zugriff nötig 🎙️',
          'Einstellungen → Expo Go → Mikrofon → aktivieren',
          [{ text: 'OK' }]
        );
        return;
      }

      // Wiedergabe stoppen, damit die Aufnahme-Session sauber aktiviert werden kann.
      if (player.playing) player.pause();

      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();

      setIsRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } catch (e) {
      console.error('[Recording Start]', e);
      Alert.alert('Ups, kurze Pause 🐾', 'Aufnahme noch nicht gestartet — Mikrofon-Berechtigung prüfen');
    }
  };

  const stopRec = async () => {
    if (!isRecording) return;
    clearInterval(timerRef.current!);
    const dur = fmt(seconds);
    setIsRecording(false);

    try {
      await recorder.stop();
      // Session zurück auf reine Wiedergabe.
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });

      const uri = recorder.uri;
      if (!uri) return;

      setUploading(true);
      // FormData-basierter Upload (mediaService) — fetch(uri).blob() liefert
      // für file://-URIs in RN einen LEEREN Blob → 0-Byte-Datei → nichts abspielbar.
      const { url } = await uploadAudio(uri);

      const now  = new Date();
      const zeit = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      onChange([...value, { url, duration: dur, createdAt: `Heute ${zeit}` }]);
    } catch (e: any) {
      console.error('[Recording Stop]', e);
      Alert.alert('Ups, kurze Pause 🐾', 'Aufnahme noch nicht gespeichert — versuch es nochmal!');
    } finally {
      setUploading(false);
    }
  };

  // ── PLAYBACK (expo-audio) ─────────────────────────────────────────────────

  const play = async (idx: number) => {
    try {
      // Stop whatever is currently playing
      if (player.playing) player.pause();
      if (localUriRef.current) {
        FileSystem.deleteAsync(localUriRef.current, { idempotent: true });
        localUriRef.current = null;
      }

      // Tapping the same item again = stop
      if (playingIdx === idx) {
        setPlayingIdx(null);
        return;
      }

      setPlayingIdx(idx);

      // Configure audio session for playback
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording:   false,
      });

      // Download locally first — Supabase CDN doesn't support Range requests (AVFoundationErrorDomain -11850)
      const remoteUrl = await signMediaUrl(value[idx].url);
      const localUri  = FileSystem.cacheDirectory + `audio_${idx}_${Date.now()}.mp4`;
      const result    = await FileSystem.downloadAsync(remoteUrl, localUri);

      if (result.status !== 200) throw new Error('Download fehlgeschlagen: ' + result.status);

      localUriRef.current = localUri;
      player.replace({ uri: result.uri });
      player.play();
    } catch (e: any) {
      console.error('[Audio Playback Error]', e);
      setPlayingIdx(null);
      Alert.alert(
        'Ups, kurze Pause 🐾',
        'Abspielen braucht einen Moment: ' + (e?.message || 'Bitte nochmal versuchen')
      );
    }
  };

  const del = (idx: number) => {
    Alert.alert('Aufnahme löschen', 'Möchtest du diese Sprachnotiz löschen?', [
      { text: 'Zurück', style: 'cancel' },
      {
        text: 'Entfernen',
        style: 'destructive',
        onPress: () => onChange(value.filter((_, i) => i !== idx)),
      },
    ]);
  };

  return (
    <View>
      {/* Aufnahme-Button */}
      <View style={S.zentrum}>
        <TouchableOpacity
          style={S.btnWrap}
          onPress={isRecording ? stopRec : startRec}
          disabled={uploading}
          activeOpacity={0.8}
        >
          {isRecording ? (
            <View style={S.btnAktiv}>
              <LinearGradient
                colors={[`${C.danger}30`, `${C.danger}15`]}
                style={StyleSheet.absoluteFill}
              />
              <Ionicons name="stop-circle" size={28} color={C.danger} />
            </View>
          ) : (
            <View style={S.btnIdle}>
              {uploading
                ? <ActivityIndicator color={C.accent} />
                : <Ionicons name="mic-outline" size={28} color={C.accent} />
              }
            </View>
          )}
        </TouchableOpacity>

        {isRecording && (
          <View style={S.timerReihe}>
            <View style={S.timerPunkt} />
            <Text style={S.timer}>{fmt(seconds)}</Text>
          </View>
        )}

        <Text style={S.hinweis}>
          {uploading
            ? 'Wird hochgeladen…'
            : isRecording
              ? 'Tippen zum Stoppen'
              : 'Tippen zum Aufnehmen'}
        </Text>
      </View>

      {/* Aufnahmen-Liste */}
      {value.map((note, i) => (
        <View key={i} style={S.item}>
          <TouchableOpacity style={S.playBtn} onPress={() => play(i)} activeOpacity={0.7}>
            {playingIdx === i && (
              <LinearGradient
                colors={[`${C.accent}25`, `${C.accent}10`]}
                style={StyleSheet.absoluteFill}
              />
            )}
            <Ionicons
              name={playingIdx === i ? 'pause' : 'play'}
              size={15}
              color={playingIdx === i ? C.accent : C.muted}
            />
          </TouchableOpacity>

          <View style={S.info}>
            <Text style={S.itemTitel}>Notiz {i + 1}</Text>
            <Text style={S.itemMeta}>{note.duration} · {note.createdAt}</Text>
          </View>

          <TouchableOpacity style={S.delBtn} onPress={() => del(i)} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={14} color={C.danger} />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const S = StyleSheet.create({
  zentrum: { alignItems: 'center', marginBottom: 14, gap: 8 },

  btnWrap: {},

  btnIdle: {
    width:           64,
    height:          64,
    borderRadius:    32,
    backgroundColor: C.card,
    borderWidth:     1.5,
    borderColor:     `${C.accent}50`,
    alignItems:      'center',
    justifyContent:  'center',
  },
  btnAktiv: {
    width:           64,
    height:          64,
    borderRadius:    32,
    borderWidth:     1.5,
    borderColor:     `${C.danger}60`,
    alignItems:      'center',
    justifyContent:  'center',
    overflow:        'hidden',
  },

  timerReihe: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timerPunkt: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.danger },
  timer:      { color: C.danger, fontSize: 20, fontWeight: '700', letterSpacing: 0.5 },
  hinweis:    { fontSize: 12, color: C.muted },

  item: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             10,
    padding:         12,
    backgroundColor: C.card,
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     C.border,
    marginBottom:    8,
  },
  playBtn: {
    width:           36,
    height:          36,
    borderRadius:    18,
    backgroundColor: C.cardAlt,
    borderWidth:     1,
    borderColor:     C.border,
    alignItems:      'center',
    justifyContent:  'center',
    overflow:        'hidden',
  },
  info:      { flex: 1 },
  itemTitel: { fontSize: 13, color: C.white, fontWeight: '600' },
  itemMeta:  { fontSize: 11, color: C.muted, marginTop: 2 },

  delBtn: {
    width:           30,
    height:          30,
    borderRadius:    8,
    backgroundColor: C.dangerDim,
    borderWidth:     1,
    borderColor:     `${C.danger}30`,
    alignItems:      'center',
    justifyContent:  'center',
  },
});
