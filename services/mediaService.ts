import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';

// Verbessertes Medien-System: Kompression, Bildgrößen, Thumbnails, eigene
// Buckets (media-images/-videos/-audio), Upload-Fortschritt + Fehlerbehandlung.

export type MediaBucket = 'media-images' | 'media-videos' | 'media-audio';

export interface MediaResult {
  url:      string;
  thumbUrl?: string;   // Vorschau (Bild/Video)
}

export type ProgressFn = (fraction: number) => void;

export class MediaError extends Error {
  constructor(message: string, readonly cause?: unknown) { super(message); this.name = 'MediaError'; }
}

function publicUrl(bucket: MediaBucket, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

// Direkt-Upload via XHR — liefert echten Byte-Fortschritt (supabase-js kann das nicht).
async function xhrUpload(
  bucket: MediaBucket, path: string, uri: string, contentType: string, onProgress?: ProgressFn,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new MediaError('Nicht eingeloggt');

  // FormData mit RN-File-Deskriptor: zuverlässig in React Native.
  // (fetch(uri).blob() liefert für file://-URIs in RN oft einen leeren Blob.)
  const form = new FormData();
  form.append('file', { uri, name: path.split('/').pop() ?? 'upload', type: contentType } as any);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`);
    xhr.setRequestHeader('authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
    xhr.setRequestHeader('x-upsert', 'true');
    // KEIN content-type setzen → XHR setzt die multipart/form-data-Boundary selbst.
    xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300)
      ? resolve()
      : reject(new MediaError(`Upload fehlgeschlagen (${xhr.status})`, xhr.responseText));
    xhr.onerror = () => reject(new MediaError('Netzwerkfehler beim Upload'));
    xhr.send(form as any);
  });
}

async function uid(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new MediaError('Nicht eingeloggt');
  return user.id;
}

// ── Bild: verkleinern + komprimieren, + kleines Thumbnail ─────
export async function uploadImage(uri: string, onProgress?: ProgressFn): Promise<MediaResult> {
  try {
    const u = await uid();
    const stamp = Date.now();

    const full  = await compressImage(uri, 1600, 0.7);
    const thumb = await compressImage(uri, 400, 0.6);
    const fullPath  = `${u}/${stamp}.jpg`;
    const thumbPath = `${u}/${stamp}_thumb.jpg`;

    await xhrUpload('media-images', fullPath, full.uri, 'image/jpeg', onProgress);
    await xhrUpload('media-images', thumbPath, thumb.uri, 'image/jpeg');

    return { url: publicUrl('media-images', fullPath), thumbUrl: publicUrl('media-images', thumbPath) };
  } catch (e) {
    throw e instanceof MediaError ? e : new MediaError('Bild-Upload fehlgeschlagen', e);
  }
}

async function compressImage(uri: string, maxDim: number, quality: number) {
  const ctx = ImageManipulator.manipulate(uri).resize({ width: maxDim });
  const ref = await ctx.renderAsync();
  return ref.saveAsync({ compress: quality, format: SaveFormat.JPEG });
}

// ── Video: Thumbnail erzeugen, Video + Thumb hochladen ────────
export async function uploadVideo(uri: string, onProgress?: ProgressFn): Promise<MediaResult> {
  try {
    const u = await uid();
    const stamp = Date.now();
    const ext = uri.split('.').pop()?.toLowerCase() || 'mp4';
    const videoPath = `${u}/${stamp}.${ext}`;

    let thumbUrl: string | undefined;
    try {
      const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(uri, { time: 1000, quality: 0.6 });
      const thumb = await compressImage(thumbUri, 480, 0.6);
      const thumbPath = `${u}/${stamp}_thumb.jpg`;
      await xhrUpload('media-images', thumbPath, thumb.uri, 'image/jpeg');
      thumbUrl = publicUrl('media-images', thumbPath);
    } catch { /* Thumbnail optional */ }

    await xhrUpload('media-videos', videoPath, uri, `video/${ext}`, onProgress);
    return { url: publicUrl('media-videos', videoPath), thumbUrl };
  } catch (e) {
    throw e instanceof MediaError ? e : new MediaError('Video-Upload fehlgeschlagen', e);
  }
}

// ── Audio ────────────────────────────────────────────────────
export async function uploadAudio(uri: string, onProgress?: ProgressFn): Promise<MediaResult> {
  try {
    const u = await uid();
    const path = `${u}/${Date.now()}.m4a`;
    await xhrUpload('media-audio', path, uri, 'audio/mp4', onProgress);
    return { url: publicUrl('media-audio', path) };
  } catch (e) {
    throw e instanceof MediaError ? e : new MediaError('Audio-Upload fehlgeschlagen', e);
  }
}
