import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import type { TranslationKey } from '@/i18n/de-CH';
import type { CoachRuleId, CoachSuggestion, CoachWeek } from '@/features/ai/coachWeek';

// Coach PR B: Wochenvorschlag je Hund (Mockup freigegeben 2026-11-27).
// Nur Anzeige und «Nicht passend»; «In Kalender» folgt mit PR C.

const intlTag = (locale: string) => (locale === 'fr' ? 'fr-CH' : locale === 'it' ? 'it-CH' : locale === 'en' ? 'en-GB' : 'de-CH');
const asDate = (iso: string) => new Date(`${iso}T12:00:00`);

export function suggestionTitle(sg: CoachSuggestion, t: (k: TranslationKey, p?: Record<string, string | number>) => string, locale: string): string {
  const day = asDate(sg.date).toLocaleDateString(intlTag(locale), { weekday: 'short' }).replace(/\.$/, '');
  return `${day} · ${t(`coach.discipline.${sg.discipline}` as TranslationKey)} · ${t(`coach.focus.${sg.focus}` as TranslationKey)}`;
}

export function suggestionParams(sg: CoachSuggestion, t: (k: TranslationKey, p?: Record<string, string | number>) => string): string {
  const out: string[] = [];
  if (sg.params.corners != null) out.push(t('coach.param.corners', { n: sg.params.corners }));
  if (sg.params.steps != null) out.push(t('coach.param.steps', { n: sg.params.steps }));
  if (sg.params.lyingMinutes != null) out.push(t('coach.param.lying', { n: sg.params.lyingMinutes }));
  return out.join(' · ');
}

export function CoachWeekCard({
  week, isPro, isLoading, disabledCount, onDismiss, onDisableRule, onEnableAll, onHideInProfile, onUpgrade,
}: {
  week: CoachWeek | null;
  isPro: boolean;
  isLoading?: boolean;
  disabledCount: number;
  onDismiss: (key: string) => void;
  onDisableRule: (rule: CoachRuleId) => void;
  onEnableAll: () => void;
  onHideInProfile?: () => void;
  onUpgrade?: () => void;
}) {
  const { t, locale } = useT();
  const [menu, setMenu] = useState(false);
  const tag = intlTag(locale);
  const range = week ? `${asDate(week.weekStart).toLocaleDateString(tag, { day: 'numeric', month: 'numeric' })}–${asDate(week.weekEnd).toLocaleDateString(tag, { day: 'numeric', month: 'numeric' })}` : '';
  const rules = [...new Set((week?.suggestions ?? []).map(sg => sg.rule))];
  const reasonText = (r: { key: string; params?: Record<string, string | number> }) => t(r.key as TranslationKey, r.params);

  return (
    <View style={s.card} testID="coach-week-card">
      <View style={s.head}>
        <View style={s.iconWrap}><Ionicons name="calendar-outline" size={16} color={C.trackPrimary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{t('coach.week.title')}</Text>
          {week && week.state === 'ok' ? <Text style={s.sub}>{range}</Text> : null}
        </View>
        {isPro ? (
          <TouchableOpacity onPress={() => setMenu(m => !m)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('coach.week.menu')} accessibilityState={{ expanded: menu }} testID="coach-week-menu">
            <Ionicons name="ellipsis-horizontal" size={18} color={C.trackTextSec} />
          </TouchableOpacity>
        ) : null}
      </View>

      {menu ? (
        <View style={s.menu}>
          {rules.map(rule => (
            <TouchableOpacity key={rule} onPress={() => { setMenu(false); onDisableRule(rule); }} style={s.menuRow} testID={`coach-rule-off-${rule}`}>
              <Text style={s.menuTxt}>{t('coach.week.ruleOff', { rule: t(`coach.rule.${rule}` as TranslationKey) })}</Text>
            </TouchableOpacity>
          ))}
          {disabledCount > 0 ? (
            <TouchableOpacity onPress={() => { setMenu(false); onEnableAll(); }} style={s.menuRow} testID="coach-rules-on">
              <Text style={s.menuTxt}>{t('coach.week.rulesOn', { n: disabledCount })}</Text>
            </TouchableOpacity>
          ) : null}
          {onHideInProfile ? (
            <TouchableOpacity onPress={() => { setMenu(false); onHideInProfile(); }} style={s.menuRow} testID="coach-hide-profile">
              <Text style={s.menuTxt}>{t('coach.week.hideProfile')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {isLoading ? <ActivityIndicator color={C.trackPrimary} /> : !week || week.state === 'no_data' ? (
        <Text style={s.hint}>{t('coach.week.noData')}</Text>
      ) : week.suggestions.length === 0 ? (
        <Text style={s.hint}>{t('coach.week.empty')}</Text>
      ) : (
        week.suggestions.map(sg => {
          const params = suggestionParams(sg, t);
          return (
            <View key={sg.key} style={s.item} testID={`coach-suggestion-${sg.rule}-${sg.discipline}`}>
              <Text style={s.itemTitle}>{suggestionTitle(sg, t, locale)}</Text>
              {params ? <Text style={s.params}>{params}</Text> : null}
              <Text style={s.why}>{t('coach.week.why')} {sg.reasons.map(reasonText).join(' ')}</Text>
              <TouchableOpacity onPress={() => onDismiss(sg.key)} style={s.dismiss} accessibilityRole="button" testID={`coach-dismiss-${sg.rule}-${sg.discipline}`}>
                <Text style={s.dismissTxt}>{t('coach.week.dismiss')}</Text>
              </TouchableOpacity>
            </View>
          );
        })
      )}

      {week?.notes.map(n => <Text key={n.key} style={s.note}>{reasonText(n)}</Text>)}

      {!isPro && week?.state === 'ok' ? (
        <View style={s.preview} testID="coach-week-preview">
          <Text style={s.previewTxt}>{t('coach.week.preview')}</Text>
          {onUpgrade ? <AnyvoButton label={t('coach.week.more')} variant="secondary" onPress={onUpgrade} /> : null}
        </View>
      ) : null}

      <Text style={s.foot}>{t('coach.week.onDevice')}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card:      { borderRadius: 20, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, padding: 16, gap: 10 },
  head:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap:  { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(0,255,204,0.16)', alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: 16, color: C.trackText, fontWeight: '800' },
  sub:       { fontSize: 12.5, color: C.trackTextSec, fontWeight: '600', marginTop: 1 },
  hint:      { fontSize: 13.5, color: C.trackTextSec, fontWeight: '500', lineHeight: 19 },
  menu:      { borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, paddingVertical: 4 },
  menuRow:   { paddingHorizontal: 12, paddingVertical: 10 },
  menuTxt:   { fontSize: 13.5, color: C.trackText, fontWeight: '600' },
  item:      { borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, padding: 12, gap: 4 },
  itemTitle: { fontSize: 14, color: C.trackText, fontWeight: '800' },
  params:    { fontSize: 13, color: C.trackTextSec, fontWeight: '600' },
  why:       { fontSize: 13, color: C.trackTextSec, fontWeight: '500', lineHeight: 18 },
  dismiss:   { alignSelf: 'flex-start', marginTop: 4, borderRadius: 10, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 10, paddingVertical: 6 },
  dismissTxt:{ fontSize: 12.5, color: C.trackTextSec, fontWeight: '700' },
  note:      { fontSize: 12.5, color: C.trackTextSec, fontWeight: '600' },
  preview:   { borderRadius: 14, borderWidth: 1, borderColor: C.accentMid, backgroundColor: C.accentDim, padding: 12, gap: 8 },
  previewTxt:{ fontSize: 13, color: C.trackText, fontWeight: '600', lineHeight: 18 },
  foot:      { fontSize: 11.5, color: C.trackTextMut, fontWeight: '500' },
});
