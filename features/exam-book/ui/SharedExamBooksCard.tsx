import { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { useSession } from '@/lib/session-context';
import { listExamGrantsToMe, listOwnerNames, type ExamGrant } from '../service';

// «Mit mir geteilte Prüfungsbücher» im Bereich «Mit mir geteilt».
// Zeigt nur aktive Freigaben; ohne Freigabe oder ohne Server-Tabelle: nichts.
export function SharedExamBooksCard() {
  const router = useRouter();
  const { t } = useT();
  const { user } = useSession();
  const uid = user?.id ?? '';
  const [grants, setGrants] = useState<ExamGrant[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    if (!uid) { setGrants([]); return; }
    const res = await listExamGrantsToMe(uid);
    const list = res.data ?? [];
    setGrants(list);
    const owners = [...new Set(list.map(g => g.owner_id))];
    if (owners.length === 0) return;
    setNames(await listOwnerNames(owners));
  }, [uid]);

  useFocusEffect(useCallback(() => { void load().catch(() => setGrants([])); }, [load]));

  if (grants.length === 0) return null;
  return (
    <View style={s.card}>
      <Text accessibilityRole="header" style={s.title}>{t('exam.sharedWithMe')}</Text>
      {grants.map((g, i) => {
        const owner = names.get(g.owner_id);
        return (
          <TouchableOpacity
            key={g.id} accessibilityRole="button" style={[s.row, i > 0 && s.divider]}
            onPress={() => router.push({ pathname: '/dog-exams/[id]', params: { id: g.dog_id, name: g.dog_name, shared: '1' } } as never)}
          >
            <Ionicons name="ribbon-outline" size={18} color={C.trackPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={s.text}>{g.dog_name}</Text>
              {owner ? <Text style={s.muted}>{t('exam.sharedBy', { name: owner })}</Text> : null}
            </View>
            <Text style={s.muted}>{t('exam.sharedReadOnly')}</Text>
            <Ionicons name="chevron-forward" size={16} color={C.trackTextMut} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  card:    { backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, padding: 14, marginHorizontal: 16, marginBottom: 12, gap: 4 },
  title:   { fontSize: 15, fontWeight: '700', color: C.trackText, marginBottom: 4 },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, minHeight: 48 },
  divider: { borderTopWidth: 1, borderTopColor: C.trackBorder },
  text:    { fontSize: 15, color: C.trackText },
  muted:   { fontSize: 13, color: C.trackTextSec },
});
