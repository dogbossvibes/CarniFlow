import { Alert } from 'react-native';
import type { QuotaKind } from '@/features/subscription/plans';

type Translate = (key: any, params?: any) => string;

// Zentrale UX für einen abgewiesenen NEWBIE-Quota-Claim.
// Rückgabe true = es war ein Quota-Fehler (Aufrufer bricht ab, kein weiterer Alert).
//   • quota_exceeded → klare Limit-Meldung + ACTIVE-CTA (öffnet Paywall).
//   • quota_error    → verständlicher Retry-Hinweis (KEIN automatisches /premium;
//                      Netzwerkfehler ist kein Upgrade-Grund).
export function handleQuotaBlock(
  error: unknown,
  kind: QuotaKind,
  t: Translate,
  onUpgrade: () => void,
): boolean {
  const code = (error as { code?: string } | null | undefined)?.code;

  if (code === 'quota_exceeded') {
    const body = kind === 'track' ? t('premium.newbieTrackLimit') : t('premium.newbieTrainingLimit');
    Alert.alert(t('premium.newbieLimitTitle'), body, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('premium.upgradeActive'), onPress: onUpgrade },
    ]);
    return true;
  }
  if (code === 'quota_error') {
    Alert.alert(t('common.error'), t('premium.quotaCheckFailed'));
    return true;
  }
  return false;
}
