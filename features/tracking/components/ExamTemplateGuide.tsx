// Prüfungsvorlagen beim Fährtenlegen (T-200): Auswahl vor dem Start und
// Führungszeile während des Legens. Reine Anzeige — die Vorlage verändert weder
// Aufzeichnung noch Marker und wird nicht gespeichert.
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  EXAM_TEMPLATES, type ExamLayGuidance, type ExamNextAction, type ExamTemplate, type ExamTemplateId, type ExamWarning,
} from '@/features/tracking/utils/examTemplates';
import type { WindRelation } from '@/features/tracking/utils/windRelation';
import type { TranslationKey } from '@/i18n/de-CH';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

const WARNING_KEY: Record<ExamWarning, TranslationKey> = {
  corner_too_early: 'track.exam.warnCornerTooEarly',
  article_near_corner: 'track.exam.warnArticleNearCorner',
  first_article_too_early: 'track.exam.warnFirstArticleTooEarly',
  too_many_corners: 'track.exam.warnTooManyCorners',
  too_many_articles: 'track.exam.warnTooManyArticles',
};
const NEXT_NOW: Record<ExamNextAction, TranslationKey> = {
  walk: 'track.exam.nextWalk', article: 'track.exam.nextArticle', corner: 'track.exam.nextCorner',
  last_article: 'track.exam.nextLastArticle', finish: 'track.exam.nextFinish',
};
const NEXT_LATER: Record<ExamNextAction, TranslationKey> = {
  walk: 'track.exam.nextWalk', article: 'track.exam.nextArticleIn', corner: 'track.exam.nextCornerIn',
  last_article: 'track.exam.nextLastArticleIn', finish: 'track.exam.nextFinishIn',
};

export function examTemplateSummary(template: ExamTemplate, t: Translate): string {
  const parts = [t('track.exam.summary', {
    steps: template.lengthSteps, legs: template.legs, corners: template.corners, articles: template.articles, age: template.ageMinutes,
  })];
  if (template.acuteCorners > 0) parts.push(t('track.exam.acute', { count: template.acuteCorners }));
  if (template.semicircleLeg) parts.push(t('track.exam.semicircle'));
  if (template.crossTracks) parts.push(t('track.exam.crossTracks'));
  return parts.join(' · ');
}

export function examNextText(guidance: ExamLayGuidance, t: Translate): string {
  return guidance.stepsUntilNext > 0
    ? t(NEXT_LATER[guidance.next], { steps: guidance.stepsUntilNext })
    : t(NEXT_NOW[guidance.next]);
}

/** Auswahl der Vorlage vor dem Start des Legens. */
export function ExamTemplateChooser({ selected, onSelect, t }: {
  selected: ExamTemplate | null; onSelect: (id: ExamTemplateId | null) => void; t: Translate;
}) {
  const options: { id: ExamTemplateId | null; label: string }[] = [
    { id: null, label: t('track.exam.none') }, ...EXAM_TEMPLATES.map(e => ({ id: e.id, label: e.label })),
  ];
  return (
    <View className="self-stretch">
      <Text className="text-[10px] text-ft-faint font-bold tracking-[1.6px] uppercase self-start mb-1.5">{t('track.exam.title')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {options.map(option => {
          const on = (selected?.id ?? null) === option.id;
          return (
            <Pressable key={option.id ?? 'none'} onPress={() => onSelect(option.id)}
              accessibilityRole="radio" accessibilityState={{ checked: on }}
              accessibilityLabel={`${t('track.exam.title')}: ${option.label}`}
              className={`px-[13px] py-2.5 rounded-[12px] border ${on ? 'bg-ft-acc-dim border-[rgba(21,230,195,0.55)]' : 'bg-white/5 border-ft-line'}`}>
              <Text className={`text-[13px] font-semibold ${on ? 'text-ft-acc' : 'text-ft-muted'}`}>{option.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text className="text-[11px] text-ft-faint self-start mt-1.5 mb-1">
        {selected ? examTemplateSummary(selected, t) : t('track.exam.noneHint')}
      </Text>
    </View>
  );
}

const WIND_KEY: Record<WindRelation, TranslationKey> = {
  headwind: 'track.wind.headwind', tailwind: 'track.wind.tailwind', cross_left: 'track.wind.crossLeft', cross_right: 'track.wind.crossRight',
};

/** Wind zur aktuellen Laufrichtung (T-201) — kleine Zeile während des Legens. */
export function WindRelationPill({ relation, speedKmh, t }: { relation: WindRelation; speedKmh: number; t: Translate }) {
  const text = `${t('track.wind.label')} ${Math.round(speedKmh)} km/h · ${t(WIND_KEY[relation])}`;
  return (
    <View className="px-3 py-1.5 rounded-full bg-ft-glass border border-ft-glass-line" accessibilityRole="text" accessibilityLabel={text}>
      <Text className="text-[11px] font-bold text-ft-text">💨 {text}</Text>
    </View>
  );
}

/** Führungszeile während des Legens. */
export function ExamTemplateBanner({ template, guidance, t }: { template: ExamTemplate; guidance: ExamLayGuidance; t: Translate }) {
  const warning = guidance.warnings[0];
  return (
    <View className="px-3 py-2 rounded-[14px] bg-ft-glass border border-ft-glass-line" accessibilityRole="summary"
      accessibilityLabel={`${template.label}. ${t('track.exam.leg', { leg: guidance.legIndex, legs: template.legs, steps: guidance.stepsOnLeg })}. ${examNextText(guidance, t)}${warning ? `. ${t(WARNING_KEY[warning])}` : ''}`}>
      <Text className="text-[11px] font-bold text-ft-text" style={{ fontVariant: ['tabular-nums'] }}>
        {template.label} · {t('track.exam.leg', { leg: guidance.legIndex, legs: template.legs, steps: guidance.stepsOnLeg })}
      </Text>
      <Text className={`text-[12px] font-extrabold mt-0.5 ${guidance.complete ? 'text-ft-acc' : 'text-ft-text'}`}>{examNextText(guidance, t)}</Text>
      {warning ? <Text className="text-[11px] font-bold text-ft-warn mt-0.5">{t(WARNING_KEY[warning])}</Text> : null}
    </View>
  );
}
