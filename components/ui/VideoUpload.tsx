import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { C } from '@/constants/colors';
import { useSignedUrl } from '@/hooks/useSignedUrl';

interface Props {
  value?:   string | null;
  onChange: (url: string | null) => void;
}

function VideoPlayer({ uri, onReplace, onDelete }: {
  uri:       string;
  onReplace: () => void;
  onDelete:  () => void;
}) {
  const signed = useSignedUrl(uri);
  const player = useVideoPlayer(signed, p => {
    p.loop  = false;
    p.muted = false;
  });
  useEffect(() => { if (signed) player.replace(signed); }, [signed, player]);

  return (
    <View style={S.previewWrap}>
      <View style={S.videoContainer}>
        <VideoView
          player={player}
          style={S.video}
          allowsFullscreen={true}
          allowsPictureInPicture={false}
          contentFit="cover"
          nativeControls={true}
        />
      </View>
      <View style={S.previewActions}>
        <TouchableOpacity style={S.btnReplace} onPress={onReplace} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={14} color={C.muted} />
          <Text style={S.btnReplaceTxt}>Ersetzen</Text>
        </TouchableOpacity>
        <TouchableOpacity style={S.btnDel} onPress={onDelete} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={14} color={C.danger} />
          <Text style={S.btnDelTxt}>Entfernen</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function VideoUpload({ value, onChange }: Props) {
  const [uploading, setUploading] = useState(false);

  const pick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Zugriff verweigert',
        'Bitte erlaube Foto/Video-Zugriff:\n\nEinstellungen → Expo Go → Fotos → "Alle Fotos" auswählen',
        [{ text: 'OK' }]
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:       ['videos'],
      allowsEditing:    true,
      quality:          0.7,
      videoMaxDuration: 120,
    });
    if (result.canceled) return;

    const uri = result.assets[0].uri;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const ext      = uri.split('.').pop()?.toLowerCase() ?? 'mp4';
      const fileName = `${user!.id}/${Date.now()}.${ext}`;

      const formData = new FormData();
      formData.append('file', { uri, name: fileName, type: `video/${ext}` } as any);

      const { error } = await supabase.storage
        .from('training-videos')
        .upload(fileName, formData, { contentType: `video/${ext}`, upsert: true });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('training-videos')
        .getPublicUrl(fileName);

      onChange(urlData.publicUrl);
    } catch (e: any) {
      Alert.alert(
        'Upload braucht einen Moment',
        'Noch nicht hochgeladen — versuch es nochmal!\n' + (e?.message || JSON.stringify(e))
      );
    } finally {
      setUploading(false);
    }
  };

  const del = () => {
    Alert.alert('Video löschen', 'Möchtest du das Video wirklich löschen?', [
      { text: 'Zurück', style: 'cancel' },
      { text: 'Entfernen', style: 'destructive', onPress: () => onChange(null) },
    ]);
  };

  if (value) {
    return <VideoPlayer uri={value} onReplace={pick} onDelete={del} />;
  }

  return (
    <TouchableOpacity
      style={S.empty}
      onPress={pick}
      disabled={uploading}
      activeOpacity={0.7}
    >
      {uploading ? (
        <ActivityIndicator color={C.accent} />
      ) : (
        <>
          <View style={S.iconBox}>
            <Ionicons name="videocam-outline" size={22} color={C.muted} />
          </View>
          <Text style={S.emptyTxt}>Video hinzufügen</Text>
          <Text style={S.emptySub}>MP4, MOV · max. 2 Min.</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const S = StyleSheet.create({
  empty: {
    borderWidth:     1.5,
    borderStyle:     'dashed',
    borderColor:     C.border,
    borderRadius:    14,
    padding:         24,
    alignItems:      'center',
    gap:             6,
    backgroundColor: C.card,
  },
  iconBox: {
    width:           44,
    height:          44,
    backgroundColor: C.cardAlt,
    borderRadius:    12,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    4,
    borderWidth:     1,
    borderColor:     C.border,
  },
  emptyTxt: { color: C.muted, fontSize: 13, fontWeight: '600' },
  emptySub: { color: C.subtle, fontSize: 11 },

  previewWrap: {},
  videoContainer: {
    borderRadius:    14,
    overflow:        'hidden',
    backgroundColor: '#000',
  },
  video: { width: '100%', height: 220 },
  previewActions: {
    flexDirection: 'row',
    gap:           8,
    marginTop:     8,
  },
  btnReplace: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             6,
    padding:         11,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     C.border,
    backgroundColor: C.card,
  },
  btnReplaceTxt: { color: C.muted, fontSize: 12, fontWeight: '600' },
  btnDel: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             6,
    padding:         11,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     `${C.danger}30`,
    backgroundColor: C.dangerDim,
  },
  btnDelTxt: { color: C.danger, fontSize: 12, fontWeight: '600' },
});
