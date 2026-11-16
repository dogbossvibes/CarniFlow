import { supabase } from '@/lib/supabase';
import { uploadFileToStorage } from '@/services/storageUpload';

export async function uploadTrainingImage(uri: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');

  const ext  = uri.split('.').pop()?.toLowerCase() || 'jpg';
  const mime = ext === 'png' ? 'image/png' : ext === 'heic' ? 'image/heic' : 'image/jpeg';
  const path = `${user.id}/${Date.now()}.${ext}`;

  await uploadFileToStorage('training-photos', path, uri, mime, { upsert: true });

  const { data } = supabase.storage.from('training-photos').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadTrainingVideo(uri: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');

  const ext  = uri.split('.').pop()?.toLowerCase() || 'mp4';
  const path = `${user.id}/${Date.now()}.${ext}`;

  await uploadFileToStorage('training-videos', path, uri, `video/${ext}`, { upsert: true });

  const { data } = supabase.storage.from('training-videos').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadTrainingAudio(uri: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');

  const ext  = uri.split('.').pop()?.toLowerCase() || 'm4a';
  const path = `${user.id}/${Date.now()}.${ext}`;

  await uploadFileToStorage('training-audio', path, uri, 'audio/mp4', { upsert: true });

  const { data } = supabase.storage.from('training-audio').getPublicUrl(path);
  return data.publicUrl;
}

// Privater Bucket `dog-documents` (siehe DOG_DOCUMENTS_STORAGE.sql). Pfad
// MUSS `<owner_id>/<dog_id>/<datei>` sein (RLS-Policy). Gibt den OBJEKT-PFAD
// zurück (kein Public-URL — Signed-URL wird beim Öffnen erzeugt).
export async function uploadDogDocument(uri: string, dogId: string, fileName: string, mime: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');

  const safe = (fileName || 'datei').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${user.id}/${dogId}/${Date.now()}_${safe}`;

  await uploadFileToStorage('dog-documents', path, uri, mime, { upsert: false, fileName: safe });
  return path;
}

export async function uploadDogImage(uri: string, _userId: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');

  const ext  = uri.split('.').pop()?.toLowerCase() || 'jpg';
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  const path = `${user.id}/${Date.now()}.${ext}`;

  await uploadFileToStorage('dog-avatars', path, uri, mime, { upsert: true });

  const { data } = supabase.storage.from('dog-avatars').getPublicUrl(path);
  return data.publicUrl;
}
