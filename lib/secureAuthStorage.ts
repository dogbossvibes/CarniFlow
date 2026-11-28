// ── Verschlüsselter Speicher für die Supabase-Anmeldesitzung (Issue #112) ──
//
// Bisher lag die Sitzung (Access- und Refresh-Token) im Klartext in
// AsyncStorage. Jetzt:
//   - Pro Speicherschlüssel ein zufälliger AES-256-Schlüssel im System-
//     Schlüsselbund (expo-secure-store: iOS Keychain / Android Keystore).
//   - Die Sitzung selbst AES-GCM-verschlüsselt in AsyncStorage
//     (SecureStore lehnt grosse Werte teils ab; Sitzungen sind oft > 2 KB).
//
// ZWINGEND: Niemand wird durch das Update abgemeldet.
//   - Klartext-Sitzung aus dem alten Speicher wird beim ersten Lesen
//     übernommen: verschlüsselt schreiben → zurücklesen und vergleichen →
//     erst danach den alten Eintrag entfernen. Jeder Fehler lässt den alten
//     Eintrag stehen und liefert ihn unverändert zurück.
//   - Ohne natives Modul (Builds vor diesem Release, Web, Tests) verhält sich
//     der Speicher exakt wie bisher (reines AsyncStorage). Dadurch ist der
//     Code auch dann harmlos, wenn er versehentlich per OTA auf einen alten
//     Build käme.
//   - WICHTIG für spätere Änderungen: Diesen Adapter nicht ersatzlos
//     entfernen. Ein Zurück auf reines AsyncStorage fände die Sitzung nicht
//     mehr und meldete alle Nutzer ab (Rückweg vorher migrieren).
//
// Andere AsyncStorage-Daten (Offline-Einträge, Einstellungen) werden nicht
// gelesen, verändert oder gelöscht.

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Ablage für den Schlüssel (SecureStore). */
export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Symmetrische, authentisierte Verschlüsselung (AES-GCM). */
export interface AuthCipher {
  generateKey(): Promise<string>;
  encrypt(plaintext: string, key: string): Promise<string>;
  decrypt(sealed: string, key: string): Promise<string>;
}

export interface SecureAuthStorageDeps {
  /** Bisheriger Speicher (AsyncStorage); hält künftig nur den verschlüsselten Wert. */
  store: KeyValueStore;
  /** Fehlt (null), arbeitet der Adapter exakt wie bisher mit Klartext in `store`. */
  secrets: SecretStore | null;
  cipher: AuthCipher | null;
  onError?: (stage: string, error: unknown) => void;
}

export const ENCRYPTED_SUFFIX = '.enc.v1';
export const SEALED_PREFIX = 'v1:';
const SECRET_PREFIX = 'anyvo_auth_key_v1.';

export const encryptedKeyFor = (key: string) => `${key}${ENCRYPTED_SUFFIX}`;
/** SecureStore erlaubt nur A–Z, a–z, 0–9, ".", "-" und "_". */
export const secretKeyFor = (key: string) => `${SECRET_PREFIX}${key.replace(/[^A-Za-z0-9._-]/g, '_')}`;

export function createSecureAuthStorage(deps: SecureAuthStorageDeps): KeyValueStore {
  const { store, secrets, cipher } = deps;
  const report = (stage: string, error: unknown) => {
    try { deps.onError?.(stage, error); } catch { /* Meldung darf nie stören */ }
  };

  // Ohne natives Modul: unverändertes bisheriges Verhalten.
  if (!secrets || !cipher) {
    return {
      getItem: key => store.getItem(key),
      setItem: (key, value) => store.setItem(key, value),
      removeItem: key => store.removeItem(key),
    };
  }

  // Alle Zugriffe nacheinander: verhindert, dass zwei gleichzeitige Umzüge
  // unterschiedliche Schlüssel erzeugen und sich gegenseitig überschreiben.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  // Speicher-Cache, damit nicht jeder getSession()-Aufruf den Schlüsselbund liest.
  const keyCache = new Map<string, string>();
  const plainCache = new Map<string, { sealed: string; plain: string }>();

  async function readKey(key: string): Promise<string | null> {
    const cached = keyCache.get(key);
    if (cached) return cached;
    const stored = await secrets!.get(secretKeyFor(key));
    if (stored) keyCache.set(key, stored);
    return stored;
  }

  async function ensureKey(key: string): Promise<string> {
    const existing = await readKey(key);
    if (existing) return existing;
    const created = await cipher!.generateKey();
    await secrets!.set(secretKeyFor(key), created);
    keyCache.set(key, created);
    return created;
  }

  /** Liefert den entschlüsselten Wert, null wenn keiner da; wirft bei Fehlern. */
  async function readEncrypted(key: string): Promise<string | null> {
    const raw = await store.getItem(encryptedKeyFor(key));
    if (raw == null) return null;
    const cached = plainCache.get(key);
    if (cached && cached.sealed === raw) return cached.plain;
    if (!raw.startsWith(SEALED_PREFIX)) throw new Error('Unbekanntes Format');
    const secret = await readKey(key);
    if (!secret) throw new Error('Schlüssel fehlt');
    const plain = await cipher!.decrypt(raw.slice(SEALED_PREFIX.length), secret);
    plainCache.set(key, { sealed: raw, plain });
    return plain;
  }

  /** Schreibt verschlüsselt; `written.done` meldet, ob die Kopie schon angefasst wurde. */
  async function writeEncrypted(key: string, value: string, written?: { done: boolean }): Promise<void> {
    const secret = await ensureKey(key);
    const sealed = SEALED_PREFIX + await cipher!.encrypt(value, secret);
    if (written) written.done = true; // ab hier kann die Kopie verändert sein
    await store.setItem(encryptedKeyFor(key), sealed);
    plainCache.set(key, { sealed, plain: value });
  }

  /** Klartext → verschlüsselt. Alter Eintrag wird nur nach geprüftem Erfolg entfernt. */
  async function migrate(key: string, legacy: string): Promise<void> {
    const written = { done: false };
    try {
      await writeEncrypted(key, legacy, written);
      plainCache.delete(key); // echtes Zurücklesen erzwingen
      const check = await readEncrypted(key);
      if (check !== legacy) throw new Error('Prüfung nach dem Umzug fehlgeschlagen');
    } catch (error) {
      report('migrate', error);
      plainCache.delete(key);
      // Nur eine in diesem Umzug geschriebene (ungeprüfte) Kopie verwerfen,
      // damit der alte Eintrag massgeblich bleibt. Sonst nichts anfassen.
      if (written.done) {
        try { await store.removeItem(encryptedKeyFor(key)); } catch (e) { report('migrate-cleanup', e); }
      }
      return;
    }
    try { await store.removeItem(key); } catch (error) { report('migrate-remove-legacy', error); }
  }

  return {
    getItem: key => serial(async () => {
      try {
        const value = await readEncrypted(key);
        if (value != null) return value;
      } catch (error) {
        // Unlesbare Kopie (z. B. Schlüssel nach Android-Wiederherstellung weg):
        // nichts löschen, auf den alten Eintrag zurückfallen, falls vorhanden.
        report('read', error);
      }
      const legacy = await store.getItem(key);
      if (legacy == null) return null;
      // Der alte Wert wird in jedem Fall geliefert – auch wenn der Umzug scheitert.
      await migrate(key, legacy);
      return legacy;
    }),

    setItem: (key, value) => serial(async () => {
      try {
        await writeEncrypted(key, value);
      } catch (error) {
        report('write', error);
        plainCache.delete(key);
        // Rückfall auf den bisherigen Weg, damit die Sitzung erhalten bleibt.
        await store.setItem(key, value);
        try { await store.removeItem(encryptedKeyFor(key)); } catch (e) { report('write-cleanup', e); }
        return;
      }
      try { await store.removeItem(key); } catch (error) { report('write-remove-legacy', error); }
    }),

    removeItem: key => serial(async () => {
      plainCache.delete(key);
      keyCache.delete(key);
      let firstError: unknown = null;
      for (const storeKey of [encryptedKeyFor(key), key]) {
        try { await store.removeItem(storeKey); } catch (error) { firstError ??= error; }
      }
      try { await secrets.delete(secretKeyFor(key)); } catch (error) { report('remove-secret', error); }
      if (firstError) throw firstError;
    }),
  };
}
