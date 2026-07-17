import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, ScrollView, Switch, Alert,
  ActivityIndicator, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Glass, isGlass } from '@/components/ui/Glass';
import { createShareLink, deleteShareLink } from '@/services/shareService';
import type { TrainingSession } from '@/types';

interface Props {
  training: TrainingSession;
  visible: boolean;
  onClose: () => void;
}

export function ShareSheet({ training, visible, onClose }: Props) {
  const [step,     setStep]     = useState<'options' | 'link'>('options');
  const [loading,  setLoading]  = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [copied,   setCopied]   = useState(false);
  const [opts, setOpts] = useState({
    includeNotes: true,
    includeVideo: true,
    includeAudio: true,
    includeScore: true,
  });

  const toggle = (key: keyof typeof opts) =>
    setOpts(o => ({ ...o, [key]: !o[key] }));

  const handleCreate = async () => {
    setLoading(true);
    try {
      const url = await createShareLink(training.id, opts);
      setShareUrl(url);
      setStep('link');
    } catch {
      Alert.alert('Ups, kurze Pause 🐾', 'Link noch nicht bereit — versuch es nochmal!');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    await Share.share({
      message: `Schau dir mein Training an: ${shareUrl}`,
      url: shareUrl,
    });
  };

  const handleDelete = async () => {
    Alert.alert(
      'Link deaktivieren',
      'Möchtest du den Teilen-Link wirklich deaktivieren?',
      [
        { text: 'Zurück', style: 'cancel' },
        {
          text: 'Deaktivieren',
          style: 'destructive',
          onPress: async () => {
            await deleteShareLink(training.id);
            reset();
          },
        },
      ]
    );
  };

  const reset = () => {
    setStep('options');
    setShareUrl('');
    setCopied(false);
    onClose();
  };

  const displayTitle = training.title ?? training.category;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={reset}>
      <TouchableOpacity style={S.overlay} activeOpacity={1} onPress={reset} />
      <View style={[S.sheet, isGlass && S.sheetGlass]}>
        {isGlass && <Glass style={StyleSheet.absoluteFill} />}
        <View style={S.pill} />

        {step === 'options' ? (
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={S.title}>Training teilen</Text>
            <Text style={S.sub}>{displayTitle}</Text>

            <Text style={S.label}>INHALTE AUSWÄHLEN</Text>
            <View style={S.card}>
              {([
                { key: 'includeNotes', label: 'Notizen'          },
                { key: 'includeVideo', label: 'Video'             },
                { key: 'includeAudio', label: 'Sprachnotizen'     },
                { key: 'includeScore', label: 'Score & Statistik' },
              ] as { key: keyof typeof opts; label: string }[]).map(({ key, label }, i) => (
                <View key={key} style={[S.row, i > 0 && S.rowBorder]}>
                  <Text style={S.rowTxt}>{label}</Text>
                  <Switch
                    value={opts[key]}
                    onValueChange={() => toggle(key)}
                    trackColor={{ false: '#1C1C2C', true: '#00FFCC' }}
                    thumbColor="#fff"
                  />
                </View>
              ))}
            </View>

            <Text style={S.label}>LINK-GÜLTIGKEIT</Text>
            <View style={S.card}>
              <View style={S.row}>
                <Text style={S.rowTxt}>Ablauf</Text>
                <Text style={S.rowVal}>30 Tage</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[S.btn, loading && S.btnDis]}
              onPress={handleCreate}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#000" />
                : <Text style={S.btnTxt}>Link erstellen & teilen</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={S.successIcon}>
              <Text style={{ fontSize: 32 }}>✅</Text>
            </View>
            <Text style={S.title}>Link erstellt!</Text>
            <Text style={S.sub}>Gültig für 30 Tage</Text>

            <Text style={S.label}>DEIN LINK</Text>
            <View style={S.linkBox}>
              <Text style={S.linkTxt} numberOfLines={1}>{shareUrl}</Text>
              <TouchableOpacity style={S.copyBtn} onPress={handleCopy} activeOpacity={0.7}>
                <Text style={S.copyTxt}>{copied ? '✓ Kopiert' : 'Kopieren'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={S.btn} onPress={handleShare} activeOpacity={0.85}>
              <Text style={S.btnTxt}>Teilen via...</Text>
            </TouchableOpacity>

            <TouchableOpacity style={S.btnDanger} onPress={handleDelete} activeOpacity={0.85}>
              <Text style={S.btnDangerTxt}>Link deaktivieren</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
        <SafeAreaView edges={['bottom']} />
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sheet: {
    position:            'absolute',
    bottom:              0,
    left:                0,
    right:               0,
    backgroundColor:     '#13131E',
    borderTopLeftRadius: 24,
    borderTopRightRadius:24,
    borderTopWidth:      1,
    borderColor:         '#1C1C2C',
    padding:             16,
    paddingBottom:       8,
    maxHeight:           '85%',
  },
  sheetGlass: { backgroundColor: 'transparent', overflow: 'hidden' },
  pill: {
    width:           36,
    height:          4,
    backgroundColor: '#1C1C2C',
    borderRadius:    2,
    alignSelf:       'center',
    marginBottom:    16,
  },
  title: {
    color:      '#E8E8F2',
    fontSize:   18,
    fontWeight: '700',
    textAlign:  'center',
  },
  sub: {
    color:        '#525270',
    fontSize:     13,
    textAlign:    'center',
    marginTop:    4,
    marginBottom: 4,
  },
  label: {
    color:          '#525270',
    fontSize:       10,
    fontWeight:     '500',
    letterSpacing:  1,
    textTransform:  'uppercase',
    marginTop:      16,
    marginBottom:   7,
  },
  card: {
    backgroundColor: '#101018',
    borderRadius:    13,
    borderWidth:     1,
    borderColor:     '#1C1C2C',
    paddingHorizontal: 14,
  },
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  rowBorder: { borderTopWidth: 1, borderColor: '#1C1C2C' },
  rowTxt: { color: '#E8E8F2', fontSize: 14 },
  rowVal: { color: '#00FFCC', fontSize: 13 },

  btn: {
    backgroundColor: '#00FFCC',
    borderRadius:    12,
    padding:         15,
    alignItems:      'center',
    marginTop:       16,
  },
  btnDis:    { opacity: 0.5 },
  btnTxt:    { color: '#000', fontSize: 15, fontWeight: '700' },
  btnDanger: {
    borderWidth:     1,
    borderColor:     '#3A1010',
    backgroundColor: '#1A0808',
    borderRadius:    12,
    padding:         15,
    alignItems:      'center',
    marginTop:       10,
  },
  btnDangerTxt: { color: '#E04040', fontSize: 15, fontWeight: '600' },

  successIcon: { alignItems: 'center', paddingVertical: 16 },
  linkBox: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: '#0D0D18',
    borderRadius:    10,
    borderWidth:     1,
    borderColor:     '#1C1C2C',
    padding:         12,
    gap:             8,
  },
  linkTxt: { flex: 1, color: '#525270', fontSize: 12 },
  copyBtn: {
    backgroundColor:  '#1C1800',
    borderRadius:     7,
    paddingHorizontal:10,
    paddingVertical:  5,
    borderWidth:      1,
    borderColor:      '#C4A82540',
  },
  copyTxt: { color: '#00FFCC', fontSize: 11, fontWeight: '500' },
});
