import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { listConnections, PERSON_CONNECTION_TYPE } from '@/services/connectionService';
import { grantExamAccess, listExamGrants, revokeExamAccess, type ExamGrant } from '../service';

// «Wer sieht das Prüfungsbuch»: Lesefreigabe je Hund und je bestehender,
// akzeptierter Verbindung (Trainer oder Person). Nur Lesen; Anhänge bleiben bei
// der Besitzerin. Wirkung erst nach Bestätigung durch den Server (kein
// optimistischer Schalter, damit Anzeige und Freigabe nie auseinanderlaufen).

interface Person { connectionId: string; userId: string; name: string }

export function ExamShareSheet({ visible, onClose, ownerId, dogId, dogName }: {
  visible: boolean; onClose: () => void; ownerId: string; dogId: string; dogName: string;
}) {
  const { t } = useT();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [grants, setGrants] = useState<ExamGrant[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const fetchAll = useCallback(async (): Promise<{ people: Person[]; grants: ExamGrant[]; error: boolean }> => {
    try {
      const [trainers, persons, current] = await Promise.all([
        listConnections(ownerId),
        listConnections(ownerId, PERSON_CONNECTION_TYPE),
        listExamGrants(dogId),
      ]);
      const seen = new Set<string>();
      const list: Person[] = [];
      for (const c of [...trainers, ...persons]) {
        if (c.status !== 'accepted' || seen.has(c.counterpartId)) continue;
        seen.add(c.counterpartId);
        list.push({ connectionId: c.id, userId: c.counterpartId, name: c.counterpartName ?? c.counterpartUsername ?? '–' });
      }
      return { people: list, grants: current.data ?? [], error: !!current.error };
    } catch { return { people: [], grants: [], error: true }; }
  }, [ownerId, dogId]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void fetchAll().then(res => {
      if (!alive) return;
      setPeople(res.people); setGrants(res.grants); setError(res.error);
    });
    return () => { alive = false; };
  }, [visible, fetchAll]);

  const toggle = async (person: Person, on: boolean) => {
    setBusy(person.userId); setError(false);
    const res = on
      ? await grantExamAccess(dogId, person.userId, person.connectionId, dogName)
      : await Promise.all(grants.filter(g => g.grantee_user_id === person.userId).map(g => revokeExamAccess(g.id)))
        .then(all => all.find(r => r.error) ?? { data: true as const, error: null });
    if (res.error) setError(true);
    const fresh = await listExamGrants(dogId);
    setGrants(fresh.data ?? grants);
    setBusy(null);
  };

  return (
    <AnyvoBottomSheet visible={visible} onClose={onClose} title={t('exam.share')} closeButton>
      <Text style={s.muted}>{t('exam.shareBody')}</Text>
      {people === null ? <ActivityIndicator color={C.trackPrimary} />
        : people.length === 0 ? <Text style={s.text}>{t('exam.shareNone')}</Text>
        : people.map(p => {
          const on = grants.some(g => g.grantee_user_id === p.userId && !g.revoked_at);
          return (
            <View key={p.userId} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.text}>{p.name}</Text>
                <Text style={s.muted}>{on ? t('exam.shareOn') : t('exam.shareOff')}</Text>
              </View>
              {busy === p.userId ? <ActivityIndicator color={C.trackPrimary} /> : (
                <Switch
                  value={on}
                  onValueChange={v => void toggle(p, v)}
                  accessibilityLabel={`${p.name}: ${on ? t('exam.shareOn') : t('exam.shareOff')}`}
                  trackColor={{ true: C.trackPrimary, false: C.trackBorder }}
                />
              )}
            </View>
          );
        })}
      {error ? <Text style={s.error}>{t('exam.shareFailed')}</Text> : null}
    </AnyvoBottomSheet>
  );
}

const s = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 52 },
  text:  { fontSize: 15, color: C.trackText },
  muted: { fontSize: 13, color: C.trackTextSec, marginBottom: 6 },
  error: { fontSize: 13, color: C.trackDanger, marginTop: 8 },
});
