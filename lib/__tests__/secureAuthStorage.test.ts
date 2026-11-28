import {
  createSecureAuthStorage, encryptedKeyFor, secretKeyFor, SEALED_PREFIX,
  type AuthCipher, type KeyValueStore, type SecretStore,
} from '@/lib/secureAuthStorage';

const KEY = 'sb-axkkhyqrjrtbkumaulta-auth-token';
const SESSION = JSON.stringify({
  access_token: 'acc', refresh_token: 'ref',
  user: { id: 'u1', user_metadata: { full_name: 'Zoë Müller' } },
});

type Fail = Partial<Record<'get' | 'set' | 'remove', (key: string) => boolean>>;

function memoryStore(initial: Record<string, string> = {}, fail: Fail = {}) {
  const data = new Map(Object.entries(initial));
  const store: KeyValueStore = {
    async getItem(k) { if (fail.get?.(k)) throw new Error('get'); return data.has(k) ? data.get(k)! : null; },
    async setItem(k, v) { if (fail.set?.(k)) throw new Error('set'); data.set(k, v); },
    async removeItem(k) { if (fail.remove?.(k)) throw new Error('remove'); data.delete(k); },
  };
  return { data, store };
}

function memorySecrets(fail: { get?: boolean; set?: boolean; delete?: boolean } = {}) {
  const data = new Map<string, string>();
  const calls = { get: 0, set: 0 };
  const secrets: SecretStore = {
    async get(k) { calls.get++; if (fail.get) throw new Error('kc-get'); return data.get(k) ?? null; },
    async set(k, v) { calls.set++; if (fail.set) throw new Error('kc-set'); data.set(k, v); },
    async delete(k) { if (fail.delete) throw new Error('kc-del'); data.delete(k); },
  };
  return { data, secrets, calls };
}

// Fake-Chiffre: Ergebnis hängt vom Schlüssel ab, falscher Schlüssel → Fehler (wie GCM-Tag).
function fakeCipher(opts: { failEncrypt?: boolean; corrupt?: boolean } = {}): AuthCipher {
  let n = 0;
  return {
    async generateKey() { n += 1; return `key${n}`; },
    async encrypt(plain, key) {
      if (opts.failEncrypt) throw new Error('enc');
      return Buffer.from(`${key}|${plain}`, 'utf8').toString('base64');
    },
    async decrypt(sealed, key) {
      const text = Buffer.from(sealed, 'base64').toString('utf8');
      if (!text.startsWith(`${key}|`)) throw new Error('tag');
      const plain = text.slice(key.length + 1);
      return opts.corrupt ? `${plain}x` : plain;
    },
  };
}

describe('secureAuthStorage – Umzug bestehender Sitzungen', () => {
  it('übernimmt die Klartext-Sitzung, prüft sie und entfernt erst dann den alten Eintrag', async () => {
    const { data, store } = memoryStore({ [KEY]: SESSION, other: 'offline-eintrag' });
    const kc = memorySecrets();
    const storage = createSecureAuthStorage({ store, secrets: kc.secrets, cipher: fakeCipher() });

    await expect(storage.getItem(KEY)).resolves.toBe(SESSION);

    expect(data.has(KEY)).toBe(false);
    expect(data.get(encryptedKeyFor(KEY))?.startsWith(SEALED_PREFIX)).toBe(true);
    expect(data.get(encryptedKeyFor(KEY))).not.toContain('ref');
    expect(kc.data.get(secretKeyFor(KEY))).toBe('key1');
    expect(data.get('other')).toBe('offline-eintrag');

    // Neuer Adapter (App-Neustart) liest die verschlüsselte Sitzung.
    const restarted = createSecureAuthStorage({ store, secrets: kc.secrets, cipher: fakeCipher() });
    await expect(restarted.getItem(KEY)).resolves.toBe(SESSION);
  });

  it('liefert null ohne alten Eintrag und legt nichts an', async () => {
    const { data, store } = memoryStore();
    const kc = memorySecrets();
    const storage = createSecureAuthStorage({ store, secrets: kc.secrets, cipher: fakeCipher() });
    await expect(storage.getItem(KEY)).resolves.toBeNull();
    expect(data.size).toBe(0);
    expect(kc.data.size).toBe(0);
  });

  it('Schlüsselbund nicht beschreibbar: alter Eintrag bleibt, Sitzung wird geliefert', async () => {
    const { data, store } = memoryStore({ [KEY]: SESSION });
    const kc = memorySecrets({ set: true });
    const onError = jest.fn();
    const storage = createSecureAuthStorage({ store, secrets: kc.secrets, cipher: fakeCipher(), onError });

    await expect(storage.getItem(KEY)).resolves.toBe(SESSION);
    expect(data.get(KEY)).toBe(SESSION);
    expect(data.has(encryptedKeyFor(KEY))).toBe(false);
    expect(onError).toHaveBeenCalledWith('migrate', expect.any(Error));
  });

  it('Verschlüsseln schlägt fehl: alter Eintrag bleibt', async () => {
    const { data, store } = memoryStore({ [KEY]: SESSION });
    const storage = createSecureAuthStorage({
      store, secrets: memorySecrets().secrets, cipher: fakeCipher({ failEncrypt: true }),
    });
    await expect(storage.getItem(KEY)).resolves.toBe(SESSION);
    expect(data.get(KEY)).toBe(SESSION);
  });

  it('Teilfehler: verschlüsselte Kopie nicht speicherbar → alter Eintrag bleibt', async () => {
    const { data, store } = memoryStore({ [KEY]: SESSION }, { set: k => k === encryptedKeyFor(KEY) });
    const storage = createSecureAuthStorage({ store, secrets: memorySecrets().secrets, cipher: fakeCipher() });
    await expect(storage.getItem(KEY)).resolves.toBe(SESSION);
    expect(data.get(KEY)).toBe(SESSION);
  });

  it('Prüfung nach dem Umzug fehlgeschlagen: Kopie verworfen, alter Eintrag bleibt', async () => {
    const { data, store } = memoryStore({ [KEY]: SESSION });
    const storage = createSecureAuthStorage({
      store, secrets: memorySecrets().secrets, cipher: fakeCipher({ corrupt: true }),
    });
    await expect(storage.getItem(KEY)).resolves.toBe(SESSION);
    expect(data.get(KEY)).toBe(SESSION);
    expect(data.has(encryptedKeyFor(KEY))).toBe(false);
  });

  it('alter Eintrag nicht entfernbar: Sitzung bleibt lesbar (verschlüsselt hat Vorrang)', async () => {
    const { data, store } = memoryStore({ [KEY]: SESSION }, { remove: k => k === KEY });
    const storage = createSecureAuthStorage({ store, secrets: memorySecrets().secrets, cipher: fakeCipher() });
    await expect(storage.getItem(KEY)).resolves.toBe(SESSION);
    expect(data.has(encryptedKeyFor(KEY))).toBe(true);
    await expect(storage.getItem(KEY)).resolves.toBe(SESSION);
  });

  it('gleichzeitige Lesezugriffe ziehen nur einmal um (ein Schlüssel)', async () => {
    const { store } = memoryStore({ [KEY]: SESSION });
    const kc = memorySecrets();
    const storage = createSecureAuthStorage({ store, secrets: kc.secrets, cipher: fakeCipher() });
    const results = await Promise.all([storage.getItem(KEY), storage.getItem(KEY), storage.getItem(KEY)]);
    expect(results).toEqual([SESSION, SESSION, SESSION]);
    expect(kc.calls.set).toBe(1);
  });
});

describe('secureAuthStorage – Lesen, Schreiben, Fehlerfälle', () => {
  it('Schlüssel fehlt (z. B. nach Wiederherstellung): nichts gelöscht, null ohne alten Eintrag', async () => {
    const { data, store } = memoryStore();
    const kc = memorySecrets();
    const storage = createSecureAuthStorage({ store, secrets: kc.secrets, cipher: fakeCipher() });
    await storage.setItem(KEY, SESSION);
    kc.data.clear();

    const fresh = createSecureAuthStorage({ store, secrets: kc.secrets, cipher: fakeCipher() });
    await expect(fresh.getItem(KEY)).resolves.toBeNull();
    expect(data.has(encryptedKeyFor(KEY))).toBe(true);

    // Neue Anmeldung überschreibt mit neuem Schlüssel und ist wieder lesbar.
    await fresh.setItem(KEY, SESSION);
    await expect(fresh.getItem(KEY)).resolves.toBe(SESSION);
  });

  it('Schlüsselbund nicht lesbar (Gerät gesperrt): alter Eintrag wird geliefert, falls vorhanden', async () => {
    const { store } = memoryStore({ [KEY]: SESSION, [encryptedKeyFor(KEY)]: `${SEALED_PREFIX}xyz` });
    const storage = createSecureAuthStorage({
      store, secrets: memorySecrets({ get: true }).secrets, cipher: fakeCipher(),
    });
    await expect(storage.getItem(KEY)).resolves.toBe(SESSION);
  });

  it('Schlüsselbund nicht lesbar ohne alten Eintrag: verschlüsselte Sitzung bleibt unangetastet', async () => {
    const { data, store } = memoryStore();
    const ok = memorySecrets();
    await createSecureAuthStorage({ store, secrets: ok.secrets, cipher: fakeCipher() }).setItem(KEY, SESSION);
    const sealed = data.get(encryptedKeyFor(KEY));

    const locked = createSecureAuthStorage({ store, secrets: memorySecrets({ get: true }).secrets, cipher: fakeCipher() });
    await expect(locked.getItem(KEY)).resolves.toBeNull();
    expect(data.get(encryptedKeyFor(KEY))).toBe(sealed);

    // Nach dem Entsperren wieder lesbar.
    const unlocked = createSecureAuthStorage({ store, secrets: ok.secrets, cipher: fakeCipher() });
    await expect(unlocked.getItem(KEY)).resolves.toBe(SESSION);
  });

  it('setItem verschlüsselt, entfernt Klartext und ist nach Neustart lesbar', async () => {
    const { data, store } = memoryStore({ [KEY]: 'alt' });
    const kc = memorySecrets();
    const storage = createSecureAuthStorage({ store, secrets: kc.secrets, cipher: fakeCipher() });
    await storage.setItem(KEY, SESSION);
    expect(data.has(KEY)).toBe(false);
    const restarted = createSecureAuthStorage({ store, secrets: kc.secrets, cipher: fakeCipher() });
    await expect(restarted.getItem(KEY)).resolves.toBe(SESSION);
  });

  it('setItem bei Fehler: Rückfall auf Klartext, alte verschlüsselte Kopie verdeckt nichts', async () => {
    const { data, store } = memoryStore();
    const kc = memorySecrets();
    const storage = createSecureAuthStorage({ store, secrets: kc.secrets, cipher: fakeCipher() });
    await storage.setItem(KEY, 'alte-sitzung');

    const broken = createSecureAuthStorage({ store, secrets: kc.secrets, cipher: fakeCipher({ failEncrypt: true }) });
    await broken.setItem(KEY, SESSION);
    expect(data.get(KEY)).toBe(SESSION);
    expect(data.has(encryptedKeyFor(KEY))).toBe(false);
    await expect(broken.getItem(KEY)).resolves.toBe(SESSION);
  });

  it('setItem wirft nur, wenn auch der bisherige Weg scheitert', async () => {
    const { store } = memoryStore({}, { set: () => true });
    const storage = createSecureAuthStorage({ store, secrets: memorySecrets().secrets, cipher: fakeCipher() });
    await expect(storage.setItem(KEY, SESSION)).rejects.toThrow('set');
  });

  it('liest den Schlüsselbund nicht bei jedem Zugriff', async () => {
    const { store } = memoryStore();
    const kc = memorySecrets();
    const storage = createSecureAuthStorage({ store, secrets: kc.secrets, cipher: fakeCipher() });
    await storage.setItem(KEY, SESSION);
    const before = kc.calls.get;
    for (let i = 0; i < 5; i++) await storage.getItem(KEY);
    expect(kc.calls.get).toBe(before);
  });
});

describe('secureAuthStorage – Abmelden', () => {
  it('removeItem entfernt verschlüsselte Sitzung, Klartext und Schlüssel, sonst nichts', async () => {
    const { data, store } = memoryStore({ other: 'offline-eintrag' });
    const kc = memorySecrets();
    const storage = createSecureAuthStorage({ store, secrets: kc.secrets, cipher: fakeCipher() });
    await storage.setItem(KEY, SESSION);
    await storage.setItem(`${KEY}-code-verifier`, 'verifier');

    await storage.removeItem(KEY);

    expect(data.has(encryptedKeyFor(KEY))).toBe(false);
    expect(data.has(KEY)).toBe(false);
    expect(kc.data.has(secretKeyFor(KEY))).toBe(false);
    await expect(storage.getItem(KEY)).resolves.toBeNull();
    expect(data.get('other')).toBe('offline-eintrag');
    await expect(storage.getItem(`${KEY}-code-verifier`)).resolves.toBe('verifier');
  });

  it('removeItem entfernt auch eine noch nicht umgezogene Klartext-Sitzung', async () => {
    const { data, store } = memoryStore({ [KEY]: SESSION });
    const storage = createSecureAuthStorage({ store, secrets: memorySecrets().secrets, cipher: fakeCipher() });
    await storage.removeItem(KEY);
    expect(data.has(KEY)).toBe(false);
  });

  it('Schlüssel nicht löschbar: Abmelden gelingt trotzdem', async () => {
    const { data, store } = memoryStore();
    const kc = memorySecrets({ delete: true });
    const storage = createSecureAuthStorage({ store, secrets: kc.secrets, cipher: fakeCipher() });
    await storage.setItem(KEY, SESSION);
    await expect(storage.removeItem(KEY)).resolves.toBeUndefined();
    expect(data.has(encryptedKeyFor(KEY))).toBe(false);
    await expect(storage.getItem(KEY)).resolves.toBeNull();
  });

  it('Anmelden nach Abmelden erzeugt einen neuen Schlüssel', async () => {
    const { store } = memoryStore();
    const kc = memorySecrets();
    const storage = createSecureAuthStorage({ store, secrets: kc.secrets, cipher: fakeCipher() });
    await storage.setItem(KEY, SESSION);
    await storage.removeItem(KEY);
    await storage.setItem(KEY, 'neu');
    expect(kc.data.get(secretKeyFor(KEY))).toBe('key2');
    await expect(storage.getItem(KEY)).resolves.toBe('neu');
  });
});

describe('secureAuthStorage – ohne natives Modul (ältere Builds)', () => {
  it('verhält sich exakt wie bisher: Klartext in AsyncStorage, kein Umzug', async () => {
    const { data, store } = memoryStore({ [KEY]: SESSION });
    const storage = createSecureAuthStorage({ store, secrets: null, cipher: fakeCipher() });
    await expect(storage.getItem(KEY)).resolves.toBe(SESSION);
    await storage.setItem(KEY, 'neu');
    expect(data.get(KEY)).toBe('neu');
    expect(data.has(encryptedKeyFor(KEY))).toBe(false);
    await storage.removeItem(KEY);
    expect(data.has(KEY)).toBe(false);
  });

  it('ohne Chiffre ebenfalls unverändert', async () => {
    const { data, store } = memoryStore({ [KEY]: SESSION });
    const storage = createSecureAuthStorage({ store, secrets: memorySecrets().secrets, cipher: null });
    await expect(storage.getItem(KEY)).resolves.toBe(SESSION);
    expect(data.get(KEY)).toBe(SESSION);
  });
});

describe('secretKeyFor', () => {
  it('erzeugt nur für SecureStore gültige Zeichen', () => {
    expect(secretKeyFor('sb-x-auth-token')).toBe('anyvo_auth_key_v1.sb-x-auth-token');
    expect(secretKeyFor('a b/c:d')).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});
