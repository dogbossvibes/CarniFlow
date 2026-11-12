import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Asset } from 'expo-asset';
import * as Crypto from 'expo-crypto';
import { buildTrackUserExport, trackExportGpx } from '../utils/trackUserExport';
import type { ReportLabels } from '../utils/trackReportPdf';

export type UserExportFormat = 'gpx' | 'json' | 'pdf';
const formats = {
  gpx: { ext: 'gpx', mime: 'application/gpx+xml', uti: 'public.xml' },
  json: { ext: 'anyvo-track.json', mime: 'application/json', uti: 'public.json' },
  pdf: { ext: 'pdf', mime: 'application/pdf', uti: 'com.adobe.pdf' },
} as const;

/** Prune only our expired cache files. Android can resolve shareAsync before the receiver reads. */
async function pruneExports(directory: string): Promise<void> {
  const cutoff = Date.now() / 1000 - 86400;
  const names = await FileSystem.readDirectoryAsync(directory);
  await Promise.all(names.filter(name => /^anyvo-[a-f0-9-]+\.(?:pdf|gpx|anyvo-track\.json)$/.test(name)).map(async name => {
    const uri = directory + name;
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && !info.isDirectory && info.modificationTime < cutoff) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  }));
}

export async function shareTrackUserExport(value: unknown, format: UserExportFormat, labels: ReportLabels, includeNotes = false): Promise<void> {
  if (!await Sharing.isAvailableAsync()) throw new Error('sharing-unavailable');
  if (!FileSystem.cacheDirectory) throw new Error('cache-unavailable');
  const snapshot = buildTrackUserExport(value, new Date().toISOString(), includeNotes);
  const spec = formats[format];
  const directory = `${FileSystem.cacheDirectory}track-exports/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  await pruneExports(directory).catch(() => {});
  const uri = `${directory}anyvo-${Crypto.randomUUID()}.${spec.ext}`;
  let body: string;
  if (format === 'pdf') {
    const [{ buildTrackReportPdf }, asset, logoAsset] = await Promise.all([
      import('../utils/trackReportPdf'),
      // Metro bundles the licensed font with the update for offline PDF generation.
      Asset.fromModule(require('@/assets/fonts/NotoSans-Regular.ttf')).downloadAsync(),
      Asset.fromModule(require('@/assets/images/anyvologo.png')).downloadAsync(),
    ]);
    if (!asset.localUri || !logoAsset.localUri) throw new Error('report-asset-unavailable');
    const [base64, logoBase64] = await Promise.all([
      FileSystem.readAsStringAsync(asset.localUri, { encoding: FileSystem.EncodingType.Base64 }),
      FileSystem.readAsStringAsync(logoAsset.localUri, { encoding: FileSystem.EncodingType.Base64 }),
    ]);
    body = await buildTrackReportPdf(snapshot, base64, labels, logoBase64);
  } else {
    body = format === 'gpx' ? trackExportGpx(snapshot) : JSON.stringify(snapshot, null, 2);
  }
  try {
    await FileSystem.writeAsStringAsync(uri, body, format === 'pdf' ? { encoding: FileSystem.EncodingType.Base64 } : {});
    await Sharing.shareAsync(uri, { mimeType: spec.mime, UTI: spec.uti, dialogTitle: labels.title });
  } catch (error) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    throw error;
  }
  // Successful shares stay in OS cache; the next export removes files older than 24 hours.
}
