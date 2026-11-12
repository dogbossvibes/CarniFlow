import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { AnyvoCard } from '@/components/ui/AnyvoCard';
import { useT } from '@/i18n';
import { C } from '@/constants/colors';
import { ContactScreenHeader } from '@/features/contacts/ContactScreenHeader';
import { contactStyles as cs } from '@/features/contacts/contactStyles';
import type { GroupErrorCode } from '@/features/tracking-exchange/groups/groupRpc';
import { formatGroupCode, GROUP_CODE_LENGTH, parseGroupCode, type GroupJoinPreview } from '@/features/tracking-exchange/groups/joinService';
import { groupErrorCode, groupErrorText, useGroupServices } from './groupHub';

type Phase = { kind: 'idle' } | { kind: 'invalid' } | { kind: 'preview'; code: string; preview: GroupJoinPreview } | { kind: 'sent'; groupTitle: string };

export default function GroupJoinScreen() {
  const { code: linkCode } = useLocalSearchParams<{ code?: string }>();
  const router = useRouter();
  const { t } = useT();
  const services = useGroupServices();
  const initialCode = typeof linkCode === 'string' ? parseGroupCode(linkCode) : '';
  const [code, setCode] = useState(initialCode);
  const [displayName, setDisplayName] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<GroupErrorCode | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const check = async (value: string) => {
    const join = services.join;
    if (!join || busy || value.length !== GROUP_CODE_LENGTH) return;
    setBusy(true); setError(null);
    try {
      const preview = await join.preview(value);
      if (!alive.current) return;
      setPhase(preview ? { kind: 'preview', code: value, preview } : { kind: 'invalid' });
    } catch (e) {
      if (alive.current) setError(groupErrorCode(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  // Aus einem Link: direkt prüfen. Gezeigt werden nur Gruppenname und einladende Person.
  const checkedLink = useRef(false);
  useEffect(() => {
    if (checkedLink.current || initialCode.length !== GROUP_CODE_LENGTH || !services.join) return;
    checkedLink.current = true;
    void check(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur einmal je geöffnetem Link
  }, [services.join]);

  const send = async () => {
    const join = services.join;
    if (!join || busy || phase.kind !== 'preview') return;
    setBusy(true); setError(null);
    try {
      const request = await join.request(phase.code, displayName);
      if (!alive.current) return;
      setPhase(request ? { kind: 'sent', groupTitle: request.groupTitle } : { kind: 'invalid' });
    } catch (e) {
      if (alive.current) setError(groupErrorCode(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const errorKey = groupErrorText(error);
  const preview = phase.kind === 'preview' ? phase.preview : null;
  return (
    <View style={cs.root}>
      <SafeAreaView edges={['top']} style={cs.flex}>
        <ContactScreenHeader title={t('groups.joinTitle')} />
        <KeyboardAvoidingView style={cs.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={cs.scroll} keyboardShouldPersistTaps="handled">
            <Text style={cs.body}>{t('groups.joinIntro')}</Text>
            {errorKey ? <Text style={[cs.body, { color: C.trackDanger }]} accessibilityRole="alert" accessibilityLiveRegion="polite">{t(errorKey)}</Text> : null}

            {phase.kind === 'sent' ? (
              <AnyvoCard>
                <Text style={cs.rowTitle}>{phase.groupTitle}</Text>
                <Text style={[cs.body, { color: C.trackPrimary, marginTop: 6 }]} accessibilityRole="alert" accessibilityLiveRegion="polite">{t('groups.requestSent')}</Text>
                <View style={cs.actions}>
                  <AnyvoButton style={cs.flex} label={t('groups.toOverview')} onPress={() => router.replace('/groups' as never)} />
                </View>
              </AnyvoCard>
            ) : (
              <AnyvoCard>
                <Text style={cs.section}>{t('groups.codeLabel')}</Text>
                {initialCode ? <Text style={cs.hint}>{t('groups.codeFromLink')}</Text> : null}
                <TextInput style={[cs.input, { marginTop: 8, letterSpacing: 2 }]} value={formatGroupCode(code)}
                  onChangeText={value => { setCode(parseGroupCode(value)); setPhase({ kind: 'idle' }); setError(null); }}
                  placeholder={t('groups.codePlaceholder')} placeholderTextColor={C.trackTextMut} accessibilityLabel={t('groups.codeLabel')}
                  autoCapitalize="characters" autoCorrect={false} maxLength={GROUP_CODE_LENGTH + 2} />
                {phase.kind === 'invalid' ? <Text style={[cs.body, { marginTop: 8 }]} accessibilityRole="alert">{t('groups.invalidCode')}</Text> : null}
                {!preview ? (
                  <View style={cs.actions}>
                    <AnyvoButton style={cs.flex} label={t('groups.check')} loading={busy}
                      disabled={code.length !== GROUP_CODE_LENGTH || busy} onPress={() => { void check(code); }} />
                  </View>
                ) : (
                  <View style={{ gap: 8, marginTop: 12 }}>
                    <Text style={cs.rowTitle}>{t('groups.previewLine', { group: preview.groupTitle, name: preview.inviterName })}</Text>
                    {preview.status === 'member' ? <Text style={cs.body}>{t('groups.alreadyMember')}</Text> : null}
                    {preview.status === 'pending' ? <Text style={cs.body}>{t('groups.alreadyPending')}</Text> : null}
                    {preview.status === 'none' ? (
                      <>
                        <Text style={cs.hint}>{t('groups.displayName')}</Text>
                        <TextInput style={cs.input} value={displayName} onChangeText={setDisplayName} maxLength={60}
                          placeholder={t('groups.displayNamePlaceholder')} placeholderTextColor={C.trackTextMut} accessibilityLabel={t('groups.displayName')} />
                        <View style={cs.actions}>
                          <AnyvoButton style={cs.flex} label={t('groups.sendRequest')} loading={busy}
                            disabled={!displayName.trim() || busy} onPress={() => { void send(); }} />
                        </View>
                      </>
                    ) : (
                      <View style={cs.actions}>
                        <AnyvoButton style={cs.flex} label={t('groups.toOverview')} variant="secondary" onPress={() => router.replace('/groups' as never)} />
                      </View>
                    )}
                  </View>
                )}
              </AnyvoCard>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
