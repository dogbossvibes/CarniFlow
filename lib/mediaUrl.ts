import { supabase, SUPABASE_URL } from '@/lib/supabase';

// Wandelt eine gespeicherte (öffentliche) Supabase-Storage-URL in eine
// kurzlebige signierte URL um — Voraussetzung für PRIVATE Buckets.
//
// FAIL-OPEN: Bei jedem Problem (kein Supabase-Bucket, Fehler, externes Bild)
// wird die Original-URL zurückgegeben. Dadurch ist die Umstellung
// non-breaking: solange die Buckets noch public sind, ändert sich nichts;
// erst nach dem Privat-Schalten greifen die signierten URLs.

const TTL = 3600;                       // Sekunden Gültigkeit
const cache = new Map<string, { url: string; exp: number }>();

// /storage/v1/object/public/<bucket>/<path>
const PUBLIC_RE = /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/;

export async function signMediaUrl(stored: string | null | undefined): Promise<string> {
  if (!stored) return '';
  const m = stored.match(PUBLIC_RE);
  if (!stored.startsWith(SUPABASE_URL) || !m) return stored;   // nicht unser Bucket → unverändert

  const now = Date.now();
  const hit = cache.get(stored);
  if (hit && hit.exp > now) return hit.url;

  const [, bucket, rawPath] = m;
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(decodeURIComponent(rawPath), TTL);
    if (error || !data?.signedUrl) return stored;              // fail-open
    cache.set(stored, { url: data.signedUrl, exp: now + (TTL - 120) * 1000 });
    return data.signedUrl;
  } catch {
    return stored;                                            // fail-open
  }
}
