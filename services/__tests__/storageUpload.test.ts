// Upload über XMLHttpRequest statt supabase-js/fetch: Expo SDK 58 ersetzt das
// globale fetch, dessen FormData-Umwandlung RN-Dateideskriptoren nicht kennt
// («Unsupported FormDataPart implementation»). Diese Tests sichern Ziel-URL,
// Header, Upsert-Verhalten, Dateiteil und Fehlermeldungen ab.

jest.mock('@/lib/supabase', () => ({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  supabase: {
    auth: {
      getSession: jest.fn(),
      getUser: jest.fn(),
    },
    storage: {
      from: jest.fn((bucket: string) => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}` } }),
        upload: jest.fn(() => { throw new Error('supabase-js upload darf nicht mehr genutzt werden'); }),
      })),
    },
  },
}));

import { supabase } from '@/lib/supabase';
import { uploadFileToStorage } from '@/services/storageUpload';
import { uploadDogDocument, uploadDogImage, uploadTrainingVideo } from '@/services/storage';

type Sent = { method: string; url: string; headers: Record<string, string>; body: unknown };

let sent: Sent[] = [];
let respond: (xhr: FakeXhr) => void = xhr => { xhr.status = 200; xhr.responseText = '{}'; xhr.onload?.(); };

class FakeXhr {
  status = 0;
  responseText = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private req: Sent = { method: '', url: '', headers: {}, body: null };
  open(method: string, url: string) { this.req.method = method; this.req.url = url; }
  setRequestHeader(k: string, v: string) { this.req.headers[k.toLowerCase()] = v; }
  send(body: unknown) { this.req.body = body; sent.push(this.req); respond(this); }
}

class FakeFormData {
  parts: [string, unknown][] = [];
  append(name: string, value: unknown) { this.parts.push([name, value]); }
}

const auth = supabase.auth as unknown as { getSession: jest.Mock; getUser: jest.Mock };

beforeEach(() => {
  sent = [];
  respond = xhr => { xhr.status = 200; xhr.responseText = '{}'; xhr.onload?.(); };
  (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr;
  (global as unknown as { FormData: unknown }).FormData = FakeFormData;
  auth.getSession.mockResolvedValue({ data: { session: { access_token: 'user-token' } } });
  auth.getUser.mockResolvedValue({ data: { user: { id: 'owner-1' } } });
});

describe('uploadFileToStorage', () => {
  it('lädt per XHR als multipart mit RN-Dateideskriptor hoch', async () => {
    await uploadFileToStorage('dog-avatars', 'owner-1/123.jpg', 'file:///tmp/a.jpg', 'image/jpeg', { upsert: true });
    expect(sent).toHaveLength(1);
    const [req] = sent;
    expect(req.method).toBe('POST');
    expect(req.url).toBe('https://example.supabase.co/storage/v1/object/dog-avatars/owner-1/123.jpg');
    expect(req.headers.authorization).toBe('Bearer user-token');
    expect(req.headers.apikey).toBe('anon-key');
    expect(req.headers['x-upsert']).toBe('true');
    expect(req.headers['content-type']).toBeUndefined();   // Boundary setzt XHR selbst
    expect((req.body as FakeFormData).parts).toEqual([
      ['file', { uri: 'file:///tmp/a.jpg', name: '123.jpg', type: 'image/jpeg' }],
    ]);
  });

  it('überschreibt ohne upsert nicht und nutzt den übergebenen Dateinamen', async () => {
    await uploadFileToStorage('dog-documents', 'owner-1/dog-1/9_impf.pdf', 'file:///tmp/i.pdf', 'application/pdf', { upsert: false, fileName: 'impf.pdf' });
    expect(sent[0].headers['x-upsert']).toBe('false');
    expect((sent[0].body as FakeFormData).parts[0][1]).toEqual({ uri: 'file:///tmp/i.pdf', name: 'impf.pdf', type: 'application/pdf' });
  });

  it('wirft ohne Sitzung, ohne einen Request zu senden', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    await expect(uploadFileToStorage('dog-avatars', 'p', 'file:///x', 'image/jpeg', { upsert: true })).rejects.toThrow('Nicht eingeloggt');
    expect(sent).toHaveLength(0);
  });

  it('meldet Serverfehler mit Status und Meldung', async () => {
    respond = xhr => { xhr.status = 403; xhr.responseText = JSON.stringify({ message: 'new row violates row-level security policy' }); xhr.onload?.(); };
    await expect(uploadFileToStorage('dog-avatars', 'p', 'file:///x', 'image/jpeg', { upsert: true }))
      .rejects.toThrow('Upload fehlgeschlagen (403): new row violates row-level security policy');
  });

  it('meldet Serverfehler auch ohne JSON-Antwort', async () => {
    respond = xhr => { xhr.status = 500; xhr.responseText = 'oops'; xhr.onload?.(); };
    await expect(uploadFileToStorage('dog-avatars', 'p', 'file:///x', 'image/jpeg', { upsert: true }))
      .rejects.toThrow('Upload fehlgeschlagen (500)');
  });

  it('meldet Netzwerkfehler', async () => {
    respond = xhr => { xhr.onerror?.(); };
    await expect(uploadFileToStorage('dog-avatars', 'p', 'file:///x', 'image/jpeg', { upsert: true }))
      .rejects.toThrow('Netzwerkfehler beim Upload');
  });
});

describe('services/storage nutzt den XHR-Upload', () => {
  it('Hundefoto: Bucket dog-avatars, eigener Ordner, öffentliche URL wie bisher', async () => {
    const url = await uploadDogImage('file:///tmp/foto.jpg', 'ignored');
    expect(sent[0].url).toMatch(/\/storage\/v1\/object\/dog-avatars\/owner-1\/\d+\.jpg$/);
    expect(url).toMatch(/\/storage\/v1\/object\/public\/dog-avatars\/owner-1\/\d+\.jpg$/);
  });

  it('Hundedokument: Bucket dog-documents, Pfad <owner>/<dog>/…, kein Überschreiben, gibt Objektpfad zurück', async () => {
    const path = await uploadDogDocument('file:///tmp/i.pdf', 'dog-1', 'Impf pass.pdf', 'application/pdf');
    expect(path).toMatch(/^owner-1\/dog-1\/\d+_Impf_pass\.pdf$/);
    expect(sent[0].url).toBe(`https://example.supabase.co/storage/v1/object/dog-documents/${path}`);
    expect(sent[0].headers['x-upsert']).toBe('false');
  });

  it('Trainingsvideo: Bucket training-videos mit video/<ext>', async () => {
    await uploadTrainingVideo('file:///tmp/v.mov');
    expect(sent[0].url).toMatch(/\/training-videos\/owner-1\/\d+\.mov$/);
    expect((sent[0].body as FakeFormData).parts[0][1]).toMatchObject({ type: 'video/mov' });
  });
});
