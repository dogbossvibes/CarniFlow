import { useEffect, useRef, useState } from 'react';
import i18n from '@/i18n/config';
import { hapticSuccess } from '@/features/tracking/utils/haptics';
import { say } from '@/features/tracking/hooks/useTrackVoiceGuidance';
import {
  stepTrackEnd, DEFAULT_TRACK_END_OPTIONS, type TrackEndState,
} from '@/features/tracking/utils/guidanceEngine';

type LL = { latitude: number; longitude: number };

const toRad = (d: number) => (d * Math.PI) / 180;
function distM(a: LL, b: LL): number {
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const la1 = toRad(a.latitude), la2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Fährtenende-Guidance beim Absuchen. Nutzt die bestehende virtuelle Hundeposition
 * (dogProgressM / estimatedDogPosition, order-aware) und den gespeicherten Endpunkt.
 * Sagt „Ende der Fährte erreicht." GENAU EINMAL an, löst einmal Haptik aus und liefert
 * den Ende-Status für die UI. Beendet die Absuche NICHT (bewusste Nutzeraktion bleibt).
 */
export function useTrackEndGuidance(input: {
  recording: boolean;
  dogProgressM: number | null;
  trackLengthM: number;
  estimatedDogPosition: LL | null;
  endPoint: LL | null;
  openMandatoryObjects: number;
  voiceOn: boolean;
}): TrackEndState {
  const stateRef = useRef<TrackEndState>('unseen');
  const [endState, setEndState] = useState<TrackEndState>('unseen');

  // Neue Absuche / neue Fährte → Once-only-Status zurücksetzen.
  useEffect(() => {
    if (!input.recording) { stateRef.current = 'unseen'; setEndState('unseen'); }
  }, [input.recording, input.endPoint]);

  useEffect(() => {
    if (!input.recording || input.dogProgressM == null) return;
    const geomDistanceM = input.estimatedDogPosition && input.endPoint
      ? distM(input.estimatedDogPosition, input.endPoint)
      : null;

    const { state, justReached } = stepTrackEnd(
      {
        dogProgressM: input.dogProgressM,
        trackLengthM: input.trackLengthM,
        geomDistanceM,
        openMandatoryObjects: input.openMandatoryObjects,
      },
      stateRef.current,
      DEFAULT_TRACK_END_OPTIONS,
    );

    if (state !== stateRef.current) { stateRef.current = state; setEndState(state); }
    if (justReached) {
      hapticSuccess();
      if (input.voiceOn) say(i18n.t('track.voiceTrackEnd') as string);
    }
  }, [
    input.recording, input.dogProgressM, input.trackLengthM,
    input.estimatedDogPosition, input.endPoint, input.openMandatoryObjects, input.voiceOn,
  ]);

  return endState;
}
