import { Linking, Platform } from 'react-native';

// ── App bewerten: Store-Seite zum Schreiben einer Bewertung öffnen ──
// Reines JS (Linking), kein natives Zusatzmodul: per OTA auslieferbar.
// App-Store-ID aus eas.json (submit.production.ios.ascAppId).

export const IOS_APP_STORE_ID = '6776362904';
export const ANDROID_PACKAGE = 'com.anyvo.app';

/** Reihenfolge der URLs je Plattform: zuerst Store-App, dann Web-Fallback. */
export function storeReviewUrls(os: string): string[] {
  if (os === 'ios') {
    return [
      `itms-apps://apps.apple.com/app/id${IOS_APP_STORE_ID}?action=write-review`,
      `https://apps.apple.com/app/id${IOS_APP_STORE_ID}?action=write-review`,
    ];
  }
  if (os === 'android') {
    return [
      `market://details?id=${ANDROID_PACKAGE}`,
      `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`,
    ];
  }
  return [];
}

type Opener = Pick<typeof Linking, 'openURL'>;

/**
 * Öffnet die Bewertungsseite im Store. Versucht die URLs der Reihe nach;
 * gibt `true` zurück, sobald eine aufging, sonst `false`.
 * Bewusst ohne `canOpenURL`: dafür müssten die Schemata in
 * LSApplicationQueriesSchemes stehen (nativer Build). `openURL` lehnt bei
 * fehlendem Ziel ab und wir fallen auf die nächste URL zurück.
 */
export async function openStoreReviewPage(
  os: string = Platform.OS,
  opener: Opener = Linking,
): Promise<boolean> {
  for (const url of storeReviewUrls(os)) {
    try {
      await opener.openURL(url);
      return true;
    } catch {
      // nächste URL versuchen
    }
  }
  return false;
}
