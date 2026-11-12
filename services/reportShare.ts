import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { renderReportPdfBase64 } from '@/features/training/reportPdf';
import type { ReportModel } from '@/features/training/report';

export type ReportShareResult = 'shared' | 'unavailable';

// Erzeugt das PDF auf dem Gerät (Cache-Verzeichnis) und öffnet das Teilen-Fenster
// des Systems. Es wird nichts hochgeladen und nichts an Kundendaten geändert.
export async function shareTrainingReport(model: ReportModel, fileName: string): Promise<ReportShareResult> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  const base64 = renderReportPdfBase64(model);
  const safe = fileName.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'ANYVO-Trainingsbericht';
  const uri = `${FileSystem.cacheDirectory}${safe}.pdf`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: model.title });
  return 'shared';
}
