import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { AnyvoCard } from '@/components/ui/AnyvoCard';
import { useT, type TranslationKey } from '@/i18n';
import { formatTime } from '@/i18n/format';
import { C } from '@/constants/colors';
import {
  contactLink, createContactCode, parseContactCode, sendContactRequest,
  type ContactCode, type ContactSendResult, type ContactVia,
} from '@/services/contactService';
import { ContactQrCode } from '@/features/contacts/ContactQrCode';
import { ContactScreenHeader } from '@/features/contacts/ContactScreenHeader';
import { contactStyles as cs } from '@/features/contacts/contactStyles';

const RESULT_TEXT: Record<ContactSendResult, TranslationKey> = {
  sent: 'contacts.resultSent', already_connected: 'contacts.resultAlready', incoming_pending: 'contacts.resultIncoming',
  blocked_by_you: 'contacts.resultBlockedByYou', invalid_code: 'contacts.resultInvalidCode', not_found: 'contacts.resultNotFound',
  self: 'contacts.resultSelf', rate_limited: 'contacts.resultRateLimited', failed: 'contacts.actionFailed',
};

export default function AddContactScreen() {
  const { code: linkCode } = useLocalSearchParams<{ code?: string }>();
  const { t } = useT();
  const [qr, setQr] = useState<ContactCode | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [codeInput, setCodeInput] = useState(() => (typeof linkCode === 'string' ? parseContactCode(linkCode) : ''));
  const [usernameInput, setUsernameInput] = useState('');
  const [sending, setSending] = useState<ContactVia | null>(null);
  const [result, setResult] = useState<{ via: ContactVia; value: ContactSendResult } | null>(null);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const fromLink = typeof linkCode === 'string' && parseContactCode(linkCode).length > 0;

  // Ein abgelaufener Code wird nicht weiter angezeigt.
  useEffect(() => {
    if (!qr) return;
    const remaining = new Date(qr.expiresAt).getTime() - Date.now();
    const timer = setTimeout(() => { if (alive.current) setQr(null); }, Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [qr]);

  const showCode = useCallback(async () => {
    if (qrBusy) return;
    setQrBusy(true); setFailed(false);
    const created = await createContactCode('qr');
    if (!alive.current) return;
    setQrBusy(false);
    if (created) setQr(created); else setFailed(true);
  }, [qrBusy]);

  const shareLink = useCallback(async () => {
    if (shareBusy) return;
    setShareBusy(true); setFailed(false);
    const created = await createContactCode('link');
    if (!alive.current) return;
    setShareBusy(false);
    if (!created) { setFailed(true); return; }
    try {
      await Share.share({ message: t('contacts.shareMessage', { link: contactLink(created.code), code: created.code }) });
    } catch { /* Teilen abgebrochen: kein Fehler */ }
  }, [shareBusy, t]);

  const send = async (via: ContactVia, value: string) => {
    if (sending) return;
    setSending(via); setResult(null);
    const outcome = await sendContactRequest(via, value);
    if (!alive.current) return;
    setSending(null); setResult({ via, value: outcome });
    if (outcome === 'sent') { if (via === 'code') setCodeInput(''); else setUsernameInput(''); }
  };

  const resultLine = (via: ContactVia) => result?.via === via
    ? <Text style={[cs.body, { color: result.value === 'sent' ? C.trackPrimary : C.trackText }]} accessibilityRole="alert" accessibilityLiveRegion="polite">{t(RESULT_TEXT[result.value])}</Text>
    : null;

  return (
    <View style={cs.root}>
      <SafeAreaView edges={['top']} style={cs.flex}>
        <ContactScreenHeader title={t('contacts.add')} />
        <KeyboardAvoidingView style={cs.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={cs.scroll} keyboardShouldPersistTaps="handled">
            <Text style={cs.body}>{t('contacts.addIntro')}</Text>
            {failed ? <Text style={cs.body} accessibilityRole="alert">{t('contacts.actionFailed')}</Text> : null}

            <AnyvoCard>
              <Text style={cs.section}>{t('contacts.enterCode')}</Text>
              {fromLink ? <Text style={cs.hint}>{t('contacts.codeFromLink')}</Text> : null}
              <TextInput style={[cs.input, { marginTop: 8, letterSpacing: 2 }]} value={codeInput}
                onChangeText={value => { setCodeInput(parseContactCode(value)); setResult(null); }}
                placeholder={t('contacts.codePlaceholder')} placeholderTextColor={C.trackTextMut}
                accessibilityLabel={t('contacts.enterCode')} autoCapitalize="characters" autoCorrect={false} maxLength={32} />
              <View style={cs.actions}>
                <AnyvoButton style={cs.flex} label={t('contacts.send')} loading={sending === 'code'}
                  disabled={codeInput.length < 6 || !!sending} onPress={() => { void send('code', codeInput); }} />
              </View>
              {resultLine('code')}
            </AnyvoCard>

            <AnyvoCard>
              <Text style={cs.section}>{t('contacts.myCode')}</Text>
              {qr ? (
                <View style={{ alignItems: 'center', gap: 10 }}>
                  <ContactQrCode value={contactLink(qr.code)} size={220} accessibilityLabel={t('contacts.qrLabel')} />
                  <Text style={[cs.rowTitle, { fontSize: 22, letterSpacing: 3 }]} selectable>{qr.code}</Text>
                  <Text style={cs.hint}>{t('contacts.codeValid', { time: formatTime(new Date(qr.expiresAt)) })}</Text>
                  <Text style={[cs.hint, { textAlign: 'center' }]}>{t('contacts.codeScanHint')}</Text>
                  <AnyvoButton label={t('contacts.newCode')} variant="secondary" loading={qrBusy} onPress={() => { void showCode(); }} />
                </View>
              ) : (
                <AnyvoButton label={t('contacts.showCode')} icon="qr-code-outline" variant="secondary" loading={qrBusy} onPress={() => { void showCode(); }} />
              )}
              <View style={cs.actions}>
                <AnyvoButton style={cs.flex} label={t('contacts.shareLink')} icon="share-outline" variant="secondary" loading={shareBusy} onPress={() => { void shareLink(); }} />
              </View>
            </AnyvoCard>

            <AnyvoCard>
              <Text style={cs.section}>{t('contacts.enterUsername')}</Text>
              <TextInput style={cs.input} value={usernameInput}
                onChangeText={value => { setUsernameInput(value); setResult(null); }}
                placeholder={t('contacts.usernamePlaceholder')} placeholderTextColor={C.trackTextMut}
                accessibilityLabel={t('contacts.enterUsername')} autoCapitalize="none" autoCorrect={false} maxLength={25} />
              <View style={cs.actions}>
                <AnyvoButton style={cs.flex} label={t('contacts.send')} loading={sending === 'username'}
                  disabled={usernameInput.trim().replace(/^@+/, '').length < 3 || !!sending} onPress={() => { void send('username', usernameInput); }} />
              </View>
              {resultLine('username')}
            </AnyvoCard>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
