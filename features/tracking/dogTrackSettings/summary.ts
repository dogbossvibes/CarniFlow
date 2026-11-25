import type { TranslationKey } from '@/i18n/de-CH';
import { examTemplateById } from '@/features/tracking/utils/examTemplates';
import { INDICATION_LABEL_KEYS, type DogTrackSettings } from './model';

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

/** Kurzübersicht für das Hundeprofil, z. B. «Liegen · 10 m · IFH-1». */
export function dogTrackSettingsSummary(settings: DogTrackSettings, t: T): string {
  const parts: string[] = [];
  if (settings.indication) parts.push(t(INDICATION_LABEL_KEYS[settings.indication]));
  if (settings.handlerDistanceM) parts.push(`${settings.handlerDistanceM} m`);
  const exam = examTemplateById(settings.examTemplate ?? null);
  if (exam) parts.push(exam.label);
  if (settings.layReminderMin) parts.push(t('track.settings.summaryReminder', { minutes: settings.layReminderMin }));
  return parts.length ? parts.join(' · ') : t('track.settings.summaryEmpty');
}
