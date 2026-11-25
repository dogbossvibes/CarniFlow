import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { renderExamPdfBase64, type ExamPdfModel } from './pdf';

export type ExamPdfShareResult = 'shared' | 'unavailable';

// Erzeugt das PDF im Cache-Verzeichnis und öffnet das Teilen-Fenster des Systems
// (gleiches Muster wie services/reportShare.ts). Nichts wird hochgeladen, keine
// Kundendaten werden verändert.
export async function shareExamBookPdf(model: ExamPdfModel, fileName: string): Promise<ExamPdfShareResult> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  const base64 = renderExamPdfBase64(model);
  const safe = fileName.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'ANYVO-Pruefungsbuch';
  const uri = `${FileSystem.cacheDirectory}${safe}.pdf`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: model.title });
  return 'shared';
}
