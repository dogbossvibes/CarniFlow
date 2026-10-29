// Both future Edge routes use this bounded response boundary. RN runtimes that
// cannot stream must provide a declared length; an unbounded body is rejected.
export async function boundedJsonText(response: Response, endpoint: string, signal: AbortSignal): Promise<string> {
  if (signal.aborted || response.redirected || (response.url && response.url !== endpoint)
    || !Number.isInteger(response.status) || response.status < 200 || response.status > 599
    || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw new Error('Invalid response');
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 20000)) throw new Error('Invalid response');
  if (response.body?.getReader) {
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const item = await reader.read(); if (signal.aborted) throw new Error('Interrupted');
        if (item.done) break;
        size += item.value.byteLength; if (size > 20000) throw new Error('Invalid response');
        chunks.push(item.value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return decodeURIComponent(Array.from(bytes, byte => `%${byte.toString(16).padStart(2, '0')}`).join(''));
    } finally { try { await reader.cancel(); } catch { /* no retry */ } reader.releaseLock(); }
  }
  if (declared === null) throw new Error('Unbounded response');
  const text = await response.text();
  if (signal.aborted || !text || utf8Size(text) > 20000) throw new Error('Invalid response');
  return text;
}
export function utf8Size(text: string) {
  let size = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 128) size++;
    else if (code < 2048) size += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length
      && text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) { size += 4; index++; }
    else size += 3;
  }
  return size;
}
export function intelligenceEndpoint(projectUrl: string, name: 'intelligence-respond' | 'intelligence-transcribe') {
  try {
    const u = new URL(projectUrl);
    if (u.protocol === 'https:' && /^[a-z0-9]+\.supabase\.co$/.test(u.hostname) && !u.username && !u.password
      && !u.port && !u.search && !u.hash && (u.pathname === '/' || !u.pathname)) return `${u.origin}/functions/v1/${name}`;
  } catch { /* fail closed */ }
  return null;
}
