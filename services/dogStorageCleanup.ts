import { supabase } from '@/lib/supabase';

// Aufräumen der Speicher-Dateien eines gelöschten Hundes (Datenschutz).
//
// Ablauf in deleteDogWithDependents:
//   1. collectDogStorageRefs() VOR dem Löschen — danach sind die Zeilen weg.
//   2. Hund + abhängige Zeilen löschen.
//   3. removeDogStorageRefs() NUR, wenn der Hund nachweislich gelöscht wurde.
//      Schlägt das Löschen fehl, bleiben alle Dateien erhalten (Kundendatenerhalt).
//
// Sicherheitsgrenzen:
//   - nur bekannte App-Buckets (BUCKETS),
//   - nur Dateien im eigenen Ordner (erste Pfadebene = eigene User-ID);
//     Dateien anderer Personen (z. B. Trainer-Kommentare) werden nie angefasst,
//   - Hundefoto bleibt, wenn ein anderer eigener Hund dieselbe Datei nutzt,
//   - alles best-effort: Fehler blockieren das Löschen des Hundes nie und
//     werden ohne Pfade/IDs geloggt.

const BUCKETS = [
  'dog-avatars',
  'dog-documents',
  'training-photos',
  'training-videos',
  'training-audio',
  'media-images',
  'media-videos',
  'media-audio',
] as const;
type Bucket = typeof BUCKETS[number];

export interface StorageRef { bucket: Bucket; path: string }

const isBucket = (b: string): b is Bucket => (BUCKETS as readonly string[]).includes(b);

// /storage/v1/object/public/<bucket>/<path>  bzw.  /storage/v1/object/sign/<bucket>/<path>?token=…
const URL_RE = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/;

// Wandelt eine gespeicherte URL oder einen reinen Objektpfad in eine Speicher-
// Referenz um. Reine Pfade (ohne URL) gibt es nur bei dog-documents.
export function toStorageRef(value: unknown, ownerId: string, plainPathBucket?: Bucket): StorageRef | null {
  if (typeof value !== 'string' || !value.trim() || !ownerId) return null;
  const raw = value.trim();
  let bucket: string | undefined;
  let path: string | undefined;

  const m = raw.match(URL_RE);
  if (m) {
    bucket = m[1];
    path = m[2];
  } else if (plainPathBucket && !/^[a-z]+:\/\//i.test(raw)) {
    bucket = plainPathBucket;
    path = raw.replace(/^\/+/, '');
  }
  if (!bucket || !path || !isBucket(bucket)) return null;

  try { path = decodeURIComponent(path); } catch { return null; }
  if (path.includes('..')) return null;
  if (path.split('/')[0] !== ownerId) return null;      // nur eigener Ordner
  return { bucket, path };
}

// Bild-Uploads über mediaService legen zusätzlich <stamp>_thumb.jpg ab.
function withThumb(ref: StorageRef): StorageRef[] {
  if (ref.bucket !== 'media-images') return [ref];
  const m = ref.path.match(/^(.*\/\d+)\.jpg$/);
  return m ? [ref, { bucket: ref.bucket, path: `${m[1]}_thumb.jpg` }] : [ref];
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);

async function listDocumentFolder(ownerId: string, dogId: string): Promise<string[]> {
  const folder = `${ownerId}/${dogId}`;
  const names: string[] = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const { data, error } = await supabase.storage.from('dog-documents').list(folder, { limit: 100, offset });
    if (error || !data?.length) break;
    // Einträge ohne id sind Unterordner — die App legt keine an, daher überspringen.
    for (const o of data) if ((o as { id?: string | null }).id && o.name) names.push(`${folder}/${o.name}`);
    if (data.length < 100) break;
  }
  return names;
}

export async function collectDogStorageRefs(dogId: string, ownerId: string): Promise<StorageRef[]> {
  const refs: StorageRef[] = [];
  const add = (v: unknown, plain?: Bucket) => {
    const r = toStorageRef(v, ownerId, plain);
    if (r) refs.push(...withThumb(r));
  };
  const safe = async (label: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { console.warn(`[deleteDog] Dateien (${label}) nicht ermittelt:`, (e as Error)?.message ?? e); }
  };

  await safe('Hundefoto', async () => {
    const { data } = await supabase.from('dogs').select('photo_url').eq('id', dogId).maybeSingle();
    const photo = (data as { photo_url?: string | null } | null)?.photo_url;
    if (!photo) return;
    const { data: others, error } = await supabase.from('dogs').select('id').eq('photo_url', photo).neq('id', dogId).limit(1);
    if (error || (others?.length ?? 0) > 0) return;       // unklar oder mitbenutzt → Foto behalten
    add(photo);
  });

  await safe('Dokumente', async () => {
    const { data } = await supabase.from('dog_documents').select('file_url').eq('dog_id', dogId);
    for (const row of data ?? []) add((row as { file_url?: string | null }).file_url, 'dog-documents');
    for (const p of await listDocumentFolder(ownerId, dogId)) add(p, 'dog-documents');
  });

  const sessionIds: string[] = [];
  const unitIds: string[] = [];

  await safe('Trainings', async () => {
    const { data } = await supabase.from('training_sessions')
      .select('id, photo_urls, video_url, audio_urls').eq('dog_id', dogId);
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      if (typeof row.id === 'string') sessionIds.push(row.id);
      for (const v of [...asArray(row.photo_urls), ...asArray(row.video_url), ...asArray(row.audio_urls)]) add(v);
    }
  });

  await safe('Trainingseinheiten', async () => {
    const { data } = await supabase.from('training_units')
      .select('id, photos, videos, audio_files').eq('dog_id', dogId);
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      if (typeof row.id === 'string') unitIds.push(row.id);
      for (const v of [...asArray(row.photos), ...asArray(row.videos)]) add(v);
      for (const a of asArray(row.audio_files)) add(typeof a === 'string' ? a : (a as { url?: unknown } | null)?.url);
    }
  });

  // Sprachnotizen hängen per ON DELETE CASCADE an Training/Einheit und
  // verschwinden mit ihnen. Notizen nur mit dog_id bleiben (dog_id → null),
  // ihre Audios werden deshalb NICHT gelöscht.
  await safe('Sprachnotizen', async () => {
    const chunks: { col: string; ids: string[] }[] = [];
    for (let i = 0; i < sessionIds.length; i += 100) chunks.push({ col: 'training_session_id', ids: sessionIds.slice(i, i + 100) });
    for (let i = 0; i < unitIds.length; i += 100) chunks.push({ col: 'training_unit_id', ids: unitIds.slice(i, i + 100) });
    for (const c of chunks) {
      const { data } = await supabase.from('voice_notes').select('audio_url').in(c.col, c.ids);
      for (const row of data ?? []) add((row as { audio_url?: string | null }).audio_url);
    }
  });

  const seen = new Set<string>();
  return refs.filter(r => {
    const k = `${r.bucket}/${r.path}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function removeDogStorageRefs(refs: StorageRef[]): Promise<void> {
  const byBucket = new Map<Bucket, string[]>();
  for (const r of refs) byBucket.set(r.bucket, [...(byBucket.get(r.bucket) ?? []), r.path]);
  for (const [bucket, paths] of byBucket) {
    for (let i = 0; i < paths.length; i += 100) {
      try {
        const { error } = await supabase.storage.from(bucket).remove(paths.slice(i, i + 100));
        if (error) console.warn(`[deleteDog] Dateien in ${bucket} nicht entfernt:`, error.message);
      } catch (e) {
        console.warn(`[deleteDog] Dateien in ${bucket} nicht entfernt:`, (e as Error)?.message ?? e);
      }
    }
  }
}
