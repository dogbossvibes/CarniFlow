import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { isQaDiagnosticsEnabled, subscribeQaDiagnostics } from '@/features/tracking/utils/qaDiagnosticsMode';
import { diagnosticsAccessToken, subscribeDiagnosticsAccess } from '@/lib/diagnosticsAccessState';
import type { QaReferenceKind, QaReferenceMark } from '@/features/tracking/utils/qaSessionCapture';

type Handle = { mark: QaReferenceMark; token: string };
const choices: { kind: QaReferenceKind; label: string }[] = [
  { kind: 'rechts', label: 'Rechts' }, { kind: 'links', label: 'Links' },
  { kind: 'spitz_rechts', label: 'Spitz rechts' }, { kind: 'spitz_links', label: 'Spitz links' },
];

/** Nur Feldtest-Referenz: Die Erfassung passiert beim ersten Tippen. */
export function QaReferenceMarker({ paused, hidden, mark, label }: {
  paused: boolean; hidden: boolean; mark: () => Handle | null; label: (handle: Handle, kind: QaReferenceKind) => void;
}) {
  const [qa, setQa] = useState(isQaDiagnosticsEnabled);
  const [access, setAccess] = useState(() => !!diagnosticsAccessToken());
  const [pending, setPending] = useState<Handle | null>(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState(false);
  useEffect(() => subscribeQaDiagnostics(setQa), []);
  useEffect(() => subscribeDiagnosticsAccess(() => setAccess(!!diagnosticsAccessToken())), []);
  if (!qa || !access) return null;
  return <View style={{ marginHorizontal: 18, marginBottom: 8, display: hidden ? 'none' : 'flex' }}>
    {!pending ? <Pressable accessibilityRole="button" accessibilityLabel="Sollwinkel zum Feldtest markieren" disabled={paused} onPress={() => {
      const handle = mark();
      if (!handle) { setError(true); return; }
      setError(false); setCount(n => n + 1); setPending(handle);
    }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#17413c', opacity: paused ? 0.5 : 1 }}>
      <Text style={{ color: 'white', fontWeight: '700' }}>Sollwinkel markieren · {count}</Text>
    </Pressable> : <View>
      <Text style={{ color: 'white', marginBottom: 4 }}>Zeit markiert – Richtung wählen:</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {choices.map(c => <Pressable key={c.kind} accessibilityRole="button" onPress={() => { label(pending, c.kind); setPending(null); }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: '#17413c', borderRadius: 8 }}><Text style={{ color: 'white' }}>{c.label}</Text></Pressable>)}
        <Pressable accessibilityRole="button" onPress={() => setPending(null)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}><Text style={{ color: 'white' }}>Unbekannt</Text></Pressable>
      </View>
    </View>}
    {error && <Text style={{ color: '#ffb9a9' }}>Markierung nicht möglich: GPS-Diagnose noch nicht bereit oder Limit erreicht.</Text>}
  </View>;
}
