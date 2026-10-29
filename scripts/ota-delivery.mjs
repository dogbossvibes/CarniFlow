// Read-only Expo Updates v1 JSON manifest/CDN verification. Never publishes.
import { createHash } from 'node:crypto';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function trustedURL(value, manifest = false) {
  const u = new URL(value);
  const allowed = manifest ? u.hostname === 'u.expo.dev' : u.hostname === 'assets.eascdn.net' || u.hostname === 'u.expo.dev' || u.hostname.endsWith('.expo.dev') || u.hostname.endsWith('.expo.io');
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !allowed) throw new Error('UNSUPPORTED_DELIVERY_HOST');
  return u.href;
}
export async function verifyDelivery({ candidate, updateId, fetchImpl = globalThis.fetch }) {
  const target = candidate.context.target, expected = candidate.plan.bundle;
  let total = 0;
  const get = async (url, limit, headers = {}) => {
    const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(30000), headers });
    if (!response.ok) throw new Error('DELIVERY_NOT_AVAILABLE');
    const chunks = [];let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;total += chunk.length;
      if (length > limit || total > 512 * 1024 * 1024) throw new Error('DELIVERY_TOO_LARGE');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  };
  const body = await get(trustedURL(target.updatesUrl, true), 2 * 1024 * 1024, {
    accept: 'application/expo+json, application/json', 'expo-protocol-version': '1',
    'expo-platform': target.platform, 'expo-runtime-version': target.runtime, 'expo-channel-name': 'production',
  });
  const manifest = JSON.parse(body.toString('utf8'));
  if (manifest.id !== updateId || manifest.runtimeVersion !== target.runtime || !Array.isArray(manifest.assets)) throw new Error('DELIVERY_MANIFEST_MISMATCH');
  const check = async asset => {
    if (!asset || typeof asset.url !== 'string') throw new Error('MISSING_ASSET');
    const bytes = await get(trustedURL(asset.url), 128 * 1024 * 1024);
    const hash = sha(bytes);
    if (asset.hash && Buffer.from(asset.hash, 'base64url').toString('hex') !== hash) throw new Error('ASSET_SERVER_HASH_MISMATCH');
    return hash;
  };
  const launchHash = await check(manifest.launchAsset);
  if (launchHash !== expected.launchAsset.sha256) throw new Error('LAUNCH_ASSET_NOT_APPROVED');
  const hashes = [];
  for (const asset of manifest.assets) hashes.push(await check(asset));
  const approved = expected.assets.map(a => a.sha256).sort();hashes.sort();
  if (JSON.stringify(hashes) !== JSON.stringify(approved)) throw new Error('ASSET_SET_NOT_APPROVED');
  return { status: 'PASS', manifestId: manifest.id, runtime: manifest.runtimeVersion, launchSHA256: launchHash, assets: hashes.length, bytes: total };
}
