import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { markWhatsNewSeen, pendingWhatsNew, type WhatsNewRelease } from './whatsNew';
import { ANYVO_APP_STORE_URL, dismissStoreVersion, refreshStoreVersion } from './storeVersion';

export function UpdateExperience() {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [whatsNew, setWhatsNew] = useState<WhatsNewRelease | null>(null);
  const [storeVersion, setStoreVersion] = useState<string | null>(null);

  // Mounted once in the authenticated tab layout. Neither request delays startup.
  useEffect(() => {
    let active = true;
    void pendingWhatsNew()
      .then(release => { if (active) setWhatsNew(release); })
      .catch(() => {});
    void refreshStoreVersion()
      .then(version => { if (active) setStoreVersion(version); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const closeWhatsNew = async () => {
    if (!whatsNew) return;
    await markWhatsNewSeen(whatsNew.id).catch(() => {});
    setWhatsNew(null);
  };

  const closeStoreNotice = async () => {
    if (!storeVersion) return;
    await dismissStoreVersion(storeVersion);
    setStoreVersion(null);
  };

  const openStore = async () => {
    await closeStoreNotice();
    await Linking.openURL(ANYVO_APP_STORE_URL).catch(() => {});
  };

  return (
    <>
      <Modal visible={!!whatsNew} transparent animationType="fade" onRequestClose={closeWhatsNew}>
        <View style={s.modalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeWhatsNew} />
          <View style={s.card}>
            <Text style={s.eyebrow}>ANYVO</Text>
            <Text style={s.title}>{whatsNew ? t(whatsNew.titleKey) : null}</Text>
            {whatsNew?.itemKeys.map(key => (
              <View key={key} style={s.itemRow}>
                <View style={s.dot} />
                <Text style={s.itemText}>{t(key)}</Text>
              </View>
            ))}
            <Pressable style={s.primaryButton} onPress={closeWhatsNew} accessibilityRole="button">
              <Text style={s.primaryText}>{t('updates.understood')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {storeVersion && !whatsNew ? (
        <View style={[s.storeBanner, { top: insets.top + 8 }]}>
          <Text style={s.storeTitle}>{t('updates.storeTitle')}</Text>
          <Text style={s.storeBody}>{t('updates.storeBody')}</Text>
          <View style={s.storeActions}>
            <Pressable onPress={closeStoreNotice} accessibilityRole="button" style={s.laterButton}>
              <Text style={s.laterText}>{t('common.later')}</Text>
            </Pressable>
            <Pressable onPress={openStore} accessibilityRole="button" style={s.storeButton}>
              <Text style={s.storeButtonText}>{t('updates.openAppStore')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.70)', padding: 24 },
  card: { alignSelf: 'center', width: '100%', maxWidth: 440, backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 22, padding: 24, gap: 14 },
  eyebrow: { color: C.accent, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  title: { color: C.white, fontSize: 24, fontWeight: '900', marginBottom: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent, marginTop: 7 },
  itemText: { flex: 1, color: C.white, fontSize: 15, lineHeight: 22 },
  primaryButton: { alignItems: 'center', backgroundColor: C.accent, padding: 14, borderRadius: 14, marginTop: 10 },
  primaryText: { color: C.accentText, fontSize: 15, fontWeight: '800' },
  storeBanner: { position: 'absolute', left: 16, right: 16, zIndex: 40, backgroundColor: C.card, borderColor: C.accent, borderWidth: 1, borderRadius: 18, padding: 16, gap: 6 },
  storeTitle: { color: C.white, fontSize: 16, fontWeight: '800' },
  storeBody: { color: C.muted, fontSize: 13, lineHeight: 19 },
  storeActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 7 },
  laterButton: { paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center' },
  laterText: { color: C.muted, fontSize: 13, fontWeight: '700' },
  storeButton: { backgroundColor: C.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  storeButtonText: { color: C.accentText, fontSize: 13, fontWeight: '800' },
});
