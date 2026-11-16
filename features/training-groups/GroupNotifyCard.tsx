import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { AnyvoCard } from '@/components/ui/AnyvoCard';
import { C } from '@/constants/colors';
import { useT, type TranslationKey } from '@/i18n';
import { contactStyles as cs } from '@/features/contacts/contactStyles';
import type { createGroupNotifyService, GroupNotifySettings } from '@/features/tracking-exchange/groups/notifyService';

const ROWS: { key: keyof GroupNotifySettings; label: TranslationKey }[] = [
  { key: 'joinRequests', label: 'groups.notifyJoin' },
  { key: 'trackReady', label: 'groups.notifyReady' },
  { key: 'trackSearched', label: 'groups.notifySearched' },
  { key: 'trainingStarted', label: 'groups.notifyStarted' },
];

type Service = ReturnType<typeof createGroupNotifyService>;

/** Mitteilungs-Einstellungen für Gruppentrainings (Stufe 3). Ohne Server-Antwort keine Schalter. */
export function GroupNotifyCard({ service }: { service: Service | null }) {
  const { t } = useT();
  // Die Antwort merkt sich, zu welchem Dienst sie gehört: nach einem Kontowechsel gelten die
  // alten Schalter sofort nicht mehr, ohne den Zustand im Effekt zurückzusetzen.
  const [loaded, setLoaded] = useState<{ service: Service; settings: GroupNotifySettings } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!service) return;
    let alive = true;
    void service.get().then(v => { if (alive) setLoaded({ service, settings: v }); }).catch(() => undefined);
    return () => { alive = false; };
  }, [service]);
  const settings = service && loaded?.service === service ? loaded.settings : null;
  if (!service || !settings) return null;
  const setSettings = (next: GroupNotifySettings) => setLoaded({ service, settings: next });
  const toggle = (key: keyof GroupNotifySettings, value: boolean) => {
    const before = settings;
    setSettings({ ...settings, [key]: value });
    setBusy(true);
    void service.set({ [key]: value }).then(setSettings).catch(() => setSettings(before)).finally(() => setBusy(false));
  };
  return (
    <AnyvoCard>
      <Text style={cs.section}>{t('groups.notifyTitle')}</Text>
      {ROWS.map(row => (
        <View key={row.key} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 10 }}>
          <Text style={[cs.body, { flex: 1 }]}>{t(row.label)}</Text>
          <Switch value={settings[row.key]} disabled={busy} onValueChange={v => toggle(row.key, v)} accessibilityLabel={t(row.label)}
            trackColor={{ true: C.trackPrimary, false: C.trackCardAlt }} />
        </View>
      ))}
      <Text style={[cs.hint, { marginTop: 6 }]}>{t('groups.notifyHint')}</Text>
    </AnyvoCard>
  );
}
