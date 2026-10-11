import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { connectAnyvoPerson, searchAnyvoPeople, type AnyvoPersonResult } from '@/services/connectionService';
import { C } from '@/constants/colors';
import { TransferApiError } from './rpc';
import './i18n';
/** Explicit, bounded existing ANYVO-person search. Connecting alone grants no data sharing. */
export function TransferContactSearch({ userId, epoch, disabled, onConnected }: {
  userId: string; epoch(): number; disabled: boolean; onConnected(userId: string): void;
}) {
  const { t } = useTranslation('trackTransfer');
  const [query, setQuery] = useState(''), [people, setPeople] = useState<AnyvoPersonResult[]>([]);
  const [busy, setBusy] = useState(false), [searched, setSearched] = useState(false), [failed, setFailed] = useState(false);
  const alive = useRef(true), expectedEpoch = useRef(epoch()), generation = useRef(0), lock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const current = () => alive.current && expectedEpoch.current === epoch();
  const check = () => { if (!current()) throw new TransferApiError('ACCOUNT_CHANGED'); };
  const search = async () => {
    if (disabled || lock.current || query.trim().length < 2 || !current()) return;
    lock.current = true; setBusy(true); setFailed(false); setPeople([]); const version = ++generation.current;
    try { const rows = await searchAnyvoPeople(query.trim(), true); check();
      if (version === generation.current) { setPeople(rows.filter(p => p.id !== userId)); setSearched(true); }
    } catch { if (current()) setFailed(true); }
    finally { lock.current = false; if (current()) setBusy(false); }
  };
  const connect = async (person: AnyvoPersonResult) => {
    if (disabled || lock.current || !current() || !people.some(p => p.id === person.id)) return;
    lock.current = true; setBusy(true); setFailed(false);
    try {
      const result = await connectAnyvoPerson(userId, person.id, check); check();
      if (result.error || result.data?.status !== 'accepted' || result.data.owner_user_id !== userId || result.data.connected_user_id !== person.id) {
        throw new TransferApiError('CONNECTION');
      }
      onConnected(person.id); setPeople([]); setQuery(''); setSearched(false);
    } catch { if (current()) setFailed(true); }
    finally { lock.current = false; if (current()) setBusy(false); }
  };
  return <View style={styles.panel}>
    <Text style={styles.hint}>{t('connectionInfo')}</Text>
    <TextInput accessibilityLabel={t('personQuery')} placeholder={t('personQuery')} placeholderTextColor={C.trackTextMut}
      value={query} maxLength={80} editable={!busy && !disabled} autoCapitalize="none" autoCorrect={false} style={styles.input}
      onChangeText={value => { generation.current++; setQuery(value); setPeople([]); setSearched(false); setFailed(false); }} />
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || disabled || query.trim().length < 2 }}
      disabled={busy || disabled || query.trim().length < 2} style={styles.button} onPress={() => { void search(); }}>
      <Text style={styles.action}>{t('searchPeople')}</Text>
    </Pressable>
    {failed && <Text accessibilityRole="alert" style={styles.hint}>{t('failure')}</Text>}
    {searched && !people.length && !failed && <Text style={styles.hint}>{t('noPeople')}</Text>}
    {people.map(p => <Pressable key={p.id} accessibilityRole="button" disabled={busy || disabled} style={styles.button}
      onPress={() => { void connect(p); }}><Text style={styles.action}>{t('connectPerson')}: {p.fullName ?? p.username ?? t('contact')}</Text></Pressable>)}
  </View>;
}
const styles = StyleSheet.create({ panel: { gap: 8 }, hint: { fontSize: 13, lineHeight: 20, color: C.trackTextMut },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, color: C.trackText, paddingHorizontal: 12, fontSize: 15 },
  button: { minHeight: 48, padding: 12, justifyContent: 'center', borderRadius: 12, backgroundColor: C.accentDim }, action: { color: C.accent, fontSize: 15, fontWeight: '700' } });
