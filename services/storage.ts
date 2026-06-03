import { supabase } from '@/lib/supabase';

export async function uploadTrainingImage(uri: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');

  const ext  = uri.split('.').pop()?.toLowerCase() || 'jpg';
  const mime = ext === 'png' ? 'image/png' : ext === 'heic' ? 'image/heic' : 'image/jpeg';
  const path = `${user.id}/${Date.now()}.${ext}`;

  const formData = new FormData();
  formData.append('file', { uri, name: path, type: mime } as any);

  const { error } = await supabase.storage
    .from('training-photos')
    .upload(path, formData, { contentType: mime, upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from('training-photos').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadTrainingVideo(uri: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');

  const ext  = uri.split('.').pop()?.toLowerCase() || 'mp4';
  const path = `${user.id}/${Date.now()}.${ext}`;

  const formData = new FormData();
  formData.append('file', { uri, name: path, type: `video/${ext}` } as any);

  const { error } = await supabase.storage
    .from('training-videos')
    .upload(path, formData, { contentType: `video/${ext}`, upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from('training-videos').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadTrainingAudio(uri: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');

  const ext  = uri.split('.').pop()?.toLowerCase() || 'm4a';
  const path = `${user.id}/${Date.now()}.${ext}`;

  const formData = new FormData();
  formData.append('file', { uri, name: path, type: 'audio/mp4' } as any);

  const { error } = await supabase.storage
    .from('training-audio')
    .upload(path, formData, { contentType: 'audio/mp4', upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from('training-audio').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadDogImage(uri: string, _userId: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');

  const ext  = uri.split('.').pop()?.toLowerCase() || 'jpg';
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  const path = `${user.id}/${Date.now()}.${ext}`;

  const formData = new FormData();
  formData.append('file', { uri, name: path, type: mime } as any);

  const { error } = await supabase.storage
    .from('dog-avatars')
    .upload(path, formData, { contentType: mime, upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from('dog-avatars').getPublicUrl(path);
  return data.publicUrl;
}
