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
  const safe = safePdfFileName(fileName);
  const uri = `${FileSystem.cacheDirectory}${safe}.pdf`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: model.title });
  return 'shared';
}

/**
 * Dateiname nur aus A–Z, 0–9, «.», «_», «-». Umlaute werden umschrieben
 * (ä→ae, ö→oe, ü→ue, ß→ss), Akzente entfernt (é→e), bevor der Filter greift.
 */
export function safePdfFileName(name: string): string {
  const spelled = name.normalize('NFC')   // zerlegte Umlaute aus der Tastatur zuerst zusammensetzen
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return spelled.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'ANYVO-Pruefungsbuch';
}
