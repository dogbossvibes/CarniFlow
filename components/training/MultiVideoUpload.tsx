import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { uploadVideo } from '@/services/mediaService';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { tapHaptic } from '@/lib/haptics';

interface Props {
  value:    string[];
  onChange: (urls: string[]) => void;
}

function VideoCell({ uri, onRemove }: { uri: string; onRemove: () => void }) {
  const signed = useSignedUrl(uri);
  const player = useVideoPlayer(signed, p => { p.loop = false; p.muted = true; });
  useEffect(() => { if (signed) player.replace(signed); }, [signed, player]);
  return (
    <View style={s.cell}>
      <VideoView player={player} style={s.video} contentFit="cover" nativeControls allowsFullscreen />
      <TouchableOpacity style={s.remove} onPress={onRemove} activeOpacity={0.8} hitSlop={8}>
        <Ionicons name="close" size={14} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

// Mehrere Videos: Upload nach Supabase Storage (training-videos) + Player je Video.
export function MultiVideoUpload({ value, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);

  const pick = async () => {
    // Android: System Photo Picker (kein READ_MEDIA nötig). iOS: bestehender Flow.
    if (Platform.OS !== 'android') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Zugriff verweigert', 'Bitte erlaube den Video-Zugriff in den Einstellungen.');
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'], allowsEditing: true, quality: 0.7, videoMaxDuration: 120,
    });
    if (result.canceled) return;

    setUploading(true);
    setProgress(0);
    try {
      const { url } = await uploadVideo(result.assets[0].uri, setProgress);
      tapHaptic();
      onChange([...value, url]);
    } catch (e: any) {
      Alert.alert('Upload fehlgeschlagen', e?.message ?? 'Bitte erneut versuchen.');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <View style={s.wrap}>
      {value.map((uri, i) => (
        <VideoCell key={uri} uri={uri} onRemove={() => onChange(value.filter((_, idx) => idx !== i))} />
      ))}
      <TouchableOpacity style={s.add} onPress={pick} disabled={uploading} activeOpacity={0.7}>
        {uploading ? (
          <View style={s.loadWrap}>
            <ActivityIndicator color={C.accent} />
            {progress > 0 ? <Text style={s.loadPct}>{Math.round(progress * 100)}%</Text> : null}
          </View>
        ) : (
          <>
            <Ionicons name="videocam-outline" size={22} color={C.muted} />
            <Text style={s.addTxt}>Video hinzufügen</Text>
            <Text style={s.addSub}>MP4, MOV · max. 2 Min.</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:   { gap: 10 },
  cell:   { borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' },
  video:  { width: '100%', height: 200 },
  remove: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  add:    { borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.border, borderRadius: 14, padding: 22, alignItems: 'center', gap: 5, backgroundColor: C.card },
  loadWrap: { alignItems: 'center', gap: 6 },
  loadPct:  { color: C.accent, fontSize: 12, fontWeight: '800' },
  addTxt: { color: C.muted, fontSize: 13, fontWeight: '600' },
  addSub: { color: C.subtle, fontSize: 11 },
});
