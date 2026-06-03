import {
  CryptoDigestAlgorithm,
  digest as expoDigest,
} from 'expo-crypto';

// Patch crypto.subtle.digest if the platform (Expo Go / older Hermes) does not
// provide it natively. Required for Supabase PKCE code-challenge generation.
// On RN 0.74+ / modern Hermes this entire block is a no-op.
if (typeof globalThis.crypto?.subtle?.digest !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;

  if (!g.crypto) g.crypto = {};

  g.crypto.subtle = {
    digest(
      algorithm: string | { name: string },
      data: ArrayBuffer | ArrayBufferView
    ): Promise<ArrayBuffer> {
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name;

      const alg =
        name === 'SHA-1'   ? CryptoDigestAlgorithm.SHA1   :
        name === 'SHA-384' ? CryptoDigestAlgorithm.SHA384 :
        name === 'SHA-512' ? CryptoDigestAlgorithm.SHA512 :
        CryptoDigestAlgorithm.SHA256;

      // expo-crypto's digest() accepts BufferSource — cast to silence strict
      // ArrayBufferView<ArrayBuffer> vs ArrayBufferView<ArrayBufferLike> mismatch.
      return expoDigest(alg, data as ArrayBuffer);
    },
  };
}
