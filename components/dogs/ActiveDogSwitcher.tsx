import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { DogAvatar } from '@/components/dogs/DogAvatar';
import { useActiveDog } from '@/hooks/useActiveDog';
import { useT } from '@/i18n';
import { haptic } from '@/lib/haptics';
import type { Dog } from '@/types';

// Umschalter für den aktiven Hund (gilt app-weit). Erscheint nur bei mehr als
// einem Hund — mit einem Hund gibt es nichts zu wählen.
export function ActiveDogSwitcher({ dogs }: { dogs: Dog[] }) {
  const { t } = useT();
  const { activeDog, setActiveDog } = useActiveDog(dogs);
  const [open, setOpen] = useState(false);

  if (dogs.length < 2 || !activeDog) return null;

  return (
    <>
      <TouchableOpacity
        style={s.pill}
        onPress={() => { haptic.light(); setOpen(true); }}
        activeOpacity={0.8}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        accessibilityRole="button"
        accessibilityLabel={t('activeDog.switchA11y', { dog: activeDog.name })}
      >
        <DogAvatar photoUrl={activeDog.photo_url} size={26} radius={13} />
        <Text style={s.pillTxt} numberOfLines={1}>{activeDog.name}</Text>
        <Ionicons name="chevron-down" size={14} color={C.white} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)} accessibilityLabel={t('common.close')}>
          <Pressable style={s.sheet} onPress={() => { /* Tipp im Blatt schliesst nicht */ }}>
            <Text style={s.title} accessibilityRole="header">{t('activeDog.title')}</Text>
            <Text style={s.hint}>{t('activeDog.hint')}</Text>
            <ScrollView style={s.list} showsVerticalScrollIndicator={false}>
              {dogs.map(d => {
                const an = d.id === activeDog.id;
                return (
                  <TouchableOpacity
                    key={d.id}
                    style={[s.row, an && s.rowAn]}
                    onPress={() => { haptic.light(); setActiveDog(d.id); setOpen(false); }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: an }}
                    accessibilityLabel={d.name}
                  >
                    <DogAvatar photoUrl={d.photo_url} size={40} radius={20} />
                    <Text style={s.rowTxt} numberOfLines={1}>{d.name}</Text>
                    {an ? <Ionicons name="checkmark-circle" size={22} color={C.trackPrimary} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  pill:    { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 36, maxWidth: 150, paddingLeft: 5, paddingRight: 10, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  pillTxt: { flexShrink: 1, fontSize: 14, color: C.white, fontWeight: '700' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  sheet:    { backgroundColor: C.trackCard, borderRadius: 24, borderWidth: 1, borderColor: C.trackBorder, padding: 20, maxHeight: '70%' },
  title:    { fontSize: 18, color: C.white, fontWeight: '800' },
  hint:     { fontSize: 13, color: C.trackTextSec, lineHeight: 19, marginTop: 4, marginBottom: 14 },
  list:     { flexGrow: 0 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: 'transparent', marginBottom: 6 },
  rowAn:    { backgroundColor: C.accentDim, borderColor: C.accentMid },
  rowTxt:   { flex: 1, fontSize: 16, color: C.white, fontWeight: '700' },
});
