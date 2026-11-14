import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';

// Datei-Upload in Supabase Storage für React Native.
//
// Expo SDK 58 ersetzt das globale `fetch` durch `expo/fetch`. Dessen FormData-
// Umwandlung kennt die React-Native-Dateideskriptoren `{ uri, name, type }`
// nicht und wirft «Unsupported FormDataPart implementation». supabase-js lädt
// über `fetch` hoch, daher scheiterten seit Build 60 alle Uploads über
// `supabase.storage.from(…).upload(path, formData)`.
//
// `XMLHttpRequest` ersetzt Expo nicht: es nutzt weiter das native React-Native-
// Netzwerk, das die Datei direkt von der `uri` liest und streamt (kein Laden
// der ganzen Datei in den JS-Speicher, wichtig bei Videos). Gleiches Verfahren
// wie `xhrUpload` in services/mediaService.ts. Format und Zielpfad des Uploads
// bleiben unverändert (multipart, Feld `file`, Objektpfad wie bisher).
export async function uploadFileToStorage(
  bucket: string,
  path: string,
  uri: string,
  contentType: string,
  options: { upsert: boolean; fileName?: string },
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Nicht eingeloggt');

  const form = new FormData();
  form.append('file', {
    uri,
    name: options.fileName ?? path.split('/').pop() ?? 'upload',
    type: contentType,
  } as unknown as Blob);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`);
    xhr.setRequestHeader('authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
    xhr.setRequestHeader('x-upsert', options.upsert ? 'true' : 'false');
    // KEIN content-type setzen: XHR setzt die multipart/form-data-Boundary selbst.
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { resolve(); return; }
      let message = `Upload fehlgeschlagen (${xhr.status})`;
      try {
        const body = JSON.parse(xhr.responseText) as { message?: unknown; error?: unknown };
        const detail = typeof body.message === 'string' ? body.message : typeof body.error === 'string' ? body.error : null;
        if (detail) message = `${message}: ${detail}`;
      } catch { /* Antwort ohne JSON → Statusmeldung reicht */ }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error('Netzwerkfehler beim Upload'));
    xhr.send(form);
  });
}
