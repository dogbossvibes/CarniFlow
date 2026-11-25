import { FT } from '@/constants/colors';
import type { GuideStep, GuideTarget, HelpGuideId, HelpTopicId } from '@/features/help/helpRegistry';
import { useSession } from '@/hooks/useSession';
import { useT } from '@/i18n';
import { markHelpSeen, useHelpSeenState } from '@/stores/helpSeen';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';

// ──────────────────────────────────────────────────────────────────────────
// Geführte erste Fährte: Schritt-Hinweise beim ersten Legen/Absuchen.
// Bewusst KEIN Modal: eine normale Karte im Layout bzw. als Overlay mit
// pointerEvents="box-none". GPS, Aufzeichnung und alle Knöpfe bleiben voll
// bedienbar; die Karte liest nur den „gesehen"-Status und schreibt ihn.
// Einmal pro Konto (lokal, stores/helpSeen). Wer das bisherige Einzel-
// Coachmark schon kennt (legacyTopicId), gilt nicht als Erstnutzer.
// ──────────────────────────────────────────────────────────────────────────

export interface FirstTrackGuideState {
  /** Hinweise sind für dieses Konto noch offen (erst nach dem Laden true). */
  active: boolean;
  /** Gesehen-Status geladen und entschieden (vorher nichts automatisch zeigen). */
  decided: boolean;
  step: number;
  /** Knopf, der zum aktuellen Schritt passt (null = keiner). */
  target: GuideTarget | null;
  next: () => void;
  skip: () => void;
}

export function useFirstTrackGuide({
  guideId, legacyTopicId, steps, minStep = 0, reached = false,
}: {
  guideId: HelpGuideId;
  legacyTopicId: HelpTopicId;
  steps: GuideStep[];
  /** Frühester sinnvoller Schritt (z. B. 1, sobald die Aufzeichnung läuft). */
  minStep?: number;
  /** Der Ablauf hat den geführten Teil erreicht (Legen/Suche läuft): beim
   *  Verlassen des Bildschirms gilt die Anleitung dann als gesehen. */
  reached?: boolean;
}): FirstTrackGuideState {
  const { user } = useSession();
  const { seen, hydrated } = useHelpSeenState(user?.id);
  const [step, setStep] = useState(0);
  const [closed, setClosed] = useState(false);
  // Entscheidung einmal beim Laden treffen, damit ein späteres markHelpSeen
  // (z. B. Coachmark) die laufende Anleitung nicht mittendrin ausblendet.
  const [eligible, setEligible] = useState<boolean | null>(null);
  if (hydrated && eligible === null) {
    setEligible(!seen.includes(guideId) && !seen.includes(legacyTopicId));
  }
  const active = eligible === true && !closed;
  const shown = Math.min(Math.max(step, minStep), steps.length - 1);

  const finish = () => {
    setClosed(true);
    markHelpSeen(guideId);
    markHelpSeen(legacyTopicId);   // kein zusätzliches Einzel-Coachmark danach
  };

  // Wer den passenden Schritt erreicht hat (z. B. Aufzeichnung gestartet) und
  // den Bildschirm verlässt, bekommt die Anleitung nicht noch einmal.
  const reachedRef = useRef(false);
  useEffect(() => { if (active && reached) reachedRef.current = true; }, [active, reached]);
  useEffect(() => () => {
    if (reachedRef.current) { markHelpSeen(guideId); markHelpSeen(legacyTopicId); }
  }, [guideId, legacyTopicId]);

  return {
    active,
    decided: eligible !== null,
    step: shown,
    target: active ? steps[shown]?.target ?? null : null,
    next: () => { if (shown >= steps.length - 1) finish(); else setStep(shown + 1); },
    skip: finish,
  };
}

export function FirstTrackGuideCard({
  guide, steps, counterKey, style,
}: {
  guide: FirstTrackGuideState;
  steps: GuideStep[];
  counterKey: 'help.firstLayCounter' | 'help.firstSearchCounter';
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useT();
  if (!guide.active) return null;
  const current = steps[guide.step];
  if (!current) return null;
  const total = steps.length;
  const isLast = guide.step === total - 1;
  const single = total === 1;
  const title = t(current.titleKey);
  return (
    <View
      testID="first-track-guide"
      style={[s.card, style]}
      accessible={false}
      accessibilityLiveRegion="polite"
    >
      <Text style={s.counter} accessibilityLabel={t('help.firstGuideA11y', { step: guide.step + 1, total, title })}>
        {t(counterKey, { step: guide.step + 1, total })}
      </Text>
      <Text style={s.title} accessibilityRole="header">{title}</Text>
      <Text style={s.text}>{t(current.textKey)}</Text>
      {!single && (
        <View style={s.dots} accessible={false}>
          {steps.map((_, i) => <View key={i} style={[s.dot, i === guide.step && s.dotActive]} />)}
        </View>
      )}
      <View style={s.actions}>
        {!single && (
          <TouchableOpacity
            testID="first-track-guide-skip"
            onPress={guide.skip}
            activeOpacity={0.8}
            style={[s.btn, s.secondary]}
            accessibilityRole="button"
            accessibilityLabel={t('help.firstGuideSkip')}
          >
            <Text style={s.secondaryText}>{t('help.firstGuideSkip')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          testID="first-track-guide-next"
          onPress={guide.next}
          activeOpacity={0.8}
          style={[s.btn, s.primary]}
          accessibilityRole="button"
          accessibilityLabel={single ? t('help.firstGuideGotIt') : isLast ? t('common.done') : t('common.next')}
        >
          <Text style={s.primaryText}>{single ? t('help.firstGuideGotIt') : isLast ? t('common.done') : t('common.next')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Rahmen für den Knopf, auf den der aktuelle Schritt zeigt. */
export const GUIDE_TARGET_STYLE: ViewStyle = { borderWidth: 2, borderColor: FT.acc };

const s = StyleSheet.create({
  card: {
    backgroundColor: FT.surface3, borderRadius: FT.rMd, borderWidth: 1.5, borderColor: FT.acc,
    padding: 14, gap: 6,
  },
  counter: { fontSize: 12, color: FT.acc, fontWeight: '800', letterSpacing: 0.6 },
  title: { fontSize: 17, color: FT.text, fontWeight: '900' },
  text: { fontSize: 15, lineHeight: 21, color: 'rgba(255,255,255,0.86)' },
  dots: { flexDirection: 'row', gap: 5, marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: FT.lineStrong },
  dotActive: { width: 16, backgroundColor: FT.acc },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  btn: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  secondary: { borderWidth: 1, borderColor: FT.lineStrong },
  primary: { backgroundColor: FT.acc },
  secondaryText: { fontSize: 15, color: FT.text, fontWeight: '700' },
  primaryText: { fontSize: 15, color: FT.accText, fontWeight: '800' },
});
