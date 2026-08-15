import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useActiveTrialOffer } from '@/hooks/useActiveTrialOffer';
import { useT } from '@/i18n';
import { ActiveTrialSheet } from '@/components/subscription/ActiveTrialSheet';

// Steuert die proaktive Anzeige des ACTIVE-Trial-Angebots auf einer geeigneten
// Fläche (z. B. Home) NACH dem ersten dokumentierten Training. Zeigt NICHT bei
// Registrierung/erstem App-Start (Eligibility verlangt ≥ 1 Training + Konto ≥ 24 h)
// und respektiert Cooldown/Frequency-Capping. Selbstständig — keine Prop-Verdrahtung.
export function ActiveTrialGate() {
  const trial = useActiveTrialOffer();
  const { t } = useT();
  const [visible, setVisible] = useState(false);
  const [starting, setStarting] = useState(false);
  const shownOnceRef = useRef(false);

  useEffect(() => {
    if (trial.loading || shownOnceRef.current) return;
    if (trial.shouldShowProactively) {
      shownOnceRef.current = true;   // pro Mount nur einmal öffnen
      setVisible(true);
      void trial.markShown();        // serverseitig „gezeigt" + Funnel-Event + Cooldown
    }
    // Bewusst nur auf die stabilen Trigger-Felder reagieren (trial wird pro Render neu erzeugt).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trial.loading, trial.shouldShowProactively]);

  const onStart = async () => {
    setStarting(true);
    try {
      const res = await trial.startTrial();
      if (res.ok) { setVisible(false); return; }
      if (res.cancelled) return;     // Nutzer hat im Store abgebrochen → Sheet offen lassen
      Alert.alert(t('activeTrial.title'), t('activeTrial.error'));
    } finally {
      setStarting(false);
    }
  };

  const onLater = () => {
    if (starting) return;
    setVisible(false);
    void trial.dismissLater();
  };

  if (!visible) return null;
  return (
    <ActiveTrialSheet
      visible={visible}
      days={trial.trialDays}
      priceString={trial.priceString}
      period={trial.period}
      starting={starting}
      onStart={onStart}
      onLater={onLater}
    />
  );
}
