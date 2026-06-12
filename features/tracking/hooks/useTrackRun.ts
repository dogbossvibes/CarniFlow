import { useCallback, useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { useTrackingStore, type TrackPointSample } from '@/features/tracking/store/trackingStore';
import {
  shouldAcceptTrackPoint, calculateDistance, calculateDeviationFromTrack, type GpsSample, type LatLng,
} from '@/features/tracking/utils/gpsFilter';
import { startPositionStream, type StreamSample } from '@/features/tracking/utils/positionStream';
import { detectCorners, cornerLabel, nearestArticleDist, type Corner } from '@/lib/trackGuidance';
import { startTrackRun, finishTrackRun, markArticleFound, saveTrackRunPoints } from '@/features/tracking/services/trackService';

// expo-speech defensiv laden (nativ; kein Crash, wenn Modul fehlt).
let Speech: typeof import('expo-speech') | null = null;
try { Speech = require('expo-speech'); } catch { Speech = null; }
export const SPEECH_AVAILABLE = Speech != null;
function say(msg: string) { try { Speech?.stop(); Speech?.speak(msg, { language: 'de-DE', rate: 1.0 }); } catch { /* ignore */ } }
function shutUp() { try { Speech?.stop(); } catch { /* ignore */ } }

const WATCH_OPTS: Location.LocationOptions = { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1200, distanceInterval: 0 };

// Steuert die Ausarbeitung (Suche): Live-Position, Abweichung, Audio-Hinweise,
// „Gegenstand gefunden", Speichern. Liest Lay-Fährte/Marker aus dem Store.
export function useTrackRun(voiceOnRef: { current: boolean }) {
  const store    = useTrackingStore;
  const watchRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startMs  = useRef<number>(0);
  const runIdRef = useRef<string | null>(null);
  const lastRef  = useRef<GpsSample | null>(null);
  const devSumRef = useRef<{ sum: number; n: number }>({ sum: 0, n: 0 });

  // Audio-Entprellung
  const lastSpeak = useRef(0);
  const cornersRef = useRef<Corner[]>([]);
  const cornerSpoken = useRef<Set<number>>(new Set());
  const articleNear = useRef(false);
  const articleAhead = useRef(false);
  const deviating = useRef(false);

  const stopAll = useCallback(() => {
    watchRef.current?.(); watchRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    shutUp();
  }, []);
  useEffect(() => () => stopAll(), [stopAll]);

  const speak = useCallback((msg: string) => {
    if (!voiceOnRef.current) return;
    lastSpeak.current = Date.now();
    say(msg);
  }, [voiceOnRef]);

  const onFix = useCallback((sample: StreamSample) => {
    const s = store.getState();
    if (!shouldAcceptTrackPoint(lastRef.current, sample)) {
      s.setCurrentPosition({ lat: sample.lat, lng: sample.lng }, sample.accuracy);
      return;
    }
    lastRef.current = sample;
    const tp: TrackPointSample = { lat: sample.lat, lng: sample.lng, accuracy: sample.accuracy, t: sample.t! };
    s.addRunPoint(tp);

    const cur: LatLng = { lat: sample.lat, lng: sample.lng };
    const laid: LatLng[] = s.trackPoints.map(p => ({ lat: p.lat, lng: p.lng }));
    const { dist: dev, side } = calculateDeviationFromTrack(cur, laid);
    if (dev < 30) { devSumRef.current.sum += dev; devSumRef.current.n += 1; }

    if (!voiceOnRef.current) return;
    const since = Date.now() - lastSpeak.current;

    const open = s.markers
      .filter(m => m.type === 'gegenstand' && !m.found && m.lat != null && m.lng != null)
      .map(m => ({ lat: m.lat as number, lng: m.lng as number }));
    const artDist = nearestArticleDist(cur, open);

    if (artDist < 5) { if (!articleNear.current && since > 6000) { articleNear.current = true; speak('Achtung, Gegenstand ganz in der Nähe.'); } return; }
    if (artDist > 8) articleNear.current = false;
    if (artDist >= 5 && artDist < 12) { if (!articleAhead.current && since > 5000) { articleAhead.current = true; speak(`Gegenstand kommt, etwa ${Math.round(artDist)} Meter.`); return; } }
    else if (artDist > 14) articleAhead.current = false;

    if (dev <= 8) {
      let nc: Corner | null = null, nd = Infinity;
      for (const c of cornersRef.current) { if (cornerSpoken.current.has(c.index)) continue; const d = calculateDistance(cur, c.point); if (d < nd) { nd = d; nc = c; } }
      if (nc && nd < 12 && since > 5000) { cornerSpoken.current.add(nc.index); speak(`In ${Math.round(nd)} Metern ${cornerLabel(nc.kind)} nach ${nc.direction}.`); return; }
    }
    if (dev > 8 && since > 7000) { deviating.current = true; speak(`Du weichst ${Math.round(dev)} Meter${side ? ' nach ' + side : ''} ab.`); return; }
    if (dev < 3 && deviating.current && since > 5000) { deviating.current = false; speak('Wieder auf der Fährte.'); }
  }, [speak, store, voiceOnRef]);

  const start = useCallback(async (sessionId: string): Promise<{ error: string | null }> => {
    const s = store.getState();
    cornersRef.current = detectCorners(s.trackPoints.map(p => ({ lat: p.lat, lng: p.lng })));
    cornerSpoken.current = new Set();
    devSumRef.current = { sum: 0, n: 0 };
    lastRef.current = null;

    const { data, error } = await startTrackRun(sessionId);
    if (error) return { error };
    runIdRef.current = data?.id ?? null;

    s.startRun();
    startMs.current = Date.now();
    timerRef.current = setInterval(() => s.setSearchDuration(Math.floor((Date.now() - startMs.current) / 1000)), 1000);
    watchRef.current = await startPositionStream(onFix, WATCH_OPTS);
    speak('Suche gestartet. Lauf der Fährte.');
    return { error: null };
  }, [onFix, speak, store]);

  const foundArticle = useCallback(async () => {
    const s = store.getState();
    const next = s.markers.find(m => m.type === 'gegenstand' && !m.found);
    if (!next) return;
    s.markArticleFound(next.id);
    speak('Gegenstand gefunden.');
    // Persistieren, falls der Marker eine echte DB-ID hat (sonst nur lokal).
  }, [speak, store]);

  const finish = useCallback(async (sessionId: string): Promise<{ error: string | null }> => {
    stopAll();
    const s = store.getState();
    s.stopRun();
    const avgDev = devSumRef.current.n ? devSumRef.current.sum / devSumRef.current.n : null;
    let dist = 0;
    for (let i = 1; i < s.runPoints.length; i++) dist += calculateDistance(s.runPoints[i - 1], s.runPoints[i]);
    const runId = runIdRef.current;
    if (!runId) return { error: 'Kein aktiver Ablauf.' };
    const res = await finishTrackRun(runId, sessionId, {
      durationSeconds:        s.searchDurationSeconds,
      distanceMeters:         dist,
      averageDeviationMeters: avgDev != null ? Math.round(avgDev * 100) / 100 : null,
      articlesFound:          s.articlesFound,
      runPoints:              s.runPoints.map(p => ({ lat: p.lat, lng: p.lng, t: p.t })),
    });
    if (!res.error) speak('Fährte beendet.');
    return { error: res.error };
  }, [speak, stopAll, store]);

  return { start, foundArticle, finish, stopAll };
}

// Re-Export für Aufrufer (vermeidet ungenutzte Imports anderswo).
export { markArticleFound, saveTrackRunPoints };
