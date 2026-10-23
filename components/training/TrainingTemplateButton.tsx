import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { documentDraftKey, loadDocumentDraft } from '@/features/training/documentation/draft';
import { useSession } from '@/hooks/useSession';
import { useProfile } from '@/hooks/useProfile';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { DISCIPLINES, customToDiscipline } from '@/constants/disciplines';
import { DEFAULT_SPARTEN } from '@/constants/sparten';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { historyDate } from '@/features/training/documentation/historyDate';
import type { TrainingUnit } from '@/types/trainingUnit';
import { readTemplateHints, templateExerciseKey, templateEntryContext, type TemplateHint, type TemplateChoice } from '@/features/training/documentation/template';

export function TrainingTemplateButton({ unit }: { unit: TrainingUnit }) {
  const { session } = useSession();
  if (!session || unit.owner_id !== session.user.id || unit.status !== 'completed') return null;
  return <TemplatePicker key={`${session.user.id}:${unit.id}`} unit={unit} owner={session.user.id} />;
}

function TemplatePicker({ unit, owner }: { unit: TrainingUnit; owner: string }) {
  const { t, locale } = useT();
  const router = useRouter();
  const { profile } = useProfile();
  const { categories } = useCustomCategories();
  const available = [...DISCIPLINES.filter(d => !d.custom && (profile?.aktive_sparten ?? DEFAULT_SPARTEN).includes(d.label)), ...categories.map(customToDiscipline)]
    .filter(d => unit.exercises?.some(e => e.discipline === d.label));
  const [visible, setVisible] = useState(false);
  const [discipline, setDiscipline] = useState('');
  const disc = available.find(d => d.key === discipline);
  const discKey = disc?.key;
  const discLabel = disc?.label;
  const disciplineKey = disc ? disc.key.startsWith('custom:') ? disc.key : `system:${disc.key}` : '';
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedHints, setSelectedHints] = useState<string[]>([]);
  const [hints, setHints] = useState<TemplateHint[]>([]);
  const [existingDraft, setExistingDraft] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const navigationLock = useRef(false);
  useEffect(() => {
    let cancelled = false;
    setHints([]); setSelectedHints([]); setError(false);
    if (!visible || !discKey || !discLabel) return;
    setLoading(true); setExistingDraft(false);
    void (async () => {
      const draft = await loadDocumentDraft(documentDraftKey(owner, undefined, templateEntryContext(unit.id, unit.dog_id, discKey)));
      if (cancelled) return [];
      if (draft) { setExistingDraft(true); return []; }
      return readTemplateHints(owner, unit.dog_id, discLabel, disciplineKey, () => !cancelled);
    })()
      .then(rows => { if (!cancelled) setHints(rows); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [visible, owner, unit.id, unit.dog_id, discKey, discLabel, disciplineKey, retry]);
  if (!available.length) return null;
  const toggle = (values: string[], key: string) => values.includes(key) ? values.filter(v => v !== key) : [...values, key];
  const chooseDiscipline = (key: string) => { setDiscipline(key); setSelected([]); setSelectedHints([]); };
  return <>
    <TouchableOpacity accessibilityRole="button" style={s.button} onPress={() => { navigationLock.current = false; chooseDiscipline(available[0].key); setVisible(true); }}>
      <Text style={s.action}>{t('trainingTemplate.open')}</Text>
    </TouchableOpacity>
    <AnyvoBottomSheet visible={visible} onClose={() => setVisible(false)} title={t('trainingTemplate.open')}>
      <ScrollView style={{ maxHeight: 450 }} contentContainerStyle={s.content}>
        <Text style={s.text}>{t('trainingTemplate.explanation')}</Text>
        <Text style={s.text}>{unit.dog?.name} · {historyDate(unit.session_date, locale)}</Text>
        {available.map(d => <TouchableOpacity key={d.key} accessibilityRole="radio" accessibilityState={{ checked: discipline === d.key }} style={s.button} onPress={() => chooseDiscipline(d.key)}>
          <Text style={s.action}>{discipline === d.key ? '● ' : '○ '}{d.label}</Text>
        </TouchableOpacity>)}
        {existingDraft && <Text style={s.text}>{t('trainingTemplate.resumeHelp')}</Text>}
        {!existingDraft && <>
        <Text style={s.title}>{t('training.exercisesLabel')}</Text>
        {disc && unit.exercises?.filter(e => e.discipline === disc.label).map((e, i) => {
          const key = templateExerciseKey(e);
          return <TouchableOpacity key={`${key}:${i}`} accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(key) }} style={s.button} onPress={() => setSelected(old => toggle(old, key))}>
            <Text style={s.text}>{selected.includes(key) ? '☑ ' : '☐ '}{e.exercise_name}</Text>
          </TouchableOpacity>;
        })}
        <Text style={s.title}>{t('trainingTemplate.hints')}</Text>
        {loading && <ActivityIndicator />}
        {error && <TouchableOpacity accessibilityRole="button" style={s.button} onPress={() => setRetry(v => v + 1)}><Text style={s.text}>{t('trainingDoc.focusError')}</Text></TouchableOpacity>}
        {!loading && !error && !hints.length && <Text style={s.text}>{t('trainingTemplate.noHints')}</Text>}
        {hints.map(h => <TouchableOpacity key={h.id} accessibilityRole="checkbox" accessibilityState={{ checked: selectedHints.includes(h.id) }} style={s.button} onPress={() => setSelectedHints(old => toggle(old, h.id))}>
          <Text style={s.text}>{selectedHints.includes(h.id) ? '☑ ' : '☐ '}{h.text}</Text><Text style={s.text}>{historyDate(h.date, locale)}</Text>
        </TouchableOpacity>)}
        </>}
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: (!existingDraft && !selected.length) || loading || error }} disabled={(!existingDraft && !selected.length) || loading || error} style={s.button} onPress={() => {
          if (navigationLock.current || !disc || (!existingDraft && !selected.length) || loading || error) return;
          navigationLock.current = true;
          const choice: TemplateChoice = { owner, dog: unit.dog_id, discipline: disc.label, disciplineKey, exercises: selected, focuses: selectedHints };
          setVisible(false);
          router.push({ pathname: '/unit/document', params: { template: unit.id, templateChoice: JSON.stringify(choice), draftToken: Crypto.randomUUID(), dogId: unit.dog_id, discipline: disc.key } });
        }}><Text style={s.action}>{t(existingDraft ? 'trainingTemplate.resume' : 'trainingTemplate.confirm')}</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={s.button} onPress={() => setVisible(false)}><Text style={s.text}>{t('common.cancel')}</Text></TouchableOpacity>
      </ScrollView>
    </AnyvoBottomSheet>
  </>;
}
const s = StyleSheet.create({
  content: { gap: 10, paddingBottom: 20 },
  button: { minHeight: 48, padding: 12, justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: C.border },
  action: { color: C.accent, fontWeight: '700', fontSize: 16 },
  title: { color: C.white, fontWeight: '700', fontSize: 16 },
  text: { color: C.muted, fontSize: 15 },
});
