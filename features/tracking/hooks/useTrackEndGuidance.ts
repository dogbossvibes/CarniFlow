import { useEffect, useRef, useState } from 'react';
import i18n from '@/i18n/config';
import { hapticSuccess } from '@/features/tracking/utils/haptics';
import { speechLanguage } from '@/features/tracking/hooks/useTrackVoiceGuidance';
import { requestVoice } from '@/features/tracking/utils/voiceEvents';
import {
  stepTrackEnd, DEFAULT_TRACK_END_OPTIONS, type TrackEndState,
  trackEndBlocker,
} from '@/features/tracking/utils/guidanceEngine';
import { advanceEndFixHistory, INITIAL_END_FIX_HISTORY } from '@/features/tracking/utils/endFixConfirmation';

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
 * Fährtenende-Guidance beim Absuchen. Handler-Fortschritt und echte Telefonposition
 * sind harte Voraussetzungen; die virtuelle Hundeposition bleibt Zusatzsignal.
 * Sagt „Ende der Fährte erreicht." GENAU EINMAL an, löst einmal Haptik aus und liefert
 * den Ende-Status für die UI. Beendet die Absuche NICHT (bewusste Nutzeraktion bleibt).
 */
export function useTrackEndGuidance(input: {
  recording: boolean;
  dogProgressM: number | null;
  handlerProgressM?: number;
  handlerPosition?: LL | null;
  endHandlerFix?: { position: LL; accuracyM: number | null; tMs: number } | null;
  lastSegmentReached?: boolean;
  activeObjectWait?: boolean;
  trackLengthM: number;
  estimatedDogPosition: LL | null;
  endPoint: LL | null;
  openMandatoryObjects: number;
  voiceOn: boolean;
  // Recovery (Search-Recovery-State): Ende in DIESEM Run bereits angesagt →
  // beim (Wieder-)Start direkt 'completed', keine zweite Ansage. `onFired`
  // spiegelt die einmalige Ansage nach aussen. Erkennungslogik unverändert.
  initialFired?: boolean;
  onFired?: () => void;
}): TrackEndState {
  const stateRef = useRef<TrackEndState>('unseen');
  const [endState, setEndState] = useState<TrackEndState>('unseen');
  const onFiredRef = useRef(input.onFired);
  const latestInputRef = useRef(input);
  const endFixHistoryRef = useRef(INITIAL_END_FIX_HISTORY);
  latestInputRef.current = input;
  onFiredRef.current = input.onFired;

  // Neue Absuche / neue Fährte → Once-only-Status zurücksetzen; Recovery mit
  // bereits angesagtem Ende → 'completed' (once-only bleibt gewahrt).
  useEffect(() => {
    if (!input.recording) { stateRef.current = 'unseen'; endFixHistoryRef.current = INITIAL_END_FIX_HISTORY; setEndState('unseen'); return; }
    if (input.initialFired && stateRef.current === 'unseen') { stateRef.current = 'completed'; setEndState('completed'); }
  }, [input.recording, input.endPoint, input.initialFired]);

  useEffect(() => {
    if (!input.recording || input.dogProgressM == null) return;
    const geomDistanceM = input.estimatedDogPosition && input.endPoint
      ? distM(input.estimatedDogPosition, input.endPoint)
      : null;
    const handlerFix = input.endHandlerFix;
    const handlerDistanceToEndM = handlerFix && input.endPoint ? distM(handlerFix.position, input.endPoint) : null;
    if (handlerFix && handlerDistanceToEndM != null) {
      endFixHistoryRef.current = advanceEndFixHistory(endFixHistoryRef.current, {
        tMs: handlerFix.tMs, distanceToEndM: handlerDistanceToEndM, accuracyM: handlerFix.accuracyM,
        lastSegmentReached: input.lastSegmentReached ?? false,
        handlerProgressRatio: input.trackLengthM > 0 ? (input.handlerProgressM ?? 0) / input.trackLengthM : 0,
      });
    }
    const history = endFixHistoryRef.current;

    const { state, justReached } = stepTrackEnd(
      {
        dogProgressM: input.dogProgressM,
        handlerProgressM: input.handlerProgressM,
        handlerDistanceToEndM,
        accuracyM: handlerFix?.accuracyM ?? null,
        lastSegmentReached: input.lastSegmentReached,
        approachSeen: history.approachSeen, stableEndFixCount: history.insideCount,
        stableEndFixSpanMs: history.firstInsideMs == null || handlerFix == null ? 0 : handlerFix.tMs - history.firstInsideMs,
        activeObjectWait: input.activeObjectWait,
        searchActive: input.recording,
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
      if (input.voiceOn) requestVoice({ eventType: 'end', text: i18n.t('track.voiceTrackEnd') as string,
        language: speechLanguage(i18n.language as never), priority: 10,
        onceKey: 'track-end', phase: 'search', progressM: input.handlerProgressM,
        distanceM: handlerDistanceToEndM,
        valid: () => {
          const now = latestInputRef.current;
          const dogDistance = now.estimatedDogPosition && now.endPoint ? distM(now.estimatedDogPosition, now.endPoint) : null;
          const handlerDistance = now.endHandlerFix && now.endPoint ? distM(now.endHandlerFix.position, now.endPoint) : null;
          const currentHistory = endFixHistoryRef.current;
          return now.recording && now.voiceOn && now.dogProgressM != null && trackEndBlocker({
            dogProgressM: now.dogProgressM, handlerProgressM: now.handlerProgressM,
            handlerDistanceToEndM: handlerDistance, geomDistanceM: dogDistance,
            accuracyM: now.endHandlerFix?.accuracyM ?? null, lastSegmentReached: now.lastSegmentReached,
            approachSeen: currentHistory.approachSeen, stableEndFixCount: currentHistory.insideCount,
            stableEndFixSpanMs: currentHistory.firstInsideMs == null || now.endHandlerFix == null ? 0
              : now.endHandlerFix.tMs - currentHistory.firstInsideMs,
            trackLengthM: now.trackLengthM, openMandatoryObjects: now.openMandatoryObjects,
            activeObjectWait: now.activeObjectWait, searchActive: now.recording,
          }) == null;
        } });
      onFiredRef.current?.();
    }
  }, [
    input.recording, input.dogProgressM, input.trackLengthM,
    input.estimatedDogPosition, input.handlerProgressM, input.handlerPosition, input.endHandlerFix,
    input.lastSegmentReached,
    input.activeObjectWait, input.endPoint, input.openMandatoryObjects, input.voiceOn,
  ]);

  return endState;
}
