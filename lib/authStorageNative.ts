import { requireOptionalNativeModule } from 'expo';
import type { AuthCipher, SecretStore } from '@/lib/secureAuthStorage';

// Native Bausteine für lib/secureAuthStorage.ts. Beide Module werden nur
// geladen, wenn ihr natives Gegenstück im installierten Build vorhanden ist.
// Builds bis iOS 60 / Android 53 enthalten `ExpoSecureStore` nicht → null →
// der Anmeldespeicher bleibt exakt wie bisher (Klartext in AsyncStorage).

export function loadNativeSecretStore(): SecretStore | null {
  try {
    if (!requireOptionalNativeModule('ExpoSecureStore')) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
    // Auch nach Neustart verfügbar, sobald einmal entsperrt (Hintergrund-GPS,
    // Token-Erneuerung), nie auf ein anderes Gerät oder in ein Backup übertragen.
    const options = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
    return {
      get: key => SecureStore.getItemAsync(key, options),
      set: (key, value) => SecureStore.setItemAsync(key, value, options),
      delete: key => SecureStore.deleteItemAsync(key, options),
    };
  } catch {
    return null;
  }
}

export function loadNativeAuthCipher(): AuthCipher | null {
  try {
    if (!requireOptionalNativeModule('ExpoCryptoAES')) return null;
    if (typeof TextEncoder === 'undefined' || typeof TextDecoder === 'undefined') return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Crypto = require('expo-crypto') as typeof import('expo-crypto');
    // UTF-8-Bytes statt btoa: Sitzungen enthalten Namen mit Umlauten.
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    return {
      async generateKey() {
        const key = await Crypto.AESEncryptionKey.generate(256);
        return key.encoded('base64');
      },
      async encrypt(plaintext, keyB64) {
        const key = await Crypto.AESEncryptionKey.import(keyB64, 'base64');
        const sealed = await Crypto.aesEncryptAsync(encoder.encode(plaintext), key);
        return (await sealed.combined('base64')) as string;
      },
      async decrypt(sealedB64, keyB64) {
        const key = await Crypto.AESEncryptionKey.import(keyB64, 'base64');
        const sealed = Crypto.AESSealedData.fromCombined(sealedB64);
        const bytes = (await Crypto.aesDecryptAsync(sealed, key, { output: 'bytes' })) as Uint8Array;
        return decoder.decode(bytes);
      },
    };
  } catch {
    return null;
  }
}
