import { setAppAudioModeAsync } from '@/lib/greetingAudioSafety';
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
  AudioModule,
  RecordingPresets,
} from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { uploadAudio } from '@/services/mediaService';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { useUndoableListRemoval } from '@/hooks/useUndoableRemoval';
import { useBusyHold, useLatestRef } from '@/hooks/useLatestRef';
import { signMediaUrl } from '@/lib/mediaUrl';
import type { AudioNote } from '@/types';

interface Props {
  value:    AudioNote[];
  onChange: (notes: AudioNote[]) => void;
  /** Nur anzeigen: Entfernen ist wirkungslos (kein Hinweis). */
  readOnly?: boolean;
  /**
   * 'confirm' (Standard): Rückfrage vor dem Entfernen, z. B. bei gespeicherten Einträgen.
   * 'undo': sofort entfernen mit «Rückgängig» (nur für noch nicht gespeicherte Formulare).
   */
  removal?: 'confirm' | 'undo';
  /** Nur für 'undo': Kennung des Formulars (z. B. Hunde-ID); bei Wechsel schliesst der Hinweis. */
  undoScope?: string | null;
  /** Nur für 'undo': true während des Speicherns; sperrt Entfernen und schliesst den Hinweis. */
  undoLocked?: boolean;
  /** Meldet true, solange aufgenommen oder hochgeladen wird (z. B. um den Hundewechsel zu sperren). */
  onBusyChange?: (busy: boolean) => void;
}

export function AudioRecorder({ value, onChange, readOnly = false, removal: removalMode = 'confirm', undoScope, undoLocked, onBusyChange }: Props) {
  const { t } = useT();
  const [isRecording, setIsRecording] = useState(false);
  const [uploading,   setUploading]   = useState(false);
  // Vom Stopp-Tipp bis zum Ende des Uploads: `stopRec` schreibt danach mit dem
  // Stand vom Stopp-Tipp zurück, in dieser Zeit darf sich die Liste nicht ändern.
  const [finishing,   setFinishing]   = useState(false);
  // Rückgängig nur, solange keine Aufnahme läuft, gestoppt oder hochgeladen wird:
  // sonst würde eine als zurückgeholt gemeldete Notiz still wieder entfernt.
  const busy = isRecording || finishing || uploading;
  // Nach dem Upload mit dem aktuellen Stand zurückschreiben, nicht mit dem vom Stopp-Tipp.
  const latest = useLatestRef({ value, onChange });
  // Sperre von Aufnahmebeginn bis Upload-Ende. Wird der Baustein während des Uploads
  // ausgehängt, bleibt sie bis zum Ende bestehen (der Upload schreibt danach noch).
  // Wird er während der Aufnahme ausgehängt, endet die Aufnahme ohne Ergebnis: dann
  // wird die Sperre sofort gelöst.
  const holdBusy = useBusyHold(onBusyChange);
  const busyRelease = useRef<(() => void) | null>(null);
  const stopping = useRef(false);
  useEffect(() => () => { if (!stopping.current) { busyRelease.current?.(); busyRelease.current = null; } }, []);
  const removal = useUndoableListRemoval(value, onChange, { scope: undoScope, locked: undoLocked || busy });
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- vorbestehend seit Production 2f7a1e7f; Logik bewusst unverändert
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
    removal.settle();
    try {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert(
          t('comments.microphoneRequired'),
          t('audio.microphoneSettings'),
          [{ text: t('common.ok') }]
        );
        return;
      }

      // Wiedergabe stoppen, damit die Aufnahme-Session sauber aktiviert werden kann.
      if (player.playing) player.pause();

      await setAppAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();

      busyRelease.current?.();
      busyRelease.current = holdBusy();
      setIsRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } catch (e) {
      console.error('[Recording Start]', e);
      Alert.alert(t('share.notReadyTitle'), t('audio.recordingStartFailed'));
    }
  };

  const stopRec = async () => {
    if (!isRecording) return;
    removal.settle();
    stopping.current = true;
    setFinishing(true);
    clearInterval(timerRef.current!);
    const dur = fmt(seconds);
    setIsRecording(false);

    try {
      await recorder.stop();
      // Session zurück auf reine Wiedergabe.
      await setAppAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });

      const uri = recorder.uri;
      if (!uri) return;

      setUploading(true);
      // FormData-basierter Upload (mediaService) — fetch(uri).blob() liefert
      // für file://-URIs in RN einen LEEREN Blob → 0-Byte-Datei → nichts abspielbar.
      const { url } = await uploadAudio(uri);

      const now  = new Date();
      const zeit = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      latest.current.onChange([...latest.current.value, { url, duration: dur, createdAt: `Heute ${zeit}` }]);
    } catch (e: any) {
      console.error('[Recording Stop]', e);
      Alert.alert(t('share.notReadyTitle'), t('audio.recordingSaveFailed'));
    } finally {
      stopping.current = false;
      busyRelease.current?.();
      busyRelease.current = null;
      setUploading(false);
      setFinishing(false);
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
      await setAppAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording:   false,
      });

      // Download locally first — Supabase CDN doesn't support Range requests (AVFoundationErrorDomain -11850)
      const remoteUrl = await signMediaUrl(value[idx].url);
      // eslint-disable-next-line react-hooks/purity -- vorbestehend seit Production 2f7a1e7f; Logik bewusst unverändert
      const localUri  = FileSystem.cacheDirectory + `audio_${idx}_${Date.now()}.mp4`;
      const result    = await FileSystem.downloadAsync(remoteUrl, localUri);

      if (result.status !== 200) throw new Error(`Download failed: ${result.status}`);

      localUriRef.current = localUri;
      player.replace({ uri: result.uri });
      player.play();
    } catch (e: any) {
      console.error('[Audio Playback Error]', e);
      setPlayingIdx(null);
      Alert.alert(
        t('share.notReadyTitle'),
        t('audio.playbackNeedsMoment', { message: e?.message || t('media.retry') })
      );
    }
  };

  // Nimmt die Sprachnotiz nur aus der Auswahl (keine Datei wird gelöscht).
  const del = (idx: number) => {
    if (readOnly) return;
    if (removalMode === 'undo') { if (!busy) removal.remove(idx, t('undo.audioRemoved')); return; }
    Alert.alert(t('audio.deleteTitle'), t('audio.deleteBody'), [
      { text: t('common.back'), style: 'cancel' },
      {
        text: t('media.remove'),
        style: 'destructive',
        // Mit dem aktuellen Stand entfernen: eine in der Zwischenzeit fertige Aufnahme bleibt erhalten.
        onPress: () => {
          const current = latest.current.value;
          const at = current.indexOf(value[idx]);
          if (at >= 0) latest.current.onChange(current.filter((_, i) => i !== at));
        },
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
            ? t('media.uploading')
            : isRecording
              ? t('audio.tapToStop')
              : t('audio.tapToRecord')}
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
            <Text style={S.itemTitel}>{t('audio.note', { number: i + 1 })}</Text>
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
