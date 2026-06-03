import React from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import type { AudioNote } from '@/types';

// Web stub: recording requires the Expo Go mobile app.
// Existing notes (stored as URLs) are shown read-only.

interface Props {
  value:    AudioNote[];
  onChange: (notes: AudioNote[]) => void;
}

export function AudioRecorder({ value, onChange }: Props) {
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
      {/* Disabled record area */}
      <View style={S.disabledBox}>
        <View style={S.iconBox}>
          <Ionicons name="mic-off-outline" size={20} color={C.subtle} />
        </View>
        <View style={S.disabledInfo}>
          <Text style={S.disabledTitle}>Aufnahme nicht verfügbar</Text>
          <Text style={S.disabledSub}>Sprachnotizen sind in der Mobilapp verfügbar.</Text>
        </View>
      </View>

      {/* Existing recordings (read-only) */}
      {value.map((note, i) => (
        <View key={i} style={S.item}>
          <View style={S.playIcon}>
            <Ionicons name="mic-outline" size={15} color={C.muted} />
          </View>
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
  disabledBox: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             12,
    padding:         14,
    backgroundColor: C.card,
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     C.border,
    marginBottom:    12,
    opacity:         0.6,
  },
  iconBox: {
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: C.cardAlt,
    borderWidth:     1,
    borderColor:     C.border,
    alignItems:      'center',
    justifyContent:  'center',
  },
  disabledInfo:  { flex: 1 },
  disabledTitle: { fontSize: 13, color: C.muted, fontWeight: '600' },
  disabledSub:   { fontSize: 11, color: C.subtle, marginTop: 2 },

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
  playIcon: {
    width:           36,
    height:          36,
    borderRadius:    18,
    backgroundColor: C.cardAlt,
    borderWidth:     1,
    borderColor:     C.border,
    alignItems:      'center',
    justifyContent:  'center',
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
