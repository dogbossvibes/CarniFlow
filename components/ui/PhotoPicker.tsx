import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SignedImage } from '@/components/ui/SignedImage';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { uploadImage } from '@/services/mediaService';

interface Props {
  value:      string[];
  onChange:   (urls: string[]) => void;
  maxPhotos?: number;
}

export function PhotoPicker({ value, onChange, maxPhotos = 10 }: Props) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);   // 0..1 (gesamt über alle Bilder)

  const pick = async () => {
    if (value.length >= maxPhotos) {
      Alert.alert('Maximum erreicht', `Du kannst maximal ${maxPhotos} Fotos hinzufügen.`);
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Zugriff verweigert',
        'Bitte erlaube den Foto-Zugriff:\n\nEinstellungen → Expo Go → Fotos → "Alle Fotos" auswählen',
        [{ text: 'OK' }]
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:              ['images'],
      allowsMultipleSelection: true,
      quality:                 0.85,
      selectionLimit:          maxPhotos - value.length,
    });
    if (result.canceled) return;

    setUploading(true);
    setProgress(0);
    const newUrls: string[] = [];
    const total = result.assets.length;
    try {
      for (let i = 0; i < total; i++) {
        // Komprimiert + verkleinert, lädt in media-images, meldet Byte-Fortschritt.
        const { url } = await uploadImage(result.assets[i].uri, f => setProgress((i + f) / total));
        newUrls.push(url);
      }
      onChange([...value, ...newUrls]);
    } catch (e: any) {
      Alert.alert('Upload fehlgeschlagen', e?.message ?? 'Bitte versuch es erneut.');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const ladeAnzeige = (
    <View style={S.loadWrap}>
      <ActivityIndicator color={C.accent} size="small" />
      {progress > 0 ? <Text style={S.loadPct}>{Math.round(progress * 100)}%</Text> : null}
    </View>
  );

  const del = (idx: number) => {
    Alert.alert('Foto entfernen', 'Möchtest du dieses Foto entfernen?', [
      { text: 'Zurück', style: 'cancel' },
      {
        text: 'Entfernen',
        style: 'destructive',
        onPress: () => onChange(value.filter((_, i) => i !== idx)),
      },
    ]);
  };

  if (value.length === 0) {
    return (
      <TouchableOpacity
        style={S.empty}
        onPress={pick}
        disabled={uploading}
        activeOpacity={0.7}
      >
        {uploading ? (
          ladeAnzeige
        ) : (
          <>
            <View style={S.iconBox}>
              <Ionicons name="camera-outline" size={22} color={C.muted} />
            </View>
            <Text style={S.emptyTxt}>Fotos hinzufügen</Text>
            <Text style={S.emptySub}>Bis zu {maxPhotos} Bilder · JPG, PNG</Text>
          </>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={S.row}
    >
      {value.map((uri, i) => (
        <View key={i} style={S.thumb}>
          <SignedImage
            url={uri}
            style={S.img}
            contentFit="cover"
            transition={200}
          />
          <TouchableOpacity
            style={S.delBtn}
            onPress={() => del(i)}
            activeOpacity={0.8}
          >
            <Ionicons name="close-circle" size={18} color={C.white} />
          </TouchableOpacity>
        </View>
      ))}

      {value.length < maxPhotos && (
        <TouchableOpacity
          style={S.addBtn}
          onPress={pick}
          disabled={uploading}
          activeOpacity={0.7}
        >
          {uploading ? (
            ladeAnzeige
          ) : (
            <>
              <Ionicons name="add" size={22} color={C.muted} />
              <Text style={S.addTxt}>Hinzu{'\n'}fügen</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const THUMB = 88;

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

  loadWrap: { alignItems: 'center', gap: 6 },
  loadPct:  { color: C.accent, fontSize: 12, fontWeight: '800' },

  row: { gap: 8, paddingVertical: 2 },

  thumb: {
    width:        THUMB,
    height:       THUMB,
    borderRadius: 12,
    overflow:     'hidden',
    backgroundColor: C.card,
    borderWidth:  1,
    borderColor:  C.border,
  },
  img: { width: THUMB, height: THUMB },
  delBtn: {
    position:    'absolute',
    top:         4,
    right:       4,
    width:       20,
    height:      20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems:  'center',
    justifyContent: 'center',
  },

  addBtn: {
    width:           THUMB,
    height:          THUMB,
    borderRadius:    12,
    borderWidth:     1.5,
    borderStyle:     'dashed',
    borderColor:     C.border,
    backgroundColor: C.card,
    alignItems:      'center',
    justifyContent:  'center',
    gap:             2,
  },
  addTxt: {
    fontSize:   10,
    color:      C.subtle,
    textAlign:  'center',
    lineHeight: 13,
  },
});
