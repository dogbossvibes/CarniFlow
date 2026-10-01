import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { markWhatsNewSeen, pendingWhatsNew, type WhatsNewRelease } from './whatsNew';

export function WhatsNewExperience() {
  const { t } = useT();
  const [release, setRelease] = useState<WhatsNewRelease | null>(null);

  useEffect(() => {
    let mounted = true;
    void pendingWhatsNew().then(next => { if (mounted) setRelease(next); });
    return () => { mounted = false; };
  }, []);

  const close = async () => {
    if (!release) return;
    await markWhatsNewSeen(release.id).catch(() => {});
    setRelease(null);
  };

  return (
    <Modal visible={!!release} transparent animationType="fade" onRequestClose={close}>
      <View style={s.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <View style={s.card}>
          <Text style={s.eyebrow}>ANYVO</Text>
          <Text style={s.title}>{release ? t(release.titleKey) : null}</Text>
          {release?.itemKeys.map(key => (
            <View key={key} style={s.itemRow}>
              <View style={s.dot} />
              <Text style={s.itemText}>{t(key)}</Text>
            </View>
          ))}
          <Pressable style={s.button} onPress={close} accessibilityRole="button">
            <Text style={s.buttonText}>{t('updates.understood')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.70)', padding: 24 },
  card: { alignSelf: 'center', width: '100%', maxWidth: 440, backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 22, padding: 24, gap: 14 },
  eyebrow: { color: C.accent, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  title: { color: C.white, fontSize: 24, fontWeight: '900', marginBottom: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent, marginTop: 7 },
  itemText: { flex: 1, color: C.white, fontSize: 15, lineHeight: 22 },
  button: { alignItems: 'center', backgroundColor: C.accent, padding: 14, borderRadius: 14, marginTop: 10 },
  buttonText: { color: C.accentText, fontSize: 15, fontWeight: '800' },
});
